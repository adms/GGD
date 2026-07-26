package invite

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// StatusOf is the read that keeps every MIRROR of a code honest (#237). It must
// report the same lifecycle the gate itself acts on — including the derived
// half — for every state a code can be in, and it must never report "active" for
// something Redeem would refuse. That last property is the whole point: a caller
// asks this question to decide whether to keep offering a code to somebody.
func TestStatusOfReportsEveryLifecycleTheGateActsOn(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()

	t.Run("active", func(t *testing.T) {
		code := mintOne(t, s, "媽媽")
		st, err := s.StatusOf(ctx, code)
		require.NoError(t, err)
		assert.Equal(t, StatusActive, st)
	})

	t.Run("redeemed", func(t *testing.T) {
		code := mintOne(t, s, "表弟")
		require.NoError(t, s.Redeem(ctx, code, "acct-1", "cousin"))
		st, err := s.StatusOf(ctx, code)
		require.NoError(t, err)
		assert.Equal(t, StatusRedeemed, st)
	})

	t.Run("revoked", func(t *testing.T) {
		code := mintOne(t, s, "取消的")
		_, err := s.Revoke(ctx, "admin-1", code)
		require.NoError(t, err)
		st, err := s.StatusOf(ctx, code)
		require.NoError(t, err)
		assert.Equal(t, StatusRevoked, st)
	})

	t.Run("expired is DERIVED, exactly as the gate derives it", func(t *testing.T) {
		code := mintOne(t, s, "過期的")
		s.SetNow(func() time.Time { return time.Now().AddDate(0, 0, 15) })
		defer s.SetNow(time.Now)
		st, err := s.StatusOf(ctx, code)
		require.NoError(t, err)
		assert.Equal(t, StatusExpired, st, "the stored status is still 'active'; expiry is a read-time rule")
		// …and the gate agrees, which is what makes the two readings one fact.
		assert.Same(t, ErrInvalid, s.Redeem(ctx, code, "acct-x", "x"))
	})

	t.Run("unknown and malformed never read as usable", func(t *testing.T) {
		for _, bad := range []string{"", "   ", "not-a-code", "GGD-2345-6789", "MYGGDACCOUNT"} {
			st, err := s.StatusOf(ctx, bad)
			require.NoError(t, err, "input %q", bad)
			assert.Equal(t, StatusUnknown, st, "input %q", bad)
		}
	})
}

// A released code (burn-first rollback, see Release) becomes live again, and
// StatusOf must follow it back — otherwise a family member whose registration
// failed on a taken username would be told their perfectly good code is spent.
func TestStatusOfFollowsAReleasedCodeBackToActive(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()
	code := mintOne(t, s, "退回")

	require.NoError(t, s.Redeem(ctx, code, "acct-1", "u1"))
	st, err := s.StatusOf(ctx, code)
	require.NoError(t, err)
	require.Equal(t, StatusRedeemed, st)

	require.NoError(t, s.Release(ctx, code, "acct-1"))
	st, err = s.StatusOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, StatusActive, st, "a released code is offerable again")
}

// SINGLE-USE IS SINGLE-USE, in every reading of it. There is no max-uses counter
// and no partial consumption anywhere in this package — a code has exactly one
// burn — so the three places that answer "is this code still good?" (the gate,
// the console listing, and the mirror read) must never disagree about it. This
// pins that as a property rather than leaving it to three separate call sites.
func TestOneBurnIsTheWholeLifecycleEverywhereItIsRead(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()
	code := mintOne(t, s, "只有一次")

	require.NoError(t, s.Redeem(ctx, code, "acct-1", "first"))
	assert.Same(t, ErrUsed, s.Redeem(ctx, code, "acct-2", "second"), "the gate refuses the second use")

	st, err := s.StatusOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, StatusRedeemed, st, "the mirror read agrees")

	rows, err := s.List(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, StatusRedeemed, rows[0].EffectiveStatus, "the console listing agrees")
	assert.Equal(t, "acct-1", rows[0].RedeemedBy, "and it is attributed to the FIRST caller, not the last")
	assert.Equal(t, "first", rows[0].RedeemedUsername)
	assert.False(t, rows[0].RedeemedAt.IsZero())
}

// The personal referral code (#203) is the mirror that actually exists, so its
// own lifecycle gets the same treatment: minted live, spent by whoever burns it,
// and never again reported as offerable to the referrer it belongs to.
func TestPersonalReferralCodeStatusTracksItsBurn(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()

	code, err := s.MintPersonalReferral(ctx, "acct-A", "cousina")
	require.NoError(t, err)

	st, err := s.StatusOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, StatusActive, st, "a fresh personal code is offerable")

	require.NoError(t, s.Redeem(ctx, code, "acct-B", "cousinb"))
	st, err = s.StatusOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, StatusRedeemed, st, "once a friend has used it, it must never read as offerable again")

	// The referrer link survives the burn (the auto-approval half reads it), so
	// withholding the code costs the referral chain nothing.
	ref, err := s.ReferrerOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, "acct-A", ref)
}
