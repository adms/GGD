/**
 * PairedDuels round format: rounds 1..{@link FINAL_ROUND}-1 split the four teams
 * into simultaneous 3v3 duels across the arena's two zones, following a rotating
 * round-robin schedule. A duel is won when the opposing three are down; the
 * losing team loses TEAM HEALTH (escalating with round), and on a High Stakes
 * round the winner GAINS Team Health.
 *
 * ROUND {@link FINAL_ROUND} IS DIFFERENT (owner directive 2026-07-27): all four
 * teams drop into ONE zone and fight a single twelve-player royale, and the team
 * left standing is the match CHAMPION. Team Health no longer eliminates anybody —
 * it is a scoreboard that orders places 2/3/4 — so every team plays all ten
 * rounds and the ONLY thing that ends a match is finishing the final round. See
 * {@link FINAL_ROUND} for the full chain of consequences.
 */
import type { TeamId } from "@ggd/shared/ids";

export interface DuelPairing {
  zone: number;
  sideA: TeamId; // spawns[0]
  sideB: TeamId; // spawns[1]
}

/**
 * The finale. Round {@link FINAL_ROUND} is not a pair of duels but ONE bout with
 * every team in it, in a single zone — hence `teams`, not sideA/sideB.
 */
export interface RoyaleBout {
  zone: number;
  /** every participating team, ascending by id (deterministic) */
  teams: TeamId[];
}

/**
 * THE LAST ROUND — and, since owner's 2026-07-27 ruling, the ONLY thing that
 * ends a match.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CONSTANT CARRIES SO MUCH
 * ---------------------------------------------------------------------------
 * The ruling was five sentences, but four of them delete a mechanic:
 *
 *   A. 「不管前面被淘汰與否，大家都回來打第 10 回合」 — team health hitting 0
 *      ELIMINATES NOBODY. All four teams play all ten rounds, keep taking the
 *      per-round levels/gold/3-choose-1, and keep shopping.
 *   B. team health is 「只是計分板，不影響決賽」 — it orders places 2/3/4.
 *   C. round 10 is a four-team royale in one zone; the survivor is the champion,
 *      regardless of team health.
 *
 * (A) removes the ONLY previous end condition. `maybeFinish` used to fire when
 * `aliveTeams().length <= 1`, and "alive" meant "health > 0"; with nothing
 * draining a team out of the match, that predicate can never be reached and a
 * match would run forever. The replacement end condition is this constant: the
 * match ends when round {@link FINAL_ROUND}'s resolution completes, full stop.
 *
 * A NOTE ON TASK #283 (the "ten-round cap"), because the hand-off assumed it was
 * already in main and it is NOT: there is no `resolveMaxRounds` anywhere in the
 * tree (grep for it — zero hits, definition included), and `MatchRoom.onCreate`
 * passes twelve positional arguments to the MatchController ending at
 * `ownership`. The cap arrives HERE, with this change, or the finale is prose.
 *
 * WHY A CONSTANT AND NOT A CONFIG KNOB: a thirteenth positional constructor
 * parameter that only MatchRoom could fill is precisely the shape of a feature
 * that lands and never reaches a player — every unit test, the replay player and
 * the dev boot would keep the old default and only production would differ. The
 * round table in `content/config/arena-rules.json` is authored through round 13
 * plus an overflow rule and this lane may not touch it, so the cap cannot be
 * derived from content either. One constant, read by every path, is the version
 * that cannot silently not-apply.
 */
export const FINAL_ROUND = 10;

/** Is `round` the all-in finale rather than a pair of 3v3 duels? */
export function isRoyaleRound(round: number): boolean {
  return round >= FINAL_ROUND;
}

/**
 * The finale bout: every participating team, in ONE zone.
 *
 * DETERMINISM: the team list is sorted ascending, and the zone is fixed at 0 —
 * the royale arena has exactly one zone. Nothing here draws from rng, so a
 * same-seed replay lays the finale out identically (task #145's contract).
 */
