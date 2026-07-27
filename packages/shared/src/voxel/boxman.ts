/**
 * boxman — the parametric blocky humanoid: the part table, the joint table and
 * the palette layout that every generated champion mesh is built from.
 *
 * WHY A TABLE AND NOT A MODEL FILE. Owner directive #226 replaced the four
 * high-poly CC0 stand-ins with Minecraft-STYLE blocky humanoids. The blocky
 * look is a style, not a protectable asset, and nothing here is downloaded,
 * copied or derived from any Mojang/Microsoft model, skin or texture: the whole
 * figure is 14 axis-aligned boxes emitted from the numbers below. The box
 * vocabulary is this project's own — `apps/client/src/render/views/
 * ChampionView.ts` has drawn exactly this figure procedurally since task #64,
 * and the proportions here are lifted from it verbatim so the baked mesh and
 * the procedural fallback are the SAME character.
 *
 * TWO INVARIANTS THAT ARE LOAD-BEARING, NOT COSMETIC
 * --------------------------------------------------
 * 1. **Every box stays inside y ∈ [0, 32] voxel-px.** Hats, weapons and packs
 *    are tucked into the head/torso envelope rather than sticking out above it.
 *    That makes the measured hierarchy height EXACTLY 32 × PX = 1.8 u — which
 *    is `ChampionView.TARGET_HEIGHT` — so #150's normalisation factor is 1.0
 *    and `doc.scale` is an honest 1.0. It also fixes the failure mode the old
 *    stand-ins had: `mage.glb` measured 3.0028 u because its staff inflated the
 *    hierarchy bbox, so the BODY rendered small to compensate.
 * 2. **Skinning is RIGID: one joint per box at weight 1.0, and no animation
 *    channel ever targets `scale`.** That is what turns a baked mesh back into
 *    a parametric rig at runtime: the client can write per-champion joint
 *    SCALE and joint OFFSET (see `apps/client/src/render/views/voxelSkin.ts`)
 *    without deforming anything and without an animation clobbering it on the
 *    next frame. Setting a prop joint's scale to 0 collapses its box to a point
 *    — zero pixels, no branch, no second mesh.
 *
 * ── WHY THIS LIVES IN @ggd/shared AND NOT IN tools/ (task #229) ─────────────
 * The owner's #229 directive is a 體素角色生成器 WEB PAGE in the admin console,
 * and its one hard requirement is that the page drive the SAME generator the
 * game ships — 「不要 fork 第二個長得很像的產生器」. A generator that lives only
 * in `tools/voxel-gen/` cannot be imported by `apps/admin` (a browser bundle
 * must not pull a node CLI), so the part/joint/palette tables were re-homed
 * HERE, where the offline bake, the admin studio and the client can all reach
 * them. Nothing in this file imports node, Babylon, zod or `Buffer` — that is
 * what makes the three-way share possible, and it is a constraint, not a
 * coincidence.
 *
 * RECONCILIATION WITH #226 (its branch is `feat/blocky-voxel-characters`):
 * these tables are #226's own numbers, byte-identical, not a re-derivation.
 * When #226 merges, `tools/voxel-gen/boxman.ts` should become
 * `export * from "@ggd/shared/voxel/boxman";` — a move plus a re-export, never
 * a rewrite. If the two ever drift, the admin preview starts lying about the
 * character the bake will emit, which is the exact failure #229 exists to
 * prevent. `packages/shared/src/voxel/figure.test.ts` pins the invariants that
 * make the drift detectable (32-px envelope, forward +Z, triangle budget).
 */

/** World units per voxel pixel. 32 voxel-px tall → 1.8 u, matching ChampionView.PX. */
export const PX = 1.8 / 32;

/** Full figure height in voxel px. Feet at 0, top of head at 32. */
export const FIGURE_PX = 32;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * Palette slots — columns of the 16x16 texture's row 0. Every box face's four
 * UVs sit on the exact texel CENTRE of its slot, so there is no filtering bleed
 * and the mesh is flat-shaded blocky by construction.
 *
 * WHY ONE TEXTURE AND NOT N MATERIALS: one mesh / one material / ONE DRAW CALL,
 * against `tools/model-budget/limits.ts`'s champion gate of warn 3 / limit 5
 * meshes. It also keeps #49 on its documented path — `applyModelTint`
 * multiplies `albedoColor`, which starts white here, so tint × palette is
 * exactly the intended perceptual multiply.
 */
