/**
 * RECOVERY (後搖) + THE HIT-CANCEL — LANE D.
 *
 * The design, restated so a failing test here reads as a design violation and
 * not just a broken number:
 *
 *   startup  = the VICTIM's warning     -> must never shrink
 *   recovery = the ATTACKER's commitment -> is exactly what a HIT buys back
 *
 * so: LAND A HIT -> recovery cancelled, combos flow.
 *     WHIFF      -> eat the whole thing, you are committed.
 *
 * There is deliberately NO combo table anywhere in the sim: the only question
 * asked is "did it connect?". See sim/abilities/abilityRecovery.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { Abilities } from "./content/registry";
import { castAbility } from "./abilities/abilitySystem";
import {
  connectRuleOf,
  recoveryTicksFor,
  isRecovering,
  DEFAULT_RECOVERY_SEC,
  MAX_RECOVERY_SEC,
} from "./abilities/abilityRecovery";
import type { AbilityDef } from "./content/defs";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;
/** pillar-free band (see combatJuice.test.ts) */
const Y = C.z + 14;

const base = {
  slot: "Q" as const,
  maxRank: 1,
  cooldown: [0.1],
  manaCost: [0],
  range: 20,
  targetsEnemies: true,
};

/** ids registered once for the whole file */
const A = {
  groundDamage: "test.rec.ground-damage" as AbilityId,
  groundStatus: "test.rec.ground-status" as AbilityId,
  selfBuff: "test.rec.self-buff" as AbilityId,
  dash: "test.rec.dash" as AbilityId,
  targetedHeal: "test.rec.targeted-heal" as AbilityId,
  skillshot: "test.rec.skillshot" as AbilityId,
  rooting: "test.rec.rooting" as AbilityId,
  instant: "test.rec.instant" as AbilityId,
  noRecovery: "test.rec.zero" as AbilityId,
};

beforeAll(() => {
  registerSkeletonContent();
  // A ground damage AoE with a real 0.6 s startup — the shape Lane A put on all
  // 554 abilities — and the default recovery.
  Abilities.register(A.groundDamage, {
    ...base, id: A.groundDamage, name: "Ground Damage", castType: "ground",
    radius: 3, castTimeSec: 0.6,
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
  });
  // Same but INSTANT (castTimeSec 0) — proves recovery is armed on the instant
  // path too, not only in CastResolveSystem.
  Abilities.register(A.instant, {
    ...base, id: A.instant, name: "Instant Damage", castType: "ground", radius: 3,
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
  });
  // A ground ability that deals NO damage: it applies a slow. "applied".
  Abilities.register(A.groundStatus, {
    ...base, id: A.groundStatus, name: "Ground Slow", castType: "ground", radius: 3,
    effects: [{ kind: "applyStatus", statusId: "slow" as never, duration: 2, moveSpeedMult: 0.5 }],
  });
  Abilities.register(A.selfBuff, {
    ...base, id: A.selfBuff, name: "Self Buff", castType: "self",
    effects: [{ kind: "applyBuff", modifiers: [], duration: 3 }],
  });
  Abilities.register(A.dash, {
    ...base, id: A.dash, name: "Dash", castType: "dash",
    effects: [{ kind: "dash", mode: "forward", speed: 20, maxDistance: 5 }],
  });
  Abilities.register(A.targetedHeal, {
    ...base, id: A.targetedHeal, name: "Targeted Heal", castType: "targeted",
    targetsEnemies: false, effects: [{ kind: "heal", amount: { flat: 50 } }],
  });
  Abilities.register(A.skillshot, {
    ...base, id: A.skillshot, name: "Skillshot", castType: "skillshot",
    effects: [
      { kind: "spawnProjectile", projectileId: "p.test" as never,
        onHit: [{ kind: "damage", damageType: "physical", amount: { flat: 50 } }] },
    ],
  });
  // opts INTO the full fighting-game lock
  Abilities.register(A.rooting, {
    ...base, id: A.rooting, name: "Rooting Recovery", castType: "ground", radius: 3,
    recoveryRoots: true,
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
  });
  // an author explicitly opting OUT
  Abilities.register(A.noRecovery, {
    ...base, id: A.noRecovery, name: "No Recovery", castType: "ground", radius: 3,
    recoverySec: 0,
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
  });
});

