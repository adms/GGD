/**
 * bake — turn a `VoxelLook` into REAL .glb BYTES. The output half of the
 * generator, and the piece that had never left `tools/`.
 *
 * ── WHY IT MOVED HERE (task #229) ───────────────────────────────────────────
 * #226 put the part tables, the clips and the archetypes in @ggd/shared so the
 * admin studio could PREVIEW the same character the bake ships. It stopped
 * there: `bakeArchetype` — the function that actually emits a file — stayed in
 * `tools/voxel-gen/gen.ts` behind node's `Buffer` and `node:crypto`. So the
 * 後台 page could show a figure and could write a `model@1` doc, but the .glb
 * itself still had to come out of `pnpm voxel:gen` on the owner's laptop. That
 * is the gap the owner actually feels: a generator page that cannot generate.
 *
 * Everything below is a MOVE, not a rewrite. `tools/voxel-gen/gen.test.ts`
 * pins the sha256 of all five shipped files and asserts the bytes on disk
 * match; those pins are unchanged, so the move is proved byte-for-byte rather
 * than argued.
 *
 * ── ONE PATH, NOT TWO ───────────────────────────────────────────────────────
 * `bakeLook()` is the only emitter. `bakeArchetype()` is a one-line wrapper
 * over `lookFromArchetype()`, which is what makes the owner's 「不要 fork 第二個
 * 產生器」 mechanical: the studio edits a `VoxelLook`, the CLI bakes a
 * `VoxelLook`, and `bake.test.ts` asserts the two produce identical bytes for
 * all five archetypes. A divergence cannot hide in a code path nobody runs,
 * because there is only one code path.
 *
 * ── BUDGET IS AN OUTPUT, NOT A FOOTNOTE ─────────────────────────────────────
 * Every bake returns `BakeStats` with the triangle count and the byte size.
 * #226 exists because four CC0 characters were too heavy; a generator that
 * emits a file without saying what it costs would be reintroducing exactly the
 * blindness the task was raised to end. The admin page renders these numbers
 * next to the model each figure replaces.
 *
 * IP: no Mojang/Microsoft asset is involved. Nothing is downloaded and nothing
 * is derived from any third-party model, skin or texture — every vertex comes
 * from `boxman.ts`, every keyframe from `clips.ts`, every colour from the
 * `VoxelLook` the caller passes in.
 */
import {
  BOXES,
  FIGURE_PX,
  JOINTS,
  JOINT_INDEX,
  PROP_JOINTS,
  PX,
  TEX_EDGE,
  emitBox,
} from "./boxman";
import { CLIPS, DRIVEN_ROTATION_JOINTS, type ClipDef, type DrivenJoint, type Euler } from "./clips";
import { ARCHETYPES, type Archetype, type Palette } from "./archetypes";
import { GlbBuilder, q, translationMat } from "./glbWrite";
import { encodePng } from "./pngWrite";
import { sha256Hex } from "./bytes";
import { lookFromArchetype, type ShapedJoint, type Vec3, type VoxelLook } from "./look";

// ---------------------------------------------------------------------------
// Palette texture
// ---------------------------------------------------------------------------

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Build the 16×16 palette image. Row 0 holds the eight live slots (the only
 * texels any UV samples) followed by eight neutral steps; rows 1..15 hold a
 * shade ramp of the same columns, so the image is a genuine palette rather than
 * a mostly-empty sheet, and a future generator can address shading rows without
 * a re-bake. 16×16 also clears `modelTexture.test.ts`'s rule that any embedded
 * image of 8×8 or smaller is an unresolved-texture placeholder.
 */
export function paletteImage(palette: Palette): Uint8Array {
  const px = new Uint8Array(TEX_EDGE * TEX_EDGE * 4);
  const cols: [number, number, number][] = [];
  for (let i = 0; i < TEX_EDGE; i++) {
    if (i < palette.length) cols.push(hexRgb(palette[i]!));
    else {
      const v = 0x20 + (i - palette.length) * 0x18;
      cols.push([v, v, v]);
    }
  }
  for (let y = 0; y < TEX_EDGE; y++) {
    // row 0 is the authored value; each row below is a 4 %-per-row darkening
    const shade = 1 - y * 0.04;
    for (let x = 0; x < TEX_EDGE; x++) {
      const c = cols[x]!;
      const o = (y * TEX_EDGE + x) * 4;
      px[o] = Math.max(0, Math.min(255, Math.round(c[0] * shade)));
      px[o + 1] = Math.max(0, Math.min(255, Math.round(c[1] * shade)));
      px[o + 2] = Math.max(0, Math.min(255, Math.round(c[2] * shade)));
      px[o + 3] = 255;
    }
  }
  return encodePng(TEX_EDGE, TEX_EDGE, px);
}