export const SLOT = {
  skin: 0,
  cloth1: 1,
  cloth2: 2,
  accent: 3,
  trim: 4,
  boot: 5,
  eye: 6,
  prop: 7,
} as const;

export type SlotName = keyof typeof SLOT;

/** Palette texture edge. 16 clears the ≤8x8 "exporter placeholder" rule with room to spare. */
export const TEX_EDGE = 16;

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

/**
 * Joint names come from the canonical attachment vocabulary in
 * `apps/client/src/render/vfx/attachment.ts` (`overhead / weapon / sprite /
 * origin / chest / mount / head / hand / foot` + left/right qualifiers), so a
 * WC3 effect's `right,hand` attach string resolves on the box-man with ZERO new
 * mapping — the same token-set rule that already serves 337 imported glbs.
 */
export interface JointDef {
  name: string;
  /** index of the parent joint, or -1 for the skeleton root */
  parent: number;
  /** local translation from the parent joint, in voxel px */
  local: readonly [number, number, number];
}

export const JOINTS: readonly JointDef[] = [
  { name: "origin", parent: -1, local: [0, 0, 0] },
  { name: "hips", parent: 0, local: [0, 12, 0] },
  { name: "chest", parent: 1, local: [0, 0, 0] },
  { name: "head", parent: 2, local: [0, 12, 0] },
  { name: "overhead", parent: 3, local: [0, 8, 0] },
  { name: "handLeft", parent: 2, local: [-6, 12, 0] },
  { name: "handRight", parent: 2, local: [6, 12, 0] },
  { name: "weapon", parent: 6, local: [0, -11, 2] },
  { name: "footLeft", parent: 1, local: [-2, 0, 0] },
  { name: "footRight", parent: 1, local: [2, 0, 0] },
  // --- prop carriers -------------------------------------------------------
  // Each optional prop hangs off its OWN joint so a single `bone.scaling = 0`
  // collapses it without touching the body. Binding the belt to `chest` or a
  // pauldron to `handLeft` would have been one joint cheaper and would have
  // made "hide the belt" mean "delete the torso".
  { name: "hat", parent: 3, local: [0, 6, 0] },
  { name: "pack", parent: 2, local: [0, 7, -3] },
  { name: "belt", parent: 2, local: [0, 1, 0] },
  { name: "pauldronLeft", parent: 2, local: [-7, 11.5, 0] },
  { name: "pauldronRight", parent: 2, local: [7, 11.5, 0] },
];

/** Joint name → index, for the clip and prop tables. */
export const JOINT_INDEX: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(JOINTS.map((j, i) => [j.name, i])),
);

