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

// listInvites reads the whole console listing. It is deliberately the ONLY way
// these tests touch GET /api/v1/admin/invites, because the listing is a MIXED
// feed and always has been since #203: it carries operator-minted codes AND the
// personal referral code every registration auto-mints for the new account, and
// it is sorted newest-first. Indexing into it positionally (invites[0]) is
// therefore never a way to name a particular code — see codeRow.
func listInvites(t *testing.T, ts *testutil.TS, token string) []map[string]any {
	t.Helper()
	r := ts.Do(http.MethodGet, "/api/v1/admin/invites", token, nil)
	require.Equal(t, http.StatusOK, r.Status, "list invites: %s", string(r.Raw))
	raw, ok := r.Body["invites"].([]any)
	require.True(t, ok, "invites missing: %s", string(r.Raw))
	out := make([]map[string]any, 0, len(raw))
	for _, row := range raw {
		out = append(out, row.(map[string]any))
	}
	return out
}

// codeRow returns the console row for ONE named code. Selecting by code rather
// than by position is what makes an assertion about "the code we minted" mean
// that and not "whatever happens to be first today": the row stays findable no
// matter how many referral codes registration mints alongside it.
func codeRow(t *testing.T, ts *testutil.TS, token, code string) map[string]any {
	t.Helper()
	rows := listInvites(t, ts, token)
	for _, row := range rows {
		if row["code"] == code {
			return row
		}
	}
	seen := make([]string, 0, len(rows))
	for _, row := range rows {
		seen = append(seen, row["code"].(string))
	}
	require.FailNowf(t, "code missing from the console listing",
		"minted %s is not listed; listing holds %v", code, seen)
	return nil
}

// adminMinted narrows the mixed listing to the operator-minted codes — the ones
// a human created in the 邀請碼 page. #203's per-account referral codes carry
// source "referral" and are excluded, so a count assertion here counts what the
// operator did, not what registration did on its own.
func adminMinted(rows []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if row["source"] == "admin" {
			out = append(out, row)
		}
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

	// The console now shows who used it, and when. The operator minted exactly
	// one code, so exactly one ADMIN-sourced row may exist — the referral codes
	// registration minted for owner and cousin are a different source and are
	// not counted here (they get their own assertion below).
	rows := listInvites(t, ts, owner.Access)
	require.Len(t, adminMinted(rows), 1, "the operator minted one code, so the console must show one admin row")

	row := codeRow(t, ts, owner.Access, codes[0])
	assert.Equal(t, "redeemed", row["effectiveStatus"])
	assert.Equal(t, "cousin", row["redeemedUsername"])
	assert.Equal(t, cousin.ID, row["redeemedBy"])
	assert.Equal(t, "媽媽", row["note"])
	assert.NotEmpty(t, row["redeemedAt"])
	assert.Equal(t, "admin", row["source"], "a code a human minted must not be labelled a referral code")

	// And the listing accounts for EVERY row, so a stray extra code could never
	// hide behind a filter: two accounts exist, so two referral codes exist, and
	// nothing else is in the feed.
	require.Len(t, rows, 3, "one admin code + one referral code per account (owner, cousin)")
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

	// The raced code itself — found by code, because the winner's registration
	// minted a referral code of its own that now sits ahead of it in the feed.
	row := codeRow(t, ts, owner.Access, code)
	assert.Equal(t, "redeemed", row["effectiveStatus"])
	assert.NotEmpty(t, row["redeemedUsername"])

	// Exactly ONE admin code exists and it is spent: the race did not mint a
	// replacement, and did not leave a second burnable copy behind.
	admin := adminMinted(listInvites(t, ts, owner.Access))
	require.Len(t, admin, 1, "the race must not have produced a second operator code")
	assert.Equal(t, code, admin[0]["code"])
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

// THE ENUMERATION ORACLE, closed. An un-invited stranger must not be able to
// read the 409-vs-403 split to learn which family usernames/emails exist: the
// invite gate is evaluated BEFORE the username/email reservation, so a caller
// with no valid code is refused with invite_required whether the identity they
// tried is taken or free. A registration WITH a valid code still reports the
// real conflict — and, because burn-first releases on failure, does not eat the
// code (verified via the console: the code stays 未使用).
func TestNoCodeCannotEnumerateExistingAccounts(t *testing.T) {
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")
	code := mintCodes(t, ts, owner.Access, "表哥", 1)[0]
	ts.RegisterWithCode("biaoge", code) // now "biaoge" exists

	// An existing username, no code → invite_required, NOT 409. The 403/409
	// split that used to leak existence is gone.
	existing := ts.RegisterRaw("biaoge", nil)
	assert.Equal(t, http.StatusForbidden, existing.Status, "body: %s", string(existing.Raw))
	assert.Equal(t, "invite_required", existing.ErrCode(), "an existing username with no code must look identical to a free one")

	// A free username, no code → also invite_required. Indistinguishable.
	free := ts.RegisterRaw("nobody-here", nil)
	assert.Equal(t, http.StatusForbidden, free.Status)
	assert.Equal(t, "invite_required", free.ErrCode())

	// A VALID code but a duplicate username still surfaces the real 409 — and the
	// code is released, not consumed, so the family member can reuse it.
	dupCode := mintCodes(t, ts, owner.Access, "再一組", 1)[0]
	dup := ts.RegisterRaw("biaoge", map[string]string{"inviteCode": dupCode})
	assert.Equal(t, http.StatusConflict, dup.Status, "body: %s", string(dup.Raw))

	list := ts.Do(http.MethodGet, "/api/v1/admin/invites", owner.Access, nil)
	require.Equal(t, http.StatusOK, list.Status)
	for _, raw := range list.Body["invites"].([]any) {
		row := raw.(map[string]any)
		if row["code"] == dupCode {
			assert.Equal(t, "active", row["effectiveStatus"], "a failed create must release the code, not burn it")
		}
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