// ---------------------------------------------------------------------------
// The handedness fix — MEASURED, not assumed
// ---------------------------------------------------------------------------
/**
 * Babylon's glTF loader converts glTF's right-handed basis to the scene's
 * left-handed one by inserting a `__root__` node. Measured on the loaded file
 * (NullEngine, `body.getWorldMatrix()`), that node is **`scaling = (-1, 1, 1)`**
 * — it flips **X**, not Z. Two consequences, and the second is easy to miss:
 *
 * 1. FORWARD NEEDS NO CORRECTION. On-disk `+Z` renders as Babylon `+Z`, so the
 *    blocky humanoids take `NATIVE_GLB_YAW_OFFSET = 0` like the meshes they
 *    replace, with no client change and no root rotation.
 * 2. LEFT AND RIGHT SWAP. A joint authored at design `+X` renders at Babylon
 *    `-X`, so `handRight` would come out on the character's LEFT — and the
 *    weapon, the `right,hand` VFX attachment and the undead's missing hand with
 *    it. So the emitter mirrors X on the way out.
 *
 * A mirror is orientation-REVERSING, which is why this is three edits and not
 * one: positions and normals negate X, triangle winding must be reversed or
 * every face turns inside out, and a rotation conjugated by `diag(-1,1,1)`
 * keeps its angle but reflects its axis, i.e. `(qx, -qy, -qz, qw)`.
 */
export const mirrorVec3 = (x: number, y: number, z: number): [number, number, number] => [-x, y, z];
export const mirrorQuat = (
  qq: readonly [number, number, number, number],
): [number, number, number, number] => [qq[0], -qq[1], -qq[2], qq[3]];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface BakeGeometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  joints: number[];
  weights: number[];
  indices: number[];
  triangles: number;
}

