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
// ⭐ **唯一**的 origin 解析器（它自己的檔頭逐字寫著「it is the one place origin
// is parsed」）—— ⛔ 不在這裡再寫一份 `startsWith("ability:")`，理由見
// `stats/modifiers.ts:484`。⚠️ 這條 import 與 `combat/damage.ts:30` 的
// `cancelLeap` 形成一個**循環**，而它是安全的：兩邊都只在**函式體內**互相呼叫，
// 模組頂層一個字都沒有跑到對方（`leap.test.ts` / `blink.test.ts` 是證據）。
import { abilityIdOfOrigin } from "../combat/damage";
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

/** 位移的三種來源 —— 三支效果共用**一則** `displace`（`WorldHookSystem.ts:313`）。 */
export type DisplaceMode = "dash" | "leap" | "blink";

/**
 * 這一則講的是位移的哪一個**時刻**。
 *
 *  · `"start"`  —— 位移**開始**，身體還沒動到終點。leap 的起跳 tick 就是這個：
 *                  `nav.override` 剛掛上、`leapPosAt(0,N)` 仍然回起點，弧線還有
 *                  `durationSec` 要飛。
 *  · `"impact"` —— 途中命中。⛔⛔ **今天出貨的三個發射站一個都不送這個值。**
 *                  ⭐ 它是 Codex 契約要求的**詞彙**，⛔ 不是一個已經存在的 beat ——
 *                  編輯器今天寫「位移途中命中時⋯」的內容**永遠不會觸發**
 *                  （第一·五守則：卡片上不可以有說了但不會發生的字）。
 *                  要它就要先做機制（第〇·五守則：盤點 → 按擋住幾支排序 → 做機制）。
 *  · `"end"`    —— 位移**結束**，身體已經在終點上。blink 就是這個：那一則在
 *                  `teleportBody` 成功**之後**才發，而瞬移是**原子**的
 *                  （同一 tick 換座標，中間位置一格都不存在）⇒ 起點與終點同一刻。
 *
 * ⛔⛔ **為什麼 leap 沒有第二則 `end`**：`displace` 接著 `onDashOrBlink`
 * （`WorldHookSystem.ts:313`）⇒ 在落地那一刻補一則 `displace` 會讓每一次跳躍
 * 把玩家的卡片觸發**兩次** ＝ 改變 sim 判定，而這條 lane 逐字禁止那件事。
 * ⭐ 落地那一刻**已經有**兩則外送事件可以接：`leapStart`（起跳，帶 `ticks`／`apex`）
 * 與 `LeapSystem.ts:152` 的 `explosion`（落地，帶落點座標）。
 */
export type DisplacePhase = "start" | "impact" | "end";

/**
 * ⭐⭐ **`displace` 的酬載型別 —— 住在發射站旁邊**（Codex 阻塞清單 P0-5）。
 *
 * ⛔⛔ 為什麼要有這個介面：`SimWorld.emit(type: string, data: Record<string, unknown>)`
 * 與 `EventMessage.data` **都沒有型別** ⇒ 消費端想讀任何欄位就非 `as` 不可，
 * ⭐ 而每一個 `as` 都是一個**靜默的洞**（CLAUDE.md 失敗形態⑧）。
 * ⇒ 兩邊 import 同一個 ⇒ 欄位改名或消失是 **tsc 的紅**。
 *
 * ── 三個發射站，今天只有兩個採用了這個型別 ────────────────────────────────
 * | 發射站 | phase | 已型別化 |
 * |---|---|---|
 * | `movement/leap.ts`（本檔，起跳） | `"start"` | ✅ |
 * | `effects/blink.ts`（瞬移完成） | `"end"` | ✅ |
 * | ⛔ `effects/dash.ts:36` | —— | ⛔ **還沒** —— 它今天只送 `{id, mode}` |
 *
 * ⚠️ ⭐ **那第三個是一個已知的洞**（形態⑧：讀 `ev.data.phase` 會拿到 `undefined`）。
 * 它不在這條 lane 的檔案柵欄裡，所以這裡**宣告**它而不是偷偷修它 ——
 * 守衛 `sim/displaceCueContract.test.ts` 第④條把這個缺口**量出來並釘住**：
 * 修好 dash 的那一位會看到那一條紅，訊息裡寫著要改哪兩行。
 *
 * ── ⛔ 拿不到的那幾格（⛔ 不塞猜的值）─────────────────────────────────────
 *  · `strikeIndex` —— **leap 這一側拿不到**。`startLeap` 收的是
 *    {@link StartLeapOptions}（一個**移動原語**的參數包），⛔ 不是 `EffectContext`，
 *    而段號住在 `EffectContext.sequenceIndex`（唯一的填寫者是 `effects/delayed.ts:423`）。
 *    要它就得在 `StartLeapOptions` 多一格並在**兩個**呼叫點填：
 *    `effects/leap.ts:73` 與 `effects/knockback.ts:316` —— 兩個都在柵欄外。
 *    ⭐ blink 那一側拿得到（它手上就是 `ctx`），所以它有這一格。
 *  · `target`（位移的**對象**）—— ⛔ 沒有第二格，因為 {@link DisplaceEvent.id}
 *    **就是**它：`applyTo:"self"` 時 `id === caster`，`applyTo:"target"`（集結／
 *    拉人／52-02 蹂躪編年史丟受害者）時 `id` 是被丟的那一位而 `caster` 是施法者。
 *    ⇒ `id` + `caster` 已經完整回答了 Codex 的「caster/target」，多一格就是
 *    同一個值的第二個住處（第〇·四守則）。
 */
