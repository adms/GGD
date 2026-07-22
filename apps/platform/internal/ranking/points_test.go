package ranking_test

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// TestPointsAwardAndFloor walks the contract's placement table on a live board
// and proves cumulative points never go negative.
func TestPointsAwardAndFloor(t *testing.T) {
	testkit.Cover(t, "rank-points-award-floor")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	a := ts.Register("alice")

	// place 1 → +100, place 2 → +40, place 3 → −10, place 4 → −30, cumulative.
	for _, tc := range []struct{ place, want int }{{1, 100}, {2, 140}, {3, 130}, {4, 100}} {
		aw, err := svc.AwardPlacement(ctx, a.ID, "sela", tc.place)
		require.NoError(t, err)
		require.Equal(t, tc.want, aw.Points, "place %d", tc.place)
		require.Equal(t, tc.want, aw.ChampionPoints, "champion track moves with the player track")
	}

	// The account record is the durable truth for both tracks.
	acc, err := ts.Srv.Accounts.GetByID(ctx, a.ID)
	require.NoError(t, err)
	require.Equal(t, 100, acc.SeasonPoints)
	require.Equal(t, 100, acc.ChampionPoints["sela"])

	// Four more last places floor the score at 0 instead of going negative.
	for i := 0; i < 4; i++ {
		_, err := svc.AwardPlacement(ctx, a.ID, "sela", 4)
		require.NoError(t, err)
	}
	me, found, err := svc.PlayerMe(ctx, "", a.ID)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, 0, me.Points, "cumulative points floor at 0")
	require.Equal(t, ranking.TierIron, me.Tier)

	acc, err = ts.Srv.Accounts.GetByID(ctx, a.ID)
	require.NoError(t, err)
	require.Equal(t, 0, acc.SeasonPoints)
	require.Equal(t, 0, acc.ChampionPoints["sela"], "champion track floors at 0 too")
}

// TestPointsBothBoards proves ONE award credits both the player total and the
// (account, champion) track, and that per-champion tracks stay independent.
func TestPointsBothBoards(t *testing.T) {
	testkit.Cover(t, "rank-points-both-boards")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	a, b := ts.Register("alice"), ts.Register("bob")

	// alice: two matches on sela (1st, 2nd) then one on thorne (1st).
	for _, place := range []int{1, 2} {
		_, err := svc.AwardPlacement(ctx, a.ID, "sela", place)
		require.NoError(t, err)
	}
	_, err := svc.AwardPlacement(ctx, a.ID, "thorne", 1)
	require.NoError(t, err)
	// bob: one match on sela (1st).
	_, err = svc.AwardPlacement(ctx, b.ID, "sela", 1)
	require.NoError(t, err)

	rows, total, err := svc.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, a.ID, rows[0].AccountID)
	require.Equal(t, 240, rows[0].Points, "100+40+100 accumulates across matches AND champions")
	require.Equal(t, "alice", rows[0].Username)
	require.Equal(t, 100, rows[1].Points)

	// The sela board carries only sela points; alice leads bob 140 to 100.
	sela, total, err := svc.ChampionPage(ctx, "sela", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, a.ID, sela[0].AccountID)
	require.Equal(t, 140, sela[0].Points)
	require.Equal(t, b.ID, sela[1].AccountID)
	require.Equal(t, 100, sela[1].Points)

	// thorne is its own independent track (alice only).
	thorne, total, err := svc.ChampionPage(ctx, "thorne", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, 100, thorne[0].Points)

	// Per-champion standings of one caller.
	mine, err := svc.MyChampions(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, mine, 2)
	require.Equal(t, "sela", mine[0].ChampionID)
	require.Equal(t, 140, mine[0].Points)
	require.Equal(t, 1, mine[0].Rank)
	require.Equal(t, "thorne", mine[1].ChampionID)
	require.Equal(t, 100, mine[1].Points)
	require.Equal(t, ranking.TierIron, mine[1].Tier)
}

