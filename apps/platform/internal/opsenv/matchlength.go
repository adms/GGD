package opsenv

// matchlength — HOW LONG A MATCH ACTUALLY IS, COMPUTED, NEVER QUOTED.
//
// ---------------------------------------------------------------------------
// THE BUG THIS FILE EXISTS TO MAKE IMPOSSIBLE (#187)
// ---------------------------------------------------------------------------
// The read-only inventory (see Info) told the owner, in prose:
//
//	「一整場最長約 15 分鐘（選角 40 秒 + 3 ×（中場 40 + 戰鬥 240 + 結算 6））」
//
// That `3` was `startingTeamLives`, hand-copied into a sentence back when it was
// a hardcoded constant in PairedDuels.ts. When `match.startingTeamLives` in
// content/config/config.match.json started actually taking effect and the owner
// set it to 8, the sentence did not move: the page kept promising 15 minutes for
// a match whose MEAN is ~34 minutes. Off by more than 2x, on the one screen the
// owner reads to decide whether a timeout is safe.
//
// It was not the only copy. `apps/platform/internal/wallet/meta.go` had its own,
// independently-written estimate — 7 rounds, 25 minutes — and the two disagreed
// inside the same binary. Two hand-maintained estimates of the same fact is one
// more than the number that can be right.
//
// ---------------------------------------------------------------------------
// WHY DERIVED AND NOT "JUST FIX THE NUMBER"
// ---------------------------------------------------------------------------
// Fixing the sentence to say 34 restores the truth for exactly as long as the
// config holds still. `startingTeamLives` is an operator-editable field in a
// JSON doc with an editor UI in front of it; the phase seconds next to it are
// too. A number that must be re-derived by a human every time content changes
// is a number that will be wrong again, silently, and the failure mode is not
// "the page looks stale" — it is the owner reading 15 minutes and concluding a
// 30-minute reaper deadline is generous.
//
// So the page states a COMPUTED value. The inputs are read from the same file
// the game-server reads, and the round count comes from a model that mirrors
// the actual round rules (PairedDuels.pairTeams + teamHealthLost +
// isHighStakesRound) rather than from an assumption about them. Change the
// reservoir, the phase seconds or the fire ring, reload, and the sentence
// changes with it.
//
// AND IT HAS ALREADY EARNED ITS KEEP. While this file was being written the
// game-server lane replaced the whole elimination model — 3 "lives" drained
// 1/1/2/2/3 became a 20-point TEAM HEALTH pool drained 2/4/6 with a +3/round
// late escalation and a High Stakes round every 4th round from round 5 that
// pays each duel WINNER +15. A hand-written sentence would have gone stale
// within the hour, for the second time in one day. The mirror below moved
// instead, and the drift guard is what said it had to.
//
// ---------------------------------------------------------------------------
// THE ROUND MODEL, AND HOW MUCH TO TRUST IT
// ---------------------------------------------------------------------------
// Round COUNT is not a formula: it depends on who loses which duel. The rules
// are exact and small, though, so the model is a straight transcription of them
// (four teams, a rotating round-robin with a bye at three, the losing team of
// each duel drops teamHealthLost(round), each winner of a non-bye High Stakes
// round gains HighStakesReward, eliminated at zero, last team standing) run
// over a deterministic pseudo-random sample with a fixed seed.
//
// THE ONE ASSUMPTION, AND ITS KNOWN BIAS. Each duel is a coin flip. That is the
// only neutral choice — any other encodes a guess about who in the family is
// good — and it is stated on the page itself rather than buried in a rounded
// number. Its bias is measured and is in the SAFE direction:
//
//   - Under the OLD lives model the assumption cost nothing: an independent
//     30-seed run of the real match loop gave 4.63 / 6.43 / 7.07 / 8.73 / 11.30
//     mean rounds at 3 / 5 / 6 / 8 lives-and-12, and this model gave
//     4.7 / 6.5 / 7.2 / 8.8 / 11.8 — agreement to within a tenth of a round.
//   - Under the NEW team-health model it runs LONG. The game-server lane
//     measured median 9 rounds on the real MatchController and median 12 on a
//     20,000-trial abstract model of the same pairing rules; this model gives
//     12, i.e. it reproduces their abstract model exactly and over-states the
//     real one by ~25%. Real duels are not coin flips — a stronger team wins
//     repeatedly, which concentrates the drain and ends the match sooner.
//
// Over-stating is the correct way to be wrong here. Every consumer of this
// number is asking "is X long enough to be safe", and the failure that produced
// this file was an estimate that was too SHORT.
//
// matchlength_test.go pins the mirrors against the TypeScript, so a rules change
// that invalidates the model turns a test red instead of quietly re-skewing the
// owner's page — which is exactly what it did, on the first run, when the model
// changed underneath it.
//
// Same seed, same trial count, same numbers on every machine and every build:
// the generator is a local xorshift, NOT math/rand, whose stream Go is free to
// change between releases. A number the owner reads must not depend on a
// toolchain upgrade.

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"time"
)

