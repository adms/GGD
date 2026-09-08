/** Deterministic source/package/SimWorld evidence, deliberately not visual or live-game approval. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroExample } from "../../packages/shared/src/content/heroForge/communityExamples";
import { compileHeroPackageProject, buildHeroImportPackage, validateHeroImportPackage, type HeroPackageReplay } from "../../packages/shared/src/content/import/heroPackage";
import { heroScenarioProjection } from "../../packages/shared/src/content/heroForge/scenario";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import type { TemplateDoc } from "../../packages/shared/src/content/schema/template";

const output = process.argv[2];
if (!output) throw new Error("Usage: node --import tsx tools/community-hero-forge/concept-proof.mts <output-directory>");
mkdirSync(output, { recursive: true });
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const proof: Record<string, unknown> = { schema: "ggd-community-concept-proof@1", limits: "Deterministic source, real shared SimWorld and importer validation. No live multiplayer, balance or visual approval.", status: "running" };
const rows: unknown[] = [];
proof.heroes = rows;
try {
  for (const example of COMMUNITY_HERO_EXAMPLES) {
    const project = createCommunityHeroExample(example.id, `community-concept-${example.id}`, templates);
    const compiled = compileHeroPackageProject(project, catalog, true);
    const replay = (compiled.scenarios as { replay: HeroPackageReplay }).replay;
    const pkg = buildHeroImportPackage(project, catalog, { gameRevision: "local-concept-evidence", contentVersion: "local-concept-evidence", migrationFingerprint: "local-concept-evidence", processorFingerprint: "local-concept-evidence" });
    const validated = validateHeroImportPackage(pkg, catalog);
    assert.deepEqual(validated.diagnostics, []);
    assert.deepEqual(validated.result?.project, project);
    assert.equal(replay.kit.status, "accepted");
    const row = { id: example.id, inspiration: example.inspiration, name: project.brief.name, projectDigest: contentSha256(project), packageDigest: pkg.manifest.packageDigest,
      dependencyCount: compiled.dependencies.length, assetCount: compiled.assets.length,
      slots: replay.scenarios.map(heroScenarioProjection), kit: { status: replay.kit.status, eventCountsBySlot: replay.kit.eventCountsBySlot },
      sourceUrl: example.sourceUrl, adaptations: example.adaptations };
    rows.push(row);
    writeFileSync(resolve(output, `${example.id}.project.json`), JSON.stringify(project, null, 2) + "\n");
    console.log(example.id, JSON.stringify(replay.scenarios.map((slot) => ({ slot: slot.slot, status: slot.status, damage: slot.before.targetHp - slot.after.targetHp, events: slot.eventCounts }))));
  }
  proof.status = "passed";
} catch (error) { proof.status = "failed"; proof.error = String(error); process.exitCode = 1; throw error; }
finally { writeFileSync(resolve(output, "proof.json"), JSON.stringify(proof, null, 2) + "\n"); }
