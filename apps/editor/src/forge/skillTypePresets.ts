import { SKILL_TIER_NAMES, type SkillTierName } from "@ggd/shared/content/skillTiers";
import {
  NORMALIZED_STAT_KEYS,
  type NormalizedStatKey,
  type Origin,
} from "@ggd/shared/content/statNormalization";
import type { AbilityTemplateCard, TemplateDoc } from "@ggd/shared/content";
import {
  DEFAULT_TEMPLATE_CONFLICT,
  defaultParamsFor,
  GGD_PER_WC3,
  paramsSchemaFor,
  round2,
  zAbilityDoc,
} from "@ggd/shared/content";
import {
  denormalizeTemplateBinding,
  expandStack,
  mergeExpansion,
} from "@ggd/shared/content/templates/expand";
import { newAbilityTemplate } from "../collections";
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
  readonly defaultSlot?: "PASSIVE" | "Q" | "W" | "E" | "R" | "EX";
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
  readonly unavailableReasons: readonly string[];
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
  recipeIssues: ReadonlyMap<string, readonly string[]> = new Map(),
): RankedSkillType[] {
  const sorted = SKILL_TYPE_PRESETS.map((skillType, stableIndex) => {
    const evidence = origin === null ? null : scoreForOrigin(skillType, origin, statConfig);
    const unavailableReasons = recipeIssues.get(skillType.id) ?? [];
    return {
      preset: skillType,
      score: evidence?.score ?? null,
      reasons: evidence?.reasons ?? [],
      available: skillType.templateIds.every((id) => availableTemplateIds.has(id))
        && unavailableReasons.length === 0,
      unavailableReasons,
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

/**
 * Deterministic structural gate for the friendly recipe cards. An enabled
 * template is not enough: its declared tier controls must have a real writable
 * slot, its default params must parse, and the resulting ability must pass the
 * same authoring schema used by save/import. This is deliberately Editor-side
 * composition validation; it does not reimplement any Main effect primitive.
 */
export function skillTypeRecipeIssues(
  preset: SkillTypePreset,
  templates: ReadonlyMap<string, TemplateDoc>,
): string[] {
  const issues: string[] = [];
  const missing = preset.templateIds.filter((id) => templates.get(id)?.status !== "enabled");
  if (missing.length > 0) return missing.map((id) => `缺少可用積木 ${id}`);

  const cards = cardsForSkillType(preset, templates);
  const supported = supportedTierAxes(cards, templates);
  for (const axis of Object.keys(preset.tierDefaults) as ForgeTierAxis[]) {
    if (!supported.has(axis)) issues.push(`${FORGE_TIER_LABELS[axis]}沒有可寫入的模板參數`);
  }
  for (const card of cards) {
    const parsed = paramsSchemaFor(templates.get(card.ref)!).safeParse(card.params);
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((issue) =>
        `${card.ref}.${issue.path.join(".") || "params"}：${issue.message}`,
      ));
    }
  }
  if (issues.length > 0) return issues;

  try {
    const expanded = expandStack(
      cards.map((card) => ({ template: templates.get(card.ref)!, params: card.params })),
      DEFAULT_TEMPLATE_CONFLICT,
    );
    const slot = preset.defaultSlot ?? "Q";
    const authoring = mergeExpansion({
      schema: "ability@1",
      ...newAbilityTemplate(`qa.recipe.${preset.id}`, slot, `QA ${preset.label}`),
      template: denormalizeTemplateBinding(cards, DEFAULT_TEMPLATE_CONFLICT),
      ...(preset.tierDefaults.mana ? { manaCostTier: preset.tierDefaults.mana } : {}),
      ...(preset.tierDefaults.cooldown ? {
        cooldownTier: preset.tierDefaults.cooldown,
        cooldownShape: preset.cooldownShape,
      } : {}),
      ...(preset.tierDefaults.range ? { rangeTier: preset.tierDefaults.range } : {}),
      ...(preset.tierDefaults.radius ? { radiusTier: preset.tierDefaults.radius } : {}),
      ...(preset.tierDefaults.castTime ? { castTimeTier: preset.tierDefaults.castTime } : {}),
    }, expanded.result);
    const parsed = zAbilityDoc.safeParse(authoring);
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((issue) =>
        `${issue.path.join(".") || "ability"}：${issue.message}`,
      ));
    }
  } catch (error) {
    issues.push(`模板展開失敗：${String(error)}`);
  }
  return issues;
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
    const defaultSlot = row["defaultSlot"];
    if (defaultSlot !== undefined && !["PASSIVE", "Q", "W", "E", "R", "EX"].includes(String(defaultSlot))) {
      throw new Error(`skill-type-recipes.json ${row["id"]} 的 defaultSlot 不合法`);
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
      ...(defaultSlot === undefined ? {} : { defaultSlot: defaultSlot as SkillTypePreset["defaultSlot"] }),
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
  resolvedValue: number | null = null,
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
        if (axis !== "damage") continue;
        next[param] = tieredScaling(current, tier);
      } else if (slot?.type === "statModifiers" && axis === "moveSpeed") {
        next[param] = withMoveSpeedTier(current, tier);
      } else if (resolvedValue !== null && tierAxisForNumericParam(param) === axis) {
        const raw = slot?.unit === "wc3u" ? round2(resolvedValue / GGD_PER_WC3) : resolvedValue;
        next[param] = Math.min(slot?.max ?? raw, Math.max(slot?.min ?? raw, raw));
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
      if (slot?.type === "scaling") axes.add("damage");
      if (slot?.type === "statModifiers") axes.add("moveSpeed");
      const axis = tierAxisForParam(param) ?? tierAxisForNumericParam(param);
      if (axis !== null) axes.add(axis);
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
      out[param] = tieredScaling(out[param], tiers.damage);
      continue;
    }
    if (slot?.type === "statModifiers" && tiers.moveSpeed) {
      out[param] = withMoveSpeedTier(out[param], tiers.moveSpeed);
      continue;
    }
    const axis = tierAxisForParam(param);
    if (axis && tiers[axis]) out[param] = tiers[axis];
  }
  return out;
}

function tierAxisForNumericParam(param: string): ForgeTierAxis | null {
  const key = param.toLocaleLowerCase();
  if (key === "dashdistance") return "travel";
  if (key === "pushdistance") return "push";
  if (key === "internalcooldown") return "cooldown";
  return null;
}

function tieredScaling(value: unknown, tier: SkillTierName): Record<string, unknown> {
  const current = record(value);
  return {
    damageTier: tier,
    ...(Array.isArray(current?.["ratios"]) ? { ratios: current["ratios"] } : {}),
    ...(Array.isArray(current?.["attrRatios"]) ? { attrRatios: current["attrRatios"] } : {}),
  };
}

function withMoveSpeedTier(value: unknown, tier: SkillTierName): unknown[] {
  const rows = Array.isArray(value) ? value : [];
  let replaced = false;
  const next = rows.map((row) => {
    const modifier = record(row);
    if (modifier?.["stat"] !== "ms" || !["pctAdd", "pctMult"].includes(String(modifier["op"]))) return row;
    replaced = true;
    const { value: _drop, ...rest } = modifier;
    return { ...rest, msBonusTier: tier };
  });
  return replaced ? next : [...next, { stat: "ms", op: "pctAdd", msBonusTier: tier }];
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
