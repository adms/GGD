/**
 * Fire ring (火圈 / 火環) — the round-pacing hazard. A reasonable combat round
 * should last ~3 minutes; once it reaches the configured start time the fire
 * ring "closes in" and burns every living champion with an escalating,
 * defence-ignoring %-HP true-damage tick, so a stalemate is punished and the
 * round settles by ~3-4 min instead of dragging on.
 *
 * Ramp (the original design): NOTHING for the first grace second, then 1%/s at
 * t+1s, 2%/s at t+2s, 3%/s at t+3s … i.e. per-second rate = stepsElapsed ×
 * `pctPerStep` of each victim's OWN maxHealth, capped at `maxPctPerSec`. At
 * 30Hz a full-HP champion accumulates 1+2+…+k % over k seconds, so ~14 s after
 * the ring ignites (1+…+14 ≥ 100%) even an untouched champion dies — the finish
 * accelerator.
 *
 * SINGLE SOURCE OF TRUTH: the ring's start is `config.match@1`'s
 * `match.fireRing.startSec` (the round-length pacing knob). `combatMaxSec` is
 * only the hard phase backstop and must be >= the ring start (schema-enforced),
 * so the two timers can never be authored into contradiction and the ring
 * always gets room to do its work before the phase force-ends.
 *
 * Lifecycle (mirrors flowers/revives): combat-phase only. The match host arms
 * it on combat entry (`beginCombatFireRing`) and disarms it on round exit
 * (`endCombatFireRing`). The tick loop additionally gates every burn on
 * `world.combatActive`, so the instant a round SETTLES (task #100) the ring
 * stops — it is a LIVE-combat accelerator, never a post-settle grinder.
 *
 * PURITY: no rng, no trig, no wall-clock. Damage is a pure function of the
 * combat-elapsed tick counter and each victim's maxHealth, so two same-seed
 * worlds armed identically stay byte-identical.
 */
import type { SimWorld } from "./SimWorld";

/** Fire-ring rules in TICKS (converted from the config doc's seconds). */
export interface FireRingRules {
  /** combat-elapsed ticks until the ring ignites (the round-length knob). */
  startTicks: number;
  /** ticks per ramp step — the "per second" of the 1%/s, 2%/s … escalation. */
  stepTicks: number;
  /** maxHealth fraction ADDED to the per-second burn rate each step (0.01 = 1%/s). */
  pctPerStep: number;
  /** hard cap on the per-second rate (fraction of maxHealth). */
  maxPctPerSec: number;
}

/** Seconds-based fire-ring config (mirror of config.match@1 `match.fireRing`). */
export interface FireRingConfigLike {
  startSec: number;
  stepSec: number;
  pctPerStep: number;
  maxPctPerSec?: number;
}

/** Convert the seconds-based config block into tick-based sim rules. */
export function fireRingRulesFromConfig(cfg: FireRingConfigLike, dt: number): FireRingRules {
  return {
    startTicks: Math.max(0, Math.round(cfg.startSec / dt)),
    stepTicks: Math.max(1, Math.round(cfg.stepSec / dt)),
    pctPerStep: cfg.pctPerStep,
    // absent cap = no cap (a very large finite factor keeps min() deterministic).
    maxPctPerSec: cfg.maxPctPerSec ?? 1e9,
  };
}

/**
 * The per-SECOND burn rate (fraction of a victim's maxHealth) at
 * `ticksSinceStart` ticks past the ring's ignition. 0 during the grace step,
 * then step×pctPerStep, capped at maxPctPerSec. Pure + branch-only.
 */
export function fireRingRatePerSec(rules: FireRingRules, ticksSinceStart: number): number {
  if (ticksSinceStart < 0) return 0;
  const step = Math.floor(ticksSinceStart / rules.stepTicks);
  return Math.min(rules.maxPctPerSec, step * rules.pctPerStep);
}

/**
 * Combat entry: arm the fire-ring schedule. Clears any stale state and starts
 * the combat-elapsed tick counter at 0. The ring stays dormant (no burn) until
 * the counter reaches `startTicks`.
 */
export function beginCombatFireRing(world: SimWorld, rules: FireRingRules): void {
  world.fireRingRules = rules;
  world.fireRingTicks = 0;
}

/**
 * Combat exit (round end / phase leave): disarm the ring. Idempotent. The
 * counter resets to -1 so a disarmed world's fireRingSystem is a pure no-op
 * (client prediction shadow world, unit tests, legacy boots).
 */
export function endCombatFireRing(world: SimWorld): void {
  world.fireRingRules = null;
  world.fireRingTicks = -1;
}
