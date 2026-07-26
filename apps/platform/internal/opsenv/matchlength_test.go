package opsenv_test

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/opsenv"
	"github.com/ggd/platform/pkg/testkit"
)

// These tests exist because a NUMBER ON A PAGE was wrong by more than 2x for as
// long as it took someone to notice, and nothing failed. Every one of them
// fails if the stated match duration is allowed to detach from the config
// again — by hand-editing, by a rules change, or by the content doc moving.

func contentDir(t *testing.T) string {
	t.Helper()
	return filepath.Join(repoRoot(t), "content")
}

func liveShape(t *testing.T) opsenv.MatchShape {
	t.Helper()
	s := opsenv.LoadMatchShape(contentDir(t))
	require.True(t, s.FromContent,
		"the repo's content/config/config.match.json must be readable; without it this whole "+
			"suite would be checking the compiled fallbacks instead of the match the owner plays")
	return s
}

// ------------------------------------------------------- the model is right --

// TestRoundModelMatchesTheGameServersOwnMeasurement pins the model against
// numbers that did NOT come out of it.
//
// The game-server lane measured its own team-health curve two ways and wrote
// both into PairedDuels.ts: a 20,000-trial abstract model of the same pairing
// rules gave a MEDIAN OF 12 rounds with 0% of matches past 13, and the real
// MatchController with 12 bots gave a median of 9 (range 8-11). This model must
// reproduce the abstract figure — it is the same experiment — and it must sit
// at or above the real one, because a coin-flip assumption spreads the drain
// and therefore over-states the length. Over-stating is the safe direction:
// every consumer is asking "is X long enough".
func TestRoundModelMatchesTheGameServersOwnMeasurement(t *testing.T) {
	testkit.Cover(t, "opsenv-match-length-derived")

	shape := liveShape(t)
	shape.StartingTeamHealth = opsenv.DefaultStartingTeamHealth
	got := opsenv.EstimateMatchLength(shape)

	assert.InDelta(t, 12, got.RoundsMedian, 1,
		"the model gives a median of %d rounds at the shipped %d Team Health; the game-server "+
			"lane's own 20,000-trial abstract model of the same rules gives 12. Either "+
			"teamHealthLost / isHighStakesRound / pairTeams changed and matchlength.go was not "+
			"updated with them, or this transcription is wrong — and the duration the owner "+
			"reads is computed from rules the game does not have.",
		got.RoundsMedian, opsenv.DefaultStartingTeamHealth)

	assert.GreaterOrEqual(t, got.RoundsMedian, 9,
		"the model is now SHORTER than the real MatchController measurement (median 9). "+
			"A duration estimate that runs short is the #187 failure mode.")
	assert.LessOrEqual(t, got.RoundsMax, 20,
		"the model's tail (%d rounds) has blown out — the round-7 escalation "+
			"(TEAM_HEALTH_LATE_STEP) is what bounds it, so check that it is still mirrored",
		got.RoundsMax)
}

// TestMoreTeamHealthIsALongerMatch is the monotonicity the whole feature rests
// on: the bug was that raising the reservoir lengthened the match and nothing
// downstream noticed.
//
// Monotone in the MEAN, not strictly per unit: the drain moves in steps of
// 2/4/6, so one extra point of Team Health does not always buy a round.
func TestMoreTeamHealthIsALongerMatch(t *testing.T) {
	base := liveShape(t)
	prev := 0.0
	for h := 2; h <= opsenv.MaxStartingTeamHealth; h += 2 {
		shape := base
		shape.StartingTeamHealth = h
		got := opsenv.EstimateMatchLength(shape)
		require.Greater(t, got.TypicalSec, prev,
			"match length must increase with Team Health; it did not at %d", h)
		prev = got.TypicalSec
	}
}

