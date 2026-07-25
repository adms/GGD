/**
 * voxel-gen — bake the five blocky-humanoid .glb files (owner directive #226).
 *
 *   pnpm voxel:gen           write content/assets/models/champions/blocky-*.glb
 *   pnpm voxel:gen --check   verify the shipped files match, byte for byte
 *
 * WHY BAKE A FILE INSTEAD OF RENDERING THE FIGURE PROCEDURALLY. `ChampionView`
 * already draws this exact box-man as its fallback, so "just use the procedural
 * one" looks like the smaller change — but `model@1`
 * (`packages/shared/src/content/schema/model.ts`) makes `glbPath` a REQUIRED
 * `^assets/` string on a `.strict()` object, so a doc with no file is not even
 * representable without a schema change that ripples into the editor, the admin
 * mirror and every `doc.glbPath` reader. `StorePreview` has NO procedural
 * fallback (unlike `ChampionView`), so an unloadable path blanks champ-select,
 * the shop stand AND the round-winner stage — a #129/#111/#143 regression. And
 * `packages/shared/src/content/mcoinStore.test.ts` asserts the skin files exist
 * on disk. Baking keeps every one of those consumers working with ZERO code
 * change, and yields real AnimationGroups so `ClipAnimator`, the cast-strike
 * alignment and `reactionClip` all keep working unmodified.
 *
 * NO MOJANG / MINECRAFT ASSET IS INVOLVED. Nothing is downloaded and nothing is
 * derived from any third-party model, skin or texture. Every vertex comes from
 * the parameter table in `boxman.ts`, every keyframe from `clips.ts`, every
 * colour from `archetypes.ts`. The blocky STYLE is not a protectable element;
 * the geometry is this project's own and has been drawn procedurally by
 * `ChampionView` since task #64.
 *
 * The output is BYTE-DETERMINISTIC (see `glbWrite.q` and `png.ts`), so
 * `gen.test.ts` can pin each file's sha256 and a regeneration is a reviewable
 * no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  BOXES,
  FIGURE_PX,
  JOINTS,
  JOINT_INDEX,
  PROP_JOINTS,
  PX,
  TEX_EDGE,
  emitBox,
  jointGlobals,
} from "./boxman";
import { CLIPS, DRIVEN_ROTATION_JOINTS, type ClipDef, type Euler } from "./clips";
import { ARCHETYPES, type Archetype, type Palette } from "./archetypes";
import { GlbBuilder, q, translationMat } from "./glbWrite";
import { encodePng } from "./png";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
export const OUT_DIR = path.join(REPO_ROOT, "content/assets/models/champions");

// ---------------------------------------------------------------------------
// Palette texture
// ---------------------------------------------------------------------------

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Build the 16x16 palette image. Row 0 holds the eight live slots (the only
 * texels any UV samples) followed by eight neutral steps; rows 1..15 hold a
 * shade ramp of the same columns, so the image is a genuine palette rather than
 * a mostly-empty sheet, and a future generator can address shading rows without
 * a re-bake. 16x16 also clears `modelTexture.test.ts`'s rule that any embedded
 * image of 8x8 or smaller is an unresolved-texture placeholder.
 */
export function paletteImage(palette: Palette): Buffer {
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
 * 1. FORWARD NEEDS NO CORRECTION. On-disk `+Z` renders as Babylon `+Z`. That is
 *    exactly what `glbFacing.ts` says the native/KayKit family bakes, and it is
 *    confirmed on the file this replaces: `knight.glb`'s `Knight_Cape` — the
 *    model's BACK — measures Babylon-local z = -0.215. So authoring forward =
 *    +Z (as `boxman.ts` does) makes the blocky humanoids take
 *    `NATIVE_GLB_YAW_OFFSET = 0` like the meshes they replace, with no client
 *    change and no root rotation.
 * 2. LEFT AND RIGHT SWAP. A joint authored at design `+X` renders at Babylon
 *    `-X`, so `handRight` would come out on the character's LEFT — and the
 *    weapon, the `right,hand` VFX attachment and the undead's missing hand with
 *    it. So the emitter mirrors X on the way out.
 *
 * A mirror is orientation-REVERSING, which is why this is three edits and not
 * one: positions and normals negate X, triangle winding must be reversed or
 * every face turns inside out, and a rotation conjugated by `diag(-1,1,1)`
 * keeps its angle but reflects its axis to `(ax, -ay, -az)` — i.e. the
 * quaternion becomes `(qx, -qy, -qz, qw)`. Doing it here rather than in the
 * tables keeps `boxman.ts`/`clips.ts` readable as "the character's own right is
 * +X, forward is +Z", which is the frame a human authors in.
 */
export const mirrorVec3 = (x: number, y: number, z: number): [number, number, number] => [-x, y, z];
export const mirrorQuat = (
  qq: readonly [number, number, number, number],
): [number, number, number, number] => [qq[0], -qq[1], -qq[2], qq[3]];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Geometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  joints: number[];
  weights: number[];
  indices: number[];
  triangles: number;
}

