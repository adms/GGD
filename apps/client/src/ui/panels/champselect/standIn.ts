/**
 * standIn — is a champion wearing a generic STAND-IN model rather than its own
 * imported one? (task #76 profile block; the underlying data debt is task #77.)
 *
 * 42 of the 113 champions point their `modelKey` at one of four generic KayKit
 * meshes instead of a `imported.*` mesh extracted from the w3x:
 *
 *     champ.sela            → mage.glb      (18 champions)
 *     champ.thorne          → knight.glb    (10)
 *     champ.skin.barbarian  → barbarian.glb ( 8)
 *     champ.skin.rogue      → rogue.glb     ( 6)
 *
 * The champ-select 3D stage must NOT present one of these as the champion's real
 * model — that is the exact silent misrepresentation task #77 is about. So the
 * profile flags a stand-in and labels the stage instead of pretending. Pure +
 * node-testable: it reads a modelKey string, never the render layer.
 *
 * The set is deliberately EXPLICIT rather than a `champ.` prefix rule: every
 * real per-champion model is `imported.*` (or a runtime-synthesized Blizzard
 * overlay), and pinning the four known fallbacks means a champion that later
 * gains its OWN `champ.*` mesh is not mistaken for a stand-in. If a fifth
 * generic fallback is ever added to the content, it is added here too.
 */

/** The four generic KayKit meshes used when a champion has no imported model. */
export const STAND_IN_MODEL_KEYS: ReadonlySet<string> = new Set([
  "champ.sela",
  "champ.thorne",
  "champ.skin.barbarian",
  "champ.skin.rogue",
]);

/** True when `modelKey` is one of the generic stand-in meshes (never a real model). */
export function isStandInModel(modelKey: string | null | undefined): boolean {
  return typeof modelKey === "string" && STAND_IN_MODEL_KEYS.has(modelKey);
}

/**
 * The honest one-line label the stage shows over a stand-in, so nobody reads a
 * generic mage/knight as the champion. Trilingual-adjacent (zh load-bearing).
 */
export const STAND_IN_NOTE_ZH = "替身模型 · 尚未匯入本角色專屬外觀";
export const STAND_IN_NOTE_EN = "stand-in model — this champion's own art isn't imported yet";