// TestEstimateIsDeterministic — the owner must not see a different duration on
// every page load, and two platform replicas must not disagree.
func TestEstimateIsDeterministic(t *testing.T) {
	shape := liveShape(t)
	first := opsenv.EstimateMatchLength(shape)
	for i := 0; i < 5; i++ {
		assert.Equal(t, first, opsenv.EstimateMatchLength(shape))
	}
}

// ------------------------------------------- the page states the real thing --

// TestOpsPageStatesTheRealMatchLength is the regression test for #187 itself.
//
// The inventory used to say 「一整場最長約 15 分鐘」. At the owner's live config
// that is off by more than 2x. This asserts the page now states the DERIVED
// length, and that the stale sentence cannot come back.
func TestOpsPageStatesTheRealMatchLength(t *testing.T) {
	testkit.Cover(t, "opsenv-match-length-derived")

	shape := liveShape(t)
	ml := opsenv.EstimateMatchLength(shape)
	info := opsenv.InfoFor(shape, ml, opsenv.Runtime{})

	row := findInfo(t, info, "matchLength")
	realMinutes := int(ml.TypicalSec/60 + 0.5)
	assert.Contains(t, row.Value, strconv.Itoa(realMinutes)+" 分鐘",
		"the match-length row must state the DERIVED duration")

	// The specific lie, and its arithmetic, must not exist anywhere in the
	// inventory — not in a value, not in an explanation, not in a footnote.
	for _, it := range info {
		blob := it.Value + it.ZhHow + it.ZhWhy
		if it.Key == "matchLength" || it.Key == "matchPendingTTL" {
			// These two DISCUSS the old number by name ("it used to say 15") in
			// order to explain the fix. That is history, not a claim, and it is
			// what stops someone re-deriving the same shortcut.
			continue
		}
		assert.NotContains(t, blob, "15 分鐘",
			"row %q states a match duration of 15 minutes — that is the 3-lives figure "+
				"from before the reservoir took effect (now %d Team Health, ~%d minutes)",
			it.Key, shape.StartingTeamHealth, realMinutes)
		assert.NotRegexp(t, regexp.MustCompile(`[0-9]+ ×（中場`), blob,
			"row %q hand-writes the match-length arithmetic. Use the derived MatchLength: "+
				"an inlined round count is exactly how this page came to be wrong by 2x", it.Key)
	}
}

// TestTheInventoryIsActuallyDerived proves the rows MOVE. A row can quote the
// right number today and still be a constant; the only way to know it is
// derived is to change the input and watch the output change.
func TestTheInventoryIsActuallyDerived(t *testing.T) {
	testkit.Cover(t, "opsenv-match-length-derived")

	small := liveShape(t)
	small.StartingTeamHealth = 10
	large := small
	large.StartingTeamHealth = 40

	a := opsenv.InfoFor(small, opsenv.EstimateMatchLength(small), opsenv.Runtime{})
	b := opsenv.InfoFor(large, opsenv.EstimateMatchLength(large), opsenv.Runtime{})
	assert.NotEqual(t, findInfo(t, a, "matchLength").Value, findInfo(t, b, "matchLength").Value,
		"the match-length row did not change when Team Health went 10 -> 40; it is still a constant")

	// Phase seconds too — the second hand-copied row.
	slow := small
	slow.CombatMaxSec = small.CombatMaxSec * 2
	c := opsenv.InfoFor(slow, opsenv.EstimateMatchLength(slow), opsenv.Runtime{})
	assert.NotEqual(t, findInfo(t, a, "phaseDurations").Value, findInfo(t, c, "phaseDurations").Value,
		"the phase-seconds row did not change when combatMaxSec doubled")
	assert.NotEqual(t, findInfo(t, a, "matchLength").Value, findInfo(t, c, "matchLength").Value,
		"match length must depend on the phase seconds, not only on the lives")
}

