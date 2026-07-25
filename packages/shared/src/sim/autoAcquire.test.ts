/**
 * AUTO-ATTACK TARGET ACQUISITION (task #221).
 *
 * Owner directive: 「玩家操控的 近戰跟遠戰英雄 應該都要會自動攻擊附近英雄
 * 優先打攻擊自己的敵人 再來是血量低的 再來是距離最近的」.
 *
 * The reported symptom: a player who never right-clicks an enemy never attacks
 * at all. `Navigation.attackTarget` had exactly four writers (the seat order
 * switch, the chase-loss clear, the dead-target clear, and MobSystem) and none
 * of them fires for an idle human, so `BasicAttackSystem`'s
 * `if (!nav?.attackTarget) continue` bailed forever.
 *
 * These tests pin the RULE (sim/targeting.ts) and its three hard constraints:
 * a total + stable order, no override of an explicit player action, and bitwise
 * determinism across seeded runs.
 *
 * GEOMETRY NOTE — every position here is expressed as an offset from the ZONE
 * CENTRE, on the line `z = center.z + 12`. Zone 0 of SKELETON_ARENA is centred
 * at (-40, 0) with a 24 u boundary; a unit placed at the world origin is 40 u
 * outside it and gets clamped back in by MovementSystem, which silently destroys
 * every distance this file asserts on. The +12 lane also clears the two
 * remaining r1.8 obstacles at |z|=8. (Task #218 deleted the centre r2.5 pillar
 * from every arena, so the lane now has more room than when this was written —
 * it is kept as-is because the boundary clamp, not the pillars, is what these
 * distances actually need protecting from.)
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import type { AbilitiesComp } from "./stats/statsComp";
import type { IntentFrame } from "./intents";
import { MONSTER_TEAM } from "./mobs";
import { acquireTarget, MELEE_ACQUIRE_FLOOR, THREAT_WINDOW_TICKS } from "./targeting";
import * as V from "./math/vec2";

const Z0 = SKELETON_ARENA.zones[0]!;
/** A point `dx` units along the clear lane, `dz` above it. */
function at(dx: number, dz = 0): V.Vec2 {
  return { x: Z0.center.x + dx, z: Z0.center.z + 12 + dz };
}

/** A minimal combat-capable champion: stats + abilities, no content doc needed. */
function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  range = 1.6,
  hp = 5000,
  moveSpeed = 5.8,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = moveSpeed;
  final[Stat.AttackRange] = range;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  // ChampionComp is the champion/mob discriminator the targeting rule reads.
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

/**
 * A target that cannot walk. Used wherever the assertion is about how far the
 * ACQUIRER moved: every champion auto-acquires now, so a mobile dummy charges
 * back and the measured gap stops being a statement about the hero under test.
 *
 * The speed is EPSILON, not 0: MovementSystem reads
 * `stats.final[Stat.MoveSpeed] || BASE_MOVE_SPEED`, so a literal 0 is falsy and
 * silently promotes the dummy to the default 6 u/s sprint.
 */
const IMMOBILE = 1e-9;
function spawnDummy(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  hp = 5000,
): EntityId {
  return spawnFighter(world, seat, team, pos, 1.6, hp, IMMOBILE);
}

/** A #215-shaped mob: MONSTER team, MobComp, and deliberately NO ChampionComp. */
function spawnMob(world: SimWorld, pos: V.Vec2, hp = 100): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, { hp, maxHp: 100, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: MONSTER_TEAM, seatId: asSeatId(-1) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  // MobComp carries no level of its own — #217 put the mob's effective level on
  // the arm-time MobRules instead, so it is immutable state no system can drift.
  world.mob.set(id, { zone: 0, team: MONSTER_TEAM, target: -1 as EntityId, attackCdTicks: 0, spawnTick: 0 });
  return id;
}

/** A live combat world (auto-acquire is gated on `combatActive`). */
function combatWorld(seed = 11): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  return world;
}

/**
 * Publish the freshly-spawned bodies into the broad-phase.
 *
 * `acquireTarget` reads candidates from `queryOverlap`, i.e. from `world.grid`,
 * which `step()` rebuilds at the top of every tick. Tests that call the pure
 * rule WITHOUT stepping must do the same or every scan returns null.
 */
function settle(world: SimWorld): void {
  world.rebuildGrid();
}

/** An IntentFrame carrying one order (`commands` is required by the contract). */
function order(o: IntentFrame["order"]): Map<SeatId, IntentFrame> {
  return new Map([[asSeatId(0), { order: o, commands: [] }]]);
}

const NO_INTENTS = new Map<SeatId, IntentFrame>();

