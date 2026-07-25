/**
 * voxelSkin/roster — the ONE adapter from "a champion" to `VoxelSkinInput`.
 *
 * There are three places a champion is available in three different shapes:
 * the authored JSON doc (admin sheet, node tests), the sim `ChampionDef` the
 * registries hold (client render path), and hand-built fixtures (unit tests).
 * All three go through this file, so all three produce byte-identical inputs
 * and therefore byte-identical skins. If a fourth consumer appears, it adapts
 * here — never by assembling a `VoxelSkinInput` literal of its own.
 */
import type { VoxelSkinInput } from "./types";

/** The champion shape this adapter reads — deliberately structural, not nominal. */
export interface ChampionLike {
  id: string;
  name?: string;
  attackType?: string;
  modelKey?: string;
  tags?: readonly string[];
  abilities?: Partial<Record<"Q" | "W" | "E" | "R", { vfxKey?: string } | undefined>>;
}

/** Ability slot order. FROZEN: the element histogram depends on it. */
const SLOTS = Object.freeze(["Q", "W", "E", "R"] as const);

/**
 * Adapt any champion-shaped object (JSON doc or sim `ChampionDef`) into the
 * generator's input. Missing fields degrade to the "?" element band rather than
 * throwing — a half-authored champion still gets a look.
 */
export function voxelSkinInputOf(champion: ChampionLike): VoxelSkinInput {
  return {
    id: champion.id,
    name: champion.name,
    attackType: champion.attackType,
    modelKey: champion.modelKey,
    tags: champion.tags,
    vfxKeys: SLOTS.map((s) => champion.abilities?.[s]?.vfxKey),
  };
}
