/**
 * phaseConfig — resolve the match PHASE DURATIONS (and the two other
 * `config.match@1` knobs that shape a match's clock: the fire ring and the
 * starting team lives) from content instead of hard-coding them, the same way
 * `arenaRules.ts` resolves the round table.
 *
 * ---------------------------------------------------------------------------
 * WHY (task #38): the prep window was a hard-coded number in the WRONG PLACE
 * ---------------------------------------------------------------------------
 * `content/config/config.match.json` has carried `match.champSelectSec /
 * intermissionSec / combatMaxSec / resolutionSec` since the content pipeline
 * landed, the `config@1` Zod schema validates them, and the editor offers them
 * for editing — but NOTHING READ THEM. `MatchRoom.onCreate` passed
 * `DEFAULT_PHASE_CONFIG` literally, so the real prep window was the constant in
 * `PhaseMachine.ts` and the content doc was decoration. Editing the JSON (or
 * the admin/editor field) changed nothing, which is worse than an honest
 * constant: it looks configurable and silently is not.
 *
 * The durations are NOT in `constants.ts` (that owns TICK_HZ / seat counts) and
 * NOT in `arena-rules.json` (that owns per-ROUND grants, augment tiers and
 * unlock rounds — a different axis: what a round GIVES, not how long a phase
 * LASTS). `config.match@1` is where they already are declared, so this makes
 * that declaration load-bearing rather than adding a fifth home for a timer.
 *
 * Seconds → TICKS happens here, once, against the authoritative TICK_HZ, so the
 * PhaseMachine keeps running on tick counts (deterministic, never wall clock).
 * A missing/mis-schema'd doc — unit tests, a bare skeleton boot — falls back to
 * {@link DEFAULT_PHASE_CONFIG} exactly as before.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import { Configs } from "@ggd/shared/content";
import type { ConfigMatchDoc, FireRingConfig } from "@ggd/shared/content";
import { DEFAULT_PHASE_CONFIG, type PhaseConfig } from "./PhaseMachine";
import { DEFAULT_STARTING_TEAM_HEALTH, MAX_STARTING_TEAM_HEALTH } from "./PairedDuels";

/** The seconds block of `config.match@1` this module consumes. */
export interface PhaseSeconds {
  champSelectSec: number;
  intermissionSec: number;
  combatMaxSec: number;
  resolutionSec: number;
}

/**
 * Lower bound on any phase, in ticks. A phase of 0 ticks would expire on the
 * tick it is entered (PhaseMachine.tickTimer returns true at 0), so a doc that
 * rounds to nothing would spin the match through its phases in a few frames.
 * One tick is the smallest value that still advances normally.
 */
const MIN_PHASE_TICKS = 1;

const toTicks = (seconds: number, fallback: number): number => {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.max(MIN_PHASE_TICKS, Math.round(seconds * TICK_HZ));
};

/** Convert an authored seconds block into the PhaseMachine's tick config. */
export function phaseConfigFromSeconds(
  sec: Partial<PhaseSeconds>,
  fallback: PhaseConfig = DEFAULT_PHASE_CONFIG,
): PhaseConfig {
  return {
    champSelectTicks: toTicks(sec.champSelectSec ?? NaN, fallback.champSelectTicks),
    intermissionTicks: toTicks(sec.intermissionSec ?? NaN, fallback.intermissionTicks),
    combatMaxTicks: toTicks(sec.combatMaxSec ?? NaN, fallback.combatMaxTicks),
    resolutionTicks: toTicks(sec.resolutionSec ?? NaN, fallback.resolutionTicks),
  };
}

/**
 * The ACTIVE phase config: the `config.match@1` doc when the content tree is
 * loaded (boot), otherwise the built-in defaults. Called once per match at
 * room creation, so the durations are frozen for the match's lifetime — a
 * mid-match content reload can never retime a phase under a running sim.
 */
export function resolvePhaseConfig(): PhaseConfig {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  if (!doc || doc.schema !== "config@1" || !doc.match) return DEFAULT_PHASE_CONFIG;
  return phaseConfigFromSeconds(doc.match);
}

