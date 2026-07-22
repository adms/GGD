package ranking_test

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

func TestZSetRank(t *testing.T) {
	testkit.Cover(t, "rank-zset-rank")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	a, b, c := ts.Register("alice"), ts.Register("bob"), ts.Register("carol")

	require.NoError(t, svc.Add(ctx, a.ID, 1100))
	require.NoError(t, svc.Add(ctx, b.ID, 1300))
	require.NoError(t, svc.Add(ctx, c.ID, 1200))

	rank, mmr, found, err := svc.Me(ctx, b.ID)
	require.NoError(t, err)
	require.True(t, found)
	require.EqualValues(t, 0, rank, "highest MMR is rank 0 (ZREVRANK)")
	require.Equal(t, 1300, mmr)

	rank, _, _, err = svc.Me(ctx, a.ID)
	require.NoError(t, err)
	require.EqualValues(t, 2, rank)

	// ZADD upsert moves the rank.
	require.NoError(t, svc.Add(ctx, a.ID, 1400))
	rank, mmr, _, err = svc.Me(ctx, a.ID)
	require.NoError(t, err)
	require.EqualValues(t, 0, rank)
	require.Equal(t, 1400, mmr)

	// Unranked accounts report found=false.
	d := ts.Register("dave")
	_, _, found, err = svc.Me(ctx, d.ID)
	require.NoError(t, err)
	require.False(t, found)
}

func TestPageWithTies(t *testing.T) {
	testkit.Cover(t, "rank-page-ties")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking

	// alice registered before bob → alice has the smaller (older) ULID.
	a, b, c := ts.Register("alice"), ts.Register("bob"), ts.Register("carol")
	require.NoError(t, svc.Add(ctx, a.ID, 1200))
	require.NoError(t, svc.Add(ctx, b.ID, 1200)) // tie with alice
	require.NoError(t, svc.Add(ctx, c.ID, 1500))

	entries, total, err := svc.Page(ctx, 1, 10)
	require.NoError(t, err)
	require.EqualValues(t, 3, total)
	require.Len(t, entries, 3)
	require.Equal(t, c.ID, entries[0].AccountID)
	// Deterministic tie-break: same MMR ordered by ULID descending (matches
	// ZREVRANGE's member ordering, so pages never overlap or skip).
	require.Equal(t, b.ID, entries[1].AccountID, "newer ULID wins the tie deterministically")
	require.Equal(t, a.ID, entries[2].AccountID)
	require.Equal(t, 2, entries[1].Rank)
	require.Equal(t, 3, entries[2].Rank)
	require.Equal(t, "bob", entries[1].Username, "entries carry usernames")

	// Pagination slices consistently with the full-page order.
	page2, _, err := svc.Page(ctx, 2, 2)
	require.NoError(t, err)
	require.Len(t, page2, 1)
	require.Equal(t, a.ID, page2[0].AccountID)
}

func TestAroundMe(t *testing.T) {
	testkit.Cover(t, "rank-around-me")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking

	var ids []string
	for i := 0; i < 9; i++ {
		u := ts.Register("player" + string(rune('a'+i)))
		require.NoError(t, svc.Add(ctx, u.ID, 1000+100*i))
		ids = append(ids, u.ID)
	}
	// Middle player (mmr 1400 → rank 4 of 0..8).
	me := ids[4]
	around, err := svc.AroundMe(ctx, me, 2)
	require.NoError(t, err)
	require.Len(t, around, 5, "rank±2 window")
	require.Equal(t, ids[6], around[0].AccountID) // 1600
	require.Equal(t, me, around[2].AccountID)     // centered
	require.Equal(t, ids[2], around[4].AccountID) // 1200
	require.Equal(t, 3, around[0].Rank)
	require.Equal(t, 5, around[2].Rank)
}

