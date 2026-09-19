// register_optional_invite_test.go is the load-bearing guard for GH#1274 —
// 「註冊邀請碼改成後台可切換：必填／選填」.
//
// owner 2026-09-15:
//
//	「推薦碼變成選項不需讓玩家也可以直接註冊，但是後台還是要批核
//	 (但新帳號使用推薦碼後還是可以讓介紹人自動審批過) 這個變成後台選項可以切換」
//
// It drives REAL HTTP through the fully-wired router, like invite_gate_test.go
// and for the same reason: what is under test is not「the service reads a
// field」but「a person with no code can create an account, and still cannot
// play until the owner says so」. A unit test on invite.Service could not see
// the router, the approval gate, or the referral fast-track.
//
// BOTH DIRECTIONS ARE ASSERTED HERE ON PURPOSE. A switch tested only in its new
// position is a single-sided measuring stick — it proves the feature can be ON
// and says nothing about whether it can be turned OFF, which is the entire
// value of a rollback knob. So 選填 and 必填 are exercised against the same
// wiring, and the 必填 half is what the mutation below has to break.
//
// MUTATION VERIFIED (2026-09-19). In auth/service.go, replacing
//
//	if codeRequired || strings.TrimSpace(opt.InviteCode) != "" {
//
// with `if false {` (i.e. never redeem — the "選填 always skips" slip) makes
// TestInviteStillRequiredWhenTheSettingSaysRequired FAIL: a registration with
// no code returns 201 instead of 403 invite_required. Restored with Edit.
package auth_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
)

// optionalWithApproval boots the SHIPPING posture of #1274: the invite-code
// system installed, its policy never saved (so invite.DefaultCodeMode decides),
// and the #126 approval gate on.
//
// It calls NewInviteOptional rather than writing a policy document, so this
// fixture reads the same compiled default a never-configured production deploy
// reads. Flip DefaultCodeMode to "required" and the first test below goes red —
// which is the point.
func optionalWithApproval(t *testing.T) *testutil.TS {
	t.Helper()
	t.Setenv("GGD_REQUIRE_APPROVAL", "1") // read by server.New at construction
	return testutil.NewInviteOptional(t)
}

// AC#1 + owner's「後台還是要批核」: no code, account created, still 待審, no
// session. The account must be REAL (an admin can see and approve it), not a
// 201 that quietly dropped the registration.
func TestOptionalInviteLetsARegistrationThroughStillPending(t *testing.T) {
	ts := optionalWithApproval(t)
	owner := ts.Register("owner") // first account: exempt from both gates

	r := ts.RegisterRaw("stranger", nil)
	require.Equal(t, http.StatusCreated, r.Status,
		"選填: a registration with no invite code must be accepted: %s", string(r.Raw))
	acct := r.Body["account"].(map[string]any)
	assert.Equal(t, "pending", acct["status"],
		"選填 must NOT weaken the approval gate — owner:「後台還是要批核」")
	assert.Empty(t, r.Body["tokens"].(map[string]any)["accessToken"],
		"a pending account gets no session")

	// It is a durable account the owner can act on, not a phantom 201.
	st, code := loginStatus(t, ts, "stranger")
	assert.Equal(t, http.StatusForbidden, st)
	assert.Equal(t, "account_pending", code)

	// AC#5: 選填 still mints the new account its own personal referral code.
	assert.NotEmpty(t, referralCodeOf(t, r),
		"選填 must still hand out a personal referral code — it is the account's own path to approval")

	// And the owner can actually approve it: the account is in the queue.
	list := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", owner.Access, nil)
	require.Equal(t, http.StatusOK, list.Status, "pending list: %s", string(list.Raw))
	assert.Contains(t, string(list.Raw), "stranger",
		"the un-invited registration must land in the approval queue an admin can see")
}

