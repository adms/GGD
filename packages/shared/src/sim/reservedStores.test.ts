/**
 * GH#289 — the three RESERVED component stores landed ahead of their lanes
 * (`dot` / `summon` / `invulnerable`), so that P1/P2/P3 never have to reopen
 * SimWorld's class body concurrently.
 *
 * Landing a store early has exactly two ways to be wrong, and both are the
 * quiet kind:
 *
 *   ① `destroy()` forgets it → a recycled entityId inherits the previous
 *      life's burn / summon link / immunity. Every other store in that method
 *      carries a comment saying so precisely because it has happened before
 *      (#215 mob markers, #249 championForm, GH#216 walkStall).
 *
 *   ② `digest()` forgets it → the state is authoritative (it decides who dies)
 *      but invisible to the parity hash, so a desync surfaces minutes later as
 *      an unexplained HP divergence. That is #198's open non-determinism hunt.
 *
 * Both are guarded by BEHAVIOUR here — populate the store, watch the hash move,
 * destroy the entity, watch it come back — rather than by asserting the maps
 * exist, which would pass on a world that never reads them.
 *
 * The third requirement is that landing them changed NOTHING today: all three
 * are empty in every current code path, and each folds into `digest()` only
 * when present, so a post-#289 world must hash identically to a pre-#289 one.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import type { EntityId } from "../ids";

function worldWithOne(): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: 0 },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, { hp: 300, maxHp: 300, mana: 0, maxMana: 0, alive: true, shields: [] });
  return { world, id };
}

describe("GH#289 reserved component stores (gh289-reserved-stores)", () => {
  it("start EMPTY, so today's world hashes exactly as it did pre-#289", () => {
    cover("gh289-reserved-stores");
    const { world } = worldWithOne();
    expect(world.dot.size).toBe(0);
    expect(world.summon.size).toBe(0);
    expect(world.invulnerable.size).toBe(0);
    // The present-only fold is the reason this holds: an absent entry
    // contributes nothing, so no existing golden digest moves.
    const before = world.digest();
    expect(world.digest()).toBe(before);
  });

  it("each store is FOLDED INTO digest() — an unhashed store is a silent desync", () => {
    cover("gh289-reserved-stores");
    // Three separate worlds so the three folds are proved independently: if
    // only one of them were wired, a single combined case would still pass.
    const base = worldWithOne();
    const baseline = base.world.digest();

    const a = worldWithOne();
    a.world.dot.set(a.id, [
      {
        sourceId: a.id,
        origin: "ability:test.burn",
        damageType: "magic",
        amountPerTick: 7,
        nextTick: 10,
        intervalTicks: 30,
        expiresAtTick: 100,
      },
    ]);
    expect(a.world.digest(), "dot is not in the digest").not.toBe(baseline);

    const b = worldWithOne();
    b.world.summon.set(b.id, { ownerId: b.id, expiresAtTick: 250 });
    expect(b.world.digest(), "summon is not in the digest").not.toBe(baseline);

    const c = worldWithOne();
    // P3 landed and the value grew from a bare expiry tick to a four-axis grant
    // (無敵 / 魔法免疫 / 免控 are three different mechanics that can overlap on
    // one body with different deadlines — see sim/effects/invulnerable.ts).
    c.world.invulnerable.set(c.id, {
      physicalUntil: 90,
      magicUntil: 90,
      trueUntil: 90,
      controlUntil: 0,
    });
    expect(c.world.digest(), "invulnerable is not in the digest").not.toBe(baseline);
  });

  it("a PERMANENT summon does not hash as tick 0", () => {
    cover("gh289-reserved-stores");
    // `Math.round(Infinity * 4096)` is NaN and the bit ops turn that into 0,
    // which would make a permanent summon collide with one expiring on tick 0.
    // The fold maps permanence to its own -1 marker instead.
    const perm = worldWithOne();
    perm.world.summon.set(perm.id, {
      ownerId: perm.id,
      expiresAtTick: Number.POSITIVE_INFINITY,
    });
    const zero = worldWithOne();
    zero.world.summon.set(zero.id, { ownerId: zero.id, expiresAtTick: 0 });
    expect(perm.world.digest()).not.toBe(zero.world.digest());
  });

  it("the dot fold is order-INDEPENDENT (two hosts, same burns, same hash)", () => {
    cover("gh289-reserved-stores");
    // Instance order inside the array is the tick system's business, but the
    // DIGEST must not depend on it or two replicas that agree on every burn
    // still disagree on the hash — the exact class of bug #198 is hunting.
    const mk = (order: 0 | 1): number => {
      const { world, id } = worldWithOne();
      const burn = {
        sourceId: id,
        origin: "ability:a",
        damageType: "magic" as const,
        amountPerTick: 3,
        nextTick: 5,
        intervalTicks: 30,
        expiresAtTick: 60,
      };
      const poison = { ...burn, origin: "ability:b", amountPerTick: 4, nextTick: 9 };
      world.dot.set(id, order === 0 ? [burn, poison] : [poison, burn]);
      return world.digest();
    };
    expect(mk(0)).toBe(mk(1));
  });

  it("destroy() clears all three — a recycled id inherits no stale state", () => {
    cover("gh289-reserved-stores");
    const { world, id } = worldWithOne();
    const empty = world.digest();

    world.dot.set(id, [
      {
        sourceId: id,
        origin: "ability:test.burn",
        damageType: "true",
        amountPerTick: 11,
        nextTick: 3,
        intervalTicks: 15,
        expiresAtTick: 90,
      },
    ]);
    world.summon.set(id, { ownerId: id, expiresAtTick: 40 });
    world.invulnerable.set(id, {
      physicalUntil: 55,
      magicUntil: 55,
      trueUntil: 55,
      controlUntil: 55,
    });
    expect(world.digest()).not.toBe(empty);

    world.destroy(id);
    expect(world.dot.has(id)).toBe(false);
    expect(world.summon.has(id)).toBe(false);
    expect(world.invulnerable.has(id)).toBe(false);
    // The behavioural half: a destroyed entity contributes nothing, so the
    // world hashes as the empty one it now is. `destroy` also drops the
    // transform, so this covers the whole cleanup, not just the three deletes.
    const fresh = new SimWorld(SKELETON_ARENA, 4242);
    expect(world.digest()).toBe(fresh.digest());
  });
});