func TestSnapshotFallback(t *testing.T) {
	testkit.Cover(t, "rank-snapshot-fallback")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	a, b := ts.Register("alice"), ts.Register("bob")
	require.NoError(t, svc.Add(ctx, a.ID, 1234))
	require.NoError(t, svc.Add(ctx, b.ID, 1111))

	// Snapshot lands on disk.
	require.NoError(t, svc.SnapshotNow(ctx))
	_, err := os.Stat(filepath.Join(ts.Cfg.DataDir, "rankings", "s1", "snapshot.json"))
	require.NoError(t, err)

	// Redis goes cold → the ladder still serves from the snapshot.
	ts.Mini.FlushAll()
	entries, total, err := svc.Page(ctx, 1, 10)
	require.NoError(t, err)
	require.EqualValues(t, 2, total, "snapshot fallback must rehydrate the ladder")
	require.Equal(t, a.ID, entries[0].AccountID)
	require.Equal(t, 1234, entries[0].MMR)

	// And the leaderboard endpoint agrees.
	r := ts.Do(http.MethodGet, "/api/v1/ranking/leaderboard?page=1", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Len(t, r.Body["entries"].([]any), 2)
}

func TestSeasonRollover(t *testing.T) {
	testkit.Cover(t, "rank-season-rollover")
	ts := testutil.New(t)
	ctx := context.Background()
	a := ts.Register("alice")

	s1 := ts.Srv.Ranking // season "s1"
	require.NoError(t, s1.Add(ctx, a.ID, 1500))

	// A new season starts a fresh ZSET: no carry-over.
	s2 := ranking.New(ts.Srv.Rdb, ts.Srv.Store, ts.Srv.Accounts, "s2")
	entries, total, err := s2.Page(ctx, 1, 10)
	require.NoError(t, err)
	require.EqualValues(t, 0, total, "fresh season starts empty")
	require.Empty(t, entries)

	// Season keys are independent in both directions.
	require.NoError(t, s2.Add(ctx, a.ID, 1000))
	_, mmr1, _, err := s1.Me(ctx, a.ID)
	require.NoError(t, err)
	require.Equal(t, 1500, mmr1, "s1 untouched by s2 writes")
	require.True(t, ts.Mini.Exists("lb:s1:pairedduels"))
	require.True(t, ts.Mini.Exists("lb:s2:pairedduels"))
}

// TestRebuildFromJSON is the JSON-is-truth regression: wipe Redis entirely,
// run the boot rebuild, and the ladder + uniqueness indexes come back from
// account JSON alone.
func TestRebuildFromJSON(t *testing.T) {
	testkit.Cover(t, "rank-rebuild-from-json")
	ts := testutil.New(t)
	ctx := context.Background()
	a, b := ts.Register("alice"), ts.Register("bob")

	// Durable truth: account JSON carries the authoritative MMR (games>0 ⇒ ranked).
	require.NoError(t, ts.Srv.Accounts.SetRating(ctx, a.ID, 1420, 12, 7))
	require.NoError(t, ts.Srv.Accounts.SetRating(ctx, b.ID, 1180, 9, 3))

	// Redis is wiped — leaderboard, uniqueness indexes, everything.
	ts.Mini.FlushAll()
	require.False(t, ts.Mini.Exists("lb:s1:pairedduels"))

	// Boot rebuild restores the hot layer from data/ JSON.
	require.NoError(t, ts.Srv.Boot(ctx))

	entries, total, err := ts.Srv.Ranking.Page(ctx, 1, 10)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, a.ID, entries[0].AccountID)
	require.Equal(t, 1420, entries[0].MMR)
	require.Equal(t, b.ID, entries[1].AccountID)

	// Uniqueness indexes are back too: re-registering the same name conflicts.
	r := ts.Do(http.MethodPost, "/api/v1/auth/register", "", map[string]string{
		"username": "alice", "email": "elsewhere@example.com", "password": "longenough1",
	})
	require.Equal(t, http.StatusConflict, r.Status, "idx:username must be rebuilt")
}
