/**
 * ⭐ M2(2026-08-23) 形態閘**改讀狀態** —— 「我現在算不算在替身形態」的唯一答案。
 *
 * ── 它改掉了什麼 ────────────────────────────────────────────────────────────
 * 在這之前這句話只有一種問法：`world.championForm.get(id)?.index === 1`，
 * 也就是**真的換過一整份英雄卡**。於是「變身」在引擎裡結構性地等於
 * `ChampionComp.championId` + `StatsComp.championId` 一起改 —— 而那正是變身態
 * 一切問題的來源：`retiredChampionIds`、白名單、選人、模型、語音、道具全部要
 * 跟著分岔（`ChampionFormSystem` 的檔頭逐字寫著這件事）。
 *
 * ⭐ 現在它是 **OR**：換了身體算，**或者**身上帶著一份被標成「形態」的狀態也算。
 * ⇒ 一次變身可以只是「一個狀態 + 一套視覺」，⛔ 不必換 championId，
 *   而那 7 個寫著 `whileForm:"alternate"` 的 rank 區塊**一個字都不用改**。
 *
 * ── 「哪些狀態算形態」住在 JSON，⛔ 不是這裡的一個 if ──────────────────────
 * 判準是 `status-effect@1.tags` 帶不帶 {@link FORM_STATUS_TAG}。
 * 出貨已經有兩份自己標好了：`content/status-effects/bankai.json`（卍解）與
 * `witch-form.json`。⇒ 要讓第 N 對變身改走狀態，作者做的事是**在那份狀態文件的
 * tags 加一個字**，⛔ 不是來這裡加一行 —— 第〇·五守則：引擎做機制、JSON 做技能。
 *
 * ⭐ 走 `hasStatusTag` 而不是自己掃一遍 `world.status`，是因為那一支多做了兩件
 * 承重的事：① `> world.tick` 的**再**檢查（`StatusSystem` 跑在技能結算之前，
 * 所以「這一 tick 到底還算不算」只有它答得對）；② 宣告的 tag 與**實例推導**的
 * tag 是 OR。⛔ 第二份掃描 = 第二個答案，而它們遲早分歧。
 *
 * ── 到期由誰負責 ────────────────────────────────────────────────────────────
 * 身體那一半靠 `ChampionFormSystem.setBody`（身體的唯一寫入者）重新求值；
 * 狀態那一半沒有唯一寫入者（掛 / 收 / 淨化 / 回合重置四個出口），所以由
 * `sim/statusGatedPassives.ts` 每 tick 對帳 —— ⭐ 而**它的觸發條件也要跟著這一
 * 支放寬**（`whileForm` 也算一種活的閘），⛔ 少了那一半，這條 OR 只會在生成 /
 * 升級 / 變身時被問到，也就是它正要取代的那個東西。
 *
 * purity：純讀元件 + 登錄表，⛔ 無 rng、無時鐘、無三角函式、無 `**`。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { hasStatusTag } from "./content/condition";

/**
 * 一份 `status-effect@1` 用這個 tag 宣告「我就是一種形態」。
 *
 * ⛔ 這不是一份「哪幾支英雄可以變身」的名單（那種東西必然過期）——
 * 它是**一個字的介面**，名單住在 `content/status-effects/*.json` 那一側。
 */
export const FORM_STATUS_TAG = "form";

/** `AbilityPassiveRank.whileForm` 的三個值（`content/schema/effect.ts` 的鏡子）。 */
export type FormGateWant = "any" | "base" | "alternate";

/**
 * 這個實體現在算不算在**替身形態**。
 *
 * 兩個來源是 OR，順序是刻意的：身體那一半是一次 Map 查詢，狀態那一半要走過
 * 身上的狀態陣列，所以已經變身的（26 對舊變身）走的是短路的那一條。
 */
export function inAlternateForm(world: SimWorld, id: EntityId): boolean {
  if ((world.championForm.get(id)?.index ?? 0) === 1) return true;
  return hasStatusTag(world, id, FORM_STATUS_TAG);
}

/**
 * 這一階的形態閘現在放不放行。
 *
 * 缺席 / `"any"` = 不問（這是這格欄位出現之前的每一份被動），所以 1,900 份既有
 * 文件逐位元不變。⭐ `"base"` 是 `"alternate"` 的**否定**而不是第三種問法 ——
 * 兩者共用同一個 {@link inAlternateForm}，⛔ 不可能出現「兩邊都說是」。
 */
export function formGatePasses(
  world: SimWorld,
  id: EntityId,
  want: FormGateWant | undefined,
): boolean {
  if (want === undefined || want === "any") return true;
  return (want === "alternate") === inAlternateForm(world, id);
}

/**
 * 這一階是**活的**閘嗎 —— 也就是「該不該掛」的答案會在同一具身體上翻面。
 *
 * `statusGatedPassives` 用它決定要不要每 tick 對帳這一支。⭐ 形態閘從 M2 起
 * 也算：它的答案現在可以在**沒有任何 setBody**的情況下改變（狀態掛上 / 到期）。
 */
export function isLiveFormGate(want: FormGateWant | undefined): boolean {
  return want !== undefined && want !== "any";
}