export interface DisplaceEvent {
  /**
   * **被位移的那一位**。⚠️ 這個鍵名是承重的：`WorldHookSystem.ts:313` 的
   * `actorKey: "id"` 讀它決定【使用位移技後】掛在誰身上。
   */
  readonly id: number;
  /** 哪一種位移 —— 條件葉讀它就能只吃閃現／只吃跳躍。 */
  readonly mode: DisplaceMode;
  /** 見 {@link DisplacePhase}。 */
  readonly phase: DisplacePhase;
  /**
   * 施法者。⚠️ 與 {@link DisplaceEvent.id} **可以不同人** —— 52-02 蹂躪編年史
   * 丟的是受害者（`id` = 受害者，`caster` = 丟的人）。
   */
  readonly caster: number;
  /**
   * 封包的 **provenance 標籤**（`ctx.origin`，例：`"ability:godie-hart.q"`／
   * `"item:…"`／`"basic"`）—— ⛔ **不是座標**（`ShieldGainedEvent.origin` 的
   * 檔頭記著同一個誤讀當場被 tsc 攔下來過）。⭐ 這一格是**唯一的真相**。
   */
  readonly origin: string;
  /**
   * `origin` 解出來的技能 id，非技能來源（道具／普攻／狀態 DoT）是 `null`。
   *
   * ⚠️ ⭐ 它是**衍生值**，唯一的算法是 `abilityIdOfOrigin(origin) ?? null` ——
   * ⛔ 不要手寫、⛔ 不要在消費端再寫第二份 `startsWith("ability:")`
   * （`stats/modifiers.ts:484` 記著為什麼兩份會分岔）。
   *
   * ⚠️ **為什麼仍然帶著它**（`effects/spawnModelFx.ts:286` 逐字寫著「⛔ 不新開
   * 一個欄位」，那條慣例是對**內部**消費端說的）：`displace` 是一份**對外的編輯器
   * 契約**，而外部編輯器 import 不到 `abilityIdOfOrigin`。⭐ 兩份不會分岔，因為
   * 守衛第②條逐則比對 `abilityId === abilityIdOfOrigin(origin) ?? null`。
   */
  readonly abilityId: string | null;
  /**
   * 這次位移**真的**要花多久（秒）。
   * ⚠️ leap 給的是**整數化之後**的 `ticks / TICK_HZ`，⛔ 不是作者寫的 `durationSec`
   * ——「這一格什麼時候結束」問的是引擎真的排了幾個 tick。
   * blink 是 `0`（原子的，同一 tick 就到了）。
   */
  readonly durationSec: number;
  /** 施放的那一格（Q/W/E/R/EX/PASSIVE）。缺席 = 這次執行不是從一格技能來的。 */
  readonly slot?: CastableSlot;
  /**
   * 連段的**第幾刀**，1 起算（＝ `EffectContext.sequenceIndex`，客戶端
   * `VfxScriptPlayer.ts:203` 的 `strikeIndex` 過濾讀的就是同一個號碼）。
   * ⚠️ 缺席 = 這一次執行**不在序列裡**；⛔ leap 那一側結構上拿不到（見檔頭）。
   */
  readonly strikeIndex?: number;
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
  //
  // ⭐ Codex P0-5 —— `phase: "start"` 是**這一行的位置**推導出來的，⛔ 不是挑的：
  // 它在 `nav.override = ov` 的下面、而 `ov.elapsed` 還是 0（`LeapSystem.ts:97`
  // 才開始加），所以身體**一格都還沒飛**。⛔ 這裡刻意沒有第二則 `end`，
  // 理由寫在 {@link DisplacePhase}（多一則 = `onDashOrBlink` 觸發兩次 = 改判定）。
  world.emit("displace", {
    id,
    mode: "leap",
    phase: "start",
    caster: opts.casterId,
    origin: opts.origin,
    abilityId: abilityIdOfOrigin(opts.origin) ?? null,
    // ⭐ 整數化**之後**的那個時長（`leapTicks` 已經夾過 `MIN_LEAP_TICKS`）——
    // 演出要對齊的是引擎真的排的 tick 數，⛔ 不是作者寫的 `opts.durationSec`。
    durationSec: ticks / TICK_HZ,
    ...(opts.slot !== undefined ? { slot: opts.slot } : {}),
  } satisfies DisplaceEvent);
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
