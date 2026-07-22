/**
 * guardian-occluder-sweep — task #105's per-silhouette extension of the task #29
 * fixed-camera occluder audit (apps/client/scripts/occluder-sweep.ts).
 *
 *   Run: node apps/client/scripts/guardian-occluder-sweep.mjs [--arena=arena.colosseum]
 *        [--model=assets/models/guardians/guardian_stone.glb] [--yaw=0]
 *        [--scales=100,104,110,...]  (native-unit uniform scales)
 *
 * WHY A SECOND SCRIPT. #29's harness models every prop as a single solid AABB and
 * SQUASHES anything over the 2.4u cap at zone.center to the cap — which is correct
 * for dressArena decor but makes it structurally incapable of answering #105's
 * question: "how tall can THIS silhouette be before it hides a champion?" A
 * treant (sparse canopy, narrow trunk) and a stone golem (solid mid-mass) share
 * an AABB and would get the same verdict, yet occlude completely differently. So
 * this script keeps #29's camera, grid, 35-ray pattern, contact-band and
 * classification EXACTLY, but replaces the guardian's AABB with its REAL
 * triangles, loaded through the client's own Babylon load path, un-squashed, at
 * its true intended height. Rays that would pass through the gap between the
 * legs, or beside the thin helm crest, pass — as they do in the real view.
 *
 * The OTHER arena props keep #29's exact AABB+squash treatment (ported verbatim
 * below), so the non-guardian numbers reproduce the #29 baseline for the arena.
 */
import { NullEngine, Scene, SceneLoader, Vector3 } from "@babylonjs/core/index.js";
import "@babylonjs/loaders/glTF/index.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CONTENT = join(REPO, "content");

// ---- args ----
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.slice(k.length + 3) : d;
};
const ARENA = arg("arena", "arena.colosseum");
const MODEL = arg("model", "assets/models/guardians/guardian_stone.glb");
const YAW_DEG = Number(arg("yaw", "0"));
// guardian collision radius = §4.1 synthesized obstacle = transform.radius (2.5,
// the shipped mechanic; equals the centre pillar in castle/skeleton). A hero
// centre can never be within COLLISION_R + HERO_BODY_RADIUS of zone.center.
//   --collision=2.5   the shipped mechanic (default)
//   --collision=mesh  per-scale, hug the visible footprint (intrinsic-silhouette
//                     test: what the shape ITSELF occludes, with no generous bubble)
const COLLISION_ARG = arg("collision", "2.5");
const COLLISION_MESH = COLLISION_ARG === "mesh";
const COLLISION_R = COLLISION_MESH ? 0 : Number(COLLISION_ARG);
const SCALES = arg("scales", "90,100,103.851,110,120,130,140,147.123,160")
  .split(",")
  .map(Number);

// ---------------------------------------------------------------------------
// #29 constants — copied verbatim from occluder-sweep.ts
// ---------------------------------------------------------------------------
const CAMERA_PITCH_RAD = (55 * Math.PI) / 180;
const DOLLY_MIN = 10;
const EYE_HEIGHT = DOLLY_MIN * Math.sin(CAMERA_PITCH_RAD); // ≈ 8.1915
const STANDOFF = DOLLY_MIN * Math.cos(CAMERA_PITCH_RAD); // ≈ 5.7358
const HERO_HEAD_Y = 1.7;
const HERO_BODY_RADIUS = 0.6;
const HERO_WIDTH = 1.0;
const SIGHTLINE_HEIGHT_CAP = 2.4;
const GRID = 0.25;
const SAMPLE_HEIGHTS = [0.15, 0.5, 0.9, 1.3, HERO_HEAD_Y];
const SAMPLE_LATERAL = [-0.5, -0.333, -0.167, 0, 0.167, 0.333, 0.5];
const TOTAL_RAYS = SAMPLE_HEIGHTS.length * SAMPLE_LATERAL.length; // 35

const KERB_TOP_Y = 0.42;
const KERB_WOBBLE_MAX = 0.045 + 0.03 + 0.018 + 0.01;
const KERB_OUTER_DR = 1.45;
const FLOOR_TOP_Y = -0.01;
const FADE_MODELS = ["tower_red", "tower_blue"];

function fullHideReach(topY) {
  if (topY <= HERO_HEAD_Y) return 0;
  if (topY >= EYE_HEIGHT) return Infinity;
  return ((topY - HERO_HEAD_Y) * STANDOFF) / (EYE_HEIGHT - topY);
}
function minFullHideWidth(depthZ, topY) {
  return Math.max(0, HERO_WIDTH * (1 - (Math.min(fullHideReach(topY), STANDOFF) + depthZ) / STANDOFF));
}
const CONTACT_BAND = fullHideReach(SIGHTLINE_HEIGHT_CAP); // ≈ 0.6934

