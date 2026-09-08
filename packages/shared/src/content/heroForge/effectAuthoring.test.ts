import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TemplateDoc } from "../schema/template";
import { defaultParamsFor } from "../templates/paramsSchema";
import { extractRefs } from "../refs";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";
import { createDeterministicHeroPlans } from "./planner";
import { materializeHeroEffectAuthoring, pinHeroPlanTemplates } from "./effectAuthoring";
import { defaultHeroPresentation } from "./presentation";

const REPO = join(import.meta.dirname, "../../../../..");

function templates(): TemplateDoc[] {
  return readdirSync(join(REPO, "content/ability-templates"))
    .filter((name) => name.endsWith(".json") && name !== "_index.json")
    .map((name) => JSON.parse(readFileSync(join(REPO, "content/ability-templates", name), "utf8")) as TemplateDoc)
    .filter((template) => template.status === "enabled");
}

describe("hero Definition / Product / Chain adapter", () => {
  it("recompiles all six generated slots without changing mechanics", () => {
    const catalog = templates();
    const plan = createDeterministicHeroPlans({
      projectId: "graph-watcher",
      brief: { name: "守望者", concept: "保護隊友", moveNames: {} },
      sourceLock: { canonicalId: null, versionId: null },
      origin: "鬥士",
      availableTemplateIds: catalog.map((template) => template.id),
    })[0]!;
    const generated = generateHeroDraft(plan, {
      heroId: "graph-watcher",
      heroName: "守望者",
      templateParamsById: Object.fromEntries(catalog.map((template) => [template.id, defaultParamsFor(template)])),
    });
    const compiled = compileGeneratedHeroDraft(generated, catalog);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const graph = materializeHeroEffectAuthoring(plan, catalog, { heroId: "graph-watcher", heroName: "守望者", templateParamsById: Object.fromEntries(catalog.map((template) => [template.id, defaultParamsFor(template)])) });
    expect(Object.keys(graph)).toEqual(["PASSIVE", "Q", "W", "E", "R", "EX"]);
    expect(graph.Q.compiled.effects).toEqual(compiled.draft.abilityDrafts.Q.effects);

    const tampered = pinHeroPlanTemplates(plan, catalog);
    tampered.slots.Q.products[0]!.template.contentSha256 = `sha256:${"0".repeat(64)}`;
    expect(() => materializeHeroEffectAuthoring(tampered, catalog, { heroId: "graph-watcher", heroName: "守望者" })).toThrow(/TEMPLATE_PIN_MISMATCH/);
  });

  it("includes every layered VFX id in the ordinary content dependency graph", () => {
    const catalog = templates();
    const plan = createDeterministicHeroPlans({
      projectId: "vfx-watcher",
      brief: { name: "守望者", concept: "保護隊友", moveNames: {} },
      sourceLock: { canonicalId: null, versionId: null },
      origin: "鬥士",
      availableTemplateIds: catalog.map((template) => template.id),
    })[0]!;
    const presentation = defaultHeroPresentation();
    presentation.slots.Q.vfxLayers = [{ vfxKey: "fx.first" }, { vfxKey: "fx.second", delayMs: 100 }];
    const generated = generateHeroDraft(plan, { heroId: "vfx-watcher", heroName: "守望者", presentation });
    const edges = extractRefs("abilities", generated.abilityDrafts.Q);
    expect(edges.filter((edge) => edge.field.includes("vfxLayers")).map((edge) => edge.targetId)).toEqual(["fx.first", "fx.second"]);
  });
});
