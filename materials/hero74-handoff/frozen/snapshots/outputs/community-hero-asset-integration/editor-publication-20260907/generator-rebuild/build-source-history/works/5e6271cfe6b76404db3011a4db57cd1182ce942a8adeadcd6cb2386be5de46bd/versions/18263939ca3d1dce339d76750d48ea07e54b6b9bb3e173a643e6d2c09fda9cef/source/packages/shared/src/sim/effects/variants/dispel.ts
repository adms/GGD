/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * `revive` —— 復活. See `effects/revive.ts` for the whole model: it delegates
 * the state contract to `sim/revive.ts::reviveChampionAt`, the SAME function
 * the 復活圈 (#84/#206) completes through, so there is exactly one definition
 * of what a revived champion looks like.
 *
 * 天生牙 godie-i031 「[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄」 —— the
 * 「我方所有英雄」 half is the hook's `target: "allies"` scope, not this effect.
 */
/**
 * 【淨化】【驅散】(A4b, #278) —— 把目標身上選定的池子清掉。
 * 行為在 `sim/effects/dispel.ts`，池子的語意在 `sim/clearPools.ts`，
 * 全域旋鈕在 `sim/dispelRules.ts`（`config.dispel@1`）。
 */
export interface DispelVariant {
  kind: "dispel";
  /**
   * ⭐ E1 硬約束（owner 核准）：**新 kind 一律帶 `shape`**。
   *
   *   single  清 hook/技能已經解析好的那些人（`target: self|event|allies`
   *           那一層決定的）—— 這個 kind 不重新發明目標選擇
   *   circle  以受害者/施法點/施法者為圓心的一個圓
   *
   * ⚠️ `line` / `cone` **刻意不在 enum 裡**：今天沒有任何一份文件需要它們，
   * 而一個 schema 收得下、引擎沒實作的值正是同一批裡剛刪掉的 `onLevelUp`。
   */
  shape: "single" | "circle";
  /** `shape:"circle"` 必填。吃 `combatEnv.abilityRange` 倍率。 */
  radius?: number;
  /** `shape:"circle"` 才有意義：清友軍（預設）還是清敵人。 */
  side?: "allies" | "enemies";
  /** `shape:"circle"` 的人數上限。省略 = 圓內全部。 */
  maxTargets?: number;
  /** 清哪幾池。省略 = `config.dispel@1` 的四個 `defaultPool*`。 */
  pools?: { status?: boolean; shields?: boolean; dot?: boolean; buffs?: boolean };
  /** 只清這一種極性。省略 = `"debuff"`（淨化的字面意思）。 */
  polarity?: "buff" | "debuff" | "any";
  /** 每一池最多拔幾層。省略 = `maxCountCap`；寫了也**夾不過**它。 */
  count?: number;
  /** 拔不完時先拔哪一邊。省略 = `defaultOrder`。 */
  order?: "newest" | "oldest";
}