// ------------------------------------------------------- mirrored constants --
//
// Every constant below is ALSO declared in TypeScript. matchlength_test.go
// parses the TS and asserts they agree — the same drift guard keysync_test.go
// applies to the writable knobs, for the same reason: a value that exists twice
// and is checked once is a value that will disagree with itself.

const (
	// SeatTeamCount / SeatTeamSize mirror TEAM_COUNT / TEAM_SIZE in
	// packages/shared/src/constants.ts. These — not the content doc's
	// match.teamCount / match.teamSize — are what the game-server actually seats
	// (SEAT_COUNT), so they are the shape the round model runs on. The content
	// doc declares the same two numbers and nothing reads them; the drift guard
	// asserts they still agree so this stays a documentation fact rather than a
	// second, divergent truth.
	SeatTeamCount = 4
	SeatTeamSize  = 3
	// SeatCount mirrors SEAT_COUNT.
	SeatCount = SeatTeamCount * SeatTeamSize

	// DefaultStartingTeamHealth mirrors DEFAULT_STARTING_TEAM_HEALTH in
	// apps/game-server/src/match/PairedDuels.ts — the pool a bare boot or a
	// mis-schema'd doc runs on.
	DefaultStartingTeamHealth = 20
	// MaxStartingTeamHealth mirrors MAX_STARTING_TEAM_HEALTH: the clamp the
	// game-server applies to the authored value (phaseConfig
	// .resolveStartingTeamHealth). Mirrored so this model estimates what the
	// server WILL run, not what the JSON says, when the JSON says 2000.
	MaxStartingTeamHealth = 60

	// TeamHealthLateStep mirrors TEAM_HEALTH_LATE_STEP: how much the round-7+
	// loss grows per round. It is the one number that bounds the tail, so it is
	// the one whose drift would most quietly turn a 45-minute match into a
	// 90-minute one.
	TeamHealthLateStep = 3
	// HighStakesFirstRound / HighStakesPeriod / HighStakesReward mirror the
	// constants of the same name: from round 5, every 4th round pays the WINNER
	// of each duel +15 Team Health (and is inert on a bye round). It LENGTHENS
	// matches, so a model that ignored it would under-state the duration —
	// the direction that got a match reaped mid-fight.
	HighStakesFirstRound = 5
	HighStakesPeriod     = 4
	HighStakesReward     = 15
)

// Compiled phase fallbacks, mirroring DEFAULT_PHASE_CONFIG in
// apps/game-server/src/match/PhaseMachine.ts (ticks ÷ TICK_HZ).
//
// These are NOT what any real deploy runs — content/config/config.match.json
// has supplied the durations since #38 — and they are deliberately different
// from the authored ones so that a MatchShape that silently fell back to them is
// visible in the numbers rather than passing for a content read. MatchShape.
// FromContent says which happened; the Info row prints it.
const (
	DefaultChampSelectSec  = 60
	DefaultIntermissionSec = 60
	DefaultCombatMaxSec    = 90
	DefaultResolutionSec   = 5
)

// ------------------------------------------------------------- match shape --

