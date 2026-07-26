/**
 * LEAP — the parabolic jump primitive (task #247), ported from the map's own
 * JASS rather than invented.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE CURVE COMES FROM (war3map.j)
 * ---------------------------------------------------------------------------
 * TEN `SetUnitFlyHeightBJ` sites in war3map.j write the SAME idiom:
 *
 *     h(i) = -k * Pow((i - m), 2.00) + A          over i = 1 … 2m-1
 *
 * Ten sites, NINE abilities: A0JZ (AKT戰隊) owns two of them — Trig_AKT_1
 * (j:30802) and Trig_AKT_4_Effect (j:30990), both gated on
 * `GetSpellAbilityId() == 'A0JZ'` (j:30558 / j:31013) — and they are two
 * DIFFERENT arcs, 600 and 400, on two different dummies. The count that matters
 * to the algebra below is the number of (k, m, A) triples, i.e. ten; the table
 * in leap.test.ts has ten rows for exactly that reason.
 *
 *   j:25841 A0J2  龍虎亂舞          k=1.50 m=21 A=600
 *   j:30802 A0JZ  AKT戰隊           k=1.50 m=21 A=600
 *   j:30990 A0JZ  AKT戰隊 (2nd arc) k=1.00 m=21 A=400
 *   j:33716 A0UX  01-02 隕石擊      k=1.50 m=21 A=600
 *   j:34285 A0G3  07-03 列、在、前  k=1.50 m=21 A=600
 *   j:36347 A0IS  76-01 橡膠戰斧    k=1.50 m=21 A=600
 *   j:36757 A0RZ  76-04 巨人迴旋彈  k=10.0 m=11 A=1000
 *   j:39208 A0LZ  40-04 地獄搖滾    k=1.00 m=21 A=400
 *   j:49322 A0JD  77-00 浮雲-旋一閃 k=2.50 m=11 A=250
 *   j:51828 A0U1  52-02 蹂躪編年史  k=3.00 m=11 A=300
 *
 * Substituting u = (i-1)/(2m-2)  (so u ∈ [0,1]) gives i-m = (m-1)(2u-1), hence
 *
 *     h = A - k(m-1)² (2u-1)²
 *
 * and EVERY shipped site satisfies A = k(m-1)² exactly (1.5·400=600,
 * 1.0·400=400, 10·100=1000, 3·100=300, 2.5·100=250). So the whole family
 * collapses to ONE normalised parabola:
 *
 *     h = A · [1 - (2u-1)²] = 4·A·u·(1-u)
 *
 * The GGD primitive is therefore not an approximation of the JASS — it is the
 * same curve, re-parameterised. leap.test.ts asserts this against all TEN
 * (k, m, A) triples at every integer index.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISM (task #247 hard constraint)
 * ---------------------------------------------------------------------------
 *  1. Only + - * / are used. IEEE-754 mandates those four be CORRECTLY ROUNDED,
 *     so every conforming platform produces the identical bit pattern. That
 *     guarantee does NOT hold for Math.sin/cos/pow/exp (ECMA-262 explicitly
 *     permits implementation-defined results), which is why an arc built from
 *     trig is a desync waiting for a different CPU or a V8 upgrade. Not one
 *     transcendental is called here — `k*(N-k)` even replaces the square.
 *  2. The height numerator is an EXACT integer: worst realistic case
 *     4 · 18333 · (43²/4) ≈ 3.4e7, far below 2^53, so the whole formula is one
 *     correctly-rounded division with zero accumulated error.
 *  3. Position and height are ABSOLUTE functions of (from, to, k, N) — never
 *     accumulated. Tick k is independent of how the sim got there, so a hitstop
 *     freeze, a replay seek or a mid-flight snapshot cannot perturb the curve,
 *     and the landing coordinate stays bit-identical to the pre-proved point.
 *  4. Endpoints are BRANCHES, not arithmetic: k>=N returns `to` verbatim and
 *     height 0. The "a leap can never end inside an obstacle" guarantee rests
 *     on that line.
 *  5. No rng: the leap never touches world.rng, so it cannot shift any other
 *     system's rolls by a tick.
 */
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { EffectDef } from "../effects/effect";
import type { CastableSlot } from "../intents";
import type { SimWorld } from "../SimWorld";
import type { LeapOverride } from "../components";
import { relaxBody } from "../collision/resolve";
import { TICK_HZ } from "../../constants";

