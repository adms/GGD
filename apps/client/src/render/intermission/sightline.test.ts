/**
 * SIGHTLINES — can the camera actually SEE the cast? (task #103)
 *
 * ── THE DEFECT THIS TEST EXISTS FOR ─────────────────────────────────────────
 * The 店員 cannot be seen. Task #38 measured it live with `scene.multiPickWithRay`
 * from the composed camera, counting hits not descended from `im-merchant`:
 *
 *     merchant head  (y 1.62)   2 blockers   im-MarketStand_2_primitive1 @ 6.36
 *                                            im-MarketStand_2_primitive2 @ 6.26
 *     merchant chest (y 1.20)   1 blocker    im-MarketStand_2_primitive1 @ 5.91
 *     champion head             0 blockers   (clear)
 *
 * He is behind HIS OWN COUNTER. The eye→head ray crosses the stall's plane
 * z = 1.2 at x = −0.33, and the stall's own geometry spans x ∈ [−0.43, 0.60]
 * there — the crossing is inside it. This predates #38's camera-pivot fix; the
 * shot has never had a clear line to his face.
 *
 * The user asked for both halves of this: 「商店的 3d model 請你去尋找日式 RPG
 * 適合的旅行商人風格來佈置商店及店員」. The 店員 is half the request.
 *
 * ── WHY THE EXISTING SUITE COULD NOT SEE IT ─────────────────────────────────
 * int-16 asserts HEIGHTS — "the awning clears his head by ~0.33 u so the camera
 * never loses his face". True, and irrelevant: the awning's TOP was never the
 * blocker, its front edge and the counter are.
 * int-18 asserts SCREEN-SPACE X — everything projects clear of the shop card's
 * edge. Also true, also irrelevant: being in the free half of the frame is not
 * the same as being visible in it.
 * A height check and a screen-X check TOGETHER still cannot see an object
 * standing between the camera and its subject. Only a ray can. This is that ray.
 *
 * ── WHY IT IS HERE (HEADLESS) AND NOT IN THE BABYLON SCENE SUITE ────────────
 * The scene suite is the one place this CANNOT live. Under NullEngine no .glb is
 * fetchable — AssetManager probes with `fetch` and a relative URL has no origin —
 * so every prop resolves to null and `IntermissionScene.test.ts` deliberately
 * pins that ("survives a market with no loadable models"). A `multiPickWithRay`
 * there would sweep an EMPTY market and report zero blockers: a sightline test
 * that goes green against the broken scene, which is worse than no test at all.
 *
 * ── WHY IT READS TRIANGLES, NOT THE RECORDED FOOTPRINTS ─────────────────────
 * `layout.ts` records the stall as 1.03 × 2.31 u, and a segment-vs-AABB test on
 * that footprint does report today's defect. It could never report the FIX,
 * though: the merchant stands at (−0.15, 1.85), which is INSIDE the stall's own
 * box (x [−0.43, 0.60] × y [0.22, 2.08] × z [0.10, 2.29]) — he is under the
 * awning, behind the counter, exactly where a shopkeeper belongs. A segment that
 * ENDS inside a box always intersects it, so an AABB assertion is unsatisfiable
 * by any staging that keeps him at his post. It can only ever be red, so it can
 * never drive a fix.
 *
 * Triangles have no such problem: the awning is a surface with air under it. So
 * this reads the shipped .glb the way `assets.test.ts` already reads its JSON
 * chunk and `scripts/occluder-sweep.ts` already reads its accessor bounds — a
 * dependency-free glTF-Binary parse, no Babylon, no GPU, ~10 k triangles and
 * ~15 ms for the whole sweep.
 *
 * ── MODELLED ON TASK #29, WITH ONE DELIBERATE DIFFERENCE ────────────────────
 * `scripts/occluder-sweep.ts` solved this problem shape for the ARENA and this
 * reuses its approach: build occluders from the real .glb geometry at the
 * authored pose, fire rays from the true eye at body-height samples, report the
 * blockers by name and distance.
 *
 * What differs is the ACCEPTANCE CRITERION, and it differs on purpose. #29
 * tolerates partial occlusion — a hero behind a barrel should look like a hero
 * behind a barrel — and fails only when all 35 rays are blocked. The
 * intermission is not a play area, it is a COMPOSED SHOT with two subjects and
 * no camera control, so the bar is higher: on the centre line, at every sampled
 * height, ZERO blockers.
 *
 * The 2.4 u prop cap still does not apply here, and `layout.ts` is right about
 * that — no hero ever stands among these props. But that waiver said "nothing
 * here needs the 35-ray re-run", and the sightline went with it. It should not
 * have: the cap and the sightline were two separate guarantees.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMERA_POSITION,
  CART,
  CHAMPION_STAND,
  DRESSING,
  MERCHANT,
  SHOP_MODELS,
  STALL,
  TORCHES,
  bannerFor,
  silhouettes,
  type Placement,
} from "./layout";

/** repo content/ mount — the same tree the client fetches /content/ from */
const CONTENT_DIR = join(__dirname, "../../../../../content");

