/** Inspect actual skinned motion without treating a NullEngine run as visual approval. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error("Usage: node tools/community-hero-forge/inspect-library-motion.mjs <finalized-directory> <new-proof.json>");
const root = resolve(directory);
const receipt = JSON.parse(readFileSync(join(root, "receipt.json"), "utf8"));
assert.equal(receipt.schema, "ggd-library-body-ready@1");
const bytes = readFileSync(join(root, "body.glb"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.model.sha256);
const model = JSON.parse(readFileSync(join(root, "model.json"), "utf8"));
assert.deepEqual(model, receipt.document);

// Resolve the game's installed Babylon version, without adding a second runtime.
const client = createRequire(new URL("../../apps/client/package.json", import.meta.url));
const moduleOf = (name) => import(pathToFileURL(client.resolve(name)).href);
const [{ NullEngine }, { Scene }, { LoadAssetContainerAsync }, { TransformNode }] = await Promise.all([
  moduleOf("@babylonjs/core/Engines/nullEngine.js"), moduleOf("@babylonjs/core/scene.js"),
  moduleOf("@babylonjs/core/Loading/sceneLoader.js"), moduleOf("@babylonjs/core/Meshes/transformNode.js"),
]);
await moduleOf("@babylonjs/loaders/glTF/index.js");
const engine = new NullEngine(), scene = new Scene(engine);
try {
  const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene, {
    pluginExtension: ".glb", pluginOptions: { gltf: { skipMaterials: true, animationStartMode: 0 } },
  });
  const instance = container.instantiateModelsToScene((name) => `motion-proof-${name}`, false, { doNotInstantiate: true });
  const display = new TransformNode("motion-proof-root", scene);
  for (const node of instance.rootNodes) node.parent = display;
  const meshes = display.getChildMeshes().filter((mesh) => mesh.getTotalVertices() > 0);
  assert.ok(meshes.length > 0 && instance.skeletons.length > 0, "Expected a visible model with its original rig");
  const pose = () => {
    for (const node of display.getDescendants()) if (node.computeWorldMatrix) node.computeWorldMatrix(true);
    for (const skeleton of instance.skeletons) skeleton.prepare(true);
    return meshes.flatMap((mesh) => Array.from(mesh.getPositionData(true, false)));
  };
  const rows = [];
  for (const [state, name] of Object.entries(model.clipMap)) {
    for (const other of instance.animationGroups) other.stop();
    const index = container.animationGroups.findIndex((group) => group.name === name);
    assert.ok(index >= 0, `Missing mapped clip: ${name}`);
    const clip = instance.animationGroups[index];
    clip.start(false); clip.pause(); clip.goToFrame(clip.from);
    const start = pose();
    clip.goToFrame(clip.from + (clip.to - clip.from) * 0.6);
    const middle = pose();
    assert.ok(middle.every(Number.isFinite), "Skinning produced invalid positions");
    assert.equal(start.length, middle.length);
    let changedVertices = 0, maxDelta = 0;
    for (let i = 0; i < start.length; i += 3) {
      const delta = Math.hypot(middle[i] - start[i], middle[i + 1] - start[i + 1], middle[i + 2] - start[i + 2]);
      if (delta > 1e-5) changedVertices++;
      maxDelta = Math.max(maxDelta, delta);
    }
    rows.push({ state, clip: name, changedVertices, maxDelta, vertices: middle.length / 3 });
  }
  // Still poses can be legitimate clips; preserve that finding instead of inventing motion.
  const proof = {
    schema: "ggd-library-motion-inspection@1", modelSha256: receipt.model.sha256,
    sourceModel: model, method: "Babylon NullEngine CPU skinning at first and 60% frame; sequential states; materials skipped",
    bones: instance.skeletons.map((skeleton) => skeleton.bones.length), rows,
    stationaryClips: rows.filter((row) => row.changedVertices === 0).map((row) => row.clip),
    visualAcceptance: "pending", textureAcceptance: "pending",
  };
  writeFileSync(resolve(output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output: resolve(output), bones: proof.bones, clips: rows.length, stationaryClips: proof.stationaryClips, visualAcceptance: "pending" }));
} finally { scene.dispose(); engine.dispose(); }
