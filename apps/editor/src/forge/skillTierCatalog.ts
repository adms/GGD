import type { SkillTierName } from "@ggd/shared/content/skillTiers";
import { SKILL_TIER_NAMES } from "@ggd/shared/content/skillTiers";
import type { CooldownShape, ForgeTierAxis } from "./skillTypePresets";

type JsonDoc = Record<string, unknown>;
type TierValues = Readonly<Record<SkillTierName, string>>;

export const TIER_CONFIG_IDS = [
  "damage-tiers",
  "mana-tiers",
  "cooldown-tiers",
  "range-tiers",
  "aoe-tiers",
  "cast-time-tiers",
  "displacement-tiers",
  "move-speed-tiers",
] as const;

export type TierConfigId = (typeof TIER_CONFIG_IDS)[number];
export type TierConfigDocs = Readonly<Partial<Record<TierConfigId, JsonDoc>>>;

export function tierValuesFor(
  axis: ForgeTierAxis,
  docs: TierConfigDocs,
  cooldownShape: CooldownShape,
): TierValues | null {
  const source = sourceTable(axis, docs, cooldownShape);
  if (!source) return null;
  const rows = SKILL_TIER_NAMES.map((tier) => [tier, displayValue(axis, source[tier])] as const);
  if (rows.some(([, value]) => value === null)) return null;
  return Object.fromEntries(rows) as TierValues;
}

function sourceTable(
  axis: ForgeTierAxis,
  docs: TierConfigDocs,
  cooldownShape: CooldownShape,
): Record<string, unknown> | null {
  if (axis === "damage") return record(docs["damage-tiers"]?.["damage"]);
  if (axis === "mana") return record(docs["mana-tiers"]?.["manaCost"]);
  if (axis === "range") return record(docs["range-tiers"]?.["range"]);
  if (axis === "radius") return record(docs["aoe-tiers"]?.["radius"]);
  if (axis === "castTime") return record(docs["cast-time-tiers"]?.["seconds"]);
  if (axis === "moveSpeed") return record(docs["move-speed-tiers"]?.["bonus"]);
  if (axis === "travel" || axis === "push") return record(docs["displacement-tiers"]?.[axis]);
  const seconds = record(docs["cooldown-tiers"]?.["seconds"]);
  return record(seconds?.[cooldownShape]);
}

function displayValue(axis: ForgeTierAxis, raw: unknown): string | null {
  if (axis === "travel" || axis === "push") {
    const row = record(raw);
    const distance = row?.["distance"];
    return typeof distance === "number" ? `${distance}` : null;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (axis === "moveSpeed") return `+${Math.round(raw * 100)}%`;
  if (axis === "cooldown" || axis === "castTime") return `${raw}秒`;
  if (axis === "mana") return `${raw} MP`;
  return `${raw}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
