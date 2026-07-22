/**
 * MESH AUDIT (READ-ONLY) — GGD task #17
 *
 * For every imported champion GLB (+ KayKit champions for reference) load it
 * headless through Babylon NullEngine, apply NODE world transforms, and measure
 * in WORLD space:
 *   - overall bbox height (min/max Y over ALL mesh vertices)
 *   - body height (bbox of the mesh with the MOST vertices = largest solid mesh)
 *   - per-mesh: vert count, world Y-top, Y-bottom, Y-span, X/Z centroid+span,
 *     material name + emissive/alpha cues, animation-group count
 * Flags every mesh whose world Y-top sits far above the body top as a candidate
 * stray effect mesh, and applies a heuristic stray/legit/body classification.
 *
 * Writes MESH_AUDIT.json (raw) to the given out path. No files are modified.
 *
 * Usage: tsx mesh_audit.mts <importedDir> <championsDir> <outJson>
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import {
  NullEngine,
  Scene,
  SceneLoader,
  Vector3,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

const importedDir = process.argv[2];
const championsDir = process.argv[3];
const outJson = process.argv[4];
if (!importedDir || !outJson) {
  console.error("usage: tsx mesh_audit.mts <importedDir> <championsDir> <outJson>");
  process.exit(2);
}

interface MeshRec {
  name: string;
  verts: number;
  yTop: number;
  yBottom: number;
  ySpan: number;
  xCenter: number;
  zCenter: number;
  xSpan: number;
  zSpan: number;
  maxAbsXZ: number; // how far from the vertical axis the geometry reaches
  material: string | null;
  emissive: boolean;
  emissiveMag: number;
  alphaBlend: boolean;
  unlit: boolean;
  isBody: boolean;
  farAbove: boolean;
  classify: "body" | "stray" | "legit" | "minor";
  reason: string;
}

interface ModelRec {
  model: string;
  glb: string;
  ok: boolean;
  error?: string;
  totalVerts: number;
  bodyH: number;
  bodyTop: number;
  bodyBottom: number;
  fullH: number;
  fullTop: number;
  fullBottom: number;
  ratio: number;
  animGroups: number;
  meshes: MeshRec[];
}

function computeWorldRecursive(node: TransformNode) {
  node.computeWorldMatrix(true);
  for (const c of node.getChildren()) {
    if (c instanceof TransformNode) computeWorldRecursive(c);
  }
}

const engine = new NullEngine();

async function measure(glbPath: string, source: string): Promise<ModelRec> {
  const model = basename(glbPath, ".glb");
  const rec: ModelRec = {
    model: `${source}.${model}`,
    glb: glbPath,
    ok: false,
    totalVerts: 0,
    bodyH: 0,
    bodyTop: 0,
    bodyBottom: 0,
    fullH: 0,
    fullTop: 0,
    fullBottom: 0,
    ratio: 0,
    animGroups: 0,
    meshes: [],
  };
  const scene = new Scene(engine);
  try {
    const buf = readFileSync(glbPath);
    const b64 = buf.toString("base64");
    const container = await SceneLoader.LoadAssetContainerAsync(
      "",
      "data:base64," + b64,
      scene,
      undefined,
      ".glb",
    );
    container.addAllToScene();
    // force world matrices top-down from root transform nodes
    for (const rn of container.rootNodes) {
      if (rn instanceof TransformNode) computeWorldRecursive(rn);
    }
    rec.animGroups = container.animationGroups.length;

    let fullTop = -Infinity,
      fullBottom = Infinity,
      total = 0;
    const meshRecs: MeshRec[] = [];

    for (const mesh of container.meshes) {
      const positions = mesh.getVerticesData("position");
      if (!positions || positions.length === 0) continue;
      mesh.computeWorldMatrix(true);
      const wm = mesh.getWorldMatrix();
      let yTop = -Infinity,
        yBottom = Infinity,
        xMin = Infinity,
        xMax = -Infinity,
        zMin = Infinity,
        zMax = -Infinity;
      const tmp = new Vector3();
      const nVerts = positions.length / 3;
      for (let i = 0; i < positions.length; i += 3) {
        tmp.set(positions[i], positions[i + 1], positions[i + 2]);
        const w = Vector3.TransformCoordinates(tmp, wm);
        if (w.y > yTop) yTop = w.y;
        if (w.y < yBottom) yBottom = w.y;
        if (w.x < xMin) xMin = w.x;
        if (w.x > xMax) xMax = w.x;
        if (w.z < zMin) zMin = w.z;
        if (w.z > zMax) zMax = w.z;
      }
      total += nVerts;
      if (yTop > fullTop) fullTop = yTop;
      if (yBottom < fullBottom) fullBottom = yBottom;

      const mat: any = mesh.material;
      let material: string | null = null;
      let emissive = false;
      let emissiveMag = 0;
      let alphaBlend = false;
      let unlit = false;
      if (mat) {
        material = mat.name ?? null;
        const ec = mat.emissiveColor;
        if (ec) {
          emissiveMag = Math.max(ec.r ?? 0, ec.g ?? 0, ec.b ?? 0);
          emissive = emissiveMag > 0.02;
        }
        try {
          alphaBlend = typeof mat.needAlphaBlending === "function" ? mat.needAlphaBlending() : false;
        } catch {
          alphaBlend = false;
        }
        unlit = !!mat.unlit;
      }
      const xCenter = (xMin + xMax) / 2;
      const zCenter = (zMin + zMax) / 2;
      meshRecs.push({
        name: mesh.name,
        verts: nVerts,
        yTop: +yTop.toFixed(4),
        yBottom: +yBottom.toFixed(4),
        ySpan: +(yTop - yBottom).toFixed(4),
        xCenter: +xCenter.toFixed(4),
        zCenter: +zCenter.toFixed(4),
        xSpan: +(xMax - xMin).toFixed(4),
        zSpan: +(zMax - zMin).toFixed(4),
        maxAbsXZ: +Math.max(Math.abs(xMin), Math.abs(xMax), Math.abs(zMin), Math.abs(zMax)).toFixed(4),
        material,
        emissive,
        emissiveMag: +emissiveMag.toFixed(3),
        alphaBlend,
        unlit,
        isBody: false,
        farAbove: false,
        classify: "body",
        reason: "",
      });
    }

    if (meshRecs.length === 0) throw new Error("no geometry meshes");

    // body = mesh with most verts
    let bodyIdx = 0;
    for (let i = 1; i < meshRecs.length; i++) {
      if (meshRecs[i].verts > meshRecs[bodyIdx].verts) bodyIdx = i;
    }
    const body = meshRecs[bodyIdx];
    body.isBody = true;
    const bodyTop = body.yTop;
    const bodyBottom = body.yBottom;
    const bodyH = bodyTop - bodyBottom;

    // classify
    for (const m of meshRecs) {
      if (m.isBody) {
        m.classify = "body";
        m.reason = "largest solid mesh (most verts)";
        continue;
      }
      const aboveBy = m.yTop - bodyTop;
      // "far above" if the mesh top exceeds body top by > 25% of body height,
      // OR reaches more than 1.5x the body top height in absolute terms.
      const farAbove = aboveBy > 0.25 * bodyH || m.yTop > bodyTop + 0.5;
      m.farAbove = farAbove;
      if (!farAbove) {
        m.classify = "body";
        m.reason = "within body silhouette";
        continue;
      }
      // heuristic stray vs legit
      const lowVert = m.verts <= 64;
      const veryLowVert = m.verts <= 16;
      const tall = m.ySpan > 0.8 * bodyH; // beam-like extends most of body height or more
      const towering = m.yTop > 2.0 * bodyTop; // reaches way above head
      const detached = m.yBottom > bodyTop; // floats entirely above the body
      const wideOffAxis = m.maxAbsXZ > 1.5 * (bodyH); // reaches far sideways
      const effectMat = m.emissive || m.alphaBlend;
      let stray = false;
      const cues: string[] = [];
      if (veryLowVert && (tall || towering || m.yTop > bodyTop + 0.5)) {
        stray = true;
        cues.push(`${m.verts}v quad/beam`);
      }
      if (towering) {
        stray = true;
        cues.push(`yTop ${m.yTop} >> bodyTop ${bodyTop.toFixed(2)}`);
      }
      if (detached) {
        stray = true;
        cues.push("floats above body");
      }
      if (wideOffAxis) {
        stray = true;
        cues.push(`reaches |xz| ${m.maxAbsXZ}`);
      }
      if (lowVert && effectMat && aboveBy > 0.4 * bodyH) {
        stray = true;
        cues.push(`lowvert+${m.emissive ? "emissive" : "alpha"}`);
      }
      if (stray) {
        m.classify = "stray";
        m.reason = cues.join("; ");
      } else {
        // above body but plausibly a weapon/wing held aloft -> legit candidate, judge later
        m.classify = "legit";
        m.reason = `above body by ${aboveBy.toFixed(2)} (${m.verts}v${effectMat ? ", effectmat" : ""}) — judge`;
      }
    }

    rec.ok = true;
    rec.totalVerts = total;
    rec.bodyH = +bodyH.toFixed(4);
    rec.bodyTop = +bodyTop.toFixed(4);
    rec.bodyBottom = +bodyBottom.toFixed(4);
    rec.fullTop = +fullTop.toFixed(4);
    rec.fullBottom = +fullBottom.toFixed(4);
    rec.fullH = +(fullTop - fullBottom).toFixed(4);
    rec.ratio = +((fullTop - fullBottom) / (bodyH || 1)).toFixed(3);
    rec.meshes = meshRecs.sort((a, b) => b.yTop - a.yTop);
  } catch (e) {
    rec.error = String(e);
  } finally {
    scene.dispose();
  }
  return rec;
}

const results: ModelRec[] = [];

const importedFiles = readdirSync(importedDir)
  .filter((f) => f.endsWith(".glb"))
  .sort();
for (const f of importedFiles) {
  results.push(await measure(join(importedDir, f), "imported"));
}
if (championsDir) {
  let champFiles: string[] = [];
  try {
    champFiles = readdirSync(championsDir).filter((f) => f.endsWith(".glb")).sort();
  } catch {}
  for (const f of champFiles) {
    results.push(await measure(join(championsDir, f), "champ"));
  }
}

engine.dispose();

mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(results, null, 2));

// terse console summary
for (const r of results) {
  if (!r.ok) {
    console.log(`FAIL ${r.model}: ${r.error}`);
    continue;
  }
  const strays = r.meshes.filter((m) => m.classify === "stray");
  const legits = r.meshes.filter((m) => m.classify === "legit");
  const flag = r.ratio >= 1.4 || strays.length ? "***" : "   ";
  console.log(
    `${flag} ${r.model.padEnd(28)} bodyH=${r.bodyH.toFixed(2).padStart(6)} fullH=${r.fullH.toFixed(2).padStart(7)} ratio=${r.ratio.toFixed(2).padStart(6)} anim=${r.animGroups} stray=${strays.length} legit=${legits.length}`,
  );
  for (const m of strays)
    console.log(`      STRAY  ${m.name} v=${m.verts} yTop=${m.yTop} ySpan=${m.ySpan} |xz|=${m.maxAbsXZ} :: ${m.reason}`);
  for (const m of legits)
    console.log(`      legit? ${m.name} v=${m.verts} yTop=${m.yTop} ySpan=${m.ySpan} |xz|=${m.maxAbsXZ} :: ${m.reason}`);
}
console.log(`\nwrote ${outJson} (${results.length} models)`);