// TestReaperRowReportsTheEffectivePolicy — the row used to say 「回收檢查每 7 分
// 30 秒」, which was the caller's unclamped request. It must report what the
// reaper will actually do, including the worst case for a genuinely stuck room.
func TestReaperRowReportsTheEffectivePolicy(t *testing.T) {
	shape := liveShape(t)
	rt := opsenv.Runtime{
		MatchPendingTTL:    2 * time.Hour,
		MatchLivenessGrace: 3 * time.Minute,
		ReaperInterval:     time.Minute,
	}
	row := findInfo(t, opsenv.InfoFor(shape, opsenv.EstimateMatchLength(shape), rt), "matchPendingTTL")
	assert.Contains(t, row.Value, "3 分鐘", "must state the liveness grace")
	assert.Contains(t, row.Value, "2 小時", "must state the blind fallback")
	assert.Contains(t, row.Value, "4 分鐘",
		"must state the worst case for a stuck room (grace + one sweep) — the number an "+
			"operator actually needs when a room is wedged")
}

// TestBlindFallbackStillClearsTheRealMatch — the config package pins the blind
// fallback against numbers a human wrote down (「a 12-life match measures 43.2
// min」). This pins it against the model, AT WHATEVER THE CONFIG CURRENTLY SAYS,
// which is the half a hand-written bound cannot do.
//
// The bar is LongSec: the mean round count with every round running to
// combatMaxSec. Not the model's extreme tail — the blind deadline only governs
// a game-server that has never once heartbeated, and buying tail coverage for
// that case means a genuinely dead room from an old build lingers even longer.
func TestBlindFallbackStillClearsTheRealMatch(t *testing.T) {
	shape := liveShape(t)
	ml := opsenv.EstimateMatchLength(shape)
	blind := opsenv.Runtime{}.Resolved().MatchPendingTTL
	assert.Greater(t, blind.Seconds(), ml.LongSec,
		"the blind fallback (%s) is now SHORTER than a normal match at the live config "+
			"(%d Team Health -> %.1f rounds -> %.0f min with every round at combatMaxSec). "+
			"Heartbeating game-servers are unaffected, but one that sends no heartbeat "+
			"(old build / wrong GGD_PLATFORM_URL / bad secret) would be reaped mid-match — "+
			"#187 exactly. Either raise MatchPendingTTL or lower startingTeamLives.",
		blind, shape.StartingTeamHealth, ml.Rounds, ml.LongSec/60)
}

func findInfo(t *testing.T, info []opsenv.InfoItem, key string) opsenv.InfoItem {
	t.Helper()
	for _, it := range info {
		if it.Key == key {
			return it
		}
	}
	require.FailNowf(t, "missing info row", "no row with key %q", key)
	return opsenv.InfoItem{}
}

// --------------------------------------------------------------- drift guard --