/**
 * The ACTIVE fire-ring schedule (task #132) — the round-pacing accelerator that
 * lives in `config.match@1`'s `match.fireRing` block, next to `combatMaxSec`
 * (its single source of truth for round length: `startSec` is the intended
 * round length and the schema forbids it exceeding `combatMaxSec`). Resolved
 * ONCE per match at room creation and handed to the MatchController, which arms
 * it on combat entry via `beginCombatFireRing`.
 *
 * Returns null when the doc / block is absent (unit tests, a skeleton boot, or
 * an operator who authored no ring): the MatchController then never arms the
 * ring, exactly the legacy behavior. Kept SEPARATE from resolvePhaseConfig so
 * the ring is a pure additive: a match with fire-ring config still resolves its
 * phase durations identically.
 */
export function resolveFireRing(): FireRingConfig | null {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  if (!doc || doc.schema !== "config@1" || !doc.match?.fireRing) return null;
  return doc.match.fireRing;
}

/**
 * The ACTIVE starting TEAM HEALTH — `match.startingTeamLives` in `config.match@1`.
 *
 * NAME MISMATCH, ON PURPOSE. The model is LoL Arena's Team Health (a 20-point
 * pool drained 2/4/6 per lost duel), not lives; the code says so, the content
 * key does not. The key is declared in a `.strict()` Zod object in
 * `packages/shared/src/content/schema/config.ts`, offered by the editor, and
 * written by `exportContentToJson` — none of which this lane owns — so renaming
 * it would be a cross-lane content migration for zero mechanical gain. It is
 * the same scalar reservoir under either spelling. See
 * `PairedDuels.DEFAULT_STARTING_TEAM_HEALTH`.
 *
 * SAME BUG AS #38, one field over. The key has been in the doc since the content
 * pipeline landed, `zConfigMatchDoc` validates it as a positive int, and the
 * editor offers it — but `MatchRoom.onCreate` passed a literal `3` to the
 * MatchController, so the authored value was decoration. Worse than the phase
 * durations were, in fact: this is the single knob that sets HOW LONG A MATCH
 * IS (round count = reservoir / drain, see PairedDuels.teamHealthLost), so the
 * owner had the match-length dial in his hands and turning it did nothing. That
 * is fixed, and the team-health rewrite deliberately did NOT reintroduce it:
 * the 20 is authored in `config.match.json`, not hardcoded here.
 *
 * Resolved ONCE per match at room creation, exactly like the phase durations and
 * the fire ring, and then frozen: the MatchController seeds `this.teamHealth`
 * from it in the constructor, so a mid-match content reload can never hand a
 * running match a different reservoir than the one its rounds have been draining.
 *
 * FALLBACK is {@link DEFAULT_STARTING_TEAM_HEALTH} for an absent / mis-schema'd
 * doc — a skeleton boot or a unit test still gets a playable match.
 *
 * REPLAY. This function is deliberately NOT called on the playback path.
 * `ReplayHeader.startingLives` records what the match actually ran on, and
 * `replay/Player.reset` feeds that recorded number back to the MatchController.
 * So a replay taken at 3 still plays at 3 after the live config moves to 20 —
 * see `replay.test.ts` ("recorded lives survive a config change").
 */
export function resolveStartingTeamHealth(): number {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const authored = doc?.schema === "config@1" ? doc.match?.startingTeamLives : undefined;
  if (typeof authored !== "number" || !Number.isFinite(authored)) return DEFAULT_STARTING_TEAM_HEALTH;
  // Non-integers and 0/negatives can only reach here from an unvalidated doc
  // (Configs.tryGet is not re-validated at read time); floor + clamp rather than
  // throw, so a bad edit degrades to a playable match instead of a dead room.
  const n = Math.floor(authored);
  if (n < 1) return DEFAULT_STARTING_TEAM_HEALTH;
  return Math.min(MAX_STARTING_TEAM_HEALTH, n);
}

/**
 * @deprecated Vocabulary alias for {@link resolveStartingTeamHealth}. `MatchRoom`
 * (another lane's file) calls this name; the alias keeps the rename from
 * reaching across the boundary.
 */
export const resolveStartingLives = resolveStartingTeamHealth;