/** Global bind position of each joint, in voxel px (parents are pure translations). */
export function jointGlobals(): [number, number, number][] {
  const out: [number, number, number][] = [];
  JOINTS.forEach((j, i) => {
    // annotated (not inferred) because @ggd/shared compiles under
    // `noUncheckedIndexedAccess`, where a bare `[0, 0, 0]` widens to number[]
    // and every element read becomes `number | undefined`
    const p: [number, number, number] = j.parent >= 0 ? out[j.parent]! : [0, 0, 0];
    out[i] = [p[0] + j.local[0], p[1] + j.local[1], p[2] + j.local[2]];
  });
  return out;
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** Which optional prop group a box belongs to. `core` boxes are always present. */
export type PropGroup = "core" | "hat" | "pack" | "belt" | "pauldron" | "weapon" | "face";

export interface BoxDef {
  name: string;
  /** joint this box is rigidly bound to (weight 1.0) */
  joint: string;
  /** centre in voxel px, mesh space */
  center: readonly [number, number, number];
  /** width (x), height (y), depth (z) in voxel px */
  size: readonly [number, number, number];
  slot: SlotName;
  group: PropGroup;
}

/**
 * The part list. 14 boxes × 12 triangles = 168 triangles — 1.05 % of the
 * champion gate's 16,000-triangle warn, and ~2.7 % of the 6,952-triangle
 * `knight.glb` it replaces.
 *
 * Prop boxes are baked into EVERY archetype and collapsed by zeroing their
 * joint's scale (see the header). ~84 triangles are therefore "dead" on a
 * champion that wears no props — irrelevant at this budget, and it is what buys
 * 144 prop silhouettes per archetype off a single baked file.
 */
export const BOXES: readonly BoxDef[] = [
  // --- core (6 boxes, 72 tris) — the classic 8:12:4 voxel proportions -------
  { name: "torso", joint: "chest", center: [0, 18, 0], size: [8, 12, 4], slot: "cloth1", group: "core" },
  { name: "head", joint: "head", center: [0, 28, 0], size: [8, 8, 8], slot: "skin", group: "core" },
  { name: "armLeft", joint: "handLeft", center: [-6, 18, 0], size: [4, 12, 4], slot: "cloth2", group: "core" },
  { name: "armRight", joint: "handRight", center: [6, 18, 0], size: [4, 12, 4], slot: "cloth2", group: "core" },
  { name: "legLeft", joint: "footLeft", center: [-2, 6, 0], size: [4, 12, 4], slot: "boot", group: "core" },
  { name: "legRight", joint: "footRight", center: [2, 6, 0], size: [4, 12, 4], slot: "boot", group: "core" },
  // --- face: the ONE asymmetry that gives the figure a readable front -------
  // A thin dark band on the head's +Z face. Forward is +Z (the KayKit/native
  // convention `glbFacing.ts` gives NATIVE_GLB_YAW_OFFSET = 0), so this is also
  // the orientation guard's witness: if the face ever renders behind the pack,
  // the bake flipped.
  { name: "face", joint: "head", center: [0, 28.5, 4.1], size: [5, 1.5, 0.4], slot: "eye", group: "face" },
  // --- props (7 boxes, 84 tris), all inside the 0..32 envelope --------------
  { name: "hat", joint: "hat", center: [0, 30.5, 0], size: [10, 3, 10], slot: "accent", group: "hat" },
  { name: "pack", joint: "pack", center: [0, 19, -3.2], size: [8, 10, 2], slot: "accent", group: "pack" },
  { name: "belt", joint: "belt", center: [0, 13, 0], size: [9, 2, 5], slot: "trim", group: "belt" },
  { name: "pauldronLeft", joint: "pauldronLeft", center: [-7, 23.5, 0], size: [5, 3, 5], slot: "trim", group: "pauldron" },
  { name: "pauldronRight", joint: "pauldronRight", center: [7, 23.5, 0], size: [5, 3, 5], slot: "trim", group: "pauldron" },
  { name: "weaponGrip", joint: "weapon", center: [6, 17, 2], size: [2, 8, 2], slot: "prop", group: "weapon" },
  { name: "weaponHead", joint: "weapon", center: [6, 26, 2], size: [3, 10, 2], slot: "trim", group: "weapon" },
];

/** Every prop group that can be toggled per archetype / per champion. */
export const PROP_GROUPS: readonly PropGroup[] = ["hat", "pack", "belt", "pauldron", "weapon"];

/**
 * Prop group → the joints that carry it, and NOTHING else. Setting every joint
 * in a group to `scaling = 0` collapses that prop to zero pixels; setting it
 * back to 1 restores it. This is the whole "144 silhouettes per archetype"
 * mechanism, and the reason the joint table has five carrier joints.
 */
export const PROP_JOINTS: Readonly<Record<Exclude<PropGroup, "core" | "face">, readonly string[]>> = {
  hat: ["hat"],
  pack: ["pack"],
  belt: ["belt"],
  pauldron: ["pauldronLeft", "pauldronRight"],
  weapon: ["weapon"],
};

export interface Vertex {
  pos: [number, number, number];
  normal: [number, number, number];
  uv: [number, number];
  joint: number;
}

/** Texel centre of a palette slot in row 0 of the TEX_EDGE² texture. */
export function slotUv(slot: SlotName): [number, number] {
  return [(SLOT[slot] + 0.5) / TEX_EDGE, 0.5 / TEX_EDGE];
}

const FACES: readonly {
  normal: [number, number, number];
  corners: readonly [number, number, number][];
}[] = [
  { normal: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

/**
 * `FACES` index → the ATLAS face name it is.
 *
 * `FACES` is authored by NORMAL (+X, -X, +Y, -Y, +Z, -Z); `ATLAS_FACES` is
 * authored by NAME (front/back/right/left/top/bottom) against Babylon's
 * `CreateBox` face order, where +Z is front and +X is right. This array is the
 * one place the two vocabularies meet, so a future re-order of either has
 * exactly one line to fix instead of six silent mis-mappings.
 */
export const FACE_NAME_BY_NORMAL = Object.freeze([
  "right", // +X
  "left", // -X
  "top", // +Y
  "bottom", // -Y
  "front", // +Z
  "back", // -Z
] as const);

/** A rect in a 64×64 atlas, origin top-left — mirrors `voxelSkin.AtlasRect`. */
export interface UvRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Emit one box with PER-FACE ATLAS UVs instead of a palette texel.
 *
 * `emitBox` (below) points all 24 vertices at one texel of the 16×16 lookup
 * table, which is why a box baked that way can only ever be ONE flat colour —
 * and a barcode is by definition several. So the 特徵生成 bake uses this
 * emitter, which maps each face onto its own rect of the 64×64 skin atlas.
 * Nothing about the geometry changes: same corners, same normals, same rigid
 * binding, same winding, so the two emitters are interchangeable everywhere
 * except in what the fragment shader reads.
 *
 * VERTICAL ORIENTATION IS THE LOAD-BEARING PART. A barcode is a stack of
 * horizontal bands, so `v` must increase DOWNWARD (glTF's UV origin is the
 * top-left of the image, and the atlas is authored top-down): the top of the
 * box has to sample the top of the rect or the character comes out upside
 * down while still passing any "it has a texture" check.
 */
export function emitBoxAtlas(
  box: BoxDef,
  jointIndex: number,
  rects: Readonly<Record<string, UvRect>>,
  atlasW: number,
  atlasH: number,
): { verts: Vertex[]; indices: number[] } {
  const [cx, cy, cz] = box.center;
  const hx = box.size[0] / 2;
  const hy = box.size[1] / 2;
  const hz = box.size[2] / 2;
  const verts: Vertex[] = [];
  const indices: number[] = [];
  FACES.forEach((face, fi) => {
    const rect = rects[FACE_NAME_BY_NORMAL[fi]!]!;
    const base = verts.length;
    // Which corner components are the face's own horizontal / vertical axes.
    // For ±Y (a horizontal face) the in-plane "vertical" is Z.
    const horizontal = fi < 2 ? 2 : 0; // ±X faces run along Z, everything else along X
    const vertical = fi < 2 || fi >= 4 ? 1 : 2; // ±Y faces run along Z
    for (const c of face.corners) {
      const u = (rect.x + (c[horizontal]! > 0 ? rect.w : 0)) / atlasW;
      const v = (rect.y + (c[vertical]! > 0 ? 0 : rect.h)) / atlasH;
      verts.push({
        pos: [(cx + c[0] * hx) * PX, (cy + c[1] * hy) * PX, (cz + c[2] * hz) * PX],
        normal: [...face.normal] as [number, number, number],
        uv: [u, v],
        joint: jointIndex,
      });
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { verts, indices };
}

/**
 * Emit one box as 24 vertices (per-face normals + per-face UVs) and 36 indices,
 * all rigidly bound to `box.joint`. Positions are in WORLD units (voxel px × PX).
 */
export function emitBox(box: BoxDef, jointIndex: number): { verts: Vertex[]; indices: number[] } {
  const [cx, cy, cz] = box.center;
  const hx = box.size[0] / 2;
  const hy = box.size[1] / 2;
  const hz = box.size[2] / 2;
  const uv = slotUv(box.slot);
  const verts: Vertex[] = [];
  const indices: number[] = [];
  for (const face of FACES) {
    const base = verts.length;
    for (const c of face.corners) {
      verts.push({
        pos: [(cx + c[0] * hx) * PX, (cy + c[1] * hy) * PX, (cz + c[2] * hz) * PX],
        normal: [...face.normal] as [number, number, number],
        uv: [...uv] as [number, number],
        joint: jointIndex,
      });
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { verts, indices };
}