// TestMatchModelMirrorsTheGameServer is the keysync guard extended to the round
// rules. Every constant matchlength.go mirrors is parsed back out of the
// TypeScript that owns it.
//
// Without this, the model silently becomes a historical reenactment of rules the
// game no longer has — and it would still produce a confident number.
func TestMatchModelMirrorsTheGameServer(t *testing.T) {
	testkit.Cover(t, "opsenv-match-length-derived")

	duels := filepath.Join(repoRoot(t), "apps", "game-server", "src", "match", "PairedDuels.ts")
	src := mustRead(t, duels)
	assert.EqualValues(t, opsenv.DefaultStartingTeamHealth,
		numConst(t, src, "DEFAULT_STARTING_TEAM_HEALTH", duels))
	assert.EqualValues(t, opsenv.MaxStartingTeamHealth,
		numConst(t, src, "MAX_STARTING_TEAM_HEALTH", duels))
	assert.EqualValues(t, opsenv.TeamHealthLateStep,
		numConst(t, src, "TEAM_HEALTH_LATE_STEP", duels))
	assert.EqualValues(t, opsenv.HighStakesFirstRound,
		numConst(t, src, "HIGH_STAKES_FIRST_ROUND", duels))
	assert.EqualValues(t, opsenv.HighStakesPeriod,
		numConst(t, src, "HIGH_STAKES_PERIOD", duels))
	assert.EqualValues(t, opsenv.HighStakesReward,
		numConst(t, src, "HIGH_STAKES_REWARD", duels))

	// The drain curve, read straight out of teamHealthLost's body. This is the
	// guard that fired the first time it ran: the whole elimination model was
	// replaced (lives 1/1/2/2/3 -> Team Health 2/4/6 + escalation + High Stakes)
	// while this file was being written.
	body := regexp.MustCompile(`(?s)function teamHealthLost\(round: number\): number \{(.*?)\n\}`).FindSubmatch(src)
	require.Len(t, body, 2, "could not find teamHealthLost in %s", duels)
	assert.Contains(t, string(body[1]), "round <= 3) return 2",
		"the Team-Health drain curve changed; matchlength.go's teamHealthLost must follow or every "+
			"duration on the ops page is computed from rules that no longer exist")
	assert.Contains(t, string(body[1]), "round <= 6) return 4")
	assert.Contains(t, string(body[1]), "TEAM_HEALTH_LATE_STEP * (round - 7)")

	// The High Stakes predicate, likewise — it is the term that LENGTHENS
	// matches, so dropping it would silently make the page under-state.
	hs := regexp.MustCompile(`(?s)function isHighStakesRound\(round: number, hasBye: boolean\): boolean \{(.*?)\n\}`).FindSubmatch(src)
	require.Len(t, hs, 2, "could not find isHighStakesRound in %s", duels)
	assert.Contains(t, string(hs[1]), "if (hasBye) return false",
		"High Stakes is inert on a bye round; the model mirrors that")

	consts := filepath.Join(repoRoot(t), "packages", "shared", "src", "constants.ts")
	csrc := mustRead(t, consts)
	assert.EqualValues(t, opsenv.SeatTeamCount, numConst(t, csrc, "TEAM_COUNT", consts))
	assert.EqualValues(t, opsenv.SeatTeamSize, numConst(t, csrc, "TEAM_SIZE", consts))

	// The content doc declares the same shape. Nothing reads its teamCount /
	// teamSize, so this is a documentation fact — but a documentation fact that
	// disagrees with the code is the seed of the next wrong page.
	shape := liveShape(t)
	assert.Equal(t, opsenv.SeatTeamCount, shape.TeamCount,
		"config.match.json's teamCount disagrees with TEAM_COUNT in constants.ts")
	assert.Equal(t, opsenv.SeatTeamSize, shape.TeamSize,
		"config.match.json's teamSize disagrees with TEAM_SIZE in constants.ts")

	// The content key is still `startingTeamLives` even though the code is now
	// team health — a deliberate cross-lane decision recorded in PairedDuels.ts.
	// If it is ever renamed, MatchShape stops reading the document and silently
	// falls back to the compiled default, so pin the key itself.
	assert.Contains(t, string(mustRead(t, filepath.Join(repoRoot(t), "content", "config", "config.match.json"))),
		`"startingTeamLives"`,
		"the reservoir key was renamed in content; MatchShape's json tag must follow or the ops "+
			"page silently describes the compiled default instead of the shipped match")

	phase := filepath.Join(repoRoot(t), "apps", "game-server", "src", "match", "PhaseMachine.ts")
	psrc := mustRead(t, phase)
	for _, c := range []struct {
		field string
		want  float64
	}{
		{"champSelectTicks", opsenv.DefaultChampSelectSec},
		{"intermissionTicks", opsenv.DefaultIntermissionSec},
		{"combatMaxTicks", opsenv.DefaultCombatMaxSec},
		{"resolutionTicks", opsenv.DefaultResolutionSec},
	} {
		assert.EqualValues(t, c.want, phaseDefaultSec(t, psrc, c.field, phase),
			"DEFAULT_PHASE_CONFIG.%s drifted from opsenv's mirrored fallback", c.field)
	}
}

