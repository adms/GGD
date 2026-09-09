import { expect, it } from "vitest";
import { ContentStore } from "./store";
import { validateReferences } from "./refs";
import { zAbilityDoc } from "./schema/ability";
import { analyseAbility } from "./abilityNoOpEffects";
const make = (effect: unknown) => zAbilityDoc.parse({ schema: "ability@1", id: "test-recast.e", name: "recast", slot: "E", castType: "skillshot", maxRank: 1,
  cooldown: [10], manaCost: [20], range: 4, effects: [{ kind: "damage", amount: { flat: 1 } }],
  recast: { windowSec: 1, minIntervalSec: .2, cost: "first", stages: [{ effects: [effect] }] } });
it("stage programs cannot hide missing hard references or empty effects", () => {
  const doc = make({ kind: "spawnProjectile", projectileId: "missing-stage-projectile", onHit: [] });
  const store = new ContentStore(); store.add("abilities", doc.id, doc);
  expect(validateReferences(store).errors.map(e => e.field)).toContain("recast.stages.0.effects.0.projectileId");
  expect(analyseAbility(make({ kind: "applyBuff", duration: 1, modifiers: [] })).map(f => f.path)).toContain("recast.stages[0].effects[0]");
});
