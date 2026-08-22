/**
 * 飛行 (無視碰撞) — 莉娜因巴斯 04-00 翔封界, redesigned by the owner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE SOURCE SAID, AND WHAT THE OWNER REPLACED IT WITH
 *
 * The shipped tooltip promised 「可抵擋負性魔法一次」 — a one-shot spell block on a
 * 50 s cooldown. owner, 2026-07-30:
 *
 *     「改成可以無視碰撞的飛行狀態就好，記得改說明。」
 *
 * So this is not a port, it is a REPLACEMENT, and the descriptions of both
 * copies of the doc (godie-h020 / godie-hjai) are rewritten to promise what the
 * data actually does. Leaving the old sentence in place would be the 「舊文案就是
 * 謊話」 failure CLAUDE.md names explicitly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE COLLISION ACTUALLY LIVES — measured, not assumed
 *
 * `MovementSystem` is the only owner of planar contact, and there are exactly
 * THREE places a body is pushed:
 *
 *   1. `moveWithCollision(body, delta, zone)` in the steering step — stops the
 *      body at a WALL/pillar (`zone.obstacles`).
 *   2. the unit-vs-unit soft separation pass (`separatePair`, and the
 *      `pushOutOfObstacle` branch for STATIC props: flowers + guardians).
 *   3. the post-separation sweep — `pushOutOfObstacle` per obstacle, then
 *      `clampToBoundary`.
 *
 * `world.grid` (the broad phase) is NOT one of them: it is a query index used
 * by targeting and by AoE, and dropping out of it would make the flyer
 * un-attackable, which nobody asked for. That is the trap this file exists to
 * avoid — 「無視碰撞」 must not become 「無敵」.
 *
 * The precedent for all three exemptions already exists and is quoted in
 * MovementSystem: a body mid-LEAP (#247) skips exactly the same three places.
 * 翔封界 is that state made PERMANENT and made CONTENT, rather than a fourth
 * bespoke branch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE BOUNDARY IS THE ONE THING THAT IS *NOT* IGNORED BY DEFAULT
 *
 * The immediate question 「這會不會讓她走出場外／穿過火圈？」 has a specific answer:
 *
 *   · ARENA BOUNDARY — `stayInsideBoundary` ships TRUE, so `clampToBoundary`
 *     still runs on a flyer. Without it she walks off the disc and every
 *     zone-scoped mechanic (duel resolution, `teamAliveInZone`, the minimap)
 *     starts reasoning about a champion who is nowhere.
 *   · THE FIRE RING (#195/#270) is NOT collision at all — `FireRingSystem`
 *     burns whoever is OUTSIDE a shrinking radius. Flight touches none of it,
 *     so a flyer still burns exactly like everybody else. Stated here because
 *     「穿過火圈」 sounds like a collision question and is not one.
 *
 * Both `ignoreUnits` and `ignoreObstacles` are separate fields rather than one
 * boolean because they are separate decisions with different blast radii:
 * walking through BODIES is a duel-positioning change, walking through PILLARS
 * is a map-geometry change, and the owner may well want the first without the
 * second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② THE PLAYER HAS TO SEE IT
 *
 * `hoverHeight` rides the EXISTING `EntityState.h` channel (the one #247's leap
 * writes) — see `apps/game-server/src/net/snapshot.ts`. Deliberately WITHOUT
 * `ENTITY_FLAG.AIRBORNE`: that bit tells the renderer 「suppress locomotion, the
 * body is on a ballistic arc」, and a flyer who WALKS must keep her run cycle.
 * No new schema field, no `defineTypes` append (which is irreversible), and no
 * spend from the single remaining ENTITY_FLAG bit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * Reconciled from state every tick out of a SORTED id list, exactly like
 * `stealthSystem`: a grant can arrive from an innate, an item, an augment, an
 * aura or a 變身, and there is no single "a source attached" event to subscribe
 * to. No rng, no clock, no trig, no `**`. A world where nobody carries a grant
 * leaves `world.flight` empty and every one of the MovementSystem predicates
 * returns false on its first line, so every existing recording is unchanged.
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/**
 * 飛行狀態 as a passive payload. A FOURTH payload kind next to `modifiers` /
 * `auras` / `vision`, and for the same reason `vision` needed to be one:
 * 「碰不碰得到」 is not a number on a stat table and it is not projected onto
 * anybody else.
 */
