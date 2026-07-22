/**
 * playstyle — a ONE-LINE archetype DERIVED from a champion's imported fields
 * (task #76 玩法 tab, the 系統推斷 half). It is COMPUTED, never authored prose,
 * and the profile always labels it 「系統推斷（非地圖原文）」 so an inference can
 * never masquerade as text the map actually carries.
 *
 * Inputs, all imported and already on the champion def:
 *   • attackType            → 近戰 / 遠程
 *   • baseStats.range       → long-range ranged kits read as 消耗型
 *   • baseStats.lifesteal   → sustain signal
 *   • the effect-kind mix across the kit (damage / heal / shield / dash / …)
 *   • ability radius (or a radius on any effect) → 範圍 vs 單體
 *
 * Rules (deliberately simple and legible, so the label is auditable):
 *   dash present                         → 位移 token 「突進」  (movement headline)
 *   heal / shield / lifesteal present    → 持續  else  爆發     (tempo)
 *   any radius > 0                       → 範圍  else  單體     (shape; shown when
 *                                                                not a 突進 kit)
 *   ranged AND range ≥ LONG_RANGE        → 消耗型              (poke)
 *
 * Pure + node-testable over a plain input; `playstyleForChampion` adapts a
 * ChampionDef (+ optional EX ability) into that input.
 */
import type { ChampionDef, AbilityDef } from "@ggd/shared/sim/content/defs";

/** Ranged auto-attack range at/above which the kit reads as poke (消耗型). */
export const LONG_RANGE = 8;

/** The minimal ability shape the derivation reads (radius + a flat/nested effect list). */
export interface PlaystyleAbility {
  radius?: number | null;
  effects: readonly PlaystyleEffect[];
}

/** An effect node; `onHit` carries the nested effects of spawnProjectile etc. */
export interface PlaystyleEffect {
  kind: string;
  radius?: number | null;
  onHit?: readonly PlaystyleEffect[];
}

export interface PlaystyleInput {
  attackType: string;
  /** baseStats.range (0 when absent) */
  range: number;
  /** baseStats.lifesteal (0 when absent) */
  lifesteal: number;
  abilities: readonly PlaystyleAbility[];
}

export interface Playstyle {
  /** the individual tokens, in reading order */
  tokens: string[];
  /** the tokens joined with " · " — the one line the profile prints */
  label: string;
}

/** Flatten a kit's effects (following `onHit`) into every kind + radius present. */
function walkEffects(effects: readonly PlaystyleEffect[], kinds: Set<string>, radii: number[]): void {
  for (const e of effects) {
    if (e && typeof e.kind === "string") kinds.add(e.kind);
    if (e && typeof e.radius === "number" && Number.isFinite(e.radius)) radii.push(e.radius);
    if (e && Array.isArray(e.onHit)) walkEffects(e.onHit, kinds, radii);
  }
}

/** Derive the archetype tokens from imported fields. Never returns an empty label. */
export function derivePlaystyle(input: PlaystyleInput): Playstyle {
  const kinds = new Set<string>();
  const radii: number[] = [];
  for (const ab of input.abilities) {
    if (ab && typeof ab.radius === "number" && Number.isFinite(ab.radius)) radii.push(ab.radius);
    if (ab && Array.isArray(ab.effects)) walkEffects(ab.effects, kinds, radii);
  }

  const hasDash = kinds.has("dash");
  const hasArea = radii.some((r) => r > 0);
  const sustain = kinds.has("heal") || kinds.has("shield") || kinds.has("restore") || input.lifesteal > 0;
  const ranged = input.attackType === "ranged";
  const poke = ranged && input.range >= LONG_RANGE;

  const tokens: string[] = [];
  tokens.push(ranged ? "遠程" : input.attackType === "melee" ? "近戰" : input.attackType);
  // movement is the headline when the kit dashes; otherwise the shape leads.
  tokens.push(hasDash ? "突進" : hasArea ? "範圍" : "單體");
  tokens.push(sustain ? "持續" : "爆發");
  if (poke) tokens.push("消耗型");

  return { tokens, label: tokens.join(" · ") };
}

/**
 * Adapt a ChampionDef (and an optional resolved EX ability) into a PlaystyleInput
 * and derive. `baseStats` keys are the sim `Stat` string enum ("range",
 * "lifesteal"), read defensively so a partial stat block never throws.
 */
export function playstyleForChampion(def: ChampionDef, exAbility?: AbilityDef | null): Playstyle {
  const stats = def.baseStats as Record<string, number | undefined>;
  const core = (["Q", "W", "E", "R"] as const).map((slot) => def.abilities[slot] as AbilityDef);
  const kit: AbilityDef[] = exAbility ? [...core, exAbility] : core;
  const abilities: PlaystyleAbility[] = kit.map((ab) => ({
    radius: ab.radius ?? null,
    effects: (ab.effects ?? []) as unknown as PlaystyleEffect[],
  }));
  return derivePlaystyle({
    attackType: def.attackType,
    range: typeof stats["range"] === "number" ? stats["range"] : 0,
    lifesteal: typeof stats["lifesteal"] === "number" ? stats["lifesteal"] : 0,
    abilities,
  });
}
