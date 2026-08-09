/**
 * Helpers shared by more than one effect kind. Everything here was lifted
 * VERBATIM out of the pre-split effectRunner switch (GH#289) — same bodies,
 * same comments, same numbers.
 *
 * A helper used by exactly ONE kind stays in that kind's own module (see
 * `areaCentre` in damageArea.ts): the point of the split is that a lane owns a
 * file, and hoisting single-use helpers here would rebuild the shared surface
 * this refactor exists to dissolve.
 */
import type { EntityId, StatusId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AttrLookup, EffectContext, EffectDef } from "./effect";
import { resolveScaling } from "./effect";
import type { Stat } from "../stats/statTypes";
import { liveAttribute } from "../stats/attrSources";
import { clampMarkCount, markExpired } from "../markLimits";

export function casterStats(ctx: EffectContext): Record<Stat, number> {
  return ctx.world.stats.get(ctx.caster)?.final ?? ({} as Record<Stat, number>);
}

/**
 * THE sim-side {@link AttrLookup} — 「施法者的**總**力量/敏捷/智慧現在是多少」。
 *
 * 每一個把 `Scaling` 交給 `resolveScaling` 的效果都必須傳這個(第四個參數是
 * 必填的,理由寫在 `Scaling.attrRatios` 上)。轉呼叫 `stats/attrSources.ts` 的
 * `liveAttribute`,也就是條件編輯器的 力量/敏捷/智慧 下拉、`grantAttribute` 的
 * 上限、以及 效能 文案裡「總敏捷」讀的**同一個**函式 —— 三個地方分歧的話,
 * 玩家看到的數字與 sim 用的數字就會不一樣。
 *
 * 非英雄的身體(部隊、召喚物、測試裸實體)`liveAttribute` 回 `null` → 這裡回 0,
 * 跟 `championStatBase` 對同一種身體的答案一致。
 */
export function casterAttrs(ctx: EffectContext): AttrLookup {
  return (attr, basis) => liveAttribute(ctx.world, ctx.caster, attr, basis) ?? 0;
}

/**
 * Does `id` still carry `statusId` on THIS tick? StatusSystem prunes expired
 * entries at the top of the tick, but it runs before abilities resolve within a
 * tick, so the `> world.tick` re-check is what makes the combo window close on
 * the exact tick the JASS's `TriggerSleepAction(1.00)` would have cleared the
 * marker — one tick either way is a different spell at 30 Hz.
 */
export function hasStatus(world: SimWorld, id: EntityId, statusId: StatusId): boolean {
  const st = world.status.get(id);
  if (st?.effects.some((s) => s.statusId === statusId && s.expiresAtTick > world.tick) === true) {
    return true;
  }
  // ⭐ GH#304 —— 具名標記也算「身上有」。這一行與 {@link statusStacks} 的
  // 同一行是**成對的**：少了它，一個標記型計數器會對「有沒有」說 false、
  // 對「幾層」說 12 —— 而那正是這一段檔頭警告的「條件說有、層數說 0」的分裂，
  // 只是方向相反。⚠️ 出貨零影響：唯一的標記 id 是 `godie-hapm.passive`，
  // 沒有任何內容拿它當 statusId 問。
  return statusStacks(world, id, statusId) > 0;
}

/**
 * `id` 身上這個狀態**現在疊了幾層**（GH#301-5）。沒有 = `0`。
 *
 * ⚠️ 這是 `hasStatus` 的**同一個問題的數字版**，所以到期規則逐字相同
 * （`> world.tick`，理由見 `hasStatus`）—— 兩者對「這一 tick 還算不算」給不同
 * 答案的那一天，會出現「條件說有、層數說 0」的分裂。
 *
 * ⭐ **相加**而不是取最大：兩個不同來源（`sourceId`）各自掛了一筆【破甲】就是
 * 兩筆獨立的標記，而玩家問的是「他身上總共破了幾層」。同一個來源的重複施加已經
 * 在 `applyStatus` 那邊累加成一筆了，所以這裡不會重複計算同一次施加。
 * 總和一樣走 `clampMarkCount` —— 十個來源各 999 層不會溢出成一個荒謬的數字。
 *
 * ⚠️ **缺席的 `stacks` 讀成 1**（見 `components.ts` 的 `StatusEffect.stacks`）：
 * 一份沒寫這一格的舊文件的意思是「他身上有」，而那是一層。
 *
 * 純度：走一個陣列 + 整數加法。沒有 rng、沒有時鐘。
 */