/** Minimum flight length in ticks — a 1-tick "leap" is a teleport, not an arc. */
export const MIN_LEAP_TICKS = 2;

/**
 * Apex height in MILLI-units at integer tick `k` of an `N`-tick flight.
 * Exact zeros at both ends by branch; `4·A·k·(N-k)/N²` in between — the
 * normalised JASS parabola (see the header).
 */
export function leapHeightMilli(k: number, N: number, apexMilli: number): number {
  if (k <= 0 || k >= N) return 0;
  return (4 * apexMilli * k * (N - k)) / (N * N);
}

/** Height in GGD units at tick `k` (the milli form divided once). */
export function leapHeightAt(k: number, N: number, apexMilli: number): number {
  return leapHeightMilli(k, N, apexMilli) / 1000;
}

/**
 * Planar position at integer tick `k`. Linear in k — a leap crosses terrain, so
 * there is nothing to steer around and nothing to slide along. The k>=N branch
 * returns `to` VERBATIM so the landing coordinate is bit-identical to the point
 * `resolveLandingPoint` already proved legal.
 */
export function leapPosAt(from: Vec2, to: Vec2, k: number, N: number): Vec2 {
  if (k >= N) return { x: to.x, z: to.z };
  if (k <= 0) return { x: from.x, z: from.z };
  return {
    x: from.x + ((to.x - from.x) * k) / N,
    z: from.z + ((to.z - from.z) * k) / N,
  };
}

/**
 * Flight time (seconds, a content constant) → an INTEGER tick budget, derived
 * ONCE at takeoff so both replicas get the same N. `Math.round` is exactly
 * specified by ECMA-262.
 */
export function leapTicks(durationSec: number): number {
  return Math.max(MIN_LEAP_TICKS, Math.round(durationSec * TICK_HZ));
}

/**
 * The LEGAL landing point, resolved ONCE at takeoff — never corrected at
 * touchdown. It pushes a body of the flyer's radius out of every obstacle and
 * back inside the zone boundary, using the SAME two relaxation passes the
 * walker uses (`relaxBody`, exported from collision/resolve.ts so a future
 * change to wall geometry cannot make the leap and the walker disagree).
 *
 * DECISION — a blocked landing point RE-AIMS THE ARC at takeoff. The whole
 * parabola is computed against the corrected `to`, so the body flies to, and
 * lands on, exactly the point it appeared to be heading for. The alternative
 * ("clamp on landing") produces a touchdown snap, which is the ugliest failure
 * mode of leaps in this genre. Consequences, all deliberate:
 *   - it can never end inside an obstacle (`to` was pushed out before flight,
 *     and leapPosAt(N,N) returns `to` verbatim),
 *   - it can never end outside the boundary (the boundary clamp is part of
 *     `relaxBody`, and runs last on the same body).
 *
 * NO RANGE CLAMP LIVES HERE (task #247 follow-up). This function used to take a
 * `maxRange` and clamp `requested` toward the flyer, and the ONE caller passed
 * `len(requested - flyer.pos)` — the distance to the point it was clamping —
 * so the guard could never fire. Deleting it rather than "making it real" is
 * the correct fix, because REACH IS ALREADY BOUNDED UPSTREAM, at cast
 * resolution, where the ability's own range is actually known:
 *   - castType "ground"   — abilitySystem clamps the point with
 *     `clampLen(target - caster, resolveAbilityRange(world, def.range))`,
 *   - castType "targeted" — an out-of-range target is REJECTED outright,
 *   - a thrown victim with no cast point (`applyTo: "target"`, the A0U1 arc)
 *     flies its own `throwDistance`, itself already put through the #136 reach
 *     factor by effectRunner.
 * So every `requested` that reaches a leap is inside the ability's reach before
 * it gets here. A second clamp would also measure from the WRONG origin for a
 * thrown victim — the flyer is the victim, not the caster, and "the victim may
 * not be thrown further than the caster's cast range, measured from where the
 * victim stands" is a rule neither the JASS nor the design has.
 *
 * No mid-flight clamp is needed or wanted either: a zone boundary is a DISC (a
 * radial clamp about zone.center), a disc is convex, and the segment between
 * two interior points lies wholly inside it — so every intermediate position of
 * a straight-line arc is already legal by construction.
 */