export interface FlightGrant {
  /**
   * 離地高度, GGD 單位. Purely presentational — nothing in the sim reads it.
   * 0 is legal and means 「無視碰撞但貼著地面走」.
   */
  hoverHeight?: number;
  /** 穿過其他單位 (soft separation + static props). ABSENT = true. */
  ignoreUnits?: boolean;
  /** 穿過牆與柱子 (`zone.obstacles`). ABSENT = true. */
  ignoreObstacles?: boolean;
  /**
   * 仍然被場地邊界夾住. ABSENT = **true**, and that default is the answer to
   * 「會不會飛出場外」. Setting it false is a deliberate 「讓她離開競技場」 choice,
   * which breaks zone-scoped resolution — see the header.
   */
  stayInsideBoundary?: boolean;
}

/** Bounds for the one number a grant carries. */
export const FLIGHT_MAX_HOVER_HEIGHT = 6;

/**
 * ⭐ 飛行的**視覺**（GH#572）—— owner 2026-08-23（逐字）：
 *
 *     「技能說明記得改，不然之前都是寫未實作，
 *       **飛行視覺可以調 3d model 高度與影子變化**」
 *
 * ⇒ 這一支的全部視覺就是他點名的兩件事：**離地高度**（`hoverHeight`，住在
 * 內容文件裡）＋**影子的變化**（下面三格）。⛔ 沒有粒子、沒有翅膀 ——
 * 他明說了做法，⛔ 不要自己發明第三種。
 *
 * ── 為什麼飛行要一條**跟跳躍不同**的影子曲線 ────────────────────────────
 * 跳躍（#247）是**一瞬間**的高度，玩家的眼睛靠「身體離開影子」就讀得出來；
 * 飛行是**整場都成立**的高度，而出貨的跳躍曲線在這個高度上幾乎不動 ——
 * 量到的：`1 / (1 + h × 0.15)` 在 h = 0.45 是 **0.937**，也就是影子只縮 6%。
 * 那正是 owner 說「看不出來」的原因。⇒ 飛行走自己的斜率。
 *
 * ⚠️ 客戶端**分得出兩者**：飛行刻意不點 `ENTITY_FLAG.AIRBORNE`（見上面 ②），
 * 所以 `h > 0 && !airborne` 就是「在飛」。⇒ 跳躍那條路逐位元不變。
 *
 * ⛔ **為什麼是常數而不是一份 `config.flight-visual@1`**：那需要同時動
 * `schema/config/index.ts`、`registries.ts`、admin 的 `configForms.ts` /
 * `store.ts` / `App.tsx` —— 這一批那五個檔全部在別的 lane 手上（第零守則⚡④）。
 * ⭐ 所以三格**集中在這裡一個住處**、由 `flightShadowResponse()` 單一出口供應，
 * 之後要抬進 config 是一次搬家，⛔ 不是去五個檔案裡找散落的字面值。
 */
export const FLIGHT_SHADOW_SHRINK_PER_UNIT = 0.9;
/**
 * 影子縮到這裡就不再縮 —— ⭐ 影子是**位置提示**（「她在哪裡的正上方」），
 * 縮到消失等於把那個提示拿掉，而飛行是永久的。
 */
export const FLIGHT_SHADOW_MIN_SCALE = 0.45;
/** 出貨的落地影子不透明度（`ChampionView` 建立 blob 影子時用的同一個數）。 */
export const FLIGHT_SHADOW_BASE_ALPHA = 0.38;

/**
 * 在飛的那具身體，影子該多大、多淡。
 *
 * 純函式（只有 + − × ÷，符合 `sim/purity.test.ts`），所以客戶端與守衛讀的是
 * **同一條曲線** —— ⛔ 不是兩份會各自漂走的抄寫。
 */
export function flightShadowResponse(height: number): { scale: number; alpha: number } {
  const h = height > 0 ? height : 0;
  const raw = 1 / (1 + h * FLIGHT_SHADOW_SHRINK_PER_UNIT);
  const scale = raw < FLIGHT_SHADOW_MIN_SCALE ? FLIGHT_SHADOW_MIN_SCALE : raw;
  return { scale, alpha: FLIGHT_SHADOW_BASE_ALPHA * scale };
}

/**
 * Is `id` flying right now? The ONE predicate every consumer asks, so the three
 * MovementSystem exemptions can never disagree about who is airborne.
 */
export function isFlying(world: SimWorld, id: EntityId): boolean {
  return world.flight.has(id);
}

