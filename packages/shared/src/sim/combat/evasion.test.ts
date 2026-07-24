/**
 * EVASION (迴避) — the mechanism, proved on FIXTURES.
 *
 * No shipped content doc is touched by this lane: `Stat.Evasion` is 0 on every
 * champion in the catalogue, and the 29 empty 迴避 innates are a later content
 * lane's job. So every test here attaches its own `ModifierSource` fixture, the
 * exact shape those docs will use:
 *
 *     { stat: "evasion", op: "flat", value: 0.20 }   // 12-00 感應意脈
 *
 * Three things must hold, in this order of importance:
 *   1. AT 0 IT DOES NOT EXIST — no rng draw, no digest change, no behaviour
 *      change. Until content opts in, this is dead weight and must prove it.
 *   2. IT IS DETERMINISTIC — the roll is `world.rng.chance`, so same seed ⇒
 *      identical digest for 300 ticks; a different seed must actually diverge
 *      (otherwise test 2 would pass on a world where evasion never fires).
 *   3. IT ACTUALLY MISSES — a dodged basic attack deals no damage, procs no
 *      on-hit hook and feeds no lifesteal, while the swing itself still happens.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { ModOp } from "../stats/modifiers";
import { Stat, STAT_CLAMPS } from "../stats/statTypes";
import { evasionOf, rollEvade } from "./evasion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;

/** thorne (melee) attacking sela — bodies adjacent so the swing lands at once. */
function meleeDuel(world: SimWorld): { attacker: EntityId; defender: EntityId } {
  const c = Z0.center;
  const attacker = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 0.6, z: c.z },
    zone: 0,
  });
  const defender = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + 0.6, z: c.z },
    zone: 0,
  });
  return { attacker, defender };
}

/** sela (ranged, missileSpeed 22) shooting thorne from 8 units. */
function rangedDuel(world: SimWorld): { attacker: EntityId; defender: EntityId } {
  const c = Z0.center;
  const attacker = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 4, z: c.z + 8 },
    zone: 0,
  });
  const defender = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + 4, z: c.z + 8 },
    zone: 0,
  });
  return { attacker, defender };
}

/** The fixture a 迴避 innate doc will produce once content fills it in. */
function giveEvasion(world: SimWorld, id: EntityId, value: number): void {
  attachSource(world, id, {
    id: `passive:fixture-evasion#${id}`,
    kind: "passive",
    modifiers: [{ stat: Stat.Evasion, op: ModOp.Flat, value }],
  });
  recomputeStats(world, id);
}

/** Hold the attacker on target and step; returns every event of the run. */
function fight(
  world: SimWorld,
  attacker: EntityId,
  defender: EntityId,
  ticks: number,
): { type: string; tick: number; data: Record<string, unknown> }[] {
  const log: { type: string; tick: number; data: Record<string, unknown> }[] = [];
  for (let k = 0; k < ticks; k++) {
    const nav = world.nav.get(attacker);
    if (nav) {
      nav.attackTarget = defender;
      nav.moveTarget = null;
    }
    // keep the punching bag alive so the fight runs the full window
    const hp = world.health.get(defender);
    if (hp) hp.hp = hp.maxHp;
    world.step(new Map());
    for (const ev of world.events) log.push({ type: ev.type, tick: ev.tick, data: ev.data });
  }
  return log;
}

// ───────────────────────────────────────────────────────────── 1. THE ZERO NO-OP

