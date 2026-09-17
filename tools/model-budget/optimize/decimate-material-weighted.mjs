#!/usr/bin/env node
/** Decimate a skinned GLB with explicit per-material triangle allocation. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";

const [, , input, output, ...argv] = process.argv;
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
if (!input || !output) throw new Error("usage: decimate-material-weighted.mjs input.glb output.glb --material-targets JSON [--error N]");
const targets = JSON.parse(option("--material-targets", "{}"));
const errorBound = Number(option("--error", "0.02"));
const materialErrors = JSON.parse(option("--material-errors", "{}"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
await MeshoptSimplifier.ready;
const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
const records = [];
function preservationAttributes(primitive, count) {
  const sources = [
    {semantic: "NORMAL", accessor: primitive.getAttribute("NORMAL"), weight: 0.25, normalize: 1},
    {semantic: "TEXCOORD_0", accessor: primitive.getAttribute("TEXCOORD_0"), weight: 0.5, normalize: 1},
    {semantic: "WEIGHTS_0", accessor: primitive.getAttribute("WEIGHTS_0"), weight: 2, normalize: 1},
    {semantic: "JOINTS_0", accessor: primitive.getAttribute("JOINTS_0"), weight: 4, normalize: null},
  ].filter((row) => row.accessor);
  const widths = sources.map((row) => row.accessor.getElementSize());
  const stride = widths.reduce((sum, width) => sum + width, 0);
  const attributes = new Float32Array(count * stride);
  const weights = [];
  let channel = 0;
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const source = sources[sourceIndex];
    const width = widths[sourceIndex];
    const values = source.accessor.getArray();
    const scale = source.normalize ?? Math.max(1, ...values);
    for (let vertex = 0; vertex < count; vertex++) {
      for (let component = 0; component < width; component++) {
        attributes[vertex * stride + channel + component] = values[vertex * width + component] / scale;
      }
    }
    for (let component = 0; component < width; component++) weights.push(source.weight);
    channel += width;
  }
  return {attributes, stride, weights, semantics: sources.map((row) => row.semantic)};
}
for (const [primitiveIndex, primitive] of primitives.entries()) {
  if (primitive.getMode() !== 4) throw new Error(`primitive ${primitiveIndex}: only TRIANGLES mode is supported`);
  const material = primitive.getMaterial()?.getName() ?? "";
  const target = targets[material];
  if (!Number.isFinite(target) || target < 1) throw new Error(`missing positive triangle target for material ${material || primitiveIndex}`);
  const positions = primitive.getAttribute("POSITION").getArray();
  if (!(positions instanceof Float32Array)) throw new Error(`primitive ${primitiveIndex}: POSITION must be Float32Array`);
  const indicesAccessor = primitive.getIndices();
  const indices = indicesAccessor.getArray();
  const desired = Math.min(indices.length, Math.floor(target) * 3);
  const primitiveError = Number(materialErrors[material] ?? errorBound);
  const preservation = preservationAttributes(primitive, positions.length / 3);
  const [reduced, measuredError] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, preservation.attributes, preservation.stride, preservation.weights,
    new Uint8Array(positions.length / 3), desired, primitiveError, ["LockBorder"],
  );
  indicesAccessor.setArray(reduced);
  records.push({primitiveIndex, material, trianglesBefore: indices.length / 3, trianglesAfter: reduced.length / 3, target,
    errorBound: primitiveError, preservationSemantics: preservation.semantics, measuredError});
}
await io.write(output, document);
const trianglesBefore = records.reduce((sum, row) => sum + row.trianglesBefore, 0);
const trianglesAfter = records.reduce((sum, row) => sum + row.trianglesAfter, 0);
console.log(JSON.stringify({tool: "model-budget/decimate-material-weighted@1", input, output,
  parameters: {materialTargets: targets, errorBound, materialErrors, lockBorder: true}, trianglesBefore, trianglesAfter, records}));
if (trianglesAfter > 8000) process.exit(1);
