import { describe, expect, it } from "vitest";
import { ContentStore } from "./store";
import { validateReferences } from "./refs";
import { zAbilityDoc } from "./schema/ability";
import { analyseAbility } from "./abilityNoOpEffects";

const make = (branch: "onConsumed" | "onMissing", effect: unknown) => ({
  schema: "ability@1", id: "fixture-consume.q", name: "fixture consume", slot: "Q",
  castType: "targeted", maxRank: 1, cooldown: [1], manaCost: [1], range: 4,
  statusCost: { statusId: "fixture-energy", count: 3 },
  effects: [{ kind: "consumeStatus", shape: "single", statusId: "fixture-curse", count: "all",
    onConsumed: [{ kind: "heal", amount: { flat: 1 } }],
    [branch]: [effect],
  }],
});

describe("status consumption authoring contracts", () => {
  it.each(["onConsumed", "onMissing"] as const)("%s validates nested schema and hard references", branch => {
    expect(zAbilityDoc.safeParse(make(branch, { kind: "damage", amount: { unknown: 1 } })).success).toBe(false);
    const doc = zAbilityDoc.parse(make(branch, { kind: "spawnProjectile", projectileId: "fixture-missing", onHit: [] }));
    const store = new ContentStore(); store.add("abilities", doc.id, doc);
    const { errors, warnings } = validateReferences(store);
    expect(errors.map(e => e.field)).toEqual([`effects.0.${branch}.0.projectileId`]);
    expect(warnings.map(e => e.field)).toContain("statusCost.statusId");
    expect(warnings.map(e => e.field)).toContain("effects.0.statusId");
  });

  it.each(["onConsumed", "onMissing"] as const)("%s keeps nested no-op checks active", branch => {
    const doc = zAbilityDoc.parse(make(branch, { kind: "applyBuff", modifiers: [], duration: 1 }));
    expect(analyseAbility(doc).some(f => f.path === `effects[0].${branch}[0]`)).toBe(true);
  });
});
