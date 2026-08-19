/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

export interface ConvertTeamVariant {
  /**
   * 【陣營轉換】（大師球，[EX∅ 根源]）—— 把一隻單位暫時借到自己這一隊。
   * 三顆 flag bit 的編解碼在 `protocol/schema.ts`，狀態在 `sim/mindControl.ts`。
   */
  kind: "convertTeam";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  radiusTier?: string;
  /** 什麼時候歸位。省略 = `"death"`。 */
  until?: "death" | "duration" | "roundEnd";
  /** 借多久（秒）。只有 `until:"duration"` 讀得到。 */
  durationSec?: number;
  /** 同時能控幾隻。省略 = 2。 */
  maxHeld?: number;
  /** 同一個受害者一回合能不能被重捕。省略 = `true`（不能）。 */
  oncePerRoundPerVictim?: boolean;
  /**
   * ⚠️ 勝負語意的開關（拿給 owner 的那一格）。省略 = `true` = 今天的行為。
   * 完整推導在 `content/schema/effect.ts` 的同名欄位。
   */
  countsForOriginalTeam?: boolean;
}