// phaseDefaultSec reads `<field>: <n> * TICK_HZ` out of DEFAULT_PHASE_CONFIG.
func phaseDefaultSec(t *testing.T, src []byte, field, path string) float64 {
	t.Helper()
	re := regexp.MustCompile(field + `:\s*([0-9]+(?:\.[0-9]+)?)\s*\*\s*TICK_HZ`)
	m := re.FindSubmatch(src)
	require.Len(t, m, 2, "could not find `%s: <n> * TICK_HZ` in %s", field, path)
	v, err := strconv.ParseFloat(string(m[1]), 64)
	require.NoError(t, err)
	return v
}

// grepGo walks a Go tree and returns "path:line: text" for every line matching
// re, skipping _test.go files (a test that asserts about a number is not a
// second source of truth for it).
func grepGo(t *testing.T, root string, re *regexp.Regexp) []string {
	t.Helper()
	var hits []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for i, line := range strings.Split(string(raw), "\n") {
			if re.MatchString(line) {
				rel, _ := filepath.Rel(root, path)
				hits = append(hits, fmt.Sprintf("%s:%d: %s", rel, i+1, strings.TrimSpace(line)))
			}
		}
		return nil
	})
	require.NoError(t, err)
	return hits
}

// ---------------------------------------------- the second, disagreeing copy --

var (
	walletLivesRe   = regexp.MustCompile(`([0-9]+) teams x ([0-9]+) starting Team Health`)
	walletRoundsRe  = regexp.MustCompile(`~([0-9]+(?:\.[0-9]+)?) rounds`)
	walletMinutesRe = regexp.MustCompile(`~= ([0-9]+(?:\.[0-9]+)?) minutes`)
)

// staleFactor is how far the LIVE match length may drift from wallet/meta.go's
// reference point before the crystal grants stop meaning what their comment
// says. 2x is not arbitrary: it is the size of the #187 error, the point at
// which 「about one champion per evening」 becomes two evenings, and it is loose
// enough that ordinary balance tuning in another lane does not turn this red.
const staleFactor = 2.0