/** Mark `attacker` as having just damaged `victim` (the real threat store). */
function markThreat(world: SimWorld, victim: EntityId, attacker: EntityId): void {
  let m = world.recentDamagers.get(victim);
  if (!m) {
    m = new Map<EntityId, number>();
    world.recentDamagers.set(victim, m);
  }
  m.set(attacker, world.tick);
}

/** Basic attacks emitted by `who` over `ticks` steps. */
function runAndCountAttacks(world: SimWorld, who: EntityId, ticks: number): number {
  let attacks = 0;
  for (let k = 0; k < ticks; k++) {
    world.step(NO_INTENTS);
    attacks += world.events.filter((e) => e.type === "basicAttack" && e.data.source === who).length;
  }
  return attacks;
}

describe("#221 the reported symptom: an idle player never attacked at all", () => {
  it("a MELEE hero with no orders walks in and lands basic attacks", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(-4), 1.6);
    const enemy = spawnDummy(world, 1, 1, at(1));

    const attacks = runAndCountAttacks(world, me, 90);
    expect(world.nav.get(me)!.attackTarget).toBe(enemy);
    expect(attacks).toBeGreaterThan(0);
  });

  it("a RANGED hero opens fire from range without closing to melee", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(-9), 11);
    const enemy = spawnDummy(world, 1, 1, at(0));

    const attacks = runAndCountAttacks(world, me, 90);
    expect(attacks).toBeGreaterThan(0);
    // it fired from where it stood — never took a step toward contact
    const d = V.dist(world.transform.get(me)!.pos, world.transform.get(enemy)!.pos);
    expect(d).toBeCloseTo(9, 1);
  });

  it("melee CLOSES IN while ranged HOLDS — the same rule, two ranges", () => {
    const gap = 5; // inside the melee acquisition floor, well inside range 11
    const dists: number[] = [];
    for (const range of [1.6, 11]) {
      const world = combatWorld(5);
      const me = spawnFighter(world, 0, 0, at(-gap), range);
      const enemy = spawnDummy(world, 1, 1, at(0));
      for (let k = 0; k < 120; k++) world.step(NO_INTENTS);
      dists.push(V.dist(world.transform.get(me)!.pos, world.transform.get(enemy)!.pos));
    }
    expect(dists[0]!).toBeLessThanOrEqual(1.6); // melee walked into its reach
    expect(dists[1]!).toBeCloseTo(gap, 1); // ranged never moved: already in band
  });

  it("nothing happens outside the acquisition radius (no chasing across the map)", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(-10), 1.6);
    spawnFighter(world, 1, 1, at(10), 1.6);
    const start = { ...world.transform.get(me)!.pos };
    for (let k = 0; k < 30; k++) world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBeNull();
    expect(world.transform.get(me)!.pos.x).toBeCloseTo(start.x, 6);
    expect(world.transform.get(me)!.pos.z).toBeCloseTo(start.z, 6);
  });
});

describe("#221 priority: 威脅 → 低血 → 最近 (and the id tiebreak)", () => {
  it("THREAT beats lower HP and beats nearer", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const nearest = spawnFighter(world, 1, 1, at(1.5), 1.6, 5000);
    const lowest = spawnFighter(world, 2, 1, at(3), 1.6, 40);
    const aggressor = spawnFighter(world, 3, 1, at(4.5), 1.6, 5000);
    markThreat(world, me, aggressor);
    settle(world);

    const got = acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!;
    expect(got.id).toBe(aggressor);
    expect(got.threat).toBe(0);
    expect(got.id).not.toBe(nearest);
    expect(got.id).not.toBe(lowest);
  });

  it("with no threat, LOWEST HP beats nearest", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnFighter(world, 1, 1, at(1.5), 1.6, 5000); // nearest
    const lowest = spawnFighter(world, 2, 1, at(4), 1.6, 40);
    settle(world);
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(lowest);
  });

  it("with no threat and equal HP, NEAREST wins", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const far = spawnFighter(world, 1, 1, at(4.5), 1.6);
    const near = spawnFighter(world, 2, 1, at(2), 1.6);
    settle(world);
    const got = acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!;
    expect(got.id).toBe(near);
    expect(got.id).not.toBe(far);
  });

  it("a stale threat (older than the window) stops counting", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const near = spawnFighter(world, 1, 1, at(1.5), 1.6);
    const old = spawnFighter(world, 2, 1, at(4.5), 1.6);
    markThreat(world, me, old);
    settle(world);
    // inside the window the stale-to-be aggressor still outranks the nearer body
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(old);
    world.tick += THREAT_WINDOW_TICKS + 1;
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(near);
  });

  it("an EXACT 3-way tie resolves to the LOWEST ENTITY ID and stays put", () => {
    // Identical kind, threat, HP and squared distance: only the final tiebreak
    // can decide, and it must decide the same way on every tick and every host.
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const a = spawnFighter(world, 1, 1, at(3), 1.6);
    const b = spawnFighter(world, 2, 1, at(-3), 1.6);
    const c = spawnFighter(world, 3, 1, at(0, 3), 1.6);
    settle(world);
    const lowest = Math.min(a, b, c) as EntityId;
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(lowest);
    // and re-running the pure scan is idempotent
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(lowest);
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(lowest);
  });

  it("allies, self and dead enemies are never acquired", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnFighter(world, 1, 0, at(1), 1.6); // ally, closest of all
    const corpse = spawnFighter(world, 2, 1, at(2), 1.6);
    world.health.get(corpse)!.alive = false;
    const live = spawnFighter(world, 3, 1, at(4), 1.6);
    settle(world);
    expect(acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!.id).toBe(live);
  });
});

