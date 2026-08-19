/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { DamageType, Scaling } from "../effect";

export interface ShieldVariant {
  kind: "shield";
  amount: Scaling;
  duration: number;
  /** ⭐ S1（GH#299）—— 不疊加政策的身分。缺席 = 每次都是新的一片。 */
  stackKey?: string;
  /** ⭐ S1 —— 身上已經有同 key 那一片時怎麼辦。`stackKey` 有值而這格沒填 = replace。 */
  onExisting?: "replace" | "keepLarger" | "stack";
  /**
   * WHICH damage the pool eats. owner 2026-07-30: 「護盾的確有分**吸收所有
   * 傷害**跟**吸收 AP 傷害 only**」 — that is a DECISION POINT, so it is a
   * content field rather than a branch somebody picked in code (CLAUDE.md
   * 第一守則).
   *
   * ABSENT = `"all"` = today's behaviour exactly, so no shipped document
   * changes meaning. `"magic"` is the AP-only shield owner named; the
   * physical/true rows exist because the enum would be arbitrary without
   * them, not because a doc asks for them yet.
   *
   * The filter runs in `combat/damage.ts`, at the step shields always ate at
   * (POST-mitigation), so the authored number keeps meaning "damage as the
   * victim actually feels it". A pool that does not eat the incoming type is
   * fully TRANSPARENT to it — no absorb, no consumption. Two pools on one
   * target: narrow before broad (`absorbOrder`).
   */
  absorbs?: "all" | DamageType;
}
