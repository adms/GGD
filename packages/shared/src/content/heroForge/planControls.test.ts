import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TemplateDoc } from "../schema/template";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";
import { zHeroPlan } from "./plan";
import { createDeterministicHeroPlans, heroTemplateDefaultParams } from "./planner";
import { runHeroAbilityScenario } from "./scenario";
import { championStatBase } from "../../sim/stats/attributes";
import { Stat } from "../../sim/stats/statTypes";

const ROOT = join(import.meta.dirname, "../../../../..");
const catalog = (): TemplateDoc[] => readdirSync(join(ROOT, "content/ability-templates"))
  .filter((name) => name.endsWith(".json") && name !== "_index.json")
  .map((name) => JSON.parse(readFileSync(join(ROOT, "content/ability-templates", name), "utf8")) as TemplateDoc)
  .filter((template) => template.status === "enabled");

function plan() {
  const templates = catalog();
  return { templates, value: createDeterministicHeroPlans({
    projectId: "control-proof", brief: { name: "控制證明", concept: "驗證設計師欄位", moveNames: {} },
    sourceLock: { canonicalId: null, versionId: null }, origin: "鬥士",
    availableTemplateIds: templates.map((template) => template.id), availableTemplates: templates,
  })[0]! };
}

describe("hero plan designer controls", () => {
  it("starts mirrored on-hit reaction from a visible non-zero safety cooldown", () => {
    const template = catalog().find((item) => item.id === "tpl-on-hit-react")!;
    expect(heroTemplateDefaultParams(template)).toMatchObject({ internalCooldown: 0.5 });
  });

  it.each([
    ["duplicate instance", (value: ReturnType<typeof plan>["value"]) => { value.slots.Q.products = [value.slots.Q.products[0]!, value.slots.Q.products[0]!]; }],
    ["negative passive cooldown", (value: ReturnType<typeof plan>["value"]) => { value.slots.PASSIVE.tuning.cooldownSec = -1; }],
    ["nonstandard new Q ranks", (value: ReturnType<typeof plan>["value"]) => { value.slots.Q.maxRank = 6; }],
  ])("rejects %s", (_label, mutate) => {
    const value = structuredClone(plan().value);
    mutate(value);
    expect(zHeroPlan.safeParse(value).success).toBe(false);
  });

  it("carries stat, tuning and per-template parameters into compiled runtime docs", () => {
    const { templates, value } = plan();
    const strike = templates.find((template) => template.id === "tpl-single-strike")!;
    value.archetype = "mage";
    value.statOverrides = { armor: "大", maxHealth: "大" };
    value.slots.Q = { ...value.slots.Q, products: [{ instanceId: "strike", template: { ref: strike.id, params: { damage: { perRank: [777], ratios: [] }, damageType: "magic", castTimeSec: 0 } } }], capabilityIds: [...strike.requires], tuning: { cooldownSec: 3.5, manaCost: 17, range: 9 } };
    const generated = generateHeroDraft(value, { heroId: "control-proof", heroName: "控制證明" });
    expect(generated.champion).toMatchObject({ archetype: "mage", origin: value.origin, baseStats: {}, growth: {}, statOverrides: value.statOverrides });
    expect(generated.champion.attributes).toBeUndefined();
    expect(generated.abilityDrafts.Q).toMatchObject({ cooldown: [3.5, 3.5, 3.5, 3.5], manaCost: [17, 17, 17, 17], range: 9 });
    const configs = [JSON.parse(readFileSync(join(ROOT, "content/config/stat-normalization.json"), "utf8"))];
    const compiled = compileGeneratedHeroDraft(generated, templates, configs);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      const inherited = compileGeneratedHeroDraft(generateHeroDraft({ ...value, statOverrides: {} }, { heroId: "control-proof", heroName: "控制證明" }), templates, configs);
      expect(inherited.ok).toBe(true);
      if (inherited.ok) expect(championStatBase(compiled.draft.champion, Stat.Armor, configs[0].referenceLevel)).toBeGreaterThan(championStatBase(inherited.draft.champion, Stat.Armor, configs[0].referenceLevel));
      expect(compiled.draft.champion).not.toHaveProperty("statOverrides");
      expect(JSON.stringify(compiled.draft.abilityDrafts.Q.effects)).toContain('"perRank":[777,777,777,777]');
    }
  });

  it("equips active innate and passive EX products through their actual mechanisms", () => {
    const { templates, value } = plan();
    value.slots.PASSIVE.products = [{ instanceId: "active-innate", template: { ref: "tpl-single-strike", inheritDefaults: true, params: {} } }];
    value.slots.PASSIVE.tuning = { cooldownSec: 2, manaCost: 10, range: 9 };
    value.slots.EX.products = [{ instanceId: "passive-ex", template: { ref: "tpl-on-attack", inheritDefaults: true, params: {} } }];
    const result = compileGeneratedHeroDraft(generateHeroDraft(value, { heroId: "mechanism-proof", heroName: "機制驗證" }), templates);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.abilityDrafts.PASSIVE.innateKind).toBe("active");
    expect(result.draft.abilityDrafts.EX.innateKind).toBeUndefined();
    const relatedAbilities = Object.values(result.draft.abilityDrafts);
    const innate = runHeroAbilityScenario(result.draft.champion, result.draft.abilityDrafts.PASSIVE, { relatedAbilities });
    expect(innate.status).toBe("accepted");
    expect(innate.eventCounts.abilityCast).toBeGreaterThan(0);
    expect(innate.events.every((event) => event.actorPose.caster && event.actorPose.target)).toBe(true);
    const ex = runHeroAbilityScenario(result.draft.champion, result.draft.abilityDrafts.EX, { relatedAbilities });
    expect(ex.status).toBe("passive");
    expect(ex.eventCounts.abilityCast ?? 0).toBe(0);
  });

  it.each(["PASSIVE", "EX"] as const)("preserves legacy %s ranks in authoring but blocks unreachable runtime ranks", (slot) => {
    const { templates, value } = plan();
    value.slots[slot].maxRank = 3;
    const persisted = zHeroPlan.parse(value);
    expect(persisted.slots[slot].maxRank).toBe(3);
    const result = compileGeneratedHeroDraft(generateHeroDraft(persisted, { heroId: "rank-proof", heroName: "階級證明" }), templates);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures).toContainEqual(expect.objectContaining({ slot, message: expect.stringContaining("maxRank 必須為 1") }));
  });

  it.each(["PASSIVE", "Q", "W", "E", "R", "EX"] as const)("rejects maxRank override bypass for %s", (slot) => {
    const { templates, value } = plan();
    value.slots[slot].abilityOverrides = { maxRank: 6 };
    const result = compileGeneratedHeroDraft(generateHeroDraft(value, { heroId: "rank-override-proof", heroName: "覆寫證明" }), templates);
    expect(result.ok).toBe(false);
  });

  it.each(["id", "schema", "slot", "template", "name", "description", "castType", "targetsEnemies", "innateKind", "passive", "marks", "radius"])("rejects shadowed or protected ability override %s", (key) => {
    const { value } = plan();
    value.slots.Q.abilityOverrides = { [key]: "unreachable-author-value" };
    const parsed = zHeroPlan.safeParse(value);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ["slots", "Q", "abilityOverrides"] }));
  });
});