// TestWalletPlayRateAgreesWithTheDerivedLength.
//
// internal/wallet/meta.go writes down the assumed play rate that the crystal
// grants are tuned against, in prose, in a comment. It has to: it is a TUNING
// RATIONALE, not a served value, and a comment is the right home for the
// sentence "this is why 120/90/70/60". But it was independently derived, and it
// disagreed with the ops page — 「~7 rounds ~= 25 minutes」 against 「15 分鐘」,
// two wrong answers about the same match inside one binary.
//
// Prose that a human maintains cannot be made self-updating, so it is made
// CHECKED instead, in two parts:
//
//  1. INTERNAL CONSISTENCY, at the reference config the comment itself names.
//     This is the actual reconciliation and it cannot be broken by another
//     lane's balance edit: 「4 teams x 8 startingTeamLives」 must genuinely
//     produce the rounds and the minutes the comment claims. The old text
//     failed this — at 8 lives it is 8.8 rounds and 34 minutes, not 7 and 25.
//  2. STALENESS, against the LIVE config, with a wide 2x band. The reference
//     point may drift as content is tuned; what may not happen is the crystal
//     economy silently being tuned for a match twice as short as the one people
//     are playing.
func TestWalletPlayRateAgreesWithTheDerivedLength(t *testing.T) {
	testkit.Cover(t, "opsenv-match-length-derived")
	// admin-46 names this test by id. The other half of that row — that the
	// grants themselves stay where the owner put them — is pinned by
	// TestCrystalGrantsAreTheOwnersDecision in internal/wallet, which emits the
	// same beacon.
	testkit.Cover(t, "opsenv-wallet-playrate")

	path := filepath.Join(repoRoot(t), "apps", "platform", "internal", "wallet", "meta.go")
	src := string(mustRead(t, path))

	lm := walletLivesRe.FindStringSubmatch(src)
	require.Len(t, lm, 3, "could not find `N teams x N starting Team Health` in %s — the play-rate "+
		"rationale must name the config it was derived at, or it cannot be checked at all", path)
	rm := walletRoundsRe.FindStringSubmatch(src)
	require.Len(t, rm, 2, "could not find `~N rounds` in %s", path)
	mm := walletMinutesRe.FindStringSubmatch(src)
	require.Len(t, mm, 2, "could not find `~= N minutes` in %s", path)

	refTeams, err := strconv.Atoi(lm[1])
	require.NoError(t, err)
	refHealth, err := strconv.Atoi(lm[2])
	require.NoError(t, err)
	statedRounds, err := strconv.ParseFloat(rm[1], 64)
	require.NoError(t, err)
	statedMinutes, err := strconv.ParseFloat(mm[1], 64)
	require.NoError(t, err)

	// (1) the comment's own arithmetic.
	ref := liveShape(t)
	ref.TeamCount, ref.StartingTeamHealth = refTeams, refHealth
	refML := opsenv.EstimateMatchLength(ref)
	fix := fmt.Sprintf("at %d teams x %d Team Health the model says ~%.1f rounds ~= %.0f minutes",
		refTeams, refHealth, refML.Rounds, refML.TypicalSec/60)
	assert.InDelta(t, refML.Rounds, statedRounds, 0.6,
		"wallet/meta.go claims ~%.1f rounds at its own stated reference config, but %s. "+
			"The crystal grants are tuned against that number.", statedRounds, fix)
	assert.InDelta(t, refML.TypicalSec/60, statedMinutes, 3,
		"wallet/meta.go claims ~%.0f minutes at its own stated reference config, but %s.",
		statedMinutes, fix)

	// (2) is the reference still anywhere near what people actually play?
	live := opsenv.EstimateMatchLength(liveShape(t))
	liveMinutes := live.TypicalSec / 60
	assert.Less(t, liveMinutes, statedMinutes*staleFactor,
		"a match at the LIVE config is ~%.0f minutes, more than %.0fx the %.0f minutes the crystal "+
			"grants in wallet/meta.go were tuned against (startingTeamLives is now %d). "+
			"「約一晚解鎖一位英雄」 no longer holds — re-derive the grants or move the reference point.",
		liveMinutes, staleFactor, statedMinutes, liveShape(t).StartingTeamHealth)
	assert.Greater(t, liveMinutes, statedMinutes/staleFactor,
		"a match at the LIVE config is ~%.0f minutes, less than a %.0fth of the %.0f minutes the "+
			"crystal grants were tuned against — the economy now pays out far faster than intended.",
		liveMinutes, staleFactor, statedMinutes)
}

// TestNoOtherPlatformFileHardcodesTheRoundCount sweeps the Go platform for the
// shape of assumption that caused this: a written-down number of rounds.
func TestNoOtherPlatformFileHardcodesTheRoundCount(t *testing.T) {
	re := regexp.MustCompile(`(?i)([0-9]+)\s*(rounds per match|回合的對戰|×（中場)`)
	// Not vacuous: the pattern must still match the sentence that caused #187.
	require.Regexp(t, re, "選角 40 秒 + 3 ×（中場 40 + 戰鬥 240 + 結算 6）",
		"the sweep pattern no longer matches the original defect, so it is guarding nothing")
	require.Regexp(t, re, "~7 rounds per match")

	root := filepath.Join(repoRoot(t), "apps", "platform", "internal")
	hits := grepGo(t, root, re)
	var bad []string
	for _, h := range hits {
		// wallet/meta.go's rationale is allowed — it is checked by the test
		// above. Anything else is an unchecked second opinion.
		if strings.Contains(h, "wallet/meta.go") || strings.Contains(h, "opsenv/matchlength") {
			continue
		}
		bad = append(bad, h)
	}
	assert.Empty(t, bad,
		"these lines write down a round count instead of deriving it from the match config. "+
			"That is the #187 shape: %v", bad)
}
