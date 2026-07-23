/**
 * ai-kiting: a RANGED Tier-0 bot fights from its attack range and KITES — it
 * backs off when a melee enemy closes inside the safety margin, then re-engages
 * once the gap is restored. A MELEE bot is unchanged: it closes to contact and
 * brawls. Deterministic (same seed → byte-identical replay).
 *
 * The sim half of the fix already holds a ranged unit at 0.9·attackRange while
 * attack-targeting (OrderSystem/BasicAttackSystem — see chaseRange.test), so
 * autos/casts fire from range, never from melee contact. This suite covers the
 * BRAIN half: the retreat/re-engage hysteresis in Tier0Brain.
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import {
  asSeatId,
  asTeamId,
  type SeatId,
  type ChampionId,
  type AbilityId,
  type EntityId,
} from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import type { AbilitiesComp } from "@ggd/shared/sim/stats/statsComp";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import * as V from "@ggd/shared/sim/math/vec2";
import { AIDriver, isRangedAttacker, kiteRetreatTarget } from "./Tier0Brain";
import { Seat } from "../seat/Seat";

/** Body contact for two 0.6-radius champions. */
const CONTACT = 1.2;

/**
 * A minimal combat-capable, brain-drivable unit: stats + abilities + a champion
 * marker (so the Tier-0 brain ACQUIRES it as a target) but no content doc — the
 * brain then classifies ranged/melee from the attack reach. Mirrors
 * chaseRange.test's `spawnFighter`, plus the champion component.
 */
function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  range: number,
  moveSpeed: number,
): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
  world.status.set(id, { effects: [] });
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: new Array(INVENTORY_SLOTS).fill(null),
    augments: [],
    statStacks: 0,
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
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
  return id;
}

/** Wire a Tier-0 AI brain to a seat bound to `entity`. */
function bindBrain(entity: EntityId, seat: number, team: number): Seat {
  const s = new Seat(asSeatId(seat), asTeamId(team), new AIDriver());
  s.entityId = entity;
  return s;
}

/** One tick: gather each brain's intent, advance the sim. */
function stepBrains(world: SimWorld, seats: Seat[]): void {
  const intents = new Map<SeatId, IntentFrame>();
  for (const s of seats) intents.set(s.seatId, s.produceIntent(world, world.tick));
  world.step(intents);
}

const RANGE = 11;

/**
 * A ranged bot (seat 0) vs a slower melee bot (seat 1) on an open lane, both
 * driven by the Tier-0 brain. Returns the per-tick gap and the distances at
 * which the ranged bot LANDED an auto. Seat/positions are shared by every case
 * so the determinism guard replays the exact scenario.
 */
function runKiteDuel(seed: number, ticks: number): { gaps: number[]; rangedAttackDists: number[] } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.economyOpen = false; // combat-only: no shop side-effects in the brain
  // z = -14 is a clear lane (all three pillars are ≥ 6u away); the ranged bot
  // retreats toward +x with ~25u of room before the boundary.
  const ranged = spawnFighter(world, 0, 0, { x: -47, z: -14 }, RANGE, 6.6);
  const melee = spawnFighter(world, 1, 1, { x: -55, z: -14 }, 1.6, 4.4);
  const seats = [bindBrain(ranged, 0, 0), bindBrain(melee, 1, 1)];

  const gaps: number[] = [];
  const rangedAttackDists: number[] = [];
  for (let k = 0; k < ticks; k++) {
    stepBrains(world, seats);
    const d = V.dist(world.transform.get(ranged)!.pos, world.transform.get(melee)!.pos);
    gaps.push(d);
    if (world.events.some((e) => e.type === "basicAttack" && e.data.source === ranged)) {
      rangedAttackDists.push(d);
    }
  }
  return { gaps, rangedAttackDists };
}