describe("#221 mobs (#215) are the FALLBACK, never the preference", () => {
  it("an enemy CHAMPION in radius outranks an adjacent mob, even a 1-HP one", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnMob(world, at(1), 1);
    const champ = spawnFighter(world, 1, 1, at(5), 1.6);
    settle(world);
    const got = acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!;
    expect(got.id).toBe(champ);
    expect(got.kind).toBe(0);
  });

  it("a mob IS picked when no enemy champion is in radius", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const mob = spawnMob(world, at(2));
    spawnFighter(world, 1, 1, at(18), 1.6); // champion far outside radius
    settle(world);
    const got = acquireTarget(world, me, MELEE_ACQUIRE_FLOOR)!;
    expect(got.id).toBe(mob);
    expect(got.kind).toBe(1);
  });

  it("MobSystem still owns mob aggro — the pass never re-points a mob", () => {
    const world = combatWorld();
    const mob = spawnMob(world, at(0));
    spawnFighter(world, 0, 0, at(1.5), 1.6);
    world.step(NO_INTENTS);
    // mobs are not in `world.champion`, so autoAcquirePass skips them entirely
    expect(world.nav.get(mob)!.attackTargetAuto).toBe(false);
  });
});

describe("#221 an EXPLICIT player action always wins", () => {
  it("a manual attackTarget is never re-pointed, even at a better target", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const chosen = spawnDummy(world, 1, 1, at(4.5), 5000);
    const juicier = spawnDummy(world, 2, 1, at(-1.6), 30);
    markThreat(world, me, juicier); // threat AND low HP AND nearest

    world.step(order({ kind: "attackTarget", entity: chosen }));
    for (let k = 0; k < 20; k++) world.step(NO_INTENTS);

    expect(world.nav.get(me)!.attackTarget).toBe(chosen);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(false);
  });

  it("an explicit MOVE order suppresses acquisition for the whole walk", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnDummy(world, 1, 1, at(2));

    world.step(order({ kind: "move", point: at(12) }));
    for (let k = 0; k < 25; k++) {
      world.step(NO_INTENTS);
      expect(world.nav.get(me)!.attackTarget).toBeNull();
    }
    // and it is walking AWAY, not standing and fighting
    expect(world.transform.get(me)!.pos.x).toBeGreaterThan(Z0.center.x + 2);
  });

  it("ATTACK-MOVE does acquire — the A-click that used to be a plain move", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const enemy = spawnDummy(world, 1, 1, at(3));
    world.step(order({ kind: "attackMove", point: at(12) }));
    expect(world.nav.get(me)!.attackTarget).toBe(enemy);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(true);
  });

  it("STOP is consumed, so S is not a permanent auto-attack OFF switch", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const enemy = spawnDummy(world, 1, 1, at(3));
    world.step(order({ kind: "stop" }));
    expect(world.nav.get(me)!.attackTarget).toBeNull(); // the stop tick itself
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(enemy);
  });

  it("HOLD suppresses the CHASE but not the swing", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnDummy(world, 1, 1, at(4)); // inside acquire radius, outside reach
    const start = { ...world.transform.get(me)!.pos };
    world.step(order({ kind: "hold" }));
    for (let k = 0; k < 30; k++) world.step(NO_INTENTS);
    // never acquired something it would have to walk to, and never walked
    expect(world.nav.get(me)!.moveTarget).toBeNull();
    expect(world.transform.get(me)!.pos.x).toBeCloseTo(start.x, 6);
  });

  it("HOLD still swings at whatever is already in reach", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnDummy(world, 1, 1, at(1.35)); // inside 0.9 x reach
    world.step(order({ kind: "hold" }));
    const attacks = runAndCountAttacks(world, me, 60);
    expect(world.nav.get(me)!.attackTarget).not.toBeNull();
    expect(attacks).toBeGreaterThan(0);
    expect(world.nav.get(me)!.moveTarget).toBeNull();
  });

  it("a manual target that DIES releases the seat back to auto-acquire", () => {
    // The lockout this guards: `nav.order` stays `attackTarget` after the pick
    // dies, so without consuming it the seat would never auto-attack again.
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const chosen = spawnDummy(world, 1, 1, at(2));
    const other = spawnDummy(world, 2, 1, at(3.5));
    world.step(order({ kind: "attackTarget", entity: chosen }));
    world.health.get(chosen)!.alive = false;
    world.step(NO_INTENTS); // BasicAttackSystem drops the dead target
    world.step(NO_INTENTS); // the pass consumes the stale order and re-acquires
    expect(world.nav.get(me)!.attackTarget).toBe(other);
    expect(world.nav.get(me)!.attackTargetAuto).toBe(true);
  });
});

