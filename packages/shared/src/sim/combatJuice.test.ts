/**
 * Combat juice (SIM / authoritative half) — the deterministic, tick-based
 * feedback layer: the enriched `damage` event, `hitImpact`/`knockdown`/`whiff`/
 * `guardBreak` events, HITSTOP, KNOCKBACK, KNOCKDOWN, and the whiff lunge.
 *
 * Everything here is a pure function of (seed, inputs): no rng is consumed by
 * the juice, so the client's prediction shadow world replays it identically,
 * and no damage number or cooldown is altered (balance is untouched).
 *
 * NB: entities sit at z=14 — a band clear of the skeleton arena's three pillars
 * (at zone-center and ±(9,8)) so pushes/positions aren't perturbed by pillar
 * separation. The no-clip test deliberately uses the boundary instead.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { zeroStats } from "./stats/statTypes";
import type { ModifierSource } from "./stats/modifiers";
import type { DamageType } from "./effects/effect";
import {
  asSeatId,
  asTeamId,
  type EntityId,
  type SeatId,
  type ChampionId,
} from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center; // (-40, 0)
const Y = 14; // pillar-free band

function makeWorld(seed = 42): SimWorld {
  return new SimWorld(SKELETON_ARENA, seed);
}

/** A minimal combat dummy: transform + health + team + nav + status (no stats,
 *  so physical/magic mitigation is 0 → resolved damage == the amount pushed). */
function spawnDummy(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  opts: {
    hp?: number;
    facing?: V.Vec2;
    shields?: { amount: number; expiresAtTick: number; sourceId: string }[];
    sources?: ModifierSource[];
  } = {},
): EntityId {
  const id = world.spawn();
  const hp = opts.hp ?? 600;
  world.transform.set(id, {
    pos: { x: pos.x, z: pos.z },
    vel: V.v2(),
    facing: opts.facing ? { ...opts.facing } : { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: hp, mana: 0, maxMana: 0, alive: true, shields: opts.shields ?? [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
  world.status.set(id, { effects: [] });
  if (opts.sources) {
    world.stats.set(id, { championId: "dummy" as ChampionId, final: zeroStats(), dirty: false, sources: opts.sources });
  }
  return id;
}

function pushHit(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  type: DamageType,
  crit = false,
  origin = "test",
): void {
  world.damageQueue.push({ source, target, amount, type, crit, origin });
}

/** Find the first event of `type` emitted in the last step(). */
function firstEvent(world: SimWorld, type: string): Record<string, unknown> | undefined {
  return world.events.find((e) => e.type === type)?.data;
}

const empty = (): Map<SeatId, IntentFrame> => new Map();

// --------------------------------------------------------- RICH DAMAGE EVENT --
describe("rich damage event (the sim<->client seam)", () => {
  it("carries x/z, source/target, amount, dmgType, blocked, crit, killingBlow + a hitImpact pulse", () => {
    cover("cj-rich-payload");
    cover("cj-hitimpact");
    cover("cj-crit-flag");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 50, "magic", /*crit*/ true);
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.source).toBe(a);
    expect(dmg.target).toBe(b);
    expect(dmg.x).toBeCloseTo(ZC.x + 3, 6);
    expect(dmg.z).toBeCloseTo(Y, 6);
    expect(dmg.amount).toBeCloseTo(50, 6); // no stats → magic unmitigated
    expect(dmg.dmgType).toBe("magic");
    expect(dmg.type).toBe("magic"); // legacy alias kept for existing consumers
    expect(dmg.blocked).toBe(false);
    expect(dmg.crit).toBe(true);
    expect(dmg.killingBlow).toBe(false);
    expect(dmg.origin).toBe("test");

    // hitImpact fires on the same landed hit (client shake/particle timing)
    const hi = firstEvent(world, "hitImpact")!;
    expect(hi.target).toBe(b);
    expect(hi.dmgType).toBe("magic");
    expect(hi.crit).toBe(true);

    // a non-crit hit reads crit=false
    pushHit(world, a, b, 20, "physical", /*crit*/ false);
    world.step(empty());
    expect(firstEvent(world, "damage")!.crit).toBe(false);
  });

  it("flags killingBlow when the hit drops the target to 0 hp", () => {
    cover("cj-killing-blow");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, { hp: 30 });

    pushHit(world, a, b, 100, "true");
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.killingBlow).toBe(true);
    expect(world.health.get(b)!.alive).toBe(false); // DeathSystem confirmed it
  });

  it("derives blocked from a shield absorb, and guardBreak when the shield breaks this hit", () => {
    cover("cj-blocked-shield");
    cover("cj-guard-break");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      shields: [{ amount: 25, expiresAtTick: world.tick + 100, sourceId: "t" }],
    });

    pushHit(world, a, b, 40, "true"); // 25 eaten by shield, 15 to hp
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.blocked).toBe(true);
    expect(dmg.amount).toBeCloseTo(15, 6);
    const gb = firstEvent(world, "guardBreak")!;
    expect(gb.target).toBe(b); // the shield pool went 25 -> 0 this hit
    expect(world.health.get(b)!.shields.length).toBe(0);
  });

  it("derives blocked from an active damage-reduction buff (no shield needed)", () => {
    cover("cj-blocked-drbuff");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      sources: [{ id: "buff:guard", kind: "buff", damageReduction: true }],
    });

    pushHit(world, a, b, 50, "true");
    world.step(empty());

    const dmg = firstEvent(world, "damage")!;
    expect(dmg.blocked).toBe(true);
    expect(firstEvent(world, "guardBreak")).toBeUndefined(); // no shield to break
    expect(dmg.amount).toBeCloseTo(50, 6); // the tag does NOT change the number
  });
});

