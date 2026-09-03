import { SKILL_TIER_NAMES, type SkillTierName } from "@ggd/shared/content/skillTiers";
import {
  NORMALIZED_STAT_KEYS,
  type NormalizedStatKey,
  type Origin,
} from "@ggd/shared/content/statNormalization";
import type { AbilityTemplateCard, TemplateDoc } from "@ggd/shared/content";
import { defaultParamsFor } from "@ggd/shared/content";
import recipeDoc from "./skill-type-recipes.json";

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
  /** Positive affinities evaluated against Main's current byOrigin table. */
  readonly statWeights: Readonly<Partial<Record<NormalizedStatKey, number>>>;
}

export const SKILL_TYPE_PRESETS: readonly SkillTypePreset[] = parseRecipeDoc(recipeDoc);

export interface StatNormalizationRecommendationDoc {
  readonly schema?: unknown;
  readonly byOrigin?: Readonly<Partial<Record<NormalizedStatKey, Readonly<Partial<Record<Origin, unknown>>>>>>;
}

const BAND_SCORE: Readonly<Record<SkillTierName, number>> = {
  極小: -2,
  小: -1,
  中: 0,
  大: 1,
  極大: 2,
};

const STAT_LABELS: Readonly<Record<NormalizedStatKey, string>> = {
  ms: "移速", mr: "魔抗", armor: "防禦", maxHealth: "生命", maxMana: "魔力",
  ad: "AD", ap: "AP", as: "攻速", healthRegen: "回血", manaRegen: "回魔", range: "攻擊距離",
};

export interface RankedSkillType {
  readonly preset: SkillTypePreset;
  readonly recommendationRank: number | null;
  readonly recommendationScore: number | null;
  readonly recommendationReasons: readonly string[];
  readonly available: boolean;
}

/**
 * Origin changes ordering only. It never hides a manual option.
 * The score consumes Main's current `config.stat-normalization@1`; no origin
 * preference is duplicated in Editor source code.
 */
export function rankSkillTypes(
  origin: Origin | null,
  availableTemplateIds: ReadonlySet<string>,
  statConfig?: StatNormalizationRecommendationDoc | null,
): RankedSkillType[] {
  const sorted = SKILL_TYPE_PRESETS.map((skillType, stableIndex) => {
    const evidence = origin === null ? null : scoreForOrigin(skillType, origin, statConfig);
    return {
      preset: skillType,
      score: evidence?.score ?? null,
      reasons: evidence?.reasons ?? [],
      available: skillType.templateIds.every((id) => availableTemplateIds.has(id)),
      stableIndex,
    };
  })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY)
        || a.stableIndex - b.stableIndex;
    });
  let recommendationRank = 0;
  return sorted.map(({ stableIndex: _drop, score, reasons, ...ranked }) => ({
    ...ranked,
    recommendationScore: score,
    recommendationReasons: reasons,
    recommendationRank: score !== null && ranked.available && recommendationRank < 3
      ? ++recommendationRank
      : null,
  }));
}

function scoreForOrigin(
  preset: SkillTypePreset,
  origin: Origin,
  config?: StatNormalizationRecommendationDoc | null,
): { score: number; reasons: string[] } | null {
  if (config?.schema !== "config.stat-normalization@1") return null;
  const contributions = Object.entries(preset.statWeights).flatMap(([rawKey, rawWeight]) => {
    const key = rawKey as NormalizedStatKey;
    const band = config.byOrigin?.[key]?.[origin];
    if (!isSkillTierName(band) || typeof rawWeight !== "number") return [];
    return [{ key, band, contribution: BAND_SCORE[band] * rawWeight }];
  });
  if (contributions.length === 0) return null;
  const score = contributions.reduce((sum, row) => sum + row.contribution, 0);
  const reasons = contributions
    .filter((row) => row.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((row) => `${STAT_LABELS[row.key]}${row.band}`);
  return { score, reasons: reasons.length > 0 ? reasons : ["相對弱點較少"] };
}

function parseRecipeDoc(raw: unknown): readonly SkillTypePreset[] {
  const doc = record(raw);
  if (doc?.["schema"] !== "ggd-editor-skill-type-recipes@1" || !Array.isArray(doc["recipes"])) {
    throw new Error("skill-type-recipes.json 格式不正確");
  }
  const ids = new Set<string>();
  return doc["recipes"].map((value, index) => {
    const row = record(value);
    if (!row || typeof row["id"] !== "string" || typeof row["label"] !== "string"
      || typeof row["summary"] !== "string" || !Array.isArray(row["templateIds"])
      || !["單體", "範圍", "變身"].includes(String(row["cooldownShape"]))) {
      throw new Error(`skill-type-recipes.json recipes[${index}] 缺少必要欄位`);
    }
    if (ids.has(row["id"])) throw new Error(`skill-type-recipes.json 重複 id: ${row["id"]}`);
    ids.add(row["id"]);
    const tiers = record(row["tierDefaults"]) ?? {};
    for (const [axis, tier] of Object.entries(tiers)) {
      if (!(FORGE_TIER_AXES as readonly string[]).includes(axis) || !isSkillTierName(tier)) {
        throw new Error(`skill-type-recipes.json ${row["id"]} 的級距 ${axis}=${String(tier)} 不合法`);
      }
    }
    const weights = record(row["statWeights"]) ?? {};
    for (const [key, weight] of Object.entries(weights)) {
      if (!(NORMALIZED_STAT_KEYS as readonly string[]).includes(key)
        || typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
        throw new Error(`skill-type-recipes.json ${row["id"]} 的權重 ${key}=${String(weight)} 不合法`);
      }
    }
    return {
      id: row["id"],
      label: row["label"],
      summary: row["summary"],
      templateIds: row["templateIds"].map(String),
      cooldownShape: row["cooldownShape"] as CooldownShape,
      tierDefaults: tiers as ForgeTierSelections,
      statWeights: weights as Partial<Record<NormalizedStatKey, number>>,
    };
  });
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
