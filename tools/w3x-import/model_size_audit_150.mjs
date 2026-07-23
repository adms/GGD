/**
 * MODEL SIZE AUDIT — GGD task #150 (READ-ONLY)
 *
 * Task #61 checked each model against the 2.5u ceiling but never checked that
 * champions read CONSISTENTLY relative to each other. This tool measures, PER
 * CHAMPION (so the 40 stand-ins sharing the 4 CC0 meshes are each listed), the
 * on-screen HEIGHT the client actually renders, via the EXACT ChampionView load
 * path — Babylon NullEngine, `instantiateModelsToScene` + the same
 * `getHierarchyBoundingVectors` grounding measure — so the number here is the
 * very quantity `ChampionView`'s height-normalization divides by.
 *
 * For every champion it reports:
 *   nativeH        full-silhouette height of the glb at scale 1 (what the player
 *                  sees, minus scale) — the normalization basis
 *   curScale       the model doc's current `scale` (pre-#150 absolute render scale)
 *   curRendered    nativeH * curScale — what renders TODAY (the inconsistent spread)
 *   relMult        the #150 per-champion RELATIVE multiplier (content/models/
 *                  _standin-overrides.json → `relativeScale`; default 1.0)
 *   normRendered   TARGET_HEIGHT * relMult — what renders AFTER #150 normalization
 *
 * Emits docs/_model-size-audit-150.data.json (machine); the .md report is written
 * by gen_model_size_audit_150.mjs. No content/render files are modified.
 *
 * Usage:  node_modules/.bin/tsx tools/w3x-import/model_size_audit_150.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NullEngine, Scene, SceneLoader, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

const REPO = "/Users/Takuro/GGD";
const MODELS_DIR = join(REPO, "content/models");
const CHAMPS_DIR = join(REPO, "content/champions");
const CONTENT = join(REPO, "content");
const OUT = join(REPO, "docs/_model-size-audit-150.data.json");

// Must mirror ChampionView.TARGET_HEIGHT / the normalization guards (task #150).
const TARGET_HEIGHT = 1.8;
const MIN_NATIVE_HEIGHT = 0.01;

// ---- champions ------------------------------------------------------------
const champions = [];
for (const f of readdirSync(CHAMPS_DIR)) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  let d;
  try { d = JSON.parse(readFileSync(join(CHAMPS_DIR, f), "utf8")); } catch { continue; }
  if (d.schema !== "champion@1") continue;
  champions.push({ id: d.id, name: d.name ?? d.id, modelKey: d.modelKey });
}

// ---- per-champion RELATIVE size overrides (task #150) ---------------------
let overrides = {};
try {
  const raw = JSON.parse(readFileSync(join(MODELS_DIR, "_standin-overrides.json"), "utf8"));
  overrides = raw.overrides ?? {};
} catch { /* none */ }
const relMultOf = (championId) => {
  const o = overrides[championId];
  const r = o?.relativeScale;
  return typeof r === "number" && r > 0 ? r : 1;
};

// model docs are `<modelKey>.json`
const docCache = new Map();
function loadModelDoc(modelKey) {
  if (docCache.has(modelKey)) return docCache.get(modelKey);
  let doc = null;
  try { doc = JSON.parse(readFileSync(join(MODELS_DIR, `${modelKey}.json`), "utf8")); } catch { /* none */ }
  docCache.set(modelKey, doc);
  return doc;
}

// ---- headless native-height measurement (ChampionView's exact path) -------
const engine = new NullEngine();
const heightCache = new Map(); // modelKey -> { nativeH, empty }

async function measureNativeHeight(doc) {
  if (heightCache.has(doc.id)) return heightCache.get(doc.id);
  const scene = new Scene(engine);
  let out = { nativeH: NaN, empty: false, error: null };
  try {
    const abs = join(CONTENT, doc.glbPath);
    const buf = readFileSync(abs);
    const container = await SceneLoader.LoadAssetContainerAsync(
      "", "data:base64," + buf.toString("base64"), scene, undefined, ".glb");
    // Mirror ChampionView.tryUpgradeToGlb: instantiate, parent under a root at
    // scaling 1, then read the SAME hierarchy bounding vectors grounding uses.
    const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    const glbRoot = new TransformNode("measure-root", scene);
    glbRoot.scaling.setAll(1);
    for (const node of inst.rootNodes) node.parent = glbRoot;
    const meshes = glbRoot.getChildMeshes(false);
    if (meshes.length === 0) {
      out.empty = true; // geometry-less dummy (imported.collision) → procedural fallback
    } else {
      glbRoot.computeWorldMatrix(true);
      const { min, max } = glbRoot.getHierarchyBoundingVectors(true);
      out.nativeH = max.y - min.y;
      // a geometry-less rig (collision) can clone meshes with no renderable
      // vertices → degenerate (±Infinity) bbox: same procedural-fallback case.
      if (!Number.isFinite(out.nativeH)) { out.empty = true; out.nativeH = NaN; }
    }
  } catch (e) {
    out.error = String(e);
  }
  scene.dispose();
  heightCache.set(doc.id, out);
  return out;
}

