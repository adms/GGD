#!/usr/bin/env node
/** Deterministically reduce the animated Ryu GLB while preserving its rig and clips. */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const [, , input, output, targetText = "7900", errorText = "0.02"] = process.argv;
if (!input || !output) throw new Error("usage: decimate.mjs input.glb output.glb [targetTris] [errorBound]");
const target = Number(targetText);
const error = Number(errorText);
if (!Number.isInteger(target) || target < 1 || !Number.isFinite(error) || error < 0) {
  throw new Error("invalid target or error bound");
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const countTriangles = () => document.getRoot().listMeshes().reduce((total, mesh) =>
  total + mesh.listPrimitives().reduce((sum, primitive) => {
    const indices = primitive.getIndices();
    const elements = indices ? indices.getCount() : (primitive.getAttribute("POSITION")?.getCount() ?? 0);
    if (primitive.getMode() === 4) return sum + Math.floor(elements / 3);
    if (primitive.getMode() === 5 || primitive.getMode() === 6) return sum + Math.max(0, elements - 2);
    return sum;
  }, 0), 0);

const before = countTriangles();
const ratio = Math.max(0.02, Math.min(1, target / Math.max(1, before)));
await MeshoptSimplifier.ready;
await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
await io.write(output, document);
const after = countTriangles();
process.stdout.write(JSON.stringify({
  tool: "ggd.ssbu-ryu-procedural-decimation@1",
  beforeTriangles: before,
  afterTriangles: after,
  targetTriangles: target,
  ratio,
  errorBound: error,
  dependencyVersions: { gltfTransform: "4.2.1", meshoptimizer: "1.0.1" },
}) + "\n");
if (after > 8000) process.exitCode = 1;