// MatchShape is the subset of content/config/config.match.json that decides how
// long a match runs, plus the economy block the inventory used to hand-quote.
// It is READ-ONLY here: the platform never writes this document, it only needs
// to describe it truthfully.
type MatchShape struct {
	TeamCount int `json:"teamCount"`
	TeamSize  int `json:"teamSize"`
	// StartingTeamHealth is the per-team elimination pool. The CONTENT KEY is
	// still `startingTeamLives` — the game-server lane renamed the code but
	// deliberately left the schema key alone (it is declared in a .strict() Zod
	// object nobody in that lane owns), so the JSON tag below is the old name on
	// purpose. Renaming the field here and not there would make this struct stop
	// reading the document.
	StartingTeamHealth int `json:"startingTeamLives"`
	// HealthClamped is true when the authored value exceeded
	// MaxStartingTeamHealth and the game-server would clamp it. The page says so
	// rather than quoting a duration for a match that will never be played.
	HealthClamped bool `json:"healthClamped"`

	ChampSelectSec  float64 `json:"champSelectSec"`
	IntermissionSec float64 `json:"intermissionSec"`
	CombatMaxSec    float64 `json:"combatMaxSec"`
	ResolutionSec   float64 `json:"resolutionSec"`
	// FireRingStartSec is the authored intended round length: the ring arms at
	// this point and closes the round well before combatMaxSec. Zero means no
	// ring is authored, in which case a round runs to combatMaxSec.
	FireRingStartSec float64 `json:"fireRingStartSec"`

	StartingGold   float64 `json:"startingGold"`
	KillGold       float64 `json:"killGold"`
	SellRefund     float64 `json:"sellRefund"`
	InventorySlots float64 `json:"inventorySlots"`
	LevelCap       float64 `json:"levelCap"`

	// FromContent is false when the content doc was missing or unreadable and
	// every value above is a compiled fallback.
	FromContent bool `json:"fromContent"`
}

// DefaultMatchShape is the compiled fallback: what the game-server would run on
// with no content tree at all.
func DefaultMatchShape() MatchShape {
	return MatchShape{
		TeamCount:          SeatTeamCount,
		TeamSize:           SeatTeamSize,
		StartingTeamHealth: DefaultStartingTeamHealth,
		ChampSelectSec:     DefaultChampSelectSec,
		IntermissionSec:    DefaultIntermissionSec,
		CombatMaxSec:       DefaultCombatMaxSec,
		ResolutionSec:      DefaultResolutionSec,
		StartingGold:       600,
		KillGold:           150,
		SellRefund:         0.4,
		InventorySlots:     6,
		LevelCap:           18,
	}
}

// contentMatchDoc is the shape of content/config/config.match.json this package
// reads. Pointer-free: absent and zero are treated identically, because the
// game-server's own resolver (phaseConfig.toTicks) already falls back on any
// non-positive or non-finite value.
type contentMatchDoc struct {
	Schema string `json:"schema"`
	Match  struct {
		TeamCount         float64 `json:"teamCount"`
		TeamSize          float64 `json:"teamSize"`
		StartingTeamLives float64 `json:"startingTeamLives"`
		ChampSelectSec    float64 `json:"champSelectSec"`
		IntermissionSec   float64 `json:"intermissionSec"`
		CombatMaxSec      float64 `json:"combatMaxSec"`
		ResolutionSec     float64 `json:"resolutionSec"`
		FireRing          struct {
			StartSec float64 `json:"startSec"`
		} `json:"fireRing"`
	} `json:"match"`
	Economy struct {
		StartingGold   float64 `json:"startingGold"`
		KillGold       float64 `json:"killGold"`
		SellRefund     float64 `json:"sellRefund"`
		InventorySlots float64 `json:"inventorySlots"`
	} `json:"economy"`
	Progression struct {
		LevelCap float64 `json:"levelCap"`
	} `json:"progression"`
}

// pick applies the game-server's own fallback rule: anything non-finite or
// non-positive is "not authored" and the compiled default stands.
func pick(v, def float64) float64 {
	if !math.IsInf(v, 0) && !math.IsNaN(v) && v > 0 {
		return v
	}
	return def
}

