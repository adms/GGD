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
  /**
   * ⭐ GH#1020 —— `weightFrom`：這一支的權重**隨施法者一項三圍成長**
   * （權重 = `weight + coeff × 三圍`，夾在 0 以上）。小傑 06-04 變身態的隨機猜猜拳：
   * 原作 `GetRandomInt(1,100) <= 5 + 敏捷/10` 出石頭、否則剪刀／布各半（j:27215）——
   * 寫成三支權重 `5 + 0.1×敏捷`、`47.5 − 0.05×敏捷`、`47.5 − 0.05×敏捷`（總和恆為 100）
   * 就是那兩次擲骰的**恆等式**，⛔ 不是近似。`coeff` 可以是負數（「其他分支讓位」）；
   * 缺席 ⇒ 靜態權重 ⇒ 逐位元同這一格出現之前。
   */
  branches: {
    weight: number;
    weightFrom?: { attr: AttrKey; basis?: AttrBasis; coeff: number };
    effects: EffectDef[];
  }[];
}
