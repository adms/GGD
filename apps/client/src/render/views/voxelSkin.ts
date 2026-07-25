/**
 * voxelSkin — apply a {@link VoxelLook} to a loaded blocky-humanoid instance.
 *
 * This is the Babylon half of the #226 per-champion variety design;
 * `voxelLook.ts` is the pure half that decides WHAT the champion looks like.
 *
 * ---------------------------------------------------------------------------
 * HOW A BAKED MESH STAYS PARAMETRIC
 * ---------------------------------------------------------------------------
 * The generator (`tools/voxel-gen/`) bakes ONE mesh per archetype, but two
 * properties make it behave like a rig you can still shape at runtime:
 *
 *   • SKINNING IS RIGID — every box is bound to exactly one joint at weight
 *     1.0. Writing `bone.scaling` therefore RESIZES that box instead of
 *     deforming a seam, and writing `bone.position` moves it cleanly.
 *   • NO CLIP ANIMATES SCALE — asserted on the emitted bytes in
 *     `tools/voxel-gen/gen.test.ts`. So a scale written once at spawn survives
 *     every clip, every frame, forever. (Positions ARE animated on `hips`, so
 *     only the shoulder offset — which lives on the hand joints — is safe to
 *     write as a translation.)
 *
 * Hiding a prop is the same mechanism: its joint goes to scale 0, the box
 * collapses to a point, and it renders zero pixels. No second mesh, no
 * `setEnabled` walk, no branch.
 *
 * ---------------------------------------------------------------------------
 * ORDER MATTERS: THIS RUNS BEFORE `applyModelTint` (#49)
 * ---------------------------------------------------------------------------
 * The palette lands in a texture on a CLONED material whose `albedoColor`
 * stays white. #49 then clones on top and MULTIPLIES `albedoColor`, so
 * `tint × palette` is exactly the perceptual multiply that module documents —
 * a `[0.29,0.29,0.29]` tint still visibly darkens 黑化Saber rather than
 * fighting a pre-darkened base.
 *
 * MATERIAL OWNERSHIP is the same rule `modelTint` follows and for the same
 * reason: `AssetManager` caches ONE AssetContainer per glb path and every
 * champion instantiates from it with `cloneMaterials: false`, so N champions
 * share one material object. Painting the source would repaint all of them.
 * We clone, tag the clone, and `releaseVoxelLook` disposes the clone AND the
 * generated texture while leaving the source untouched.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { VoxelLook, VoxelProps } from "./voxelLook";

/** Palette texture edge — must match `tools/voxel-gen/boxman.ts` TEX_EDGE. */
export const VOXEL_TEX_EDGE = 16;

/**
 * Prop group → the joints that carry it. Mirrors `PROP_JOINTS` in
 * `tools/voxel-gen/boxman.ts`; each prop has its OWN joint precisely so that
 * zeroing it cannot delete a body part.
 */
export const PROP_JOINTS: Readonly<Record<keyof VoxelProps, readonly string[]>> = {
  hat: ["hat"],
  pack: ["pack"],
  belt: ["belt"],
  pauldron: ["pauldronLeft", "pauldronRight"],
  weapon: ["weapon"],
};

/** What `applyVoxelLook` created, so the view can free exactly that and no more. */
export interface VoxelLookHandle {
  materials: Material[];
  textures: RawTexture[];
}

/**
 * The two colour-texture slots we might have to write. PBRMaterial (what the
 * glTF loader builds) exposes `albedoTexture`; StandardMaterial exposes
 * `diffuseTexture`. Declared structurally rather than by importing both
 * material classes, which would pull two large Babylon modules into the bundle
 * for two property names.
 */
interface TexturedMaterial {
  albedoTexture?: unknown;
  diffuseTexture?: unknown;
}

/**
 * Build the 16×16 palette texture for a look. Only the first row is sampled
 * (the generator puts every UV on a row-0 texel centre); the rest is filled
 * with the same columns so a mip or a stray sample can never pick up garbage.
 */
