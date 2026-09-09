import { beforeAll, describe, expect, it } from "vitest";
import { zAbilityDoc } from "../../content/schema/ability";
import { asSeatId, asTeamId, type ChampionId, type StatusId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { Abilities, registerChampion } from "../content/registry";
import type { AbilityDef } from "../content/defs";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { installMark } from "../marks";
import { castAbility, learnEx } from "./abilitySystem";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { hasStatus } from "../effects/effectCommon";
import { clearPools } from "../clearPools";

const HERO = "fixture-status-cost" as ChampionId;
const ENERGY = "fixture-status-cost.energy" as StatusId;
const ability = (slot: "Q" | "W") => zAbilityDoc.parse({
  schema: "ability@1", id: `${HERO}.${slot.toLowerCase()}`, name: `fixture ${slot}`, slot,
  castType: "targeted", maxRank: 1, range: 30, cooldown: [5], manaCost: [20], recoverySec: 0,
  castTimeSec: slot === "Q" ? 0 : 0.2,
  statusCost: { statusId: ENERGY, count: 3 },
  effects: [{ kind: "damage", damageType: "true", amount: { flat: 70 } }],
}) as AbilityDef;
const Q = ability("Q");
const W = ability("W");
const CURSE = "fixture-status-cost.r-curse" as StatusId;
const BOON = "fixture-status-cost.ex-boon" as StatusId;
const R = zAbilityDoc.parse({ ...Q, schema: "ability@1", id: `${HERO}.r`, slot: "R", name: "fixture curse",
  statusCost: undefined, manaCost: [0], effects: [{ kind: "applyBuff", sourceScope: "caster", statusId: CURSE,
    stackKey: "r-curse", maxStacks: 1, duration: 4,
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: -0.15 }] }],
}) as AbilityDef;
const EX = zAbilityDoc.parse({ ...Q, schema: "ability@1", id: `${HERO}.ex`, slot: "EX", name: "fixture reversal",
  effects: [{ kind: "consumeStatus", shape: "single", statusId: CURSE, count: "all", appliedBy: "self",
    onConsumed: [{ kind: "applyBuff", sourceScope: "caster", statusId: BOON, duration: 2,
      modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.1 }] }],
    onMissing: [{ kind: "damage", damageType: "true", amount: { flat: 70 } }],
  }],
}) as AbilityDef;
beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(EX.id, EX);
  // Keep the borrowed base stats, not Sela's onAbilityHit burn: that unrelated
  // passive legitimately adds damage even to the curse-only R fixture.
  registerChampion({ ...SELA, id: HERO, passive: undefined, exAbility: EX.id, abilities: { ...SELA.abilities, Q, W, R } });
});

function rig(count = 3) {
  const world = new SimWorld(SKELETON_ARENA, 29);
  const centre = SKELETON_ARENA.zones[0]!.center;
  const ids = [0, 1].map(seat => spawnChampion(world, { zone: 0, championId: HERO,
    seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: centre.x + seat, z: centre.z + 10 } }));
  const caster = ids[0]!; const target = ids[1]!;
  const ab = world.abilities.get(caster)!; ab.slots.Q.rank = 1; ab.slots.W.rank = 1;
  installMark(world, caster, { markId: ENERGY, initial: count, max: 3, durationSec: -1, resetOn: "never" });
  const cast = (slot: "Q" | "W" = "Q") => castAbility(world, caster, slot, { type: "entity", entityId: target });
  const resource = () => world.marks.get(caster)!.get(ENERGY)!.count;
  return { world, caster, target, ab, cast, resource };
}

