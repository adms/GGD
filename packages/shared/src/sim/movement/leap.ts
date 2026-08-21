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
import { flightIgnoresObstacles } from "../flight";
import { crossesWalls, policyFor, resolveDisplacementEnd } from "./wallBlock";
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
 *     `relaxBody`, and runs last on the same body),
 *   - ⭐ 2026-08-21 —— it can never end on the FAR SIDE OF A WALL either.
 *     那**不是**同一件事：一道 graybox 牆只有 2 單位厚，所以對面 1.6 單位外的
 *     那個點不在任何障礙物裡、在邊界內、`relaxBody` 一格都不動它 —— 於是每一層
 *     都是對的而組合是空的，玩家看到的是「牆瞬移過去」（owner 2026-08-21，
 *     無限城）。整段機制與它的四格後台開關住在 `movement/wallBlock.ts`。
 *     ⚠️ **唯一的例外是飛行**（GH#490）：一具走路就穿得過牆的身體
 *     （`flight.ts::flightIgnoresObstacles`）位移時照樣穿得過去，否則同一個身體
 *     會被兩個系統用兩種方式對待。⛔ 那不是一個 if —— 它是 `wallBlock.flightExempt`
 *     這一格後台開關，出貨 `true`。
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
export interface LandingOptions {
  /**
   * 弧線的**起點**。省略 = 飛行者現在的位置（每一支自跳都是這樣）。
   * 52-02 蹂躪編年史 覆寫它：JASS 先把受害者拖到施法者身上才丟出去。
   */
  from?: Vec2;
  /**
   * 這是哪一種位移 —— 決定讀 `world.wallBlock` 的哪一格（`blink` / `leap`）。
   * 省略 = `"leap"`（這支函式的原始呼叫者全部是弧線）。
   */
  mode?: "blink" | "leap";
}

export function resolveLandingPoint(
  world: SimWorld,
  flyerId: EntityId,
  requested: Vec2,
  opts?: LandingOptions,
): Vec2 {
  const t = world.transform.get(flyerId);
  if (!t) return { x: requested.x, z: requested.z };
  const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;
  // ⭐ owner 2026-08-21「有許多地圖的牆 瞬移過去」——「終點不在牆裡」不蘊含
  //    「終點在牆的**這一邊**」（一道 graybox 牆只有 2 單位厚，對面 1.6 單位外
  //    的點完全合法）。整段理由與三個決策點寫在 `movement/wallBlock.ts`。
  const rules = world.wallBlock;
  const from = opts?.from ?? t.pos;
  // ⭐ GH#490 —— **在飛的身體是那條規則的合法例外**（owner 2026-08-21
  //    「翔封界 等飛行效果實作」）。判準刻意是 `flightIgnoresObstacles` 而不是
  //    「有沒有飛行」：`MovementSystem` 用**同一個謂詞**決定她走路時穿不穿得過牆，
  //    所以「走得過去卻瞬移不過去」在構造上不可能發生（理由寫在 wallBlock.ts）。
  //    ⛔ 問的是**被位移的那個人**（`flyerId`），不是施法者 —— 52-02 蹂躪編年史
  //    丟的是受害者，而跨不跨得過牆是**那具身體**的性質。
  const end = resolveDisplacementEnd(
    zone,
    from,
    requested,
    t.radius,
    policyFor(rules, opts?.mode ?? "leap", flightIgnoresObstacles(world, flyerId)),
    rules.pillarsBlock,
  );
  const body = { pos: { x: end.pos.x, z: end.pos.z }, radius: t.radius };
  relaxBody(body, zone);
  // ⚠️ `relaxBody` 推的是「離開障礙物」，它不知道牆的哪一邊是**來的那一邊** ——
  //    在一條窄走廊裡它可以把身體從牆前推到牆後，於是這一整個機制在最需要它的
  //    地形上靜默失效（失敗形態 ②）。推完之後**再問一次**，⛔ 不要假設。
  //    夾出來的那個點本來就退開了一個體半徑，所以退回它是安全的，而且下一 tick
  //    `MovementSystem` 的落幕掃描照樣會把身體推出任何殘餘重疊。
  if (end.blocked && crossesWalls(zone, from, body.pos, rules.pillarsBlock)) return end.pos;
  return body.pos;
}

export interface StartLeapOptions {
  /** requested landing point; omit (or pass the caster's own pos) for inPlace */
  to: Vec2;
  /**
   * Where the arc STARTS. Defaults to the flyer's current position, which is
   * true of every self-leap. 52-02 蹂躪編年史 overrides it: the JASS drags the
   * victim to the caster before the throw (j:51755-51763), so the parabola runs
   * from the CASTER's location (j:51765-51767) and the drag is compressed into
   * the takeoff tick.
   */
  from?: Vec2;
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
    from: opts.from ? { x: opts.from.x, z: opts.from.z } : { x: t.pos.x, z: t.pos.z },
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
  // GH#354 —— 位移的統一時刻（見 effects/dash.ts）。⛔ 不取代 `leapStart`：
  // 那一則是客戶端的起跳動畫線索，這一則是內容側的觸發時刻。
  world.emit("displace", { id, mode: "leap" });
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
