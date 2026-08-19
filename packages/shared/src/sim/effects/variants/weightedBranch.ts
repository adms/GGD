/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

export interface WeightedBranchVariant {
  /**
   * 【加權分支】—— 一次 RNG 抽一個分支（89-002 俄羅斯輪盤）。
   * ⭐ **只 draw 一次**，理由（錄影決定性）見
   * `sim/effects/weightedBranch.ts` 檔頭；那不是欄位，是預算。
   */
  kind: "weightedBranch";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。中選分支在這組目標上執行。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /**
   * 分支表。權重是**相對**的（1/1/4 與 10/10/40 完全等價）。
   * `weight: 0` = 先關掉這個分支但不刪它；總和為 0 在**載入時**被擋。
   */
  branches: { weight: number; effects: EffectDef[] }[];
}
