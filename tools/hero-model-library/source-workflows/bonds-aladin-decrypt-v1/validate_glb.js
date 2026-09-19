#!/usr/bin/env node
"use strict";

// Wrapper around KhronosGroup/glTF-Validator's official npm package.  The
// package is intentionally installed outside the repository and passed in as
// an exact module path so this workflow does not mutate project dependencies.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

async function main() {
  const [validatorModule, outputPath, ...files] = process.argv.slice(2);
  if (!validatorModule || !outputPath || files.length === 0) {
    throw new Error("usage: validate_glb.js validator/index.js receipt.json file.glb [...]");
  }
  const validator = require(path.resolve(validatorModule));
  const assets = [];
  let errors = 0;
  for (const filename of files) {
    const absolutePath = path.resolve(filename);
    const bytes = fs.readFileSync(absolutePath);
    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: path.basename(absolutePath),
      format: "glb",
      maxIssues: 0,
      writeTimestamp: false,
    });
    errors += report.issues.numErrors;
    assets.push({
      absolutePath,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      validatorReport: report,
    });
  }
  const receipt = {
    schema: "ggd.heros-bonds-khronos-gltf-validation@1",
    validatorPackage: "gltf-validator",
    validatorVersion: validator.version(),
    assets,
    summary: {
      assetCount: assets.length,
      errorCount: assets.reduce((sum, item) => sum + item.validatorReport.issues.numErrors, 0),
      warningCount: assets.reduce((sum, item) => sum + item.validatorReport.issues.numWarnings, 0),
      informationCount: assets.reduce(
        (sum, item) => sum + item.validatorReport.issues.numInfos,
        0,
      ),
      hintCount: assets.reduce((sum, item) => sum + item.validatorReport.issues.numHints, 0),
      passed: errors === 0,
    },
  };
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt.summary, null, 2));
  process.exitCode = errors === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