export function resolveLandingPoint(world: SimWorld, flyerId: EntityId, requested: Vec2): Vec2 {
  const t = world.transform.get(flyerId);
  if (!t) return { x: requested.x, z: requested.z };
  const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;
  const body = { pos: { x: requested.x, z: requested.z }, radius: t.radius };
  relaxBody(body, zone);
  return body.pos;
}

export interface StartLeapOptions {
  /** requested landing point; omit (or pass the caster's own pos) for inPlace */
  to: Vec2;
  /** apex height in GGD units */
  apexHeight: number;
  /** flight time in seconds (converted to integer ticks here, once) */
  durationSec: number;
  /** landing burst radius, GGD units (0 = no burst) */
  landRadius?: number;
  /** effects run on the LANDING tick, centred on the landing point */
  onLand?: readonly EffectDef[];
  /** who owns the landing effects (may differ from the flyer for thrown targets) */
  casterId: EntityId;
  rank: number;
  origin: string;
  slot?: CastableSlot;
}

/**
 * Begin a leap override on `id`. The landing point must ALREADY be legal —
 * callers run it through `resolveLandingPoint` first (effectRunner does).
 *
 * Reuses `nav.override`'s SLOT (not the dash record) so everything already
 * built around "an override exists" stays correct for free: the override wins
 * over steering and ignores root (MovementSystem :122-124), hitstop freezes it
 * (:85-88), ENTITY_FLAG.DASHING is projected from `nav?.override`, and every
 * death / round-reset path that nulls the override also cancels a leap. One
 * slot also makes "a body can dash OR leap, never both" true by construction.
 */
export function startLeap(world: SimWorld, id: EntityId, opts: StartLeapOptions): boolean {
  const nav = world.nav.get(id);
  const t = world.transform.get(id);
  if (!nav || !t) return false;
  const ticks = leapTicks(opts.durationSec);
  const ov: LeapOverride = {
    kind: "leap",
    from: { x: t.pos.x, z: t.pos.z },
    to: { x: opts.to.x, z: opts.to.z },
    // integer milli-units, computed once — see the determinism note above
    apexMilli: Math.round(opts.apexHeight * 1000),
    ticks,
    elapsed: 0,
    onLand: opts.onLand ? [...opts.onLand] : [],
    rank: opts.rank,
    landRadius: opts.landRadius ?? 0,
    casterId: opts.casterId,
    origin: opts.origin,
    ...(opts.slot !== undefined ? { slot: opts.slot } : {}),
  };
  nav.override = ov;
  // AIRBORNE from the takeoff tick (height is still exactly 0 there, which is
  // why the render side keys "in the air" off the FLAG, not off h > 0).
  world.airborne.set(id, { y: 0 });
  // The takeoff cue (蒼月潮's A0G3 plays gg_snd_moonjump right here, j:34211)
  // and the client's jump-animation trigger. Cosmetic: mutates nothing.
  world.emit("leapStart", {
    id,
    caster: opts.casterId,
    x: ov.to.x,
    z: ov.to.z,
    ticks,
    apex: opts.apexHeight,
  });
  return true;
}

/**
 * Drop a leaper out of the air without detonating it — death, revive, round
 * reset. The corpse falls to y=0 on the same tick, so the #220 dissolve plays
 * on the floor. `onLand` deliberately does NOT run: a killed leaper deals no
 * landing damage.
 */
export function cancelLeap(world: SimWorld, id: EntityId): void {
  const nav = world.nav.get(id);
  if (nav?.override?.kind === "leap") nav.override = null;
  world.airborne.delete(id);
}

/** Is this entity mid-flight (and therefore out of the planar physics world)? */
export function isAirborne(world: SimWorld, id: EntityId): boolean {
  return world.nav.get(id)?.override?.kind === "leap";
}