// TestPointsSnapshotAndRebuild is the durability regression: snapshots land on
// disk, a cold Redis rehydrates from them, and a full wipe + boot rebuild
// recovers both board families from account JSON alone.
func TestPointsSnapshotAndRebuild(t *testing.T) {
	testkit.Cover(t, "rank-points-snapshot-rebuild")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	a, b := ts.Register("alice"), ts.Register("bob")
	// Ranked accounts (games>0) so the boot rebuild picks them up.
	require.NoError(t, ts.Srv.Accounts.SetRating(ctx, a.ID, 1400, 12, 7))
	require.NoError(t, ts.Srv.Accounts.SetRating(ctx, b.ID, 1100, 11, 2))
	for i := 0; i < 3; i++ {
		_, err := svc.AwardPlacement(ctx, a.ID, "sela", 1)
		require.NoError(t, err)
	}
	_, err := svc.AwardPlacement(ctx, b.ID, "thorne", 2)
	require.NoError(t, err)

	// Snapshots land at data/rankings/<season>/…
	require.NoError(t, svc.SnapshotNow(ctx))
	root := filepath.Join(ts.Cfg.DataDir, "rankings", "s1")
	for _, rel := range []string{
		"player-snapshot.json", "meta.json",
		filepath.Join("champions", "sela.json"), filepath.Join("champions", "thorne.json"),
	} {
		_, err := os.Stat(filepath.Join(root, rel))
		require.NoError(t, err, "missing durable snapshot %s", rel)
	}

	// Redis goes cold → the boards still serve, rehydrated from the snapshots.
	ts.Mini.FlushAll()
	rows, total, err := svc.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total, "player board rebuilt from its snapshot")
	require.Equal(t, a.ID, rows[0].AccountID)
	require.Equal(t, 300, rows[0].Points)
	sela, _, err := svc.ChampionPage(ctx, "sela", 20, 0)
	require.NoError(t, err)
	require.Len(t, sela, 1)
	require.Equal(t, 300, sela[0].Points, "champion board rebuilt from its snapshot")

	// Full wipe INCLUDING the snapshots: account JSON is the truth, and the
	// boot rebuild restores both board families from it.
	ts.Mini.FlushAll()
	require.NoError(t, os.RemoveAll(root))
	require.NoError(t, ts.Srv.Boot(ctx))
	rows, total, err = svc.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 2, total, "player board rebuilt from account JSON")
	require.Equal(t, 300, rows[0].Points)
	require.Equal(t, 40, rows[1].Points)
	thorne, _, err := svc.ChampionPage(ctx, "thorne", 20, 0)
	require.NoError(t, err)
	require.Len(t, thorne, 1)
	require.Equal(t, b.ID, thorne[0].AccountID)
	require.Equal(t, 40, thorne[0].Points, "champion board rebuilt from account JSON")
}

// TestApexOnLiveBoard runs the cached top-of-board apex pass against a real
// ladder: the top 10% is 菁英, the next 10% 宗師, and an apex-ineligible account
// (< minApexGames) at the very top is skipped so its place passes down.
func TestApexOnLiveBoard(t *testing.T) {
	testkit.Cover(t, "rank-apex-board")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking

	// Ten seasoned accounts, descending points → 1 Challenger + 1 Grandmaster.
	ids := make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		u := ts.Register(fmt.Sprintf("player%02d", i))
		require.NoError(t, ts.Srv.Accounts.SetRating(ctx, u.ID, 1000, 10+i, 5))
		require.NoError(t, svc.AddPoints(ctx, u.ID, 1000-10*i))
		ids = append(ids, u.ID)
	}
	me, found, err := svc.PlayerMe(ctx, "", ids[0])
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, ranking.TierChallenger, me.Tier, "top 10% is 菁英")
	require.Empty(t, me.Division, "apex carries no division")
	require.Equal(t, 1, me.Rank)
	require.InDelta(t, 100, me.Percentile, 0.001)

	me, _, err = svc.PlayerMe(ctx, "", ids[1])
	require.NoError(t, err)
	require.Equal(t, ranking.TierGrandmaster, me.Tier, "next 10% is 宗師")
	me, _, err = svc.PlayerMe(ctx, "", ids[2])
	require.NoError(t, err)
	require.Equal(t, ranking.TierSilver, me.Tier, "below the apex bands: points decide (980 → 銀)")
	require.Equal(t, "III", me.Division)

	// A brand-new account tops the board by points but has only 2 games: it is
	// skipped and the 菁英 place passes down to the best eligible account.
	smurf := ts.Register("smurf")
	require.NoError(t, ts.Srv.Accounts.SetRating(ctx, smurf.ID, 1000, 2, 2))
	require.NoError(t, svc.AddPoints(ctx, smurf.ID, 5000))

	rows, total, err := svc.PlayerPage(ctx, "", 20, 0)
	require.NoError(t, err)
	require.EqualValues(t, 11, total)
	require.Equal(t, smurf.ID, rows[0].AccountID)
	require.Equal(t, ranking.TierMaster, rows[0].Tier, "ineligible for apex, but 5000 points is 大師")
	// 11 ranked accounts → ceil(11×0.10) = 2 菁英 places and 2 宗師 places; the
	// ineligible smurf holds none of them, so they pass down the board.
	require.Equal(t, ids[0], rows[1].AccountID)
	require.Equal(t, ranking.TierChallenger, rows[1].Tier, "the apex place passes to the next eligible account")
	require.Equal(t, ids[1], rows[2].AccountID)
	require.Equal(t, ranking.TierChallenger, rows[2].Tier)
	require.Equal(t, ids[2], rows[3].AccountID)
	require.Equal(t, ranking.TierGrandmaster, rows[3].Tier)
	require.Equal(t, ids[4], rows[5].AccountID)
	require.Equal(t, ranking.TierSilver, rows[5].Tier, "below the apex bands the points thresholds decide")
}

