/**
 * occluder-sweep — re-runs the task #29 fixed-camera occluder audit.
 *   Run: pnpm tsx apps/client/scripts/occluder-sweep.ts
 *
 * #29 proved by exhaustive sweep that no arena prop can FULLY hide a hero from
 * the fixed camera. That proof is a property of the arena's GEOMETRY, so any
 * change that adds standing geometry — task #80's boundary kerb, for one —
 * voids it until it is re-run. The audit had never been committed as a script,
 * only performed; this is it, so the next person to touch arena geometry can
 * re-establish the guarantee in one command instead of rebuilding the harness.
 *
 * WHAT IT CHECKS. For every point a hero can stand on, in every zone of every
 * shipped arena, on a 0.25u grid: fire 35 rays from the camera's true eye at a
 * 5×7 grid over the hero's silhouette. If EVERY ray is blocked, that hero is
 * invisible at that spot and the arena fails. Partial blocking is fine and
 * expected — a hero behind a barrel should look like a hero behind a barrel.
 *
 * WHERE THE NUMBERS COME FROM. Nothing here is a magic constant: the eye height
 * and standoff are derived from CameraRig's pitch and its CLOSEST dolly (the
 * worst case, and also the default since #31a), and the prop extents are read
 * out of the .glb accessor bounds rather than transcribed — a hand-copied
 * bounding box is exactly the kind of thing that silently rots.
 *
 * WHAT IT MODELS AS AN OCCLUDER
 *   - every authored decor prop, at its authored pose, AFTER the same
 *     height-squash dressArena applies at runtime;
 *   - the procedural obstacle markers, UNCONDITIONALLY and at their real
 *     0.42u height (#218 — they used to be modelled as 2.4u columns that
 *     vanished whenever the doc happened to ship pillar decor);
 *   - the task #80 boundary kerb, as a solid annular ring.
 * FADE_MODELS (the team towers) are excluded exactly as they are at runtime:
 * they keep full height and ghost out via DecorFade, which is #29's disposition
 * for them, not an oversight. They are reported separately.
 *
 * `--no-kerb` omits task #80's ring, so a run with and a run without it can be
 * diffed to attribute any failure to the floor rebuild or exonerate it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARENAS = join(REPO, "content", "arenas");
const CONTENT = join(REPO, "content");

// ---------------------------------------------------------------------------
// camera + hero model (mirrors ArenaScene's sightline constants)
// ---------------------------------------------------------------------------

// Pitch is 68°, raised from 55° by #161 — this copy had been left behind, so
// the whole sweep was auditing a camera that no longer exists.
const CAMERA_PITCH_RAD = (68 * Math.PI) / 180;
const DOLLY_MIN = 10;
const EYE_HEIGHT = DOLLY_MIN * Math.sin(CAMERA_PITCH_RAD); // ≈ 9.27
const STANDOFF = DOLLY_MIN * Math.cos(CAMERA_PITCH_RAD); // ≈ 3.75
const HERO_HEAD_Y = 1.7;
const HERO_BODY_RADIUS = 0.6; // sim body radius (spawnChampion.ts)
const HERO_WIDTH = 1.0; // silhouette span the lateral samples below cover
const SIGHTLINE_HEIGHT_CAP = 2.4;
/** buildArena's collision-marker height — see ArenaScene.OBSTACLE_MARKER_TOP_Y */
const OBSTACLE_MARKER_TOP_Y = 0.42;

/** Ground grid resolution for standable points. */
const GRID = 0.25;
/** Silhouette sample grid: 5 heights × 7 lateral offsets = 35 rays. */
const SAMPLE_HEIGHTS = [0.15, 0.5, 0.9, 1.3, HERO_HEAD_Y];
const SAMPLE_LATERAL = [-0.5, -0.333, -0.167, 0, 0.167, 0.333, 0.5];

// task #80 kerb, from render/ArenaGround.ts
const KERB_TOP_Y = 0.42;
const KERB_WOBBLE_MAX = 0.045 + 0.03 + 0.018 + 0.01; // sum of the crest harmonics
const KERB_OUTER_DR = 1.45; // last profile ring still above the floor plane
const FLOOR_TOP_Y = -0.01;

