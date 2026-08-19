/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { RankScalar } from "../../perRank";

/**
 * restore — WC3's `SetUnitLifePercentBJ` / `SetUnitManaPercentBJ` idiom: set a
 * FRACTION of the target's own maximum, not a flat amount. `heal` cannot
 * express it because `Scaling.ratios` reads the CASTER's stats, so a "restore
 * this ally to full" ultimate (初音's `MikuEX`) had nowhere to go and shipped
 * as a damage nuke. 0..1 of the TARGET's max; absent = untouched.
 */
export interface RestoreVariant {
  kind: "restore";
  /** ⭐ G2 —— 逐階可以是陣列。讀取一律走 `sim/perRank.ts::rankScalar`。 */
  healthPct?: RankScalar;
  manaPct?: RankScalar;
  /** ⭐ G11 —— 回自己。省略 = "target"。 */
  applyTo?: "self" | "target";
}