export function royaleBout(teams: readonly TeamId[]): RoyaleBout {
  return { zone: 0, teams: [...teams].sort((a, b) => a - b) };
}

/**
 * Combat-elapsed seconds before the fire ring ignites in the FINALE, replacing
 * the authored `match.fireRing.startSec` (60 since #195) for that round only.
 *
 * Owner: 「決賽要給玩家足夠時間真的打一場，而不是一開場就被逼到中間」. Rounds 1-9
 * keep 60 s exactly — this is a per-round substitution in `MatchController`,
 * never an edit to the shipped config doc.
 */
export const ROYALE_FIRE_RING_START_SEC = 180;

/**
 * Combat-phase length for the finale, in seconds.
 *
 * ⚠️ THIS IS NOT DECORATION, it is what makes the 180 s ring reachable at all.
 * `config.match@1` ships `combatMaxSec: 100`, so a finale left on the normal
 * phase clock would be force-settled on team-HP percentages at 100 s and the ring
 * would never ignite — the delay owner asked for would be a number no player ever
 * experiences. 210 s = ignition (180) + the full 20 s shrink + a 10 s tail for
 * the closed ring to finish the job.
 */
export const ROYALE_COMBAT_SEC = ROYALE_FIRE_RING_START_SEC + 30;

/** Classic 4-team round-robin rotation (circle method), repeats every 3 rounds. */
const FOUR_TEAM_SCHEDULE: [number, number][][] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

/**
 * Pair the alive teams for `round` (1-based). 4 alive → two duels; 3 alive →
 * one duel + a bye (rotating); 2 alive → one duel.
 */
export function pairTeams(aliveTeams: readonly TeamId[], round: number): { pairings: DuelPairing[]; bye: TeamId | null } {
  const teams = [...aliveTeams].sort((a, b) => a - b);
  if (teams.length === 4) {
    const sched = FOUR_TEAM_SCHEDULE[(round - 1) % 3]!;
    return {
      pairings: sched.map(([ia, ib], zi) => ({
        zone: zi,
        sideA: teams[ia]!,
        sideB: teams[ib]!,
      })),
      bye: null,
    };
  }
  if (teams.length === 3) {
    const byeIdx = (round - 1) % 3;
    const bye = teams[byeIdx]!;
    const fighters = teams.filter((t) => t !== bye);
    return {
      pairings: [{ zone: 0, sideA: fighters[0]!, sideB: fighters[1]! }],
      bye,
    };
  }
  if (teams.length === 2) {
    return { pairings: [{ zone: 0, sideA: teams[0]!, sideB: teams[1]! }], bye: null };
  }
  return { pairings: [], bye: teams[0] ?? null };
}