describe("evasion 0 (every champion today) changes NOTHING", () => {
  it("costs zero rng draws — the stat is not merely 'always fails', it is not rolled", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const { attacker, defender } = meleeDuel(world);
    expect(evasionOf(world, defender)).toBe(0); // no champion ships evasion
    const before = world.rng.state;
    for (let k = 0; k < 50; k++) expect(rollEvade(world, attacker, defender)).toBe(false);
    // A draw here would shift the whole match's random stream (crit rolls, proc
    // chances) and desync every existing replay.
    expect(world.rng.state).toBe(before);
  });

  it("a full 300-tick duel is digest-identical with and without the mechanism armed", () => {
    // "armed" = an evasion source that resolves to 0. Same code path, same
    // stat present, nothing rolled -> byte-identical world.
    const bare = new SimWorld(SKELETON_ARENA, 4242);
    const bareDuel = meleeDuel(bare);
    const zeroed = new SimWorld(SKELETON_ARENA, 4242);
    const zeroedDuel = meleeDuel(zeroed);
    giveEvasion(zeroed, zeroedDuel.defender, 0);

    for (let k = 0; k < 300; k++) {
      for (const [w, d] of [
        [bare, bareDuel],
        [zeroed, zeroedDuel],
      ] as const) {
        const nav = w.nav.get(d.attacker);
        if (nav) {
          nav.attackTarget = d.defender;
          nav.moveTarget = null;
        }
        w.step(new Map());
      }
      expect(zeroed.digest()).toBe(bare.digest());
    }
  });

  it("a negative authored value cannot burn a draw either (clamped at 0)", () => {
    const world = new SimWorld(SKELETON_ARENA, 8);
    const { attacker, defender } = meleeDuel(world);
    giveEvasion(world, defender, -0.5);
    expect(evasionOf(world, defender)).toBe(0);
    const before = world.rng.state;
    expect(rollEvade(world, attacker, defender)).toBe(false);
    expect(world.rng.state).toBe(before);
  });
});

// ────────────────────────────────────────────────────────────── 2. DETERMINISM

describe("determinism: the roll comes from the seeded world rng", () => {
  it("same seed ⇒ identical digest on EVERY one of 300 ticks (evasion live)", () => {
    const mk = (seed: number): { w: SimWorld; a: EntityId; d: EntityId } => {
      const w = new SimWorld(SKELETON_ARENA, seed);
      const { attacker, defender } = meleeDuel(w);
      giveEvasion(w, defender, 0.35);
      return { w, a: attacker, d: defender };
    };
    const A = mk(90210);
    const B = mk(90210);
    for (let k = 0; k < 300; k++) {
      for (const s of [A, B]) {
        const nav = s.w.nav.get(s.a);
        if (nav) {
          nav.attackTarget = s.d;
          nav.moveTarget = null;
        }
        const hp = s.w.health.get(s.d);
        if (hp) hp.hp = hp.maxHp;
        s.w.step(new Map());
      }
      expect(B.w.digest()).toBe(A.w.digest());
      expect(B.w.rng.state).toBe(A.w.rng.state);
    }
  });

  it("COUNTER-PROOF: a different seed diverges — the rolls are real, not constant", () => {
    const mk = (seed: number): { w: SimWorld; a: EntityId; d: EntityId } => {
      const w = new SimWorld(SKELETON_ARENA, seed);
      const { attacker, defender } = meleeDuel(w);
      giveEvasion(w, defender, 0.35);
      return { w, a: attacker, d: defender };
    };
    const A = mk(90210);
    const C = mk(11111);
    let diverged = false;
    for (let k = 0; k < 300; k++) {
      for (const s of [A, C]) {
        const nav = s.w.nav.get(s.a);
        if (nav) {
          nav.attackTarget = s.d;
          nav.moveTarget = null;
        }
        const hp = s.w.health.get(s.d);
        if (hp) hp.hp = hp.maxHp;
        s.w.step(new Map());
      }
      if (C.w.digest() !== A.w.digest()) diverged = true;
    }
    expect(diverged).toBe(true);
  });

  it("Math.random is never reachable from the evasion path", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./evasion.ts", import.meta.url), "utf8"),
    );
    // CALLS, not prose — the file's own header names these banned APIs in text.
    expect(src).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/);
    expect(src).toMatch(/world\.rng\.chance\s*\(/);
  });
});

// ────────────────────────────────────────────────────────── 3. IT ACTUALLY MISSES

