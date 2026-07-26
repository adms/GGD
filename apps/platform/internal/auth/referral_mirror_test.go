// referral_mirror_test.go — task #237, "a spent invite code is never marked
// redeemed".
//
// WHAT WAS ACTUALLY WRONG, established by reproduction before a line was
// changed: the redemption IS written. invite.Service.Redeem burns the document
// under DATA_DIR/invites atomically, under the code's keyed mutex, with
// redeemedBy / redeemedUsername / redeemedAt all filled in, and the admin
// console renders it as 已使用. What was never written is the ACCOUNT'S MIRROR of
// that document: #203 pins each new account's own personal referral code onto
// the account so the lobby can show it, and that field is written once at
// registration and never reconciled. So /register, /login and /me kept handing
// the player a code the gate would refuse, and the lobby kept printing it in a
// copy box under「把這組專屬邀請碼分享給一位朋友」. Written, but not surfaced.
//
// These tests drive the REAL HTTP router — mint through the console endpoint,
// register through /auth/register, then read the state back through /me and the
// console listing. A unit test on invite.Service would have stayed green through
// the entire bug: the service was never the broken half.
package auth_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/invite"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// accountOf digs the account object out of any auth response envelope.
func accountOf(t *testing.T, r testutil.Resp) map[string]any {
	t.Helper()
	acc, ok := r.Body["account"].(map[string]any)
	require.True(t, ok, "no account in the response: %s", string(r.Raw))
	return acc
}

// login returns the raw login response for u (the password testutil derives).
func login(t *testing.T, ts *testutil.TS, u string) testutil.Resp {
	t.Helper()
	return ts.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": u, "password": "correct-horse-" + u})
}

// THE REGRESSION. A player's personal referral code is spent by a friend; from
// that moment no surface may offer it back to the player as though it were live.
//
// It also pins the two halves to each other: the console's row for that code and
// the player's own /me payload must agree, because they are the same fact read
// through two different doors — which is precisely the agreement that was
// missing.
func TestSpentReferralCodeIsNotHandedBackToItsOwner(t *testing.T) {
	testkit.Cover(t, "invite-referral-mirror")
	t.Setenv("GGD_REQUIRE_APPROVAL", "1") // the family deploy's posture
	ts := testutil.NewInviteGated(t, true)

	owner := ts.Register("owner")
	adminCode := mintCodes(t, ts, owner.Access, "表弟", 1)[0]

	// The cousin registers with the operator's code and receives their own.
	reg := ts.RegisterRaw("cousin", map[string]string{"inviteCode": adminCode})
	require.Equal(t, http.StatusCreated, reg.Status, string(reg.Raw))
	cousinAcct := accountOf(t, reg)
	cousinID := cousinAcct["id"].(string)
	cousinCode, _ := cousinAcct["referralCode"].(string)
	require.NotEmpty(t, cousinCode, "#203 mints every new account its own referral code")
	assert.Equal(t, invite.StatusActive, cousinAcct["referralCodeStatus"],
		"a freshly minted personal code is live, and the payload says so")

	// The OPERATOR's code, meanwhile, is now spent — the half that always worked,
	// asserted here so this test fails loudly if the burn itself ever regresses.
	row := codeRow(t, ts, owner.Access, adminCode)
	assert.Equal(t, invite.StatusRedeemed, row["effectiveStatus"])
	assert.Equal(t, cousinID, row["redeemedBy"])
	assert.Equal(t, "cousin", row["redeemedUsername"])
	assert.NotEmpty(t, row["redeemedAt"])

	// A friend burns the cousin's personal code. The referral chain fires, so the
	// cousin is auto-approved and can log in — which is exactly when they open the
	// lobby and look at their code again.
	friend := ts.RegisterRaw("friend", map[string]string{"inviteCode": cousinCode})
	require.Equal(t, http.StatusCreated, friend.Status, string(friend.Raw))

	// The document is burned…
	spent := codeRow(t, ts, owner.Access, cousinCode)
	require.Equal(t, invite.StatusRedeemed, spent["effectiveStatus"], "the friend's registration burned it")
	assert.Equal(t, "friend", spent["redeemedUsername"])
	assert.Equal(t, invite.SourceReferral, spent["source"])

	// …and it is enforced, not merely displayed: nobody else can use it.
	third := ts.RegisterRaw("thirdwheel", map[string]string{"inviteCode": cousinCode})
	require.Equal(t, http.StatusForbidden, third.Status, string(third.Raw))
	assert.Equal(t, "invite_used", third.ErrCode())

	// THE BUG. Every door the owner of that code can walk through must now agree
	// with the document. Before the fix each of these still returned the spent
	// code as `referralCode`, and the lobby offered it to another friend.
	sess := login(t, ts, "cousin")
	require.Equal(t, http.StatusOK, sess.Status, "the referral chain approved the cousin: %s", string(sess.Raw))
	access := sess.Body["tokens"].(map[string]any)["accessToken"].(string)
	require.NotEmpty(t, access)

	for _, door := range []struct {
		name string
		resp testutil.Resp
	}{
		{"login", sess},
		{"me", ts.Do(http.MethodGet, "/api/v1/me", access, nil)},
	} {
		t.Run(door.name, func(t *testing.T) {
			require.Equal(t, http.StatusOK, door.resp.Status, string(door.resp.Raw))
			acc := accountOf(t, door.resp)
			assert.Empty(t, acc["referralCode"],
				"%s still hands back a code the gate refuses: %s", door.name, string(door.resp.Raw))
			assert.Equal(t, invite.StatusRedeemed, acc["referralCodeStatus"],
				"the payload must say WHY the code is gone, not silently drop it")
		})
	}

	// The friend, whose own code is untouched, still gets theirs — the fix
	// withholds spent codes, not all of them.
	friendAcct := accountOf(t, friend)
	assert.NotEmpty(t, friendAcct["referralCode"])
	assert.Equal(t, invite.StatusActive, friendAcct["referralCodeStatus"])
}

