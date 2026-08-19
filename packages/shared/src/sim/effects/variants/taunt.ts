/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * taunt — 嘲弄 (鍊金術之盾 godie-i06q「每秒吸引周圍敵人優先攻擊自己」).
 * Forces the subjects to auto-target the CASTER for a while. The whole model
 * — where the state lives, why it is not a `StatusEffect`, and every one of
 * its decision-point fields — is in sim/taunt.ts; the targeting seam it feeds
 * is `targeting.forcedTargetOf`.
 */
export interface TauntVariant {
  kind: "taunt";
  /**
   * 持續幾秒。Multiplied by the operator's `tauntRules.durationMult` at
   * apply time, then rounded to whole ticks (an ABSOLUTE expiry tick).
   *
   * BOTH ENDS BOUNDED. The floor is 0.034 s for the same reason
   * `grantAttribute.durationSec` has one: below that,
   * `Math.round(sec / dt)` at 30 Hz is 0 ticks — a blank round that looks
   * exactly like the feature being broken. The ceiling
   * (`TAUNT_MAX_DURATION_SEC`, sim/taunt.ts) is a MIS-PARSE guard: 0.5 typed as 50
   * is a taunt that outlives most rounds, i.e. one shield that owns every
   * enemy's targeting for the whole fight.
   */
  durationSec: number;
  /**
   * 範圍 (GGD units) around the CASTER. ABSENT = single-target: the taunt
   * lands on this effect's own resolved targets instead.
   *
   * Two modes rather than two kinds because they differ only in WHO, never
   * in WHAT — and the single-target form is what an ability-targeted WC3
   * taunt needs, while the item needs the circle. Flows through
   * `resolveAbilityRadius`, i.e. the same `combatEnv.abilityRange` budget
   * every other AoE obeys (aura.ts DECISION 3), so it cannot become the one
   * area in the game that ignores the operator's range knob.
   */
  radius?: number;
  /** 一次最多拉幾個人 (nearest first). Absent = `TAUNT_MAX_TARGETS` (sim/taunt.ts). */
  maxTargets?: number;
  /**
   * ⭐ [反向嘲諷]（戰鬥力探測器）—— 這個圓**拉誰**。ABSENT = `"enemies"`,
   * i.e. the one `enemiesInCircle` line this handler has always run, so the
   * shipped 鍊金術之盾 is byte-identical. Only read in the CIRCLE branch:
   * without `radius` the subjects are this effect's own resolved targets and
   * there is no circle to filter.
   */
  side?: "allies" | "enemies";
  /**
   * ⭐ 被拉的人**被迫打誰**。ABSENT = `"caster"` — the slot that used to be
   * hardcoded as `applyTaunt(world, s, ctx.caster, …)`.
   * `"target"` = this effect's FIRST resolved target, which is what makes
   * 「指定我方去嘲諷指定目標」 expressible at all.
   *
   * ⛔ NOT foldable into {@link side} (「拉隊友去打敵人」 and 「拉敵人來打我」
   * are two independent axes) and ⛔ not named `applyTo` (that name already
   * means 「效果落在誰身上」 everywhere else in this union).
   */
  forcedTarget?: "caster" | "target";
  /**
   * 附近的中立單位（殭屍）也一起拉。ABSENT = `false`.
   *
   * ⚠️ Only meaningful with `side: "allies"`: the `enemies` side already
   * contains `MONSTER_TEAM`, so this is a strict no-op there. ⛔ Do not
   * "generalise" it to both sides — that would take the zombies away from
   * 鍊金術之盾, i.e. its entire value in PvE.
   */
  includeNeutrals?: boolean;
}
