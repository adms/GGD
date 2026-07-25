package account

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// newPendingRepo builds a Repo backed by a temp jsonstore and a live miniredis,
// so the tests can assert that DeletePending reclaims the Redis uniqueness keys
// (not only the durable index files). The #126 CAP+TTL (sec-154-11) lives across
// both stores, so both must be exercised.
func newPendingRepo(t *testing.T) (*Repo, *miniredis.Miniredis) {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	mr := miniredis.RunT(t)
	return NewRepo(store, redisx.New(mr.Addr(), "")), mr
}

// TestCountByStatus covers the CAP's primitive: it counts exactly the accounts
// carrying a given status and ignores every other state (including the
// grandfathered "").
func TestCountByStatus(t *testing.T) {
	repo, _ := newPendingRepo(t)
	ctx := context.Background()
	mk := func(id, status string) {
		require.NoError(t, repo.Create(ctx, Account{ID: id, Username: id, Email: id + "@e.test", Status: status}))
	}
	mk("p1", StatusPending)
	mk("p2", StatusPending)
	mk("a1", StatusApproved)
	mk("d1", StatusDenied)
	mk("g1", "") // grandfathered

	n, err := repo.CountByStatus(ctx, StatusPending)
	require.NoError(t, err)
	require.Equal(t, 2, n)

	n, err = repo.CountByStatus(ctx, StatusApproved)
	require.NoError(t, err)
	require.Equal(t, 1, n)

	// A status nothing carries counts as zero, never errors.
	n, err = repo.CountByStatus(ctx, "no-such-status")
	require.NoError(t, err)
	require.Equal(t, 0, n)
}

// TestDeletePendingReclaimsReservations is the heart of the TTL teardown: a
// pending account and BOTH its uniqueness reservations (durable index files and
// the permanent Redis keys) are gone afterward, freeing the name for reuse.
func TestDeletePendingReclaimsReservations(t *testing.T) {
	repo, mr := newPendingRepo(t)
	ctx := context.Background()

	require.NoError(t, repo.Create(ctx, Account{
		ID: "p1", Username: "cousin", Email: "cousin@e.test", Status: StatusPending,
	}))
	// Mirror what auth.Register writes: the permanent (ttl 0) Redis index keys.
	require.NoError(t, repo.rdb.R.Set(ctx, redisx.KeyIdxUsername("cousin"), "p1", 0).Err())
	require.NoError(t, repo.rdb.R.Set(ctx, redisx.KeyIdxEmail("cousin@e.test"), "p1", 0).Err())

	deleted, err := repo.DeletePending(ctx, "p1")
	require.NoError(t, err)
	require.True(t, deleted)

	// The account and both index files are gone.
	_, err = repo.GetByID(ctx, "p1")
	require.ErrorIs(t, err, ErrNotFound)
	_, err = repo.GetByUsername(ctx, "cousin")
	require.ErrorIs(t, err, ErrNotFound)
	_, err = repo.GetByEmail(ctx, "cousin@e.test")
	require.ErrorIs(t, err, ErrNotFound)

	// The Redis uniqueness keys are reclaimed, so the name is free again.
	require.False(t, mr.Exists(redisx.KeyIdxUsername("cousin")))
	require.False(t, mr.Exists(redisx.KeyIdxEmail("cousin@e.test")))

	// The freed name can be registered again from scratch.
	require.NoError(t, repo.Create(ctx, Account{
		ID: "p2", Username: "cousin", Email: "cousin@e.test", Status: StatusPending,
	}))
}

// TestDeletePendingRefusesNonPending is the load-bearing guard: the TTL sweep
// must never reclaim an account that is approved, denied, admin or grandfathered
// — only ones still awaiting a decision.
func TestDeletePendingRefusesNonPending(t *testing.T) {
	repo, _ := newPendingRepo(t)
	ctx := context.Background()

	for _, status := range []string{StatusApproved, StatusDenied, ""} {
		id := "acct-" + status + "x"
		require.NoError(t, repo.Create(ctx, Account{ID: id, Username: id, Email: id + "@e.test", Status: status}))
		deleted, err := repo.DeletePending(ctx, id)
		require.NoError(t, err)
		require.False(t, deleted, "status %q must not be deletable by the pending sweep", status)
		_, err = repo.GetByID(ctx, id)
		require.NoError(t, err, "status %q account must survive", status)
	}

	// A missing account is a clean no-op, never an error.
	deleted, err := repo.DeletePending(ctx, "ghost")
	require.NoError(t, err)
	require.False(t, deleted)
}

// TestSweepExpiredPending covers the periodic reaper: it deletes ONLY pending
// accounts older than the cutoff and leaves recent-pending / any-approved
// accounts exactly as it found them.
func TestSweepExpiredPending(t *testing.T) {
	repo, _ := newPendingRepo(t)
	ctx := context.Background()
	mk := func(id, status string, created time.Time) {
		require.NoError(t, repo.Create(ctx, Account{
			ID: id, Username: id, Email: id + "@e.test", Status: status, CreatedAt: created,
		}))
	}
	old := time.Now().Add(-30 * 24 * time.Hour)
	recent := time.Now().Add(-1 * time.Hour)
	mk("oldpend", StatusPending, old)    // expired pending  -> deleted
	mk("newpend", StatusPending, recent) // fresh pending    -> kept
	mk("oldappr", StatusApproved, old)   // old but approved -> kept
	mk("olddeny", StatusDenied, old)     // old but denied   -> kept

	cutoff := time.Now().Add(-14 * 24 * time.Hour)
	n, err := repo.SweepExpiredPending(ctx, cutoff)
	require.NoError(t, err)
	require.Equal(t, 1, n)

	_, err = repo.GetByID(ctx, "oldpend")
	require.ErrorIs(t, err, ErrNotFound, "the expired pending account must be reaped")
	for _, id := range []string{"newpend", "oldappr", "olddeny"} {
		_, err := repo.GetByID(ctx, id)
		require.NoError(t, err, "%s must survive the sweep", id)
	}
}