// ===========================================================================
// TEAM HEALTH — the LoL-Arena elimination model
// ===========================================================================
//
// The owner picked LoL Arena as the reference and chose its model verbatim:
// 「選1 改成競技場那套 —— 20 點生命值、2/4/6 遞增、第 5 回合起有 High Stakes
// 回血 15」. What replaced what:
//
//   OLD (lives):        3 shared "lives", −1/−1/−2/−2/−3… per lost duel.
//   NEW (team health):  a 20-point pool, −2 (R1-3) / −4 (R4-6) / −6 (R7+),
//                       elimination at 0, and High Stakes rounds that pay the
//                       WINNER +15.
//
// The vocabulary changed with it. "Lives" is a countable arcade token — you
// have three and you spend them one at a time — and the old table matched
// that. A 20-point pool drained 2/4/6 at a time is not lives, it is HEALTH,
// and calling it lives makes every reader mis-model the pacing. `lives` and
// `livesLost` survive only as deprecated aliases below, for the snapshot /
// digest / client readers this lane does not own.
//
// ---------------------------------------------------------------------------
// HOW MUCH OF ARENA'S TABLE PORTS (this was measured, not assumed)
// ---------------------------------------------------------------------------
// Short answer: all of it up to round 7, and none of it after.
//
// GGD is 4 teams × 3; Arena is 8 teams × 2. The instinct is that "two teams
// lose Team Health every round here, not one" makes Arena's escalation too
// fast — but that is the wrong comparison. Arena runs FOUR duels per round and
// so has FOUR losers; the fraction of the lobby that loses is 1/2 in both
// games. The escalation is a per-team drain rate and 1/2 is 1/2, so it ports
// across unchanged.
//
// What genuinely differs is the tail: GGD's `pairTeams` starts giving a BYE at
// 3 alive, so only 1 team in 3 takes damage per round there (and the bye takes
// none). That slows the 3-team phase, not the 4-team phase — and it is why the
// High Stakes rule below is inert on bye rounds rather than paying out into an
// endgame that is already the slowest part of the match, and why the cost keeps
// climbing past round 7 instead of holding at Arena's flat −6
// ({@link TEAM_HEALTH_LATE_STEP} carries the full derivation and the numbers
// that Arena's raw table actually produced here: median 15 rounds, max 26).
//
// MEASURED, 4 teams × 3 bots × 30 seeds on the real MatchController with the
// shipped content (teamHealth.test.ts pins the headline numbers so a future
// tweak cannot silently undo them):
//
//   rounds          min 10, median 11, p90 13, max 13   (10×3 11×13 12×11 13×3)
//   reach round 6   30/30      reach round 7   30/30      over 13 rounds  0/30
//   first elim      round 7 median (7-9)
//   3-team phase    2 rounds median (max 3)
//   2-team tail     2 rounds median (max 5)
//   High Stakes     46 payouts, 17 suppressed by a bye
//
// Round 6 is the gate the 7,500g stat path and the #104 capstone
// (`statStacks >= 20 && round >= 6`) sit behind, and NO match had ever reached
// it at the old 3 lives. It is now reached by every match, with four rounds to
// spare.
//
// ⚠️ WALL CLOCK, the one thing this model does NOT fix: 11 rounds × (a ~194 s
// human combat round + 40 s intermission + 6 s resolution) is ~45 minutes. The
// bot measurement above settles rounds in ~16 s so it does not show this. If
// that is too long for a family sitting, the lever is ROUND LENGTH —
// `match.fireRing.startSec` / `combatMaxSec` in `config.match@1` — not the
// health curve: shortening a round shortens every match proportionally, while
// shortening the curve costs the round-6 economy gate this change just bought.
// ---------------------------------------------------------------------------

/**
 * Team Health lost by a duel's losing team, escalating by round band.
 * Arena's curve: −2 for rounds 1-3, −4 for 4-6, −6 from 7.
 *
 * The escalation is what stops a match cycling forever: it is the drain, and
 * {@link DEFAULT_STARTING_TEAM_HEALTH} is the reservoir. Read the two together
 * — a match's round count is entirely a function of the pair.
 *
 * A team that loses EVERY round dies on round 7 (20→18→16→14→10→6→2→0). That
 * is the floor; winners live longer, and High Stakes stretches them further.
 */
export function teamHealthLost(round: number): number {
  if (round <= 3) return 2;
  if (round <= 6) return 4;
  return 6 + TEAM_HEALTH_LATE_STEP * (round - 7);
}

