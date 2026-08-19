package ranking_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/pkg/testkit"
)

// TestTierBoundaries walks every threshold edge in the contract table: the last
// point of one tier and the first point of the next must land on the right
// tier/division.
func TestTierBoundaries(t *testing.T) {
	testkit.Cover(t, "rank-tier-boundaries")
	c := ranking.DefaultLadderConfig()

	cases := []struct {
		points   int
		tier     string
		division string
	}{
		// ⛔ 0 分沒有位階（GH#352，owner:「這是底線」）。空字串 = 未定級。
		{0, "", ""},
		{1, ranking.TierIron, "IV"},
		{399, ranking.TierIron, "I"},
		{400, ranking.TierBronze, "IV"},
		{799, ranking.TierBronze, "I"},
		{800, ranking.TierSilver, "IV"},
		{1299, ranking.TierSilver, "I"},
		{1300, ranking.TierGold, "IV"},
		{1899, ranking.TierGold, "I"},
		{1900, ranking.TierEmerald, "IV"},
		{2599, ranking.TierEmerald, "I"},
		{2600, ranking.TierDiamond, "IV"},
		{3499, ranking.TierDiamond, "I"},
		{3500, ranking.TierMaster, ""}, // apex floor: base tier is Master, no division
	}
	for _, tc := range cases {
		tier, div := c.BaseTier(tc.points)
		require.Equal(t, tc.tier, tier, "points=%d tier", tc.points)
		require.Equal(t, tc.division, div, "points=%d division", tc.points)
	}
}

// TestDivisionBands checks the four equal division bands inside a few tiers,
// including the lowest-quarter (IV) and highest-quarter (I) edges.
func TestDivisionBands(t *testing.T) {
	testkit.Cover(t, "rank-division-bands")
	c := ranking.DefaultLadderConfig()

	// Iron [0,400): bands at 0,100,200,300.
	iron := []struct {
		points   int
		division string
		// ⛔ 0 不在這張表裡：GH#352 之後它是「未定級」，不是鐵 IV。鐵段從 1 分開始。
	}{{1, "IV"}, {99, "IV"}, {100, "III"}, {199, "III"}, {200, "II"}, {299, "II"}, {300, "I"}, {399, "I"}}
	for _, tc := range iron {
		tier, div := c.BaseTier(tc.points)
		require.Equal(t, ranking.TierIron, tier)
		require.Equal(t, tc.division, div, "iron points=%d", tc.points)
	}

	// Silver [800,1300): width 500 → bands at 800,925,1050,1175.
	silver := []struct {
		points   int
		division string
	}{{800, "IV"}, {924, "IV"}, {925, "III"}, {1049, "III"}, {1050, "II"}, {1174, "II"}, {1175, "I"}, {1299, "I"}}
	for _, tc := range silver {
		tier, div := c.BaseTier(tc.points)
		require.Equal(t, ranking.TierSilver, tier)
		require.Equal(t, tc.division, div, "silver points=%d", tc.points)
	}
}

// board builds `n` apex candidates in board order (points descending), all with
// `games` settled matches.
func board(n, games int) []ranking.ApexCandidate {
	rows := make([]ranking.ApexCandidate, 0, n)
	for i := 0; i < n; i++ {
		rows = append(rows, ranking.ApexCandidate{
			AccountID: fmt.Sprintf("acct-%04d", i), Points: 10_000 - i, Games: games,
		})
	}
	return rows
}

