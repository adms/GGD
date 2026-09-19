#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const repo = resolve(import.meta.dirname, "../../../..");
const requireFromShared = createRequire(join(repo, "packages/shared/package.json"));
const validator = requireFromShared("gltf-validator");
const marker = process.argv.indexOf("--workspace");
if (marker < 0 || !process.argv[marker + 1]) throw new Error("--workspace is required");
const workspace = resolve(process.argv[marker + 1]);
const root = join(workspace, "GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1");
const manifest = JSON.parse(readFileSync(join(root, "conversion-manifest.json"), "utf8"));
const results = [];
for (const candidate of manifest.candidates) {
  const file = candidate.glb.absolutePath;
  const bytes = new Uint8Array(readFileSync(file));
  const report = await validator.validateBytes(bytes, {
    uri: file,
    maxIssues: 0,
    writeTimestamp: false,
    externalResourceFunction: async () => { throw new Error("external GLB resource rejected"); },
  });
  results.push({
    candidateId: candidate.candidateId,
    path: file,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    issues: report.issues,
  });
  if (report.issues.numErrors || report.issues.truncated) process.exitCode = 1;
}
const receipt = {
  schema: "ggd.vearn-static-review-khronos-validation@1",
  validator: "gltf-validator@2.0.0-dev.3.10",
  sourceManifestSha256: createHash("sha256").update(readFileSync(join(root, "conversion-manifest.json"))).digest("hex"),
  candidateCount: results.length,
  zeroErrorCount: results.filter((row) => row.issues.numErrors === 0 && !row.issues.truncated).length,
  results,
  scope: "Static identity-review derivatives only; no skin, motion, backend registration, or deployment claim.",
};
writeFileSync(join(root, "khronos-validation.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ candidateCount: receipt.candidateCount, zeroErrorCount: receipt.zeroErrorCount }));