// LoadMatchShape reads content/config/config.match.json out of contentDir. A
// missing, unreadable or mis-schema'd file is NOT an error — it is the compiled
// fallback with FromContent false, exactly as the game-server behaves — but it
// is logged, because a platform describing a match it cannot see is describing
// a match nobody is playing.
func LoadMatchShape(contentDir string) MatchShape {
	shape := DefaultMatchShape()
	if contentDir == "" {
		slog.Warn("opsenv: no CONTENT_DIR — the ops page will describe the COMPILED match defaults, " +
			"not the match this deploy actually runs")
		return shape
	}
	path := filepath.Join(contentDir, "config", "config.match.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		slog.Warn("opsenv: cannot read the match config; ops page falls back to compiled defaults",
			"path", path, "err", err)
		return shape
	}
	var doc contentMatchDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		slog.Warn("opsenv: match config is not parseable; ops page falls back to compiled defaults",
			"path", path, "err", err)
		return shape
	}
	m := doc.Match
	shape.FromContent = true
	shape.TeamCount = int(pick(m.TeamCount, float64(shape.TeamCount)))
	shape.TeamSize = int(pick(m.TeamSize, float64(shape.TeamSize)))
	shape.ChampSelectSec = pick(m.ChampSelectSec, shape.ChampSelectSec)
	shape.IntermissionSec = pick(m.IntermissionSec, shape.IntermissionSec)
	shape.CombatMaxSec = pick(m.CombatMaxSec, shape.CombatMaxSec)
	shape.ResolutionSec = pick(m.ResolutionSec, shape.ResolutionSec)
	// The ring is a pure additive (phaseConfig.resolveFireRing returns null when
	// absent), so zero stays zero and means "no ring": rounds then run to
	// combatMaxSec and the estimate says so.
	if s := m.FireRing.StartSec; s > 0 && !math.IsInf(s, 0) && !math.IsNaN(s) {
		shape.FireRingStartSec = math.Min(s, shape.CombatMaxSec)
	}
	health := int(pick(m.StartingTeamLives, float64(DefaultStartingTeamHealth)))
	if health > MaxStartingTeamHealth {
		health = MaxStartingTeamHealth
		shape.HealthClamped = true
	}
	shape.StartingTeamHealth = health

	shape.StartingGold = pick(doc.Economy.StartingGold, shape.StartingGold)
	shape.KillGold = pick(doc.Economy.KillGold, shape.KillGold)
	shape.SellRefund = pick(doc.Economy.SellRefund, shape.SellRefund)
	shape.InventorySlots = pick(doc.Economy.InventorySlots, shape.InventorySlots)
	shape.LevelCap = pick(doc.Progression.LevelCap, shape.LevelCap)
	return shape
}

// TypicalCombatSec is how long a round's COMBAT phase usually lasts: the fire
// ring's start second when one is authored (phaseConfig calls startSec "the
// intended round length", and the schema forbids it exceeding combatMaxSec),
// otherwise the full combat cap.
func (s MatchShape) TypicalCombatSec() float64 {
	if s.FireRingStartSec > 0 {
		return s.FireRingStartSec
	}
	return s.CombatMaxSec
}

// TypicalRoundSec / LongRoundSec are one round of wall clock: the intermission
// in front of it, the combat, and the resolution behind it.
func (s MatchShape) TypicalRoundSec() float64 {
	return s.IntermissionSec + s.TypicalCombatSec() + s.ResolutionSec
}

// LongRoundSec is a round that goes the distance — combat to the cap.
func (s MatchShape) LongRoundSec() float64 {
	return s.IntermissionSec + s.CombatMaxSec + s.ResolutionSec
}

// ------------------------------------------------------------- round model --

// teamHealthLost mirrors teamHealthLost in
// apps/game-server/src/match/PairedDuels.ts: LoL Arena's 2/4/6 bands, plus the
// per-round escalation GGD adds from round 7 because four teams with byes lose
// half the drain in the tail.
func teamHealthLost(round int) int {
	switch {
	case round <= 3:
		return 2
	case round <= 6:
		return 4
	default:
		return 6 + TeamHealthLateStep*(round-7)
	}
}