const FADE_MODELS = ["tower_red", "tower_blue"];

/** `--no-kerb`: build the arenas as they were BEFORE task #80's boundary ring. */
const WITHOUT_KERB = process.argv.includes("--no-kerb");

// ---------------------------------------------------------------------------
// .glb bounds — read the real accessor extents, do not transcribe them
// ---------------------------------------------------------------------------

interface Box {
  min: [number, number, number];
  max: [number, number, number];
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
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0]!, (xy + wz) * s[0]!, (xz - wy) * s[0]!, 0,
    (xy - wz) * s[1]!, (1 - (xx + zz)) * s[1]!, (yz + wx) * s[1]!, 0,
    (xz + wy) * s[2]!, (yz - wx) * s[2]!, (1 - (xx + yy)) * s[2]!, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ];
}

function xform(m: Mat4, p: [number, number, number]): [number, number, number] {
  return [
    m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
    m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!,
  ];
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
}

const boundsCache = new Map<string, Box | null>();

/** Model-space bounding box of a .glb, walking the node hierarchy. */
function glbBounds(relPath: string): Box | null {
  const cached = boundsCache.get(relPath);
  if (cached !== undefined) return cached;
  let box: Box | null = null;
  try {
    const buf = readFileSync(join(CONTENT, relPath));
    // GLB container: 12-byte header, then length/type-prefixed chunks.
    let off = 12;
    let json: Gltf | null = null;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32LE(off);
      const type = buf.readUInt32LE(off + 4);
      if (type === 0x4e4f534a) {
        json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString("utf8")) as Gltf;
        break;
      }
      off += 8 + len;
    }
    if (!json?.nodes) throw new Error("no nodes");
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const visit = (ni: number, parent: Mat4): void => {
      const node = json.nodes![ni]!;
      const local = node.matrix
        ? (node.matrix as Mat4)
        : trs(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
      const world = matMul(parent, local);
      if (node.mesh !== undefined) {
        for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
          const acc = json.accessors?.[prim.attributes.POSITION!];
          if (!acc?.min || !acc?.max) continue;
          // all 8 corners, since the node transform may rotate the box
          for (let c = 0; c < 8; c++) {
            const p = xform(world, [
              (c & 1 ? acc.max : acc.min)[0]!,
              (c & 2 ? acc.max : acc.min)[1]!,
              (c & 4 ? acc.max : acc.min)[2]!,
            ]);
            for (let k = 0; k < 3; k++) {
              if (p[k]! < min[k]!) min[k] = p[k]!;
              if (p[k]! > max[k]!) max[k] = p[k]!;
            }
          }
        }
      }
      for (const child of node.children ?? []) visit(child, world);
    };
    for (const ni of json.scenes?.[json.scene ?? 0]?.nodes ?? []) visit(ni, IDENTITY);
    if (Number.isFinite(min[0])) box = { min, max };
  } catch {
    box = null;
  }
  boundsCache.set(relPath, box);
  return box;
}

// ---------------------------------------------------------------------------
// occluders
// ---------------------------------------------------------------------------

interface AabbOccluder {
  kind: "aabb";
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface RingOccluder {
  kind: "ring";
  label: string;
  cx: number;
  cz: number;
  rInner: number;
  rOuter: number;
  minY: number;
  maxY: number;
}

type Occluder = AabbOccluder | RingOccluder;

function topOf(o: Occluder): number {
  return o.maxY;
}

/** How far NORTH of its silhouette a top-`topY` occluder can fully hide a hero
 *  (ArenaScene.fullHideReach — the conservative broad-phase bound). */
function fullHideReach(topY: number): number {
  if (topY <= HERO_HEAD_Y) return 0;
  if (topY >= EYE_HEIGHT) return Infinity;
  return ((topY - HERO_HEAD_Y) * STANDOFF) / (EYE_HEIGHT - topY);
}

/** Narrowest X silhouette that can still fully hide a hero, given the prop's Z
 *  depth and top — the sightline pencil pinches toward the eye, so depth and
 *  distance both count (ArenaScene.minFullHideWidth). */
function minFullHideWidth(depthZ: number, topY: number): number {
  return Math.max(0, HERO_WIDTH * (1 - (Math.min(fullHideReach(topY), STANDOFF) + depthZ) / STANDOFF));
}

/** Segment vs axis-aligned box (slab method). */
function hitsAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  b: AabbOccluder,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let a = (lo - o) / d;
    let c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return false;
  }
  return true;
}