function normScale(nativeH) {
  if (!Number.isFinite(nativeH) || nativeH <= MIN_NATIVE_HEIGHT) return null;
  return TARGET_HEIGHT / nativeH;
}

// ---- audit every champion -------------------------------------------------
const rows = [];
for (const c of champions) {
  const doc = loadModelDoc(c.modelKey);
  const rec = { ...c };
  if (!doc) { rec.error = "no model doc"; rows.push(rec); continue; }
  rec.glbPath = doc.glbPath;
  rec.curScale = doc.scale;
  const m = await measureNativeHeight(doc);
  if (m.error) { rec.error = m.error; rows.push(rec); continue; }
  if (m.empty) { rec.empty = true; rec.note = "empty-glb → procedural fallback (exempt)"; rows.push(rec); continue; }
  const relMult = relMultOf(c.id);
  const ns = normScale(m.nativeH);
  rec.nativeH = +m.nativeH.toFixed(4);
  rec.curRendered = +(m.nativeH * doc.scale).toFixed(4);
  rec.relMult = relMult;
  rec.normScale = ns == null ? null : +ns.toFixed(4);
  rec.normRendered = ns == null ? null : +(TARGET_HEIGHT * relMult).toFixed(4);
  rows.push(rec);
}
engine.dispose();

writeFileSync(OUT, JSON.stringify({ target: TARGET_HEIGHT, rows }, null, 2));

// ---- spread stats + terse table ------------------------------------------
const sized = rows.filter((r) => typeof r.curRendered === "number" && Number.isFinite(r.curRendered));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN;
};
const curs = sized.map((r) => r.curRendered);
const medCur = median(curs);
const spread = (xs) => `${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)} (${(Math.max(...xs) / Math.min(...xs)).toFixed(2)}× spread)`;

sized.sort((a, b) => a.curRendered - b.curRendered);
console.log(`\n#150 champion rendered-height audit — TARGET ${TARGET_HEIGHT}u, ${sized.length} champions\n`);
console.log(`${"championId".padEnd(13)} ${"nativeH".padStart(7)} ${"curScl".padStart(6)} ${"curRnd".padStart(7)} ${"rel".padStart(4)} ${"normRnd".padStart(7)}  flag  name`);
for (const r of sized) {
  const flag = r.curRendered < 0.7 * medCur ? "SMALL" : r.curRendered > 1.4 * medCur ? "BIG  " : "     ";
  console.log(
    `${r.id.padEnd(13)} ${r.nativeH.toFixed(2).padStart(7)} ${String(r.curScale).padStart(6)} ${r.curRendered.toFixed(2).padStart(7)} ${String(r.relMult).padStart(4)} ${String(r.normRendered).padStart(7)}  ${flag} ${r.name}`);
}
console.log(`\nBEFORE  rendered-height spread: ${spread(curs)}  median ${medCur.toFixed(2)}`);
const dflt = sized.filter((r) => r.relMult === 1).map((r) => r.normRendered);
const exc = sized.filter((r) => r.relMult !== 1);
console.log(`AFTER   default population (${dflt.length}): ${spread(dflt)}  → every non-exception champion reads the same size`);
console.log(`AFTER   intentional exceptions (${exc.length}):`);
for (const r of exc.sort((a, b) => a.normRendered - b.normRendered)) {
  console.log(`          ${r.id.padEnd(13)} rel ${String(r.relMult).padStart(4)} → ${r.normRendered.toFixed(2)}u   ${r.name}`);
}
const empty = rows.filter((r) => r.empty).map((r) => r.id);
const errs = rows.filter((r) => r.error);
if (empty.length) console.log(`exempt (empty-glb): ${empty.join(", ")}`);
for (const e of errs) console.log(`ERROR ${e.id} (${e.modelKey}): ${e.error}`);
console.log(`\nwrote ${OUT} (${rows.length} champions)`);
