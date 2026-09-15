import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const SOURCE = path.join(ROOT, "content/assets/models/community/618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8.glb");
const EXPECTED_SOURCE = "618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8";
const EXPECTED_OUTPUT = "c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f";
const outputIndex = process.argv.indexOf("--out");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("usage: generate_candidate.mts --out /absolute/candidate.glb");
const output = path.resolve(process.argv[outputIndex + 1]);
const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (sha256(SOURCE) !== EXPECTED_SOURCE) throw new Error("historical Astralym source changed");
fs.mkdirSync(path.dirname(output), { recursive: true });
const worker = path.join(ROOT, "tools/model-budget/optimize/decimate-emissive-lock.mjs");
const raw = execFileSync(process.execPath, [worker, SOURCE, output, "--target", "7900", "--emissive-threshold", "192", "--error", "0.02", "--sanitize-transparent-emissive-mattes"], { encoding: "utf8" });
const result = JSON.parse(raw);
if (sha256(output) !== EXPECTED_OUTPUT) throw new Error(`non-deterministic candidate output: ${sha256(output)}`);
const receipt = {
  schema: "ggd-historical-astralym-decimation-generation@1",
  source: { path: SOURCE, bytes: fs.statSync(SOURCE).size, sha256: EXPECTED_SOURCE },
  output: { path: output, bytes: fs.statSync(output).size, sha256: EXPECTED_OUTPUT },
  command: {
    worker: path.relative(ROOT, worker),
    target: 7900,
    emissiveThreshold: 192,
    errorBound: 0.02,
    lockBorder: true,
    transparentEmissiveMatteSanitization: { alphaMax: 5, hiddenRgbFloorExclusive: 8 },
  },
  dependencySetup: "bash tools/model-budget/optimize/bootstrap-geometry.sh",
  dependencyVersions: { gltfTransformCore: "4.4.1", meshoptimizer: "1.2.0", ffmpeg: "required by model-budget optimizer" },
  result,
};
fs.writeFileSync(`${output}.generation.json`, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
