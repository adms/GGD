/**
 * Combat timing v2 — ability CAST TIME (ct) + basic-attack overhaul
 * (wind-up, ranged projectiles at the champion's missile speed, on-hit on
 * impact). Covers the docs/todo/combat-timing.md rows.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { Champions } from "./content/registry";
import { castAbility } from "./abilities/abilitySystem";
import { buyItem } from "./economy/shop";
import { Stat } from "./stats/statTypes";
import {
  asSeatId,
  asTeamId,
  type EntityId,
  type SeatId,
  type ChampionId,
  type ItemId,
  type StatusId,
} from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const Z = (): { x: number; z: number } => SKELETON_ARENA.zones[0]!.center;

function makeWorld(seed = 42): SimWorld {
  return new SimWorld(SKELETON_ARENA, seed);
}

/** Sela (seat 0, team 0) and Thorne (seat 1, team 1) facing each other. */
function duel(world: SimWorld, gap = 8): { sela: EntityId; thorne: EntityId } {
  const c = Z();
  const sela = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - gap / 2, z: c.z + 8 },
    zone: 0,
  });
  const thorne = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + gap / 2, z: c.z + 8 },
    zone: 0,
  });
  world.transform.get(sela)!.facing = { x: 1, z: 0 };
  world.transform.get(thorne)!.facing = { x: -1, z: 0 };
  return { sela, thorne };
}

const intentsOf = (seat: number, frame: Partial<IntentFrame>): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(seat), { commands: [], ...frame }]]);

/** Pin a unit in place (root) so a ranged auto fires from real distance. */
function root(world: SimWorld, id: EntityId): void {
  world.status.get(id)!.effects.push({
    statusId: "test-root" as StatusId,
    sourceId: "test",
    expiresAtTick: world.tick + 100000,
    root: true,
  });
}

// ------------------------------------------------------------------ PART A --
describe("ability cast time (ct)", () => {
  it("cast with ct>0 resolves effects after the wind-up, not instantly (ct-01)", () => {
    cover("ct-cast-deferred");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 6);
    world.abilities.get(sela)!.slots.R.rank = 1; // Firestorm has ct 0.5s
    world.health.get(sela)!.mana = 400;
    const tPos = world.transform.get(thorne)!.pos;
    world.rebuildGrid();

    expect(castAbility(world, sela, "R", { type: "point", point: { x: tPos.x, z: tPos.z } })).toBe(
      "ok",
    );
    // entered a cast state — effects have NOT run yet
    expect(world.abilities.get(sela)!.cast).toBeTruthy();
    const hpBefore = world.health.get(thorne)!.hp;
    world.step(new Map());
    expect(world.health.get(thorne)!.hp).toBe(hpBefore); // still winding up

    // ct 0.5s @30Hz = 15 ticks — resolve within the budget
    let damaged = false;
    for (let k = 0; k < 20 && !damaged; k++) {
      world.step(new Map());
      if (world.health.get(thorne)!.hp < hpBefore) damaged = true;
    }
    expect(damaged).toBe(true);
    expect(world.abilities.get(sela)!.cast).toBeFalsy(); // cast finished
  });

  it("caster is rooted during the cast, free afterward (ct-02)", () => {
    cover("ct-cast-rooted");
    const world = makeWorld();
    const { sela } = duel(world);
    world.abilities.get(sela)!.slots.R.rank = 1;
    world.health.get(sela)!.mana = 400;
    const c = Z();
    const before = { ...world.transform.get(sela)!.pos };
    castAbility(world, sela, "R", { type: "point", point: { x: c.x, z: c.z } });

    // try to move while casting — rooted, so no movement
    for (let k = 0; k < 5; k++) {
      world.step(intentsOf(0, { order: { kind: "move", point: { x: c.x + 20, z: c.z } } }));
    }
    expect(V.dist(before, world.transform.get(sela)!.pos)).toBeLessThan(0.05);

    // after the cast resolves the standing move order takes over
    for (let k = 0; k < 30; k++) world.step(new Map());
    expect(V.dist(before, world.transform.get(sela)!.pos)).toBeGreaterThan(1);
  });

  it("stun interrupts the cast: no effect, mana stays spent (ct-03)", () => {
    cover("ct-cast-interrupt");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 6);
    world.abilities.get(sela)!.slots.R.rank = 1;
    world.health.get(sela)!.mana = 400;
    const tPos = world.transform.get(thorne)!.pos;
    world.rebuildGrid();

    const manaBefore = world.health.get(sela)!.mana;
    castAbility(world, sela, "R", { type: "point", point: { x: tPos.x, z: tPos.z } });
    expect(world.health.get(sela)!.mana).toBe(manaBefore - 100); // paid up-front

    world.status.get(sela)!.effects.push({
      statusId: "stun" as StatusId,
      sourceId: "t",
      expiresAtTick: world.tick + 30,
      stun: true,
    });
    const hpBefore = world.health.get(thorne)!.hp;
    for (let k = 0; k < 20; k++) world.step(new Map());

    expect(world.abilities.get(sela)!.cast).toBeFalsy(); // interrupted
    expect(world.health.get(thorne)!.hp).toBe(hpBefore); // no damage
    expect(world.health.get(sela)!.mana).toBeLessThan(manaBefore); // not refunded
  });

  it("ct=0 abilities still resolve instantly (ct-04)", () => {
    cover("ct-zero-instant");
    const world = makeWorld();
    const { sela } = duel(world);
    // Sela Q is a ct=0 skillshot: the projectile spawns synchronously on cast
    expect(castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    expect(world.abilities.get(sela)!.cast).toBeFalsy(); // no cast state
    expect([...world.projectile.keys()].length).toBeGreaterThan(0); // effect ran now
  });
});