/** Segment vs a vertical annular ring (the boundary kerb). */
function hitsRing(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  r: RingOccluder,
): boolean {
  // clip the segment to the ring's height slab first
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dy) < 1e-12) {
    if (oy < r.minY || oy > r.maxY) return false;
  } else {
    let a = (r.minY - oy) / dy;
    let c = (r.maxY - oy) / dy;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  // inside that span, is the radius ever in [rInner, rOuter]?
  const px = ox - r.cx;
  const pz = oz - r.cz;
  const A = dx * dx + dz * dz;
  const B = 2 * (px * dx + pz * dz);
  const radiusAt = (t: number): number => Math.hypot(px + dx * t, pz + dz * t);
  const candidates = [t0, t1];
  if (A > 1e-12) {
    const tv = -B / (2 * A); // parameter of closest approach to the axis
    if (tv > t0 && tv < t1) candidates.push(tv);
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of candidates) {
    const rad = radiusAt(t);
    lo = Math.min(lo, rad);
    hi = Math.max(hi, rad);
  }
  // the radius is monotonic either side of the closest approach, so the span
  // [lo, hi] is exact — overlap with the annulus means a hit
  return hi >= r.rInner && lo <= r.rOuter;
}

/** The first occluder that blocks this ray, or null if the hero is visible. */
function blocker(
  ox: number, oy: number, oz: number,
  tx: number, ty: number, tz: number,
  occluders: readonly Occluder[],
): Occluder | null {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  for (const o of occluders) {
    if (o.kind === "aabb" ? hitsAabb(ox, oy, oz, dx, dy, dz, o) : hitsRing(ox, oy, oz, dx, dy, dz, o)) {
      return o;
    }
  }
  return null;
}

/** Ground distance from a standing position to an occluder's footprint (0 when
 *  standing on it). This is what separates "pressed against it" from "hidden". */
function footprintDistance(px: number, pz: number, o: Occluder): number {
  if (o.kind === "ring") {
    const rad = Math.hypot(px - o.cx, pz - o.cz);
    if (rad < o.rInner) return o.rInner - rad;
    if (rad > o.rOuter) return rad - o.rOuter;
    return 0;
  }
  const dx = Math.max(o.minX - px, 0, px - o.maxX);
  const dz = Math.max(o.minZ - pz, 0, pz - o.maxZ);
  return Math.hypot(dx, dz);
}

// ---------------------------------------------------------------------------
// arena assembly
// ---------------------------------------------------------------------------

interface Zone {
  center: { x: number; z: number };
  boundaryRadius: number;
  obstacles: (
    | { kind: "circle"; center: { x: number; z: number }; radius: number }
    | { kind: "segment"; a: { x: number; z: number }; b: { x: number; z: number } }
  )[];
}

interface Doc {
  id: string;
  zones: Zone[];
  decor: { model: string; x: number; z: number; rotQuarter: number; scale: number }[];
}

function rotQuarterToRadians(q: number): number {
  return ((((q % 4) + 4) % 4) * Math.PI) / 2;
}

/**
 * Stand-in for ArenaScene's `occludesPlayArea`, used for two things: the
 * broad-phase, and deciding which props dressArena would height-squash.
 *
 * It mirrors that function, and the safe direction to drift is toward squashing
 * FEWER props than the runtime does. A prop this model leaves at full height but
 * the runtime cuts to the cap is simulated as a taller, more aggressive occluder
 * than the one the player actually sees — so a PASS here still implies a PASS in
 * the game, while a divergence in the other direction would be a false PASS.
 * Keep any future edit on the permissive side of the runtime for that reason.
 */
