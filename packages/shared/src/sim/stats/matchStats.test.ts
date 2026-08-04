/**
 * matchStats accumulation + determinism (settle-01, settle-02). Verifies every
 * scoreboard counter increments on the RIGHT sim event and that two seeded runs
 * of the same scripted fight produce byte-identical scoreboards + digests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { spawnFlower } from "../flowers";
import { castAbility } from "../abilities/abilitySystem";
import { runEffects } from "../effects/effectRunner";
import { grantGold, grantXp } from "../economy/progression";
import { getMatchStats } from "./matchStats";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId, type StatusId } from "../../ids";
import type { DamagePacket } from "../combat/damage";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const C = (): { x: number; z: number } => SKELETON_ARENA.zones[0]!.center;

function spawnAt(world: SimWorld, champ: string, seat: number, team: number, dx: number, dz: number): EntityId {
  const c = C();
  return spawnChampion(world, {
    championId: champ as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: c.x + dx, z: c.z + dz },
    zone: 0,
  });
}

/** Sela (team 0) vs Thorne (team 1), a small gap apart, facing off. */
function duel(world: SimWorld, gap = 6): { sela: EntityId; thorne: EntityId } {
  const sela = spawnAt(world, "sela", 0, 0, -gap / 2, 8);
  const thorne = spawnAt(world, "thorne", 1, 1, gap / 2, 8);
  world.transform.get(sela)!.facing = { x: 1, z: 0 };
  world.transform.get(thorne)!.facing = { x: -1, z: 0 };
  return { sela, thorne };
}

const pkt = (source: EntityId, target: EntityId, amount: number, origin = "t", type: DamagePacket["type"] = "physical"): DamagePacket => ({
  source,
  target,
  amount,
  type,
  crit: false,
  origin,
});