export function statusStacks(world: SimWorld, id: EntityId, statusId: StatusId): number {
  const st = world.status.get(id);
  let n = 0;
  for (const s of st?.effects ?? []) {
    if (s.statusId !== statusId || s.expiresAtTick <= world.tick) continue;
    n += s.stacks ?? 1;
  }
  // ⭐ GH#304 —— **具名標記也是這個計數器**。
  //
  // 兩個儲存（`world.marks` / `world.status[].stacks`）共用**同一個身分空間**：
  // 兩邊的 key 都是「一份既有文件的 id」（`sim/marks.ts` ②）。`net/snapshot.ts`
  // 的 `namedCounters` 早就把同一個 id 的兩邊相加送給客戶端 —— 少了這一行，
  // 引擎自己是唯一**看不到**標記層數的那一個：
  //   · 「敵人身上【試煉】≥ 5 層時追加傷害」(`condition.target-status@1` 的
  //     `minStacks`) 對十二道試煉永遠讀到 0 → 條件永遠不成立；
  //   · 而 HUD 上明明寫著 12。
  // 兩個消費端對同一個問題給不同答案，就是這個 issue 說的「一定會漂」。
  // ⚠️ 到期規則與上面那半**逐字相同**（`markExpired`，而不是自己比大小）——
  // 兩個到期判斷分歧的那一天，會出現「條件說有、層數說 0」的分裂，
  // 而那正是 `hasStatus` / `statusStacks` 這一段檔頭警告過的形狀。
  const mk = world.marks.get(id)?.get(statusId);
  if (mk !== undefined && !markExpired(mk.expiresAtTick, world.tick)) n += mk.count;
  // ⭐ G10 —— **第三本帳：帶 `statusId` 的 `ModifierSource`**（`applyBuff.statusId`）。
  //
  // 【破魔】【破甲】【狂怒】現在是**一個**物件：數值住在 `modifiers`，標記住在
  // 這一格。少了這一段，那個物件會有一半是隱形的 —— 護甲確實在掉，而
  // 「他身上有沒有破甲」永遠讀 false，於是任何讀狀態的條件葉對它全部說謊
  // （失敗形態②），而畫面上護甲確實少了、看起來完全正常。
  //
  // ⚠️ 到期規則跟著 `buffExpirySystem`（`expiresAtTick <= world.tick` 才算沒了、
  // 缺席 = 永久），與上面兩本帳的 `> world.tick` 是同一個判斷的兩種寫法 ——
  // 三者分歧的那一天就會出現這一段檔頭警告的「條件說有、層數說 0」。
  // ⚠️ 層數讀 `stacks`（疊層路徑的層數就是計數器），缺席讀 1。
  const sc = world.stats.get(id);
  for (const s of sc?.sources ?? []) {
    if (s.statusId !== statusId) continue;
    if (s.expiresAtTick !== undefined && s.expiresAtTick <= world.tick) continue;
    n += s.stacks ?? 1;
  }
  return clampMarkCount(n);
}

/**
 * The COMBO-WINDOW addend, resolved against the world AS IT IS RIGHT NOW.
 *
 * "Right now" is the whole point, and it is why the `damage` kind's `bake`
 * exists: in the JASS this term is read at CAST time (`udg_MoonCombo == 2`,
 * j:34189) and added straight into `udg_MoonDamage` (j:34214) — the number is
 * frozen before the 41-tick arc even starts, and the AoE at the far end merely
 * pays out the frozen variable (j:34262). Anything that calls this at PAYOUT
 * time is asking a question the source never asked.
 */
export function comboAddend(
  e: Extract<EffectDef, { kind: "damage" }>,
  ctx: EffectContext,
): number {
  const combo = e.comboBonus;
  if (combo === undefined) return 0;
  if (!hasStatus(ctx.world, ctx.caster, combo.statusId)) return 0;
  return resolveScaling(casterStats(ctx), combo.amount, ctx.rank, casterAttrs(ctx));
}

/**
 * 存款加成 —— `min(標記帶的數字 × coeff, max)`,只在 CASTER 還持有標記時計入。
 *
 * ⚠️ `magnitude` 缺席時回 0 而不是「照樣加 coeff × 某個預設」:一個沒有數字的
 * 標記代表存款沒有被開出來(或已經過期被 statusExpirySystem 清掉),而那時候
 * 玩家並沒有付出任何法力 —— 給他傷害就是憑空發錢。
 *
 * ⚠️ 用 MAX 而不是 SUM:同一個標記在視窗內只會有一筆(spendMana 每次覆寫),
 * 但 `applyStatus` 的疊加語意允許重複條目存在,取最大值讓「多存一次」不會
 * 意外變成乘法。
 */
export function bankedAddend(
  e: Extract<EffectDef, { kind: "damage" }>,
  ctx: EffectContext,
): number {
  const b = e.bankedBonus;
  if (b === undefined) return 0;
  const st = ctx.world.status.get(ctx.caster);
  if (!st) return 0;
  let banked = 0;
  for (const s of st.effects) {
    if (s.statusId !== b.statusId || s.expiresAtTick <= ctx.world.tick) continue;
    if ((s.magnitude ?? 0) > banked) banked = s.magnitude ?? 0;
  }
  if (banked <= 0) return 0;
  return Math.min(banked * b.coeff, b.max);
}
