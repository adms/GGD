/**
 * 「這個人最近施放了什麼」—— **一份**紀錄，給每一個想問「連續技窗口開著嗎」的
 * 讀端共用（GH#937）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是一支獨立的葉子檔（前例：`effects/hookIcd.ts`）
 *
 * 寫端在 `abilities/abilitySystem.ts`（施法**提交點**），讀端在
 * `content/condition.ts`（`recentCast` 葉子）。兩邊都 import 這一支，所以
 * 「什麼算一次施放」與「多久算最近」只有一個答案。
 *
 * ⛔ 這支只 import **型別**與葉子模組（`intents.ts` 常數陣列、
 * `castApproachState.ts` 的世界內待辦表）—— `hookIcd.ts` 的檔頭記著同一條約束的理由：`effectRegistry`
 * 那條環斷掉時**不是編譯錯誤**，是某個打包順序下一個執行期 `undefined` 的
 * handler。這支接在 abilitySystem 與 condition 之間，兩邊都不能被它拖進環裡。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 上界是**結構性**的，⛔ 不是一格 `maxTrackedCasts` 旋鈕
 *
 * 票文要求「紀錄的保留長度要有上界（⛔ 不可以無限長）」。做成一格數字的話，
 * 那個數字要落三個住處、要有人維護，而且它**答不出「上界是多少才對」**。
 *
 * ⇒ 這裡的紀錄是 **per-slot 的最後一次**：一個身體最多 6 筆
 * （`CASTABLE_SLOTS` = Q/W/E/R/EX/PASSIVE），而那個 6 是**槽位的數目**，
 * ⛔ 不是一個挑出來的容量。同一格按鈕不可能同時在放兩支技能，而「連續技窗口」
 * 問的正是「上一次那一格按下去是什麼時候」—— 環形緩衝多存的那些，沒有任何
 * 讀端問得到。
 *
 * ⚠️ 已知的取捨（寫下來，⛔ 不是漏掉）：變身把同一格的技能換掉之後，舊技能的
 * 紀錄會被新技能的那一次覆蓋。紀錄帶著**當時真的施放的** `abilityId`，所以
 * 「剛剛放的是哪一支」永遠是對的；掉的是「更早以前用這一格放過別支」——
 * 而那超過任何一個連續技窗口的長度。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 到期一律用**絕對 tick**（CLAUDE.md 硬約束）
 *
 * 存的是「那一次施放發生在第幾 tick」，讀端算 `world.tick - tick`。
 * ⛔ 沒有任何遞減計數器，所以⛔ 不需要每 tick 走一遍全部的身體。
 *
 * ⭐ 狀態住 `WeakMap<SimWorld, …>`（前例：`sim/stuckEscape.ts` 的 `escStates`、
 * `combat/hitstopHold.ts` 的 `stuckStates`）—— 世界被丟掉時紀錄跟著走，
 * 而且兩個並存的 world（測試、編輯器預覽）不會互相污染。
 */