describe("matchStats accumulation (settle-02)", () => {
  it("damage: dealt/taken/blocked/largest + basic-attack hits", () => {
    cover("settle-stats-events");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { sela, thorne } = duel(world);

    world.damageQueue.push(pkt(sela, thorne, 60, "basic"));
    world.step(new Map());
    const s = getMatchStats(world, sela);
    const t = getMatchStats(world, thorne);
    expect(s.damageDealt).toBeGreaterThan(0);
    expect(s.basicAttackHits).toBe(1); // one connecting "basic" packet
    expect(s.largestSingleHit).toBeCloseTo(s.damageDealt, 6); // single hit so far
    expect(t.damageTaken).toBeGreaterThan(0);
    expect(t.damageBlocked).toBeGreaterThan(0); // armor mitigation counts as blocked
    expect(t.damageDealt).toBe(0); // thorne dealt nothing
  });

  it("blocked: a fully-shielded true hit is all 'blocked', no HP taken", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { sela, thorne } = duel(world);
    world.health.get(thorne)!.shields.push({ amount: 80, expiresAtTick: world.tick + 100, sourceId: "t" });
    world.damageQueue.push(pkt(sela, thorne, 50, "t", "true"));
    world.step(new Map());
    const t = getMatchStats(world, thorne);
    expect(t.damageBlocked).toBeCloseTo(50, 4); // shield ate all 50
    expect(t.damageTaken).toBe(0);
    expect(getMatchStats(world, sela).damageDealt).toBeCloseTo(50, 4); // output still credited
  });

  it("healing: heal effect credits the caster the ACTUAL hp restored", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { sela } = duel(world);
    world.health.get(sela)!.hp = 50; // hurt so a heal lands
    runEffects([{ kind: "heal", amount: { flat: 200 } }], {
      world,
      caster: sela,
      rank: 1,
      targets: [sela],
      origin: "ability:test",
      rng: world.rng,
    });
    expect(getMatchStats(world, sela).healingDone).toBeGreaterThan(0);
    // capped at the hp actually restored (never more than the missing hp)
    const hp = world.health.get(sela)!;
    expect(getMatchStats(world, sela).healingDone).toBeLessThanOrEqual(hp.maxHp);
  });

  it("cc: applying a stun to an ENEMY credits ccAppliedTicks = duration", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { sela, thorne } = duel(world);
    runEffects([{ kind: "applyStatus", statusId: "stun" as StatusId, duration: 1.0, stun: true }], {
      world,
      caster: sela,
      rank: 1,
      targets: [thorne],
      origin: "ability:test",
      rng: world.rng,
    });
    expect(getMatchStats(world, sela).ccAppliedTicks).toBe(Math.round(1.0 / world.dt)); // 30 ticks @30Hz
    expect(getMatchStats(world, thorne).ccAppliedTicks).toBe(0); // victim gets no credit
  });

  it("cc: applying a slow to an ALLY (self) credits nothing", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { sela } = duel(world);
    runEffects([{ kind: "applyStatus", statusId: "slow" as StatusId, duration: 1.0, moveSpeedMult: 0.5 }], {
      world,
      caster: sela,
      rank: 1,
      targets: [sela],
      origin: "ability:test",
      rng: world.rng,
    });
    expect(getMatchStats(world, sela).ccAppliedTicks).toBe(0);
  });

  it("abilities: cast increments casts; skillshot hit vs whiff", () => {
    // hit
    const hitWorld = new SimWorld(SKELETON_ARENA, 1);
    const { sela: shooter, thorne: victim } = duel(hitWorld, 6);
    expect(castAbility(hitWorld, shooter, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    expect(getMatchStats(hitWorld, shooter).abilityCasts).toBe(1);
    for (let k = 0; k < 40; k++) hitWorld.step(new Map());
    expect(getMatchStats(hitWorld, shooter).abilityHits).toBeGreaterThanOrEqual(1);
    expect(getMatchStats(hitWorld, shooter).abilityWhiffs).toBe(0);
    void victim;

    // whiff: fire AWAY from the enemy so the projectile expires unhit
    const missWorld = new SimWorld(SKELETON_ARENA, 1);
    const { sela: misser } = duel(missWorld, 6);
    expect(castAbility(missWorld, misser, "Q", { type: "dir", dir: { x: -1, z: 0 } })).toBe("ok");
    for (let k = 0; k < 80; k++) missWorld.step(new Map());
    expect(getMatchStats(missWorld, misser).abilityHits).toBe(0);
    expect(getMatchStats(missWorld, misser).abilityWhiffs).toBeGreaterThanOrEqual(1);
  });

  it("kill / death / assist / participation", () => {
    const world = new SimWorld(SKELETON_ARENA, 2);
    const sela = spawnAt(world, "sela", 0, 0, -3, 8);
    const ally = spawnAt(world, "thorne", 2, 0, -1, 8); // sela's teammate
    const thorne = spawnAt(world, "thorne", 1, 1, 3, 8); // enemy victim
    world.health.get(thorne)!.hp = 40;

    // ally chips the victim first (earns an assist), then sela lands the kill
    world.damageQueue.push(pkt(ally, thorne, 20, "basic"));
    world.step(new Map());
    world.damageQueue.push(pkt(sela, thorne, 500, "basic"));
    world.step(new Map());

    expect(world.health.get(thorne)!.alive).toBe(false);
    expect(getMatchStats(world, sela).kills).toBe(1);
    expect(getMatchStats(world, sela).killParticipation).toBe(1);
    expect(getMatchStats(world, thorne).deaths).toBe(1);
    expect(getMatchStats(world, ally).assists).toBe(1);
    expect(getMatchStats(world, ally).killParticipation).toBe(1);
    expect(getMatchStats(world, ally).kills).toBe(0);
  });

  it("multikill: two enemy kills inside the window chain a multikill", () => {
    const world = new SimWorld(SKELETON_ARENA, 3);
    const sela = spawnAt(world, "sela", 0, 0, -3, 8);
    const e1 = spawnAt(world, "thorne", 1, 1, 2, 8);
    const e2 = spawnAt(world, "thorne", 4, 1, 4, 8);
    world.health.get(e1)!.hp = 10;
    world.health.get(e2)!.hp = 10;
    world.damageQueue.push(pkt(sela, e1, 500, "basic"));
    world.damageQueue.push(pkt(sela, e2, 500, "basic"));
    world.step(new Map());
    expect(getMatchStats(world, sela).kills).toBe(2);
    expect(getMatchStats(world, sela).multikills).toBe(1); // the 2nd kill chained
  });

  it("flowersEaten: the killing blow on a neutral flower scores (not a kill)", () => {
    const world = new SimWorld(SKELETON_ARENA, 4);
    const { sela } = duel(world);
    const flower = spawnFlower(world, 0, { x: C().x, z: C().z }, 50);
    world.damageQueue.push(pkt(sela, flower, 100, "basic", "true"));
    world.step(new Map());
    expect(getMatchStats(world, sela).flowersEaten).toBe(1);
    expect(getMatchStats(world, sela).kills).toBe(0); // flowers are not kills
    expect(getMatchStats(world, sela).damageDealt).toBe(0); // flower damage never scores
  });

  it("gold / xp accrue through the grant paths", () => {
    const world = new SimWorld(SKELETON_ARENA, 5);
    const { sela } = duel(world);
    grantGold(world, sela, 137, "hero");
    grantXp(world, sela, 42);
    expect(getMatchStats(world, sela).goldEarned).toBe(137);
    expect(getMatchStats(world, sela).xp).toBe(42);
  });

  it("timeAliveTicks accrues ONLY while combatActive", () => {
    const world = new SimWorld(SKELETON_ARENA, 6);
    const { sela } = duel(world);
    world.combatActive = true;
    for (let k = 0; k < 10; k++) world.step(new Map());
    expect(getMatchStats(world, sela).timeAliveTicks).toBe(10);
    world.combatActive = false;
    for (let k = 0; k < 5; k++) world.step(new Map());
    expect(getMatchStats(world, sela).timeAliveTicks).toBe(10); // paused
  });
});