/**
 * How much the round-7+ cost grows PER ROUND. This is the one number GGD adds
 * to Arena's table, and the measurement that forced it is in the block above.
 * Arena stops escalating at −6 and holds it forever; GGD cannot, for two
 * reasons that have no analogue in Arena:
 *
 *  1. THE TAIL LOSES HALF ITS DRAIN. Arena keeps pairing every survivor, so
 *     half the lobby loses health every round right down to the last duel. GGD
 *     has FOUR teams: at 3 alive `pairTeams` gives a rotating bye, so only 1
 *     team in 3 takes damage; at 2 alive it is 1 in 2 but with a single duel.
 *     Held at a flat −6, the 3-team and 2-team phases are a grind — measured
 *     2-team tails of 5 rounds median, 12 at p90.
 *  2. HIGH STAKES OUTPACES A FLAT COST. +15 to each winner against a flat −6
 *     to each loser is net +18 into a 4-team pool on every High Stakes round.
 *     The reservoir GROWS faster than it drains, so R9 and R13 each push the
 *     ending further away instead of hastening it.
 *
 * Measured on the real MatchController, 30 seeds, 12 bots:
 *   Arena's raw flat −6 …… median 15 rounds, range 13-26; two matches needed
 *                           26 rounds, and the 2-team tail ran 5 rounds median
 *   with +3/round ………… median 11 rounds, range 10-13, 2-team tail 2
 * and on a 20,000-trial abstract Monte Carlo over the same `pairTeams` rules
 * with coin-flip duels (which brackets the real sim from above, since real
 * teams snowball and end sooner):
 *   flat −6 …… median 18, 96% of matches over 13 rounds, 2-team tail 5 (p90 12)
 *   +3/round … median 12,  0% of matches over 13 rounds, 2-team tail 2 (p90 3)
 *
 * Scoping HIGH STAKES instead of the escalation was measured and REJECTED:
 * suppressing the +15 below 3 (or below 4) alive teams still gave median 17,
 * because the inflation that matters happens on round 5 while all four teams
 * are in — by the time the payout could be scoped away, the pool is already
 * too big for a flat −6 to drain.
 *
 * WHY 3 AND NOT 2 OR 4: the cost must eventually EXCEED
 * {@link HIGH_STAKES_REWARD}, or a team that keeps winning the marquee rounds
 * gains health faster than any loss can take it away and the match has no
 * bound at all. At +3 the crossover is round 11 (−18 > +15); at +2 it is round
 * 12 and 7% of matches still ran past 13 rounds; at +4 the crossover is round
 * 10 but the endgame gets abrupt — a 20-health team dies to a single loss.
 * +3 is the gentlest step that closes the hole.
 *
 * NOTE FOR THE OWNER: this is the ONE place the implementation departs from
 * 「20 點生命值、2/4/6 遞增」. The 20 is exact, the 2/4/6 bands are exact, and
 * round 7's cost is exactly Arena's −6. What is new is that −6 keeps climbing
 * afterwards, because 4 teams with byes is not 8 teams without them.
 */
export const TEAM_HEALTH_LATE_STEP = 3;

/**
 * @deprecated Vocabulary alias for {@link teamHealthLost}. The model is team
 * health, not lives. Kept so nothing outside this lane breaks on the rename.
 */
export const livesLost = teamHealthLost;

/** First High Stakes round. */
export const HIGH_STAKES_FIRST_ROUND = 5;
/** …and every 4th round after it (5, 9, 13, …). */
export const HIGH_STAKES_PERIOD = 4;
/** Team Health the WINNER of a High Stakes duel gains. */
export const HIGH_STAKES_REWARD = 15;

/**
 * Is `round` a High Stakes round — the rounds where winning pays +15 Team
 * Health instead of merely not losing any?
 *
 * `hasBye` is NOT decoration. `pairTeams` hands out a rotating bye at 3 alive
 * teams, and a High Stakes round that fires while someone sits out is unfair in
 * a way that is easy to miss:
 *
 *   • pay only the duel winner → the bye team forfeits an expected +7.5 (its
 *     coin-flip share of the +15) in exchange for dodging an expected −3 (its
 *     share of a −6 loss). A bye is normally a GIFT; on a High Stakes round it
 *     would silently become a PENALTY, handed out by a rotation nobody chose.
 *   • pay the bye team too → 2 of the 3 survivors gain +15 while one loses 6,
 *     so the pool GROWS by 24 in the phase of the match that is already the
 *     slowest to converge (1 loser per round instead of 2). That is how a
 *     match stops ending.
 *
 * So a bye round is INERT: nobody gains. Uniform beats rotationally-arbitrary,
 * and it keeps the +15 doing its real job — stretching the 4-team midgame,
 * where the drama is — instead of inflating a 3-team endgame.
 *
 * Deliberately a PURE function of (round, hasBye) rather than a re-armable
 * "deferred" flag: no hidden state means the same match state always produces
 * the same payout, which is what replay determinism requires.
 */