describe("#221 gating + stability", () => {
  it("acquisition is OFF while !combatActive (protects the #128 sweep + #100)", () => {
    const world = new SimWorld(SKELETON_ARENA, 3); // combatActive defaults to false
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    spawnFighter(world, 1, 1, at(1.4), 1.6); // adjacent, like the sweep dummy
    for (let k = 0; k < 40; k++) world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBeNull();
    expect(world.events.filter((e) => e.type === "basicAttack")).toHaveLength(0);
  });

  it("a held auto target is NOT re-ranked every tick on HP/distance", () => {
    // Flicker guard: swapping mid-approach cancels the wind-up, so a held target
    // is only abandoned for a categorically better one (champion over mob, or a
    // fresh aggressor) — never merely because somebody else dipped lower.
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const first = spawnDummy(world, 1, 1, at(2), 100);
    const other = spawnDummy(world, 2, 1, at(3.5), 5000);
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(first);
    world.health.get(other)!.hp = 1; // now the lowest-HP candidate by far
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(first);
  });

  it("a held auto target IS given up for a fresh AGGRESSOR", () => {
    const world = combatWorld();
    const me = spawnFighter(world, 0, 0, at(0), 1.6);
    const first = spawnDummy(world, 1, 1, at(2));
    const aggressor = spawnDummy(world, 2, 1, at(3.5));
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(first);
    markThreat(world, me, aggressor);
    world.step(NO_INTENTS);
    expect(world.nav.get(me)!.attackTarget).toBe(aggressor);
  });
});

describe("#221 determinism (sim-04)", () => {
  it("two seeded runs of the same auto-attack brawl produce identical digests", () => {
    const run = (): number => {
      const world = combatWorld(97531);
      spawnFighter(world, 0, 0, at(-5, -4), 1.6, 900);
      spawnFighter(world, 1, 1, at(4, -4), 11, 900);
      spawnFighter(world, 2, 1, at(-4, 1), 1.6, 900);
      spawnFighter(world, 3, 0, at(5, 1), 8, 900);
      spawnMob(world, at(0, -2));
      spawnMob(world, at(1, -1));
      for (let k = 0; k < 240; k++) world.step(NO_INTENTS);
      return world.digest();
    };
    const a = run();
    expect(a).toBe(run());
    expect(a).toBe(run());
  });

  it("the digest MOVES when the acquired target differs", () => {
    // The other half of the contract: `attackTarget` really is folded in, so a
    // replica that acquired a different enemy diverges on the acquiring tick
    // instead of surfacing as untraceable position drift seconds later.
    const build = (threatOn: 1 | 2): number => {
      const world = combatWorld(4242);
      const me = spawnFighter(world, 0, 0, at(0), 1.6);
      const ids = [spawnDummy(world, 1, 1, at(2)), spawnDummy(world, 2, 1, at(3))];
      markThreat(world, me, ids[threatOn - 1]!);
      world.step(NO_INTENTS);
      return world.digest();
    };
    expect(build(1)).not.toBe(build(2));
  });

  it("SPAWN ORDER, not Map insertion luck, is what the tiebreak follows", () => {
    // Same geometry, candidates registered in the opposite order: the winner
    // must still be the lowest ENTITY ID, i.e. the first spawned.
    const build = (reverse: boolean): EntityId => {
      const world = combatWorld(8);
      const me = spawnFighter(world, 0, 0, at(0), 1.6);
      const pts: V.Vec2[] = [at(3), at(-3), at(0, -3)];
      const seq = reverse ? [...pts].reverse() : pts;
      const ids = seq.map((p, i) => spawnDummy(world, i + 1, 1, p));
      world.step(NO_INTENTS);
      expect(ids).toContain(world.nav.get(me)!.attackTarget);
      return world.nav.get(me)!.attackTarget!;
    };
    // in both builds the winner is the FIRST-SPAWNED candidate (lowest id)
    expect(build(false)).toBe(build(true));
  });
});
