import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tris = (d)=>d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+Math.floor((p.getIndices()?.getCount()??0)/3),0),0);
const verts = (d)=>d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getAttribute("POSITION")?.getCount()??0),0),0);
const file=process.argv[2], target=Number(process.argv[3]);
for (const tol of [0, 0.00001, 0.0001, 0.001]) {
  const d = await io.read(file);
  const v0=verts(d);
  await MeshoptSimplifier.ready;
  await d.transform(weld({ tolerance: tol }));
  const v1=verts(d), t0=tris(d);
  await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.01,target/t0), error: 0.1 }));
  console.log(JSON.stringify({ tol, vertsBefore:v0, vertsAfterWeld:v1, trisAfterWeld:t0, trisAfterSimplify: tris(d) }));
}
