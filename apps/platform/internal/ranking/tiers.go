package ranking

import "math"

// This file holds the PURE tier/division math for the visible cumulative-points
// ladder (the LoL-referenced board). It has no Redis or IO dependency so the
// boundaries are unit-testable in isolation. The hidden Elo/MMR ladder
// (elo.go/service.go) is untouched — points and MMR are two independent tracks.

// Tier labels (Traditional Chinese, EXACT per the ranked-ladder contract),
// ordered ascending. The six lower tiers carry divisions; Master/Grandmaster/
// Challenger are the apex band and never carry a division.
const (
	TierIron        = "鐵"  // Iron
	TierBronze      = "銅"  // Bronze
	TierSilver      = "銀"  // Silver
	TierGold        = "金"  // Gold
	TierEmerald     = "翡翠" // Emerald
	TierDiamond     = "鑽石" // Diamond
	TierMaster      = "大師" // Master
	TierGrandmaster = "宗師" // Grandmaster
	TierChallenger  = "菁英" // Challenger
)

// divisionedTiers are the six tiers that split into divisions, indexed to match
// LadderConfig.Thresholds[0..5].
var divisionedTiers = [6]string{
	TierIron, TierBronze, TierSilver, TierGold, TierEmerald, TierDiamond,
}

// divisionLabels are the four division bands, lowest first: IV is the lowest
// quarter of a tier's range, I the highest.
var divisionLabels = [4]string{"IV", "III", "II", "I"}

// LadderConfig is the tunable tier/division/apex configuration. All knobs are
// config-driven (internal/config seeds them from the environment); the defaults
// below match the contract's threshold table.
type LadderConfig struct {
	// Thresholds are the ascending lower bounds of the six divisioned tiers
	// followed by the Master (apex) floor: exactly 7 entries,
	// [Iron, Bronze, Silver, Gold, Emerald, Diamond, MasterFloor].
	Thresholds [7]int
	// ChallengerFrac is the fraction of the WHOLE ranked ladder that is
	// Challenger (菁英) — apex is a population fraction, not a fixed slot count,
	// because this player base is small and fixed slots would never fill.
	ChallengerFrac float64
	// GrandmasterFrac is the fraction of the ladder promoted to Grandmaster
	// (宗師), taken from the ranks immediately below the Challenger band.
	GrandmasterFrac float64
	// MinApexGames is how many settled matches an account needs before it is
	// eligible for an apex tier, so a brand-new account cannot instantly be
	// 菁英 on a small ladder. Ineligible accounts are skipped and the slot
	// passes to the next eligible account down the board.
	MinApexGames int
	// PlacementPoints maps a team's final placement (1..4) to the points delta
	// its human seats earn. Scores floor at 0 (never negative).
	PlacementPoints map[int]int
}

// DefaultLadderConfig returns the contract's default thresholds, apex fractions
// and placement award table.
func DefaultLadderConfig() LadderConfig {
	return LadderConfig{
		Thresholds:      [7]int{0, 400, 800, 1300, 1900, 2600, 3500},
		ChallengerFrac:  0.10,
		GrandmasterFrac: 0.10,
		MinApexGames:    10,
		PlacementPoints: map[int]int{1: 100, 2: 40, 3: -10, 4: -30},
	}
}

// MasterFloor is the points threshold at/above which an account is 大師 Master
// by points alone (the apex tiers above it are decided by rank instead).
func (c LadderConfig) MasterFloor() int { return c.Thresholds[6] }

// PlacementDelta returns the points awarded for a final team placement (0 for
// an unknown placement).
func (c LadderConfig) PlacementDelta(place int) int { return c.PlacementPoints[place] }

// AwardPoints returns the ABSOLUTE post-match cumulative points for an account
// that currently holds `current` points and finished at `place`. Cumulative
// (not zero-sum) and floored at 0.
func (c LadderConfig) AwardPoints(current, place int) int {
	return FloorPoints(current + c.PlacementDelta(place))
}

// FloorPoints clamps cumulative points at 0 (never negative).
func FloorPoints(points int) int {
	if points < 0 {
		return 0
	}
	return points
}

