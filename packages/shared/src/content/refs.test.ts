/** content-06 (content-dangling-ref): dangling hard refs error; soft refs warn. */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { ContentStore } from "./store";
import { validateReferences } from "./refs";
import { DanglingRefError } from "./errors";
import { zAbilityDoc, zItemDoc, zLootTableDoc } from "./schema/index";

const ABILITY = zAbilityDoc.parse({
  id: "test.q",
  schema: "ability@1",
  name: "Test Bolt",
  slot: "Q",
  castType: "skillshot",
  maxRank: 5,
  cooldown: [6],
  manaCost: [50],
  range: 10,
  effects: [
    {
      kind: "spawnProjectile",
      projectileId: "missing.bolt", // hard ref -> ERROR
      onHit: [
        { kind: "damage", damageType: "magic", amount: { flat: 10 } },
        { kind: "applyStatus", statusId: "missing.slow", duration: 1 }, // soft -> WARN
      ],
    },
  ],
  vfxKey: "fx.not-authored-yet", // soft ref -> WARN
});

describe("validateReferences (content-06)", () => {
  it("reports typed DanglingRefError for hard refs, warnings for soft refs", () => {
    cover("content-dangling-ref");
    const store = new ContentStore();
    store.add("abilities", ABILITY.id, ABILITY);

    const { errors, warnings } = validateReferences(store);

    expect(errors).toHaveLength(1);
    const err = errors[0]!;
    expect(err).toBeInstanceOf(DanglingRefError);
    expect(err.fromCollection).toBe("abilities");
    expect(err.fromId).toBe("test.q");
    expect(err.field).toBe("effects.0.projectileId");
    expect(err.targetCollection).toBe("projectiles");
    expect(err.targetId).toBe("missing.bolt");

    // vfx + status are SOFT: warn only (may not be authored yet)
    const warnTargets = warnings.map((w) => `${w.targetCollection}/${w.targetId}`);
    expect(warnTargets).toContain("vfx/fx.not-authored-yet");
    expect(warnTargets).toContain("status-effects/missing.slow");
  });

  it("passes once the referenced docs exist", () => {
    const store = new ContentStore();
    store.add("abilities", ABILITY.id, ABILITY);
    store.add("projectiles", "missing.bolt", { id: "missing.bolt", speed: 10, maxRange: 5, hitRadius: 0.4 });
    expect(validateReferences(store).errors).toHaveLength(0);
  });

  it("loot-table entries are hard refs to items", () => {
    const store = new ContentStore();
    const table = zLootTableDoc.parse({
      id: "t1",
      schema: "loot-table@1",
      entries: [{ itemId: "ember-rod", weight: 10 }],
    });
    store.add("loot-tables", table.id, table);
    const r1 = validateReferences(store);
    expect(r1.errors.map((e) => e.field)).toContain("entries.0.itemId");

    const item = zItemDoc.parse({
      id: "ember-rod",
      schema: "item@1",
      name: "Ember Rod",
      cost: 900,
      tier: 2,
      tags: ["ap"],
    });
    store.add("items", item.id, item);
    expect(validateReferences(store).errors).toHaveLength(0);
  });
});
