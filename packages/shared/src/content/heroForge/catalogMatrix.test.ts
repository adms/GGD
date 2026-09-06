import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORIGINS } from "../statNormalization";
import type { TemplateDoc } from "../schema/template";
import type { ProjectileDoc } from "../schema/projectile";
import { heroTemplateDefaultParams as defaultParamsFor } from "./planner";
import { expand } from "../templates/expand";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";
import { createDeterministicHeroPlans } from "./planner";
import { templateFitsHeroSlot } from "./planner";
import { runHeroAbilityScenario, runHeroKitScenario } from "./scenario";

const ROOT = join(import.meta.dirname, "../../../../..");
const configs = readdirSync(join(ROOT, "content/config"))
  .filter((name) => name.endsWith(".json") && name !== "_index.json")
  .map((name) => JSON.parse(readFileSync(join(ROOT, "content/config", name), "utf8")) as { schema?: string });
const templates = (): TemplateDoc[] => readdirSync(join(ROOT, "content/ability-templates"))
  .filter((name) => name.endsWith(".json") && name !== "_index.json")
  .map((name) => JSON.parse(readFileSync(join(ROOT, "content/ability-templates", name), "utf8")) as TemplateDoc)
  .filter((template) => template.status === "enabled");
const projectiles = (): ProjectileDoc[] => readdirSync(join(ROOT, "content/projectiles"))
  .filter((name) => name.endsWith(".json") && name !== "_index.json")
  .map((name) => JSON.parse(readFileSync(join(ROOT, "content/projectiles", name), "utf8")) as ProjectileDoc);

function basePlan(catalog: readonly TemplateDoc[]) {
  return createDeterministicHeroPlans({
    projectId: "matrix-hero", brief: { name: "矩陣英雄", concept: "驗證所有受控組合", moveNames: {} },
    sourceLock: { canonicalId: null, versionId: null }, origin: "鬥士",
    availableTemplateIds: catalog.map((template) => template.id), availableTemplates: catalog,
  })[0]!;
}

function* subsetsUpTo<T>(values: readonly T[], limit: number): Generator<T[]> {
  function* visit(start: number, selected: T[]): Generator<T[]> {
    if (selected.length > 0) yield [...selected];
    if (selected.length === limit) return;
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]!);
      yield* visit(index + 1, selected);
      selected.pop();
    }
  }
  yield* visit(0, []);
}