// An OPERATOR-REVOKED personal code is the same class of stale mirror, reached
// by a different route: nothing burned it, so a "clear the field when you burn
// it" fix would have missed it entirely. Deriving the state on read covers both
// without either knowing about the other.
func TestRevokedReferralCodeIsAlsoWithheldFromItsOwner(t *testing.T) {
	ts := testutil.NewInviteGated(t, true)

	owner := ts.Register("owner")
	code := mintCodes(t, ts, owner.Access, "阿姨", 1)[0]
	reg := ts.RegisterRaw("aunt", map[string]string{"inviteCode": code})
	require.Equal(t, http.StatusCreated, reg.Status, string(reg.Raw))
	auntCode := accountOf(t, reg)["referralCode"].(string)

	rv := ts.Do(http.MethodPost, "/api/v1/admin/invites/"+auntCode+"/revoke", owner.Access, map[string]any{})
	require.Equal(t, http.StatusOK, rv.Status, "revoke: %s", string(rv.Raw))

	sess := login(t, ts, "aunt")
	require.Equal(t, http.StatusOK, sess.Status, string(sess.Raw))
	acc := accountOf(t, sess)
	assert.Empty(t, acc["referralCode"], "a revoked code must not be offered back")
	assert.Equal(t, invite.StatusRevoked, acc["referralCodeStatus"])
}

// The derivation must not invent a code, and must not crash a deploy that has no
// invite gate at all (the dev/CI default): no gate ⇒ no personal codes ⇒ neither
// field appears.
func TestNoGateMeansNoReferralFields(t *testing.T) {
	ts := testutil.New(t)
	u := ts.Register("plain")
	me := ts.Do(http.MethodGet, "/api/v1/me", u.Access, nil)
	require.Equal(t, http.StatusOK, me.Status)
	acc := accountOf(t, me)
	assert.NotContains(t, acc, "referralCode")
	assert.NotContains(t, acc, "referralCodeStatus")
}
