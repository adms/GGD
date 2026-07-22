/**
 * Ability-text helpers for the HUD (pure, node-testable — no DOM, no React).
 *
 * The imported roster encodes the hero number in the ability NAME as an
 * "NN-0X " / "NN-00X " prefix — a 1-3 digit hero number, a dash, a 2-3 digit
 * skill number and a trailing space (e.g. "19-01 斷未", "22-002 月光下的決鬥者").
 * The in-game bar shows the CLEAN skill name; the full numbered name stays
 * available for the tooltip header.
 */
import type { CastType } from "@ggd/shared/sim/content/defs";

/** Leading "<hero>-<skill> " number tag (hero 1-3 digits, skill 2-3 digits). */
const ABILITY_NUMBER_PREFIX = /^\d{1,3}-\d{2,3}\s+/;

/**
 * Strip the leading hero/skill number tag from an ability name.
 *   "19-01 斷未"            → "斷未"
 *   "22-002 月光下的決鬥者" → "月光下的決鬥者"
 * Names without the tag are returned unchanged; a name that is ONLY a tag
 * (nothing after) is left intact rather than reduced to an empty string.
 */
export function stripAbilityNumber(name: string): string {
  const stripped = name.replace(ABILITY_NUMBER_PREFIX, "");
  return stripped.length > 0 ? stripped : name;
}

/**
 * Read the optional human `description` off a content def (ability / item).
 * The sim's `AbilityDef`/`ItemDef` TS types don't declare it — only the Zod
 * doc schemas do (task #8 backfill) — but the runtime docs carry it, so this
 * reads it defensively (param is `unknown` because the sim types have no such
 * field). Empty/absent descriptions collapse to `undefined` so callers can
 * branch on presence.
 */
export function docDescription(def: unknown): string | undefined {
  const d = (def as { description?: unknown } | null | undefined)?.description;
  return typeof d === "string" && d.length > 0 ? d : undefined;
}

/** Compact Chinese label for an ability cast type (tooltip meta row). */
const CAST_TYPE_LABEL: Record<CastType, string> = {
  targeted: "鎖定",
  skillshot: "技能預測",
  ground: "地面指定",
  self: "自身",
  dash: "位移",
};

export function castTypeLabel(castType: CastType): string {
  return CAST_TYPE_LABEL[castType] ?? castType;
}