export function isHighStakesRound(round: number, hasBye: boolean): boolean {
  if (hasBye) return false;
  if (round < HIGH_STAKES_FIRST_ROUND) return false;
  return (round - HIGH_STAKES_FIRST_ROUND) % HIGH_STAKES_PERIOD === 0;
}

/**
 * Shared Team Health at match start when content does not say otherwise —
 * Arena's 20, the number the owner chose.
 *
 * The authored value is `match.startingTeamLives` in `config.match@1` (see
 * `phaseConfig.resolveStartingTeamHealth`); this constant is what a bare boot,
 * a unit test, or a mis-schema'd doc falls back to.
 *
 * WHY THE CONTENT KEY IS STILL CALLED `startingTeamLives`: the key is declared
 * in `packages/shared/src/content/schema/config.ts` under a `.strict()` object,
 * is offered by the editor, and is written by `exportContentToJson` — none of
 * which this lane owns. Renaming it would be a cross-lane content migration for
 * zero mechanical gain: it is the same scalar reservoir either way. The CODE is
 * named for what the model is; the content key is left for whoever owns the
 * schema to rename in one sweep.
 *
 * WHY THIS IS NO LONGER 3: the old default was pinned at 3 as the implicit
 * reservoir of every replay recorded before the config knob was wired up. That
 * pin is now moot — the replay player HARD-REFUSES any recording whose
 * `contentVersion` or `registryFingerprint` differs (Player.checkCompatibility),
 * and this change edits `config.match.json` and the augment tree, so every
 * pre-existing recording is already refused before a tick is simulated. What
 * still holds, and is tested, is that `ReplayHeader.startingLives` — not this
 * constant — is what a replay runs on, so a recording always replays on ITS own
 * reservoir. See `replay.test.ts` ("recorded lives survive a config change").
 */
export const DEFAULT_STARTING_TEAM_HEALTH = 20;

/**
 * @deprecated Vocabulary alias for {@link DEFAULT_STARTING_TEAM_HEALTH}.
 */
export const DEFAULT_STARTING_LIVES = DEFAULT_STARTING_TEAM_HEALTH;

/**
 * Upper bound accepted from content. NOT a balance opinion — 20, 30 and 40 pass
 * through untouched. It exists because the knob is a plain integer in an
 * operator-editable JSON doc and the schema only demands `positive()`: a
 * fat-fingered `200` (or `2000`) would produce a match that cannot end inside a
 * human sitting.
 *
 * RE-DERIVED for the team-health scale, because the old bound was derived for
 * lives and 30 lives ≠ 30 health. Cumulative worst-case drain (lose every
 * round) is 2,4,6,10,14,18,24,30,36,42,48… so the round a team can survive to
 * is roughly `6 + (H − 18) / 6` past round 6. At the shipped H = 20 that is
 * round 7; at H = 60 it is round 13 — already a ~50-minute sitting at GGD's
 * ~4-minute rounds, and past the longest LoL Arena game. Anything beyond 60 is
 * certainly a typo, and clamping beats shipping an unfinishable room.
 *
 * ⚠️ THERE IS ALSO A HARD WIRE CEILING, and 60 is chosen to stay under it.
 * `TeamState.lives` is declared `int8` in the Colyseus schema, so the
 * replicated value cannot exceed 127. High Stakes is additive and uncapped: a
 * team that wins rounds 5, 9 and 13 and never loses reaches `H + 45`. At the
 * shipped H = 20 the worst case is 65 (50 was the highest actually measured);
 * at H = 60 it is 105 — inside int8 with room to spare. Raising this past ~80
 * would silently overflow the replicated value into a NEGATIVE number, which
 * every client would read as an eliminated team. Widen
 * `packages/shared/src/protocol/schema.ts` first.
 */
export const MAX_STARTING_TEAM_HEALTH = 60;

/**
 * @deprecated Vocabulary alias for {@link MAX_STARTING_TEAM_HEALTH}.
 */
export const MAX_STARTING_LIVES = MAX_STARTING_TEAM_HEALTH;
