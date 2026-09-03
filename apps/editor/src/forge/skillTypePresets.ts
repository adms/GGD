import { SKILL_TIER_NAMES, type SkillTierName } from "@ggd/shared/content/skillTiers";
import type { Origin } from "@ggd/shared/content/statNormalization";
import type { AbilityTemplateCard, TemplateDoc } from "@ggd/shared/content";
import { defaultParamsFor } from "@ggd/shared/content";

export const FORGE_TIER_AXES = [
  "damage",
  "mana",
  "cooldown",
  "range",
  "radius",
  "castTime",
  "travel",
  "push",
  "moveSpeed",
] as const;

export type ForgeTierAxis = (typeof FORGE_TIER_AXES)[number];
export type ForgeTierSelections = Partial<Record<ForgeTierAxis, SkillTierName>>;

export const FORGE_TIER_LABELS: Readonly<Record<ForgeTierAxis, string>> = {
  damage: "傷害",
  mana: "耗魔",
  cooldown: "冷卻",
  range: "施法距離",
  radius: "有效範圍",
  castTime: "吟唱",
  travel: "自身位移",
  push: "擊退距離",
  moveSpeed: "移速加成",
};

export type CooldownShape = "單體" | "範圍" | "變身";

/**
 * A designer-facing skill type is a recipe of shipped behaviour bricks. It is
 * deliberately NOT another runtime schema: choosing one only seeds the same
 * template cards and tier fields the advanced editor already writes.
 */
export interface SkillTypePreset {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly templateIds: readonly string[];
  readonly tierDefaults: ForgeTierSelections;
  readonly cooldownShape: CooldownShape;
  readonly preferredOrigins: readonly Origin[];
}

export const SKILL_TYPE_PRESETS: readonly SkillTypePreset[] = [
  preset("single-burst", "單體爆發", "鎖定一名敵人，集中一次高傷害。", ["tpl-single-strike"], "單體", ["鬥士", "法鬥", "法刺"], {
    damage: "大", mana: "中", cooldown: "中", range: "中", castTime: "極小",
  }),
  preset("instant-area", "瞬發範圍", "在指定位置或身邊立刻引爆。", ["tpl-instant-blast"], "範圍", ["法師", "砲手", "硬輔"], {
    damage: "中", mana: "中", cooldown: "中", range: "中", radius: "中", castTime: "極小",
  }),
  preset("projectile-blast", "投射後爆炸", "投射物飛行一段距離，途中命中並在終點爆炸。", ["tpl-line-blast"], "範圍", ["砲手", "法師", "射手"], {
    damage: "大", mana: "大", cooldown: "大", range: "大", radius: "中", castTime: "小",
  }),
  preset("beam", "橫向光束砲", "寬型光束沿前方推進，適合氣功砲與吐息。", ["tpl-beam-roll"], "範圍", ["砲手", "法師", "法鬥"], {
    damage: "大", mana: "大", cooldown: "大", range: "極大", radius: "中", castTime: "中",
  }),
  preset("periodic-field", "持續領域", "建立會週期作用的區域，可做傷害、治療或控制。", ["tpl-periodic-field"], "範圍", ["法師", "軟輔", "硬輔"], {
    damage: "小", mana: "中", cooldown: "大", range: "中", radius: "大", castTime: "小",
  }),
  preset("blink-strike", "瞬移突斬", "瞬移貼近並完成一次斬擊。", ["tpl-blink-strike"], "單體", ["法刺", "鬥士", "法鬥"], {
    damage: "中", mana: "中", cooldown: "中", range: "大", travel: "大", castTime: "極小",
  }),
  preset("charge-push", "衝鋒推撞", "向前衝刺，命中後推開目標。", ["tpl-charge-push"], "範圍", ["坦克", "狂戰", "鬥士"], {
    damage: "中", mana: "中", cooldown: "中", range: "中", travel: "中", push: "中", castTime: "極小",
  }),
  preset("leap", "跳躍落地", "躍向目標區域，落地造成範圍效果。", ["tpl-leap-strike"], "範圍", ["坦克", "狂戰", "鬥士"], {
    damage: "中", mana: "中", cooldown: "大", range: "大", radius: "中", travel: "大", castTime: "小",
  }),
  preset("combo", "連段終結技", "按時間軸連續攻擊，最後接一記重招。", ["tpl-combo-finisher"], "單體", ["鬥士", "狂戰", "法刺"], {
    damage: "極大", mana: "大", cooldown: "極大", range: "小", castTime: "中",
  }),
  preset("self-buff", "自我強化／變身", "持續強化自身屬性或切換戰鬥形態。", ["tpl-buff-self"], "變身", ["狂戰", "法鬥", "坦克"], {
    mana: "中", cooldown: "大", castTime: "小", moveSpeed: "中",
  }),
  preset("on-attack", "普攻觸發", "普通攻擊命中時附加傷害或狀態。", ["tpl-on-attack"], "單體", ["射手", "法鬥", "鬥士"], {
    damage: "小", cooldown: "極小",
  }),
  preset("reactive", "格擋／迴避反應", "受到攻擊、格擋或迴避後觸發反擊或保護。", ["tpl-on-hit-react"], "單體", ["坦克", "硬輔", "鬥士"], {
    cooldown: "小",
  }),
  preset("summon", "召喚代理", "召喚單位或代理錨點替施法者執行效果。", ["tpl-summon-agent"], "範圍", ["軟輔", "硬輔", "法師"], {
    mana: "大", cooldown: "大", range: "中", radius: "中", castTime: "中",
  }),
  preset("barrage", "亂數彈幕", "在區域內連續選點落下多發攻擊。", ["tpl-random-barrage"], "範圍", ["砲手", "法師", "射手"], {
    damage: "中", mana: "大", cooldown: "大", range: "大", radius: "大", castTime: "中",
  }),
] as const;