function couldHide(o: Occluder, zones: readonly Zone[]): boolean {
  if (o.kind === "ring") return topOf(o) > SIGHTLINE_HEIGHT_CAP;
  // NOT `> HERO_HEAD_Y`: the runtime only squashes what stands ABOVE the cap,
  // and this decides where dressArena squashes, so a 2.0u crate must come
  // through untouched rather than be "squashed" UP to 2.4u.
  if (o.maxY <= SIGHTLINE_HEIGHT_CAP + 1e-6) return false;
  if (o.maxX - o.minX < minFullHideWidth(o.maxZ - o.minZ, o.maxY)) return false;
  const reach = fullHideReach(o.maxY);
  const shadowMaxZ = o.maxZ + (Number.isFinite(reach) ? reach : 1e6);
  return zones.some((z) => {
    const nx = Math.min(Math.max(z.center.x, o.minX), o.maxX);
    const nz = Math.min(Math.max(z.center.z, o.minZ), shadowMaxZ);
    const dx = nx - z.center.x;
    const dz = nz - z.center.z;
    return dx * dx + dz * dz <= z.boundaryRadius * z.boundaryRadius;
  });
}

interface ArenaOccluders {
  all: Occluder[];
  faded: string[];
  missingModels: string[];
}

function buildOccluders(doc: Doc): ArenaOccluders {
  const all: Occluder[] = [];
  const faded: string[] = [];
  const missingModels: string[] = [];

  for (const d of doc.decor) {
    const box = glbBounds(d.model);
    if (!box) {
      if (!missingModels.includes(d.model)) missingModels.push(d.model);
      continue;
    }
    const yaw = rotQuarterToRadians(d.rotQuarter);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [sx, sz] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
      const x = (sx ? box.max : box.min)[0]! * d.scale;
      const z = (sz ? box.max : box.min)[2]! * d.scale;
      const rx = x * cos + z * sin;
      const rz = -x * sin + z * cos;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minZ = Math.min(minZ, rz); maxZ = Math.max(maxZ, rz);
    }
    let minY = box.min[1]! * d.scale;
    let maxY = box.max[1]! * d.scale;

    if (FADE_MODELS.some((m) => d.model.includes(m))) {
      faded.push(`${d.model} @ (${d.x}, ${d.z}) top ${maxY.toFixed(2)}`);
      continue; // ghosts out at runtime — #29's disposition, not an occluder
    }
    // dressArena's VISUAL-ONLY squash: scale Y so the top lands on the cap
    const probe: AabbOccluder = {
      kind: "aabb", label: d.model,
      minX: d.x + minX, maxX: d.x + maxX,
      minY, maxY, minZ: d.z + minZ, maxZ: d.z + maxZ,
    };
    if (couldHide(probe, doc.zones)) {
      const k = SIGHTLINE_HEIGHT_CAP / maxY;
      minY *= k;
      maxY = SIGHTLINE_HEIGHT_CAP;
    }
    all.push({
      kind: "aabb", label: d.model,
      minX: d.x + minX, maxX: d.x + maxX, minY, maxY,
      minZ: d.z + minZ, maxZ: d.z + maxZ,
    });
  }

  // Procedural obstacle markers. ALWAYS present and ALWAYS low (#218): the old
  // "skip these when the doc ships pillar decor" rule mirrored dressArena's
  // inverted disposal, so this script agreed with the renderer's bug instead of
  // catching it.
  for (const zone of doc.zones) {
    for (const ob of zone.obstacles) {
      if (ob.kind === "circle") {
        all.push({
          kind: "aabb", label: "obstacle-marker",
          minX: ob.center.x - ob.radius, maxX: ob.center.x + ob.radius,
          minY: 0, maxY: OBSTACLE_MARKER_TOP_Y,
          minZ: ob.center.z - ob.radius, maxZ: ob.center.z + ob.radius,
        });
      } else {
        all.push({
          kind: "aabb", label: "obstacle-wall-marker",
          minX: Math.min(ob.a.x, ob.b.x) - 0.2, maxX: Math.max(ob.a.x, ob.b.x) + 0.2,
          minY: 0, maxY: OBSTACLE_MARKER_TOP_Y,
          minZ: Math.min(ob.a.z, ob.b.z) - 0.2, maxZ: Math.max(ob.a.z, ob.b.z) + 0.2,
        });
      }
    }
    // task #80 boundary kerb
    if (WITHOUT_KERB) continue;
    all.push({
      kind: "ring", label: "boundary-kerb",
      cx: zone.center.x, cz: zone.center.z,
      rInner: zone.boundaryRadius, rOuter: zone.boundaryRadius + KERB_OUTER_DR,
      minY: FLOOR_TOP_Y, maxY: KERB_TOP_Y + KERB_WOBBLE_MAX,
    });
  }
  return { all, faded, missingModels };
}

