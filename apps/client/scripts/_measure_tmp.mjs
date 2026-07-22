import { NullEngine, Scene, SceneLoader } from "@babylonjs/core/index.js";
import "@babylonjs/loaders/glTF/index.js";
import { readFileSync } from "node:fs";
const files = process.argv.slice(2);
for (const rel of files) {
  const buf = readFileSync(rel);
  const data = "data:base64," + buf.toString("base64");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const res = await SceneLoader.ImportMeshAsync("", "", data, scene, undefined, ".glb");
  let tris = 0, verts = 0;
  let bmin=[1e9,1e9,1e9], bmax=[-1e9,-1e9,-1e9];       // bind (world matrix, no skeleton)
  let smin=[1e9,1e9,1e9], smax=[-1e9,-1e9,-1e9];       // skinned (applySkeleton)
  for (const m of res.meshes) {
    if (!m.getTotalVertices || m.getTotalVertices()===0) continue;
    const idx = m.getIndices(); if (idx) tris += idx.length/3;
    verts += m.getTotalVertices();
    m.computeWorldMatrix(true);
    // bind bbox
    m.refreshBoundingInfo({applySkeleton:false});
    let bb = m.getBoundingInfo().boundingBox;
    for (let k=0;k<3;k++){ bmin[k]=Math.min(bmin[k],bb.minimumWorld.asArray()[k]); bmax[k]=Math.max(bmax[k],bb.maximumWorld.asArray()[k]); }
    // skinned bbox
    try { m.refreshBoundingInfo({applySkeleton:true}); } catch(e){}
    bb = m.getBoundingInfo().boundingBox;
    for (let k=0;k<3;k++){ smin[k]=Math.min(smin[k],bb.minimumWorld.asArray()[k]); smax[k]=Math.max(smax[k],bb.maximumWorld.asArray()[k]); }
  }
  console.log(`\n${rel}`);
  console.log(`  tris ${tris}  verts ${verts}  meshes ${res.meshes.filter(m=>m.getTotalVertices&&m.getTotalVertices()>0).length}  skeletons ${res.skeletons.length}`);
  console.log(`  BIND    bbox  ${(bmax[0]-bmin[0]).toFixed(4)} x ${(bmax[1]-bmin[1]).toFixed(4)} y ${(bmax[2]-bmin[2]).toFixed(4)} z   (yMin ${bmin[1].toFixed(3)} yMax ${bmax[1].toFixed(3)})`);
  console.log(`  SKINNED bbox  ${(smax[0]-smin[0]).toFixed(4)} x ${(smax[1]-smin[1]).toFixed(4)} y ${(smax[2]-smin[2]).toFixed(4)} z   (yMin ${smin[1].toFixed(3)} yMax ${smax[1].toFixed(3)})`);
  engine.dispose?.();
}
process.exit(0);
