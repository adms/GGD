/**
 * 魔力的**地板** —— `Health.mana` 永遠 ≥ 0（GH#733，接手 #185）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼它是一支函式而不是散在各處的 `Math.max(0, …)`
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-27 量到 `hp.mana` 有 **7 個寫入點**，而其中三個沒有地板：
 *
 * | 寫入點 | 有沒有地板（修之前） |
 * |---|---|
 * | `systems/RegenSystem.ts`（每 tick） | ⛔ **沒有** —— 只夾了上限 `Math.min(maxMana, …)` |
 * | `stats/statPipeline.ts`（maxMana 變動時保持比例） | ⛔ **沒有** |
 * | `abilities/abilitySystem.ts`（付施法成本） | ⛔ 沒有（靠 `hp.mana < mana` 的前置閘） |
 * | `abilities/toggle.ts:143`（手動關閉成本） | ✅ `Math.max(0, …)` |
 * | `abilities/toggle.ts`（維持成本） | ✅ 靠 `pool < cost` 的前置閘 |
 * | `effects/spendMana.ts` | ✅ `Math.max(0, …)` |
 * | `effects/manaBarrier.ts` | ⚠️ 只有「整池抵光」那一支寫 `floor` |
 *
 * ⭐ **真正把它扣成負數的是 `RegenSystem`**，⛔ 不是施法：`Stat.ManaRegen`
 * 走完屬性管線之後**可以是負的**（`content/skeleton.ts:53` 自己記著一個
 * `1.6 − 0.07×26 = −0.22` 的例子，而任何一件給負 flat 的道具／增益也做得到），
 * 而出貨的 `mana-economy` 預設 `enforceFloor: false` ⇒ `manaRegenPerSec()`
 * 原樣返回那個負數 ⇒ 每 tick 往下扣，**沒有任何東西接住它**。
 *
 * ⭐ 而 `statPipeline` 的「maxMana 變了就保持比例」是**放大器**：
 * `hp.mana = newMaxMana × (hp.mana / prev.maxMana)` —— 負數乘上變大的上限
 * 會變得**更負**。這就是 #185 實測 `-344/825` 的形狀（負值 ×「上限成長」）。
 *
 * ⚠️ 這條不變量的下游讀者不只有畫面：`abilitySystem` 的 `hp.mana < mana`
 * （夠不夠施法）、`toggle` 的 `pool < cost`（維持得下去嗎）、`condition.ts:658`
 * 的「法力 ≥ N」條件葉 —— 一個負的池子會讓這三個**一起**答錯，而且沒有任何
 * 一處會報錯。⇒ 地板夾在**寫入點**，⛔ 不是在每個讀取端各自補救。
 *
 * PURITY: 只有比較與 `Math.max`／`Math.min`，沒有 `Math.random` / `Date.now` /
 * 三角函式 / `**`（`sim/purity.test.ts` 在守）。
 */

/** 魔力池的地板。⛔ 不是一格可調的欄位 —— 「魔力可以是負的」不是一個設計選項。 */
export const MANA_FLOOR = 0;

/**
 * 把一個**要寫進 `Health.mana` 的值**夾回合法區間。
 *
 * ⚠️ `NaN` 也在這裡被接住：`NaN > 0` 是 false ⇒ 回 {@link MANA_FLOOR}。
 * 一個 NaN 的魔力池會讓**每一個**比較（`<` / `>=`）都回 false，那比負數更難查。
 *
 * @param next    想寫進去的值
 * @param maxMana 上限；省略＝不夾上限（付成本的路徑只會往下走）
 */
export function flooredMana(next: number, maxMana?: number): number {
  if (!(next > MANA_FLOOR)) return MANA_FLOOR;
  if (maxMana !== undefined && next > maxMana) return maxMana > MANA_FLOOR ? maxMana : MANA_FLOOR;
  return next;
}
