import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import assert from "node:assert/strict";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture.js";
import { zHeroProject } from "../../packages/shared/src/content/heroForge/schema.js";
import { refineAzazelProject } from "../../packages/shared/src/content/heroForge/communityRefinements/azazel.js";
import { compileHeroPackageProject } from "../../packages/shared/src/content/import/heroPackage.js";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs.js";
import { verifyUploadedHeroModel } from "../../packages/shared/src/content/modelUpload/heroModel.js";
import { uploadedHeroModelPath } from "../../packages/shared/src/content/modelUpload/heroModelSchema.js";
import { importHeroHandoffBatch } from "../../packages/shared/src/content/heroForge/handoff.js";

const { values } = parseArgs({ options: { handoff: { type: "string" }, out: { type: "string" } } });
if (!values.handoff || !values.out) throw new Error("Usage: --handoff <model-enriched handoff> --out <new directory>");
const input = path.resolve(values.handoff), output = path.resolve(values.out);
if (output === input || output.startsWith(input + path.sep)) throw new Error("Output must be a new sibling directory.");
const index = JSON.parse(await fs.readFile(path.join(input, "index.json"), "utf8"));
if (index.heroCount !== 37 || index.slotCount !== 222 || index.heroes.length !== 37) throw new Error("Expected the complete 37-hero handoff.");
const safe = (relative: string) => {
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Unsafe handoff path.");
  return path.join(input, relative);
};
const rows = await Promise.all(index.heroes.map(async (row: { name: string; project: string; recipe: string }) => ({ row,
  original: await fs.readFile(safe(row.project), "utf8"), sidecar: await fs.readFile(safe(row.recipe), "utf8"),
})));
importHeroHandoffBatch(JSON.stringify(index), new Map(rows.flatMap(item => [[item.row.project, item.original], [item.row.recipe, item.sidecar]] as [string, string][])));
const selected = rows.filter(({ row }) => row.name === "阿薩謝爾");
if (selected.length !== 1) throw new Error("Expected one exact Azazel identity.");
const entry = selected[0]!;
const previous = zHeroProject.parse(JSON.parse(entry.original));
const refined = refineAzazelProject(previous);
assert.deepEqual(refined.sourceDesign, previous.sourceDesign);
assert.deepEqual(refined.presentation, previous.presentation);
const catalog = shippedHeroCatalog();
const baseRead = catalog.readAsset;
const assets = new Map<string, Uint8Array>();
for (const lock of refined.presentation.assetLocks.filter(lock => lock.kind === "model" && lock.registry === "normalized-upload")) {
  assets.set(lock.path, new Uint8Array(await fs.readFile(path.join(input, "models", `${lock.sha256}.glb`))));
}
catalog.readAsset = assetPath => assets.get(assetPath) ?? baseRead(assetPath);
if (refined.presentation.uploadedModel) {
  const model = refined.presentation.uploadedModel;
  const bytes = assets.get(uploadedHeroModelPath(model));
  if (!bytes) throw new Error("Missing uploaded model bytes.");
  const verified = await verifyUploadedHeroModel(model, bytes);
  catalog.documents = new Map([...catalog.documents, [`models/${verified.document.id}`, verified.document as unknown as Record<string, unknown>]]);
  catalog.validatedUploadedModel = { projectId: refined.projectId, model: verified.model };
}
const compiled = compileHeroPackageProject(refined, catalog, false);
// Refuse to overwrite any existing version. Completion is marked only by the
// last report write; a failed copy is an incomplete new folder, never a release.
await fs.mkdir(output);
for (const name of await fs.readdir(input)) await fs.cp(path.join(input, name), path.join(output, name), { recursive: true, force: false, errorOnExist: true });
await fs.writeFile(path.join(output, entry.row.project), JSON.stringify(refined, null, 2) + "\n");
for (const item of rows) {
  assert.equal(await fs.readFile(path.join(output, item.row.recipe), "utf8"), item.sidecar);
  if (item !== entry) assert.equal(await fs.readFile(path.join(output, item.row.project), "utf8"), item.original);
}
const report = { schema: "ggd-handoff-refinement-report@1", heroCount: 37, slotCount: 222, changedProject: refined.projectId,
  previousDigest: contentSha256(previous), refinedDigest: contentSha256(refined), sourceDigest: refined.sourceDesign!.sourceSha256,
  runtimeDocuments: compiled.runtime.length, dependencies: compiled.dependencies.length, assets: compiled.assets.length,
  published: false, visualAcceptance: "pending", fullMechanicsAcceptance: "pending-close-ability-defense-and-shadow-presentation",
  notes: refined.refinementNotes,
};
await fs.writeFile(path.join(output, "refinement-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, ...report }));