export function buildGeometry(): Geometry {
  const g: Geometry = { positions: [], normals: [], uvs: [], joints: [], weights: [], indices: [], triangles: 0 };
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
    // Winding is REVERSED because the X mirror is orientation-reversing: keep
    // the authored order and every face would render inside out.
    for (let i = 0; i < indices.length; i += 3) {
      g.indices.push(base + indices[i]!, base + indices[i + 2]!, base + indices[i + 1]!);
    }
    g.triangles += indices.length / 3;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Animation sampling
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

interface Channel {
  joint: string;
  path: "rotation" | "translation";
  times: number[];
  values: number[];
}

/**
 * Sample one clip into channels for one archetype. EVERY clip emits the SAME
 * eight channels (hips translation + seven rotations) — see the clips header
 * for why that uniformity is load-bearing rather than tidy.
 */
export function sampleClip(clip: ClipDef, arch: Archetype): Channel[] {
  const rate = arch.clipRate ?? 1;
  const times = clip.keys.map((k) => q(k.t * rate));
  const out: Channel[] = [];
  // hips translation first, then rotations in DRIVEN_ROTATION_JOINTS order
  const hipsBind = JOINTS[JOINT_INDEX.hips!]!.local;
  out.push({
    joint: "hips",
    path: "translation",
    times,
    values: clip.keys.flatMap((k) =>
      mirrorVec3(
        q(hipsBind[0] * PX + k.hips[0]),
        q(hipsBind[1] * PX + k.hips[1]),
        q(hipsBind[2] * PX + k.hips[2]),
      ),
    ),
  });
  for (const joint of DRIVEN_ROTATION_JOINTS) {
    out.push({
      joint,
      path: "rotation",
      times,
      values: clip.keys.flatMap((k) =>
        mirrorQuat(eulerToQuat(addBias(k.rot[joint] ?? ZERO_EULER, arch.poseBias?.[joint]))),
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
  triangles: number;
  vertices: number;
  bytes: number;
  joints: number;
  clips: number;
  channelsPerFrame: number;
  materials: number;
  meshes: number;
  texEdge: number;
  sha256: string;
}

export function bakeArchetype(arch: Archetype): { bytes: Buffer; stats: BakeStats } {
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
  const globals = jointGlobals();
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
    const channels = sampleClip(clip, arch);
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
  const png = paletteImage(arch.palette);
  b.addRawView(png, "palette");
  const imageView = b.rawViewSlot(0);

  // --- nodes ---------------------------------------------------------------
  const hidden = new Set<string>();
  for (const [group, joints] of Object.entries(PROP_JOINTS)) {
    if (!(arch.props as readonly string[]).includes(group)) for (const j of joints) hidden.add(j);
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
    node.translation = mirrorVec3(q(j.local[0] * PX), q(j.local[1] * PX), q(j.local[2] * PX));
    const scale = hidden.has(j.name) ? ([0, 0, 0] as const) : arch.jointScale?.[j.name];
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
    skins: [{ name: "boxman", inverseBindMatrices: accIbm, skeleton: jointNode(0), joints: JOINTS.map((_, i) => jointNode(i)) }],
    materials: [
      {
        name: `blocky-${arch.key}`,
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
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

export function outPath(arch: Archetype): string {
  return path.join(OUT_DIR, `blocky-${arch.key}.glb`);
}

/** Native silhouette height in world units. Baked to exactly TARGET_HEIGHT. */
export const NATIVE_HEIGHT = FIGURE_PX * PX;

export function bakeAll(): { arch: Archetype; bytes: Buffer; stats: BakeStats }[] {
  return ARCHETYPES.map((arch) => ({ arch, ...bakeArchetype(arch) }));
}

function main(): void {
  const check = process.argv.includes("--check");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = bakeAll();
  let bad = 0;
  let total = 0;
  for (const { arch, bytes, stats } of rows) {
    const file = outPath(arch);
    total += bytes.length;
    if (check) {
      const same = fs.existsSync(file) && fs.readFileSync(file).equals(bytes);
      if (!same) {
        bad++;
        console.error(`STALE  ${path.relative(REPO_ROOT, file)}`);
      }
    } else {
      fs.writeFileSync(file, bytes);
    }
    console.log(
      `${check ? "check" : "wrote"}  blocky-${arch.key}.glb  ` +
        `${stats.triangles} tris  ${stats.vertices} verts  ${stats.bytes} B  ` +
        `${stats.joints} joints  ${stats.clips} clips  ${stats.channelsPerFrame} ch  ` +
        `${stats.meshes} mesh/${stats.materials} mat  tex ${stats.texEdge}²  ${stats.sha256.slice(0, 12)}`,
    );
  }
  console.log(
    `total ${rows.reduce((n, r) => n + r.stats.triangles, 0)} tris, ${total} B ` +
      `across ${rows.length} files; native height ${NATIVE_HEIGHT.toFixed(4)} u`,
  );
  if (check && bad > 0) {
    console.error(`\n${bad} file(s) differ from the generator — run \`pnpm voxel:gen\`.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
