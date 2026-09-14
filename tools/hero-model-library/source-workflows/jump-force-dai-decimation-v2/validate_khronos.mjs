#!/usr/bin/env node
/** Run the pinned Khronos validator without changing the candidate. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [candidateArg, repoArg = "."] = process.argv.slice(2);
if (!candidateArg) throw new Error("usage: validate_khronos.mjs candidate.glb [repo]");
const candidate = resolve(candidateArg);
const repo = resolve(repoArg);
const require = createRequire(resolve(repo, "packages/shared/package.json"));
const validator = require("gltf-validator");
const result = await validator.validateBytes(new Uint8Array(readFileSync(candidate)), {
  uri: candidate,
  maxIssues: 0,
  writeTimestamp: false,
  externalResourceFunction: async () => { throw new Error("external resources prohibited"); },
});
const issueCodeCounts = Object.fromEntries(
  [...new Set(result.issues.messages.map((issue) => issue.code))]
    .sort()
    .map((code) => [code, result.issues.messages.filter((issue) => issue.code === code).length]),
);
console.log(JSON.stringify({
  validator: "gltf-validator@2.0.0-dev.3.10",
  errors: result.issues.numErrors,
  warnings: result.issues.numWarnings,
  infos: result.issues.numInfos,
  hints: result.issues.numHints,
  truncated: result.issues.truncated,
  issueCodeCounts,
}));
