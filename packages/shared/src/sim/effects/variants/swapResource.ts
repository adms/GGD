/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

export interface SwapResourceVariant {
  /**
   * 【交換資源】(44-002 交換筆記本)。cast resolve tick 原子交換，
   * 三個決策點都是欄位 —— 見 `sim/effects/swapResource.ts` 檔頭。
   */
  kind: "swapResource";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 決策點①：交換哪一項。省略 = `"health"`（owner 文案的「現存生命」）。 */
  resource?: "health" | "mana";
  /**
   * 決策點②：夾住的下限。省略 = **1**（§16.16 的建議：交換不殺人）。
   * 設 0 = 「交換到 0 就死」，由既有的 `deathSystem` 解算。
   */
  clampMin?: number;
  /**
   * 決策點③：目標失效（死了 / 不存在）時。
   * 省略 = `"abort"`（§16.16 的「全招失敗」）；`"skip"` = 跳過那一個。
   */
  onInvalidTarget?: "abort" | "skip";
}
