/**
 * MODEL AUDIT — GGD task #61 (READ-ONLY)
 *
 * Audit EVERY champion-referenced model (the 51 imported.* + 4 KayKit voxel
 * bodies that a `content/champions/*.json` `modelKey` points at) headless
 * through Babylon NullEngine — the client's exact load path — applying the
 * live `content/models/*.json` `scale`, and flag the six defect classes:
 *
 *   wrong-scale   rendered body/full height outside the champion band
 *   flying        body's lowest vertex floats well above the ground plane
 *   face-down     bind-pose silhouette is prone (vertical extent << footprint)
 *   tilted        a CLIP bakes a root-bone rotation that leaves it off-vertical
 *                 (per-animation — the #68 cause; compared across the model's
 *                 own clips so a legit death-fall is not mistaken for a defect)
 *   missing-texture  a body material carries no base texture (grey placeholder)
 *   stray-geometry   a mesh sits far outside the body silhouette (orb/beam/swarm)
 *
 * Emits docs/_model-audit-61.data.json (machine) — the .md report is generated
 * from it by gen_model_audit_61.mjs. No files are modified.
 *
 * Usage: tsx model_audit_61.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NullEngine, Scene, SceneLoader, Vector3, Quaternion, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

const REPO = "/Users/Takuro/GGD";
const MODELS_DIR = join(REPO, "content/models");
const CHAMPS_DIR = join(REPO, "content/champions");
const CONTENT = join(REPO, "content");
const OUT = join(REPO, "docs/_model-audit-61.data.json");

// ---- champion-referenced model set ---------------------------------------
const champByModel = new Map(); // modelKey -> [championId,...]
for (const f of readdirSync(CHAMPS_DIR)) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  let d;
  try { d = JSON.parse(readFileSync(join(CHAMPS_DIR, f), "utf8")); } catch { continue; }
  if (d.schema !== "champion@1") continue;
  const mk = d.modelKey;
  if (!champByModel.has(mk)) champByModel.set(mk, []);
  champByModel.get(mk).push(d.id);
}

function loadModelDoc(modelKey) {
  // model docs are `<modelKey>.json` OR `imported.<name>.json`
  const p = join(MODELS_DIR, `${modelKey}.json`);
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function depth(n) { let d = 0, p = n.parent; while (p) { d++; p = p.parent; } return d; }

function quatAngleDeg(q) {
  const w = Math.min(1, Math.abs(q.w));
  return (2 * Math.acos(w)) * 180 / Math.PI;
}
// angular distance between two unit quats, degrees
function quatDistDeg(a, b) {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  dot = Math.min(1, Math.abs(dot));
  return (2 * Math.acos(dot)) * 180 / Math.PI;
}
function firstKeyQuat(anim) {
  const keys = anim.getKeys();
  const v = keys[0].value;
  if (anim.targetProperty === "rotationQuaternion") return v.clone();
  return Quaternion.FromEulerVector(v);
}

const engine = new NullEngine();

async function audit(modelKey) {
  const doc = loadModelDoc(modelKey);
  const rec = { modelKey, champions: champByModel.get(modelKey) ?? [], ok: false };
  if (!doc) { rec.error = "no model doc"; return rec; }
  rec.glbPath = doc.glbPath;
  rec.scale = doc.scale;
  rec.clipMap = doc.clipMap;
  const scene = new Scene(engine);
  try {
    const abs = join(CONTENT, doc.glbPath);
    const buf = readFileSync(abs);
    const container = await SceneLoader.LoadAssetContainerAsync(
      "", "data:base64," + buf.toString("base64"), scene, undefined, ".glb");
    container.addAllToScene();
    for (const rn of container.rootNodes) if (rn instanceof TransformNode) rn.computeWorldMatrix(true);

    // ---- bind-pose geometry (world space, doc.scale applied) ----
    const S = doc.scale;
    let fullTop = -Infinity, fullBottom = Infinity, total = 0;
    const meshRecs = [];
    for (const mesh of container.meshes) {
      const pos = mesh.getVerticesData("position");
      if (!pos || pos.length === 0) continue;
      mesh.computeWorldMatrix(true);
      const wm = mesh.getWorldMatrix();
      let yTop = -Infinity, yBottom = Infinity, xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
      const tmp = new Vector3();
      for (let i = 0; i < pos.length; i += 3) {
        tmp.set(pos[i], pos[i + 1], pos[i + 2]);
        const w = Vector3.TransformCoordinates(tmp, wm);
        if (w.y > yTop) yTop = w.y; if (w.y < yBottom) yBottom = w.y;
        if (w.x < xMin) xMin = w.x; if (w.x > xMax) xMax = w.x;
        if (w.z < zMin) zMin = w.z; if (w.z > zMax) zMax = w.z;
      }
      const nv = pos.length / 3;
      total += nv;
      yTop *= S; yBottom *= S; xMin *= S; xMax *= S; zMin *= S; zMax *= S;
      if (yTop > fullTop) fullTop = yTop;
      if (yBottom < fullBottom) fullBottom = yBottom;
      const mat = mesh.material;
      let hasTex = false, emissive = false, alphaBlend = false;
      if (mat) {
        // walk the material for any texture
        for (const k of ["albedoTexture","baseTexture","diffuseTexture","emissiveTexture","bumpTexture"]) {
          if (mat[k]) { hasTex = true; break; }
        }
        const ec = mat.emissiveColor;
        if (ec) emissive = Math.max(ec.r ?? 0, ec.g ?? 0, ec.b ?? 0) > 0.02;
        try { alphaBlend = typeof mat.needAlphaBlending === "function" ? mat.needAlphaBlending() : false; } catch {}
      }
      meshRecs.push({
        name: mesh.name, verts: nv,
        yTop: +yTop.toFixed(4), yBottom: +yBottom.toFixed(4), ySpan: +(yTop - yBottom).toFixed(4),
        xSpan: +((xMax - xMin)).toFixed(4), zSpan: +((zMax - zMin)).toFixed(4),
        maxAbsXZ: +Math.max(Math.abs(xMin), Math.abs(xMax), Math.abs(zMin), Math.abs(zMax)).toFixed(4),
        hasTex, emissive, alphaBlend, material: mat?.name ?? null,
      });
    }
    if (meshRecs.length === 0) { rec.ok = true; rec.empty = true; rec.totalVerts = 0; return finalize(rec, scene); }

    // body = most verts
    let bi = 0;
    for (let i = 1; i < meshRecs.length; i++) if (meshRecs[i].verts > meshRecs[bi].verts) bi = i;
    const body = meshRecs[bi];
    body.isBody = true;
    rec.bodyNoTex = !body.hasTex && !body.material; // no texture AND no named material
    rec.bodyMeshName = body.name;
    rec.totalVerts = total;
    rec.bodyH = body.ySpan;
    rec.bodyTop = body.yTop;
    rec.bodyBottom = body.yBottom;
    rec.bodyFootprint = +Math.max(body.xSpan, body.zSpan).toFixed(4);
    rec.fullH = +(fullTop - fullBottom).toFixed(4);
    rec.fullTop = +fullTop.toFixed(4);
    rec.fullBottom = +fullBottom.toFixed(4);

    // stray meshes: far above / far off-axis relative to body
    const strays = [];
    for (const m of meshRecs) {
      if (m.isBody) continue;
      const aboveBy = m.yTop - body.yTop;
      const detached = m.yBottom > body.yTop + 0.05;                 // floats entirely above body
      const towering = m.yTop > 1.8 * body.yTop && body.yTop > 0.3;  // reaches way above head
      const wideOff = m.maxAbsXZ > Math.max(1.2, 1.6 * rec.bodyFootprint); // reaches far sideways
      const beam = m.ySpan > 1.4 * rec.bodyH && (m.emissive || m.alphaBlend || m.verts <= 64);
      if (detached || towering || wideOff || beam) {
        const cues = [];
        if (detached) cues.push("floats above body");
        if (towering) cues.push(`yTop ${m.yTop} >> bodyTop ${body.yTop.toFixed(2)}`);
        if (wideOff) cues.push(`|xz| ${m.maxAbsXZ}`);
        if (beam) cues.push(`ySpan ${m.ySpan} (>1.4x body)`);
        strays.push({ name: m.name, verts: m.verts, yTop: m.yTop, ySpan: m.ySpan, maxAbsXZ: m.maxAbsXZ, emissive: m.emissive, alphaBlend: m.alphaBlend, reason: cues.join("; ") });
      }
    }
    rec.strays = strays;

    // ---- per-clip root-bone rotation (the #68 signal) ----
    const clips = [];
    for (const ag of container.animationGroups) {
      // rotation-animated targets, pick the shallowest (root) bone
      let rootT = null, rootDepth = Infinity;
      for (const ta of ag.targetedAnimations) {
        if (!/rotation/i.test(ta.animation.targetProperty)) continue;
        const d = depth(ta.target);
        if (d < rootDepth) { rootDepth = d; rootT = ta; }
      }
      if (!rootT) { clips.push({ name: ag.name, rootNode: null, deg: 0 }); continue; }
      const q0 = firstKeyQuat(rootT.animation);
      clips.push({
        name: ag.name,
        rootNode: rootT.target.name,
        rootDepth,
        deg: +quatAngleDeg(q0).toFixed(2),
        q: [ +q0.x.toFixed(5), +q0.y.toFixed(5), +q0.z.toFixed(5), +q0.w.toFixed(5) ],
        nkeys: rootT.animation.getKeys().length,
      });
    }
    rec.clips = clips;
    rec.animGroups = container.animationGroups.length;

    // classify per-clip tilt: canonical = frame-0 root quat of the attack clip
    // (attacks always start upright); fall back to death, then the modal quat.
    const byName = new Map(clips.map((c) => [c.name, c]));
    const cm = doc.clipMap ?? {};
    const attackClip = byName.get(cm.attack);
    const deathClip = byName.get(cm.death);
    let canon = attackClip?.q ?? deathClip?.q ?? null;
    if (!canon && clips.length) {
      // modal: bucket by 10-degree
      const buckets = new Map();
      for (const c of clips) { const k = Math.round(c.deg / 10); buckets.set(k, (buckets.get(k) ?? 0) + 1); }
      let best = null, bestN = -1;
      for (const [k, n] of buckets) if (n > bestN) { bestN = n; best = k; }
      const rep = clips.find((c) => Math.round(c.deg / 10) === best);
      canon = rep?.q ?? null;
    }
    rec.canonQuat = canon;
    const cq = canon ? new Quaternion(canon[0], canon[1], canon[2], canon[3]) : null;
    // per render-state, is the mapped clip tilted vs canonical?
    const tiltedStates = [];
    for (const state of ["idle", "run", "attack", "cast", "hurt", "death"]) {
      const clipName = cm[state];
      const c = byName.get(clipName);
      if (!c || !c.q || !cq) continue;
      const dist = quatDistDeg(new Quaternion(c.q[0], c.q[1], c.q[2], c.q[3]), cq);
      if (dist > 20) tiltedStates.push({ state, clip: clipName, rootNode: c.rootNode, deg: c.deg, distFromCanonDeg: +dist.toFixed(2) });
    }
    rec.tiltedStates = tiltedStates;

    rec.ok = true;
    return finalize(rec, scene);
  } catch (e) {
    rec.error = String(e);
    scene.dispose();
    return rec;
  }
}

function finalize(rec, scene) {
  // ---- defect flags ----
  const flags = {};
  if (!rec.empty) {
    const rBody = rec.bodyH, rFull = rec.fullH;
    // wrong-scale: rendered body outside [1.2,2.2] OR full silhouette > 2.6
    flags.wrongScale = (rBody < 1.2 || rBody > 2.2 || rFull > 2.6);
    // flying: body floats — lowest body vertex noticeably above ground
    flags.flying = rec.bodyBottom > 0.18;
    // face-down: prone silhouette — vertical extent much smaller than footprint
    flags.faceDown = rec.bodyH < 0.65 * rec.bodyFootprint && rec.bodyFootprint > 0.9;
    // tilted: any mapped render clip off-vertical vs the model's own canonical
    flags.tilted = (rec.tiltedStates?.length ?? 0) > 0;
    // missing-texture: body mesh has no texture at all
    flags.missingTexture = rec.bodyNoTex === true;
    // stray-geometry
    flags.strayGeometry = (rec.strays?.length ?? 0) > 0;
  }
  rec.flags = flags;
  scene.dispose();
  return rec;
}

const results = [];
const keys = [...champByModel.keys()].sort();
for (const k of keys) {
  process.stderr.write(`auditing ${k} ...\n`);
  results.push(await audit(k));
}
engine.dispose();

writeFileSync(OUT, JSON.stringify(results, null, 2));

// terse summary to stdout
const F = (b) => (b ? "X" : "·");
console.log("\nmodelKey".padEnd(34) + "scl  bodyH fullH  fly tilt strayN  flags");
for (const r of results) {
  if (!r.ok) { console.log(`${r.modelKey.padEnd(32)} ERR ${r.error}`); continue; }
  if (r.empty) { console.log(`${r.modelKey.padEnd(32)} EMPTY-GLB (procedural fallback)`); continue; }
  const fl = r.flags;
  const names = Object.entries(fl).filter(([,v]) => v).map(([k]) => k).join(",");
  console.log(
    `${r.modelKey.padEnd(32)} ${String(r.scale).padStart(4)} ${r.bodyH.toFixed(2).padStart(5)} ${r.fullH.toFixed(2).padStart(5)}  ${F(fl.flying)}  ${F(fl.tilted)}   ${String(r.strays.length).padStart(2)}   ${names}`);
  for (const t of r.tiltedStates ?? []) console.log(`      TILT ${t.state}=${t.clip} root=${t.rootNode} ${t.deg}deg (${t.distFromCanonDeg}deg off canonical)`);
  for (const s of r.strays ?? []) console.log(`      STRAY ${s.name} v=${s.verts} yTop=${s.yTop} ySpan=${s.ySpan} |xz|=${s.maxAbsXZ} :: ${s.reason}`);
}
console.log(`\nwrote ${OUT} (${results.length} champion models)`);
