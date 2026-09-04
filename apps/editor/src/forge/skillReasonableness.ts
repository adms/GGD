import type { SkillTierName } from "@ggd/shared/content/skillTiers";
import type {
  ForgeTierAxis,
  ForgeTierSelections,
  SkillTypePreset,
} from "./skillTypePresets";

export type SkillTierDiagnosticSeverity = "warning" | "info";

export interface SkillTierDiagnostic {
  readonly code: string;
  readonly severity: SkillTierDiagnosticSeverity;
  readonly message: string;
  readonly suggestion: string;
}

const SCORE: Readonly<Record<SkillTierName, number>> = {
  極小: -2,
  小: -1,
  中: 0,
  大: 1,
  極大: 2,
};

const BENEFIT_AXES: readonly ForgeTierAxis[] = [
  "damage", "range", "radius", "travel", "push", "moveSpeed",
];

/**
 * Deterministic first-pass balance review for a no-code recipe.
 *
 * This intentionally does not calculate live damage or silently change values.
 * It catches suspicious tier SHAPES before the real schema/sim validation and
 * tells the designer which cost lever to consider. Main remains authoritative
 * for the actual numbers behind each tier.
 */
export function diagnoseSkillTiers(
  tiers: ForgeTierSelections,
  preset?: SkillTypePreset,
): readonly SkillTierDiagnostic[] {
  const out: SkillTierDiagnostic[] = [];
  const damage = score(tiers.damage);
  const mana = score(tiers.mana);
  const cooldown = score(tiers.cooldown);
  const castTime = score(tiers.castTime);
  const range = score(tiers.range);
  const radius = score(tiers.radius);
  const travel = score(tiers.travel);
  const selectedBenefits = BENEFIT_AXES.flatMap((axis) => tiers[axis] ? [score(tiers[axis])] : []);
  const highCosts = [mana, cooldown, castTime].filter((value) => value !== null && value >= 1).length;

  if (damage !== null && damage >= 1
    && mana !== null && mana <= -1
    && cooldown !== null && cooldown <= -1
    && (castTime === null || castTime <= 0)) {
    out.push({
      code: "HIGH_DAMAGE_LOW_COST",
      severity: "warning",
      message: "高傷害同時搭配低耗魔、短冷卻，且沒有明顯吟唱代價。",
      suggestion: "至少把耗魔、冷卻或吟唱其中一項提高到「大」，或降低傷害級距。",
    });
  }

  if (selectedBenefits.some((value) => value === 2) && highCosts === 0) {
    out.push({
      code: "EXTREME_WITHOUT_COST",
      severity: "warning",
      message: "技能使用了「極大／特化」收益，但尚未搭配任何「大」以上的成本。",
      suggestion: "為特化收益配置大耗魔、長冷卻或長吟唱；若代價來自機制，請在效果鏈中明確建模。",
    });
  }

  if (damage !== null && damage >= 0
    && range !== null && range >= 1
    && radius !== null && radius >= 1
    && (mana === null || mana <= 0)
    && (cooldown === null || cooldown <= 0)) {
    out.push({
      code: "LONG_WIDE_CHEAP",
      severity: "warning",
      message: "遠距離、大範圍且有傷害，但耗魔與冷卻沒有同步提高。",
      suggestion: "提高耗魔或冷卻，或把施法距離／有效範圍其中一項降至中。",
    });
  }

  if (travel !== null && travel >= 1
    && damage !== null && damage >= 1
    && (cooldown === null || cooldown <= 0)) {
    out.push({
      code: "MOBILITY_BURST_LOOP",
      severity: "warning",
      message: "長位移與高傷害共存，冷卻卻不長，可能形成無風險追擊循環。",
      suggestion: "提高冷卻、降低位移或傷害；也可加入命中條件、後搖或回程限制。",
    });
  }

  if (damage !== null && damage <= -1
    && mana !== null && mana >= 1
    && cooldown !== null && cooldown >= 1) {
    out.push({
      code: "LOW_OUTPUT_HIGH_COST",
      severity: "warning",
      message: "低傷害同時使用高耗魔與長冷卻，技能可能缺少足以交換成本的價值。",
      suggestion: "提高傷害，或確認效果鏈另有治療、控制、召喚等主要收益。",
    });
  }

  if (preset && out.length === 0) {
    out.push({
      code: "RECIPE_SHAPE_OK",
      severity: "info",
      message: `「${preset.label}」目前未觸發級距組合警告。`,
      suggestion: "仍須用真實 Sim、事件時間軸與視覺畫面驗證；此檢查不代替實戰平衡。",
    });
  }

  return out;
}

function score(tier: SkillTierName | undefined): number | null {
  return tier === undefined ? null : SCORE[tier];
}