describe("a dodged basic attack is a TOTAL miss", () => {
  it("MELEE: evade fires, and no damage lands on the ticks it fires", () => {
    const world = new SimWorld(SKELETON_ARENA, 31337);
    const { attacker, defender } = meleeDuel(world);
    giveEvasion(world, defender, STAT_CLAMPS[Stat.Evasion]![1]); // 0.8, the ceiling
    const log = fight(world, attacker, defender, 400);

    const evades = log.filter((e) => e.type === "evade");
    const basicDmg = log.filter((e) => e.type === "damage" && e.data.origin === "basic");
    expect(evades.length).toBeGreaterThan(0);

    // every dodge names the right pair
    for (const e of evades) {
      expect(e.data.target).toBe(defender);
      expect(e.data.source).toBe(attacker);
    }
    // a tick that dodged resolved no basic damage on that victim
    const dodgeTicks = new Set(evades.map((e) => e.tick));
    for (const d of basicDmg) expect(dodgeTicks.has(d.tick)).toBe(false);
  });

  it("MELEE: the SWING still happens — a dodge is visible, not a silent nothing", () => {
    const world = new SimWorld(SKELETON_ARENA, 31337);
    const { attacker, defender } = meleeDuel(world);
    giveEvasion(world, defender, STAT_CLAMPS[Stat.Evasion]![1]);
    const log = fight(world, attacker, defender, 400);
    const evades = log.filter((e) => e.type === "evade");
    expect(evades.length).toBeGreaterThan(0);
    // `basicAttack` (aim commit + weapon SFX) is emitted on the same tick as
    // every dodge: the attacker swung, the defender slipped it.
    const swingTicks = new Set(
      log.filter((e) => e.type === "basicAttack").map((e) => e.tick),
    );
    for (const e of evades) expect(swingTicks.has(e.tick)).toBe(true);
    // and the ATTACK-CONNECTED reactions never fire on a dodge tick
    const dodgeTicks = new Set(evades.map((e) => e.tick));
    for (const e of log) {
      if (e.type === "hitImpact" || e.type === "knockdown") {
        expect(dodgeTicks.has(e.tick)).toBe(false);
      }
    }
  });

  it("MELEE: high evasion measurably reduces damage taken vs. the same seeded fight", () => {
    const run = (evasion: number): number => {
      const world = new SimWorld(SKELETON_ARENA, 2024);
      const { attacker, defender } = meleeDuel(world);
      if (evasion > 0) giveEvasion(world, defender, evasion);
      const log = fight(world, attacker, defender, 400);
      return log
        .filter((e) => e.type === "damage" && e.data.origin === "basic")
        .reduce((n, e) => n + (e.data.amount as number), 0);
    };
    const taken0 = run(0);
    const taken80 = run(0.8);
    expect(taken0).toBeGreaterThan(0);
    expect(taken80).toBeLessThan(taken0 * 0.6); // ~0.2x expected; loose band
  });

  it("MELEE: no lifesteal and no scoreboard hit is credited for a dodged swing", () => {
    const world = new SimWorld(SKELETON_ARENA, 555);
    const { attacker, defender } = meleeDuel(world);
    giveEvasion(world, defender, STAT_CLAMPS[Stat.Evasion]![1]);
    // arm lifesteal so a leaked packet would be loudly visible
    attachSource(world, attacker, {
      id: "fixture:lifesteal",
      kind: "item",
      modifiers: [{ stat: Stat.Lifesteal, op: ModOp.Flat, value: 0.5 }],
    });
    recomputeStats(world, attacker);
    const log = fight(world, attacker, defender, 400);
    const evades = log.filter((e) => e.type === "evade").length;
    const hits = log.filter((e) => e.type === "damage" && e.data.origin === "basic").length;
    expect(evades).toBeGreaterThan(0);
    // basicAttackHits counts LANDED packets only — dodges must not inflate it
    expect(world.matchStats.get(attacker)?.basicAttackHits ?? 0).toBe(hits);
    // heals only ever accompany a landed packet
    const healTicks = new Set(
      log.filter((e) => e.type === "heal" && e.data.origin === "lifesteal").map((e) => e.tick),
    );
    for (const e of log.filter((x) => x.type === "evade")) {
      // a dodge tick can only carry a heal if some OTHER packet landed; in this
      // 1v1 fixture there is no other packet.
      expect(healTicks.has(e.tick)).toBe(false);
    }
  });

  it("RANGED: the dodge happens at IMPACT and consumes the missile", () => {
    const world = new SimWorld(SKELETON_ARENA, 777);
    const { attacker, defender } = rangedDuel(world);
    giveEvasion(world, defender, STAT_CLAMPS[Stat.Evasion]![1]);
    const log = fight(world, attacker, defender, 400);

    const evades = log.filter((e) => e.type === "evade");
    expect(evades.length).toBeGreaterThan(0);

    // the dodge lands on an impact tick, NOT on the launch tick
    const spawnTicks = new Set(log.filter((e) => e.type === "projectileSpawn").map((e) => e.tick));
    for (const e of evades) expect(spawnTicks.has(e.tick)).toBe(false);

    // a dodged shot emits no basicAttackHit and queues no damage that tick
    const hitTicks = new Set(log.filter((e) => e.type === "basicAttackHit").map((e) => e.tick));
    const dmgTicks = new Set(
      log.filter((e) => e.type === "damage" && e.data.origin === "basic").map((e) => e.tick),
    );
    for (const e of evades) {
      expect(hitTicks.has(e.tick)).toBe(false);
      expect(dmgTicks.has(e.tick)).toBe(false);
    }
    // the missile is spent either way: one projectileEnd per shot fired
    const ends = log.filter((e) => e.type === "projectileEnd").length;
    expect(ends).toBeGreaterThanOrEqual(evades.length);
  });

  it("ABILITY damage is NOT dodgeable — evasion is basic-attacks-only by design", () => {
    // See combat/evasion.ts DECISION 1: WC3 Evasion dodges attacks, never
    // spells, and a hidden dice roll on ability damage would contradict
    // cast-telegraph.md §4.5(a) (agency must be positional, not random).
    const world = new SimWorld(SKELETON_ARENA, 4);
    const { attacker, defender } = meleeDuel(world);
    giveEvasion(world, defender, 0.8);
    const before = world.rng.state;
    world.damageQueue.push({
      source: attacker,
      target: defender,
      amount: 100,
      type: "magic",
      crit: false,
      origin: "ability:thorne.q",
    });
    world.step(new Map());
    const dealt = world.events.filter((e) => e.type === "damage" && e.data.origin === "ability:thorne.q");
    expect(dealt.length).toBe(1);
    expect(dealt[0]!.data.amount as number).toBeGreaterThan(0);
    // and no evade event was emitted for it
    expect(world.events.some((e) => e.type === "evade")).toBe(false);
    void before;
  });
});

// ───────────────────────────────────────────────────────────── 4. STAT PLUMBING

describe("the stat itself", () => {
  it("resolves through the normal modifier pipeline and clamps to [0, 0.8]", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { defender } = meleeDuel(world);
    expect(evasionOf(world, defender)).toBe(0);
    giveEvasion(world, defender, 0.2); // 12-00 感應意脈
    expect(evasionOf(world, defender)).toBeCloseTo(0.2, 9);
    // a runaway authored value cannot make a champion unhittable by autos
    giveEvasion(world, defender, 5);
    expect(evasionOf(world, defender)).toBeCloseTo(0.8, 9);
  });

  it("a target with no StatsComp (structures, flowers) cannot dodge", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const { attacker } = meleeDuel(world);
    const ghost = world.spawn(); // no stats component
    const before = world.rng.state;
    expect(evasionOf(world, ghost)).toBe(0);
    expect(rollEvade(world, attacker, ghost)).toBe(false);
    expect(world.rng.state).toBe(before);
  });
});