export function buildGeometry(): BakeGeometry {
  const g: BakeGeometry = {
    positions: [],
    normals: [],
    uvs: [],
    joints: [],
    weights: [],
    indices: [],
    triangles: 0,
  };
  for (const box of BOXES) {
    const ji = JOINT_INDEX[box.joint];
    if (ji === undefined) throw new Error(`box ${box.name} binds unknown joint ${box.joint}`);
    const base = g.positions.length / 3;
    const { verts, indices } = emitBox(box, ji);
    for (const v of verts) {
      g.positions.push(...mirrorVec3(v.pos[0], v.pos[1], v.pos[2]));
      g.normals.push(...mirrorVec3(v.normal[0], v.normal[1], v.normal[2]));
      g.uvs.push(v.uv[0], v.uv[1]);
      // RIGID: one joint, weight 1.0. This is what makes runtime joint-scale
      // writes reshape the figure without deforming it.
      g.joints.push(v.joint, 0, 0, 0);
      g.weights.push(1, 0, 0, 0);
    }
    // Winding is REVERSED because the X mirror is orientation-reversing.
    for (let i = 0; i < indices.length; i += 3) {
      g.indices.push(base + indices[i]!, base + indices[i + 2]!, base + indices[i + 1]!);
    }
    g.triangles += indices.length / 3;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Animation sampling (KEYFRAMES — clips.ts's `sampleClip` is the interpolating
// PREVIEW sampler; this one emits the curve the file stores)
// ---------------------------------------------------------------------------

/** Euler XYZ (applied X→Y→Z) → glTF quaternion (x, y, z, w). */
export function eulerToQuat(e: Euler): [number, number, number, number] {
  const [x, y, z] = e;
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return [
    q(sx * cy * cz + cx * sy * sz),
    q(cx * sy * cz - sx * cy * sz),
    q(cx * cy * sz + sx * sy * cz),
    q(cx * cy * cz - sx * sy * sz),
  ];
}

const ZERO_EULER: Euler = [0, 0, 0];

function addBias(a: Euler, b: Euler | undefined): Euler {
  if (!b) return a;
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export interface BakeChannel {
  joint: string;
  path: "rotation" | "translation";
  times: number[];
  values: number[];
}

const offsetOf = (look: VoxelLook, joint: string): Vec3 =>
  look.jointOffset[joint as ShapedJoint] ?? [0, 0, 0];

/**
 * Sample one clip into channels for one look. EVERY clip emits the SAME eight
 * channels (hips translation + seven rotations) — see the clips header for why
 * that uniformity is load-bearing rather than tidy.
 */
export function bakeClipChannels(clip: ClipDef, look: VoxelLook): BakeChannel[] {
  const rate = look.clipRate;
  const times = clip.keys.map((k) => q(k.t * rate));
  const out: BakeChannel[] = [];
  // hips translation first, then rotations in DRIVEN_ROTATION_JOINTS order
  const hipsBind = JOINTS[JOINT_INDEX.hips!]!.local;
  const hipsOff = offsetOf(look, "hips");
  out.push({
    joint: "hips",
    path: "translation",
    times,
    values: clip.keys.flatMap((k) =>
      mirrorVec3(
        q((hipsBind[0] + hipsOff[0]) * PX + k.hips[0]),
        q((hipsBind[1] + hipsOff[1]) * PX + k.hips[1]),
        q((hipsBind[2] + hipsOff[2]) * PX + k.hips[2]),
      ),
    ),
  });
  for (const joint of DRIVEN_ROTATION_JOINTS) {
    out.push({
      joint,
      path: "rotation",
      times,
      values: clip.keys.flatMap((k) =>
        mirrorQuat(eulerToQuat(addBias(k.rot[joint] ?? ZERO_EULER, look.poseBias[joint]))),
      ),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// GLB assembly
// ---------------------------------------------------------------------------

/** glTF node index of a joint. Node 0 is the root, node 1 the skinned mesh. */
const jointNode = (i: number): number => 2 + i;

export interface BakeStats {
  /** THE budget number #226 exists for */
  triangles: number;
  vertices: number;
  /** THE other budget number: the file's size on disk, exactly */
  bytes: number;
  joints: number;
  clips: number;
  channelsPerFrame: number;
  materials: number;
  meshes: number;
  texEdge: number;
  /** embedded palette PNG size, the whole texture cost of the model */
  textureBytes: number;
  sha256: string;
}

/** Bind-pose joint positions in voxel px, WITH the look's per-joint offsets. */
function lookJointGlobals(look: VoxelLook): [number, number, number][] {
  const out: [number, number, number][] = [];
  JOINTS.forEach((j, i) => {
    const p: [number, number, number] = j.parent >= 0 ? out[j.parent]! : [0, 0, 0];
    const o = offsetOf(look, j.name);
    out[i] = [p[0] + j.local[0] + o[0], p[1] + j.local[1] + o[1], p[2] + j.local[2] + o[2]];
  });
  return out;
}

export interface BakeResult {
  bytes: Uint8Array;
  stats: BakeStats;
}

/**
 * Emit a complete, playable .glb for one authored look.
 *
 * `key` becomes the material name (`blocky-<key>`) and nothing else — it does
 * not select geometry, so a champion-specific bake and an archetype bake differ
 * only by their `VoxelLook`.
 */
export function bakeLook(key: string, look: VoxelLook): BakeResult {
  const geo = buildGeometry();
  const b = new GlbBuilder();

  const accPos = b.addFloat("VEC3", geo.positions, { minMax: true, target: 34962 });
  const accNrm = b.addFloat("VEC3", geo.normals, { target: 34962 });
  const accUv = b.addFloat("VEC2", geo.uvs, { target: 34962 });
  const accJoints = b.addJoints(geo.joints);
  const accWeights = b.addFloat("VEC4", geo.weights, { target: 34962 });
  const accIdx = b.addIndices(geo.indices);

  // Inverse bind matrices: the joints' bind pose is pure translation, so the
  // IBM is the inverse translation. NOTE the deliberate consequence — a joint
  // baked at scale 0 (a hidden prop) still has an invertible IBM, because the
  // IBM describes the DESIGN bind pose, not the authored node transform. That
  // is what lets the same file express "prop hidden" and "prop shown" with one
  // `bone.scaling` write and no second mesh.
  const globals = lookJointGlobals(look);
  const ibm: number[] = [];
  for (const g of globals) {
    const m = mirrorVec3(g[0] * PX, g[1] * PX, g[2] * PX);
    ibm.push(...translationMat(-m[0], -m[1], -m[2]));
  }
  const accIbm = b.addFloat("MAT4", ibm);

  // --- animations ----------------------------------------------------------
  const animations: Record<string, unknown>[] = [];
  let channelsPerFrame = 0;
  for (const clip of CLIPS) {
    const channels = bakeClipChannels(clip, look);
    channelsPerFrame = Math.max(channelsPerFrame, channels.length);
    const samplers: Record<string, unknown>[] = [];
    const chans: Record<string, unknown>[] = [];
    for (const ch of channels) {
      const input = b.addFloat("SCALAR", ch.times, { minMax: true });
      const output = b.addFloat(ch.path === "rotation" ? "VEC4" : "VEC3", ch.values);
      samplers.push({ input, interpolation: "LINEAR", output });
      chans.push({
        sampler: samplers.length - 1,
        target: { node: jointNode(JOINT_INDEX[ch.joint]!), path: ch.path },
      });
    }
    animations.push({ name: clip.name, samplers, channels: chans });
  }

  // --- palette image -------------------------------------------------------
  const png = paletteImage(look.palette);
  b.addRawView(png, "palette");
  const imageView = b.rawViewSlot(0);

  // --- nodes ---------------------------------------------------------------
  const hidden = new Set<string>();
  for (const [group, joints] of Object.entries(PROP_JOINTS)) {
    if (!(look.props as readonly string[]).includes(group)) for (const j of joints) hidden.add(j);
  }
  // node 0 = scene root, node 1 = the skinned mesh, nodes 2.. = the joints.
  // The mesh is a SIBLING of the skeleton root, never a descendant of a joint —
  // glTF requires that, and Babylon's loader assumes it.
  const nodes: Record<string, unknown>[] = [
    { name: "voxelRoot", children: [1, jointNode(0)] },
    { name: "body", mesh: 0, skin: 0 },
  ];
  JOINTS.forEach((j, i) => {
    const kids = JOINTS.map((c, ci) => (c.parent === i ? jointNode(ci) : -1)).filter((n) => n >= 0);
    const node: Record<string, unknown> = { name: j.name };
    if (kids.length > 0) node.children = kids;
    const o = offsetOf(look, j.name);
    node.translation = mirrorVec3(
      q((j.local[0] + o[0]) * PX),
      q((j.local[1] + o[1]) * PX),
      q((j.local[2] + o[2]) * PX),
    );
    const scale = hidden.has(j.name)
      ? ([0, 0, 0] as const)
      : look.jointScale[j.name as ShapedJoint];
    if (scale) node.scale = [q(scale[0]), q(scale[1]), q(scale[2])];
    nodes.push(node);
  });

  const bytes = b.build({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [
      {
        name: "body",
        primitives: [
          {
            attributes: {
              POSITION: accPos,
              NORMAL: accNrm,
              TEXCOORD_0: accUv,
              JOINTS_0: accJoints,
              WEIGHTS_0: accWeights,
            },
            indices: accIdx,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    skins: [
      {
        name: "boxman",
        inverseBindMatrices: accIbm,
        skeleton: jointNode(0),
        joints: JOINTS.map((_, i) => jointNode(i)),
      },
    ],
    materials: [
      {
        name: `blocky-${key}`,
        pbrMetallicRoughness: {
          // WHITE base colour on purpose: #49's `applyModelTint` MULTIPLIES
          // `albedoColor`, so starting at white makes tint × palette exactly the
          // intended perceptual multiply instead of a double-darkening.
          baseColorFactor: [1, 1, 1, 1],
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        doubleSided: false,
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    // NEAREST magnification: a palette texel must not blend into its neighbour.
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    images: [{ name: "palette", mimeType: "image/png", bufferView: imageView }],
    animations,
  });

  return {
    bytes,
    stats: {
      triangles: geo.triangles,
      vertices: geo.positions.length / 3,
      bytes: bytes.length,
      joints: JOINTS.length,
      clips: CLIPS.length,
      channelsPerFrame,
      materials: 1,
      meshes: 1,
      texEdge: TEX_EDGE,
      textureBytes: png.length,
      sha256: sha256Hex(bytes),
    },
  };
}

/** The shipped bake of one of the five archetypes. */
export function bakeArchetype(arch: Archetype): BakeResult {
  return bakeLook(arch.key, lookFromArchetype(arch.key));
}

/** Native silhouette height in world units. Baked to exactly TARGET_HEIGHT. */
export const NATIVE_HEIGHT = FIGURE_PX * PX;

/** Every shipped archetype, baked. */
export function bakeAll(): { arch: Archetype; bytes: Uint8Array; stats: BakeStats }[] {
  return ARCHETYPES.map((arch) => ({ arch, ...bakeArchetype(arch) }));
}

/** The file name an archetype bake is written under. */
export function blockyFileName(key: string): string {
  return `blocky-${key}.glb`;
}

export type { DrivenJoint };
