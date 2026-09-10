/** Rebuild fourth-batch editable candidates from the shared recipe source. #1185 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture";
import { COMMUNITY_LOL_BATCH2_EXAMPLES, COMMUNITY_LOL_BATCH2_RELEASE_READY } from "../../packages/shared/src/content/heroForge/communityLolBatch2";
import { createCommunityHeroRecipe } from "../../packages/shared/src/content/heroForge/communityExamples";
import type { TemplateDoc } from "../../packages/shared/src/content/schema/template";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { createLocalDraft } from "../../apps/editor/src/drafts/repository";

const root = resolve(import.meta.dirname, "../..");
const check = process.argv.includes("--check");
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const outArg = process.argv.indexOf("--out");
if (outArg !== -1 && !process.argv[outArg + 1]) throw new Error("--out requires a directory");
const out = resolve(outArg === -1 ? resolve(root, "outputs/lol-batch2-authoring") : process.argv[outArg + 1]);
const versionFile = resolve(root, "docs/community-hero-forge/lol-batch2/authoring-manifest.json");
const write = (relative: string, value: unknown) => {
  const manifest = relative === "authoring-manifest.json";
  const path = manifest ? versionFile : resolve(out, relative), text = JSON.stringify(value, null, 2) + "\n";
  if (check) {
    // Candidate project/draft bytes are represented by the committed version
    // manifest; preparation artifacts stay local/S3, and need not exist in a clone.
    if (!manifest) return;
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) throw new Error(`候選來源已更新，需重建：${relative}`);
  } else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
};
const rows = COMMUNITY_LOL_BATCH2_EXAMPLES.map((recipe) => {
  const projectId = `lol-${recipe.id}`;
  const project = createCommunityHeroRecipe(recipe, projectId, templates);
  write(`projects/${projectId}.json`, project);
  const draft = createLocalDraft(`hero/${projectId}`, "hero", project.revision, { project, rawInputs: {}, mode: "visual", origin: recipe.origin });
  draft.updatedAt = 0; // Stable distributable authoring snapshot, not a user's last-edit timestamp.
  write(`drafts/${projectId}.json`, draft);
  return { id: projectId, name: recipe.name, revision: project.revision, projectSha256: contentSha256(project),
    draftSha256: contentSha256(draft), slots: Object.keys(recipe.moves), sourceUrl: recipe.sourceUrl,
    templateVersions: Object.keys(project.acceptedPlan!.templateVersions ?? {}) };
});
if (rows.length !== 11 || rows.reduce((n, row) => n + row.slots.length, 0) !== 66) throw new Error("第四批名單必須為 11 名／66 槽");
write("authoring-manifest.json", { schema: "ggd-lol-batch2-authoring@1", issue: 1185,
  releaseReady: COMMUNITY_LOL_BATCH2_RELEASE_READY, source: "packages/shared/src/content/heroForge/communityLolBatch2.ts",
  generator: "tools/community-hero-forge/lol-batch2.mts", recipeSha256: contentSha256(COMMUNITY_LOL_BATCH2_EXAMPLES),
  status: "candidate; source-critical mechanics pending Main", serviceImported: false, published: false, rows });
console.log(`${check ? "verified" : "rebuilt"}: 11 editable candidates / 66 slots; not publication-ready`);
