/** Publish the validated GLB as a new source model without registering/selecting it. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const candidatePath = resolve(process.argv[2] ?? join(ROOT, "../GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v2/azazel-wings-v2.glb"));
const validationPath = candidatePath.replace(/\.glb$/, ".validation.json");
const receiptPath = candidatePath.replace(/\.glb$/, ".publish.json");
const bytes = new Uint8Array(readFileSync(candidatePath));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const validation = JSON.parse(readFileSync(validationPath, "utf8"));
assert.equal(validation.candidate.sha256, sha256);
assert.equal(validation.status.policyValidated, true);
assert.equal(validation.status.khronosValidated, true);

const { inspectModelUpload } = await import(join(ROOT, "packages/shared/src/content/modelUpload/inspect.ts"));
const { heroModelBudgetIssues, uploadedHeroModelDoc } = await import(join(ROOT, "packages/shared/src/content/modelUpload/heroModel.ts"));
const { zUploadedHeroModel, uploadedHeroModelPath } = await import(join(ROOT, "packages/shared/src/content/modelUpload/heroModelSchema.ts"));
const inspected = await inspectModelUpload(bytes);
assert.deepEqual(heroModelBudgetIssues(inspected).errors, []);
const clipMap = {
  idle: "bat_idle", run: "single_run", attack: "single_attack_attcom_1",
  cast: "single_skill_01", hurt: "bat_idle", death: "dead",
};
for (const name of Object.values(clipMap)) assert.ok(inspected.clips.some((clip: any) => clip.name === name));
const uploaded = zUploadedHeroModel.parse({ schema: "ggd-uploaded-hero-model@1", sha256, byteSize: bytes.length, clipMap, yawOffsetDeg: 0 });
const document = uploadedHeroModelDoc(uploaded);
const relativeGlb = uploadedHeroModelPath(uploaded);
assert.equal(document.glbPath, relativeGlb);
const glbPath = join(ROOT, "content", relativeGlb);
const documentPath = join(ROOT, "content/models", `${document.id}.json`);
mkdirSync(dirname(glbPath), { recursive: true });
for (const [path, data] of [[glbPath, Buffer.from(bytes)], [documentPath, Buffer.from(JSON.stringify(document, null, 2) + "\n")]] as const) {
  if (existsSync(path)) assert.deepEqual(readFileSync(path), data, `conflicting existing file: ${path}`);
  else writeFileSync(path, data, { flag: "wx" });
}
const receipt = {
  schema: "ggd.approved-azazel-wings-publish@2",
  candidate: { path: candidatePath, sha256, bytes: bytes.length },
  sourceModel: {
    modelKey: document.id,
    modelDocumentPath: documentPath,
    modelDocumentSha256: createHash("sha256").update(readFileSync(documentPath)).digest("hex"),
    glbPath,
    gitGlbPath: join("content", relativeGlb),
    sha256,
  },
  sourceModelCreated: true,
  dropdownRegistered: false,
  selected: false,
  productionDeployed: false,
};
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt.sourceModel));
