/**
 * doc — the SINGLE authority on what a generated figure looks like as a
 * `model@1` document.
 *
 * The studio hands its output straight to the content-api's dry-run validator,
 * and the offline bake reads the very same document back to decide what to
 * emit. Because both go through `toModelDoc`, they cannot disagree about the
 * glb path, the clip map, the tint material or the normalisation scale — and
 * "the studio saved something the bake does not understand" stops being a
 * failure mode that exists.
 *
 * ── THE TWO-PHASE SAVE, AND WHY IT IS HONEST ────────────────────────────────
 * Saving in the studio writes PARAMETERS (this document, carrying `voxel`).
 * The .glb itself is produced offline by `pnpm voxel:gen`, which is a
 * sha256-pinned deterministic bake (#226). The studio therefore never writes a
 * byte of binary, which is not a limitation but the security dividend: the
 * content-api's binary-write allowlist (`IMAGE_EXT` = .png/.webp/.jpg/.jpeg)
 * needs no widening, no upload route is added, and the bake's byte-for-byte
 * determinism — which a browser-emitted glb could never be pinned to — survives.
 *
 * ── glbPath IS DERIVED, NEVER TYPED ─────────────────────────────────────────
 * `assets/models/voxel/<id>.glb`, deliberately OUTSIDE the two prefixes
 * `glbFacing.ts` special-cases (`assets/models/imported/` and
 * `assets/blizzard-local/models/`), so a generated figure resolves to
 * `NATIVE_GLB_YAW_OFFSET = 0` and faces +Z like the rest of the native-authored
 * models. Letting an operator type this field is precisely how a model ends up
 * under an imported prefix and silently gains 90° of yaw.
 */
import type { ModelDoc } from "../content/schema/model";
import { CLIP_MAP, CLIP_STATES } from "./clips";
import { buildFigure } from "./figure";
import { VOXEL_MATERIAL, zVoxelLook, type VoxelLook } from "./look";

/** Where every generated .glb lives, relative to `content/`. */
export const VOXEL_GLB_DIR = "assets/models/voxel";

/** Id prefix the studio mints under, so generated docs are greppable as a set. */
export const VOXEL_ID_PREFIX = "voxel.";

export function voxelGlbPath(id: string): string {
  return `${VOXEL_GLB_DIR}/${id}.glb`;
}

export function isVoxelModelId(id: string): boolean {
  return id.startsWith(VOXEL_ID_PREFIX);
}

/**
 * The clip map, TOTAL over `CLIP_STATES` by construction. `zClipMap` is strict
 * over exactly those six keys and `ClipAnimator` resolves them by exact name,
 * so a generated model can never ship a clip button that resolves to nothing —
 * the failure the .glb-import path hits routinely.
 */
export function clipMapFor(): ModelDoc["clipMap"] {
  return { ...CLIP_MAP };
}

/**
 * Turn an authored look into the document that gets written. `scale` is the
 * MEASURED normalisation (#150): whatever proportions the operator dialled in,
 * the champion still renders 1.8 u tall.
 */
export function toModelDoc(id: string, look: VoxelLook): ModelDoc & { voxel: VoxelLook } {
  const figure = buildFigure(look);
  return {
    id,
    schema: "model@1",
    glbPath: voxelGlbPath(id),
    scale: Math.round(figure.docScale * 10000) / 10000,
    collisionRadius: look.collisionRadius,
    clipMap: clipMapFor(),
    attachPoints: figure.attachPoints,
    teamTintMaterials: look.teamTint ? [VOXEL_MATERIAL] : [],
    voxel: look,
  };
}

/**
 * Read a look back out of a document — how the studio round-trips an existing
 * generated character, and how `pnpm voxel:gen` decides which docs it owns. A
 * doc without a valid `voxel` block is not ours: return null rather than guess,
 * because guessing would let the bake overwrite a hand-authored .glb.
 */
export function lookFromDoc(doc: Readonly<Record<string, unknown>>): VoxelLook | null {
  const parsed = zVoxelLook.safeParse(doc["voxel"]);
  return parsed.success ? (parsed.data as VoxelLook) : null;
}

/** Every clip state a generated model answers to, for the studio's clip buttons. */
export const GENERATED_CLIP_STATES = CLIP_STATES;