// AC#2: 選填 + a personal referral code still burns the code and still
// fast-tracks the INVITER (owner:「新帳號使用推薦碼後還是可以讓介紹人自動審批過」).
// The new account itself stays pending — the referral approves the referrer,
// never the registrant.
func TestOptionalInviteStillFastTracksTheReferrer(t *testing.T) {
	ts := optionalWithApproval(t)
	owner := ts.Register("owner")

	// A registers WITHOUT a code (that is the new path) and is pending.
	aResp := ts.RegisterRaw("cousina", nil)
	require.Equal(t, http.StatusCreated, aResp.Status, string(aResp.Raw))
	require.Equal(t, "pending", aResp.Body["account"].(map[string]any)["status"])
	codeA := referralCodeOf(t, aResp)
	require.NotEmpty(t, codeA)
	if st, _ := loginStatus(t, ts, "cousina"); st != http.StatusForbidden {
		t.Fatalf("A must still be pending before the referral, got %d", st)
	}

	// B registers WITH A's personal code, in 選填 mode.
	bResp := ts.RegisterRaw("cousinb", map[string]string{"inviteCode": codeA})
	require.Equal(t, http.StatusCreated, bResp.Status, string(bResp.Raw))
	assert.Equal(t, "pending", bResp.Body["account"].(map[string]any)["status"],
		"a referral fast-tracks the INVITER, never the new registrant")

	st, _ := loginStatus(t, ts, "cousina")
	assert.Equal(t, http.StatusOK, st,
		"選填 must keep #203: burning A's code approves A")

	// The code was really BURNED, not waved past. A second use is refused.
	reuse := ts.RegisterRaw("cousinc", map[string]string{"inviteCode": codeA})
	assert.Equal(t, http.StatusForbidden, reuse.Status)
	assert.Equal(t, "invite_used", reuse.ErrCode(),
		"選填 validates a code that WAS presented — it does not skip the burn")
	_ = owner
}

// AC#3: 選填 + a WRONG code is still refused. Silently ignoring a typo would
// also silently skip the referrer fast-track, so the family member would be
// told nothing while their inviter stayed stuck pending.
func TestOptionalInviteStillRejectsABadCode(t *testing.T) {
	ts := optionalWithApproval(t)
	ts.Register("owner")

	r := ts.RegisterRaw("typo", map[string]string{"inviteCode": "GGD-2345-6789"})
	assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
	assert.Equal(t, "invite_invalid", r.ErrCode(),
		"a code that was TYPED must be validated even in 選填")
}

// AC#4 — THE REVERSE DIRECTION, and the one the mutation must break. With the
// setting saved as 必填, behaviour is byte-identical to the pre-#1274 deploy.
func TestInviteStillRequiredWhenTheSettingSaysRequired(t *testing.T) {
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	ts := testutil.NewInviteGated(t, true) // writes the 必填 policy document
	ts.Register("owner")

	r := ts.RegisterRaw("stranger", nil)
	assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
	assert.Equal(t, "invite_required", r.ErrCode(),
		"必填 must behave exactly as it did before #1274 — this is the rollback")
}

// AC#7: an unreadable policy FAILS CLOSED. The document is replaced by a
// directory, which makes the jsonstore read fail without making the data dir
// unusable for anything else, so what is measured is the policy read and not a
// broken fixture.
func TestUnreadablePolicyFailsClosedToRequired(t *testing.T) {
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	dataDir := t.TempDir()
	ts := testutil.NewInviteOptional(t, func(c *config.Config) { c.DataDir = dataDir })
	ts.Register("owner")

	// Sanity: 選填 is live right now (the two-sided half — an unreadable store
	// must be shown to CHANGE the answer, not merely to agree with it).
	require.Equal(t, http.StatusCreated, ts.RegisterRaw("before", nil).Status,
		"選填 must be in force before the store is broken")

	testutil.BreakInvitePolicy(t, dataDir)

	r := ts.RegisterRaw("after", nil)
	assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
	assert.Equal(t, "invite_required", r.ErrCode(),
		"an unreadable policy must never read as 「anyone may register」")
}

