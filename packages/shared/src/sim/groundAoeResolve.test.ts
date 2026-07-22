/**
 * Ground AoE membership is resolved WHEN THE CAST LANDS, not when the key was
 * pressed (task #60). The cast-begin snapshot was replayed verbatim after the
 * wind-up, so an AoE with a cast time hit whoever happened to be standing in
 * the circle at cast time even if they walked out, and missed anyone who walked
 * in — an area effect that ignored the telegraph it had just drawn.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { Abilities } from "./content/registry";
import { castAbility } from "./abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

beforeAll(() => {
  registerSkeletonContent();
  // a ground AoE with a real wind-up: 0.35 s (the cast time 7 shipped
  // abilities actually use), 3-unit radius, plain damage
  Abilities.register("test.slowboom" as AbilityId, {
    id: "test.slowboom" as AbilityId,
    name: "Slow Boom",
    slot: "Q",
    castType: "ground",
    maxRank: 1,
    cooldown: [0.1],
    manaCost: [0],
    range: 12,
    radius: 3,
    targetsEnemies: true,
    castTimeSec: 0.35,
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
  });
});

const Z0 = SKELETON_ARENA.zones[0]!;

function setup(): { world: SimWorld; caster: EntityId; victim: EntityId; point: { x: number; z: number } } {
  const world = new SimWorld(SKELETON_ARENA, 21);
  const c = Z0.center;
  const caster = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 10, z: c.z + 10 },
    zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x - 2, z: c.z + 10 },
    zone: 0,
  });
  // give the caster the test ability in the Q slot
  world.abilities.get(caster)!.slots.Q = {
    abilityId: "test.slowboom" as AbilityId,
    rank: 1,
    cooldownRemainingTicks: 0,
  };
  // casting OUTSIDE a tick: index the freshly spawned bodies, or the
  // cast-begin overlap query would find an empty world and prove nothing
  world.rebuildGrid();
  return { world, caster, victim, point: { x: c.x - 2, z: c.z + 10 } };
}

describe("ground AoE re-queries its circle at resolve time", () => {
  it("a victim who WALKS OUT during the wind-up is not hit", () => {
    const { world, caster, victim, point } = setup();
    expect(castAbility(world, caster, "Q", { type: "point", point })).toBe("ok");
    // teleport clear of the 3-unit circle before the 0.35 s wind-up elapses
    world.transform.get(victim)!.pos = { x: point.x + 12, z: point.z };
    const full = world.health.get(victim)!.maxHp;
    for (let k = 0; k < 20; k++) world.step(new Map());
    expect(world.health.get(victim)!.hp).toBe(full);
  });

  it("a victim who WALKS IN during the wind-up IS hit", () => {
    const { world, caster, victim, point } = setup();
    // start well outside, so the cast-begin snapshot contains nobody at all
    world.transform.get(victim)!.pos = { x: point.x + 12, z: point.z };
    expect(castAbility(world, caster, "Q", { type: "point", point })).toBe("ok");
    world.transform.get(victim)!.pos = { x: point.x, z: point.z };
    const full = world.health.get(victim)!.maxHp;
    for (let k = 0; k < 20; k++) world.step(new Map());
    expect(world.health.get(victim)!.hp).toBeLessThan(full);
  });

  it("an INSTANT ground AoE still resolves against the cast-time circle", () => {
    const { world, caster, victim, point } = setup();
    Abilities.register("test.instaboom" as AbilityId, {
      ...Abilities.get("test.slowboom" as AbilityId),
      id: "test.instaboom" as AbilityId,
      castTimeSec: 0,
    });
    world.abilities.get(caster)!.slots.Q.abilityId = "test.instaboom" as AbilityId;
    const full = world.health.get(victim)!.maxHp;
    expect(castAbility(world, caster, "Q", { type: "point", point })).toBe("ok");
    for (let k = 0; k < 3; k++) world.step(new Map());
    expect(world.health.get(victim)!.hp).toBeLessThan(full);
  });
});