// ---------------------------------------------------------------------------
// glTF-Binary → triangles, named the way Babylon names them
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

type Vec3 = [number, number, number];
type Tri = readonly [Vec3, Vec3, Vec3];
/** One Babylon mesh's triangles — the granularity `multiPickWithRay` reports. */
interface MeshGroup {
  readonly name: string;
  readonly tris: readonly Tri[];
}

interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    name?: string;
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: { name?: string; primitives: { mode?: number; indices?: number; attributes: Record<string, number> }[] }[];
  accessors?: { componentType: number; type: string; count: number; bufferView: number; byteOffset?: number }[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
}

/** byte width per glTF componentType */
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readChunks(relPath: string): { json: Gltf; bin: Buffer } {
  const buf = readFileSync(join(CONTENT_DIR, relPath));
  expect(buf.readUInt32LE(0), `${relPath} is a glTF-Binary file`).toBe(GLB_MAGIC);
  let json: Gltf | null = null;
  let bin: Buffer | null = null;
  let offset = 12; // magic + version + total length
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === CHUNK_JSON) json = JSON.parse(buf.subarray(start, start + length).toString("utf8")) as Gltf;
    else if (type === CHUNK_BIN) bin = buf.subarray(start, start + length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error(`${relPath}: missing JSON or BIN chunk`);
  return { json, bin };
}

/** Decode one accessor to plain numbers, honouring the bufferView's byteStride. */
function readAccessor(gltf: Gltf, bin: Buffer, index: number): Float64Array {
  const acc = gltf.accessors![index]!;
  const size = COMPONENT_BYTES[acc.componentType]!;
  const n = COMPONENTS[acc.type]!;
  const view = gltf.bufferViews![acc.bufferView]!;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? size * n;
  const out = new Float64Array(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const at = base + i * stride + c * size;
      out[i * n + c] =
        acc.componentType === 5126 ? bin.readFloatLE(at)
        : acc.componentType === 5123 ? bin.readUInt16LE(at)
        : acc.componentType === 5125 ? bin.readUInt32LE(at)
        : acc.componentType === 5121 ? bin.readUInt8(at)
        : acc.componentType === 5122 ? bin.readInt16LE(at)
        : bin.readInt8(at);
    }
  }
  return out;
}

type Mat4 = number[]; // column-major, glTF convention

function matMul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function trs(t: number[], r: number[], s: number[]): Mat4 {
  const [x, y, z, w] = r as [number, number, number, number];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0]!, (xy + wz) * s[0]!, (xz - wy) * s[0]!, 0,
    (xy - wz) * s[1]!, (1 - (xx + zz)) * s[1]!, (yz + wx) * s[1]!, 0,
    (xz + wy) * s[2]!, (yz - wx) * s[2]!, (1 - (xx + yy)) * s[2]!, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ];
}

