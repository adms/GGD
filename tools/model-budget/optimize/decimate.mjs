#!/usr/bin/env node
/**
 * decimate — the geometry worker, isolated from the workspace.
 *
 * It is a SEPARATE process on purpose: it imports @gltf-transform/* and
 * meshoptimizer, which are NOT workspace dependencies. They are installed under
 * tools/model-budget/.optvendor by optimize/bootstrap-geometry.sh, and this
 * directory's `node_modules` is a symlink to that vendor tree, so Node resolves
 * the bare specifiers here without any of it touching pnpm-lock.yaml. optimize.ts
 * only ever spawns this worker when those deps are present, so the main tool has
 * zero hard dependency on them.
 *
 * meshoptimizer's simplifier is SKIN-AWARE: it reduces the index/vertex buffers
 * and carries JOINTS_0 / WEIGHTS_0 through the collapse. It does not touch the
 * skeleton or the animation channels. optimize.ts re-checks rig survival on the
 * output and REJECTS anything where a joint, clip, channel or weight attribute
 * changed — this worker's job is only to produce the candidate.
 *
 *   node decimate.mjs <in.glb> <out.glb> <targetTris> [errorBound]
 *
 * Prints one JSON line: { ok, before:{tris}, after:{tris}, ratio, error }.
 */
import { NodeIO } from "@gltf-transform/core";
import { weld, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const [, , inFile, outFile, targetStr, errStr] = process.argv;
if (!inFile || !outFile || !targetStr) {
  console.error("usage: node decimate.mjs <in.glb> <out.glb> <targetTris> [errorBound]");
  process.exit(2);
}
const targetTris = Number(targetStr);
const errorBound = errStr !== undefined ? Number(errStr) : 0.02;

const io = new NodeIO();
const doc = await io.read(inFile);

const countTris = () =>
  doc
    .getRoot()
    .listMeshes()
    .reduce(
      (n, m) =>
        n +
        m.listPrimitives().reduce((a, p) => {
          const idx = p.getIndices();
          const mode = p.getMode();
          const elems = idx ? idx.getCount() : (p.getAttribute("POSITION")?.getCount() ?? 0);
          // 4 = TRIANGLES; 5/6 = STRIP/FAN
          if (mode === 4) return a + Math.floor(elems / 3);
          if (mode === 5 || mode === 6) return a + Math.max(0, elems - 2);
          return a;
        }, 0),
      0,
    );

const before = countTris();
// fraction of triangles to KEEP; meshopt respects the error bound and may keep
// more than this — that is desired (shape safety over hitting an exact number).
const ratio = Math.max(0.02, Math.min(1, targetTris / Math.max(1, before)));

await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: errorBound }),
);

await io.write(outFile, doc);
const after = countTris();
console.log(JSON.stringify({ ok: true, before: { tris: before }, after: { tris: after }, ratio, error: errorBound }));