// ------------------------------------------------------------------ HITSTOP --
describe("hitstop", () => {
  it("freezes BOTH attacker and victim for exactly N ticks", () => {
    cover("cj-hitstop-ticks");
    cover("cj-hitstop-both");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    // impact 50 (<70) → hitstop but NO knockback, so movement isolation is clean.
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    world.nav.get(b)!.moveTarget = { x: ZC.x + 18, z: Y }; // walking +x

    pushHit(world, a, b, 50, "true");
    world.step(empty()); // hit LANDS this tick (both freeze starting next tick)

    // both the attacker and the victim are frozen for N = 2 ticks
    expect(world.hitstop.get(a)).toBe(2);
    expect(world.hitstop.get(b)).toBe(2);

    const frozenX = world.transform.get(b)!.pos.x;
    world.step(empty()); // frozen tick 1
    expect(world.transform.get(b)!.pos.x).toBe(frozenX);
    world.step(empty()); // frozen tick 2
    expect(world.transform.get(b)!.pos.x).toBe(frozenX);
    world.step(empty()); // freeze over → moves again
    expect(world.transform.get(b)!.pos.x).toBeGreaterThan(frozenX);
    expect(world.hitstop.get(b)).toBeUndefined();
  });

  it("scales with damage and caps at 6 ticks; chip damage never freezes", () => {
    cover("cj-hitstop-scale");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const light = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    const heavy = spawnDummy(world, 2, 1, { x: ZC.x + 3, z: Y + 3 });
    const chip = spawnDummy(world, 3, 1, { x: ZC.x + 3, z: Y - 3 });

    pushHit(world, a, light, 20, "true"); // → 2 ticks
    pushHit(world, a, heavy, 400, "true"); // → capped 6 ticks
    pushHit(world, a, chip, 5, "true"); //   → below the min impact, no freeze
    world.step(empty());

    expect(world.hitstop.get(light)).toBe(2);
    expect(world.hitstop.get(heavy)).toBe(6);
    expect(world.hitstop.get(heavy)!).toBeGreaterThan(world.hitstop.get(light)!);
    expect(world.hitstop.get(chip)).toBeUndefined();
  });

  it("is replay-deterministic: two seeded fights produce an identical digest (and hitstop fires)", () => {
    cover("cj-hitstop-determinism");
    const fight = (): { digest: number; sawHitstop: boolean } => {
      const world = makeWorld(999);
      const c = ZC;
      const sela = spawnChampion(world, {
        championId: "sela" as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(0),
        pos: { x: c.x - 1, z: c.z + 8 },
        zone: 0,
      });
      const thorne = spawnChampion(world, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(1),
        teamId: asTeamId(1),
        pos: { x: c.x + 1, z: c.z + 8 },
        zone: 0,
      });
      let sawHitstop = false;
      for (let k = 0; k < 150; k++) {
        const intents =
          k === 0
            ? new Map<SeatId, IntentFrame>([
                [asSeatId(0), { order: { kind: "attackTarget", entity: thorne }, commands: [] }],
                [asSeatId(1), { order: { kind: "attackTarget", entity: sela }, commands: [] }],
              ])
            : empty();
        world.step(intents);
        if ((world.hitstop.get(sela) ?? 0) > 0 || (world.hitstop.get(thorne) ?? 0) > 0) sawHitstop = true;
      }
      return { digest: world.digest(), sawHitstop };
    };
    const r1 = fight();
    const r2 = fight();
    expect(r1.digest).toBe(r2.digest);
    expect(r1.sawHitstop).toBe(true); // the juice actually engaged
  });
});

