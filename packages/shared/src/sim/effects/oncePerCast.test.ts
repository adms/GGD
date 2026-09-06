import { beforeAll, describe, expect, it } from "vitest";
import { zAbilityDoc } from "../../content/schema/ability";
import { zHookDef } from "../../content/schema/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type StatusId, type ProjectileId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { registerChampion } from "../content/registry";
import type { AbilityDef } from "../content/defs";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { ModOp, type HookDef } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { castAbility, castApproachSystem } from "../abilities/abilitySystem";
import { installMark } from "../marks";
import { noteAbilityCast, digestCastCredits, forgetCasts } from "../content/castLedger";
import { CAST_APPROACHES } from "../content/castApproachState";
import { runEffects } from "./effectRunner";
import type { EffectDef, TriggerDamage } from "./effect";
import { fireHooks } from "./hooks";
import { combatResolveSystem } from "../combat/damage";

const HERO = "fixture-cast-credit" as ChampionId;
const ENERGY = "fixture-cast-credit.energy" as StatusId;
const OTHER = "fixture-cast-credit.ordinary" as StatusId;
const hit: EffectDef = { kind: "damage", damageType: "true", amount: { flat: 10 } };
const gain: Extract<EffectDef, { kind: "applyStatus" }> = { kind: "applyStatus", statusId: ENERGY, stacks: 1, duration: 5 };
const credit: HookDef = { on: "onDamageDealt", oncePerCast: true, victim: "enemy", target: "self", effects: [gain] };
const wave: EffectDef = { kind: "delayed", shape: "single", delaySec: 0.1, intervalSec: 0.45, count: 3, effects: [hit] };
const dot: EffectDef = { kind: "dot", damageType: "true", amountPerTick: { flat: 10 }, intervalSec: 0.1, durationSec: 0.5 };
beforeAll(registerSkeletonContent);

function rig(effects: EffectDef[] = [hit], overrides: Partial<AbilityDef> = {}, hooks: HookDef[] = [credit]) {
  const Q = zAbilityDoc.parse({ schema: "ability@1", id: `${HERO}.q`, name: "cast-credit fixture", slot: "Q",
    castType: "targeted", maxRank: 1, range: 30, cooldown: [0], manaCost: [0], castTimeSec: 0,
    recoverySec: 0, effects, ...overrides }) as AbilityDef;
  const W = { ...Q, id: `${HERO}.w`, slot: "W", castTimeSec: 0, effects: [hit] } as AbilityDef;
  const E = { ...Q, id: `${HERO}.e` as AbilityId, slot: "E", castTimeSec: 0, effects: [], statusCost: { statusId: ENERGY, count: 3 } } as AbilityDef;
  registerChampion({ ...SELA, id: HERO, passive: undefined, abilities: { ...SELA.abilities, Q, W, E } }, { overrideAbilities: true });
  const world = new SimWorld(SKELETON_ARENA, 73);
  const c = SKELETON_ARENA.zones[0]!.center;
  const ids = [0, 1, 2].map(seat => spawnChampion(world, { zone: 0, championId: HERO,
    seatId: asSeatId(seat), teamId: asTeamId(seat === 0 ? 0 : 1), pos: { x: c.x + seat * 2, z: c.z + 10 } }));
  const [caster, target, second] = ids as [typeof ids[number], typeof ids[number], typeof ids[number]];
  for (const id of ids) {
    attachSource(world, id, { id: "fixture-no-regen", kind: "item", modifiers: [{ stat: Stat.HealthRegen, op: ModOp.Flat, value: -10000 }] });
    recomputeStats(world, id);
    for (const slot of ["Q", "W", "E"] as const) world.abilities.get(id)!.slots[slot].rank = 1;
    world.nav.get(id)!.order = { kind: "hold" };
  }
  installMark(world, caster, { markId: ENERGY, initial: 0, max: 3, durationSec: -1, resetOn: "never" });
  attachSource(world, caster, { id: "fixture-credit", kind: "item", modifiers: [], hooks });
  world.rebuildGrid();
  const cast = (slot: "Q" | "W" | "E" = "Q") => {
    // Explicit cooldown reset exercises two accepted casts in one tick.
    world.abilities.get(caster)!.slots[slot].cooldownRemainingTicks = 0;
    return castAbility(world, caster, slot, { type: "entity", entityId: target });
  };
  const step = (n = 1) => { for (let i = 0; i < n; i++) world.step(new Map()); };
  const count = () => world.marks.get(caster)!.get(ENERGY)!.count;
  return { world, caster, target, second, cast, step, count, Q };
}

