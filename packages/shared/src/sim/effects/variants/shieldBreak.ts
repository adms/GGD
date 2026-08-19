/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

export interface ShieldBreakVariant {
  /**
   * 【破盾】（D1，#278）。只打掉 `HealthComp.shields`，`st.effects` 一格不動。
   *
   * ⚠️ 它與 `dispel` 分開的理由是**止血閥**（`dispelRules.enabled` 不該
   * 順手廢掉一件破盾道具）—— 完整理由見 `sim/effects/shieldBreak.ts` 檔頭。
   */
  kind: "shieldBreak";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。語意與 `dispel` 的那一格相同。 */
  shape: "single" | "circle";
  /** `shape:"circle"` 必填。吃 `combatEnv.abilityRange` 倍率。 */
  radius?: number;
  /** `shape:"circle"` 才有意義。破盾的預設是**打敵人**（與淨化相反）。 */
  side?: "allies" | "enemies";
  /** `shape:"circle"` 的人數上限。省略 = 圓內全部。 */
  maxTargets?: number;
  /** 最多打掉幾層盾。省略 = 整池。⚠️ 這裡沒有全域上限（破盾不是淨化）。 */
  count?: number;
  /** 打不完時先打哪一邊。省略 = `"newest"`（先打最晚掛上的那一片）。 */
  order?: "newest" | "oldest";
}
