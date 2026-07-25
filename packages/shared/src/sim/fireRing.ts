/**
 * Fire ring (火圈 / 火環) — the round-pacing hazard.
 *
 * REDESIGNED (task #195, owner directive):
 *
 *   「火圈出現時間變成 戰鬥開始 60秒，而且是漸漸縮圈，只有在不斷縮小的圈圈才
 *     不會扣血，圈圈外會有激烈火焰，角色被火燒到畫面會變半透明紅，圈圈會花
 *     20秒時間縮到最小沒有生存空間」
 *
 * so the mechanic is now a BATTLE-ROYALE RING, not a global burn timer:
 *
 *   • it ignites 60 s of combat-ELAPSED time in (`startSec`, unchanged in kind
 *     — see THE TRIGGER below, nothing inverted);
 *   • from that instant the ring radius CONTRACTS CONTINUOUSLY from the zone
 *     boundary (24) to `minRadius` (0.5) over `shrinkSec` (20 s) — 0.0392 u per
 *     30 Hz tick, i.e. visually smooth, never a staircase;
 *   • a champion whose WHOLE BODY is inside the ring takes nothing; anyone
 *     outside burns with a %-of-own-maxHealth true-damage rate that ramps with
 *     the shrink progress (4 %/s at ignition → 20 %/s at the end);
 *   • at the end `minRadius - bodyRadius < 0`, so the "inside" test is false for
 *     every champion at every position — 「沒有生存空間」 falls out of the same
 *     arithmetic instead of needing a second rule.
 *
 * WHY minRadius = 0.5 AND NOT 0. A champion's collision radius is 0.6
 * (`spawnChampion.ts`). The safety predicate is WHOLE-BODY-INSIDE:
 * `inner = radius - body.radius; inner > 0 && distSq <= inner*inner`. At 0.5,
 * `inner = -0.1 < 0` → false for everyone, everywhere, with no special case. At
 * 0 the visual would collapse to a point AND "dist exactly 0" would be a
 * measure-zero safe spot; 0.5 leaves a renderable flame cauldron that is
 * provably narrower than a body. Symmetrically, at t = 0 `inner = 23.4`, which
 * is EXACTLY `clampToBoundary`'s `boundaryRadius - body.radius`, so ignition
 * burns nobody — the ring only starts biting as it moves.
 *
 * THE TRIGGER: `startSec` is combat-ELAPSED seconds and always was
 * (`FireRingSystem` counts up from combat entry). #195 changes its VALUE from
 * 180 to 60; it does NOT invert the client's cue derivation
 * (`apps/client/src/audio/fireRingWindow.ts` still derives
 * `combatMaxSec - startSec` seconds-LEFT). `combatMaxSec` comes down to 100
 * with it so the bed swap stays coincident with ignition and the `combat` bed's
 * B-section still gets to play.
 *
 * WHY THE BURN IS NOT SCALED BY combat-env `damageDealt`. The rate is a
 * fraction of the victim's OWN maxHealth, so it is already invariant to the
 * `maxHealth` multiplier and to every stat knob; folding `damageDealt` in would
 * turn a global tuning dial into a silent retiming of the round. The ring is
 * ROUND PACING, not combat — it must keep its 20 s clock whatever the operator
 * does to combat numbers. (It also bypasses armor/MR, shields, the damage queue
 * and kill credit — unchanged from #132, deliberately.)
 *
 * SINGLE SOURCE OF TRUTH: the ring's schedule is `config.match@1`'s
 * `match.fireRing` block. `combatMaxSec` is only the hard phase backstop and
 * must be >= `startSec + shrinkSec` (schema-enforced), so the ring can always
 * finish closing before the phase force-ends.
 *
 * Lifecycle (mirrors flowers/revives): combat-phase only. The match host arms
 * it on combat entry (`beginCombatFireRing`) and disarms it on round exit
 * (`endCombatFireRing`). The tick loop additionally gates every burn on
 * `world.combatActive`, so the instant a round SETTLES (task #100) the ring
 * stops — it is a LIVE-combat accelerator, never a post-settle grinder — and,
 * per zone, on `world.settledZones` (task #216), so a duel that finished EARLY
 * stops burning its survivors instead of grinding them down while the other
 * zone is still fighting (that grind is what the owner saw from the shop).
 *
 * PURITY: no rng, no trig, no transcendentals, no wall-clock. The radius is a
 * pure function of the tick COUNTER (never accumulated `r -= step`, which would
 * be a function of tick HISTORY and could drift), built from one subtract, one
 * divide, one multiply and one add — all IEEE-correctly-rounded, hence
 * byte-identical across replicas.
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import { distSq } from "./math/vec2";

/** Fire-ring rules in TICKS (converted from the config doc's seconds). */
export interface FireRingRules {
  /** combat-elapsed ticks until the ring ignites (the round-length knob). */
  startTicks: number;
  /** ticks the ring takes to contract from the zone boundary to `minRadius`. */
  shrinkTicks: number;
  /** the fully-closed radius. Below a champion's body radius, on purpose. */
  minRadius: number;
  /** per-second burn (fraction of maxHealth) the instant the ring ignites. */
  burnPctPerSecStart: number;
  /** per-second burn (fraction of maxHealth) once the ring is fully closed. */
  burnPctPerSecEnd: number;
  /** hard cap on the per-second rate (fraction of maxHealth). */
  maxPctPerSec: number;
}

/** Seconds-based fire-ring config (mirror of config.match@1 `match.fireRing`). */
export interface FireRingConfigLike {
  startSec: number;
  shrinkSec?: number;
  minRadius?: number;
  burnPctPerSecStart?: number;
  burnPctPerSecEnd?: number;
  maxPctPerSec?: number;
}

