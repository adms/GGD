package account

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// TestIsApproved covers the private-deploy gate's grandfather rule (#126): only
// an explicit pending/denied stamp blocks play; "" and "approved" are playable.
func TestIsApproved(t *testing.T) {
	cases := map[string]bool{
		"":             true, // grandfathered (legacy / gate disabled)
		StatusApproved: true,
		StatusPending:  false,
		StatusDenied:   false,
	}
	for status, want := range cases {
		require.Equal(t, want, Account{Status: status}.IsApproved(), "status %q", status)
	}
}

// TestPublicCarriesStatus asserts the API projection surfaces the approval
// state so the client can render a "pending review" screen.
func TestPublicCarriesStatus(t *testing.T) {
	require.Equal(t, StatusPending, Account{Status: StatusPending}.Public().Status)
	// A grandfathered account omits it (json omitempty keeps the wire clean).
	require.Equal(t, "", Account{}.Public().Status)
}

// TestSetStatusRejectsUnknown asserts SetStatus validates the value before any
// store write (the guard returns ErrInvalidStatus without touching Redis/JSON).
func TestSetStatusRejectsUnknown(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	repo := NewRepo(store, redisx.New("127.0.0.1:0", ""))

	_, err = repo.SetStatus(context.Background(), "whoever", "banned-ish")
	require.ErrorIs(t, err, ErrInvalidStatus)
}

// TestApproveIfPending covers the ONLY conditional status transition (#203
// referral auto-approval): it flips pending → approved and leaves every other
// state exactly as it found it. The load-bearing cases are "denied stays
// denied" (admin's veto survives a referral) and "missing account is a clean
// no-op" (a referral can never error on or resurrect a gone referrer).
func TestApproveIfPending(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	repo := NewRepo(store, redisx.New("127.0.0.1:0", ""))
	ctx := context.Background()

	mk := func(id, status string) {
		require.NoError(t, repo.Create(ctx, Account{ID: id, Username: id, Email: id + "@e.test", Status: status}))
	}
	mk("pend", StatusPending)
	mk("appr", StatusApproved)
	mk("deny", StatusDenied)
	mk("grand", "") // grandfathered

	// Pending flips, and reports it did.
	flipped, err := repo.ApproveIfPending(ctx, "pend")
	require.NoError(t, err)
	require.True(t, flipped)
	a, err := repo.GetByID(ctx, "pend")
	require.NoError(t, err)
	require.Equal(t, StatusApproved, a.Status)

	// Every non-pending state is untouched and reports no change.
	for _, id := range []string{"appr", "deny", "grand"} {
		before, err := repo.GetByID(ctx, id)
		require.NoError(t, err)
		flipped, err := repo.ApproveIfPending(ctx, id)
		require.NoError(t, err)
		require.False(t, flipped, "%s must not flip", id)
		after, err := repo.GetByID(ctx, id)
		require.NoError(t, err)
		require.Equal(t, before.Status, after.Status, "%s status must be unchanged", id)
	}

	// A missing account is a clean no-op, never an error.
	flipped, err = repo.ApproveIfPending(ctx, "ghost")
	require.NoError(t, err)
	require.False(t, flipped)
}
