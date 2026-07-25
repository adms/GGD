/**
 * hero-template (owner directive 2026-07-25, step 3) — the 新英雄模板 builder must
 * emit a document bundle that PASSES the content bundle build, not just the
 * per-doc schema. The two properties that make that true:
 *
 *   • every emitted ability@1 passes zAbilityDoc and the champion@1 passes
 *     zChampionDoc (schema — what the per-doc /validate checks);
 *   • the champion's HARD refs (modelKey, embedded ability ids, exAbility,
 *     passiveAbility) all RESOLVE once the standalone twins are in the store
 *     (references — what content:build checks, and the reason a single-doc
 *     champion create is not enough).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentStore, validateReferences, COLLECTIONS } from "@ggd/shared/content";
import { blankHeroForm, buildHeroDocs, type HeroTemplateForm } from "./heroTemplate";

function fullForm(over: Partial<HeroTemplateForm> = {}): HeroTemplateForm {
  return {
    ...blankHeroForm(),
    id: "godie-test",
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    tags: ["melee"],
    baseStats: { maxHealth: 600, ad: 55 },
    growth: { maxHealth: 80, ad: 3 },
    q: { name: "Q技", castType: "skillshot", maxRank: 5, cooldown: 8, manaCost: 50, range: 600 },
    w: { name: "W技", castType: "self", maxRank: 5, cooldown: 12, manaCost: 40, range: 0 },
    e: { name: "E技", castType: "targeted", maxRank: 5, cooldown: 10, manaCost: 60, range: 500 },
    r: { name: "R技", castType: "ground", maxRank: 3, cooldown: 90, manaCost: 100, range: 700 },
    ex: { name: "EX技", castType: "self", maxRank: 1, cooldown: 0, manaCost: 0, range: 0 },
    passive: { name: "天生技", castType: "self", maxRank: 1, cooldown: 0, manaCost: 0, range: 0 },
    ...over,
  };
}

describe("新英雄模板 builder", () => {
  it("emits abilities-before-champion, with the champion LAST", () => {
    cover("content-admin-gate");
    const docs = buildHeroDocs(fullForm());
    // Q/W/E/R + EX + PASSIVE, then the champion.
    expect(docs.map((d) => `${d.collection}/${d.id}`)).toEqual([
      "abilities/godie-test.q",
      "abilities/godie-test.w",
      "abilities/godie-test.e",
      "abilities/godie-test.r",
      "abilities/godie-test.ex",
      "abilities/godie-test.passive",
      "champions/godie-test",
    ]);
    expect(docs.at(-1)!.collection).toBe("champions");
  });

  it("every emitted ability passes zAbilityDoc and the champion passes zChampionDoc", () => {
    cover("content-admin-gate");
    for (const d of buildHeroDocs(fullForm())) {
      const schema = COLLECTIONS[d.collection].schema;
      const r = schema.safeParse(d.doc);
      expect(r.success, `${d.collection}/${d.id}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("the PASSIVE twin declares innateKind and stays effect-less; EX is slot EX", () => {
    cover("content-admin-gate");
    const byId = new Map(buildHeroDocs(fullForm()).map((d) => [d.id, d.doc]));
    const passive = byId.get("godie-test.passive")!;
    expect(passive["slot"]).toBe("PASSIVE");
    expect(passive["innateKind"]).toBe("passive");
    expect(passive["effects"]).toEqual([]);
    expect(byId.get("godie-test.ex")!["slot"]).toBe("EX");
    const champ = byId.get("godie-test")!;
    expect(champ["exAbility"]).toBe("godie-test.ex");
    expect(champ["passiveAbility"]).toBe("godie-test.passive");
  });

  it("the embedded Q/W/E/R twins carry no schema key and match their slot", () => {
    cover("content-admin-gate");
    const champ = buildHeroDocs(fullForm()).at(-1)!.doc;
    const abilities = champ["abilities"] as Record<string, Record<string, unknown>>;
    for (const slot of ["Q", "W", "E", "R"] as const) {
      expect("schema" in abilities[slot]!).toBe(false);
      expect(abilities[slot]!["slot"]).toBe(slot);
    }
  });

  it("PASSES the content bundle build: no dangling HARD ref once twins are in the store", () => {
    cover("content-admin-gate");
    const form = fullForm();
    const store = new ContentStore();
    // the one external hard ref the wizard cannot author — a real model must
    // already exist for modelKey to resolve; stub it so the check is about the
    // BUNDLE the wizard emits, not the roster it joins.
    store.add("models", form.modelKey, { id: form.modelKey });
    for (const d of buildHeroDocs(form)) {
      const parsed = COLLECTIONS[d.collection].schema.parse(d.doc);
      store.add(d.collection, d.id, parsed);
    }
    const report = validateReferences(store);
    expect(report.errors, JSON.stringify(report.errors.map((e) => e.message))).toEqual([]);
  });

  it("omits EX / PASSIVE (and their refs) when the rows are not filled in", () => {
    cover("content-admin-gate");
    const docs = buildHeroDocs(fullForm({ ex: null, passive: null }));
    expect(docs.map((d) => d.id)).toEqual([
      "godie-test.q",
      "godie-test.w",
      "godie-test.e",
      "godie-test.r",
      "godie-test",
    ]);
    const champ = docs.at(-1)!.doc;
    expect("exAbility" in champ).toBe(false);
    expect("passiveAbility" in champ).toBe(false);
  });
});