// ---------------------------------------------------------------------------
// #29 .glb accessor-bounds reader (for the OTHER props) — ported verbatim
// ---------------------------------------------------------------------------
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function matMul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  return out;
}
function trs(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function xform(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
const boundsCache = new Map();
function glbBounds(relPath) {
  if (boundsCache.has(relPath)) return boundsCache.get(relPath);
  let box = null;
  try {
    const buf = readFileSync(join(CONTENT, relPath));
    let off = 12, json = null;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32LE(off);
      const type = buf.readUInt32LE(off + 4);
      if (type === 0x4e4f534a) {
        json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString("utf8"));
        break;
      }
      off += 8 + len;
    }
    if (!json?.nodes) throw new Error("no nodes");
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const visit = (ni, parent) => {
      const node = json.nodes[ni];
      const local = node.matrix
        ? node.matrix
        : trs(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
      const world = matMul(parent, local);
      if (node.mesh !== undefined) {
        for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
          const acc = json.accessors?.[prim.attributes.POSITION];
          if (!acc?.min || !acc?.max) continue;
          for (let c = 0; c < 8; c++) {
            const p = xform(world, [
              (c & 1 ? acc.max : acc.min)[0],
              (c & 2 ? acc.max : acc.min)[1],
              (c & 4 ? acc.max : acc.min)[2],
            ]);
            for (let k = 0; k < 3; k++) {
              if (p[k] < min[k]) min[k] = p[k];
              if (p[k] > max[k]) max[k] = p[k];
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
// #29 occluder primitives — ported verbatim
// ---------------------------------------------------------------------------
function topOf(o) { return o.maxY; }
function hitsAabb(ox, oy, oz, dx, dy, dz, b) {
  let t0 = 0, t1 = 1;
  const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return false;
  }
  return true;
}
function hitsRing(ox, oy, oz, dx, dy, dz, r) {
  let t0 = 0, t1 = 1;
  if (Math.abs(dy) < 1e-12) {
    if (oy < r.minY || oy > r.maxY) return false;
  } else {
    let a = (r.minY - oy) / dy, c = (r.maxY - oy) / dy;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  const px = ox - r.cx, pz = oz - r.cz;
  const A = dx * dx + dz * dz, B = 2 * (px * dx + pz * dz);
  const radiusAt = (t) => Math.hypot(px + dx * t, pz + dz * t);
  const cand = [t0, t1];
  if (A > 1e-12) { const tv = -B / (2 * A); if (tv > t0 && tv < t1) cand.push(tv); }
  let lo = Infinity, hi = -Infinity;
  for (const t of cand) { const rad = radiusAt(t); lo = Math.min(lo, rad); hi = Math.max(hi, rad); }
  return hi >= r.rInner && lo <= r.rOuter;
}
function footprintDistance(px, pz, o) {
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
function rotQuarterToRadians(q) { return ((((q % 4) + 4) % 4) * Math.PI) / 2; }

function couldHide(o, zones) {
  if (o.kind === "ring") return topOf(o) > SIGHTLINE_HEIGHT_CAP;
  if (o.maxY <= SIGHTLINE_HEIGHT_CAP + 1e-6) return false;
  if (o.maxX - o.minX < minFullHideWidth(o.maxZ - o.minZ, o.maxY)) return false;
  const reach = fullHideReach(o.maxY);
  const shadowMaxZ = o.maxZ + (Number.isFinite(reach) ? reach : 1e6);
  return zones.some((z) => {
    const nx = Math.min(Math.max(z.center.x, o.minX), o.maxX);
    const nz = Math.min(Math.max(z.center.z, o.minZ), shadowMaxZ);
    const dx = nx - z.center.x, dz = nz - z.center.z;
    return dx * dx + dz * dz <= z.boundaryRadius * z.boundaryRadius;
  });
}

/** Build the OTHER (non-guardian) arena occluders exactly as #29 does. */
function buildOtherOccluders(doc) {
  const all = [];
  const faded = [];
  for (const d of doc.decor) {
    const box = glbBounds(d.model);
    if (!box) continue;
    const yaw = rotQuarterToRadians(d.rotQuarter);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [sx, sz] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const x = (sx ? box.max : box.min)[0] * d.scale;
      const z = (sz ? box.max : box.min)[2] * d.scale;
      const rx = x * cos + z * sin, rz = -x * sin + z * cos;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minZ = Math.min(minZ, rz); maxZ = Math.max(maxZ, rz);
    }
    let minY = box.min[1] * d.scale, maxY = box.max[1] * d.scale;
    if (FADE_MODELS.some((m) => d.model.includes(m))) { faded.push(d.model); continue; }
    const probe = { kind: "aabb", label: d.model, minX: d.x + minX, maxX: d.x + maxX, minY, maxY, minZ: d.z + minZ, maxZ: d.z + maxZ };
    if (couldHide(probe, doc.zones)) { const k = SIGHTLINE_HEIGHT_CAP / maxY; minY *= k; maxY = SIGHTLINE_HEIGHT_CAP; }
    all.push({ kind: "aabb", label: d.model, minX: d.x + minX, maxX: d.x + maxX, minY, maxY, minZ: d.z + minZ, maxZ: d.z + maxZ });
  }
  const pillarsPlaced = doc.decor.some((d) => d.model.includes("pillar"));
  for (const zone of doc.zones) {
    for (const ob of zone.obstacles) {
      if (ob.kind === "circle") {
        if (pillarsPlaced) continue;
        all.push({ kind: "aabb", label: "obstacle-cylinder", minX: ob.center.x - ob.radius, maxX: ob.center.x + ob.radius, minY: 0, maxY: SIGHTLINE_HEIGHT_CAP, minZ: ob.center.z - ob.radius, maxZ: ob.center.z + ob.radius });
      } else {
        all.push({ kind: "aabb", label: "obstacle-wall", minX: Math.min(ob.a.x, ob.b.x) - 0.2, maxX: Math.max(ob.a.x, ob.b.x) + 0.2, minY: 0, maxY: SIGHTLINE_HEIGHT_CAP, minZ: Math.min(ob.a.z, ob.b.z) - 0.2, maxZ: Math.max(ob.a.z, ob.b.z) + 0.2 });
      }
    }
    all.push({ kind: "ring", label: "boundary-kerb", cx: zone.center.x, cz: zone.center.z, rInner: zone.boundaryRadius, rOuter: zone.boundaryRadius + KERB_OUTER_DR, minY: FLOOR_TOP_Y, maxY: KERB_TOP_Y + KERB_WOBBLE_MAX });
  }
  return { all, faded };
}

// ---------------------------------------------------------------------------
// guardian mesh — REAL triangles, through the client's Babylon load path
// ---------------------------------------------------------------------------
async function loadGuardianTris() {
  const buf = readFileSync(join(CONTENT, MODEL));
  const data = "data:base64," + buf.toString("base64");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const res = await SceneLoader.ImportMeshAsync("", "", data, scene, undefined, ".glb");
  const tris = []; // native-unit triangles [ax,ay,az, bx,by,bz, cx,cy,cz]
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of res.meshes) {
    if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    const wm = m.getWorldMatrix();
    const pos = m.getVerticesData("position");
    const idx = m.getIndices();
    if (!pos || !idx) continue;
    const wp = new Array(pos.length / 3);
    for (let i = 0; i < pos.length; i += 3) {
      const v = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm);
      wp[i / 3] = [v.x, v.y, v.z];
      for (let k = 0; k < 3; k++) { const c = [v.x, v.y, v.z][k]; if (c < min[k]) min[k] = c; if (c > max[k]) max[k] = c; }
    }
    for (let i = 0; i < idx.length; i += 3) tris.push([...wp[idx[i]], ...wp[idx[i + 1]], ...wp[idx[i + 2]]]);
  }
  engine.dispose?.();
  return { tris, min, max };
}

/** Möller–Trumbore, clamped to the segment origin→(origin+dir), dir = target−origin. */
function segHitsTri(ox, oy, oz, dx, dy, dz, t) {
  const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2];
  const e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-12 && det < 1e-12) return false;
  const inv = 1 / det;
  const tvx = ox - t[0], tvy = oy - t[1], tvz = oz - t[2];
  const u = (tvx * px + tvy * py + tvz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return false;
  const qx = tvy * e1z - tvz * e1y, qy = tvz * e1x - tvx * e1z, qz = tvx * e1y - tvy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return false;
  const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return s > 1e-6 && s < 1 - 1e-6; // strictly between eye and target
}

// ---------------------------------------------------------------------------
// the sweep — #29's sweepZone, with the guardian added as a triangle occluder
// ---------------------------------------------------------------------------
function sweepArena(doc, others, guardian) {
  // guardian scaled/placed triangles + its AABB per zone are prepared by caller
  let points = 0, hidden = 0, contact = 0, worstBlocked = 0, worstGap = 0;
  let gContact = 0, gWorstGap = 0, gHidden = 0; // guardian-attributed only
  const culprits = new Map();
  const examples = [];

  const shadowsBase = others.map((o) => {
    const reach = fullHideReach(topOf(o));
    if (o.kind === "ring") return { o, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, live: reach > 0 };
    return { o, minX: o.minX - HERO_BODY_RADIUS, maxX: o.maxX + HERO_BODY_RADIUS, minZ: o.minZ - HERO_BODY_RADIUS, maxZ: o.maxZ + (Number.isFinite(reach) ? reach : 1e6), live: reach > 0 };
  }).filter((s) => s.live);

  doc.zones.forEach((zone, zi) => {
    const g = guardian[zi]; // { tris, aabb:{minX..maxZ,minY,maxY}, shadow }
    const standR = zone.boundaryRadius - HERO_BODY_RADIUS;
    const steps = Math.floor((standR * 2) / GRID);
    // guardian collision obstacle (matches §4.1 synthesized circle)
    const gCollide = { x: zone.center.x, z: zone.center.z, r: g.collR };

    for (let ix = 0; ix <= steps; ix++) {
      const px = zone.center.x - standR + ix * GRID;
      for (let iz = 0; iz <= steps; iz++) {
        const pz = zone.center.z - standR + iz * GRID;
        const ddx = px - zone.center.x, ddz = pz - zone.center.z;
        if (ddx * ddx + ddz * ddz > standR * standR) continue;
        // non-standable if inside any circle obstacle (incl. the guardian's)
        let inside = false;
        for (const ob of zone.obstacles) {
          if (ob.kind !== "circle") continue;
          const ex = px - ob.center.x, ez = pz - ob.center.z, rr = ob.radius + HERO_BODY_RADIUS;
          if (ex * ex + ez * ez < rr * rr) { inside = true; break; }
        }
        if (!inside) {
          const ex = px - gCollide.x, ez = pz - gCollide.z, rr = gCollide.r + HERO_BODY_RADIUS;
          if (ex * ex + ez * ez < rr * rr) inside = true;
        }
        if (inside) continue;
        points++;

        const cand = shadowsBase.filter((s) => px >= s.minX && px <= s.maxX && pz >= s.minZ && pz <= s.maxZ).map((s) => s.o);
        const inGShadow = px >= g.shadow.minX && px <= g.shadow.maxX && pz >= g.shadow.minZ && pz <= g.shadow.maxZ;
        if (cand.length === 0 && !inGShadow) continue;

        const eyeX = px, eyeY = EYE_HEIGHT, eyeZ = pz - STANDOFF;
        let blocked = 0, nearest = null, gap = Infinity, nearestIsG = false;
        for (const h of SAMPLE_HEIGHTS) {
          for (const lat of SAMPLE_LATERAL) {
            const tx = px + lat, ty = h, tz = pz;
            const dx = tx - eyeX, dy = ty - eyeY, dz = tz - eyeZ;
            let hit = null, hitIsG = false;
            for (const o of cand) {
              if (o.kind === "aabb" ? hitsAabb(eyeX, eyeY, eyeZ, dx, dy, dz, o) : hitsRing(eyeX, eyeY, eyeZ, dx, dy, dz, o)) { hit = o; break; }
            }
            if (!hit && inGShadow) {
              // guardian AABB broadphase, then real triangles
              if (hitsAabb(eyeX, eyeY, eyeZ, dx, dy, dz, g.aabb)) {
                for (let ti = 0; ti < g.tris.length; ti++) {
                  if (segHitsTri(eyeX, eyeY, eyeZ, dx, dy, dz, g.tris[ti])) { hit = g.aabb; hitIsG = true; break; }
                }
              }
            }
            if (!hit) continue;
            blocked++;
            const d = footprintDistance(px, pz, hit);
            if (d < gap) { gap = d; nearest = hit; nearestIsG = hitIsG; }
          }
        }
        if (blocked > worstBlocked) worstBlocked = blocked;
        if (blocked !== TOTAL_RAYS || !nearest) continue;
        if (gap > worstGap) worstGap = gap;
        if (nearestIsG && gap > gWorstGap) gWorstGap = gap;
        if (gap <= CONTACT_BAND + 1e-6) { contact++; if (nearestIsG) gContact++; }
        else {
          hidden++;
          if (nearestIsG) gHidden++;
          const label = nearestIsG ? "GUARDIAN(" + MODEL.split("/").pop() + ")" : nearest.label;
          culprits.set(label, (culprits.get(label) ?? 0) + 1);
          if (examples.length < 6) examples.push(`zone ${zi} (${px.toFixed(2)}, ${pz.toFixed(2)}) ${gap.toFixed(2)}u clear of ${label}`);
        }
      }
    }
  });
  return { points, hidden, contact, worstBlocked, worstGap, culprits, examples, gContact, gWorstGap, gHidden };
}

// ---------------------------------------------------------------------------
async function main() {
  const doc = JSON.parse(readFileSync(join(REPO, "content", "arenas", `${ARENA}.json`), "utf8"));
  const { all: others } = buildOtherOccluders(doc);
  const { tris: nativeTris, min: nmin, max: nmax } = await loadGuardianTris();
  const nativeH = nmax[1] - nmin[1];
  const yaw = (YAW_DEG * Math.PI) / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);

  console.log(
    `guardian-occluder-sweep — arena ${ARENA}, model ${MODEL.split("/").pop()}, yaw ${YAW_DEG}°\n` +
    `  eye ${EYE_HEIGHT.toFixed(2)}u, standoff ${STANDOFF.toFixed(2)}u, grid ${GRID}u, ${TOTAL_RAYS} rays/pt, ` +
    `contact band ${CONTACT_BAND.toFixed(3)}u, guardian collision r ${COLLISION_R}u\n` +
    `  native height ${nativeH.toFixed(5)} (${nativeTris.length} tris); other arena occluders ${others.length}\n`);

  for (const scale of SCALES) {
    const topY = nativeH * scale;
    // build placed+scaled guardian triangles per zone
    const guardian = doc.zones.map((zone) => {
      const cx = zone.center.x, cz = zone.center.z;
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity, mxy = -Infinity, mny = Infinity;
      const tris = new Array(nativeTris.length);
      for (let i = 0; i < nativeTris.length; i++) {
        const t = nativeTris[i], out = new Array(9);
        for (let v = 0; v < 3; v++) {
          // scale about native min-Y so base sits on ground (y0 = 0)
          let x = (t[v * 3] - 0) * scale;
          let y = (t[v * 3 + 1] - nmin[1]) * scale;
          let z = (t[v * 3 + 2] - 0) * scale;
          const rx = x * cy + z * sy, rz = -x * sy + z * cy;
          out[v * 3] = cx + rx; out[v * 3 + 1] = y; out[v * 3 + 2] = cz + rz;
          if (out[v * 3] < mnx) mnx = out[v * 3]; if (out[v * 3] > mxx) mxx = out[v * 3];
          if (out[v * 3 + 2] < mnz) mnz = out[v * 3 + 2]; if (out[v * 3 + 2] > mxz) mxz = out[v * 3 + 2];
          if (y < mny) mny = y; if (y > mxy) mxy = y;
        }
        tris[i] = out;
      }
      const aabb = { kind: "aabb", label: "guardian", minX: mnx, maxX: mxx, minY: mny, maxY: mxy, minZ: mnz, maxZ: mxz };
      const reach = fullHideReach(mxy);
      const shadow = { minX: mnx - HERO_BODY_RADIUS, maxX: mxx + HERO_BODY_RADIUS, minZ: mnz - HERO_BODY_RADIUS, maxZ: mxz + (Number.isFinite(reach) ? reach : 1e6) };
      const footW = mxx - mnx, footD = mxz - mnz;
      const collR = COLLISION_MESH ? Math.max(footW, footD) / 2 : COLLISION_R;
      return { tris, aabb, shadow, footW, footD, collR };
    });

    const r = sweepArena(doc, others, guardian);
    const verdict = r.hidden === 0 ? "PASS" : "FAIL";
    const fw = guardian[0].footW, fd = guardian[0].footD, cr = guardian[0].collR;
    console.log(
      `${verdict}  scale ${String(scale).padStart(7)}  topY ${topY.toFixed(2)}u  foot ${fw.toFixed(2)}×${fd.toFixed(2)}u  collR ${cr.toFixed(2)}u  ` +
      `${String(r.points).padStart(6)} pts, ${others.length + 1} occ, block ${r.worstBlocked}/35, ` +
      `${r.contact} contact (gap ${r.worstGap.toFixed(3)}u), ${r.hidden} FAIL  ` +
      `| guardian: ${r.gContact} contact (gap ${r.gWorstGap.toFixed(3)}u), ${r.gHidden} FAIL`);
    for (const e of r.examples) console.log(`        ${e}`);
    if (r.culprits.size) console.log(`        culprits: ${[...r.culprits].map(([k, n]) => `${k}×${n}`).join(", ")}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