describe("hero forge live catalog matrix", () => {
  it("generates all 10 origins across all three deterministic profiles", () => {
    const catalog = templates();
    const projectileCatalog = projectiles();
    const failures: string[] = [];
    for (const [originIndex, origin] of ORIGINS.entries()) {
      const plans = createDeterministicHeroPlans({ projectId: `matrix-${originIndex}`, brief: { name: origin, concept: "矩陣", moveNames: {} }, sourceLock: { canonicalId: null, versionId: null }, origin, availableTemplateIds: catalog.map((template) => template.id), availableTemplates: catalog });
      expect(plans).toHaveLength(3);
      for (const plan of plans) {
        const result = compileGeneratedHeroDraft(generateHeroDraft(plan, { heroId: plan.planId, heroName: plan.title, templateParamsById: Object.fromEntries(catalog.map((template) => [template.id, defaultParamsFor(template)])) }), catalog, configs);
        expect(result.ok, `${origin}/${plan.title}: ${result.ok ? "" : result.failures.map((failure) => `${failure.slot}/${failure.message}`).join(";")}`).toBe(true);
        if (!result.ok) continue;
        for (const ability of Object.values(result.draft.abilityDrafts)) {
          const scenario = runHeroAbilityScenario(result.draft.champion, ability, { ticks: 180, relatedAbilities: Object.values(result.draft.abilityDrafts), relatedProjectiles: projectileCatalog });
          if (scenario.status === "rejected" || scenario.assertions.some((assertion) => assertion.status === "fail")) failures.push(`${origin}/${plan.title}/${ability.slot}:${scenario.rejectionReason ?? scenario.status}`);
        }
        const kit = runHeroKitScenario(result.draft.champion, result.draft.abilityDrafts, { ticksPerStep: 180, relatedProjectiles: projectileCatalog });
        if (kit.status === "rejected") failures.push(`${origin}/${plan.title}/kit:${kit.rejectedSlots.map((slot) => `${slot}=${kit.rejectionReasonsBySlot[slot]} ${JSON.stringify(kit.eventCountsBySlot[slot])}`).join(",")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("compiles and executes every enabled template in its active or passive lane", () => {
    const catalog = templates();
    const failures: string[] = [];
    const projectileCatalog = projectiles();
    for (const template of catalog) {
      const params = defaultParamsFor(template);
      const slot = expand(template, params).innateKind === "passive" ? "PASSIVE" : "Q";
      const plan = structuredClone(basePlan(catalog));
      plan.slots[slot] = { ...plan.slots[slot], products: [{ instanceId: "first", template: { ref: template.id, params } }], capabilityIds: [...template.requires] };
      const result = compileGeneratedHeroDraft(generateHeroDraft(plan, { heroId: `matrix-${template.id}`, heroName: template.name, templateParamsById: Object.fromEntries(catalog.map((item) => [item.id, defaultParamsFor(item)])) }), catalog, configs);
      if (!result.ok) { failures.push(`${template.id}: compile ${result.failures.map((failure) => failure.message).join(";")}`); continue; }
      const ability = result.draft.abilityDrafts[slot];
      for (const rank of [...new Set([1, ability.maxRank])]) {
        const scenario = runHeroAbilityScenario(result.draft.champion, ability, { rank, ticks: 180, relatedAbilities: Object.values(result.draft.abilityDrafts), relatedProjectiles: projectileCatalog });
        if (scenario.status === "rejected" || scenario.assertions.some((assertion) => assertion.status === "fail")) failures.push(`${template.id}/rank${rank}: scenario ${scenario.rejectionReason ?? scenario.status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("executes every ordered pair of compatible templates with explicit last-wins", () => {
    const catalog = templates();
    const projectileCatalog = projectiles();
    const failures: string[] = [];
    let cases = 0;
    for (const slot of ["PASSIVE", "Q"] as const) {
      const lane = catalog.filter((template) => templateFitsHeroSlot(template, slot));
      for (const first of lane) for (const second of lane) {
        if (first.id === second.id) continue;
        cases += 1;
        const plan = structuredClone(basePlan(catalog));
        plan.slots[slot] = { ...plan.slots[slot], products: [first, second].map((template, index) => ({ instanceId: `product-${index}`, template: { ref: template.id, params: defaultParamsFor(template) } })), templateConflictPolicy: "lastWins", capabilityIds: [...new Set([...first.requires, ...second.requires])] };
        const result = compileGeneratedHeroDraft(generateHeroDraft(plan, { heroId: `pair-${cases}`, heroName: "模板組合", templateParamsById: Object.fromEntries(catalog.map((template) => [template.id, defaultParamsFor(template)])) }), catalog, configs);
        if (!result.ok) { failures.push(`${first.id}>${second.id}:compile`); continue; }
        const scenario = runHeroAbilityScenario(result.draft.champion, result.draft.abilityDrafts[slot], { ticks: 180, relatedAbilities: Object.values(result.draft.abilityDrafts), relatedProjectiles: projectileCatalog });
        if (scenario.status === "rejected" || scenario.assertions.some((assertion) => assertion.status === "fail")) failures.push(`${first.id}>${second.id}:${scenario.rejectionReason ?? scenario.status}`);
      }
    }
    expect(cases).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });

  it("compiles every template at the eight-card boundary, repeated and in rotating mixed stacks", () => {
    const catalog = templates();
    const base = basePlan(catalog);
    const failures: string[] = [];
    let cases = 0;
    for (const slot of ["PASSIVE", "Q"] as const) {
      const lane = catalog.filter((template) => templateFitsHeroSlot(template, slot));
      for (let start = 0; start < lane.length; start++) for (const mixed of [false, true]) {
        const selected = Array.from({ length: 8 }, (_, index) => lane[(start + (mixed ? index : 0)) % lane.length]!);
        const plan = structuredClone(base);
        plan.slots[slot].products = selected.map((template, index) => ({ instanceId: `product-${index}`, template: { ref: template.id, params: defaultParamsFor(template) } }));
        plan.slots[slot].templateConflictPolicy = "lastWins";
        const result = compileGeneratedHeroDraft(generateHeroDraft(plan, { heroId: `boundary-${cases++}`, heroName: "八卡上限" }), catalog, configs);
        if (!result.ok) failures.push(`${slot}/${selected.map((template) => template.id).join(">")}: ${result.failures.map((failure) => failure.message).join(";")}`);
      }
    }
    expect(cases).toBe(catalog.length * 2);
    expect(failures).toEqual([]);
  });

  it.runIf(process.env.GGD_HERO_EXHAUSTIVE_MATRIX === "1")("compiles every legal 1-8 card subset in catalog and reverse order", () => {
    const catalog = templates();
    const lanes = (["PASSIVE", "Q"] as const).map((slot) => ({ slot, templates: catalog.filter((template) => templateFitsHeroSlot(template, slot)) }));
    const expectedCases = lanes.reduce((sum, lane) => {
      let choose = 1;
      for (let size = 1; size <= Math.min(8, lane.templates.length); size++) {
        choose = choose * (lane.templates.length - size + 1) / size;
        sum += choose * 2;
      }
      return sum;
    }, 0);
    const maxCases = Number(process.env.GGD_HERO_MATRIX_MAX_CASES ?? 30_000);
    if (!Number.isSafeInteger(maxCases) || expectedCases > maxCases) throw new Error(`Exhaustive scope is ${expectedCases} cases, exceeding GGD_HERO_MATRIX_MAX_CASES=${maxCases}; no exhaustive acceptance is claimed. Set an explicit capacity for a separately budgeted run.`);
    const defaults = Object.fromEntries(catalog.map((template) => [template.id, defaultParamsFor(template)]));
    const base = basePlan(catalog);
    const failures: string[] = [];
    let cases = 0;
    for (const { slot, templates: lane } of lanes) {
      for (const subset of subsetsUpTo(lane, 8)) for (const ordered of [subset, [...subset].reverse()]) {
        cases += 1;
        const plan = structuredClone(base);
        plan.slots[slot] = {
          ...plan.slots[slot],
          products: ordered.map((template, index) => ({ instanceId: `product-${index}`, template: { ref: template.id, params: defaultParamsFor(template) } })),
          templateConflictPolicy: "lastWins",
          capabilityIds: [...new Set(ordered.flatMap((template) => template.requires))],
        };
        const result = compileGeneratedHeroDraft(generateHeroDraft(plan, {
          heroId: `stack-${cases}`,
          heroName: "完整模板組合",
          templateParamsById: defaults,
        }), catalog);
        if (!result.ok && failures.length < 50) failures.push(`${slot}/${ordered.map((template) => template.id).join(">")}:${result.failures.map((failure) => failure.message).join(";")}`);
      }
    }
    expect(cases).toBe(expectedCases);
    expect(failures).toEqual([]);
  });
});
