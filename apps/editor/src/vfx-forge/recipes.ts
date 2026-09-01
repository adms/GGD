import {
  zVfxScriptSegment,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";

/**
 * Editor-side macros: expand into ordinary vfx-script@1 blocks, so the player
 * gets no second schema and authors can still edit every resulting brick.
 */
export const VFX_FORGE_RECIPES = [
  { id: "classic-beam-fire", label: "經典橘金氣功砲", description: "ReviveHuman MDL 橫放主體＋橘金粒子外暈" },
  { id: "classic-beam-blue", label: "經典藍白氣功砲", description: "ReviveHuman MDL 橫放主體＋藍白粒子外暈" },
] as const;

export type VfxForgeRecipeId = typeof VFX_FORGE_RECIPES[number]["id"];
export const CLASSIC_BEAM_MODEL_KEY = "w3x.stock.revivehuman";

export function buildVfxForgeRecipe(
  id: VfxForgeRecipeId,
  options: { includeModelCore?: boolean } = {},
): VfxScriptSegment[] {
  const fire = id === "classic-beam-fire";
  const segments: VfxScriptSegment[] = [];
  if (options.includeModelCore ?? true) {
    segments.push(zVfxScriptSegment.parse({
      kind: "modelFx", on: "castEffect", modelKey: CLASSIC_BEAM_MODEL_KEY,
      path: "forward", speed: 13, distance: 12, scale: 0.72,
      scaleAxis: [0.48, 0.48, 2.9], spinDegPerSec: 380,
      tint: fire ? [1, 0.64, 0.12] : [0.25, 0.68, 1], alpha: 0.9,
      lifeSec: 1, offsetForwardU: 0.5, heightU: 0.85,
    }));
  }
  const vfxId = fire ? "fx.forge.beam.fire" : "fx.forge.beam.blue";
  const outerTint = fire ? [255, 132, 20] : [65, 155, 255];
  const coreTint = fire ? [255, 242, 190] : [215, 242, 255];
  // Four overlapping pulses keep the halo alive for ~1 second while remaining
  // within the shipped maxConcurrentAdditive=6 budget.
  for (const atMs of [0, 260, 520, 780]) {
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs, vfxId, at: "self",
      durationSec: 0.75, offsetForwardU: 0.5, w3xScale: 5,
      tint: outerTint, flyHeight: 80, alpha: 0.9,
    }));
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: atMs + 35, vfxId, at: "self",
      durationSec: 0.75, offsetForwardU: 0.5, w3xScale: 2.1,
      tint: coreTint, flyHeight: 80, alpha: 0.95,
    }));
  }
  return segments;
}

/** Existing ability-owned MDL bodies must not be emitted again by the script. */
export function abilityUsesModel(ability: unknown, modelKey: string): boolean {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    if (record["kind"] === "spawnModelFx" && record["modelKey"] === modelKey) return true;
    return Object.values(record).some(visit);
  };
  return visit(ability);
}
