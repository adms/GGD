/**
 * Ranged basic-attack projectile — the events the CLIENT hangs its visuals on
 * (task #60). The sim half already travelled correctly; what was missing was
 * the hooks:
 *   • no `projectileSpawn` for a ranged auto → the muzzle flash never fired and
 *     the missile appeared out of thin air;
 *   • `projectileEnd` was not fanned out and carried no position, so a missile
 *     that expired on a wall just blinked away.
 * These assert the visual contract, not the damage maths: the frame where the
 * missile is last drawn coincides with the tick the damage resolves.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ProjectileId } from "../ids";
import * as V from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;

/** Sela (ranged, range 11, missileSpeed 22) vs Thorne, 8 units apart. */
function duel(world: SimWorld): { sela: EntityId; thorne: EntityId } {
  const c = Z0.center;
  const sela = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 4, z: c.z + 8 },
    zone: 0,
  });
  const thorne = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + 4, z: c.z + 8 },
    zone: 0,
  });
  return { sela, thorne };
}

describe("ranged auto: the visual hooks the client needs", () => {
  it("emits projectileSpawn (muzzle-flash hook) with the swing", () => {
    const world = new SimWorld(SKELETON_ARENA, 11);
    const { sela, thorne } = duel(world);
    let swingTick = -1;
    let spawnTick = -1;
    let spawnOwner: number | null = null;
    let spawnProjectileId: string | null = null;
    for (let k = 0; k < 60 && spawnTick < 0; k++) {
      world.nav.get(sela)!.attackTarget = thorne;
      world.nav.get(sela)!.moveTarget = null; // hold position, fire from range
      world.step(new Map());
      for (const ev of world.events) {
        if (ev.type === "basicAttack" && ev.data.ranged && swingTick < 0) swingTick = world.tick;
        if (ev.type === "projectileSpawn" && spawnTick < 0) {
          spawnTick = world.tick;
          spawnOwner = ev.data.owner as number;
          spawnProjectileId = ev.data.projectileId as string;
        }
      }
    }
    expect(swingTick).toBeGreaterThan(0);
    expect(spawnTick).toBe(swingTick); // same tick as the swing
    expect(spawnOwner).toBe(sela);
    // the id the client resolves the trail/mesh identity from
    expect(spawnProjectileId).toBe("basic-attack");
  });

  it("the missile is drawn AT the victim on the tick the damage lands", () => {
    const world = new SimWorld(SKELETON_ARENA, 12);
    const { sela, thorne } = duel(world);
    // last position the CLIENT could have rendered (the previous snapshot):
    // the impact tick destroys the entity, so this is the final drawn frame
    let lastSeen: V.Vec2 | null = null;
    let dmgTick = -1;
    let hitTick = -1;
    let endHit: boolean | null = null;
    for (let k = 0; k < 90 && dmgTick < 0; k++) {
      world.nav.get(sela)!.attackTarget = thorne;
      world.nav.get(sela)!.moveTarget = null;
      world.step(new Map());
      for (const ev of world.events) {
        if (ev.type === "damage" && ev.data.origin === "basic" && dmgTick < 0) dmgTick = world.tick;
        if (ev.type === "basicAttackHit" && hitTick < 0) hitTick = world.tick;
        if (ev.type === "projectileEnd" && endHit === null) endHit = Boolean(ev.data.hit);
      }
      if (dmgTick < 0) {
        for (const [pid, p] of world.projectile) {
          if (!p.basic) continue;
          const t = world.transform.get(pid);
          if (t) lastSeen = { x: t.pos.x, z: t.pos.z };
        }
      }
    }
    expect(dmgTick).toBeGreaterThan(0);
    expect(hitTick).toBe(dmgTick); // impact fx and damage are the same frame
    expect(endHit).toBe(true); // a connected missile must NOT also fizzle
    expect(lastSeen).not.toBeNull();
    // one tick of travel (22 u/s ÷ 30 Hz ≈ 0.73) plus the hit envelope
    const gap = V.dist(lastSeen!, world.transform.get(thorne)!.pos);
    expect(gap).toBeLessThan(22 / 30 + 0.4 + 0.6 + 1e-6);
  });

  it("a missile that connects with nothing reports WHERE it died, and fizzles", () => {
    const world = new SimWorld(SKELETON_ARENA, 13);
    // a lone projectile with nothing to hit: it expires at max range
    const owner = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z + 8 },
      zone: 0,
    });
    const pid = world.spawn();
    world.transform.set(pid, {
      pos: { x: Z0.center.x, z: Z0.center.z + 8 },
      vel: { x: 20, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.4,
      zone: 0,
    });
    world.projectile.set(pid, {
      projectileId: "basic-attack" as ProjectileId,
      ownerId: owner,
      dir: { x: 1, z: 0 },
      speed: 20,
      remainingRange: 3,
      hitRadius: 0.4,
      pierce: false,
      hitSet: new Set(),
      onHit: [],
      rank: 1,
      origin: "basic",
      basic: true,
      basicDamage: 1,
      crit: false,
    });

    let end: Record<string, unknown> | null = null;
    for (let k = 0; k < 30 && !end; k++) {
      world.step(new Map());
      for (const ev of world.events) if (ev.type === "projectileEnd") end = ev.data;
    }
    expect(end).not.toBeNull();
    expect(end!.hit).toBe(false); // → the client plays a fizzle
    // and it carries the END POINT, because the entity is already destroyed
    expect(typeof end!.x).toBe("number");
    expect(typeof end!.z).toBe("number");
    expect(end!.x as number).toBeCloseTo(Z0.center.x + 3, 5);
  });
});
