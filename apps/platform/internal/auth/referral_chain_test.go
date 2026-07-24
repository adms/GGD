// referral_chain_test.go drives the #203 referral-chain auto-approval over REAL
// HTTP, on the family-build posture (invite gate + approval gate both on). The
// property under test is layered on top of #174/#126 and must NEVER weaken
// either, so — like approval_compose_test.go — it is asserted through the wired
// router rather than the service in isolation.
package auth_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// referralCodeOf digs the caller's own personal referral code out of a
// register/login/me account projection.
func referralCodeOf(t *testing.T, r testutil.Resp) string {
	t.Helper()
	acct, ok := r.Body["account"].(map[string]any)
	require.True(t, ok, "no account in response: %s", string(r.Raw))
	code, _ := acct["referralCode"].(string)
	return code
}

// loginStatus attempts a login and returns (status code, error code). A pending
// account is 403 account_pending; an approved one is 200.
func loginStatus(t *testing.T, ts *testutil.TS, name string) (int, string) {
	t.Helper()
	r := ts.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": name, "password": "correct-horse-" + name})
	return r.Status, r.ErrCode()
}

// sec-infra-referral-chain: the whole feature, end to end. A pending inviter is
// fast-tracked to approved the moment someone ELSE registers with the inviter's
// personal code, and the chain continues one link deeper.
func TestReferralChainAutoApproval(t *testing.T) {
	testkit.Cover(t, "sec-infra-referral-chain")
	ts := bothGates(t)

	owner := ts.Register("owner")
	// Even the owner gets a personal code — a valid invite they can hand out.
	ownerMe := ts.Do(http.MethodGet, "/api/v1/me", owner.Access, nil)
	require.NotEmpty(t, referralCodeOf(t, ownerMe), "every account is minted a personal referral code")

	// The owner mints ONE admin code and 大表哥 (A) registers with it: A lands
	// pending, and is handed their OWN personal referral code.
	adminCode := mintCodes(t, ts, owner.Access, "大表哥", 1)[0]
	aResp := ts.RegisterRaw("cousina", map[string]string{"inviteCode": adminCode})
	require.Equal(t, http.StatusCreated, aResp.Status, string(aResp.Raw))
	assert.Equal(t, "pending", aResp.Body["account"].(map[string]any)["status"])
	codeA := referralCodeOf(t, aResp)
	require.NotEmpty(t, codeA, "a pending account still gets a code to share — it is their path to approval")

	// A is pending: cannot yet play.
	if st, code := loginStatus(t, ts, "cousina"); true {
		require.Equal(t, http.StatusForbidden, st)
		require.Equal(t, "account_pending", code)
	}

	// B registers with A's personal code. B is a NEW pending account (the gate
	// still withholds B's session), AND the act of burning A's code fast-tracks
	// A → approved.
	bResp := ts.RegisterRaw("cousinb", map[string]string{"inviteCode": codeA})
	require.Equal(t, http.StatusCreated, bResp.Status, string(bResp.Raw))
	assert.Equal(t, "pending", bResp.Body["account"].(map[string]any)["status"],
		"a referral fast-tracks the INVITER, never the new registrant")
	assert.Empty(t, bResp.Body["tokens"].(map[string]any)["accessToken"],
		"the approval gate must still withhold B's session")
	codeB := referralCodeOf(t, bResp)
	require.NotEmpty(t, codeB)

	// A is now approved and can play — no admin action was needed.
	st, _ := loginStatus(t, ts, "cousina")
	assert.Equal(t, http.StatusOK, st, "A must be auto-approved once their code was consumed")

	// The chain continues: C registers with B's code, and B is approved.
	cResp := ts.RegisterRaw("cousinc", map[string]string{"inviteCode": codeB})
	require.Equal(t, http.StatusCreated, cResp.Status, string(cResp.Raw))
	st, _ = loginStatus(t, ts, "cousinb")
	assert.Equal(t, http.StatusOK, st, "the chain continues recursively — B is approved by C")
}

// A referral must NOT open a code-free registration path. The personal code is
// a normal single-use invite; using it once approves the inviter and then it is
// spent, so it can never become an unlimited supply of approvals or accounts.
func TestReferralDoesNotBypassInviteGate(t *testing.T) {
	testkit.Cover(t, "sec-infra-referral-gate")
	ts := bothGates(t)
	owner := ts.Register("owner")

	adminCode := mintCodes(t, ts, owner.Access, "大表哥", 1)[0]
	aResp := ts.RegisterRaw("cousina", map[string]string{"inviteCode": adminCode})
	require.Equal(t, http.StatusCreated, aResp.Status, string(aResp.Raw))
	codeA := referralCodeOf(t, aResp)

	// A stranger with NO code is still refused — the referral feature changed
	// nothing about the gate.
	for _, code := range []string{"", "   ", "GGD-2345-6789"} {
		r := ts.RegisterRaw("stranger", map[string]string{"inviteCode": code})
		assert.Equal(t, http.StatusForbidden, r.Status, "code %q must be refused: %s", code, string(r.Raw))
	}

	// The personal code works ONCE.
	b := ts.RegisterRaw("cousinb", map[string]string{"inviteCode": codeA})
	require.Equal(t, http.StatusCreated, b.Status, string(b.Raw))

	// A SECOND use of the same personal code is refused as already-used: one
	// code can never approve twice or admit two strangers.
	again := ts.RegisterRaw("cousinc", map[string]string{"inviteCode": codeA})
	assert.Equal(t, http.StatusForbidden, again.Status, string(again.Raw))
	assert.Equal(t, "invite_used", again.ErrCode())
}

// The referral must not undo an admin's veto. If the owner has DENIED the
// inviter, consuming that inviter's code must leave them denied — auto-approval
// only ever moves pending → approved.
func TestReferralCannotResurrectADeniedInviter(t *testing.T) {
	testkit.Cover(t, "sec-infra-referral-respects-deny")
	ts := bothGates(t)
	owner := ts.Register("owner")

	adminCode := mintCodes(t, ts, owner.Access, "大表哥", 1)[0]
	aResp := ts.RegisterRaw("cousina", map[string]string{"inviteCode": adminCode})
	require.Equal(t, http.StatusCreated, aResp.Status, string(aResp.Raw))
	aID := aResp.Body["account"].(map[string]any)["id"].(string)
	codeA := referralCodeOf(t, aResp)

	// The owner declines A.
	deny := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+aID+"/deny", owner.Access, nil)
	require.Equal(t, http.StatusOK, deny.Status, string(deny.Raw))

	// Someone registers with A's code anyway — B is created, but A stays DENIED.
	b := ts.RegisterRaw("cousinb", map[string]string{"inviteCode": codeA})
	require.Equal(t, http.StatusCreated, b.Status, string(b.Raw))

	st, code := loginStatus(t, ts, "cousina")
	assert.Equal(t, http.StatusForbidden, st, "a denied inviter must not be resurrected by a referral")
	assert.Equal(t, "account_denied", code)
}