// ---------------------------------------------------------------------------
// the sweep
// ---------------------------------------------------------------------------

/**
 * The band around a prop in which a fully-hidden hero is ACCEPTED rather than a
 * failure — `fullHideReach(SIGHTLINE_HEIGHT_CAP)` ≈ 0.683u.
 *
 * This is not a fudge factor, it is #29's actual guarantee. Capping props at
 * 2.4u does not abolish occlusion, it BOUNDS it: a 2.4u prop still hides a 1.7u
 * hero, but only within 0.683u of its own silhouette — a hero physically
 * pressed against the thing. #29's whole argument is that that band is a
 * body-contact band and therefore acceptable, which is why ArenaScene's
 * `occludesPlayArea` waves through anything at or under the cap.
 *
 * So the failure condition is a hero fully hidden while standing CLEAR of
 * whatever hides him. Without this distinction the sweep reports every capped
 * pillar and crate in the game and tells you nothing about your own change.
 */
const CONTACT_BAND = fullHideReach(SIGHTLINE_HEIGHT_CAP);

interface Hidden {
  x: number;
  z: number;
  /** distance from the nearest thing that blocked a ray, in world units */
  gap: number;
  label: string;
}

interface ZoneResult {
  points: number;
  /** fully hidden AND standing clear of the blocker — real failures */
  hidden: Hidden[];
  /** fully hidden but in body contact — #29's accepted case */
  contactHides: number;
  worstBlockedRays: number;
  /** largest gap at which anything fully hid a hero (0 = only contact hides) */
  worstGap: number;
  culprits: Set<string>;
}

