/**
 * standIn — is a champion wearing a generic STAND-IN model rather than its own
 * imported one? (task #76 profile block; the underlying data debt is task #77.)
 *
 * 43 of the 114 champions point their `modelKey` at one of four generic meshes
 * instead of an `imported.*` mesh extracted from the w3x (re-measured on the
 * v0.5.16 tree; earlier notes said 42/113, then 44 — the 44 counted 喪標麥可,
 * which #217 has since moved onto its own `champ.godie-zombiex` zombie mesh).
 * Since #226 those four are the GENERATED blocky humanoids (`tools/voxel-gen`),
 * not the retired KayKit characters:
 *
 *     champ.sela            → blocky-mage.glb      (18 champions)
 *     champ.thorne          → blocky-knight.glb    (10)
 *     champ.skin.barbarian  → blocky-barbarian.glb ( 9)
 *     champ.skin.rogue      → blocky-rogue.glb     ( 6)
 *
 * A generated box-man is still a stand-in — arguably more honestly so, since it
 * makes no claim to be the champion's own art — so the label below stays. The
 * per-champion palette/proportions #226 applies at runtime make the 43 visually
 * distinct from one another, but they are still not the character's real model.
 *
 * TASK #231 CHANGED WHAT THIS MEANS, AND ONLY HALF OF IT.
 * All 43 now have their OWN deterministically generated voxel skin, and
 * `ChampionView` declines the shared glb for them — so IN THE ARENA nobody
 * wears somebody else's face any more. The champ-select / shop / settlement
 * stages, however, still mount the glb through `StorePreview`, which has no
 * procedural path (#226 open question), so on THOSE surfaces the shared mesh is
 * still what renders. The note below therefore stays — narrowed to say what is
 * actually true of the stage the player is looking at, rather than being
 * deleted on the strength of a fix that has not reached it yet.
 *
 * The `voxel-standin` CONTENT TAG (40 of these 43 docs carry it; sela's and
 * thorne's own three in-house docs do not) is likewise KEPT and re-read: it
 * means "this champion has no imported art of its own", which is still exactly
 * true — its generated look is procedural, not imported. Retiring the tag would
 * lose the only content-side handle on the population #226 is replacing.
 *
 * Pure + node-testable: it reads a modelKey string, never the render layer.
 *
 * The set is deliberately EXPLICIT rather than a `champ.` prefix rule: every
 * real per-champion model is `imported.*` (or a runtime-synthesized Blizzard
 * overlay), and pinning the four known fallbacks means a champion that later
 * gains its OWN `champ.*` mesh is not mistaken for a stand-in. If a fifth
 * generic fallback is ever added to the content, it is added here too.
 */

/** The four generic meshes used when a champion has no imported model. */
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
export const STAND_IN_NOTE_ZH = "替身模型 · 本頁預覽用；戰鬥中已改用本角色專屬體素外觀";
export const STAND_IN_NOTE_EN =
  "stand-in model — preview only; in combat this champion wears its own generated voxel look";