interface Fixture {
  world: SimWorld;
  caster: EntityId;
  enemy: EntityId;
  ally: EntityId;
  /** aim point 2u ahead of the caster, inside the 3u AoE */
  aim: { x: number; z: number };
}

function setup(abilityId: AbilityId, enemyInAoE = true, seed = 21): Fixture {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const caster = spawnChampion(world, {
    championId: "sela" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x - 6, z: Y }, zone: 0,
  });
  const aim = { x: C.x - 4, z: Y };
  const enemy = spawnChampion(world, {
    championId: "thorne" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: enemyInAoE ? { x: aim.x, z: aim.z } : { x: C.x + 12, z: Y }, zone: 0,
  });
  const ally = spawnChampion(world, {
    championId: "thorne" as ChampionId, seatId: asSeatId(2), teamId: asTeamId(0),
    pos: { x: C.x - 6, z: Y + 2 }, zone: 0,
  });
  world.abilities.get(caster)!.slots.Q = { abilityId, rank: 1, cooldownRemainingTicks: 0 };
  world.step(NO_INTENTS); // settle stats + health
  world.rebuildGrid();
  return { world, caster, enemy, ally, aim };
}

/** step until the ability's startup has elapsed (or bail after `max` ticks). */
function stepToResolve(f: Fixture, max = 40): number {
  for (let i = 0; i < max; i++) {
    f.world.step(NO_INTENTS);
    if (!f.world.abilities.get(f.caster)!.cast) return i + 1;
  }
  return -1;
}

/** free the cooldown + mana so RECOVERY is the only possible refusal. */
function isolateRecovery(f: Fixture): void {
  f.world.abilities.get(f.caster)!.slots.Q.cooldownRemainingTicks = 0;
  const h = f.world.health.get(f.caster)!;
  h.mana = h.maxMana = 99999;
}

// ─────────────────────────────────────────────────────────────── the core rule

describe("recovery: the whiff pays, the hit does not", () => {
  it("BASELINE — before this lane the caster was free the tick after resolve; now a WHIFF commits them", () => {
    const f = setup(A.groundDamage, /* enemyInAoE */ false);
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("ok");
    stepToResolve(f);
    isolateRecovery(f);
    // the ability resolved and hit nobody -> full commitment
    expect(isRecovering(f.world, f.caster)).toBe(true);
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("recovery");
  });

  it("a LANDED HIT clears recovery on the SAME TICK the damage lands", () => {
    const f = setup(A.groundDamage, true);
    const hpBefore = f.world.health.get(f.enemy)!.hp;
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("ok");
    const ticks = stepToResolve(f);
    expect(ticks).toBeGreaterThan(0);
    // the SAME step that resolved the cast also drained the damage queue
    // (castResolveSystem = step 2b, combatResolveSystem = step 8), so by the
    // end of that one tick the hit has landed AND the recovery is gone.
    expect(f.world.health.get(f.enemy)!.hp).toBeLessThan(hpBefore);
    expect(isRecovering(f.world, f.caster)).toBe(false);
    isolateRecovery(f);
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("ok");
  });

  it("a WHIFF eats EXACTLY recoveryTicksFor() ticks, then frees the caster", () => {
    const f = setup(A.groundDamage, false);
    const def = Abilities.get(A.groundDamage);
    const n = recoveryTicksFor(f.world, def);
    expect(n).toBe(Math.round(DEFAULT_RECOVERY_SEC / f.world.dt)); // 18 @30Hz
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    const refusals: string[] = [];
    for (let i = 0; i < n + 3; i++) {
      isolateRecovery(f);
      const r = castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
      refusals.push(r);
      if (r === "ok") break;
      f.world.step(NO_INTENTS);
    }
    // refused on exactly n ticks, accepted on the (n+1)-th attempt
    expect(refusals.filter((r) => r === "recovery")).toHaveLength(n);
    expect(refusals[refusals.length - 1]).toBe("ok");
  });

  it("the INSTANT-cast path arms recovery too (not just CastResolveSystem)", () => {
    const f = setup(A.instant, false);
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("ok");
    expect(isRecovering(f.world, f.caster)).toBe(true);
    isolateRecovery(f);
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("recovery");
  });

  it("an instant cast that CONNECTS is cancelled by its own damage the same tick", () => {
    const f = setup(A.instant, true);
    expect(castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim })).toBe("ok");
    expect(isRecovering(f.world, f.caster)).toBe(true); // damage is only QUEUED yet
    f.world.step(NO_INTENTS); // combatResolveSystem drains it -> hit -> cancel
    expect(isRecovering(f.world, f.caster)).toBe(false);
  });

  it("recovery also blocks BASIC ATTACKS, not only casts (it is an output lock)", () => {
    const f = setup(A.groundDamage, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    f.world.nav.get(f.caster)!.attackTarget = f.enemy;
    f.world.transform.get(f.enemy)!.pos = { x: C.x - 5.4, z: Y }; // point-blank
    f.world.abilities.get(f.caster)!.basicAttackCdTicks = 0;
    f.world.step(NO_INTENTS);
    expect(f.world.abilities.get(f.caster)!.windup).toBeFalsy();
  });

  it("an explicit recoverySec: 0 opts the ability out entirely", () => {
    const f = setup(A.noRecovery, false);
    expect(recoveryTicksFor(f.world, Abilities.get(A.noRecovery))).toBe(0);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(isRecovering(f.world, f.caster)).toBe(false);
  });
});