describe("matchStats determinism (settle-01)", () => {
  function runScripted(seed: number): SimWorld {
    const world = new SimWorld(SKELETON_ARENA, seed);
    world.combatActive = true;
    const { sela, thorne } = duel(world, 6);
    for (let k = 0; k < 300; k++) {
      const intents = new Map<SeatId, IntentFrame>();
      if (k === 0) {
        intents.set(asSeatId(0), {
          commands: [{ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: 1, z: 0 } } }],
          order: { kind: "attackTarget", entity: thorne },
        });
        intents.set(asSeatId(1), { commands: [], order: { kind: "attackTarget", entity: sela } });
      }
      if (k === 45) {
        intents.set(asSeatId(1), {
          commands: [{ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: -1, z: 0 } } }],
        });
      }
      world.step(intents);
    }
    return world;
  }

  it("two seeded runs -> identical scoreboards + digest", () => {
    cover("settle-stats-deterministic");
    const a = runScripted(4242);
    const b = runScripted(4242);
    expect(a.digest()).toBe(b.digest());
    // deep-equal every scoreboard entry (positions/hp are already in the digest)
    const dump = (w: SimWorld): string =>
      JSON.stringify([...w.matchStats.entries()].map(([id, s]) => [id, s]));
    expect(dump(a)).toBe(dump(b));
    // and the fight actually produced non-trivial stats (guards a vacuous pass)
    const anyDamage = [...a.matchStats.values()].some((s) => s.damageDealt > 0);
    expect(anyDamage).toBe(true);
    // a different seed diverges the digest
    const c = runScripted(9999);
    expect(c.digest()).not.toBe(a.digest());
  });
});