// ----------------------------------------------------------------- KNOCKBACK --
describe("knockback", () => {
  it("shoves the victim away from the source, magnitude by damage (after the hitstop hold)", () => {
    cover("cj-knockback-dir");
    cover("cj-knockback-mag");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }); // +x of a, same z

    pushHit(world, a, b, 100, "physical"); // impact 100 → 1.6u push, straight +x
    world.step(empty());

    // frozen first (hitstop), only THEN does the slide begin
    const heldX = world.transform.get(b)!.pos.x;
    world.step(empty());
    expect(world.transform.get(b)!.pos.x).toBe(heldX); // still in the hitstop hold

    for (let k = 0; k < 20; k++) world.step(empty());
    const disp = world.transform.get(b)!.pos.x - (ZC.x + 3);
    expect(disp).toBeGreaterThan(0); // pushed AWAY from the source (+x)
    expect(disp).toBeGreaterThan(1.3);
    expect(disp).toBeLessThan(1.9);
    expect(world.transform.get(b)!.pos.z).toBeCloseTo(Y, 3); // straight back, no drift
  });

  it("chip damage applies no knockback (autos/DoTs don't shove)", () => {
    cover("cj-knockback-chip");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 50, "physical"); // impact 50 (<70) → no push
    for (let k = 0; k < 12; k++) world.step(empty());
    expect(world.nav.get(b)!.override).toBeNull();
    expect(world.transform.get(b)!.pos.x).toBeCloseTo(ZC.x + 3, 6);
  });

  it("a blocked hit knocks back much less than the same unblocked hit", () => {
    cover("cj-knockback-blocked");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const open = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });
    const guarded = spawnDummy(world, 2, 1, { x: ZC.x + 3, z: Y + 6 }, {
      shields: [{ amount: 500, expiresAtTick: world.tick + 100, sourceId: "t" }],
    });
    const openStart = { ...world.transform.get(open)!.pos };
    const guardedStart = { ...world.transform.get(guarded)!.pos };

    pushHit(world, a, open, 100, "physical");
    pushHit(world, a, guarded, 100, "physical");
    world.step(empty());
    const guardedDmg = world.events.find((e) => e.type === "damage" && e.data.target === guarded)!.data;
    expect(guardedDmg.blocked).toBe(true);

    for (let k = 0; k < 20; k++) world.step(empty());
    const openMag = V.dist(world.transform.get(open)!.pos, openStart);
    const guardedMag = V.dist(world.transform.get(guarded)!.pos, guardedStart);
    expect(guardedMag).toBeGreaterThan(0);
    expect(guardedMag).toBeLessThan(openMag * 0.6); // ~0.35x per the block multiplier
  });

  it("respects the zone boundary — a big shove never clips outside the arena", () => {
    cover("cj-knockback-noclip");
    const world = makeWorld();
    // b sits near the boundary; a is inward, so b is shoved OUTWARD toward the wall
    const a = spawnDummy(world, 0, 0, { x: ZC.x + 10, z: 0 });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 22, z: 0 }); // dist 22 of 24
    const startDist = V.dist(world.transform.get(b)!.pos, ZC);

    pushHit(world, a, b, 400, "true"); // capped 4u shove, would reach dist 26
    for (let k = 0; k < 30; k++) world.step(empty());

    const endDist = V.dist(world.transform.get(b)!.pos, ZC);
    expect(endDist).toBeGreaterThan(startDist); // it WAS pushed toward the wall
    expect(endDist).toBeLessThanOrEqual(Z0.boundaryRadius - 0.6 + 1e-6); // but clamped inside
  });
});