describe("ranged bots fight from range and KITE (ai-kiting)", () => {
  it("classifies ranged vs melee by attackType, falling back to attack reach", () => {
    // the champion doc is authoritative when present…
    expect(isRangedAttacker("ranged", 1.6)).toBe(true);
    expect(isRangedAttacker("melee", 30)).toBe(false);
    // …and a doc-less probe is inferred from its reach (melee ~1.6, ranged ~6–12)
    expect(isRangedAttacker(undefined, 11)).toBe(true);
    expect(isRangedAttacker(undefined, 1.6)).toBe(false);
  });

  it("retreat target is one attack range behind the bot, away from the enemy", () => {
    // bot at x=0, enemy at x=-8 → retreat straight to +x, RANGE from the enemy
    const p = kiteRetreatTarget({ x: 0, z: 0 }, { x: -8, z: 0 }, RANGE, { x: 1, z: 0 });
    expect(p.x).toBeCloseTo(-8 + RANGE, 6);
    expect(p.z).toBeCloseTo(0, 6);
    // exact overlap → fall back to the bot's facing so the direction is defined
    const q = kiteRetreatTarget({ x: 5, z: 5 }, { x: 5, z: 5 }, RANGE, { x: 0, z: 1 });
    expect(q.x).toBeCloseTo(5, 6);
    expect(q.z).toBeCloseTo(5 + RANGE, 6);
  });

  it("(a) the ranged bot's autos ALL fire from range, never at melee contact", () => {
    const { rangedAttackDists } = runKiteDuel(99, 150);
    expect(rangedAttackDists.length).toBeGreaterThan(0);
    for (const d of rangedAttackDists) {
      // every auto lands well outside melee and near the attack band
      expect(d).toBeGreaterThan(CONTACT * 3); // nowhere near body contact
      expect(d).toBeGreaterThanOrEqual(0.5 * RANGE);
    }
  });

  it("(b) it KITES: when the melee bot closes inside the margin, the gap re-opens", () => {
    const { gaps } = runKiteDuel(99, 150);

    // the melee bot did breach the safety margin (0.6·range) at least once
    const firstBreach = gaps.findIndex((d) => d < 0.6 * RANGE);
    expect(firstBreach).toBeGreaterThanOrEqual(0);

    // never dragged toward melee: the closest approach stays a safe distance out
    const minGap = Math.min(...gaps);
    expect(minGap).toBeGreaterThan(0.4 * RANGE);

    // after the closest approach the bot RETREATS — the gap recovers materially
    const minIdx = gaps.indexOf(minGap);
    const maxAfterMin = Math.max(...gaps.slice(minIdx));
    expect(maxAfterMin - minGap).toBeGreaterThan(2);

    // and it holds a safe distance MOST of the time once combat is joined
    const post = gaps.slice(firstBreach);
    const safe = post.filter((d) => d >= 0.45 * RANGE).length;
    expect(safe / post.length).toBeGreaterThanOrEqual(0.9);
  });

  it("same seed replays byte-identically (determinism guard)", () => {
    const digestRun = (): number => {
      const world = new SimWorld(SKELETON_ARENA, 4242);
      world.economyOpen = false;
      const ranged = spawnFighter(world, 0, 0, { x: -47, z: -14 }, RANGE, 6.6);
      const melee = spawnFighter(world, 1, 1, { x: -55, z: -14 }, 1.6, 4.4);
      const seats = [bindBrain(ranged, 0, 0), bindBrain(melee, 1, 1)];
      for (let k = 0; k < 150; k++) stepBrains(world, seats);
      return world.digest();
    };
    expect(digestRun()).toBe(digestRun());
  });
});

describe("melee bots are unchanged — close and brawl (ai-kiting)", () => {
  it("two melee bots close to contact and trade autos (no kite regression)", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    world.economyOpen = false;
    const a = spawnFighter(world, 0, 0, { x: -44, z: -14 }, 1.6, 5.8);
    const b = spawnFighter(world, 1, 1, { x: -36, z: -14 }, 1.6, 5.8);
    const seats = [bindBrain(a, 0, 0), bindBrain(b, 1, 1)];

    let attacksA = 0;
    let attacksB = 0;
    let maxGapAfterClose = 0;
    let closed = false;
    for (let k = 0; k < 150; k++) {
      stepBrains(world, seats);
      attacksA += world.events.filter((e) => e.type === "basicAttack" && e.data.source === a).length;
      attacksB += world.events.filter((e) => e.type === "basicAttack" && e.data.source === b).length;
      const d = V.dist(world.transform.get(a)!.pos, world.transform.get(b)!.pos);
      if (d <= 1.7) closed = true;
      // once they've met, a melee bot must NOT open the gap back up (would be a
      // kite) — it stays glued at contact.
      if (closed) maxGapAfterClose = Math.max(maxGapAfterClose, d);
    }

    const finalGap = V.dist(world.transform.get(a)!.pos, world.transform.get(b)!.pos);
    expect(closed).toBe(true); // they actually reached melee contact
    expect(finalGap).toBeLessThanOrEqual(1.7); // and stayed there
    expect(maxGapAfterClose).toBeLessThan(0.6 * RANGE); // never kited away
    expect(attacksA).toBeGreaterThan(0);
    expect(attacksB).toBeGreaterThan(0);
    expect(finalGap).toBeGreaterThan(CONTACT - 0.05); // never overlapping
  });
});