// isHighStakesRound mirrors isHighStakesRound: from HighStakesFirstRound, every
// HighStakesPeriod-th round pays each duel WINNER HighStakesReward — and is
// INERT on a bye round, because a rotation nobody chose must not decide who
// collects.
func isHighStakesRound(round int, hasBye bool) bool {
	if hasBye || round < HighStakesFirstRound {
		return false
	}
	return (round-HighStakesFirstRound)%HighStakesPeriod == 0
}

// fourTeamSchedule mirrors FOUR_TEAM_SCHEDULE (circle method, repeats every 3).
var fourTeamSchedule = [3][2][2]int{
	{{0, 1}, {2, 3}},
	{{0, 2}, {1, 3}},
	{{0, 3}, {1, 2}},
}

// xorshift is a tiny, FIXED, self-contained generator. It is not math/rand on
// purpose: the numbers on the owner's page must not move because the toolchain
// changed its global stream.
type xorshift struct{ s uint64 }

func (g *xorshift) next() uint64 {
	g.s ^= g.s << 13
	g.s ^= g.s >> 7
	g.s ^= g.s << 17
	return g.s
}

// coin is the neutral assumption: either side of a duel is equally likely to
// lose it. Stated, not hidden — a model that assumed the owner's family loses
// evenly is the only one that does not encode a guess about who is good.
func (g *xorshift) coin() bool { return g.next()&1 == 1 }

// simSeed / simTrials are fixed so the page is reproducible. 20k trials puts the
// standard error on the mean round count under 0.02 rounds — far finer than the
// 0.1-round resolution the page renders — and costs microseconds, once, at boot.
const (
	simSeed   = 0x9E3779B97F4A7C15
	simTrials = 20000
)

// simulateOne plays one match under the real rules and returns the round count.
func simulateOne(teamCount, startHealth int, g *xorshift) int {
	health := make([]int, teamCount)
	for i := range health {
		health[i] = startHealth
	}
	alive := make([]int, teamCount)
	for i := range alive {
		alive[i] = i
	}
	// Hard stop. The late escalation guarantees the drain eventually outruns the
	// High Stakes reward (that is why TEAM_HEALTH_LATE_STEP exists), so this can
	// only be reached if the mirrored rules stop converging — and a bounded
	// wrong answer beats a hung boot.
	const maxRounds = 1000
	round := 0
	for len(alive) > 1 && round < maxRounds {
		round++
		cost := teamHealthLost(round)
		var duels [][2]int
		hasBye := false
		switch len(alive) {
		case 4:
			for _, p := range fourTeamSchedule[(round-1)%3] {
				duels = append(duels, [2]int{alive[p[0]], alive[p[1]]})
			}
		case 3:
			// One duel plus a rotating bye; the bye team neither loses nor gains.
			hasBye = true
			bye := (round - 1) % 3
			f := make([]int, 0, 2)
			for i, t := range alive {
				if i != bye {
					f = append(f, t)
				}
			}
			duels = append(duels, [2]int{f[0], f[1]})
		case 2:
			duels = append(duels, [2]int{alive[0], alive[1]})
		default:
			// >4 alive is unreachable at SEAT_COUNT and pairTeams has no schedule
			// for it; pair off adjacent teams so the model still terminates.
			for i := 0; i+1 < len(alive); i += 2 {
				duels = append(duels, [2]int{alive[i], alive[i+1]})
			}
		}
		stakes := isHighStakesRound(round, hasBye)
		for _, du := range duels {
			loser, winner := du[0], du[1]
			if g.coin() {
				loser, winner = du[1], du[0]
			}
			if health[loser] -= cost; health[loser] < 0 {
				health[loser] = 0
			}
			if stakes {
				health[winner] += HighStakesReward
			}
		}
		next := alive[:0:0]
		for _, t := range alive {
			if health[t] > 0 {
				next = append(next, t)
			}
		}
		alive = next
	}
	return round
}

// ------------------------------------------------------------ match length --

