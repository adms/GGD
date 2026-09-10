import { describe, expect, it } from "vitest";
import { zEffectDef, zHookDef } from "../../content/schema/effect";
import type { EffectContext } from "../effects/effect";
import { effectHitDelivery, hitDeliveryPasses } from "./hitDelivery";

const context = {
  caster: 1, origin: "ability:fixture.contact", hitDelivery: "contact",
  castInstance: { caster: 1, abilityId: "fixture.contact", slot: "Q", tick: 0, serial: 1, creditedHooks: [] },
} as unknown as EffectContext;
const defense = {
  on: "onDamageTaken", defenseWindow: true, damageDelivery: "contact", maxTriggers: 1,
  onConsumed: "detachSource", effects: [{ kind: "damage", amount: { flat: 1 }, damageType: "physical",
    incomingPct: { perRank: [0], negateOriginal: true, maxChainDepth: 0 } }],
};

describe("contact delivery authoring and provenance", () => {
  it("requires both explicit contact authoring and a matching accepted cast", () => {
    expect(effectHitDelivery({ contact: true }, context)).toBe("contact");
    expect(effectHitDelivery({}, context)).toBeUndefined();
    for (const patch of [{ castInstance: undefined }, { origin: "ability:another" },
      { caster: 2 }, { incoming: {} }, { hitDelivery: undefined }]) {
      expect(effectHitDelivery({ contact: true }, { ...context, ...patch } as EffectContext)).toBeUndefined();
    }
  });
  it.each(["projectile", "periodic", "other"] as const)("the contact checkbox cannot override %s", hitDelivery => {
    expect(effectHitDelivery({ contact: true }, { ...context, hitDelivery })).toBe(hitDelivery);
    expect(hitDeliveryPasses("contact", hitDelivery)).toBe(false);
  });
  it("unknown delivery fails closed; direct accepts only contact or projectile", () => {
    expect(hitDeliveryPasses("contact", undefined)).toBe(false);
    expect(hitDeliveryPasses("other", undefined)).toBe(true);
    for (const value of [undefined, "other", "periodic"] as const) expect(hitDeliveryPasses("direct", value)).toBe(false);
    for (const value of ["contact", "projectile"] as const) expect(hitDeliveryPasses("direct", value)).toBe(true);
  });
  it("keeps the three damage shapes editable and roundtrippable", () => {
    for (const value of [
      { kind: "damage" }, { kind: "damageArea", radius: 2 }, { kind: "damageLine", length: 2, width: 1 },
    ]) {
      const parsed = zEffectDef.parse({ ...value, damageType: "physical", amount: { flat: 1 }, contact: true });
      expect(parsed).toHaveProperty("contact", true);
      expect(zEffectDef.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    }
  });
  it("accepts only a single-use damage interception as an active window", () => {
    expect(zHookDef.safeParse(defense).success).toBe(true);
    for (const patch of [{ on: "onDamageDealt" }, { effects: [] }, { maxTriggers: 2 },
      { onConsumed: undefined }, { perTarget: true }, { damageDelivery: "periodic" }, { damageDelivery: undefined }]) {
      expect(zHookDef.safeParse({ ...defense, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
    expect(zHookDef.safeParse({ on: "onTick", damageDelivery: "contact", effects: [] }).success).toBe(false);
  });
});
