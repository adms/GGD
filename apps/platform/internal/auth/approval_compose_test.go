// approval_compose_test.go pins the interaction between the TWO registration
// gates on the family deploy: #174 invite codes (who may create an account) and
// #126 approval (who may play). They are layered, not alternatives, and the
// thing most likely to break silently when either is touched is the layering
// itself — so it is asserted here rather than left to the two packages' own
// tests, neither of which can see the other gate.
package auth_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// bothGates boots a BRAND-NEW deploy with the invite gate and the approval gate
// both on — the family-build posture at go-live.
func bothGates(t *testing.T) *testutil.TS {
	t.Helper()
	t.Setenv("GGD_REQUIRE_APPROVAL", "1") // read by server.New at construction
	return testutil.NewInviteGated(t, true)
}

// sec-infra-gates-compose: BOTH gates, in order — burn a code, THEN wait to be
// seen. The order matters: a family member who mistypes a code must be refused
// before anything is written, and one who presents a valid code must still not
// be able to play until the owner says so.
func TestInviteAndApprovalGatesCompose(t *testing.T) {
	testkit.Cover(t, "sec-infra-gates-compose")
	ts := bothGates(t)

	// THE OWNER IS EXEMPT FROM BOTH, and that exemption is what keeps him out of
	// a deadlock: nobody can mint him a code (no admin exists yet) and nobody
	// could approve him (same reason). He must land approved, with a session.
	owner := ts.Register("owner")
	require.NotEmpty(t, owner.Access, "the first account must get a session — nobody exists who could approve it")

	me := ts.Do(http.MethodGet, "/api/v1/me", owner.Access, nil)
	require.Equal(t, http.StatusOK, me.Status, string(me.Raw))
	acct := me.Body["account"].(map[string]any)
	assert.Equal(t, "approved", acct["status"], "the owner must be approved, not pending")
	roles := acct["roles"].([]any)
	require.Len(t, roles, 1)
	assert.Equal(t, "admin", roles[0])

	// A family member: valid code, so the FIRST gate lets them create an
	// account — and the SECOND still withholds the session.
	code := mintCodes(t, ts, owner.Access, "表弟", 1)[0]
	r := ts.RegisterRaw("cousin", map[string]string{"inviteCode": code})
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	cousin := r.Body["account"].(map[string]any)
	cousinID := cousin["id"].(string)
	assert.Equal(t, "pending", cousin["status"], "a validly-invited account is still PENDING")
	assert.Empty(t, r.Body["tokens"].(map[string]any)["accessToken"],
		"the approval gate must withhold the session a valid code would otherwise have earned")

	login := ts.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": "cousin", "password": "correct-horse-cousin"})
	assert.Equal(t, http.StatusForbidden, login.Status, string(login.Raw))
	assert.Equal(t, "account_pending", login.ErrCode())

	// THE CODE IS SPENT REGARDLESS. Approval is a later, independent decision,
	// so a pending account must not leave its code live and re-usable — that
	// would turn one invite into an unlimited supply of pending registrations.
	//
	// The row is located BY CODE. The listing is newest-first and mixed: the
	// cousin's registration also minted the cousin's own #203 personal referral
	// code, which is legitimately still active, so the first row is not the code
	// under test.
	row := codeRow(t, ts, owner.Access, code)
	assert.Equal(t, "redeemed", row["effectiveStatus"], "the code is burned at registration, not at approval")
	assert.Equal(t, cousinID, row["redeemedBy"])

	// …and "spent" is enforced, not merely displayed: presenting the same code
	// again is refused before anything is written. This is the behaviour #237
	// suspected was missing, so it is asserted here rather than inferred from
	// the console's rendering of the row.
	reuse := ts.RegisterRaw("intruder", map[string]string{"inviteCode": code})
	assert.Equal(t, http.StatusForbidden, reuse.Status, "body: %s", string(reuse.Raw))
	assert.Equal(t, "invite_used", reuse.ErrCode(), "one code, one account — a pending first user still spends it")

	// The owner approves, and only now can the cousin play.
	appr := ts.Do(http.MethodPost, "/api/v1/admin/accounts/"+cousinID+"/approve", owner.Access, nil)
	require.Equal(t, http.StatusOK, appr.Status, string(appr.Raw))
	login = ts.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": "cousin", "password": "correct-horse-cousin"})
	require.Equal(t, http.StatusOK, login.Status, string(login.Raw))
	assert.NotEmpty(t, login.Body["tokens"].(map[string]any)["accessToken"])
}

// The approval gate must not WEAKEN the invite gate. A stranger without a valid
// code is refused at the first gate and leaves nothing behind — in particular
// he does not become a pending account the owner then has to notice and decline.
func TestApprovalDoesNotWeakenTheInviteGate(t *testing.T) {
	ts := bothGates(t)
	owner := ts.Register("owner")

	for _, code := range []string{"", "   ", "GGD-2345-6789", "hello world"} {
		r := ts.RegisterRaw("stranger", map[string]string{"inviteCode": code})
		assert.Equal(t, http.StatusForbidden, r.Status, "code %q: %s", code, string(r.Raw))
	}

	// Nothing was written: not an account, and not a row in the approval queue.
	search := ts.Do(http.MethodGet, "/api/v1/admin/accounts?query=stranger&page=1&pageSize=10", owner.Access, nil)
	require.Equal(t, http.StatusOK, search.Status)
	assert.Equal(t, float64(0), search.Body["total"], "a refused registration must leave no account: %s", string(search.Raw))

	pending := ts.Do(http.MethodGet, "/api/v1/admin/accounts/pending", owner.Access, nil)
	require.Equal(t, http.StatusOK, pending.Status)
	assert.Equal(t, float64(0), pending.Body["total"],
		"an un-invited stranger must never reach the approval queue: %s", string(pending.Raw))
}