// Uses settled combat, not onAbilityHit or the existence of a queued packet.
describe("oncePerCast effective-damage credit", () => {
  it("multiple direct hits and victims share a credit; distinct same-tick casts each earn one", () => {
    const r = rig([hit, hit, { kind: "damageArea", radius: 8, includeOrigin: true, damageType: "true", amount: { flat: 10 } }]);
    expect(r.cast()).toBe("ok"); expect(r.count()).toBe(0); r.step(); expect(r.count()).toBe(1);
    expect(r.world.health.get(r.second)!.hp).toBeLessThan(r.world.health.get(r.second)!.maxHp);
    expect(r.cast()).toBe("ok"); expect(r.cast()).toBe("ok"); r.step(); expect(r.count()).toBe(3);
    expect(r.cast("E")).toBe("ok"); expect(r.count()).toBe(0);
    expect(r.cast()).toBe("ok"); r.step(); expect(r.count()).toBe(1);
  });

  it("two overlapping three-wave casts each count once even after the slot ledger is overwritten", () => {
    const r = rig([wave]); expect(r.cast()).toBe("ok"); r.step(5); expect(r.count()).toBe(1);
    expect(r.cast()).toBe("ok"); r.step(5); expect(r.count()).toBe(2);
    r.step(50); expect(r.count()).toBe(2);
  });

  it("channel release passes the accepted cast through all later waves; interrupt produces none", () => {
    const r = rig([wave], { castTimeSec: 0.2 }); expect(r.cast()).toBe("ok");
    r.step(4); expect(r.count()).toBe(0); r.step(40); expect(r.count()).toBe(1);
    const canceled = rig([hit], { castTimeSec: 0.2 }); canceled.cast();
    canceled.world.status.get(canceled.caster)!.effects.push({ sourceId: "stun", statusId: "stun" as StatusId,
      stun: true, expiresAtTick: 30 });
    canceled.step(20); expect(canceled.count()).toBe(0);
  });

  const carriers: [string, EffectDef[]][] = [
    ["projectile", [{ kind: "spawnProjectile", projectileId: "sela.q.bolt" as ProjectileId, onHit: [hit, hit] }]],
    ["DoT", [dot]],
    ["damage line", [{ kind: "damageLine", includeOrigin: true, length: 8, width: 3, damageType: "true", amount: { flat: 10 } }]],
    ["chain final payload", [{ kind: "chainLightning", shape: "single", amount: { flat: 0 }, damageType: "true",
      jumps: 3, jumpRange: 8, decay: 1, jumpIntervalSec: 0.1, revisit: true, onHitTargets: [hit] }]],
    ["model touch only", [{ kind: "spawnModelFx", shape: "single", modelKey: "fx.test.beam", path: "forward",
      speed: 10, distance: 2, touchRadius: 3, onTouch: [hit] }]],
    ["model arrival only", [{ kind: "spawnModelFx", shape: "single", modelKey: "fx.test.beam", path: "forward",
      speed: 10, distance: 2,
      onArrive: [{ kind: "damageArea", radius: 8, includeOrigin: true, damageType: "true", amount: { flat: 10 } }] }]],
    ["random area", [{ kind: "randomArea", count: [3], intervalSec: 0.1, scatterRadius: 0.01,
      effects: [{ kind: "damageArea", radius: 8, includeOrigin: true, damageType: "true", amount: { flat: 10 } }] }]],
    ["combo", [{ kind: "comboStrikes", shape: "single", strikes: 3, intervalSec: 0.1, perStrike: [hit] }]],
    ["chain", [{ kind: "chainLightning", shape: "single", amount: { flat: 10 }, damageType: "true",
      jumps: 3, jumpRange: 8, decay: 1, jumpIntervalSec: 0.1, revisit: true, onHitTargets: [hit] }]],
    ["dash end", [{ kind: "dash", mode: "forward", speed: 10, maxDistance: 0.4,
      onEnd: [{ kind: "damageArea", radius: 8, damageType: "true", amount: { flat: 10 } }] }]],
    ["leap land", [{ kind: "leap", mode: "inPlace", apexHeight: 1, durationSec: 0.2, landRadius: 8, onLand: [hit] }]],
    ["model touch and arrival", [{ kind: "spawnModelFx", shape: "single", modelKey: "fx.test.beam", path: "forward",
      speed: 10, distance: 2, touchRadius: 3, onTouch: [hit],
      onArrive: [{ kind: "damageArea", radius: 8, includeOrigin: true, damageType: "true", amount: { flat: 10 } }] }]],
    ["nested projectile delayed DoT", [{ kind: "spawnProjectile", projectileId: "sela.q.bolt" as ProjectileId,
      onHit: [{ ...wave, effects: [dot] }] }]],
  ];
  it.each(carriers)("%s retains primary-cast credit", (_name, effects) => {
    const r = rig(effects); const hp = r.world.health.get(r.target)!.hp;
    expect(r.cast()).toBe("ok"); r.step(80);
    expect(r.world.health.get(r.target)!.hp).toBeLessThan(hp); expect(r.count()).toBe(1);
  });

  it.each(["refresh", "independent", "stack"] as const)("DoT %s retains contributing casts without multiplying ordinary hooks", stacking => {
    const ordinary: HookDef = { on: "onDamageDealt", target: "self", effects: [{ ...gain, statusId: OTHER }] };
    const r = rig([{ ...dot, stacking, ...(stacking === "stack" ? { maxStacks: 3 } : {}) }], {}, [credit, ordinary]);
    installMark(r.world, r.caster, { markId: OTHER, initial: 0, max: 99, durationSec: -1, resetOn: "never" });
    expect(r.cast()).toBe("ok"); expect(r.cast()).toBe("ok"); r.step(5);
    expect(r.count()).toBe(stacking === "refresh" ? 1 : 2);
    expect(r.world.marks.get(r.caster)!.get(OTHER)!.count).toBe(stacking === "independent" ? 2 : 1);
    r.step(30); expect(r.count()).toBe(stacking === "refresh" ? 1 : 2);
  });

  it("stack provenance replaces oldest at the cap and duplicate applications of one cast count once", () => {
    const d = { ...dot, stacking: "stack", maxStacks: 2 } as EffectDef;
    const r = rig([d, d]); r.cast(); r.step(5); expect(r.count()).toBe(1);
    r.cast(); r.cast(); r.step(5); expect(r.count()).toBe(2);
    expect(r.world.dot.get(r.target)![0]!.stackCastInstances).toHaveLength(2);
  });

  it.each(["none", "mana", "manaAndCooldown"] as const)("proxy payCosts=%s never earns primary credit", payCosts => {
    const r = rig([{ kind: "proxyCast", shape: "single", slot: "W", payCosts }]);
    const hp = r.world.health.get(r.target)!.hp; r.cast(); r.step();
    expect(r.world.health.get(r.target)!.hp).toBeLessThan(hp); expect(r.count()).toBe(0);
    expect(r.cast("W")).toBe("ok"); r.step(); expect(r.count()).toBe(1);
  });

  it("proxy suppression survives the out-of-range approach retry", () => {
    const r = rig([hit], { range: 1 });
    runEffects([{ kind: "proxyCast", shape: "single", slot: "W", payCosts: "manaAndCooldown" }], {
      world: r.world, caster: r.caster, targets: [r.target], rank: 1, origin: "hook:counter", rng: r.world.rng,
    });
    expect(CAST_APPROACHES.get(r.world)?.get(r.caster)?.suppressCastCredit).toBe(true);
    r.world.transform.get(r.caster)!.pos = { ...r.world.transform.get(r.target)!.pos };
    castApproachSystem(r.world); combatResolveSystem(r.world); expect(r.count()).toBe(0);
    expect(r.world.health.get(r.target)!.hp).toBeLessThan(r.world.health.get(r.target)!.maxHp);
  });

  it("shield-only, immune, and self hits leave a cast eligible for a later effective enemy hit", () => {
    for (const blocked of ["shield", "immune", "self"] as const) {
      const r = rig([hit, wave]);
      if (blocked === "shield") r.world.health.get(r.target)!.shields.push({ sourceId: "shield", amount: 10000, expiresAtTick: 30 });
      if (blocked === "immune") runEffects([{ kind: "invulnerable", durationSec: 1 }], {
        world: r.world, caster: r.target, targets: [r.target], rank: 1, origin: "fixture", rng: r.world.rng,
      });
      r.cast();
      if (blocked === "self") r.world.damageQueue[0]!.target = r.caster;
      combatResolveSystem(r.world); expect(r.count()).toBe(0);
      r.world.health.get(r.target)!.shields.length = 0; r.world.status.get(r.target)!.effects.length = 0; r.world.invulnerable.delete(r.target);
      r.step(8); expect(r.count()).toBe(1);
    }
  });

  it("counter damage and life payment cannot trigger credit or recursive resource gains", () => {
    const r = rig([{ kind: "spendHealth", amount: { flat: 10 } }, hit, wave]);
    attachSource(r.world, r.target, { id: "counter", kind: "item", modifiers: [], hooks: [{ on: "onDamageTaken", effects: [hit] }] });
    r.cast(); r.step(40); expect(r.count()).toBe(1);
    expect(r.world.damageQueue).toHaveLength(0);
  });

  it("false conditions and chance do not consume a cast, successful repetition does not consume rng", () => {
    const r = rig([], {}, [{ ...credit, chance: 0 }]);
    const castInstance = noteAbilityCast(r.world, r.caster, "Q", r.Q.id);
    const trigger: TriggerDamage = { castInstance, raw: 10, mitigated: 10, hpLost: 10, resolvePass: 0, crit: false, type: "true", reflectDepth: 0, origin: `ability:${r.Q.id}` };
    fireHooks(r.world, r.caster, "onDamageDealt", r.target, undefined, trigger); expect(r.count()).toBe(0);
    const hook = r.world.stats.get(r.caster)!.sources.find(s => s.id === "fixture-credit")!.hooks![0]!;
    hook.chance = 1;
    hook.condition = { kind: "status", subject: "self", statusId: "not-installed" as StatusId };
    expect(zHookDef.safeParse(hook).success).toBe(true);
    fireHooks(r.world, r.caster, "onDamageDealt", r.target, undefined, trigger); expect(r.count()).toBe(0);
    hook.condition = undefined;
    fireHooks(r.world, r.caster, "onDamageDealt", r.target, undefined, trigger); expect(r.count()).toBe(1);
    const rng = r.world.rng.state;
    fireHooks(r.world, r.caster, "onDamageDealt", r.target, undefined, trigger);
    expect(r.count()).toBe(1); expect(r.world.rng.state).toBe(rng);
  });

  it("rejects reflection, derived, basic, missing, and another caster's uncredited provenance", () => {
    for (const kind of ["reflect", "hook", "basic", "missing", "foreign"] as const) {
      const r = rig([]);
      const castInstance = noteAbilityCast(r.world, r.caster, "Q", r.Q.id);
      const trigger: TriggerDamage = { castInstance, raw: 10, mitigated: 10, hpLost: 10, resolvePass: 0,
        crit: false, type: "true", reflectDepth: 0, origin: `ability:${r.Q.id}` };
      const patch = kind === "reflect" ? { reflectDepth: 1 }
        : kind === "hook" ? { origin: "hook:counter" }
        : kind === "basic" ? { origin: "basic" }
        : kind === "missing" ? { castInstance: undefined }
        : { castInstance: { ...castInstance, caster: r.target } };
      fireHooks(r.world, r.caster, "onDamageDealt", r.target, undefined, { ...trigger, ...patch });
      expect(r.count(), kind).toBe(0); expect(castInstance.creditedHooks).toHaveLength(0);
      fireHooks(r.world, r.caster, "onDamageDealt", r.target, undefined, trigger); expect(r.count()).toBe(1);
    }
  });

  it("two owners with identical passive source IDs retain separate energy and cast receipts", () => {
    const r = rig([wave]);
    installMark(r.world, r.target, { markId: ENERGY, initial: 0, max: 3, durationSec: -1, resetOn: "never" });
    attachSource(r.world, r.target, { id: "fixture-credit", kind: "item", modifiers: [], hooks: [credit] });
    r.cast(); expect(castAbility(r.world, r.target, "Q", { type: "entity", entityId: r.caster })).toBe("ok");
    r.step(40); expect(r.count()).toBe(1); expect(r.world.marks.get(r.target)!.get(ENERGY)!.count).toBe(1);
  });

  it("rejects oncePerCast on events that cannot provide effective cast damage", () => {
    expect(zHookDef.parse(credit).oncePerCast).toBe(true);
    for (const damageSource of ["basic", "other"]) {
      expect(zHookDef.safeParse({ ...credit, damageSource }).success).toBe(false);
    }
    for (const on of ["onAbilityHit", "onDamageTaken", "onInterval", "onReflectSuccess"]) {
      expect(zHookDef.safeParse({ ...credit, on }).success).toBe(false);
    }
  });

  it("credit and serial identity are visible in the digest before any HP changes, including orphaned waves", () => {
    const r = rig([wave]); r.cast(); const pending = r.world.delayed[0]!.castInstance!;
    forgetCasts(r.world, r.caster); const before = r.world.digest();
    pending.creditedHooks.push("credit"); expect(r.world.digest()).not.toBe(before);
    pending.creditedHooks.length = 0; expect(r.world.digest()).toBe(before);
    const replacement = { ...pending, serial: pending.serial + 4096 };
    r.world.delayed[0]!.castInstance = replacement; expect(r.world.digest()).not.toBe(before);
    r.world.delayed[0]!.castInstance = pending;
    const other = rig([wave]); other.cast(); forgetCasts(other.world, other.caster);
    expect(other.world.digest()).toBe(before);
  });

  it("digest inspection cannot change later gameplay state or permanently enable tracking", () => {
    const r = rig([], {}, [credit]); const first: number[] = [];
    digestCastCredits(r.world, n => first.push(n)); expect(first.length).toBeGreaterThan(0);
    r.world.stats.get(r.caster)!.sources.find(s => s.id === "fixture-credit")!.hooks = [];
    const disabled: number[] = []; digestCastCredits(r.world, n => disabled.push(n));
    expect(disabled).toHaveLength(0);
  });

  it("execution damage also earns exactly one primary-cast credit", () => {
    const r = rig([{ kind: "devour", shape: "single", thresholdPctOfMax: [0.5] }]);
    r.world.health.get(r.target)!.hp = 5; r.cast(); r.step();
    expect(r.world.health.get(r.target)!.alive).toBe(false); expect(r.count()).toBe(1);
  });

  it("pre-feature worlds do not hash cast provenance; late hook registration enables it", () => {
    const r = rig([wave], {}, []); r.cast(); const values: number[] = [];
    digestCastCredits(r.world, n => values.push(n)); expect(values).toHaveLength(0);
    attachSource(r.world, r.caster, { id: "late-credit", kind: "item", modifiers: [], hooks: [credit] });
    digestCastCredits(r.world, n => values.push(n)); expect(values.length).toBeGreaterThan(0);
    r.step(40); expect(r.count()).toBe(1);
  });
});
