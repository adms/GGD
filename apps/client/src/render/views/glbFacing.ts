/**
 * glbFacing — THE single authoritative source of the .glb yaw-facing
 * convention. Both the in-arena ChampionView and the store's StorePreview
 * derive their glbRoot yaw offset from {@link glbYawOffset} here; there is no
 * other place a facing offset is defined.
 *
 * WHY A PER-SOURCE OFFSET (measured, not guessed)
 * -----------------------------------------------
 * A model's on-disk .glb bakes a "forward" axis. After Babylon's glTF loader
 * applies its right-handed→left-handed flip (the __root__ node with
 * scaling.z = -1), the two model families we ship point DIFFERENT ways in the
 * loaded frame:
 *
 *   • KayKit / native glTF (assets/models/{champions,hex,props}/*.glb) bake
 *     forward = local +Z.
 *   • w3x-imported glTF (assets/models/imported/*.glb, produced by
 *     tools/w3x-import) bake forward = local -X — exactly 90° clockwise from
 *     KayKit. This is a property of the WC3→glTF basis change in
 *     tools/w3x-import/w3xlib/gltf.py (_v/_q merely PRESERVE the MDX forward,
 *     which lands on -X), NOT of any individual model.
 *
 * Our facing convention is root.rotation.y = atan2(fx, fz) (the sim's planar
 * facing), then glbRoot.rotation.y = the offset below. Measured end-to-end
 * through this exact chain (NullEngine, sim facing +Z):
 *
 *   • KayKit + Math.PI                → renders world -Z  (visually verified ✓)
 *   • imported + Math.PI              → renders world +X  (90° wrong — the
 *                                       "人物面向差90度" bug)
 *   • imported + (Math.PI + Math.PI/2) → renders world -Z  (matches KayKit ✓)
 *
 * A single global offset therefore CANNOT satisfy both families (their baked
 * forwards are 90° apart). KayKit is the verified-correct reference, so the
 * imported family gets an extra +90° to line up with it.
 *
 * The true root-cause fix is to bake the +90° into the exporter and re-export
 * (tools/w3x-import/w3xlib/gltf.py), after which a single Math.PI would cover
 * everyone; that is deferred to the re-import job so the shipped .glbs are not
 * churned here. See docs/todo/models.md.
 */

/** glbPath prefix identifying a w3x-imported model (basis 90° off KayKit). */
export const IMPORTED_GLB_PREFIX = "assets/models/imported/";

/**
 * glbPath prefix of the LOCAL-ONLY Blizzard model overlay
 * (content/assets/blizzard-local/README.md — dev machines only, never
 * deployed). Those .glbs come out of the SAME tools/w3x-import converter as
 * `assets/models/imported/`, so they share the imported family's baked forward
 * (-X) and must take the imported yaw offset, not the native one.
 */
export const BLIZZARD_LOCAL_GLB_PREFIX = "assets/blizzard-local/models/";

// FACING SIGN (人物面向剛好相反 fix): the earlier pass aligned the two model
// families but left BOTH rendering 180° backward (a model ordered to move +Z
// faced world -Z, i.e. away from its movement) — the KayKit "verified correct"
// baseline was never actually eyeballed in-match. Every offset below is the
// previous value + 180° so a champion now faces the direction it moves.

/** KayKit / native glTF authored forward +Z. Faces movement at offset 0. */
export const NATIVE_GLB_YAW_OFFSET = 0;

/** w3x-imported forward -X → +90° extra to match the native family's render. */
export const IMPORTED_GLB_YAW_OFFSET = Math.PI / 2;

/** A w3x-imported .glb whose baked forward is +X (180° from its own family). */
export const IMPORTED_FLIPPED_GLB_YAW_OFFSET = Math.PI + Math.PI / 2;

/**
 * modelKeys of imported .glbs whose baked forward is 180° opposite the
 * imported family (forward +X instead of -X), so they need
 * {@link IMPORTED_FLIPPED_GLB_YAW_OFFSET} instead of the family offset.
 *
 * Only `imported.heroryuk` is genuinely flipped (its foot/head/mid geometry
 * all point +X, corroborated by its hand cue). It is NOT referenced by any
 * champion or skin today, so it never reaches an in-arena ChampionView, but it
 * is listed here so the convention stays correct if it is ever adopted or
 * shown in the store preview.
 *
 * NOTE: `imported.heropika` looks flipped by its hand attach-nodes ONLY — its
 * Hand Left/Right nodes are mislabeled in the source. Its actual body geometry
 * (feet/head/torso) points -X like the rest of the family, so it is deliberately
 * NOT in this set and takes the normal imported offset.
 */
export const FLIPPED_IMPORTED_MODEL_KEYS: ReadonlySet<string> = new Set([
  "imported.heroryuk",
]);

/**
 * True when a model's .glb comes from the w3x import pipeline — either the
 * shipped `assets/models/imported/` family or the dev-only Blizzard overlay
 * (same converter ⇒ same baked forward ⇒ same yaw offset).
 */
export function isImportedGlb(glbPath: string): boolean {
  return (
    glbPath.startsWith(IMPORTED_GLB_PREFIX) || glbPath.startsWith(BLIZZARD_LOCAL_GLB_PREFIX)
  );
}

/**
 * The yaw offset (radians) to apply to a loaded .glb's glbRoot so its rendered
 * facing matches the sim's planar facing. `modelKey` is optional and only
 * consulted for the rare 180°-flipped imported models.
 */
export function glbYawOffset(glbPath: string, modelKey?: string): number {
  if (!isImportedGlb(glbPath)) return NATIVE_GLB_YAW_OFFSET;
  if (modelKey !== undefined && FLIPPED_IMPORTED_MODEL_KEYS.has(modelKey)) {
    return IMPORTED_FLIPPED_GLB_YAW_OFFSET;
  }
  return IMPORTED_GLB_YAW_OFFSET;
}