function sweepZone(zone: Zone, occluders: readonly Occluder[]): ZoneResult {
  // a hero's CENTRE is clamped to boundaryRadius − body radius (sim resolve.ts)
  const standR = zone.boundaryRadius - HERO_BODY_RADIUS;
  // broad-phase: an occluder can only matter within its shadow rectangle
  const shadows = occluders.map((o) => {
    const reach = fullHideReach(topOf(o));
    if (o.kind === "ring") {
      return { o, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, live: reach > 0 };
    }
    return {
      o,
      minX: o.minX - HERO_BODY_RADIUS,
      maxX: o.maxX + HERO_BODY_RADIUS,
      minZ: o.minZ - HERO_BODY_RADIUS,
      maxZ: o.maxZ + (Number.isFinite(reach) ? reach : 1e6),
      live: reach > 0,
    };
  });
  const live = shadows.filter((s) => s.live);

  const result: ZoneResult = {
    points: 0,
    hidden: [],
    contactHides: 0,
    worstBlockedRays: 0,
    worstGap: 0,
    culprits: new Set(),
  };
  const steps = Math.floor((standR * 2) / GRID);
  for (let ix = 0; ix <= steps; ix++) {
    const px = zone.center.x - standR + ix * GRID;
    for (let iz = 0; iz <= steps; iz++) {
      const pz = zone.center.z - standR + iz * GRID;
      const dx = px - zone.center.x;
      const dz = pz - zone.center.z;
      if (dx * dx + dz * dz > standR * standR) continue;
      // standing inside a blocking obstacle is not a standable point
      let inside = false;
      for (const ob of zone.obstacles) {
        if (ob.kind !== "circle") continue;
        const ex = px - ob.center.x;
        const ez = pz - ob.center.z;
        const rr = ob.radius + HERO_BODY_RADIUS;
        if (ex * ex + ez * ez < rr * rr) { inside = true; break; }
      }
      if (inside) continue;
      result.points++;

      const candidates = live.filter(
        (s) => px >= s.minX && px <= s.maxX && pz >= s.minZ && pz <= s.maxZ,
      );
      if (candidates.length === 0) continue;
      const set = candidates.map((s) => s.o);

      // the rig sits due SOUTH of its target, no yaw — so view-right is +X
      const ex = px;
      const ey = EYE_HEIGHT;
      const ez = pz - STANDOFF;
      let blockedRays = 0;
      let nearest: Occluder | null = null;
      let gap = Infinity;
      for (const h of SAMPLE_HEIGHTS) {
        for (const lat of SAMPLE_LATERAL) {
          const hit = blocker(ex, ey, ez, px + lat, h, pz, set);
          if (!hit) continue;
          blockedRays++;
          const d = footprintDistance(px, pz, hit);
          if (d < gap) {
            gap = d;
            nearest = hit;
          }
        }
      }
      const total = SAMPLE_HEIGHTS.length * SAMPLE_LATERAL.length;
      if (blockedRays > result.worstBlockedRays) result.worstBlockedRays = blockedRays;
      if (blockedRays !== total || !nearest) continue;
      // fully hidden — is the hero pressed against the thing, or standing clear?
      if (gap > result.worstGap) result.worstGap = gap;
      if (gap <= CONTACT_BAND + 1e-6) {
        result.contactHides++;
      } else {
        result.hidden.push({ x: px, z: pz, gap, label: nearest.label });
        result.culprits.add(nearest.label);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------

function main(): void {
  const files = readdirSync(ARENAS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  let failed = false;
  let totalPoints = 0;

  console.log(
    `occluder sweep — eye ${EYE_HEIGHT.toFixed(2)}u, standoff ${STANDOFF.toFixed(2)}u, ` +
      `grid ${GRID}u, ${SAMPLE_HEIGHTS.length * SAMPLE_LATERAL.length} rays/point, ` +
      `accepted contact band ${CONTACT_BAND.toFixed(3)}u\n`,
  );

  let totalContact = 0;
  let globalWorstGap = 0;
  const byLabel = new Map<string, number>();

  for (const file of files) {
    const doc = JSON.parse(readFileSync(join(ARENAS, file), "utf8")) as Doc;
    const { all, faded, missingModels } = buildOccluders(doc);
    if (missingModels.length) {
      console.log(`  ${doc.id}: MODEL NOT READABLE — ${missingModels.join(", ")}`);
      failed = true;
    }
    let points = 0;
    let hidden = 0;
    let contact = 0;
    let worst = 0;
    let worstGap = 0;
    const examples: string[] = [];
    doc.zones.forEach((zone, zi) => {
      const r = sweepZone(zone, all);
      points += r.points;
      hidden += r.hidden.length;
      contact += r.contactHides;
      worst = Math.max(worst, r.worstBlockedRays);
      worstGap = Math.max(worstGap, r.worstGap);
      for (const p of r.hidden) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + 1);
      for (const p of r.hidden.slice(0, 4)) {
        examples.push(
          `zone ${zi} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) ${p.gap.toFixed(2)}u clear of ${p.label}`,
        );
      }
    });
    totalPoints += points;
    totalContact += contact;
    globalWorstGap = Math.max(globalWorstGap, worstGap);
    const verdict = hidden === 0 ? "PASS" : "FAIL";
    if (hidden > 0) failed = true;
    console.log(
      `${verdict}  ${doc.id.padEnd(16)} ${points.toString().padStart(6)} pts, ` +
        `${all.length.toString().padStart(3)} occluders, worst ray-block ${worst}/35, ` +
        `${contact} contact-hides (worst gap ${worstGap.toFixed(3)}u), ${hidden} FAILURES` +
        (faded.length ? `  [${faded.length} fade-managed]` : ""),
    );
    for (const e of examples) console.log(`        ${e}`);
  }

  console.log(
    `\n${totalPoints} standable points swept${WITHOUT_KERB ? " (task #80 kerb OMITTED)" : ""}; ` +
      `${totalContact} contact-hides, worst hide gap anywhere ${globalWorstGap.toFixed(3)}u ` +
      `(band ${CONTACT_BAND.toFixed(3)}u).`,
  );
  if (byLabel.size) {
    console.log("failures by blocker:");
    for (const [label, n] of [...byLabel].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(4)}  ${label}`);
    }
  }
  console.log(failed ? "RESULT: FAIL — the #29 guarantee is broken." : "RESULT: PASS — #29 guarantee holds.");
  process.exit(failed ? 1 : 0);
}

main();
