import { expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../../packages/shared/testkit/heroPackageFixture";
import { compileHeroPackageProject } from "@ggd/shared/content/import/heroPackage";
import { heroScenarioProjection, heroKitScenarioProjection } from "@ggd/shared/content/heroForge/scenario";
import { bundledHeroCatalog, createHeroCatalog } from "./catalog";
import { validateHero } from "./validation";
import { adoptHeroGenerator } from "./projectModel";
import { DEFAULT_HERO_SCENARIO_SETUP } from "@ggd/shared/content/heroForge/scenarioSetup";
import { communityCombatFixture } from "../../../../packages/shared/testkit/communityCombatFixture";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";

it("Editor and trusted package earn Conan target clues through the same live combat preparation", () => {
  registerSkeletonContent(); const r = communityCombatFixture("26");
  const before = structuredClone(r.project);
  const preview = validateHero(r.project, bundledHeroCatalog);
  expect(preview.errors).toEqual([]);
  expect(preview.scenarios.find(s => s.slot === "R")!.resourceCost).toMatchObject({ before: 1, after: 0 });
  const packaged = compileHeroPackageProject(r.project, r.source.catalog);
  const receipt = packaged.scenarios as { slots: unknown[]; kit: unknown };
  expect(preview.scenarios.map(heroScenarioProjection)).toEqual(receipt.slots);
  expect(heroKitScenarioProjection(preview.kit!)).toEqual(receipt.kit);
  expect(r.project).toEqual(before);
});

it("previews generated forms on the same paired-body baseline as the trusted package", () => {
  const catalog = shippedHeroCatalog(), project = heroPackageProject(catalog, "editor-form-proof");
  project.acceptedPlan!.slots.Q.products = [{ instanceId: "form", template: { ref: "tpl-transform", inheritDefaults: true, params: {} } }];
  const preview = validateHero(project, bundledHeroCatalog);
  expect(preview.errors).toEqual([]);
  expect(preview.compiled!.relatedChampions).toHaveLength(1);
  expect(preview.scenarios.find((scenario) => scenario.slot === "Q")!.eventCounts.championForm).toBeGreaterThan(0);
  const compiled = compileHeroPackageProject(project, catalog);
  const receipt = compiled.scenarios as { slots: unknown[]; kit: unknown };
  expect(preview.scenarios.map(heroScenarioProjection)).toEqual(receipt.slots);
  expect(heroKitScenarioProjection(preview.kit!)).toEqual(receipt.kit);
});

it("requires explicit generator adoption before preview and keeps every authored slot and binding", () => {
  const project = heroPackageProject(shippedHeroCatalog());
  project.acceptedPlan!.generatorVersion = `sha256:${"a".repeat(64)}`;
  const before = structuredClone(project);
  const catalog = { ...bundledHeroCatalog, generatorVersion: `sha256:${"b".repeat(64)}` };
  const rejected = validateHero(project, catalog);
  expect(rejected.errors.join(" ")).toContain("不同版本的生成器");
  expect(rejected.scenarios).toEqual([]);
  const adopted = adoptHeroGenerator(project, catalog.generatorVersion);
  expect(validateHero(adopted, catalog, { slot: "Q", setup: structuredClone(DEFAULT_HERO_SCENARIO_SETUP) }).errors).toEqual([]);
  expect(adopted.acceptedPlan!.slots).toEqual(before.acceptedPlan!.slots);
  expect(adopted.presentation).toEqual(before.presentation);
  expect(project).toEqual(before);
});

it("runs all six offline Editor slots on the identical full Main baseline", () => {
  const catalog = shippedHeroCatalog();
  const project = heroPackageProject(catalog);
  const preview = validateHero(project, bundledHeroCatalog);
  expect(preview.errors).toEqual([]);
  expect(preview.scenarios).toHaveLength(6);
  const compiled = compileHeroPackageProject(project, catalog);
  const receipt = compiled.scenarios as { slots: unknown[]; kit: unknown; baseline: { digest: string } };
  expect(preview.scenarios.map(heroScenarioProjection)).toEqual(receipt.slots);
  expect(heroKitScenarioProjection(preview.kit!)).toEqual(receipt.kit);
  expect(receipt.baseline.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
});

it("applies designer positions, HP/MP and condition markers without changing the authored hero", () => {
  const project = heroPackageProject(shippedHeroCatalog());
  const before = structuredClone(project);
  const setup = structuredClone(DEFAULT_HERO_SCENARIO_SETUP);
  setup.target = { x: -2, z: 0, hp: 25, mana: 10, statuses: ["stun"] };
  const low = validateHero(project, bundledHeroCatalog, { slot: "Q", setup });
  expect(low.errors).toEqual([]);
  expect(low.scenarios).toHaveLength(1);
  expect(low.scenarios[0]!.before.targetStatuses).toBe(1);
  expect(low.scenarios[0]!.before.targetPos.x - low.scenarios[0]!.before.casterPos.x).toBe(1);
  const fullSetup = structuredClone(setup); fullSetup.target.hp = 100; fullSetup.target.mana = 100;
  const full = validateHero(project, bundledHeroCatalog, { slot: "Q", setup: fullSetup });
  expect(full.scenarios[0]!.before.targetHp).toBe(low.scenarios[0]!.before.targetHp * 4);
  expect(full.scenarios[0]!.before.targetMana).toBeCloseTo(low.scenarios[0]!.before.targetMana * 10);
  expect(full.scenarios[0]!.before.targetPos).toEqual(low.scenarios[0]!.before.targetPos);
  setup.caster.mana = 0;
  const empty = validateHero(project, bundledHeroCatalog, { slot: "Q", setup });
  expect(empty.scenarios[0]!.status).toBe("rejected");
  expect(empty.scenarios[0]!.eventCounts.abilityCast ?? 0).toBe(0);
  expect(project).toEqual(before);
  setup.target.statuses = ["missing-status-proof"];
  expect(validateHero(project, bundledHeroCatalog, { slot: "Q", setup }).errors.join(" ")).toContain("試玩狀態不在目前基線");
});

it("keeps an unsupported body model in the draft and rejects it in both preview and Main", () => {
  const catalog = shippedHeroCatalog();
  const project = heroPackageProject(catalog);
  const effectModel = [...catalog.documents].find(([key, document]) => key.startsWith("models/") && !bundledHeroCatalog.modelIds.includes(String(document.id)))![1];
  project.presentation.modelKey = String(effectModel.id);
  expect(validateHero(project, bundledHeroCatalog).errors.join(" ")).toContain("英雄本體模型未列入");
  expect(() => compileHeroPackageProject(project, catalog)).toThrow("已核准的英雄模型");
  expect(project.presentation.modelKey).toBe(effectModel.id);
});

it("uses the same trusted approval for a new body in Editor and Main, including withdrawal", () => {
  const catalog = shippedHeroCatalog();
  const project = heroPackageProject(catalog);
  const body = { ...catalog.documents.get(`models/${project.presentation.modelKey}`)!, id: "test.new-hero-body", heroBody: true };
  const documents = new Map(catalog.documents);
  documents.set(`models/${body.id}`, body);
  project.presentation.modelKey = body.id;
  const editorCatalog = () => createHeroCatalog(bundledHeroCatalog.simulationDocuments, [...documents].filter(([key]) => key.startsWith("models/")).map(([, doc]) => doc), "local-api");
  expect([...documents].some(([key, doc]) => key.startsWith("champions/") && doc.modelKey === body.id)).toBe(false);
  expect(validateHero(project, editorCatalog(), { slot: "Q", setup: structuredClone(DEFAULT_HERO_SCENARIO_SETUP) }).errors).toEqual([]);
  const compiled = compileHeroPackageProject(project, { ...catalog, documents }, false);
  expect(compiled.compiled.champion.modelKey).toBe(body.id);
  expect(compiled.dependencies.find((doc) => doc.collection === "models" && doc.id === body.id)?.document.heroBody).toBe(true);

  documents.set(`models/${body.id}`, { ...body, heroBody: false });
  expect(validateHero(project, editorCatalog()).errors.join(" ")).toContain("英雄本體模型未列入");
  expect(() => compileHeroPackageProject(project, { ...catalog, documents }, false)).toThrow("已核准的英雄模型");
  expect(project.presentation.modelKey).toBe(body.id);
});
