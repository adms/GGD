import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { inflateRawSync } from "node:zlib";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture.js";
import { applyCommunityDesignRefinement } from "../../packages/shared/src/content/heroForge/communityRefinements/apply.js";
import { zHeroProject } from "../../packages/shared/src/content/heroForge/schema.js";
import { HERO_SLOTS } from "../../packages/shared/src/content/heroForge/constants.js";
import { generateHeroDraft, compileGeneratedHeroDraft } from "../../packages/shared/src/content/heroForge/generator.js";
import type { TemplateDoc } from "../../packages/shared/src/content/schema/template.js";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs.js";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip.js";
import { uploadedHeroModelPath } from "../../packages/shared/src/content/modelUpload/heroModelSchema.js";
import { sha256Bytes } from "../../packages/shared/src/content/sha256.js";

const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" } } });
if (!values.input || !values.output) throw new Error("--input <37 rebuilt project directories> --output <new handoff directory>");
const input = path.resolve(values.input), output = path.resolve(values.output);
if (input === output || output.startsWith(input + path.sep)) throw new Error("Output must be a new sibling directory");
const root = path.resolve(import.meta.dirname, "../..");
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
const rows = [];
const audit = [];
await fs.mkdir(output); // Never overwrite the previously tested version.
for (const dir of ["projects", "recipes", "models"]) await fs.mkdir(path.join(output, dir));
for (let i = 1; i <= 37; i++) {
  const number = String(i).padStart(2, "0");
  const recipePath = `materials/community-hero-forge/recipes/${number}.upload-recipe.json`;
  const recipeText = await fs.readFile(path.join(root, recipePath), "utf8");
  const before = zHeroProject.parse(JSON.parse(await fs.readFile(path.join(input, number, "after.hero-project.json"), "utf8")));
  assert.equal(before.sourceDesign?.sourceSha256, sha256Bytes(new TextEncoder().encode(recipeText)));
  const patchPath = path.join(root, `materials/community-hero-forge/refinements/${number}.json`);
  let patch: unknown;
  try { patch = JSON.parse(await fs.readFile(patchPath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const after = patch ? applyCommunityDesignRefinement(before, patch, templates) : before;
  assert.deepEqual(after.sourceDesign, before.sourceDesign);
  assert.deepEqual(after.brief, before.brief);
  assert.deepEqual(after.presentation.uploadedModel, before.presentation.uploadedModel);
  assert.deepEqual(after.presentation.modelProvenance, before.presentation.modelProvenance);
  const result = compileGeneratedHeroDraft(generateHeroDraft(after.acceptedPlan!, { heroId: after.projectId, heroName: after.brief.name,
    modelKey: after.presentation.modelKey, presentation: after.presentation }), templates, configs);
  if (!result.ok) throw new Error(`${number}: ${JSON.stringify(result.failures)}`);
  const model = after.presentation.uploadedModel;
  assert(model, `${number}: expected the existing bound model`);
  const pkg = readPackageZip(new Uint8Array(await fs.readFile(path.join(input, number, "package.zip"))), {
    inflate: (bytes, maxBytes) => inflateRawSync(bytes, { maxOutputLength: maxBytes }),
  });
  const bytes = pkg.assets.find(asset => asset.path === uploadedHeroModelPath(model))?.bytes;
  assert(bytes && sha256Bytes(bytes) === model.sha256, `${number}: prior model bytes must verify`);
  await fs.writeFile(path.join(output, "models", model.sha256 + ".glb"), bytes);
  await fs.writeFile(path.join(output, "recipes", number + ".upload-recipe.json"), recipeText);
  await fs.writeFile(path.join(output, "projects", number + ".hero-project.json"), JSON.stringify(after, null, 2) + "\n");
  rows.push({ index: number, name: after.brief.name, projectId: after.projectId,
    project: `projects/${number}.hero-project.json`, recipe: `recipes/${number}.upload-recipe.json` });
  for (const slot of HERO_SLOTS) {
    const ability = result.draft.abilityDrafts[slot];
    const oldSlot = before.acceptedPlan!.slots[slot], newSlot = after.acceptedPlan!.slots[slot];
    audit.push({ hero: number, name: after.brief.name, slot, skill: newSlot.name, sourceRecipe: recipePath,
      ownerDescription: after.sourceDesign!.slots[slot].ownerDescription,
      requiredRefinement: after.sourceDesign!.slots[slot].requiredRefinement,
      products: newSlot.products.map(p => p.template.ref), castType: ability.castType, targetsEnemies: ability.targetsEnemies,
      effects: ability.effects.map(effect => effect.kind), hooks: ability.passive?.ranks?.flatMap(rank => rank.hooks?.map(hook => hook.on) ?? []) ?? [],
      changed: contentSha256(oldSlot) !== contentSha256(newSlot),
      designAcceptance: "pending-per-requirement-behavior-proof", refinementNote: after.refinementNotes?.[slot] ?? null });
  }
}
await fs.writeFile(path.join(output, "index.json"), JSON.stringify({ schema: "ggd-workflow-handoff-index@1", heroCount: 37, slotCount: 222, heroes: rows }, null, 2) + "\n");
const report = { schema: "ggd-community-design-refinement-audit@1", issue: 1132, scope: "Original requirements versus compiled authoring; compilation is not design acceptance",
  heroes: 37, slots: 222, changedSlots: audit.filter(row => row.changed).length,
  passiveOnAttackTemplates: audit.filter(row => row.slot === "PASSIVE" && row.products.includes("tpl-on-attack")).length,
  originalDesignAcceptance: "incomplete", published: false, rows: audit };
await fs.writeFile(path.join(output, "design-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, heroes: 37, slots: 222, changedSlots: report.changedSlots,
  passiveOnAttackTemplates: report.passiveOnAttackTemplates, originalDesignAcceptance: report.originalDesignAcceptance, published: false }));
