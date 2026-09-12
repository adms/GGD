import { loadPreferredLibraryModel } from "../hero-model-library/load-option.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { importHeroHandoffBatch, zHeroHandoffModelBindings } from "../../packages/shared/src/content/heroForge/handoff.js";
import { zHeroProject } from "../../packages/shared/src/content/heroForge/schema.js";
import { zHeroModelProvenance } from "../../packages/shared/src/content/modelUpload/provenance.js";
import { verifyUploadedHeroModel } from "../../packages/shared/src/content/modelUpload/heroModel.js";
import { uploadedHeroModelPath } from "../../packages/shared/src/content/modelUpload/heroModelSchema.js";

// A new, portable authoring folder. This neither submits nor approves a hero.
const { values } = parseArgs({ options: Object.fromEntries(["handoff", "bindings", "asset-root", "out"].map((key) => [key, { type: "string" as const }])) });
for (const key of ["handoff", "bindings", "asset-root", "out"]) if (!values[key]) throw new Error(`Missing --${key}`);
const input = path.resolve(values.handoff!), output = path.resolve(values.out!), assetRoot = path.resolve(values["asset-root"]!);
const read = async (file: string) => fs.readFile(file, "utf8");
const indexText = await read(path.join(input, "index.json"));
const index = JSON.parse(indexText);
const safePath = (root: string, relative: string) => {
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid relative path: ${relative}`);
  return path.join(root, relative);
};
const files = new Map<string, string>();
for (const entry of index.heroes) for (const file of [entry.project, entry.recipe]) files.set(file, await read(safePath(input, file)));
const projects = importHeroHandoffBatch(indexText, files);
const bindings = zHeroHandoffModelBindings.parse(JSON.parse(await read(values.bindings!)));
if (new Set(bindings.entries.map((entry) => entry.projectId)).size !== bindings.entries.length) throw new Error("Duplicate hero model binding");
await fs.mkdir(output, { recursive: false }); // Refuse to overwrite earlier source or accepted versions.
await fs.mkdir(path.join(output, "models"));
const report: unknown[] = [];
let importedModels = 0;
for (const binding of bindings.entries) {
  const project = projects.find((entry) => entry.projectId === binding.projectId);
  if (!project || project.brief.name !== binding.name) throw new Error(`Hero binding identity mismatch: ${binding.name}`);
  const preferred = await loadPreferredLibraryModel(project.projectId);
  if (!preferred && binding.provenance.relationship === "style-proxy") {
    report.push({ projectId: project.projectId, name: project.brief.name,
      status: "candidate-only-awaiting-approved-model", previousModelKey: project.presentation.modelKey,
      reason: "Only the eleven owner-approved derivative copies may replace a hero with a proxy by default." });
    continue;
  }
  const directory = preferred ? null : safePath(assetRoot, binding.directory);
  const receipt = preferred ? null : JSON.parse(await read(path.join(directory!, "receipt.json")));
  if (receipt && receipt.preparation.asset !== binding.provenance.sourceAssetId) throw new Error(`Source asset mismatch: ${binding.name}`);
  const bytes = preferred?.bytes ?? new Uint8Array(await fs.readFile(path.join(directory!, "body.glb")));
  const verified = preferred ?? await verifyUploadedHeroModel(receipt.model, bytes);
  const provenance = preferred?.provenance ?? zHeroModelProvenance.parse({ schema: "ggd-hero-model-provenance@1", modelSha256: verified.model.sha256, ...binding.provenance });
  const previous = project.presentation.modelKey;
  project.presentation = { ...project.presentation, modelKey: verified.document.id, uploadedModel: verified.model,
    modelProvenance: provenance,
    assetLocks: [...project.presentation.assetLocks.map((lock) => ({ ...lock, consumers: lock.consumers.filter((consumer) => consumer !== "champion:model") })).filter((lock) => lock.consumers.length), {
      path: uploadedHeroModelPath(verified.model), sha256: verified.model.sha256, byteSize: bytes.length,
      mediaType: "model/gltf-binary", kind: "model", registry: "normalized-upload", consumers: ["champion:model"],
    }],
  };
  project.revision++;
  for (const section of ["presentation", "package"] as const) {
    project.sections[section] = { ...project.sections[section], revision: project.revision, state: "stale" };
    project.validationState[section] = { revision: project.revision, status: "stale", diagnosticCodes: [] };
  }
  zHeroProject.parse(project);
  await fs.writeFile(path.join(output, "models", `${verified.model.sha256}.glb`), bytes);
  report.push({ projectId: project.projectId, name: project.brief.name, previousModelKey: previous, model: verified.model,
    provenance: project.presentation.modelProvenance, warnings: verified.warnings, originalMechanics: "pending-per-slot-refinement" });
  importedModels++;
}
for (const entry of index.heroes) {
  const project = projects.find((item) => item.projectId === entry.projectId)!;
  const projectPath = safePath(output, entry.project), recipePath = safePath(output, entry.recipe);
  await fs.mkdir(path.dirname(projectPath), { recursive: true }); await fs.mkdir(path.dirname(recipePath), { recursive: true });
  await fs.writeFile(projectPath, JSON.stringify(zHeroProject.parse(project), null, 2) + "\n");
  await fs.writeFile(recipePath, files.get(entry.recipe)!); // Preserve every original sidecar byte.
}
await fs.writeFile(path.join(output, "index.json"), JSON.stringify({ schema: index.schema, heroCount: projects.length, slotCount: projects.length * 6,
  notice: "Authoring handoff with source text and optional models. Rebuild packages against the active service; mechanics review remains separate.",
  heroes: index.heroes.map(({ index, name, projectId, project, recipe }: Record<string, string>) => ({ index, name, projectId, project, recipe })),
}, null, 2) + "\n");
await fs.writeFile(path.join(output, "model-bindings-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, heroes: projects.length, slots: projects.length * 6, models: importedModels,
  deferred: report.length - importedModels, published: false }));
