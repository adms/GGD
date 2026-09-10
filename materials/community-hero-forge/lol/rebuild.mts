/** Seven existing recipes and body bindings; writes only this source directory. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shippedHeroCatalog } from "../../../packages/shared/testkit/heroPackageFixture.ts";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroExample } from "../../../packages/shared/src/content/heroForge/communityExamples.ts";
import { editHeroProject } from "../../../apps/editor/src/hero/projectModel.ts";
import { HERO_SLOTS } from "../../../packages/shared/src/content/heroForge/constants.ts";
import { zHeroProject } from "../../../packages/shared/src/content/heroForge/schema.ts";
import { heroBodyModelIds } from "../../../packages/shared/src/content/heroForge/bodyModels.ts";
import { generateHeroDraft, compileGeneratedHeroDraft } from "../../../packages/shared/src/content/heroForge/generator.ts";
import { contentSha256 } from "../../../packages/shared/src/content/import/jcs.ts";
import { zModelDoc } from "../../../packages/shared/src/content/schema/model.ts";
import type { TemplateDoc } from "../../../packages/shared/src/content/schema/template.ts";
import type { VfxSubtypeDoc } from "../../../packages/shared/src/content/schema/vfxSubtype.ts";

const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, "../../..");
const assetRoot = resolve(process.env.GGD_LOL_ASSET_ROOT ?? resolve(root, "../outputs/community-lol-models-20260907/ggd-runtime-candidate"));
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const sourceCodeCommit = "d52ad8a7121dda1217dd31f8a77f56a509eb0804";
const evidenceRoot = "docs/_reports/community-hero-forge";
const bindings = [
  ["warwick", "沃維克", "c159e999e5e46650a166271092f1812d77b0f0ba2ba3a450d9606a91ec3d5ef8"],
  ["karthus", "卡爾瑟斯", "896b61306285904ec771460bc32266d607b04d5b43a4549db96fef18317d1f8c"],
  ["lux", "拉克絲", "6ccd3b50b01b4bb1c9bbda8352ca3c4b487f0cd034b6d2b62664a7df239d7375"],
  ["yasuo", "犽宿", "d1b6123438b0b8735fdc6585eb72c433530e951027ee1860746153e9955b16b2"],
  ["missfortune", "好運姐", "c3bc5f079618f6de7e3e1d30960e32a755b9622ed403ea00f4103991918b5cc2"],
  ["leesin", "李星", "5a885d6c0a13cb719da5d1e838f4d19d3115b41b826b88cf913fb443e260d40c"],
  ["xerath", "齊勒斯", "8c875d6c33a41f34830ca330f2278d5b14e09ed01bc4ac3e12afd13eec93110b"],
] as const;
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
const subtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
const inputDocuments = [...catalog.documents].filter(([key]) => /^(ability-templates|config|vfx-subtypes)\//.test(key)).sort(([a], [b]) => a.localeCompare(b));
const files = new Map<string, string | Uint8Array>();
const heroes = bindings.map(([id, name, modelSha256]) => {
  const projectId = `community-concept-${id}`;
  const modelKey = `community.lol.${id}`;
  const modelSource = `${evidenceRoot}/lol-models/forge-preview/model-docs/${modelKey}.json`;
  const modelBytes = readFileSync(resolve(root, modelSource));
  const model = zModelDoc.parse(JSON.parse(modelBytes.toString("utf8")));
  assert.equal(model.id, modelKey);
  assert(heroBodyModelIds([[`models/${modelKey}`, model]]).includes(modelKey));
  const glb = readFileSync(resolve(assetRoot, `${id}.glb`));
  assert.equal(sha(glb), modelSha256, `${name}: existing GLB bytes changed`);
  const example = COMMUNITY_HERO_EXAMPLES.find((entry) => entry.id === id)!;
  assert.equal(example.name, name);
  const baseline = createCommunityHeroExample(id, projectId, templates);
  const project = zHeroProject.parse(editHeroProject(baseline, "presentation", "presentation.modelKey", modelKey));
  assert.deepEqual(project.acceptedPlan, baseline.acceptedPlan, `${name}: skill recipe changed`);
  assert.deepEqual(project.brief, baseline.brief, `${name}: source text changed`);
  assert.equal(project.brief.name, name);
  assert.deepEqual(Object.keys(project.acceptedPlan!.slots), [...HERO_SLOTS]);
  for (const slot of HERO_SLOTS) for (const product of project.acceptedPlan!.slots[slot].products) {
    const digest = product.template.contentSha256;
    assert(digest && project.acceptedPlan!.templateVersions?.[digest], `${name}/${slot}: missing pinned template`);
    assert.equal(contentSha256(project.acceptedPlan!.templateVersions[digest]), digest);
  }
  const generated = generateHeroDraft(project.acceptedPlan!, { heroId: projectId, heroName: name, presentation: project.presentation });
  const compiled = compileGeneratedHeroDraft(generated, templates, configs, subtypes);
  assert(compiled.ok, `${name}: ${JSON.stringify(compiled.failures)}`);
  assert.equal(compiled.draft.champion.id, projectId);
  assert.equal(compiled.draft.champion.modelKey, modelKey);
  assert.deepEqual(Object.keys(compiled.draft.abilityDrafts), [...HERO_SLOTS]);
  const projectPath = `projects/${id}.project.json`, modelPath = `models/${modelKey}.json`;
  const projectText = json(project);
  files.set(projectPath, projectText);
  files.set(modelPath, modelBytes);
  console.log(`${name}: ${projectId}, 6 slots compiled, original model SHA verified`);
  return { id, name, projectId, heroId: projectId, slotCount: HERO_SLOTS.length,
    project: { path: projectPath, sha256: sha(projectText), contentSha256: contentSha256(project) },
    model: { key: modelKey, path: modelPath, sha256: sha(modelBytes), source: modelSource, glbPath: model.glbPath,
      localFile: `../outputs/community-lol-models-20260907/ggd-runtime-candidate/${id}.glb`, sha256Glb: modelSha256, byteSize: glb.length,
      delivery: "external-local-file-not-in-git", formalServiceCatalogVerified: false },
    compilation: { passed: true, compiledSha256: contentSha256(compiled.draft), abilityIds: HERO_SLOTS.map((slot) => compiled.draft.abilityDrafts[slot].id) },
    evidence: [`${evidenceRoot}/community-concepts/deterministic/${id}.project.json`, `${evidenceRoot}/lol-models/forge-preview/browser/${id}-idle.txt`, `${evidenceRoot}/lol-models/forge-preview/browser/${id}-cast.txt`] };
});
assert.equal(new Set(heroes.map((hero) => hero.projectId)).size, 7);
const sourcePaths = ["packages/shared/src/content/heroForge/communityExamples.ts", "apps/editor/src/hero/projectModel.ts", "packages/shared/src/content/heroForge/generator.ts", "materials/community-hero-forge/lol/rebuild.mts"];
const manifest = { schema: "ggd-community-lol-source-handoff@1", sourceCodeCommit,
  sourceFiles: sourcePaths.map((path) => ({ path, sha256: sha(readFileSync(resolve(root, path))) })),
  contentInputs: { digest: contentSha256(inputDocuments), documents: inputDocuments.map(([path, document]) => ({ path, contentSha256: contentSha256(document) })) },
  counts: { heroes: heroes.length, slots: heroes.reduce((count, hero) => count + hero.slotCount, 0), modelDocuments: heroes.length, includedGlbFiles: 0 },
  command: "node --import tsx materials/community-hero-forge/lol/rebuild.mts", heroes,
  status: { localSourceCompilation: "passed", integratedServiceTargetPackageBuilt: false, submitted: false, published: false },
  limitations: ["Compilation uses the existing recipes and local preview body documents; no service model approval is claimed.", "Full HeroProject source and pinned template snapshots are included; large GLBs remain external at the recorded paths and SHA-256.", "No new simulation, visual acceptance, package ZIP, service submission or publication was performed.", "Recipe source prose is preserved, including its historical placeholder-model description; presentation.modelKey records the original LoL body selected in the existing preview."] };
files.set("manifest.json", json(manifest));
for (const [path, bytes] of files) {
  const target = resolve(output, path);
  assert(!relative(output, target).startsWith(".."));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  assert.equal(sha(readFileSync(target)), sha(bytes), `${path}: written bytes differ`);
}
console.log(JSON.stringify({ ...manifest.counts, status: manifest.status }));
