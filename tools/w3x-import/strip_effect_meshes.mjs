/**
 * Task #17 — surgically remove stray effect PRIMITIVES from a champion .glb.
 *
 * For the 6 models whose BODY was already correctly scaled (heromiku, ma,
 * picacugy, renaryugu2, cloud, herosaber) we do NOT re-bake — we delete only
 * the flagged effect primitives (which map 1:1 to the MDX geosets the importer
 * guard, w3xlib.gltf.classify_geosets, drops) and prune orphaned resources.
 * Body geometry, skinning, animations and attach points are untouched.
 *
 * mesh_primitiveN == the Nth primitive of the single mesh == geoset N.
 *
 * Requires @gltf-transform/core + functions (installed in the scratchpad gt/).
 * Usage: node strip_effect_meshes.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { prune, dedup } from "@gltf-transform/functions";

const GLB_DIR = "/Users/Takuro/GGD/content/assets/models/imported";

// model file -> primitive indices to remove (geoset order, from the guard)
const JOBS = {
  "heromiku.glb": [3, 4, 5], // Tornado wing-beams (visible) + team-glow ground
  "ma.glb": [1], // additive quad floating above the head
  "picacugy.glb": [6, 7], // team-glow ground + LightningBall billboard
  "renaryugu2.glb": [2, 4], // team-glow ground ring + team-glow weapon beam
  "cloud.glb": [4], // team-glow sword-slash quad (Buster Sword stays, it's opaque)
  "herosaber.glb": [4], // team-glow sword-glow quad (Excalibur stays, it's in the body)
};

const io = new NodeIO();

for (const [file, dropIdx] of Object.entries(JOBS)) {
  const path = `${GLB_DIR}/${file}`;
  const before = statSync(path).size;
  const doc = await io.read(path);
  const meshes = doc.getRoot().listMeshes();
  if (meshes.length !== 1) {
    console.log(`!! ${file}: expected 1 mesh, found ${meshes.length} — skipping`);
    continue;
  }
  const mesh = meshes[0];
  const prims = mesh.listPrimitives();
  const drop = new Set(dropIdx);
  const removed = [];
  prims.forEach((prim, i) => {
    if (drop.has(i)) {
      const nVerts = prim.getAttribute("POSITION")?.getCount() ?? 0;
      const mat = prim.getMaterial()?.getName() ?? "?";
      removed.push(`#${i}(${nVerts}v,${mat})`);
      mesh.removePrimitive(prim);
      prim.dispose();
    }
  });
  await doc.transform(dedup(), prune());
  await io.write(path, doc);
  const after = statSync(path).size;
  const kept = mesh.listPrimitives().length;
  console.log(
    `== ${file}: removed ${removed.join(", ")} | prims ${prims.length} -> ${kept} | ${before} -> ${after} bytes`,
  );
}
console.log("strip complete");