describe("ability status cost", () => {
  it("insufficient resources reject before mana, cooldown, or cast effects are paid", () => {
    const r = rig(2); const hp = r.world.health.get(r.caster)!;
    const mana = hp.mana; const targetHp = r.world.health.get(r.target)!.hp;
    expect(r.cast()).toBe("no-resource");
    expect(hp.mana).toBe(mana); expect(r.ab.slots.Q.cooldownRemainingTicks).toBe(0);
    expect(r.ab.cast).toBeFalsy(); expect(r.resource()).toBe(2);
    r.world.step(new Map());
    expect(r.world.health.get(r.target)!.hp).toBe(targetHp);
  });

  it("valid cast debits once and executes, while another same-tick skill cannot double spend", () => {
    const r = rig(); const hp = r.world.health.get(r.caster)!;
    const mana = hp.mana; const targetHp = r.world.health.get(r.target)!.hp;
    expect(r.cast()).toBe("ok"); expect(r.resource()).toBe(0);
    expect(hp.mana).toBe(mana - 20); expect(r.ab.slots.Q.cooldownRemainingTicks).toBeGreaterThan(0);
    expect(r.cast("W")).toBe("no-resource"); expect(hp.mana).toBe(mana - 20);
    r.world.step(new Map()); expect(r.world.health.get(r.target)!.hp).toBeLessThan(targetHp);
  });

  it("invalid targeting does not consume sufficient resources", () => {
    const r = rig(); const mana = r.world.health.get(r.caster)!.mana;
    expect(castAbility(r.world, r.caster, "Q", { type: "self" })).toBe("bad-target");
    expect(r.resource()).toBe(3); expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    expect(r.ab.slots.Q.cooldownRemainingTicks).toBe(0);
  });

  it("a channel pays up front and interruption does not refund or execute its payload", () => {
    const r = rig(); const targetHp = r.world.health.get(r.target)!.hp;
    expect(r.cast("W")).toBe("ok"); expect(r.resource()).toBe(0); expect(r.ab.cast).not.toBeNull();
    r.world.status.get(r.caster)!.effects.push({ sourceId: "fixture-stun", statusId: "fixture-stun" as StatusId,
      expiresAtTick: r.world.tick + 30, stun: true });
    r.world.step(new Map());
    expect(r.ab.cast).toBeNull(); expect(r.resource()).toBe(0);
    expect(r.world.health.get(r.target)!.hp).toBe(targetHp);
  });

  it("expired counters cannot pay and unrelated mana refusal keeps resources", () => {
    const r = rig();
    r.world.marks.get(r.caster)!.get(ENERGY)!.expiresAtTick = r.world.tick;
    expect(r.cast()).toBe("no-resource"); expect(r.resource()).toBe(3);
    const enough = rig(); enough.world.health.get(enough.caster)!.mana = 0;
    expect(enough.cast()).toBe("no-mana"); expect(enough.resource()).toBe(3);
  });

  it("runtime registration retains the parsed cost and schema rejects malformed costs", () => {
    expect(Abilities.get(Q.id).statusCost).toEqual({ statusId: ENERGY, count: 3 });
    for (const count of [0, -1, 1.5, 1000, "remaining"]) {
      expect(zAbilityDoc.safeParse({ ...Q, schema: "ability@1", statusCost: { statusId: ENERGY, count } }).success).toBe(false);
    }
  });

  it("all costs reject empty or invalid targets, then atomically consume all live stacks", () => {
    const all = zAbilityDoc.parse({ ...Q, schema: "ability@1", statusCost: { statusId: ENERGY, count: "all" } }) as AbilityDef;
    Abilities.register(all.id, all);
    try {
      const empty = rig(0); expect(empty.cast()).toBe("no-resource");
      const r = rig(2); const mana = r.world.health.get(r.caster)!.mana;
      expect(castAbility(r.world, r.caster, "Q", { type: "entity", entityId: r.caster })).toBe("bad-target");
      expect(r.resource()).toBe(2); expect(r.world.health.get(r.caster)!.mana).toBe(mana);
      expect(r.cast()).toBe("ok"); expect(r.resource()).toBe(0);
      r.ab.slots.Q.cooldownRemainingTicks = 0; expect(r.cast()).toBe("no-resource");
    } finally { Abilities.register(Q.id, Q); }
  });

  it.each([false, true])("real R/EX casts combine one resource debit with the correct live branch (cleansed=%s)", cleansed => {
    const r = rig(); r.ab.slots.R.rank = 1; expect(learnEx(r.world, r.caster)).toBe(true);
    const target = { type: "entity" as const, entityId: r.target };
    expect(castAbility(r.world, r.caster, "R", target)).toBe("ok");
    if (cleansed) clearPools(r.world, r.target, { pools: { buffs: true }, polarity: "debuff" });
    const hp = r.world.health.get(r.target)!.hp;
    expect(castAbility(r.world, r.caster, "EX", target)).toBe("ok");
    r.world.step(new Map());
    expect(r.resource()).toBe(0);
    expect(hasStatus(r.world, r.target, CURSE, r.caster)).toBe(false);
    expect(hasStatus(r.world, r.target, BOON, r.caster)).toBe(!cleansed);
    if (cleansed) expect(r.world.health.get(r.target)!.hp).toBeLessThan(hp);
    else expect(r.world.health.get(r.target)!.hp).toBe(hp);
  });
});
