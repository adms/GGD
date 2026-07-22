import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const prims = root.listMeshes().flatMap(m=>m.listPrimitives());
const count = () => root.listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>{const idx=p.getIndices();const el=idx?idx.getCount():(p.getAttribute("POSITION")?.getCount()??0);const mode=p.getMode();return a+(mode===4?Math.floor(el/3):0);},0),0);
console.log(JSON.stringify({ meshes: root.listMeshes().length, prims: prims.length, tris: count(), materials: root.listMaterials().length, verts: prims.reduce((a,p)=>a+(p.getAttribute("POSITION")?.getCount()??0),0) }));
const target=Number(process.argv[3]);
for (const err of [0.05, 0.1, 0.2, 0.4, 0.8]) {
  const d = await io.read(process.argv[2]);
  await MeshoptSimplifier.ready;
  const b = d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>{const idx=p.getIndices();const el=idx?idx.getCount():0;return a+Math.floor(el/3);},0),0);
  await d.transform(weld({tolerance:0}), simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.01,target/b), error: err }));
  const after = d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>{const idx=p.getIndices();const el=idx?idx.getCount():0;return a+Math.floor(el/3);},0),0);
  console.log(JSON.stringify({ err, before: b, after }));
}
