import { describe, expect, it } from "vitest";
import { HERO_PROJECT_SCHEMA, HERO_SECTION_IDS } from "./constants";
import { createDeterministicHeroPlans } from "./planner";
import { defaultHeroPresentation } from "./presentation";
import { migrateHeroProject, serializeHeroProject } from "./migration";
import { zHeroProject } from "./schema";

function project() {
  const brief = { name: "守望者", concept: "保留原文\n「玩笑不是技能」", moveNames: {} };
  return zHeroProject.parse({ schema: HERO_PROJECT_SCHEMA, projectId: "watcher", revision: 4, brief,
    sourceLock: { canonicalId: "watcher", versionId: "original" },
    acceptedPlan: createDeterministicHeroPlans({ projectId: "watcher", brief, origin: "鬥士",
      sourceLock: { canonicalId: "watcher", versionId: "original" },
      availableTemplateIds: ["tpl-on-attack", "tpl-single-strike", "tpl-buff-self", "tpl-leap-strike", "tpl-ground-nova", "tpl-instant-blast"],
    })[0], presentation: defaultHeroPresentation(), receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 4, state: "draft", fieldOwnership: {} }])),
    validationState: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 4, status: "idle", diagnosticCodes: [] }])),
  });
}

describe("portable hero project migration", () => {
  it("removes only empty legacy stat containers and never quantizes manual numbers", () => {
    const raw: any = project();
    raw.acceptedPlan.statOverrides = { baseStats: {}, growth: {}, attributes: {} };
    const migrated = migrateHeroProject(raw);
    expect(migrated.project.acceptedPlan!.statOverrides).toEqual({});
    expect(migrated.migrated).toBe(true);
    expect(raw.acceptedPlan.statOverrides).toEqual({ baseStats: {}, growth: {}, attributes: {} });
    raw.acceptedPlan.statOverrides.baseStats.maxHealth = 1234;
    const before = JSON.stringify(raw);
    expect(() => migrateHeroProject(raw)).toThrow();
    expect(JSON.stringify(raw)).toBe(before);
  });
  it("preserves accepted text/parameters/locks while moving all provider metadata to a local sidecar", () => {
    const expected = project();
    // v1 stored explicit params and had no default-inheritance flag. Do not
    // model v1 by dropping a v2 flag and then demand that migration invent it:
    // opting old drafts into today's defaults would change their behavior.
    for (const slot of Object.values(expected.acceptedPlan!.slots)) {
      for (const product of slot.products) delete product.template.inheritDefaults;
    }
    expected.acceptedPlan!.slots.Q.products[0]!.template.params = { castTimeSec: 0.9, damage: { flat: 127 } };
    const legacy: any = structuredClone(expected);
    legacy.schema = "ggd-hero-project@1";
    legacy.acceptedPlan.schema = "ggd-hero-plan@1";
    for (const slot of Object.values(legacy.acceptedPlan.slots) as any[]) {
      slot.templateIds = slot.products.map((p: any) => p.template.ref);
      slot.templateParamsById = Object.fromEntries(slot.products.map((p: any) => [p.template.ref, p.template.params]));
      delete slot.products;
    }
    legacy.providerPreference = "byok";
    legacy.sections.skills.fieldOwnership["acceptedPlan.slots.Q.templateIds"] = "locked";
    legacy.receipts = [{ kind: "proposal-accepted", projectRevision: 4, digest: "a".repeat(64),
      providerKind: "byok", modelId: "private-model", providerOrigin: "https://private.example", requestId: "private-request" }];
    const originalBytes = JSON.stringify(legacy);
    const result = migrateHeroProject(legacy);
    expect(result.project.brief).toEqual(expected.brief);
    expect(result.project.acceptedPlan).toEqual(expected.acceptedPlan);
    expect(result.project.acceptedPlan!.slots.Q.products[0]!.template.inheritDefaults).toBeUndefined();
    expect(result.project.sections.skills.fieldOwnership["acceptedPlan.slots.Q.products"]).toBe("locked");
    expect(result.privateData).toMatchObject({ providerPreference: "byok", receipts: [{ modelId: "private-model" }] });
    expect(serializeHeroProject(result.project)).not.toMatch(/private-|providerOrigin|providerPreference/);
    expect(JSON.stringify(legacy)).toBe(originalBytes);
    expect(migrateHeroProject(result.project).migrated).toBe(false);
    expect(() => migrateHeroProject({ ...result.project, schema: "ggd-hero-project@99" })).toThrow(/VERSION_UNSUPPORTED/);
  });
});