/** 這個人可以穿過別的身體嗎 (ABSENT on the grant = yes). */
export function flightIgnoresUnits(world: SimWorld, id: EntityId): boolean {
  const f = world.flight.get(id);
  return f !== undefined && f.ignoreUnits !== false;
}

/** 這個人可以穿過牆與柱子嗎 (ABSENT on the grant = yes). */
export function flightIgnoresObstacles(world: SimWorld, id: EntityId): boolean {
  const f = world.flight.get(id);
  return f !== undefined && f.ignoreObstacles !== false;
}

/**
 * 這個人還要不要被場地邊界夾住 (ABSENT = **yes**).
 *
 * The polarity is deliberately the opposite of the two above: ignoring things
 * is the point of flight, but leaving the arena is a bug wearing a feature's
 * clothes, so the permissive default is "still clamped".
 */
export function flightStaysInBoundary(world: SimWorld, id: EntityId): boolean {
  const f = world.flight.get(id);
  return f === undefined || f.stayInsideBoundary !== false;
}

/** Presentation height for the snapshot, 0 when not flying. */
export function flightHoverHeight(world: SimWorld, id: EntityId): number {
  const h = world.flight.get(id)?.hoverHeight ?? 0;
  if (!(h > 0)) return 0;
  return h > FLIGHT_MAX_HOVER_HEIGHT ? FLIGHT_MAX_HOVER_HEIGHT : h;
}

/**
 * Reconcile `world.flight` against the grants attached to `id`.
 *
 * ⚠️ THIS IS NOT THE ONLY WRITER OF `world.flight` ANY MORE (#247). The 殭屍王
 * is handed a grant directly at spawn because a mob carries no StatsComp and so
 * has no `sources` array to hang one on. `flightSystem` skips mobs for exactly
 * that reason — see the guard in its loop.
 *
 * MAX-NOT-SUM on the height, and OR on each permission: two grants make you
 * fly higher and pass through more, never less. `stayInsideBoundary` is the
 * exception and folds with AND-of-defaults — a single grant that opts out is
 * enough, because opting out is an explicit authoring act and the other grant
 * simply did not say anything about it.
 */
function syncFlightGrants(world: SimWorld, id: EntityId): void {
  const sc = world.stats.get(id);
  let found = false;
  let hover = 0;
  let ignoreUnits = false;
  let ignoreObstacles = false;
  let stayInside = true;
  if (sc) {
    for (const src of sc.sources) {
      if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
      const f = src.flight;
      if (!f) continue;
      found = true;
      const h = f.hoverHeight ?? 0;
      if (h > hover) hover = h;
      if (f.ignoreUnits !== false) ignoreUnits = true;
      if (f.ignoreObstacles !== false) ignoreObstacles = true;
      if (f.stayInsideBoundary === false) stayInside = false;
    }
  }
  if (!found) {
    world.flight.delete(id);
    return;
  }
  world.flight.set(id, {
    hoverHeight: hover,
    ignoreUnits,
    ignoreObstacles,
    stayInsideBoundary: stayInside,
  });
}

/**
 * Slot 1d in `SimWorld.step` — immediately after `stealthSystem`, i.e. after
 * the stat recompute that could have attached a grant and BEFORE
 * `movementSystem` (5), which is the only consumer. Any later and a flyer would
 * be collided-with for one tick after gaining flight; any earlier and a grant
 * attached this tick would not be seen until the next one.
 *
 * Iterates a SORTED id list, never Map insertion order (sim purity).
 */
export function flightSystem(world: SimWorld): void {
  const ids: EntityId[] = [];
  for (const id of world.stats.keys()) ids.push(id);
  ids.sort((a, b) => a - b);
  for (const id of ids) {
    // #247 —— 殭屍王的無視碰撞是 SPAWN 時直接授予的(sim/mobs.summonMobBoss),不是
    // 從 `StatsComp.sources` 推導的,因為一隻怪刻意沒有 StatsComp。今天 `world.stats`
    // 裡永遠不會有 mob,所以這一行看起來是多的 —— 它擋的是「將來有人給怪加了
    // StatsComp」那一天:`syncFlightGrants` 會在那一 tick 找不到任何 `flight` 來源、
    // 把王的授予刪掉,而王只是「又開始被卡住」,沒有任何東西會紅(失敗形狀 ③)。
    // 這條分支有自己的行為守衛:sim/mobBossNoClip.test.ts 的
    // 「a boss that somehow acquires a StatsComp keeps its no-clip」。
    if (world.mob.has(id)) continue;
    syncFlightGrants(world, id);
  }
}