import type { EntityId, AbilityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { CASTABLE_SLOTS, type CastableSlot } from "../intents";
import { CAST_APPROACHES } from "./castApproachState";
import type { CastInstance } from "./castInstance";

/** 一次施放：**哪一支**，以及**第幾 tick**（絕對）。 */
export type RecentCast = CastInstance;

/**
 * ⭐ 一個身體最多記幾筆 —— **推導出來的**，⛔ 不是挑的。
 * 讀端的說明與後台文案都引用這一格，所以「上界是多少」不會有第二個答案。
 */
export const RECENT_CAST_MAX_TRACKED = CASTABLE_SLOTS.length;

/** 逐 world 的施放紀錄（前例：`stuckEscape.ts` 的 `escStates`）。 */
const ledgers = new WeakMap<SimWorld, Map<EntityId, Partial<Record<CastableSlot, RecentCast>>>>();
// A serial is identity, not a retained history: completed casts are held only
// by the six recent-slot entries or a still-live deferred payload.
const serials = new WeakMap<SimWorld, number>();
const creditTracking = new WeakSet<SimWorld>();

export function enableCastCreditTracking(world: SimWorld): void {
  creditTracking.add(world);
}

function perWorld(world: SimWorld): Map<EntityId, Partial<Record<CastableSlot, RecentCast>>> {
  let per = ledgers.get(world);
  if (per === undefined) {
    per = new Map();
    ledgers.set(world, per);
  }
  return per;
}

/**
 * 記下一次**已經提交**的施放。
 *
 * ⚠️ 呼叫點只有一個：`castAbility` 走過每一道拒絕閘（not-learned / cooldown /
 * no-mana / out-of-range / recovery）**之後**、`world.emit("abilityCast")` 旁邊。
 * 放在任何一個更早的地方，「最近施放過」就會對著一次**被拒絕的**按鍵回 true，
 * 而那是玩家看得出來、而每一條既有守衛都不會紅的那種缺陷。
 */
export function noteAbilityCast(
  world: SimWorld,
  caster: EntityId,
  slot: CastableSlot,
  abilityId: AbilityId,
): CastInstance {
  const per = perWorld(world);
  let bySlot = per.get(caster);
  if (bySlot === undefined) {
    bySlot = {};
    per.set(caster, bySlot);
  }
  const serial = (serials.get(world) ?? 0) + 1;
  serials.set(world, serial);
  const instance: CastInstance = { caster, abilityId, slot, tick: world.tick, serial, creditedHooks: [] };
  bySlot[slot] = instance;
  if (world.stats.get(caster)?.sources.some(s => s.hooks?.some(h => h.oncePerCast === true))) {
    enableCastCreditTracking(world);
  }
  return instance;
}

/**
 * 那一格按鈕最後一次被放出去是第幾 tick，`null` = 這一場還沒放過。
 *
 * ⚠️ `null`（⛔ 不是 `-Infinity` / 一個很負的 sentinel）：讀端要把「從來沒放過」
 * 與「放過但太久了」寫成**同一個** false，而讓它們在型別上分得開，是為了讓
 * 那個合流是一行看得見的程式，⛔ 不是一次靠常數夠不夠負的算術巧合。
 */
export function lastCastTickInSlot(
  world: SimWorld,
  caster: EntityId,
  slot: CastableSlot,
): number | null {
  return ledgers.get(world)?.get(caster)?.[slot]?.tick ?? null;
}

/**
 * **那一支技能**最後一次被這個身體放出去是第幾 tick，`null` = 沒有。
 *
 * ⚠️ 走 `CASTABLE_SLOTS` 這個**固定陣列**，⛔ 不是 `Object.keys` / Map 迭代 ——
 * `sim/purity.test.ts` 那一族的規矩是「迭代順序不可以是資料結構決定的」。
 * 同一支技能同時掛在兩格（變身／增幅）時取**比較晚**的那一次，因為問題是
 * 「最近」，⛔ 不是「哪一格」。
 */
export function lastCastTickOfAbility(
  world: SimWorld,
  caster: EntityId,
  abilityId: AbilityId,
): number | null {
  const bySlot = ledgers.get(world)?.get(caster);
  if (bySlot === undefined) return null;
  let latest: number | null = null;
  for (const slot of CASTABLE_SLOTS) {
    const rec = bySlot[slot];
    if (rec === undefined || rec.abilityId !== abilityId) continue;
    if (latest === null || rec.tick > latest) latest = rec.tick;
  }
  return latest;
}

/**
 * 這個身體的紀錄全部丟掉 —— 只給測試與「同一個 world 重開一場」用。
 * ⛔ 不在 `removeEntity` 上接線：紀錄是**推導出來的快取**（同一串施放重放會得到
 * 同一份），而它的大小上界是「這一場出現過的身體數 × 6」，⛔ 不會隨時間長大。
 */
export function forgetCasts(world: SimWorld, caster: EntityId): void {
  ledgers.get(world)?.delete(caster);
}

/** Hash provenance before delayed damage diverges. No completed-cast history is kept. */
export function digestCastCredits(world: SimWorld, mix: (n: number) => void): void {
  if (!creditTracking.has(world)) {
    if (![...world.stats.values()].some(s => s.sources.some(src => src.hooks?.some(h => h.oncePerCast)))) return;
  }
  // mix() quantizes and truncates numbers, so encode identity as text to avoid
  // serial 1 and 4097 colliding. JSON also preserves unambiguous field boundaries.
  const row = (value: unknown): void => {
    const text = JSON.stringify(value);
    mix(text.length);
    for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  };
  const cast = (c: CastInstance | undefined): unknown => c === undefined ? null
    : [c.caster, c.abilityId, c.slot, c.tick, c.serial, [...c.creditedHooks].sort()];
  row(["cast-credit-v1", serials.get(world) ?? 0]);
  const ordered = <T>(map: ReadonlyMap<EntityId, T>) => [...map].sort((a, b) => a[0] - b[0]);
  for (const [id, slots] of ordered(ledgers.get(world) ?? new Map())) {
    for (const slot of CASTABLE_SLOTS) if (slots[slot]) row(["recent", id, slot, cast(slots[slot])]);
  }
  for (const [id, p] of ordered(CAST_APPROACHES.get(world) ?? new Map())) {
    row(["approach", id, p.slot, p.targetId, p.suppressCastCredit === true]);
  }
  for (const [id, ab] of ordered(world.abilities)) if (ab.cast) row(["channel", id, cast(ab.cast.castInstance)]);
  for (const [id, p] of ordered(world.projectile)) row(["projectile", id, cast(p.castInstance)]);
  for (const [id, nav] of ordered(world.nav)) if (nav.override?.kind === "leap") row(["leap", id, cast(nav.override.castInstance)]);
  for (const [id, dots] of ordered(world.dot)) {
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      row(["dot", id, i, cast(d.castInstance), d.stackCastInstances?.map(cast) ?? null]);
    }
  }
  for (const [name, queue] of [
    ["delayed", world.delayed], ["randomArea", world.randomArea], ["chain", world.chainLightning],
    ["dashEnd", world.dashOnEnd], ["damage", world.damageQueue],
  ] as const) {
    for (let i = 0; i < queue.length; i++) row([name, i, cast(queue[i]!.castInstance)]);
  }
  for (let i = 0; i < world.damageQueue.length; i++) {
    const list = world.damageQueue[i]!.castInstances;
    if (list) row(["damageContributors", i, list.map(cast)]);
  }
}
