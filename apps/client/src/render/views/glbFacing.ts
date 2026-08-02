/**
 * glbFacing — THE single authoritative source of the .glb yaw-facing
 * convention. ChampionView, StorePreview, the intermission scene and the model
 * audition page all derive their glbRoot yaw from {@link glbYawOffset}; there
 * is no other place a facing offset is defined.
 *
 * ⚠️ THIS HEADER WAS REWRITTEN 2026-08-02 BECAUSE IT WAS LYING (CLAUDE.md 第三
 * 守則). Everything below is re-measured off the shipped .glb bytes by
 * `modelFacing.test.ts`, which recomputes it on every run — so if this text
 * ever drifts from the files again, that test goes red rather than this comment
 * quietly becoming fiction. What the old header got wrong:
 *
 *   1. 「w3x-imported … bake forward = local -X」 — FALSE. Measured +X, from
 *      three independent cues (left/right skeleton chirality, the toe-vs-ankle
 *      offset of foot-weighted vertices, and the head/chest forward lean). The
 *      old header even contradicted itself: its own second measurement line
 *      ("imported + Math.PI → world +X") is only true if forward is +X.
 *   2. 「KayKit / native glTF」 — STALE. #226 deleted the KayKit characters;
 *      the native family is now the procedurally baked box-men from
 *      packages/shared/src/voxel/bake.ts. Their forward is +Z (measured).
 *   3. 「Only `imported.heroryuk` is genuinely flipped … corroborated by its
 *      hand cue」 — INCOMPLETE, and the corroboration was invented. The set
 *      missed `imported.linkstik`, which IS 180° off and IS shipped, on
 *      `godie-h00l 時空勇者 - 林克`.
 *   4. 「`imported.heropika` … its hand attach-nodes are mislabeled ONLY」 —
 *      right verdict, wrong reason. heropika's whole SKELETON is L/R-swapped
 *      (Bone_Ear_L sits on the geometric right), not just the hands. Its true
 *      forward is +X — proved by its tail bone, which sits at -X, and a tail
 *      points backwards. It correctly takes the family default.
 *
 * THE LAW, stated so it is falsifiable
 * ---------------------------------------------------------------------------
 * A model's .glb bakes a "forward" axis. Let φ be that axis's yaw on disk,
 * φ = atan2(forward.x, forward.z). Then:
 *
 *       required glbRoot yaw offset  ≡  φ   (mod 360°)
 *
 * Babylon's glTF loader inserts a `__root__` carrying rotationQuaternion
 * [0,1,0,0] (180° about Y) AND scaling (1,1,-1); the two compose to a pure X
 * mirror (Z is preserved). Push each family through that and the law falls out:
 *
 *   native   φ=  0° → mirror → +Z → offset   0° → renders world +Z  ✓
 *   imported φ= 90° → mirror → -X → offset  90° → renders world +Z  ✓
 *   flipped  φ=-90° → mirror → +X → offset 270° → renders world +Z  ✓
 *
 * and world +Z is exactly the sim facing the test drives in. The law is not
 * asserted, it is CHECKED per model against real geometry in modelFacing.test.ts.
 *
 * WHY A PER-FAMILY DEFAULT AT ALL. The two shipped families really are 90°
 * apart, because tools/w3x-import preserves the MDX forward (+X) while the
 * voxel baker authors +Z. A single global offset cannot serve both.
 *
 * WHY THE EXCEPTIONS ARE CONTENT, NOT A Set HERE (CLAUDE.md 第一守則).
 * The per-model correction now lives on the model doc as `yawOffsetDeg`
 * (`content/models/*.json`). `content/` is a live bind-mount and the client is
 * baked into its image, so as a doc field a mis-baked model is a file edit
 * instead of a rebuild + redeploy. The old hardcoded Set was also keyed by
 * `modelKey`, which could not express an override for the 40 Blizzard-overlay
 * champions at all — they share stand-in modelKeys, so one entry would have
 * rotated ~18 unrelated champions.
 *
 * ⚠️ Callers used to pass `this.modelKey` (ChampionView, IntermissionScene) or
 * `doc.id` (StorePreview, the audition page) as the exception key — two
 * different answers for the same mesh, harmless only while the Set was empty of
 * anything either of them used. {@link glbYawOffset} now takes the DOC, so the
 * arena and the shop cannot disagree by construction.
 */
import type { ModelDoc } from "@ggd/shared/content";

/** glbPath prefix identifying a w3x-imported model (baked forward +X). */
export const IMPORTED_GLB_PREFIX = "assets/models/imported/";

/**
 * glbPath prefix of the Blizzard model overlay (task #177 ships it to the
 * family host; `VITE_GGD_FULL_ASSETS=1` is what makes the client ask for it).
 * Those .glbs come out of the SAME tools/w3x-import converter, so they share
 * the imported family's baked forward — verified per file: 35 of the 40 measure
 * +X and the remaining 5 are only unmeasurable (too few paired bones), none
 * measures anything else.
 */
export const BLIZZARD_LOCAL_GLB_PREFIX = "assets/blizzard-local/models/";

/** Native/voxel-baked glTF authored forward +Z ⇒ φ = 0°. */
export const NATIVE_GLB_YAW_OFFSET = 0;

/** w3x-imported forward +X ⇒ φ = 90°. */
export const IMPORTED_GLB_YAW_OFFSET = Math.PI / 2;

/**
 * The offset for a .glb baked 180° from its own family (forward -X where the
 * family is +X) ⇒ φ = -90° ≡ 270°. Not applied by prefix — a model earns it by
 * carrying `yawOffsetDeg: 270` in its doc.
 */
export const IMPORTED_FLIPPED_GLB_YAW_OFFSET = Math.PI + Math.PI / 2;

/**
 * True when a model's .glb comes from the w3x import pipeline — either the
 * shipped `assets/models/imported/` family or the Blizzard overlay (same
 * converter ⇒ same baked forward ⇒ same default yaw offset).
 */
export function isImportedGlb(glbPath: string): boolean {
  return (
    glbPath.startsWith(IMPORTED_GLB_PREFIX) || glbPath.startsWith(BLIZZARD_LOCAL_GLB_PREFIX)
  );
}

/** The family default for a path, ignoring any per-doc override. */
export function familyGlbYawOffset(glbPath: string): number {
  return isImportedGlb(glbPath) ? IMPORTED_GLB_YAW_OFFSET : NATIVE_GLB_YAW_OFFSET;
}

/** The subset of a ModelDoc this module needs (overlay docs are synthesized). */
export type FacingModelDoc = Pick<ModelDoc, "glbPath"> & { yawOffsetDeg?: number };

/**
 * The yaw offset (radians) to apply to a loaded .glb's glbRoot so its rendered
 * facing matches the sim's planar facing.
 *
 * `yawOffsetDeg` on the doc wins when present — including when it is 0, which
 * is a meaningful value (a native-family model, or an imported one re-exported
 * to +Z), so the check is `undefined`, never falsiness.
 */
export function glbYawOffset(doc: FacingModelDoc): number {
  if (doc.yawOffsetDeg !== undefined && Number.isFinite(doc.yawOffsetDeg)) {
    return (doc.yawOffsetDeg * Math.PI) / 180;
  }
  return familyGlbYawOffset(doc.glbPath);
}