/**
 * Convert the seconds-based config block into tick-based sim rules. The
 * seconds→ticks conversion happens ONCE, here, at arm time — never per tick, so
 * no per-tick division can round differently on a different host.
 */
export function fireRingRulesFromConfig(cfg: FireRingConfigLike, dt: number): FireRingRules {
  return {
    startTicks: Math.max(0, Math.round(cfg.startSec / dt)),
    shrinkTicks: Math.max(1, Math.round((cfg.shrinkSec ?? 20) / dt)),
    minRadius: cfg.minRadius ?? 0.5,
    burnPctPerSecStart: cfg.burnPctPerSecStart ?? 0.04,
    burnPctPerSecEnd: cfg.burnPctPerSecEnd ?? 0.2,
    // absent cap = no cap (a very large finite factor keeps min() deterministic).
    maxPctPerSec: cfg.maxPctPerSec ?? 1e9,
  };
}

/**
 * THE SHRINK LAW. Ring radius `ticksSinceStart` ticks past ignition, closing
 * from `zoneRadius` to `rules.minRadius` over `rules.shrinkTicks`.
 *
 * `zoneRadius` is the ZONE's `boundaryRadius` — arena geometry, NOT an ability
 * radius, so it is deliberately not multiplied by `combatEnv.abilityRange`.
 *
 * `k` is the clamped progress in TICKS. Pure and monotonic non-increasing, with
 * no transcendentals: an eased curve (pow/exp) is the one thing that would pass
 * the purity gate today and still be genuinely platform-variable.
 */
export function fireRingRadius(
  rules: FireRingRules,
  ticksSinceStart: number,
  zoneRadius: number,
): number {
  if (ticksSinceStart <= 0) return zoneRadius;
  const k = ticksSinceStart < rules.shrinkTicks ? ticksSinceStart : rules.shrinkTicks;
  return zoneRadius + (rules.minRadius - zoneRadius) * (k / rules.shrinkTicks);
}

/**
 * The safety predicate: is a body of radius `bodyRadius`, sitting
 * `distSqToCenter` (SQUARED) from the zone centre, WHOLLY inside a ring of
 * `radius`?
 *
 * `inner <= 0` is the fully-closed case — false for everyone, no special case,
 * which is literally 「沒有生存空間」. The comparison is exact (`<=`) on both
 * replicas: no hysteresis, because hysteresis would make the answer depend on
 * history rather than on the tick.
 */
export function fireRingIsSafe(
  radius: number,
  bodyRadius: number,
  distSqToCenter: number,
): boolean {
  const inner = radius - bodyRadius;
  return inner > 0 && distSqToCenter <= inner * inner;
}

/**
 * The per-SECOND burn rate (fraction of a victim's maxHealth) at
 * `ticksSinceStart` ticks past ignition — for champions OUTSIDE the ring only.
 *
 * Ramps LINEARLY with the shrink progress (not a step staircase), so the punish
 * for standing outside grows exactly as fast as the space runs out: 4 %/s at
 * ignition → 20 %/s once closed. Step out at ignition and never come back and
 * ∫(0.04 + 0.008t)dt reaches 1 at t ≈ 11.6 s; a 3-second panic detour costs
 * ~13 % HP. Pure + branch-only.
 */
export function fireRingRatePerSec(rules: FireRingRules, ticksSinceStart: number): number {
  if (ticksSinceStart < 0) return 0;
  const p =
    rules.shrinkTicks > 0 ? Math.min(1, Math.max(0, ticksSinceStart / rules.shrinkTicks)) : 1;
  const rate = rules.burnPctPerSecStart + (rules.burnPctPerSecEnd - rules.burnPctPerSecStart) * p;
  return Math.min(rules.maxPctPerSec, rate);
}

/**
 * The ring radius RIGHT NOW for `zone`, DERIVED — never stored. A disarmed or
 * dormant ring reads as the full zone boundary, so a client that renders this
 * unconditionally draws the un-shrunk rim rather than a phantom hazard.
 *
 * Snapshot encoding and the replay host-digest both call this, so the number on
 * the wire is the same number the burn was evaluated against.
 */
export function currentFireRingRadius(world: SimWorld, zone = 0): number {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0];
  const zoneRadius = zoneDef?.boundaryRadius ?? 0;
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0) return zoneRadius;
  return fireRingRadius(rules, world.fireRingTicks - rules.startTicks, zoneRadius);
}

/**
 * Is entity `id` being burned by the ring THIS tick? The exact predicate
 * `fireRingSystem` applies, exported so the snapshot's `ENTITY_FLAG.BURNING`
 * (which drives the client's red screen wash) can never drift from the damage
 * that justifies it.
 */
export function isBurnedByFireRing(world: SimWorld, id: EntityId): boolean {
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0 || !world.combatActive) return false;
  if (world.fireRingTicks < rules.startTicks) return false;
  const t = world.transform.get(id);
  if (!t) return false;
  // #216: a zone whose duel is already decided does not burn (FireRingSystem
  // skips it), so the BURNING flag must not claim it does.
  if (world.settledZones.has(t.zone)) return false;
  const zoneDef = world.arena.zones[t.zone] ?? world.arena.zones[0];
  if (!zoneDef) return false;
  const radius = fireRingRadius(
    rules,
    world.fireRingTicks - rules.startTicks,
    zoneDef.boundaryRadius,
  );
  return !fireRingIsSafe(radius, t.radius, distSq(t.pos, zoneDef.center));
}

/**
 * Combat entry: arm the fire-ring schedule. Clears any stale state and starts
 * the combat-elapsed tick counter at 0. The ring stays at the full zone
 * boundary (and burns nobody) until the counter reaches `startTicks`.
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