// TestApexByPopulationFraction verifies apex is assigned by POPULATION FRACTION
// over the whole ranked ladder — the top 10% are Challenger, the next 10%
// Grandmaster — so on a 2000-account ladder the 201st place is Grandmaster, not
// Challenger, and the 401st holds no apex tier at all.
func TestApexByPopulationFraction(t *testing.T) {
	testkit.Cover(t, "rank-apex-fraction")
	c := ranking.DefaultLadderConfig() // challengerFrac=0.10, grandmasterFrac=0.10

	challenger, grandmaster := c.ApexCounts(2000)
	require.Equal(t, 200, challenger, "top 10% of 2000")
	require.Equal(t, 200, grandmaster, "next 10% of 2000")

	rows := board(2000, 10)
	apex := c.AssignApex(rows, 2000)
	require.Len(t, apex, 400, "20% of the ladder is apex")
	require.Equal(t, ranking.TierChallenger, apex[rows[0].AccountID], "rank 1 = Challenger")
	require.Equal(t, ranking.TierChallenger, apex[rows[199].AccountID], "200th place = Challenger")
	require.Equal(t, ranking.TierGrandmaster, apex[rows[200].AccountID], "201st place = Grandmaster, not Challenger")
	require.Equal(t, ranking.TierGrandmaster, apex[rows[399].AccountID], "400th place = Grandmaster")
	require.Empty(t, apex[rows[400].AccountID], "401st place holds no apex tier")

	// Resolve combines points with the apex pass: apex wins and carries no
	// division; below it the points thresholds decide, which is how 大師 Master
	// is reached (>=3500 points, no apex place).
	tier, div := c.Resolve(4000, apex[rows[200].AccountID])
	require.Equal(t, ranking.TierGrandmaster, tier)
	require.Empty(t, div, "apex tiers carry no division")
	tier, _ = c.Resolve(4000, apex[rows[0].AccountID])
	require.Equal(t, ranking.TierChallenger, tier)
	tier, div = c.Resolve(4000, apex[rows[400].AccountID])
	require.Equal(t, ranking.TierMaster, tier, ">=3500 outside the apex 20% stays Master")
	require.Empty(t, div)
	// A sub-Master score keeps its divisioned tier when it holds no apex place
	// (Diamond spans [2600,3500) → 225-point bands, so 3000 is 鑽石 III).
	tier, div = c.Resolve(3000, "")
	require.Equal(t, ranking.TierDiamond, tier)
	require.Equal(t, "III", div)
}

// TestApexSmallLadder is the user directive: the player base is small, so the
// fractions round UP and apex always populates instead of sitting empty like a
// fixed 200/500-slot ladder would.
func TestApexSmallLadder(t *testing.T) {
	testkit.Cover(t, "rank-apex-small-ladder")
	c := ranking.DefaultLadderConfig()

	challenger, grandmaster := c.ApexCounts(4)
	require.Equal(t, 1, challenger, "a 4-account ladder still crowns one 菁英")
	require.Equal(t, 1, grandmaster)

	rows := board(4, 10)
	apex := c.AssignApex(rows, 4)
	require.Equal(t, ranking.TierChallenger, apex[rows[0].AccountID])
	require.Equal(t, ranking.TierGrandmaster, apex[rows[1].AccountID])
	require.Empty(t, apex[rows[2].AccountID])

	// Apex is NOT gated behind the Master floor: a small ladder's best player
	// is 菁英 on a Bronze-sized score.
	tier, div := c.Resolve(500, apex[rows[0].AccountID])
	require.Equal(t, ranking.TierChallenger, tier)
	require.Empty(t, div)

	// One-account ladder: Challenger only, no room for Grandmaster.
	challenger, grandmaster = c.ApexCounts(1)
	require.Equal(t, 1, challenger)
	require.Equal(t, 0, grandmaster)
	// Empty ladder: no apex at all.
	challenger, grandmaster = c.ApexCounts(0)
	require.Zero(t, challenger)
	require.Zero(t, grandmaster)
}

// TestApexMinGames proves a brand-new account cannot instantly be 菁英: it is
// skipped by the apex pass and its place passes down to the next eligible
// account, while its points-derived tier is untouched.
func TestApexMinGames(t *testing.T) {
	testkit.Cover(t, "rank-apex-min-games")
	c := ranking.DefaultLadderConfig() // minApexGames=10
	require.Equal(t, 10, c.MinApexGames)

	rows := board(10, 10)
	rows[0].Games = 9 // one match short of eligible
	rows[1].Games = 0 // brand-new smurf at the top of the board

	apex := c.AssignApex(rows, 10)
	require.Empty(t, apex[rows[0].AccountID], "9 games is not apex-eligible")
	require.Empty(t, apex[rows[1].AccountID], "0 games is not apex-eligible")
	require.Equal(t, ranking.TierChallenger, apex[rows[2].AccountID], "the place passes down")
	require.Equal(t, ranking.TierGrandmaster, apex[rows[3].AccountID])
	require.Len(t, apex, 2, "10-account ladder: 1 Challenger + 1 Grandmaster")

	// The ineligible leader still shows its points tier.
	tier, div := c.Resolve(4000, apex[rows[0].AccountID])
	require.Equal(t, ranking.TierMaster, tier)
	require.Empty(t, div)

	// The gate is configurable.
	c.MinApexGames = 0
	apex = c.AssignApex(rows, 10)
	require.Equal(t, ranking.TierChallenger, apex[rows[0].AccountID])
}