// ----------------------------------------------------------------- KNOCKDOWN --
describe("knockdown", () => {
  it("a heavy unblocked hit emits knockdown and counts down to getup in exactly N ticks", () => {
    cover("cj-knockdown");
    cover("cj-knockdown-getup");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y });

    pushHit(world, a, b, 200, "physical"); // impact 200 ≥ 170 → knockdown
    world.step(empty());

    const kd = firstEvent(world, "knockdown")!;
    expect(kd.target).toBe(b);
    expect(world.knockdown.get(b)).toBe(14); // KNOCKDOWN_TICKS

    for (let k = 0; k < 13; k++) world.step(empty());
    expect(world.knockdown.get(b)).toBe(1); // still prone
    world.step(empty()); // 14th tick → getup
    expect(world.knockdown.get(b)).toBeUndefined();
  });

  it("roots the victim while prone (cannot walk), then it can move again on getup", () => {
    cover("cj-knockdown-root");
    const world = makeWorld();
    const c = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    world.knockdown.set(c, 4); // prone (regardless of how it got there)
    world.nav.get(c)!.moveTarget = { x: ZC.x, z: Y + 10 };
    const z0 = world.transform.get(c)!.pos.z;

    world.step(empty()); // knockdown 4 → rooted, no walk
    expect(world.transform.get(c)!.pos.z).toBe(z0);
    for (let k = 0; k < 4; k++) world.step(empty()); // ride out the prone window
    expect(world.knockdown.get(c)).toBeUndefined();
    for (let k = 0; k < 6; k++) world.step(empty()); // on its feet → walks the +z order
    expect(world.transform.get(c)!.pos.z).toBeGreaterThan(z0 + 0.3);
  });

  it("a blocked heavy hit knocks back but does NOT knock down", () => {
    cover("cj-knockdown-blocked-none");
    const world = makeWorld();
    const a = spawnDummy(world, 0, 0, { x: ZC.x, z: Y });
    const b = spawnDummy(world, 1, 1, { x: ZC.x + 3, z: Y }, {
      shields: [{ amount: 1000, expiresAtTick: world.tick + 100, sourceId: "t" }],
    });
    pushHit(world, a, b, 300, "physical"); // heavy, but fully shielded → blocked
    world.step(empty());
    expect(firstEvent(world, "knockdown")).toBeUndefined();
    expect(world.knockdown.get(b)).toBeUndefined();
    expect(world.nav.get(b)!.override).not.toBeNull(); // still shoved (reduced)
  });
});

// --------------------------------------------------------------------- WHIFF --
describe("whiff", () => {
  it("a committed melee swing that connects with nothing emits whiff + a forward lunge", () => {
    cover("cj-whiff-lunge");
    const world = makeWorld();
    const c = ZC;
    const sela = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x - 1, z: c.z + 8 },
      zone: 0,
    });
    const thorne = spawnChampion(world, {
      championId: "thorne" as ChampionId, // melee
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: c.x + 1, z: c.z + 8 },
      zone: 0,
    });

    // thorne swings at sela
    world.step(
      new Map<SeatId, IntentFrame>([[asSeatId(1), { order: { kind: "attackTarget", entity: sela }, commands: [] }]]),
    );

    // advance to the final wind-up tick (the swing has committed)
    let committed = false;
    for (let k = 0; k < 40 && !committed; k++) {
      const w = world.abilities.get(thorne)!.windup;
      if (w && w.ticksLeft === 1) committed = true;
      else world.step(empty());
    }
    expect(committed).toBe(true);

    // yank sela out of reach at the instant of the strike → the swing whiffs
    const st = world.transform.get(sela)!;
    st.pos = { x: st.pos.x, z: st.pos.z + 40 };
    const before = { ...world.transform.get(thorne)!.pos };

    world.step(empty()); // the committing tick
    expect(world.events.some((e) => e.type === "whiff" && e.data.source === thorne)).toBe(true);
    expect(world.nav.get(thorne)!.override?.kind).toBe("dash"); // over-commit lunge

    for (let k = 0; k < 5; k++) world.step(empty());
    expect(V.dist(before, world.transform.get(thorne)!.pos)).toBeGreaterThan(0.3); // lunged forward
  });
});