// ------------------------------------------------------------------ PART B --
describe("basic attack overhaul", () => {
  it("ranged auto spawns a projectile that damages on IMPACT, not instantly (ct-05)", () => {
    cover("ba-ranged-impact");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 8); // in Sela's range (11), out of melee
    root(world, sela); // pinned: fires from 8 units so travel is observable
    world.nav.get(sela)!.attackTarget = thorne;

    let sawProjectile = false;
    let launchTick = -1;
    let dmgTick = -1;
    for (let k = 0; k < 80; k++) {
      world.step(new Map());
      for (const [, p] of world.projectile) if (p.basic) sawProjectile = true;
      for (const ev of world.events) {
        if (ev.type === "basicAttack" && ev.data.ranged && launchTick < 0) launchTick = world.tick;
        if (ev.type === "damage" && ev.data.origin === "basic" && dmgTick < 0) dmgTick = world.tick;
      }
    }
    expect(sawProjectile).toBe(true);
    expect(launchTick).toBeGreaterThan(0);
    expect(dmgTick).toBeGreaterThan(launchTick); // damage lands after the swing (on impact)
    expect(world.health.get(thorne)!.hp).toBeLessThan(world.health.get(thorne)!.maxHp);
  });

  it("melee auto applies damage at the damage point, after the wind-up begins (ct-06)", () => {
    cover("ba-melee-damage-point");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 2); // thorne is melee
    let windupTick = -1;
    let dmgTick = -1;
    for (let k = 0; k < 40; k++) {
      const intents =
        k === 0 ? intentsOf(1, { order: { kind: "attackTarget", entity: sela } }) : new Map();
      world.step(intents);
      for (const ev of world.events) {
        if (ev.type === "attackWindup" && ev.data.source === thorne && windupTick < 0)
          windupTick = world.tick;
        if (ev.type === "damage" && ev.data.origin === "basic" && dmgTick < 0) dmgTick = world.tick;
      }
    }
    expect(windupTick).toBeGreaterThan(0);
    expect(dmgTick).toBeGreaterThan(windupTick); // hit lands at the damage point
    expect(world.health.get(sela)!.hp).toBeLessThan(world.health.get(sela)!.maxHp);
  });

  it("stun during the wind-up cancels the swing (ct-07)", () => {
    cover("ba-windup-interrupt");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 2);
    world.step(intentsOf(1, { order: { kind: "attackTarget", entity: sela } }));

    let started = false;
    for (let k = 0; k < 25 && !started; k++) {
      world.step(new Map());
      if (world.abilities.get(thorne)!.windup) started = true;
    }
    expect(started).toBe(true);
    const hpBefore = world.health.get(sela)!.hp;

    world.status.get(thorne)!.effects.push({
      statusId: "stun" as StatusId,
      sourceId: "t",
      expiresAtTick: world.tick + 30,
      stun: true,
    });
    world.step(new Map());
    expect(world.abilities.get(thorne)!.windup).toBeFalsy(); // wind-up canceled
    for (let k = 0; k < 5; k++) world.step(new Map());
    expect(world.health.get(sela)!.hp).toBe(hpBefore); // no damage from the canceled swing
  });

  it("item on-hit (Serrated Edge) fires on IMPACT for a ranged carrier (ct-08)", () => {
    cover("ba-onhit-impact");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 8);
    root(world, sela);
    world.champion.get(sela)!.gold = 5000;
    buyItem(world, sela, "serrated-edge" as ItemId);
    world.nav.get(sela)!.attackTarget = thorne;

    let launchTick = -1;
    let onhitTick = -1;
    for (let k = 0; k < 80; k++) {
      world.step(new Map());
      for (const ev of world.events) {
        if (ev.type === "basicAttack" && ev.data.ranged && launchTick < 0) launchTick = world.tick;
        if (
          ev.type === "damage" &&
          (ev.data.origin as string).startsWith("hook:item:serrated-edge") &&
          onhitTick < 0
        )
          onhitTick = world.tick;
      }
    }
    expect(launchTick).toBeGreaterThan(0);
    expect(onhitTick).toBeGreaterThan(launchTick); // on-hit resolves at impact, not the swing
  });

  it("attack interval respects baseAttackTime × attackSpeed (ct-09)", () => {
    cover("ba-interval");
    const measureGap = (buffAs: number, bat?: number): number => {
      const world = makeWorld();
      const { sela, thorne } = duel(world, 2);
      const def = Champions.get("thorne" as ChampionId);
      const savedBat = def.baseAttackTime;
      if (bat !== undefined) def.baseAttackTime = bat;
      if (buffAs > 0) {
        world.stats.get(thorne)!.sources.push({
          id: "t:as",
          kind: "buff",
          modifiers: [{ stat: Stat.AttackSpeed, op: "flat" as never, value: buffAs }],
        });
        world.stats.get(thorne)!.dirty = true;
      }
      const times: number[] = [];
      world.step(intentsOf(1, { order: { kind: "attackTarget", entity: sela } }));
      for (let k = 0; k < 250 && times.length < 2; k++) {
        world.step(new Map());
        for (const ev of world.events)
          if (ev.type === "basicAttack" && ev.data.source === thorne) times.push(world.tick);
      }
      def.baseAttackTime = savedBat; // restore shared registry def
      expect(times.length).toBeGreaterThanOrEqual(2);
      return times[1]! - times[0]!;
    };

    const world0 = makeWorld();
    const { thorne } = duel(world0, 2);
    const asBase = world0.stats.get(thorne)!.final[Stat.AttackSpeed]; // 0.7
    const baseGap = measureGap(0);
    // baseAttackTime default 1.0: interval == round(1/AS/dt)
    expect(baseGap).toBe(Math.round(1.0 / asBase / world0.dt));
    // more attack speed → shorter interval
    expect(measureGap(0.7)).toBeLessThan(baseGap);
    // higher baseAttackTime → longer interval (scales the base time)
    expect(measureGap(0, 2.0)).toBeGreaterThan(baseGap * 1.8);
  });

  it("per-champion missileSpeed/range are read from the champion doc (ct-10)", () => {
    cover("ba-champion-data");
    const world = makeWorld();
    const def = Champions.get("sela" as ChampionId);
    expect(def.missileSpeed).toBe(22);
    expect(def.attackDamagePoint).toBe(0.3);

    const { sela, thorne } = duel(world, 8);
    root(world, sela);
    world.nav.get(sela)!.attackTarget = thorne;
    // Sela attacks from within her doc range (11), never chasing to melee
    expect(world.stats.get(sela)!.final[Stat.AttackRange]).toBe(def.baseStats.range);

    let projSpeed = -1;
    for (let k = 0; k < 40 && projSpeed < 0; k++) {
      world.step(new Map());
      for (const [, p] of world.projectile) if (p.basic) projSpeed = p.speed;
    }
    expect(projSpeed).toBe(def.missileSpeed); // 22, straight from the doc
  });
});
