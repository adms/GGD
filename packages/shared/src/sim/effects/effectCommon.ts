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
import { Stat as StatEnum } from "../stats/statTypes";
import { apRatiosSuppressed } from "../combat/apDamageScaling";
import { liveAttribute } from "../stats/attrSources";
import { clampMarkCount, markExpired } from "../markLimits";
import { len, normalize, sub, type Vec2 } from "../math/vec2";

/**
 * ⭐ 「這條線往哪裡指」—— `damageLine.aim` 與 `delayed.advance.dir` 的**同一份**
 * 解析（它從 `damageLine.ts` 的私有 `lineDir` 搬上來，理由就是本檔檔頭那一句：
 * 一個只有一個 kind 用的 helper 住在那個 kind 自己的檔裡，用第二次就上來）。
 *
 * · `"target"`（預設）—— 從施法者**穿過**觸發這個效果的那個身體。穩：它不依賴
 *   面向轉完，而 #275（瞄準優先）之後那件事在揮出的那一 tick 真的不保證。
 * · `"facing"` —— 身體當下的面向。「面前」的字面讀法，也是**沒有單一受害者**
 *   的那種施放（一條沿面向推出去的波）唯一對的答案。
 *
 * ⛔ `"target"` 找不到目標時退回**面向**，⛔ 不是回 undefined —— 一條安靜消失的
 * 線是失敗形態②穿著一格設定。回 undefined 只發生在施法者連 transform 都沒有
 * （已經離場）或面向是零向量。
 *
 * purity：`normalize` / `sub` / `len`，⛔ 無三角函式、無 `**`、無時鐘。
 */
export function aimDirection(
  aim: "facing" | "target" | undefined,
  ctx: EffectContext,
): Vec2 | undefined {
  const from = ctx.world.transform.get(ctx.caster);
  if (!from) return undefined;
  if (aim !== "facing") {
    const tid = ctx.targets[0];
    const tt = tid !== undefined ? ctx.world.transform.get(tid) : undefined;
    if (tt) {
      const to = sub(tt.pos, from.pos);
      if (len(to) > 1e-6) return normalize(to);
    }
  }
  const f = from.facing;
  if (len(f) > 1e-6) return normalize(f);
  return undefined;
}

export function casterStats(ctx: EffectContext): Record<Stat, number> {
  return ctx.world.stats.get(ctx.caster)?.final ?? ({} as Record<Stat, number>);
}

/**
 * ⭐ 傷害葉專用的施法者屬性表 —— `apRatioMode: "replace"` 的**唯一**落地點。
 *
 * `"stack"`（出貨）時它**就是** {@link casterStats}，同一個物件、零複製、
 * ⇒ 對今天每一場比賽逐位元等價。
 *
 * `"replace"` 時（owner 判定「乘法一層就夠、加法那層拿掉」）它回一份把 `ap`
 * 摀成 0 的**副本**，於是 `Scaling.ratios` 裡 `{stat:"ap"}` 那一條算出 0，
 * 而 `flat` / `perRank` / 其他 `ratios` / `attrRatios` **一格都不動**。
 *
 * ⛔ 為什麼是「摀」而不是「刪內容」：那 115 條係數是作者資料（分佈 0.1…7.0），
 * 刪掉就回不去了，而一個回不去的開關不是開關。摀是執行期的，切回來下一場就恢復。
 *
 * ⛔ 為什麼只有傷害葉：一支跟著法強長的**治療**或**護盾**與「技能傷害怎麼吃 AP」
 * 是兩件事 —— 把它們一起摀掉會讓一個講傷害的旋鈕靜默改掉補師的數字。
 *
 * ⚠️ 判定用的是 `ctx.origin`（同一支 `originInScope`），⛔ 不是第二份
 * `startsWith("ability:")` —— 理由逐字見 `combat/damageTypeOverride.ts` 的檔頭。
 */
export function casterDamageStats(ctx: EffectContext): Record<Stat, number> {
  const stats = casterStats(ctx);
  if (!apRatiosSuppressed(ctx.world, ctx.origin)) return stats;
  return { ...stats, [StatEnum.AbilityPower]: 0 };
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
  /**
   * ⭐⭐ `ratios[].when` 的求值器 —— **依賴注入**（2026-09-03）。
   * ⛔ 這個檔不可以自己去建它：`content/condition.ts` **已經 import 這個檔**
   * （`hasStatus` / `statusStacks`）⇒ 反向 import 是一個環，
   * 而同型的環在這個 repo 炸過三次。⇒ 由呼叫端（`damage.ts`）傳進來。
   * ⚠️ 缺席 ⇒ `resolveScaling` fail-closed ⇒ 帶條件的那幾筆**不計入**。
   */
  holds?: (cond: Parameters<NonNullable<Parameters<typeof resolveScaling>[4]>>[0]) => boolean,
): number {
  const combo = e.comboBonus;
  if (combo === undefined) return 0;
  if (!hasStatus(ctx.world, ctx.caster, combo.statusId)) return 0;
  // ⭐ `casterDamageStats` 而不是 `casterStats`：連擊窗加成**是傷害**，
  // 少了這一個字，`apRatioMode: "replace"` 就只摀掉主體、漏掉連擊那一項 ——
  // 一個「只有一半生效」的開關比沒有開關更難查。
  return resolveScaling(casterDamageStats(ctx), combo.amount, ctx.rank, casterAttrs(ctx), holds);
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
