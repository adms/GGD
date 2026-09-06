/** Offline library preparation -> the same six-state model contract used by community uploads. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readGlb, sha256 } from "../model-budget/glb";
import { pruneAnimations, pruneDiff } from "../model-budget/trimClips";
import { MODEL_UPLOAD_LIMITS } from "../../packages/shared/src/content/modelUpload/glb";
import { HERO_MODEL_STATES } from "../../packages/shared/src/content/modelUpload/heroModelSchema";
import { inspectModelUpload } from "../../packages/shared/src/content/modelUpload/inspect";
import { prepareUploadedHeroModel, verifyUploadedHeroModel } from "../../packages/shared/src/content/modelUpload/heroModel";

const { values } = parseArgs({ options: { receipt: { type: "string" }, clips: { type: "string" }, out: { type: "string" } } });
if (!values.receipt || !values.clips || !values.out) {
  throw new Error("Usage: node --import tsx tools/community-hero-forge/finalize-library-body.mts --receipt <preparation.receipt.json> --clips <six-state-names.json> --out <new-directory>");
}
const preparation = JSON.parse(readFileSync(values.receipt, "utf8"));
assert.equal(preparation?.schema, "ggd-library-model-preparation@1");
assert.ok(typeof preparation.asset === "string" && preparation.asset.length > 0);
for (const file of [preparation.source, preparation.output]) {
  assert.ok(file && typeof file.path === "string" && typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0, "Invalid artifact receipt");
  assert.equal(file.path, resolve(file.path), "Library paths must be absolute");
  const size = statSync(file.path).size;
  assert.ok(size > 0 && size <= MODEL_UPLOAD_LIMITS.fileBytes, "Offline file exceeds 32 MiB");
  assert.equal(size, file.bytes, "Library artifact size changed");
  assert.equal(sha256(readFileSync(file.path)), file.sha256, "Library artifact changed since preparation");
}
const names: Record<(typeof HERO_MODEL_STATES)[number], string> = JSON.parse(readFileSync(values.clips, "utf8"));
assert.ok(names && typeof names === "object" && !Array.isArray(names));
assert.deepEqual(Object.keys(names).sort(), [...HERO_MODEL_STATES].sort(), "Map exactly the six runtime states");
assert.ok(Object.values(names).every((name) => typeof name === "string" && name.trim().length > 0));
const output = resolve(values.out);
assert.ok(!existsSync(output), "Choose a new output directory; previous versions are immutable");
const temporary = mkdtempSync(join(tmpdir(), "ggd-library-model-finalize-"));
try {
  const original = readGlb(preparation.output.path);
  const chosen = [...new Set(Object.values(names))];
  const bytes = pruneAnimations(original, chosen);
  const candidate = join(temporary, "trimmed.glb");
  writeFileSync(candidate, bytes);
  assert.equal(pruneDiff(preparation.output.path, candidate, chosen), null, "Animation pruning changed geometry, rig, materials or retained motion");
  const inspection = await inspectModelUpload(bytes);
  assert.equal(new Set(original.json.animations.map((clip: { name: string }) => clip.name)).size, original.json.animations.length, "Source clip names must be unique");
  const selections = Object.fromEntries(HERO_MODEL_STATES.map((state) => [state, inspection.clips.findIndex((clip) => clip.name === names[state])])) as Record<(typeof HERO_MODEL_STATES)[number], number>;
  const body = await prepareUploadedHeroModel(bytes, selections);
  const verified = await verifyUploadedHeroModel(body.model, body.bytes);
  assert.deepEqual(verified.document, body.document);
  const receipt = {
    schema: "ggd-library-body-ready@1", preparation, selectedClips: names,
    originalClipCount: original.json.animations.length, runtimeClips: body.inspected.clips,
    model: body.model, document: body.document,
    metrics: { triangles: body.inspected.triangles, drawPrimitives: body.inspected.meshes, textures: body.inspected.textures },
    warnings: body.warnings, validator: body.inspected.report,
    evidence: { pruningPreservesBody: true, sharedUploadVerification: true, visualAcceptance: "pending", heroMechanicsAcceptance: "pending" },
  };
  mkdirSync(output, { recursive: false });
  writeFileSync(join(output, "body.glb"), body.bytes, { flag: "wx" });
  writeFileSync(join(output, "uploaded-model.json"), JSON.stringify(body.model, null, 2) + "\n", { flag: "wx" });
  writeFileSync(join(output, "model.json"), JSON.stringify(body.document, null, 2) + "\n", { flag: "wx" });
  writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, source: preparation.asset, bytes: body.bytes.length, triangles: body.inspected.triangles, meshes: body.inspected.meshes, clips: body.inspected.clips.length, warnings: body.warnings, visualAcceptance: "pending" }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