function xform(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const triangleCache = new Map<string, MeshGroup[]>();

/**
 * Every triangle of a .glb in MODEL space, grouped and named exactly as
 * `@babylonjs/loaders` names them (glTFLoader `_loadMeshAsync`): a node with one
 * primitive keeps the NODE's name, a node with several yields one mesh per
 * primitive suffixed `_primitive<index>`. Matching the naming is what lets a
 * failure here be compared line-for-line with a live `multiPickWithRay` — the
 * scene only adds the `im-` prefix `instantiateModelsToScene` stamps on.
 */
function modelTriangles(relPath: string): MeshGroup[] {
  const cached = triangleCache.get(relPath);
  if (cached) return cached;
  const { json, bin } = readChunks(relPath);
  const groups: MeshGroup[] = [];
  const visit = (nodeIndex: number, parent: Mat4): void => {
    const node = json.nodes![nodeIndex]!;
    const local = node.matrix
      ? (node.matrix as Mat4)
      : trs(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
    const world = matMul(parent, local);
    if (node.mesh !== undefined) {
      const mesh = json.meshes![node.mesh]!;
      const nodeName = node.name ?? `node${nodeIndex}`;
      mesh.primitives.forEach((prim, primIndex) => {
        if ((prim.mode ?? 4) !== 4) return; // TRIANGLES only; nothing else occludes
        const pos = readAccessor(json, bin, prim.attributes.POSITION!);
        const idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : null;
        const count = idx ? idx.length : pos.length / 3;
        const vertex = (v: number): Vec3 => xform(world, [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!]);
        const tris: Tri[] = [];
        for (let i = 0; i + 2 < count; i += 3) {
          const a = idx ? idx[i]! : i;
          const b = idx ? idx[i + 1]! : i + 1;
          const c = idx ? idx[i + 2]! : i + 2;
          tris.push([vertex(a), vertex(b), vertex(c)]);
        }
        groups.push({
          name: mesh.primitives.length === 1 ? nodeName : `${nodeName}_primitive${primIndex}`,
          tris,
        });
      });
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const ni of json.scenes?.[json.scene ?? 0]?.nodes ?? []) visit(ni, IDENTITY);
  triangleCache.set(relPath, groups);
  return groups;
}

/** A placed prop's triangles, in WORLD space. */
interface PlacedGroup extends MeshGroup {
  readonly model: string;
}

/**
 * Apply a `Placement` the way `IntermissionScene.place` does: the instantiated
 * root gets `scaling.setAll(scale)`, then `rotation.y = yaw`, then
 * `position.set(x, 0, z)`, under a stage node left at identity. Babylon's
 * left-handed Y rotation is x' = x cos + z sin, z' = −x sin + z cos.
 */
function placeTriangles(p: Placement): PlacedGroup[] {
  const cos = Math.cos(p.yaw);
  const sin = Math.sin(p.yaw);
  return modelTriangles(p.model).map((g) => ({
    model: p.model,
    name: g.name,
    tris: g.tris.map(
      (t) =>
        t.map(([x, y, z]) => {
          const sx = x * p.scale, sy = y * p.scale, sz = z * p.scale;
          return [p.x + sx * cos + sz * sin, sy, p.z - sx * sin + sz * cos] as Vec3;
        }) as unknown as Tri,
    ),
  }));
}

/** Möller–Trumbore, as a SEGMENT: a hit only counts strictly between the two ends. */
function raySegmentTriangle(origin: Vec3, dir: Vec3, [a, b, c]: Tri): number | null {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p: Vec3 = [
    dir[1] * e2[2] - dir[2] * e2[1],
    dir[2] * e2[0] - dir[0] * e2[2],
    dir[0] * e2[1] - dir[1] * e2[0],
  ];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null; // edge-on: contributes no silhouette
  const inv = 1 / det;
  const s: Vec3 = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < 0 || u > 1) return null;
  const q: Vec3 = [
    s[1] * e1[2] - s[2] * e1[1],
    s[2] * e1[0] - s[0] * e1[2],
    s[0] * e1[1] - s[1] * e1[0],
  ];
  const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  // both faces block: Babylon picks double-sided too, and a back-facing awning
  // panel hides a merchant exactly as well as a front-facing one
  return t > 1e-6 && t < 1 - 1e-6 ? t : null;
}

/** Every mesh standing between `eye` and `target`, nearest first. */
function blockers(eye: Vec3, target: Vec3, set: readonly PlacedGroup[]): string[] {
  const dir: Vec3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  const hits: { name: string; distance: number }[] = [];
  for (const group of set) {
    let nearest = Infinity;
    for (const tri of group.tris) {
      const t = raySegmentTriangle(eye, dir, tri);
      if (t !== null && t < nearest) nearest = t;
    }
    if (nearest < Infinity) hits.push({ name: group.name, distance: nearest * length });
  }
  return hits
    .sort((a, b) => a.distance - b.distance)
    .map((h) => `im-${h.name} @ ${h.distance.toFixed(2)} u`);
}

// ---------------------------------------------------------------------------
// the sweep
// ---------------------------------------------------------------------------

const EYE: Vec3 = [CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z];

/**
 * Body-height samples. `head` and `chest` are the two heights #38's live probe
 * fired at, kept verbatim so a failure here can be diffed against that
 * measurement; `feet` is the third the probe never sampled — a counter that
 * hides only the lower body still breaks the shot, because the merchant would
 * float. Both cast members are ~1.7 u tall (merchant 1.750, champions
 * normalised to 1.700), so the same three absolute heights land on the same
 * three body landmarks for each.
 */
const SAMPLE_HEIGHTS: readonly (readonly [string, number])[] = [
  ["head", 1.62],
  ["chest", 1.2],
  ["feet", 0.15],
];

/**
 * Everything that STANDS UP in the market. The paving, the grass ring and the
 * earth disc are deliberately absent: they are floor, every ray ends above them
 * and descends monotonically toward its endpoint, so they can never be between
 * the eye and a subject. This is the same disposition `occluder-sweep.ts` makes
 * for the arena floor.
 */
function marketOccluders(): PlacedGroup[] {
  const props: Placement[] = [STALL, CART, ...TORCHES, ...DRESSING, bannerFor(0), ...silhouettes()];
  return props.flatMap(placeTriangles);
}

/**
 * The two cast members are NOT modelled as occluders of each other.
 *
 * The merchant cannot occlude the champion: he stands at z 1.85, the champion at
 * z −0.7 and the eye at z −5.4, so he is strictly BEHIND the subject — asserted
 * below rather than assumed.
 *
 * The champion could in principle occlude the merchant, so where he stands is
 * load-bearing. After task #146 re-centred the merchant and put the hero on his
 * RIGHT, the eye→merchant ray crosses x −0.74 at the hero's depth while the hero
 * stands at x +0.15 — 0.89 u to the +x side of the ray, well outside a hero's
 * own silhouette width, so he is nowhere near the shopkeeper's sightline. (Under
 * the pre-#146 staging he sat at x −1.15, 0.41 u to the −x side; the hero has
 * simply crossed to the far side of the ray.) Modelling him as an occluder would
 * mean inventing a capsule for a champion model that changes every match, so the
 * cast is still left out of the set; this is called out so the next person
 * nudging the hero back toward x −0.74 knows that is the one direction he MUST
 * NOT go.
 */
const CAST = {
  merchant: { label: "merchant", x: MERCHANT.x, z: MERCHANT.z },
  champion: { label: "champion", x: CHAMPION_STAND.x, z: CHAMPION_STAND.z },
} as const;

/** Blocked samples as readable lines; `[]` means the subject is fully visible. */
function sightlineReport(subject: { x: number; z: number }, set: readonly PlacedGroup[]): string[] {
  const out: string[] = [];
  for (const [label, y] of SAMPLE_HEIGHTS) {
    const hit = blockers(EYE, [subject.x, y, subject.z], set);
    if (hit.length > 0) out.push(`${label} (y ${y.toFixed(2)}): ${hit.join(", ")}`);
  }
  return out;
}

describe("intermission sightlines", () => {
  it("has real geometry to cast against — an empty market must never pass", () => {
    cover("intermission-sightline");
    // The failure mode this guards is the whole reason the check is not in the
    // Babylon scene suite: zero meshes trivially satisfies "zero blockers".
    const set = marketOccluders();
    const triangles = set.reduce((n, g) => n + g.tris.length, 0);
    expect(triangles).toBeGreaterThan(1000);
    const stall = set.filter((g) => g.model === SHOP_MODELS.stall);
    expect(stall.length, "the stall contributed no meshes").toBeGreaterThan(0);
    expect(stall.reduce((n, g) => n + g.tris.length, 0)).toBeGreaterThan(100);
    // the merchant is in front of nothing and behind the champion, which is why
    // the cast is left out of the occluder set (see CAST)
    expect(CAST.merchant.z).toBeGreaterThan(CAST.champion.z);
    expect(CAST.champion.z).toBeGreaterThan(CAMERA_POSITION.z);
  });

  it("the 店員 is VISIBLE — nothing stands between the camera and the merchant", () => {
    cover("intermission-sightline");
    // 「商店的 3d model 請你去尋找日式 RPG 適合的旅行商人風格來佈置商店及店員」 —
    // a shopkeeper nobody can see is not a shopkeeper.
    const report = sightlineReport(CAST.merchant, marketOccluders());
    expect(report, "meshes blocking the eye→merchant sightline").toEqual([]);
  });

  it("the champion is visible from the same shot", () => {
    cover("intermission-sightline");
    // The control: this passes today. It is what proves the harness above can
    // report a CLEAR line, so the merchant's failure is a fact about the
    // staging and not about the ray casting.
    const report = sightlineReport(CAST.champion, marketOccluders());
    expect(report, "meshes blocking the eye→champion sightline").toEqual([]);
  });
});
