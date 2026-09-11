import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkAcquiredHeroes, reportExitCode } from "./acquired-heroes-check.ts";
import { COMMUNITY_ACQUIRED_FIRST } from "../../packages/shared/src/content/heroForge/communityAcquiredFirst.ts";
import { createCommunityHeroRecipe } from "../../packages/shared/src/content/heroForge/communityExamples.ts";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture.ts";
import { draftFingerprint } from "../../apps/editor/src/drafts/repository.ts";
import { binarySha256 } from "../../packages/shared/src/content/import/packageZip.ts";

const catalog = shippedHeroCatalog();
const target = { gameRevision: "test-local", contentVersion: "test-local", migrationFingerprint: "test-local", processorFingerprint: "test-local" };
const recipe = (id) => {
  const source = { ...structuredClone(COMMUNITY_ACQUIRED_FIRST[0]), id };
  delete source.modelKey;
  return source;
};
const options = (recipes, outputDirectory) => ({ outputDirectory, createProject: (id, projectId, templates) => {
  const source = recipes.find((entry) => entry.id === id);
  return createCommunityHeroRecipe({ ...source, modelKey: source.modelKey ?? "unassigned.model" }, projectId, templates);
} });

test("a failed first recipe does not hide later blockers or stable Editor import files", async () => {
  const output = mkdtempSync(join(tmpdir(), "acquired-check-test-"));
  try {
    const first = recipe("invalid-first"), second = recipe("editable-second");
    first.moves.Q.ref = "missing-template";
    const report = await checkAcquiredHeroes([first, second], { ...catalog, readAsset: () => undefined }, target, options([first, second], output));
    assert.equal(report.heroes.length, 2);
    assert.equal(report.heroes[0].status, "failed");
    assert.equal(report.heroes[1].compiled, true);
    assert.equal(report.heroes[1].slots.length, 6);
    assert.equal(report.heroes[1].modelKey, null);
    assert.equal(report.heroes[1].package.status, "not-run");
    assert(report.heroes[1].errors.some((entry) => entry.code === "MODEL_NOT_ASSIGNED"));
    assert(report.heroes[1].assets.filter((entry) => entry.status === "blocked").length > 1);
    const bytes = readFileSync(join(output, "drafts/editable-second.json"));
    const draft = JSON.parse(bytes);
    assert.equal(draft.updatedAt, 0);
    assert.equal(draft.key, "hero/editable-second");
    assert.equal(draft.token, draftFingerprint(draft.payload));
    assert.equal(draft.payload.project.projectId, "editable-second");
    assert.equal(draft.payload.project.presentation.modelKey, "unassigned.model");
    assert.equal(await binarySha256(bytes), report.heroes[1].authoring.draft.sha256);
    assert.deepEqual(draft.payload.project, JSON.parse(readFileSync(join(output, "projects/editable-second.json"))));
    assert.equal(reportExitCode(report, "report"), 0);
    assert.equal(reportExitCode(report, "strict"), 1);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("duplicate recipe and skill identities fail every affected row while renamed mechanics warn", async () => {
  const first = recipe("duplicate"), second = recipe("duplicate"), third = recipe("renamed");
  third.name = "另一個名字";
  const changed = JSON.stringify(third.moves).replaceAll("$hero.fuel", "$hero.new-name");
  third.moves = JSON.parse(changed);
  const recipes = [first, second, third];
  const report = await checkAcquiredHeroes(recipes, { ...catalog, readAsset: () => undefined }, target, options(recipes));
  assert.equal(report.heroes.length, 3);
  for (const row of report.heroes.slice(0, 2)) {
    assert.equal(row.status, "failed");
    assert(row.errors.some((entry) => entry.code === "DUPLICATE_RECIPE_ID"));
    assert(row.errors.some((entry) => entry.code === "DUPLICATE_ABILITY_ID"));
  }
  assert.equal(report.heroes[0].mechanicsSha256, report.heroes[2].mechanicsSha256);
  assert(report.heroes.every((row) => row.warnings.some((entry) => entry.code === "SIMILAR_SIX_SLOT_STRUCTURE")));
});

test("an explicitly selected real body cannot pass packaging when its bytes or audio are missing", async () => {
  const source = recipe("missing-assets");
  source.modelKey = "champ.thorne";
  source.moves.Q.effects = [{ kind: "damage", amount: { damageTier: "小" }, damageType: "magic" }];
  // An unrelated absent document must not stop collecting the selected body's files.
  source.moves.W.effects = [{ kind: "spawnProjectile", projectileId: "missing-test-projectile", onHit: [{ kind: "damage", amount: { damageTier: "小" } }] }];
  source.authoredPresentation = { Q: { segments: [{ kind: "sound", on: "castEffect", soundKey: "missing-test-sound" }] } };
  const report = await checkAcquiredHeroes([source], { ...catalog, readAsset: () => undefined }, target, options([source]));
  const row = report.heroes[0];
  assert.equal(row.compiled, true, JSON.stringify(row.errors));
  assert(!row.errors.some((entry) => entry.code === "DEPENDENCY_TEMPLATE_FAILED"), "Compiled tier values must not be re-expanded as authoring input.");
  assert(row.errors.some((entry) => entry.code === "MISSING_DOCUMENT" && entry.path === "projectiles/missing-test-projectile"));
  assert(row.errors.some((entry) => entry.code === "MISSING_AUDIO_KEY"));
  assert(row.assets.some((entry) => /\.glb$/.test(entry.path) && entry.status === "blocked"));
  assert.equal(row.package.status, "not-run");
  assert.notEqual(report.status, "passed");
});