// MatchLength is the derived answer: how many rounds a match takes and how much
// wall clock that is. Every field is computed from a MatchShape; none of it is
// written down anywhere a human can let it go stale.
type MatchLength struct {
	// Rounds is the mean round count under the neutral model.
	Rounds float64 `json:"rounds"`
	// RoundsMedian is the middle of the sample — the figure the game-server
	// lane's own measurements are expressed in.
	RoundsMedian int `json:"roundsMedian"`
	// RoundsMin / RoundsMax are the extremes the model produced over its sample
	// — not theoretical bounds, but the range a real evening actually spans.
	RoundsMin int `json:"roundsMin"`
	RoundsMax int `json:"roundsMax"`
	// TypicalSec is the mean round count at the typical round length (the fire
	// ring closing rounds near its start second).
	TypicalSec float64 `json:"typicalSec"`
	// LongSec is the same round count with EVERY round going to combatMaxSec —
	// the honest worst case for a normal-length match, and the number any
	// timeout must clear.
	LongSec float64 `json:"longSec"`
	// CeilingSec is the longest match the model saw, every round full length.
	CeilingSec float64 `json:"ceilingSec"`
	// Trials is the sample size, so the numbers can be reproduced.
	Trials int `json:"trials"`
}

// EstimateMatchLength runs the round model over the shape.
func EstimateMatchLength(shape MatchShape) MatchLength {
	teams := shape.TeamCount
	if teams < 2 {
		teams = 2
	}
	health := shape.StartingTeamHealth
	if health < 1 {
		health = 1
	}
	g := &xorshift{s: simSeed}
	total, min, max := 0, math.MaxInt, 0
	hist := map[int]int{}
	for i := 0; i < simTrials; i++ {
		r := simulateOne(teams, health, g)
		total += r
		hist[r]++
		if r < min {
			min = r
		}
		if r > max {
			max = r
		}
	}
	median, seen := min, 0
	for r := min; r <= max; r++ {
		if seen += hist[r]; seen*2 >= simTrials {
			median = r
			break
		}
	}
	mean := float64(total) / float64(simTrials)
	return MatchLength{
		Rounds:       mean,
		RoundsMedian: median,
		RoundsMin:    min,
		RoundsMax:    max,
		TypicalSec:   shape.ChampSelectSec + mean*shape.TypicalRoundSec(),
		LongSec:      shape.ChampSelectSec + mean*shape.LongRoundSec(),
		CeilingSec:   shape.ChampSelectSec + float64(max)*shape.LongRoundSec(),
		Trials:       simTrials,
	}
}

// ------------------------------------------------------------- formatting ---

// formatMinutes renders a duration of seconds as whole zh-Hant minutes.
func formatMinutes(sec float64) string {
	return fmt.Sprintf("%.0f 分鐘", math.Round(sec/60))
}

// formatDuration renders a Go duration in zh-Hant, for the reaper facts.
func formatDuration(d time.Duration) string {
	switch {
	case d >= time.Hour && d%time.Hour == 0:
		return fmt.Sprintf("%d 小時", int(d/time.Hour))
	case d >= time.Minute && d%time.Minute == 0:
		return fmt.Sprintf("%d 分鐘", int(d/time.Minute))
	case d >= time.Minute:
		return fmt.Sprintf("%d 分 %d 秒", int(d/time.Minute), int((d%time.Minute)/time.Second))
	default:
		return fmt.Sprintf("%d 秒", int(d/time.Second))
	}
}

// ZhSummary is the one-line answer to 「一場要打多久」, computed — including the
// one assumption behind it, because a duration with a hidden model in it is how
// this page lied in the first place.
func (l MatchLength) ZhSummary() string {
	return fmt.Sprintf("典型約 %s（平均 %.1f 回合；每場對決以五五波估算，偏保守，實戰通常更短）；每回合都打滿約 %s",
		formatMinutes(l.TypicalSec), l.Rounds, formatMinutes(l.LongSec))
}

// Median is the middle round count of the sample. Reported alongside the mean
// because the game-server lane measures this model in medians, so the two can
// be compared without a conversion step that someone would get wrong.
func (l MatchLength) Median() int { return l.RoundsMedian }
