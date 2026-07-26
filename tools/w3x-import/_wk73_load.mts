import { NullEngine, Scene, SceneLoader } from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

const engine = new NullEngine();
for (const path of process.argv.slice(2)) {
  const scene = new Scene(engine);
  const buf = readFileSync(path);
  const blobUrl = "data:base64," + buf.toString("base64");
  const res = await SceneLoader.ImportMeshAsync("", "", blobUrl, scene, undefined, ".glb");
  console.log(`### ${basename(path)}`);
  console.log(`  meshes=${res.meshes.length} skeletons=${res.skeletons.length} animGroups=${res.animationGroups.length}`);
  for (const m of res.meshes) {
    const g: any = m as any;
    const verts = g.getTotalVertices ? g.getTotalVertices() : 0;
    const idx = g.getTotalIndices ? g.getTotalIndices() : 0;
    let bb = "-";
    if (verts > 0) {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo?.({ applySkeleton: false } as any);
      const bi = m.getBoundingInfo();
      const mn = bi.boundingBox.minimumWorld, mx = bi.boundingBox.maximumWorld;
      bb = `min(${mn.x.toFixed(3)},${mn.y.toFixed(3)},${mn.z.toFixed(3)}) max(${mx.x.toFixed(3)},${mx.y.toFixed(3)},${mx.z.toFixed(3)})`;
    }
    const mat: any = m.material;
    console.log(`   mesh "${m.name}" verts=${verts} tris=${idx/3} visible=${m.isVisible} enabled=${m.isEnabled()} vis=${(m as any).visibility} scaling=(${m.scaling.x},${m.scaling.y},${m.scaling.z}) pos=(${m.position.x.toFixed(3)},${m.position.y.toFixed(3)},${m.position.z.toFixed(3)})`);
    console.log(`        material=${mat?.name ?? "none"} alpha=${mat?.alpha} transparencyMode=${mat?.transparencyMode} backFaceCulling=${mat?.backFaceCulling} needAlphaBlending=${mat?.needAlphaBlending?.()} bbox=${bb}`);
  }
  console.log(`  animationGroups: ${res.animationGroups.map(a=>a.name).join(", ")}`);
  console.log(`  skeleton bones: ${res.skeletons[0]?.bones.map(b=>b.name).join(", ") ?? "-"}`);
  console.log();
  scene.dispose();
}
engine.dispose();
