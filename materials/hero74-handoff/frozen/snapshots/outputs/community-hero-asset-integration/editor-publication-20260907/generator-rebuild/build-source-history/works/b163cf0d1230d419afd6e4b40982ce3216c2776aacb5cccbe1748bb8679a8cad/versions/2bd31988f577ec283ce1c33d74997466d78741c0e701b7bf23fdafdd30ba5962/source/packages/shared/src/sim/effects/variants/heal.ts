/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { Scaling } from "../effect";

export interface HealVariant {
  kind: "heal";
  amount: Scaling;
  /** ⭐ G11 —— 治療落在誰身上。省略 = "target"。 */
  applyTo?: "self" | "target";
}