export function buildPaletteTexture(look: VoxelLook, scene: Scene): RawTexture {
  const n = VOXEL_TEX_EDGE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = look.palette[Math.min(x, look.palette.length - 1)]!;
      const o = (y * n + x) * 4;
      data[o] = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
      data[o + 1] = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
      data[o + 2] = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new RawTexture(
    data,
    n,
    n,
    Engine.TEXTUREFORMAT_RGBA,
    scene,
    false, // NO mipmaps — a 16px palette must not blur its neighbours together
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  tex.name = "voxel-palette";
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/** Bone-like duck type — avoids importing Skeleton/Bone just for two setters. */
interface BoneLike {
  name: string;
  scaling?: { set(x: number, y: number, z: number): void };
  position?: { x: number };
  setScale?(v: unknown): void;
}

interface SkeletonLike {
  bones: BoneLike[];
}

function setBoneScale(bone: BoneLike, x: number, y: number, z: number): void {
  bone.scaling?.set(x, y, z);
}

/**
 * Apply `look` to an instantiated blocky humanoid.
 *
 * `meshes` are the instance's child meshes (their materials get the palette),
 * `skeletons` the instance's skeletons (their bones get the proportions).
 * Returns the resources the caller must free in `dispose()`; returns null when
 * there was nothing to paint, so a caller can store it unconditionally.
 *
 * Idempotent per instance: a second call clones again, which is why the caller
 * keeps the handle rather than re-deriving it.
 */
export function applyVoxelLook(
  meshes: readonly AbstractMesh[],
  skeletons: readonly SkeletonLike[],
  look: VoxelLook,
  scene: Scene,
  label = "voxel",
): VoxelLookHandle | null {
  const handle: VoxelLookHandle = { materials: [], textures: [] };

  // --- palette ------------------------------------------------------------
  const cloned = new Map<Material, Material>();
  for (const mesh of meshes) {
    const src = mesh.material;
    if (!src) continue;
    let clone = cloned.get(src);
    if (!clone) {
      const made = src.clone(`${label}-${src.name}`);
      if (!made) continue;
      const tex = buildPaletteTexture(look, scene);
      // Write whichever colour-texture slot this material family exposes, so
      // the palette never silently no-ops on a StandardMaterial stub.
      const slot = made as unknown as TexturedMaterial;
      if ("albedoTexture" in slot) slot.albedoTexture = tex;
      else slot.diffuseTexture = tex;
      handle.textures.push(tex);
      handle.materials.push(made);
      clone = made;
      cloned.set(src, made);
    }
    mesh.material = clone;
  }

  // --- proportions + prop mask -------------------------------------------
  const hidden = new Set<string>();
  for (const [group, joints] of Object.entries(PROP_JOINTS)) {
    if (!look.props[group as keyof VoxelProps]) for (const j of joints) hidden.add(j);
  }
  const p = look.proportions;
  for (const skel of skeletons) {
    for (const bone of skel.bones ?? []) {
      if (hidden.has(bone.name)) {
        setBoneScale(bone, 0, 0, 0);
        continue;
      }
      switch (bone.name) {
        case "head":
          setBoneScale(bone, p.head, p.head, p.head);
          break;
        case "chest":
          // width/depth only: scaling the torso's Y would move the head, whose
          // joint is a CHILD of chest, and break the 1.8 u height contract.
          setBoneScale(bone, p.torsoWidth, 1, p.torsoWidth);
          break;
        case "handLeft":
        case "handRight":
          setBoneScale(bone, 1, p.armLength, 1);
          if (bone.position) {
            const sign = bone.name === "handRight" ? 1 : -1;
            bone.position.x += sign * p.shoulderOffset;
          }
          break;
        case "footLeft":
        case "footRight":
          setBoneScale(bone, 1, p.legLength, 1);
          break;
        default:
          break;
      }
    }
  }

  return handle.materials.length > 0 || handle.textures.length > 0 ? handle : null;
}

/**
 * Free everything `applyVoxelLook` created. Deliberately does NOT touch the
 * source material — that object belongs to the AssetManager's container cache
 * and is shared with every other champion on this mesh.
 */
export function releaseVoxelLook(handle: VoxelLookHandle | null | undefined): void {
  if (!handle) return;
  for (const m of handle.materials) m.dispose(false, false);
  for (const t of handle.textures) t.dispose();
  handle.materials.length = 0;
  handle.textures.length = 0;
}

/** True when this glb is one of the generated blocky humanoids. */
export function isBlockyGlb(glbPath: string | null | undefined): boolean {
  return typeof glbPath === "string" && glbPath.startsWith("assets/models/champions/blocky-");
}

/** The transform node's meshes, as a convenience for callers holding a root. */
export function meshesUnder(root: TransformNode): AbstractMesh[] {
  return root.getChildMeshes(false);
}
