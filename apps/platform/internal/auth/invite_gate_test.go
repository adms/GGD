// invite_gate_test.go drives the #174 registration invite gate over REAL HTTP,
// through the fully-wired router — the mint route, the register route and the
// admin middleware — because the thing under test is not "the service refuses a
// bad code" but "a stranger who can reach this deploy cannot create an account".
// A green unit test on invite.Service would not prove the route is mounted.
package auth_test

import (
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// mintCodes asks the console endpoint for n codes and returns their display
// forms. It goes through POST /api/v1/admin/invites, so a route that is not
// mounted, or an admin gate that is wrong, fails here.
func mintCodes(t *testing.T, ts *testutil.TS, token, note string, n int) []string {
	t.Helper()
	r := ts.Do(http.MethodPost, "/api/v1/admin/invites", token, map[string]any{
		"note": note, "count": n, "ttlDays": 14,
	})
	require.Equal(t, http.StatusCreated, r.Status, "mint: %s", string(r.Raw))
	minted, ok := r.Body["minted"].([]any)
	require.True(t, ok, "minted missing: %s", string(r.Raw))
	require.Len(t, minted, n)
	out := make([]string, 0, n)
	for _, m := range minted {
		row := m.(map[string]any)
		code := row["code"].(string)
		assert.Regexp(t, `^GGD-[2-9A-HJ-NP-TV-Z]{4}-[2-9A-HJ-NP-TV-Z]{4}$`, code)
		out = append(out, code)
	}
	return out
}

// THE HAPPY PATH, end to end: owner registers on a fresh gated deploy with no
// code, mints one in the console, and a family member registers with it.
func TestInviteHappyPath(t *testing.T) {
	testkit.Cover(t, "invite-happy-path")
	ts := testutil.NewInviteGated(t, true)

	owner := ts.Register("owner")
	codes := mintCodes(t, ts, owner.Access, "媽媽", 1)

	cousin := ts.RegisterWithCode("cousin", codes[0])
	assert.NotEmpty(t, cousin.Access, "an invited registration gets a session immediately")

	// The console now shows who used it, and when.
	r := ts.Do(http.MethodGet, "/api/v1/admin/invites", owner.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	rows := r.Body["invites"].([]any)
	require.Len(t, rows, 1)
	row := rows[0].(map[string]any)
	assert.Equal(t, "redeemed", row["effectiveStatus"])
	assert.Equal(t, "cousin", row["redeemedUsername"])
	assert.Equal(t, cousin.ID, row["redeemedBy"])
	assert.Equal(t, "媽媽", row["note"])
	assert.NotEmpty(t, row["redeemedAt"])
}

// FIRST ACCOUNT, both sides of the interaction.
func TestInviteFirstAccountExemptThenClosed(t *testing.T) {
	testkit.Cover(t, "invite-first-account")
	ts := testutil.NewInviteGated(t, true)

	// A fresh deploy has no admin, therefore nobody who could mint a code.
	// Demanding one here would brick the deploy before the owner reached it.
	owner := ts.Register("owner")
	me := ts.Do(http.MethodGet, "/api/v1/me", owner.Access, nil)
	require.Equal(t, http.StatusOK, me.Status)
	acct := me.Body["account"].(map[string]any)
	roles, _ := acct["roles"].([]any)
	require.Len(t, roles, 1)
	assert.Equal(t, "admin", roles[0], "the exempt first account IS the owner")

	// The exemption closes itself the instant that account file lands: no
	// restart, no operator action.
	r := ts.RegisterRaw("stranger", nil)
	assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
	assert.Equal(t, "invite_required", r.ErrCode())
	assert.Contains(t, r.Body["error"].(map[string]any)["message"], "邀請碼")

	// …and nothing was written for the refused caller.
	search := ts.Do(http.MethodGet, "/api/v1/admin/accounts?query=stranger&page=1&pageSize=10", owner.Access, nil)
	require.Equal(t, http.StatusOK, search.Status)
	assert.Equal(t, float64(0), search.Body["total"], "a refused registration must leave no account: %s", string(search.Raw))
}

// A deploy where the owner bootstrap is OFF (an established deploy, or one that
// cannot read its own store) requires a code from EVERY registration — the
// fail-closed direction.
func TestInviteRequiredWhenNoOwnerClaimIsAvailable(t *testing.T) {
	testkit.Cover(t, "invite-fails-closed")
	ts := testutil.NewInviteGated(t, false)
	r := ts.RegisterRaw("stranger", nil)
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "invite_required", r.ErrCode())
}

// Every rejection reason, over HTTP, with the exact code the client switches on.
func TestInviteRejectionCodesOverHTTP(t *testing.T) {
	testkit.Cover(t, "invite-reject-http")
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")

	cases := []struct {
		name, user, code, want string
	}{
		{"missing", "nocode-a", "", "invite_required"},
		{"blank", "nocode-b", "   ", "invite_required"},
		{"unknown", "unknown-a", "GGD-2345-6789", "invite_invalid"},
		{"malformed", "malformed-a", "hello world", "invite_invalid"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := ts.RegisterRaw(c.user, map[string]string{"inviteCode": c.code})
			assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
			assert.Equal(t, c.want, r.ErrCode())
		})
	}

	t.Run("revoked reads like unknown", func(t *testing.T) {
		code := mintCodes(t, ts, owner.Access, "取消", 1)[0]
		rv := ts.Do(http.MethodPost, "/api/v1/admin/invites/"+code+"/revoke", owner.Access, map[string]any{})
		require.Equal(t, http.StatusOK, rv.Status, "revoke: %s", string(rv.Raw))
		r := ts.RegisterRaw("revoked-a", map[string]string{"inviteCode": code})
		assert.Equal(t, "invite_invalid", r.ErrCode(), "a revoked code must not be distinguishable from an unknown one")
	})

	t.Run("spent code says used up", func(t *testing.T) {
		code := mintCodes(t, ts, owner.Access, "一次", 1)[0]
		ts.RegisterWithCode("spender-a", code)
		r := ts.RegisterRaw("spender-b", map[string]string{"inviteCode": code})
		assert.Equal(t, http.StatusForbidden, r.Status)
		assert.Equal(t, "invite_used", r.ErrCode(), "the one distinction a family member on the phone needs")
	})
}

