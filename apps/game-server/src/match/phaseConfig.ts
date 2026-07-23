/**
 * phaseConfig — resolve the match PHASE DURATIONS from content instead of
 * hard-coding them, the same way `arenaRules.ts` resolves the round table.
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
