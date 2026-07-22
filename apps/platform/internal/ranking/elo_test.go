package ranking_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/pkg/testkit"
)

func TestEloBasic(t *testing.T) {
	testkit.Cover(t, "rank-elo-basic")
	newMMR := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{{AccountID: "w", MMR: 1000, Games: 0}}},
		{Team: 1, Place: 2, Players: []ranking.PlayerRating{{AccountID: "l", MMR: 1000, Games: 0}}},
	})
	require.Greater(t, newMMR["w"], 1000, "winner gains")
	require.Less(t, newMMR["l"], 1000, "loser loses")
	// Equal ratings, equal K: symmetric ±16 and zero-sum.
	require.Equal(t, 1016, newMMR["w"])
	require.Equal(t, 984, newMMR["l"])
	require.Equal(t, 2000, newMMR["w"]+newMMR["l"], "same-K Elo is zero-sum")

	// Upset: a big underdog gains much more than 16.
	upset := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{{AccountID: "david", MMR: 800, Games: 0}}},
		{Team: 1, Place: 2, Players: []ranking.PlayerRating{{AccountID: "goliath", MMR: 1400, Games: 0}}},
	})
	require.Greater(t, upset["david"]-800, 25, "underdog wins big")
	require.Less(t, upset["goliath"], 1400)
}

func TestEloProvisionalK(t *testing.T) {
	testkit.Cover(t, "rank-elo-provisional")
	require.Equal(t, 32.0, ranking.KFor(0))
	require.Equal(t, 32.0, ranking.KFor(29))
	require.Equal(t, 24.0, ranking.KFor(30))
	require.Equal(t, 24.0, ranking.KFor(500))

	// Same matchup, but the settled winner moves less than a provisional one.
	prov := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{{AccountID: "w", MMR: 1000, Games: 0}}},
		{Team: 1, Place: 2, Players: []ranking.PlayerRating{{AccountID: "l", MMR: 1000, Games: 0}}},
	})
	settled := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{{AccountID: "w", MMR: 1000, Games: 100}}},
		{Team: 1, Place: 2, Players: []ranking.PlayerRating{{AccountID: "l", MMR: 1000, Games: 0}}},
	})
	require.Equal(t, 1016, prov["w"], "provisional K=32 → +16")
	require.Equal(t, 1012, settled["w"], "settled K=24 → +12")
}

func TestEloTeamAvgVsAvg(t *testing.T) {
	testkit.Cover(t, "rank-elo-team")
	// Mixed-rating team: both players share the team delta (avg-vs-avg is
	// applied per player), regardless of personal MMR.
	out := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{
			{AccountID: "high", MMR: 1200, Games: 0},
			{AccountID: "low", MMR: 800, Games: 0},
		}},
		{Team: 1, Place: 2, Players: []ranking.PlayerRating{
			{AccountID: "m1", MMR: 1000, Games: 0},
			{AccountID: "m2", MMR: 1000, Games: 0},
		}},
	})
	deltaHigh := out["high"] - 1200
	deltaLow := out["low"] - 800
	require.Equal(t, deltaHigh, deltaLow, "same team + same K → same delta from team avg")
	require.Greater(t, deltaHigh, 0)
	// Team averages were equal (1000 vs 1000) → symmetric ±16.
	require.Equal(t, 16, deltaHigh)

	// Four teams with places 1..4: better place ⇒ strictly better delta.
	four := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{{AccountID: "p1", MMR: 1000}}},
		{Team: 1, Place: 2, Players: []ranking.PlayerRating{{AccountID: "p2", MMR: 1000}}},
		{Team: 2, Place: 3, Players: []ranking.PlayerRating{{AccountID: "p3", MMR: 1000}}},
		{Team: 3, Place: 4, Players: []ranking.PlayerRating{{AccountID: "p4", MMR: 1000}}},
	})
	require.Greater(t, four["p1"], four["p2"])
	require.Greater(t, four["p2"], four["p3"])
	require.Greater(t, four["p3"], four["p4"])
	sum := four["p1"] + four["p2"] + four["p3"] + four["p4"]
	require.InDelta(t, 4000, sum, 2, "multi-team Elo stays zero-sum-ish")

	// Bot-only teams carry no players and never affect ratings.
	withBots := ranking.ComputeElo([]ranking.TeamResult{
		{Team: 0, Place: 1, Players: []ranking.PlayerRating{{AccountID: "solo", MMR: 1000}}},
		{Team: 1, Place: 2, Players: nil}, // bots
		{Team: 2, Place: 3, Players: []ranking.PlayerRating{{AccountID: "other", MMR: 1000}}},
		{Team: 3, Place: 4, Players: nil}, // bots
	})
	require.Len(t, withBots, 2)
	require.Greater(t, withBots["solo"], 1000)
}