// The public probe the register UI reads must agree with what Register does,
// in BOTH positions — it is derived from the same two inputs precisely so it
// cannot drift. It must also take no parameters (no code-validation oracle).
func TestRegistrationPolicyProbeMatchesBehaviour(t *testing.T) {
	t.Run("optional", func(t *testing.T) {
		ts := testutil.NewInviteOptional(t)
		r := ts.Do(http.MethodGet, "/api/v1/auth/registration-policy", "", nil)
		require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
		assert.Equal(t, true, r.Body["inviteCodeSupported"])
		assert.Equal(t, false, r.Body["inviteCodeRequired"])
	})
	t.Run("required", func(t *testing.T) {
		ts := testutil.NewInviteGated(t, true)
		r := ts.Do(http.MethodGet, "/api/v1/auth/registration-policy", "", nil)
		require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
		assert.Equal(t, true, r.Body["inviteCodeRequired"])
	})
	t.Run("no invite system at all", func(t *testing.T) {
		ts := testutil.New(t)
		r := ts.Do(http.MethodGet, "/api/v1/auth/registration-policy", "", nil)
		require.Equal(t, http.StatusOK, r.Status, string(r.Raw))
		assert.Equal(t, false, r.Body["inviteCodeSupported"],
			"a deploy with no invite system must not tell the UI to render the field")
		assert.Equal(t, false, r.Body["inviteCodeRequired"])
	})
}

// The console switch: saving it changes the very next registration, with NO
// restart (AC#1's「不重啟」). This is the whole reason the policy is read per
// registration instead of cached at boot.
func TestAdminCanSwitchTheModeLive(t *testing.T) {
	t.Setenv("GGD_REQUIRE_APPROVAL", "1")
	ts := testutil.NewInviteOptional(t)
	owner := ts.Register("owner")

	// 選填 → a code-free registration works.
	require.Equal(t, http.StatusCreated, ts.RegisterRaw("first", nil).Status)

	// Owner flips it to 必填 in the console.
	put := ts.Do(http.MethodPut, "/api/v1/admin/invites/policy", owner.Access,
		map[string]any{"inviteCode": "required"})
	require.Equal(t, http.StatusOK, put.Status, "put policy: %s", string(put.Raw))
	assert.Equal(t, "required", put.Body["policy"].(map[string]any)["inviteCode"])
	assert.Equal(t, true, put.Body["policyStored"])

	// The NEXT registration is refused — same process, no restart.
	r := ts.RegisterRaw("second", nil)
	assert.Equal(t, http.StatusForbidden, r.Status, "body: %s", string(r.Raw))
	assert.Equal(t, "invite_required", r.ErrCode())

	// And back again: the rollback direction works too.
	back := ts.Do(http.MethodPut, "/api/v1/admin/invites/policy", owner.Access,
		map[string]any{"inviteCode": "optional"})
	require.Equal(t, http.StatusOK, back.Status, string(back.Raw))
	assert.Equal(t, http.StatusCreated, ts.RegisterRaw("third", nil).Status,
		"switching back must reopen code-free registration")
}

// The write is admin-gated and strictly validated: a stranger cannot open the
// gate, and a typo cannot silently become a mode.
func TestPolicyWriteIsGuarded(t *testing.T) {
	ts := testutil.NewInviteGated(t, true)
	owner := ts.Register("owner")

	anon := ts.Do(http.MethodPut, "/api/v1/admin/invites/policy", "",
		map[string]any{"inviteCode": "optional"})
	assert.Equal(t, http.StatusUnauthorized, anon.Status,
		"an unauthenticated caller must never be able to open registration")

	bad := ts.Do(http.MethodPut, "/api/v1/admin/invites/policy", owner.Access,
		map[string]any{"inviteCode": "opitonal"})
	assert.Equal(t, http.StatusBadRequest, bad.Status,
		"an unknown mode must be a 400, never a silent fallback: %s", string(bad.Raw))

	// The typo changed nothing.
	after := ts.RegisterRaw("stranger", nil)
	assert.Equal(t, "invite_required", after.ErrCode())
}
