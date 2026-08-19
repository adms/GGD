/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectCondition } from "../../content/condition";
import type { ResourcePctTerm } from "../dynamicTerms";
import type { DamageType, EffectDef, Scaling } from "../effect";

/**
 * damageLine — 面前的一條直線範圍傷害 (18-00 薔薇荊棘之刃). A CAPSULE, not a
 * circle: see `effects/damageLine.ts` for why the shape difference is the
 * whole play pattern and for the 「3 個身位」 → 3.6 GGD units derivation.
 */
export interface DamageLineVariant {
  kind: "damageLine";
  /**
   * ⭐ S2（GH#299）—— 資源百分比項。與 `damage.resourcePct` **同一份型別、
   * 同一個讀取器**（`dynamicTerms.ts::resourcePctAmount`），per-target 解算。
   */
  resourcePct?: ResourcePctTerm;
  /**
   * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
   *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
   *
   * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
   * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
   */
  damageType?: DamageType;
  amount: Scaling;
  /** how far forward the lash reaches, GGD units (3 身位 = 3 × 1.2 = 3.6) */
  length: number;
  /** how WIDE the lash is, GGD units (one body = 1.2). Not a radius. */
  width: number;
  /** where it points: through the event victim (default) or the body facing */
  aim?: "facing" | "target";
  /** start at the caster's body (default true = 「面前」) or at the victim */
  fromCaster?: boolean;
  maxTargets?: number;
  canCrit?: boolean;
  /** does the entity that TRIGGERED this eat it again? default false */
  includeOrigin?: boolean;
  /** ⭐ G1 ① —— 見 `damageArea.victimCondition`，同一份型別、同一個求值器。 */
  victimCondition?: EffectCondition;
  /** ⭐ G1 —— 見 `damageArea.maxTargetsCounts`。同名同語意，⛔ 不是第二件事。 */
  maxTargetsCounts?: "qualified" | "candidates";
  /** ⭐ G1 ② —— 見 `damageArea.onHitTargets`。同樣不需要 bake。 */
  onHitTargets?: EffectDef[];
  /** ⭐ G1 ② —— 見 `damageArea.runOnEmptyHit`。省略 = false。 */
  runOnEmptyHit?: boolean;
  /**
   * ⭐ G1 ② —— 見 `damageArea.onHitTargetsMode`。省略 = `"batch"`。
   * ⛔ 兩個 kind 在這一族上必須**同名同語意**：欄位名一旦分岔，編輯器上長得
   * 一樣的兩格就會是兩件事 —— 那是最難查的一種缺陷。
   */
  onHitTargetsMode?: "batch" | "perTarget";
}