// ───────────────────────────────────────── the no-damage enumeration (DECISION 1)

describe("abilities that legitimately deal no damage", () => {
  it("classifies the REAL shapes: damage / applied / unwhiffable", () => {
    expect(connectRuleOf(Abilities.get(A.groundDamage))).toBe("damage");
    // damage nested inside a projectile's onHit still counts as a damage ability
    expect(connectRuleOf(Abilities.get(A.skillshot))).toBe("damage");
    expect(connectRuleOf(Abilities.get(A.groundStatus))).toBe("applied");
    expect(connectRuleOf(Abilities.get(A.targetedHeal))).toBe("applied");
    expect(connectRuleOf(Abilities.get(A.selfBuff))).toBe("unwhiffable");
    expect(connectRuleOf(Abilities.get(A.dash))).toBe("unwhiffable");
  });

  it("a DASH never eats recovery — it cannot miss, so it pays nothing", () => {
    const f = setup(A.dash, false);
    expect(castAbility(f.world, f.caster, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    expect(isRecovering(f.world, f.caster)).toBe(false);
    isolateRecovery(f);
    expect(castAbility(f.world, f.caster, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
  });

  it("a SELF-BUFF never eats recovery either (same rule, not a special case)", () => {
    const f = setup(A.selfBuff, false);
    expect(castAbility(f.world, f.caster, "Q", { type: "self" })).toBe("ok");
    expect(isRecovering(f.world, f.caster)).toBe(false);
  });

  it("a TARGETED HEAL on an ally connects at resolve — a validated lock-on cannot whiff", () => {
    const f = setup(A.targetedHeal, false);
    f.world.health.get(f.ally)!.hp = 10;
    expect(castAbility(f.world, f.caster, "Q", { type: "entity", entityId: f.ally })).toBe("ok");
    expect(isRecovering(f.world, f.caster)).toBe(false);
  });

  it("a GROUND NON-DAMAGING AoE that catches nobody DOES eat the full recovery", () => {
    const f = setup(A.groundStatus, /* enemyInAoE */ false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(isRecovering(f.world, f.caster)).toBe(true);
  });

  it("…and the same AoE catching an enemy connects on the resolve tick", () => {
    const f = setup(A.groundStatus, /* enemyInAoE */ true);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(isRecovering(f.world, f.caster)).toBe(false);
  });

  it("damaging an ALLY or YOURSELF does not count as connecting", () => {
    const f = setup(A.groundDamage, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(isRecovering(f.world, f.caster)).toBe(true);
    // hand-queue a packet from the same ability against an ALLY
    f.world.damageQueue.push({
      source: f.caster, target: f.ally, amount: 50, type: "magic", crit: false,
      origin: `ability:${A.groundDamage}`,
    });
    f.world.step(NO_INTENTS);
    expect(isRecovering(f.world, f.caster)).toBe(true);
  });

  it("a hit from a DIFFERENT ability does not cancel this ability's recovery", () => {
    const f = setup(A.groundDamage, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    f.world.damageQueue.push({
      source: f.caster, target: f.enemy, amount: 50, type: "magic", crit: false,
      origin: "ability:some.other.ability",
    });
    f.world.step(NO_INTENTS);
    expect(isRecovering(f.world, f.caster)).toBe(true);
  });
});

// ─────────────────────────────────────────────────── rooting + interrupt (2 & 5)

describe("recovery: rooting is per-ability, interrupts match a cast's", () => {
  it("by DEFAULT recovery does NOT root — the caster may still walk", () => {
    const f = setup(A.groundDamage, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(isRecovering(f.world, f.caster)).toBe(true);
    const before = { ...f.world.transform.get(f.caster)!.pos };
    f.world.nav.get(f.caster)!.moveTarget = { x: before.x - 6, z: before.z };
    for (let i = 0; i < 5; i++) f.world.step(NO_INTENTS);
    expect(f.world.transform.get(f.caster)!.pos.x).toBeLessThan(before.x - 0.2);
  });

  it("recoveryRoots: true opts into the full lock", () => {
    const f = setup(A.rooting, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(isRecovering(f.world, f.caster)).toBe(true);
    const before = { ...f.world.transform.get(f.caster)!.pos };
    f.world.nav.get(f.caster)!.moveTarget = { x: before.x - 6, z: before.z };
    for (let i = 0; i < 5; i++) f.world.step(NO_INTENTS);
    expect(f.world.transform.get(f.caster)!.pos.x).toBeCloseTo(before.x, 5);
  });

  for (const kind of ["stun", "knockdown", "death"] as const) {
    it(`${kind} clears the recovery, like it clears a cast`, () => {
      const f = setup(A.groundDamage, false);
      castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
      stepToResolve(f);
      expect(isRecovering(f.world, f.caster)).toBe(true);
      if (kind === "stun") {
        f.world.status.get(f.caster)!.effects.push({
          id: "s", statusId: "stun" as never, expiresAtTick: f.world.tick + 30, stun: true,
        } as never);
      } else if (kind === "knockdown") {
        f.world.knockdown.set(f.caster, 10);
      } else {
        f.world.health.get(f.caster)!.hp = 0;
        f.world.health.get(f.caster)!.alive = false;
      }
      f.world.step(NO_INTENTS);
      expect(isRecovering(f.world, f.caster)).toBe(false);
      expect(f.world.events.some((e) => e.type === "recoveryEnd" && e.data.reason === "interrupt")).toBe(true);
    });
  }

  it("HITSTOP pauses the recovery clock rather than refunding it", () => {
    const f = setup(A.groundDamage, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    const held = f.world.abilities.get(f.caster)!.recovery!.ticksLeft;
    f.world.hitstop.set(f.caster, 3);
    f.world.step(NO_INTENTS);
    expect(f.world.abilities.get(f.caster)!.recovery!.ticksLeft).toBe(held);
  });
});

// ───────────────────────────────────────────────── determinism + content bounds

describe("determinism and bounds", () => {
  it("same seed + same intents -> identical digest, with recovery live", () => {
    const run = (): number => {
      const f = setup(A.groundDamage, false, 99);
      castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
      for (let i = 0; i < 60; i++) f.world.step(NO_INTENTS);
      return f.world.digest();
    };
    expect(run()).toBe(run());
  });

  it("the recovery timer is TICK-counted, never wall-clock", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const def = Abilities.get(A.groundDamage);
    expect(recoveryTicksFor(world, def)).toBe(Math.round(DEFAULT_RECOVERY_SEC / world.dt));
    expect(Number.isInteger(recoveryTicksFor(world, def))).toBe(true);
  });

  it("an absurd authored recoverySec is clamped, so no doc can stall a match", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const wild = { ...Abilities.get(A.groundDamage), recoverySec: 999 } as AbilityDef;
    expect(recoveryTicksFor(world, wild)).toBe(Math.round(MAX_RECOVERY_SEC / world.dt));
    const negative = { ...Abilities.get(A.groundDamage), recoverySec: -5 } as AbilityDef;
    expect(recoveryTicksFor(world, negative)).toBe(0);
  });

  it("recoveryBegin / recoveryEnd are emitted with the reason, so a consumer can tell hit from whiff", () => {
    const f = setup(A.groundDamage, false);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    stepToResolve(f);
    expect(f.world.events.some((e) => e.type === "recoveryBegin")).toBe(true);
    for (let i = 0; i < 25; i++) {
      f.world.step(NO_INTENTS);
      const done = f.world.events.find((e) => e.type === "recoveryEnd");
      if (done) {
        expect(done.data.reason).toBe("elapsed");
        return;
      }
    }
    throw new Error("recoveryEnd never fired");
  });

  it("a hit emits recoveryEnd{reason:'hit'} carrying the ticks the combo saved", () => {
    const f = setup(A.groundDamage, true);
    castAbility(f.world, f.caster, "Q", { type: "point", point: f.aim });
    for (let i = 0; i < 40; i++) {
      f.world.step(NO_INTENTS);
      const ev = f.world.events.find((e) => e.type === "recoveryEnd");
      if (ev) {
        expect(ev.data.reason).toBe("hit");
        expect(ev.data.ticksSaved).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("recoveryEnd{hit} never fired");
  });
});

// ────────────────────────────── the arithmetic the owner asked to be REPORTED

describe("THE COMBO BUDGET: does the follow-up's startup fit inside hitstun?", () => {
  /** Land one real hit of `amount` and read the victim's authoritative hitstun. */
  function hitstunFor(amount: number): number {
    const world = new SimWorld(SKELETON_ARENA, 5);
    const a = spawnChampion(world, {
      championId: "sela" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x - 6, z: Y }, zone: 0,
    });
    const b = spawnChampion(world, {
      championId: "thorne" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
      pos: { x: C.x - 4, z: Y }, zone: 0,
    });
    world.step(NO_INTENTS);
    world.health.get(b)!.maxHp = 1e6;
    world.health.get(b)!.hp = 1e6;
    // `true` damage skips mitigation, so `amount` IS the impact the profile sees
    world.damageQueue.push({
      source: a, target: b, amount: amount / world.combatEnv.damageDealt,
      type: "true", crit: false, origin: "ability:x",
    });
    world.step(NO_INTENTS);
    return world.hitstun.get(b) ?? 0;
  }

  const dt = 1 / 30;
  const ticks = (secs: number): number => Math.round(secs / dt);

  it("pins the hitstun ceiling: 12 ticks / 0.400 s, and the impact needed to reach it", () => {
    // The whole combo budget hangs off this one number, so it is pinned rather
    // than described. If HITSTUN_MAX_TICKS / HITSTUN_PER_IMPACT / the hitstop
    // curve in combat/damage.ts move, the link table below moves with them and
    // this test is the alarm.
    const maxHitstun = Math.max(...[12, 60, 120, 170, 220, 400, 2000].map(hitstunFor));
    expect(maxHitstun).toBe(12); // HITSTUN_MAX_TICKS
    expect(hitstunFor(12)).toBe(4); // the lightest hit that freezes at all
    expect(hitstunFor(120)).toBe(9); // "heavy" tier
    expect(hitstunFor(220)).toBe(12); // saturates the cap
  });

  it("THE ANSWER: a startup <= 0.4 s can link off a heavy hit; >= 0.5 s never can", () => {
    // A follow-up connects inside the victim's lock only when its STARTUP fits
    // inside the hitstun the previous hit bought. So the cut is exact:
    expect(ticks(0.3)).toBeLessThanOrEqual(hitstunFor(120)); //  9t <=  9t  — links off a heavy hit
    expect(ticks(0.4)).toBeLessThanOrEqual(hitstunFor(220)); // 12t <= 12t  — links only off a saturating hit
    expect(ticks(0.5)).toBeGreaterThan(hitstunFor(2000)); //   15t >  12t  — cannot link off ANY hit
    // …and the owner's stated 0.6 s telegraph floor is 6 ticks (0.200 s) clear
    // of the ceiling, so an ability held at that floor is never a true link.
    expect(ticks(0.6) - 12).toBe(6);
  });

  it("a basic attack's damage point DOES fit inside a heavy hit's hitstun (the link that exists today)", () => {
    // 50 of 113 champions swing at attackDamagePoint 0.25 s = 8 ticks.
    expect(hitstunFor(120)).toBeGreaterThanOrEqual(Math.round(0.25 / (1 / 30)));
    // …but the 23 champions at 0.5 s = 15 ticks can never link off any hit.
    expect(hitstunFor(2000)).toBeLessThan(Math.round(0.5 / (1 / 30)));
  });
});