// TestRankingEndpoints pins the JSON shape of the four visible-board endpoints
// (and proves the hidden MMR endpoints still answer unchanged).
func TestRankingEndpoints(t *testing.T) {
	testkit.Cover(t, "rank-endpoints")
	ts := testutil.New(t)
	ctx := context.Background()
	svc := ts.Srv.Ranking
	a, b := ts.Register("alice"), ts.Register("bob")
	require.NoError(t, ts.Srv.Accounts.SetRating(ctx, a.ID, 1400, 12, 7))
	_, err := svc.AwardPlacement(ctx, a.ID, "sela", 1)
	require.NoError(t, err)
	_, err = svc.AwardPlacement(ctx, b.ID, "sela", 2)
	require.NoError(t, err)
	require.NoError(t, svc.Add(ctx, a.ID, 1400)) // hidden MMR ladder

	// 1. Public player board.
	r := ts.Do(http.MethodGet, "/api/v1/ranking/player?limit=10&offset=0", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, "s1", r.Body["season"])
	require.EqualValues(t, 2, r.Body["total"])
	entries := r.Body["entries"].([]any)
	require.Len(t, entries, 2)
	top := entries[0].(map[string]any)
	require.EqualValues(t, 1, top["rank"])
	require.Equal(t, a.ID, top["accountId"])
	require.Equal(t, "alice", top["username"])
	require.EqualValues(t, 100, top["points"])
	require.Equal(t, ranking.TierChallenger, top["tier"], "top 10% of a 2-account ladder")
	require.Equal(t, "", top["division"])
	second := entries[1].(map[string]any)
	require.Equal(t, ranking.TierIron, second["tier"], "40 points, apex-ineligible → 鐵")
	require.Equal(t, "IV", second["division"])

	// 2. Caller's own standing (authed).
	r = ts.Do(http.MethodGet, "/api/v1/ranking/player/me", a.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, true, r.Body["ranked"])
	require.EqualValues(t, 100, r.Body["points"])
	require.Equal(t, ranking.TierChallenger, r.Body["tier"])
	require.EqualValues(t, 1, r.Body["rank"])
	require.EqualValues(t, 100, r.Body["percentile"])
	require.Equal(t, http.StatusUnauthorized, ts.Do(http.MethodGet, "/api/v1/ranking/player/me", "", nil).Status)

	// 3. Public champion board.
	r = ts.Do(http.MethodGet, "/api/v1/ranking/champion/sela?limit=10", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Equal(t, "sela", r.Body["championId"])
	require.EqualValues(t, 2, r.Body["total"])
	champRows := r.Body["entries"].([]any)
	require.Equal(t, a.ID, champRows[0].(map[string]any)["accountId"])
	require.EqualValues(t, 100, champRows[0].(map[string]any)["points"])
	// An unplayed champion answers with an empty board, not an error.
	r = ts.Do(http.MethodGet, "/api/v1/ranking/champion/nobody", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Empty(t, r.Body["entries"].([]any))

	// 4. Caller's per-champion standings (authed).
	r = ts.Do(http.MethodGet, "/api/v1/ranking/me/champions", a.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	champs := r.Body["champions"].([]any)
	require.Len(t, champs, 1)
	row := champs[0].(map[string]any)
	require.Equal(t, "sela", row["championId"])
	require.EqualValues(t, 100, row["points"])
	require.EqualValues(t, 1, row["rank"])
	require.NotEmpty(t, row["tier"])
	require.Equal(t, http.StatusUnauthorized, ts.Do(http.MethodGet, "/api/v1/ranking/me/champions", "", nil).Status)

	// The hidden MMR endpoints are untouched by the visible ladder.
	r = ts.Do(http.MethodGet, "/api/v1/ranking/leaderboard?page=1", "", nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.Len(t, r.Body["entries"].([]any), 1)
	require.EqualValues(t, 1400, r.Body["entries"].([]any)[0].(map[string]any)["mmr"])
	r = ts.Do(http.MethodGet, "/api/v1/ranking/me", a.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	require.EqualValues(t, 1400, r.Body["mmr"])
}
