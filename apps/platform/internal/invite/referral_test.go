package invite

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/pkg/testkit"
)

// A personal referral code is a normal, redeemable, single-use invite that
// additionally remembers WHO it was minted for, and it is kept out of the admin
// console's code list.
func TestPersonalReferralCode(t *testing.T) {
	testkit.Cover(t, "invite-personal-referral")
	s := newSvc(t)
	ctx := context.Background()

	code, err := s.MintPersonalReferral(ctx, "acct-A", "cousina")
	require.NoError(t, err)
	require.Regexp(t, `^GGD-[2-9A-HJ-NP-TV-Z]{4}-[2-9A-HJ-NP-TV-Z]{4}$`, code)

	// It carries its owner, and it is a live invite (real expiry, not the
	// fail-closed zero time).
	ref, err := s.ReferrerOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, "acct-A", ref)
	doc, err := s.get(Normalize(code))
	require.NoError(t, err)
	assert.Equal(t, StatusActive, doc.EffectiveStatus(time.Now()))
	assert.False(t, doc.ExpiresAt.IsZero(), "a referral code must carry a real expiry or it reads as expired")

	// It burns exactly once, like any invite.
	require.NoError(t, s.Redeem(ctx, code, "acct-B", "cousinb"))
	assert.Same(t, ErrUsed, s.Redeem(ctx, code, "acct-C", "cousinc"))

	// The referrer is still readable after the burn (Redeem never clears it).
	ref, err = s.ReferrerOf(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, "acct-A", ref)
}

// The admin console's List() now SHOWS every code with a source tag (owner
// request for the 由誰產生 column): operator-minted invites AND #203 personal
// referral codes, so a code can be attributed to whoever produced it. A referral
// code's Note carries the referrer's username ("個人推薦碼 · <username>").
func TestPersonalReferralCodesShownWithSourceInAdminList(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()

	admin := mintOne(t, s, "媽媽") // an operator code
	_, err := s.MintPersonalReferral(ctx, "acct-A", "cousina")
	require.NoError(t, err)
	_, err = s.MintPersonalReferral(ctx, "acct-B", "cousinb")
	require.NoError(t, err)

	rows, err := s.List(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 3, "admin + both referral codes are all listed now")

	bySource := map[string]int{}
	referralNote := ""
	for _, r := range rows {
		bySource[r.Source]++
		if r.Code == admin {
			assert.Equal(t, SourceAdmin, r.Source, "the operator code is tagged admin")
		}
		if r.Source == SourceReferral {
			referralNote = r.Note
		}
	}
	assert.Equal(t, 1, bySource[SourceAdmin], "one operator code")
	assert.Equal(t, 2, bySource[SourceReferral], "two referral codes")
	assert.Contains(t, referralNote, "cousin", "a referral code's Note carries the referrer's username")
}

// ReferrerOf is empty for an admin code and for anything unknown/malformed, so a
// registration burning an ordinary invite approves nobody.
func TestReferrerOfNonReferralCodes(t *testing.T) {
	s := newSvc(t)
	ctx := context.Background()

	admin := mintOne(t, s, "媽媽")
	ref, err := s.ReferrerOf(ctx, admin)
	require.NoError(t, err)
	assert.Empty(t, ref, "an admin code has no referrer")

	for _, bad := range []string{"", "not-a-code", "GGD-2345-6789"} {
		ref, err := s.ReferrerOf(ctx, bad)
		require.NoError(t, err)
		assert.Empty(t, ref, "unknown/malformed code %q has no referrer", bad)
	}
}
