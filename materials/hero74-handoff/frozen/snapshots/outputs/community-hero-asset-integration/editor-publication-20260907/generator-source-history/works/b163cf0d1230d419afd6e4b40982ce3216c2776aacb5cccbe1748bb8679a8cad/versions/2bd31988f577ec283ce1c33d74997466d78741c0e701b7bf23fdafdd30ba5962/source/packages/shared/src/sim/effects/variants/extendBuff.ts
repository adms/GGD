/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { IncomingBasis } from "../effect";

export interface ExtendBuffVariant {
  /**
   * 【受傷延長增益】(52-01 狂戰士之怒)。
   * ⭐ **無狀態**：延長量是這一發傷害的連續比例，不是累積計數器 ——
   * 理由（以及「現有詞彙為什麼組不出來」的逐條結論）見
   * `sim/effects/extendBuff.ts` 檔頭①②。
   */
  kind: "extendBuff";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`who:"self"` 時它不參與解析。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 延長誰身上的。省略 = `"self"`。 */
  who?: "self" | "target";
  /** 要延長的那個 buff 的 `applyBuff.stackKey`。 */
  stackKey: string;
  /** 滿一份門檻延長幾秒。52-01 = 2。 */
  addSec: number;
  /** 門檻 = 自身最大生命的幾成。52-01 = 0.05。 */
  perDamagePctOfMaxHealth?: number;
  /** 門檻 = 固定點數（與上面二選一，上面優先）。 */
  perDamageFlat?: number;
  /**
   * 讀 `incoming` 的哪一個讀數。省略 = **`"hpLost"`**（「承受」對照的是血條，
   * 護盾吃掉的那一份不算）—— 與 `eventValueConversion` 的預設刻意不同，
   * 理由見那支檔頭④。
   */
  basis?: IncomingBasis;
  /**
   * ⭐ **必填**：延長後的剩餘時間上限（秒）。
   * 這條機制是正回饋，沒有它會變成永久，而症狀是「回合打不完」——
   * 一個不會讓任何東西變紅的故障。見 `extendBuff.ts` 檔頭③。
   */
  maxRemainingSec: number;
}