function preset(
  id: string,
  label: string,
  summary: string,
  templateIds: readonly string[],
  cooldownShape: CooldownShape,
  preferredOrigins: readonly Origin[],
  tierDefaults: ForgeTierSelections,
): SkillTypePreset {
  return { id, label, summary, templateIds, cooldownShape, preferredOrigins, tierDefaults };
}

export interface RankedSkillType {
  readonly preset: SkillTypePreset;
  readonly recommendationRank: number | null;
  readonly available: boolean;
}

/** Origin changes ordering only. It never hides a manual option. */
export function rankSkillTypes(
  origin: Origin | null,
  availableTemplateIds: ReadonlySet<string>,
): RankedSkillType[] {
  const sorted = SKILL_TYPE_PRESETS.map((skillType, stableIndex) => {
    const affinity = origin === null ? -1 : skillType.preferredOrigins.indexOf(origin);
    return {
      preset: skillType,
      affinity,
      available: skillType.templateIds.every((id) => availableTemplateIds.has(id)),
      stableIndex,
    };
  })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const ar = a.affinity < 0 ? Number.POSITIVE_INFINITY : a.affinity;
      const br = b.affinity < 0 ? Number.POSITIVE_INFINITY : b.affinity;
      return ar - br || a.stableIndex - b.stableIndex;
    });
  let recommendationRank = 0;
  return sorted.map(({ stableIndex: _drop, affinity, ...ranked }) => ({
    ...ranked,
    recommendationRank: origin !== null && ranked.available && affinity >= 0 && recommendationRank < 3
      ? ++recommendationRank
      : null,
  }));
}

export function cardsForSkillType(
  skillType: SkillTypePreset,
  templates: ReadonlyMap<string, TemplateDoc>,
): AbilityTemplateCard[] {
  return skillType.templateIds.flatMap((id) => {
    const template = templates.get(id);
    if (!template || template.status !== "enabled") return [];
    return [{ ref: id, params: seedTierParams(defaultParamsFor(template), template, skillType.tierDefaults) }];
  });
}

export function applyTierToCards(
  cards: readonly AbilityTemplateCard[],
  templates: ReadonlyMap<string, TemplateDoc>,
  axis: ForgeTierAxis,
  tier: SkillTierName,
): AbilityTemplateCard[] {
  return cards.map((card) => {
    const template = templates.get(card.ref);
    if (!template) return card;
    const next = { ...card.params };
    let changed = false;
    for (const param of Object.keys(template.params)) {
      const slot = template.params[param];
      const current = next[param];
      if (slot?.type === "scaling") {
        if (axis !== "damage" || !hasDamageTier(current)) continue;
        next[param] = { ...(current as Record<string, unknown>), damageTier: tier };
      } else {
        if (tierAxisForParam(param) !== axis) continue;
        next[param] = tier;
      }
      changed = true;
    }
    return changed ? { ...card, params: next } : card;
  });
}

export function supportedTierAxes(
  cards: readonly AbilityTemplateCard[],
  templates: ReadonlyMap<string, TemplateDoc>,
): ReadonlySet<ForgeTierAxis> {
  const axes = new Set<ForgeTierAxis>(["mana", "cooldown", "range", "radius", "castTime"]);
  for (const card of cards) {
    const template = templates.get(card.ref);
    if (!template) continue;
    for (const param of Object.keys(template.params)) {
      const slot = template.params[param];
      const axis = slot?.type === "scaling" && hasDamageTier(card.params[param])
        ? "damage"
        : tierAxisForParam(param);
      if (axis) axes.add(axis);
    }
  }
  return axes;
}

function seedTierParams(
  params: Record<string, unknown>,
  template: TemplateDoc,
  tiers: ForgeTierSelections,
): Record<string, unknown> {
  const out = { ...params };
  for (const param of Object.keys(template.params)) {
    const slot = template.params[param];
    if (slot?.type === "scaling" && tiers.damage) {
      // This is a NEW recipe draft, not a conversion of the host ability. Keep
      // authored growth coefficients, while the base amount gets its one
      // canonical source from config.damage-tiers@1.
      const current = record(out[param]);
      out[param] = {
        damageTier: tiers.damage,
        ...(Array.isArray(current?.["ratios"]) ? { ratios: current["ratios"] } : {}),
        ...(Array.isArray(current?.["attrRatios"]) ? { attrRatios: current["attrRatios"] } : {}),
      };
      continue;
    }
    const axis = tierAxisForParam(param);
    if (axis && tiers[axis]) out[param] = tiers[axis];
  }
  return out;
}

export function tierAxisForParam(param: string): ForgeTierAxis | null {
  const key = param.toLocaleLowerCase();
  if (key.endsWith("damagetier")) return "damage";
  if (key.endsWith("radiustier")) return "radius";
  if (key === "manacosttier" || key === "manatier") return "mana";
  if (key === "cooldowntier") return "cooldown";
  if (key === "rangetier") return "range";
  if (key === "casttimetier") return "castTime";
  if (key === "traveltier" || key === "distancetier") return "travel";
  if (key === "pushtier" || key === "knockbacktier") return "push";
  if (key === "msbonustier" || key === "movespeedtier") return "moveSpeed";
  return null;
}

export function isSkillTierName(value: unknown): value is SkillTierName {
  return typeof value === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasDamageTier(value: unknown): boolean {
  return isSkillTierName(record(value)?.["damageTier"]);
}
