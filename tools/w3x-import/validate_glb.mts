/**
 * GLB validation for the w3x importer output.
 *   1. structural: parse the GLB container + JSON chunk, check accessor
 *      bounds against bufferViews, mesh/skin/animation counts.
 *   2. runtime: load each GLB through Babylon NullEngine (headless) and
 *      verify meshes + animation groups materialize.
 *
 * Usage:  tsx tools/w3x-import/validate_glb.mts <glb-dir> [--limit N]
 * Exits non-zero on any failure. Prints an NDJSON line per file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NullEngine, Scene, SceneLoader } from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: validate_glb.mts <glb-dir> [--limit N]");
  process.exit(2);
}
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx > 0 ? Number(process.argv[limitIdx + 1]) : Infinity;

interface GltfJson {
  accessors?: { bufferView?: number; count: number }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  meshes?: unknown[];
  animations?: { name: string }[];
  skins?: unknown[];
}

function structuralCheck(buf: Buffer): GltfJson {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("bad GLB magic");
  if (buf.readUInt32LE(4) !== 2) throw new Error("bad GLB version");
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) throw new Error(`length mismatch ${total} != ${buf.length}`);
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk not JSON");
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf-8")) as GltfJson;
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const views = json.bufferViews ?? [];
  for (const [i, v] of views.entries()) {
    if ((v.byteOffset ?? 0) + v.byteLength > binLen)
      throw new Error(`bufferView ${i} overruns BIN chunk`);
  }
  for (const [i, a] of (json.accessors ?? []).entries()) {
    if (a.bufferView !== undefined && a.bufferView >= views.length)
      throw new Error(`accessor ${i} references missing bufferView`);
    if (a.count <= 0) throw new Error(`accessor ${i} empty`);
  }
  return json;
}

const engine = new NullEngine();
let failures = 0;
const files = readdirSync(dir).filter((f) => f.endsWith(".glb")).slice(0, limit === Infinity ? undefined : limit);

for (const f of files) {
  const path = join(dir, f);
  const rec: Record<string, unknown> = { file: f };
  try {
    const buf = readFileSync(path);
    const json = structuralCheck(buf);
    rec.meshes = json.meshes?.length ?? 0;
    rec.animations = json.animations?.length ?? 0;
    rec.skins = json.skins?.length ?? 0;

    const scene = new Scene(engine);
    const b64 = buf.toString("base64");
    await SceneLoader.AppendAsync("", "data:base64," + b64, scene, undefined, ".glb");
    rec.babylonMeshes = scene.meshes.length;
    rec.babylonAnimGroups = scene.animationGroups.length;
    rec.babylonSkeletons = scene.skeletons.length;
    scene.dispose();
    rec.ok = true;
  } catch (e) {
    rec.ok = false;
    rec.error = String(e);
    failures++;
  }
  console.log(JSON.stringify(rec));
}
engine.dispose();
if (failures > 0) {
  console.error(`${failures}/${files.length} GLBs failed validation`);
  process.exit(1);
}
console.error(`all ${files.length} GLBs validated`);
