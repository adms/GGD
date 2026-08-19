/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { Stat } from "../../stats/statTypes";
import type { IncomingBasis } from "../effect";

export interface EventValueConversionVariant {
  /**
   * 【事件數值轉換】(15-002 太陰道 · 59-01 吞噬)。
   * ⚠️ `basis` 待 owner freeze（計畫 §16.12）—— 見
   * `sim/effects/eventValueConversion.ts` 檔頭。
   */
  kind: "eventValueConversion";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /**
   * 轉換誰。省略 = `"incomingDamage"`（`EffectContext.incoming`，
   * 缺席時**整條不執行**）。`"targetCurrentHealth"` = 目標當下的生命。
   */
  source?: "incomingDamage" | "targetCurrentHealth";
  /**
   * `source:"incomingDamage"` 讀哪一個讀數。省略 = `"mitigated"`。
   * ⚠️ **待 freeze**（計畫 §16.12），所以它是欄位不是寫死。
   */
  basis?: IncomingBasis;
  /** 轉換比例。1 = 等量。 */
  ratio: number;
  /** 轉成什麼。省略 = `"mana"`（太陰道的「轉化為自身魔力」）。 */
  to?: "mana" | "health";
  /** 誰收。省略 = `"self"`。 */
  who?: "self" | "target";
  /**
   * 「以及**短暫**加成至 AP」—— 一個限時的 flat 屬性來源。
   * `ratio` 省略時沿用外層的 `ratio`（兩件事同一個數值的兩種用途）。
   */
  buff?: { stat: Stat; durationSec: number; ratio?: number };
}