// TestApexFractionsConfigurable proves the fractions drive the cutoffs.
func TestApexFractionsConfigurable(t *testing.T) {
	testkit.Cover(t, "rank-apex-configurable")
	c := ranking.DefaultLadderConfig()
	c.ChallengerFrac = 0.02
	c.GrandmasterFrac = 0.05

	challenger, grandmaster := c.ApexCounts(100)
	require.Equal(t, 2, challenger)
	require.Equal(t, 5, grandmaster)

	rows := board(100, 10)
	apex := c.AssignApex(rows, 100)
	require.Len(t, apex, 7)
	require.Equal(t, ranking.TierChallenger, apex[rows[1].AccountID])
	require.Equal(t, ranking.TierGrandmaster, apex[rows[2].AccountID])
	require.Equal(t, ranking.TierGrandmaster, apex[rows[6].AccountID])
	require.Empty(t, apex[rows[7].AccountID])

	// Zero fractions disable a band entirely.
	c.ChallengerFrac = 0
	challenger, _ = c.ApexCounts(100)
	require.Zero(t, challenger)
}

// TestApexGatesAreConfigurable is GH#352's guard: the two thresholds that decide
// whether a nearly-empty board may crown 菁英/宗師 are CONFIGURATION, not
// constants buried in Go.
//
// ⛔ 沒有一條斷言抄出貨的門檻值（第二守則：守衛驗機制不驗數字）。每一個門檻都是
// 從**這個夾具自己的榜**推出來的，所以 owner 之後把哪一格調到哪裡，這條都不會紅。
func TestApexGatesAreConfigurable(t *testing.T) {
	testkit.Cover(t, "rank-apex-gates")
	rows := board(6, 100) // 場數遠超 MinApexGames：這條測的不是那個閘
	total := len(rows)

	// ① 最低分數閘：把門檻拉到「第二名的分數 + 1」，第二名就掉出 apex，
	//    位置往下傳。⛔ 這裡不寫死分數，用榜上的數字算。
	c := ranking.DefaultLadderConfig()
	c.MinApexPoints = rows[1].Points + 1
	apex := c.AssignApex(rows, total)
	require.Equal(t, ranking.TierChallenger, apex[rows[0].AccountID], "分數夠的第一名照樣是菁英")
	require.Empty(t, apex[rows[1].AccountID], "分數不到門檻就不進 apex")

	// ⭐ 而這一格只能**收緊**：owner 2026-08-17「沒分數不應該有位階，這是底線」。
	//    把它調成 0（或負的）不可以把 0 分放回 apex。
	c = ranking.DefaultLadderConfig()
	c.MinApexPoints = 0
	zeroed := board(2, 100)
	for i := range zeroed {
		zeroed[i].Points = 0
	}
	require.Empty(t, c.AssignApex(zeroed, len(zeroed)), "0 分的榜一個 apex 都不發，⛔ 不管門檻被調成什麼")

	// ② 最少人數閘：榜比門檻小 → 一個位置都不發（連掃都不用掃）。
	c = ranking.DefaultLadderConfig()
	c.MinApexLadder = total + 1
	challenger, grandmaster := c.ApexCounts(total)
	require.Zero(t, challenger)
	require.Zero(t, grandmaster)
	require.Empty(t, c.AssignApex(rows, total), "人數不到門檻的榜不發 apex")

	// 榜長到門檻上，同一張榜就恢復原本的分配 —— 證明擋住它的是人數，不是別的。
	c.MinApexLadder = total
	require.Equal(t, ranking.TierChallenger, c.AssignApex(rows, total)[rows[0].AccountID])
}

// TestPointsFloor: scores never go negative; a below-zero input reads as Iron IV.
func TestPointsFloor(t *testing.T) {
	testkit.Cover(t, "rank-points-floor")
	c := ranking.DefaultLadderConfig()
	require.Equal(t, 0, ranking.FloorPoints(-30))
	require.Equal(t, 0, ranking.FloorPoints(-1))
	require.Equal(t, 40, ranking.FloorPoints(40))
	// ⛔ 沒有分數就沒有位階（owner 2026-08-17：「沒分數不應該有位階，這是底線」，GH#352）。
	// 空字串是既有的「未定級」訊號，客戶端 ui/components/tier.ts 已經在畫它。
	tier, div := c.BaseTier(-100)
	require.Equal(t, "", tier, "0 分不是最低位階,是還沒進榜")
	require.Equal(t, "", div)
}

// TestPlacementAward is the contract's placement→points table.
func TestPlacementAward(t *testing.T) {
	testkit.Cover(t, "rank-placement-award")
	c := ranking.DefaultLadderConfig()
	require.Equal(t, 100, c.PlacementDelta(1))
	require.Equal(t, 40, c.PlacementDelta(2))
	require.Equal(t, -10, c.PlacementDelta(3))
	require.Equal(t, -30, c.PlacementDelta(4))
	require.Equal(t, 0, c.PlacementDelta(9), "unknown placement earns nothing")
}