// A code typed the way a human retypes it — lower case, spaces instead of
// hyphens — is the same code.
func TestInviteCodeIsRetypeTolerant(t *testing.T) {
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")
	code := mintCodes(t, ts, owner.Access, "阿姨", 1)[0]
	typed := strings.ToLower(strings.ReplaceAll(code, "-", " "))
	ts.RegisterWithCode("aunt", typed)
}

// THE RACE, over HTTP: two people submit the same single-use code at the same
// instant. Exactly one account may exist afterwards.
func TestConcurrentRegistrationsShareOneCode(t *testing.T) {
	testkit.Cover(t, "invite-redeem-race-http")
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")
	code := mintCodes(t, ts, owner.Access, "雙胞胎", 1)[0]

	const racers = 8
	results := make([]testutil.Resp, racers)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i] = ts.RegisterRaw("racer"+string(rune('a'+i)), map[string]string{"inviteCode": code})
		}(i)
	}
	close(start)
	wg.Wait()

	created := 0
	for _, r := range results {
		if r.Status == http.StatusCreated {
			created++
			continue
		}
		assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
		assert.Equal(t, "invite_used", r.ErrCode())
	}
	assert.Equal(t, 1, created, "a single-use code must produce exactly one account")

	list := ts.Do(http.MethodGet, "/api/v1/admin/invites", owner.Access, nil)
	require.Equal(t, http.StatusOK, list.Status)
	row := list.Body["invites"].([]any)[0].(map[string]any)
	assert.Equal(t, "redeemed", row["effectiveStatus"])
	assert.NotEmpty(t, row["redeemedUsername"])
}

// RESTART DURABILITY. The spent/live state is in DATA_DIR, and only there: a
// second platform process on the same directory — with a brand-new, empty Redis
// — must still refuse a code that was already burned.
func TestInviteStateSurvivesRestartAndARedisWipe(t *testing.T) {
	testkit.Cover(t, "invite-durable")
	dir := t.TempDir()
	withDir := func(c *config.Config) { c.DataDir = dir }

	ts := testutil.NewInviteGated(t, true, withDir)
	owner := ts.Register("owner")
	codes := mintCodes(t, ts, owner.Access, "過年", 2)
	ts.RegisterWithCode("cousin", codes[0])
	ts.Mini.FlushAll() // Redis holds no invite truth to lose

	// A completely separate platform + Redis over the same durable directory.
	ts2 := testutil.NewInviteGated(t, true, withDir)
	spent := ts2.RegisterRaw("thief", map[string]string{"inviteCode": codes[0]})
	assert.Equal(t, http.StatusForbidden, spent.Status, "body: %s", string(spent.Raw))
	assert.Equal(t, "invite_used", spent.ErrCode(), "a flush must not resurrect a spent code")

	// The untouched one still works after the restart.
	ts2.RegisterWithCode("uncle", codes[1])

	// And the deploy is still owned, so the second process does not reopen the
	// first-account exemption.
	noCode := ts2.RegisterRaw("stranger", nil)
	assert.Equal(t, "invite_required", noCode.ErrCode())
}

// The console surface is a credential store: nothing about it is readable — or
// writable — without an operator session.
func TestInviteAdminRoutesRejectEveryoneElse(t *testing.T) {
	testkit.Cover(t, "invite-admin-only")
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")
	code := mintCodes(t, ts, owner.Access, "外人", 1)[0]
	player := ts.RegisterWithCode("player", code)

	for _, call := range []struct {
		method, path string
		body         any
	}{
		{http.MethodGet, "/api/v1/admin/invites", nil},
		{http.MethodPost, "/api/v1/admin/invites", map[string]any{"note": "x", "count": 1}},
		{http.MethodPost, "/api/v1/admin/invites/" + code + "/revoke", map[string]any{}},
	} {
		anon := ts.Do(call.method, call.path, "", call.body)
		assert.Equal(t, http.StatusUnauthorized, anon.Status, "%s %s unauthenticated: %s", call.method, call.path, string(anon.Raw))

		nonAdmin := ts.Do(call.method, call.path, player.Access, call.body)
		assert.Equal(t, http.StatusForbidden, nonAdmin.Status, "%s %s as a player: %s", call.method, call.path, string(nonAdmin.Raw))
		assert.Equal(t, "admin_required", nonAdmin.ErrCode())
	}
}

// With the gate OFF (the dev/CI default, and every pre-#174 test), registration
// is untouched: no field, no code, no change.
func TestGateOffLeavesRegistrationOpen(t *testing.T) {
	ts := testutil.New(t)
	ts.Register("plain")
	// even a nonsense code is simply ignored
	ts.RegisterWithCode("plain2", "who-cares")
}