// BaseTier maps cumulative points to (tier, division) WITHOUT the apex-by-rank
// pass. Points at/above the Master floor return (TierMaster, "") — the caller
// refines that into Grandmaster/Challenger with the board-wide apex pass
// (AssignApex) once the account's standing on the board is known.
func (c LadderConfig) BaseTier(points int) (tier, division string) {
	points = FloorPoints(points)
	// ⛔ 沒有分數就沒有位階（owner 2026-08-17：「沒分數不應該有位階，這是底線」）。
	// 空字串是**既有**的「未定級」訊號 —— 客戶端 ui/components/tier.ts 的
	// normalizeTier 對空字串回 null，呼叫端就畫灰色的「未定級」徽章。
	// ⛔ 不要為此新增一個 TierUnranked 常數：那會是第二個真相，而畫面那一半已經有了。
	if points <= 0 {
		return "", ""
	}
	if points >= c.MasterFloor() {
		return TierMaster, ""
	}
	for i := 5; i >= 0; i-- {
		lo := c.Thresholds[i]
		if points >= lo {
			hi := c.Thresholds[i+1]
			return divisionedTiers[i], divisionLabels[divisionIndex(points, lo, hi)]
		}
	}
	// Unreachable while Thresholds[0]==0 and points is floored at 0, but stay
	// defined: below the lowest bound is Iron IV.
	return divisionedTiers[0], divisionLabels[0]
}

// divisionIndex splits [lo,hi) into four equal bands and returns the 0..3 band
// index (0 = lowest quarter = IV) for points. Integer math keeps the top band
// absorbing any width remainder.
func divisionIndex(points, lo, hi int) int {
	width := hi - lo
	if width <= 0 {
		return 0
	}
	q := (points - lo) * 4 / width
	if q < 0 {
		return 0
	}
	if q > 3 {
		return 3
	}
	return q
}

// ApexCandidate is one board row fed to the apex pass. Rows must arrive in
// board order (points descending) — the same order ZREVRANGE yields.
type ApexCandidate struct {
	AccountID string
	Points    int
	// Games is the account's settled-match count, gating apex eligibility.
	Games int
}

// ApexCounts returns how many Challenger and Grandmaster places a ladder of
// `total` ranked accounts has. Fractions round UP (with a floor of one place
// while the fraction is positive) so the apex always populates on a small
// ladder; the two bands together never exceed the ladder itself.
func (c LadderConfig) ApexCounts(total int) (challenger, grandmaster int) {
	if total <= 0 {
		return 0, 0
	}
	challenger = fracPlaces(c.ChallengerFrac, total)
	if challenger > total {
		challenger = total
	}
	grandmaster = fracPlaces(c.GrandmasterFrac, total)
	if challenger+grandmaster > total {
		grandmaster = total - challenger
	}
	return challenger, grandmaster
}

// fracPlaces converts a population fraction into a whole number of places.
func fracPlaces(frac float64, total int) int {
	if frac <= 0 {
		return 0
	}
	n := int(math.Ceil(frac * float64(total)))
	if n < 1 {
		n = 1
	}
	return n
}

// AssignApex runs the apex-by-population pass over the top of a board and
// returns accountID → apex tier (only Challenger/Grandmaster are returned;
// everyone else keeps their points-derived tier).
//
// rows is the top slice of the board in descending-points order and `total` is
// the FULL board size (the population the fractions are taken from — apex is
// ranked over the whole ranked ladder, NOT only accounts past the Master
// floor, so a small ladder still crowns a 菁英). Accounts with fewer than
// MinApexGames settled matches are skipped and their place passes down.
func (c LadderConfig) AssignApex(rows []ApexCandidate, total int) map[string]string {
	challenger, grandmaster := c.ApexCounts(total)
	out := make(map[string]string, challenger+grandmaster)
	if challenger+grandmaster == 0 {
		return out
	}
	filledC, filledG := 0, 0
	for _, r := range rows {
		if r.Games < c.MinApexGames {
			continue // not yet apex-eligible: the place passes to the next account
		}
		// ⛔ 沒有分數就沒有位階（owner 2026-08-17：「沒分數不應該有位階，這是底線」）。
		// apex 是按**名次比例**發的，所以兩個人的榜上、一個 0 分的帳號照樣會被冠上
		// 「宗師」。⚠️ 這一條在此之前是靠 MinApexGames 誤打誤撞擋住的 —— 場數夠了
		// 就擋不住，而那正是 GH#352。同一句話也適用於**空榜**：0 分不是最低位階，
		// 是「還沒進榜」。
		if FloorPoints(r.Points) <= 0 {
			continue
		}
		switch {
		case filledC < challenger:
			out[r.AccountID] = TierChallenger
			filledC++
		case filledG < grandmaster:
			out[r.AccountID] = TierGrandmaster
			filledG++
		default:
			return out
		}
	}
	return out
}

// Resolve returns the visible (tier, division) of one board row: the apex pass
// wins when it promoted the account (apexTier is TierChallenger or
// TierGrandmaster, never carrying a division), otherwise the tier comes from
// the points thresholds — which is how 大師 Master is reached, i.e. an account
// at/above the Master floor that did not land in the apex bands.
func (c LadderConfig) Resolve(points int, apexTier string) (tier, division string) {
	switch apexTier {
	case TierChallenger, TierGrandmaster:
		return apexTier, ""
	}
	return c.BaseTier(points)
}
