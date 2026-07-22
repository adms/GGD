/**
 * 補血 / 補魔 sim events (task #92).
 *
 * Two of the four categories the request names had NO event at all — six sites
 * mutated `hp.hp` and five mutated `hp.mana` silently, so the client could not
 * draw them even in principle. These suites pin the new seam:
 *
 *   ct-s01 combat-text-heal-event   — `heal` on ability heals, `restore` %, lifesteal
 *   ct-s02 combat-text-mana-event   — `manaRestore`, and the sites that stay SILENT
 *   ct-s03 combat-text-determinism  — the world digest and the scoreboard are unmoved
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { Stat, zeroStats } from "../stats/statTypes";
import { combatResolveSystem } from "./damage";
import { healTarget, restoreMana, RESTORE_EPSILON } from "./restore";
import { runEffects } from "../effects/effectRunner";
import { regenSystem } from "../systems/RegenSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { Rng } from "../math/rng";
import { createMatchStats } from "../stats/matchStats";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;

function spawnDummy(
  world: SimWorld,
  seat: number,
  team: number,
  opts: { hp?: number; maxHp?: number; mana?: number; maxMana?: number; lifesteal?: number } = {},
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: Z0.center.x + seat, z: Z0.center.z + 14 },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  const maxHp = opts.maxHp ?? 600;
  const maxMana = opts.maxMana ?? 400;
  world.health.set(id, {
    hp: opts.hp ?? maxHp,
    maxHp,
    mana: opts.mana ?? maxMana,
    maxMana,
    alive: true,
    shields: [],
  });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  if (opts.lifesteal) final[Stat.Lifesteal] = opts.lifesteal;
  world.stats.set(id, { championId: "dummy" as ChampionId, final, dirty: false, sources: [] });
  // registered as a champion with a scoreboard row, so recordHealing has
  // somewhere to land (that is the parity this suite is checking)
  world.champion.set(id, {
    championId: "dummy" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [null, null, null, null, null, null],
    augments: [],
    statStacks: 0,
    statCapstonePct: 0,
    pendingOrbSlots: 0,
  });
  world.matchStats.set(id, createMatchStats());
  return id;
}

const evs = (world: SimWorld, type: string): Record<string, unknown>[] =>
  world.events.filter((e) => e.type === type).map((e) => e.data);

const ctx = (world: SimWorld, caster: EntityId, targets: EntityId[]) => ({
  world,
  caster,
  targets,
  rank: 1,
  origin: "ability:test.q",
  rng: new Rng(1),
});

describe("補血 events (ct-s01)", () => {
  it("an ability heal emits `heal` with the amount ACTUALLY restored", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const healer = spawnDummy(w, 0, 0);
    const hurt = spawnDummy(w, 1, 0, { hp: 100 });
    runEffects([{ kind: "heal", amount: { flat: 75 } }], ctx(w, healer, [hurt]));

    const [e] = evs(w, "heal");
    expect(e).toBeDefined();
    expect(e!.target).toBe(hurt);
    expect(e!.source).toBe(healer);
    expect(e!.amount).toBeCloseTo(75, 6);
    expect(e!.overheal).toBeCloseTo(0, 6);
    expect(w.health.get(hurt)!.hp).toBeCloseTo(175, 6);
  });

  it("overheal is reported separately — the number shows the real gain, not the request", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const healer = spawnDummy(w, 0, 0);
    const nearlyFull = spawnDummy(w, 1, 0, { hp: 580, maxHp: 600 });
    runEffects([{ kind: "heal", amount: { flat: 500 } }], ctx(w, healer, [nearlyFull]));

    const [e] = evs(w, "heal");
    expect(e!.amount).toBeCloseTo(20, 6);
    expect(e!.overheal).toBeCloseTo(480, 6);
    expect(w.health.get(nearlyFull)!.hp).toBe(600);
  });

  it("a heal on a FULL target emits nothing (no `+0` over a healthy champion)", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const healer = spawnDummy(w, 0, 0);
    const full = spawnDummy(w, 1, 0);
    runEffects([{ kind: "heal", amount: { flat: 250 } }], ctx(w, healer, [full]));
    expect(evs(w, "heal")).toHaveLength(0);
  });

  it("a heal on a DEAD target does nothing at all", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const healer = spawnDummy(w, 0, 0);
    const dead = spawnDummy(w, 1, 0, { hp: 0 });
    w.health.get(dead)!.alive = false;
    expect(healTarget(w, { source: healer, target: dead, amount: 100, origin: "x", score: true })).toBe(0);
    expect(evs(w, "heal")).toHaveLength(0);
  });

  it("`restore` healthPct emits `heal` (WC3 SetUnitLifePercentBJ)", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const caster = spawnDummy(w, 0, 0);
    const hurt = spawnDummy(w, 1, 0, { hp: 100, maxHp: 600 });
    runEffects([{ kind: "restore", healthPct: 0.25 }], ctx(w, caster, [hurt]));
    const [e] = evs(w, "heal");
    expect(e!.amount).toBeCloseTo(150, 6);
  });

  it("basic-attack lifesteal emits `heal` on the ATTACKER's own body", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const attacker = spawnDummy(w, 0, 0, { hp: 300, lifesteal: 0.5 });
    const victim = spawnDummy(w, 1, 1);
    w.damageQueue.push({
      source: attacker,
      target: victim,
      amount: 80,
      type: "true",
      crit: false,
      origin: "basic",
    });
    combatResolveSystem(w);

    const [e] = evs(w, "heal");
    expect(e).toBeDefined();
    expect(e!.source).toBe(attacker);
    expect(e!.target).toBe(attacker); // the number belongs on YOUR body
    expect(e!.origin).toBe("lifesteal");
    expect(e!.amount).toBeCloseTo(40, 6);
  });

  it("a restore under the epsilon is applied but never drawn", () => {
    cover("combat-text-heal-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const a = spawnDummy(w, 0, 0, { hp: 599.99 });
    const applied = healTarget(w, {
      source: a,
      target: a,
      amount: RESTORE_EPSILON / 2,
      origin: "regen-crumb",
      score: false,
    });
    expect(applied).toBeGreaterThan(0);
    expect(evs(w, "heal")).toHaveLength(0);
  });
});

describe("補魔 events (ct-s02)", () => {
  it("`restore` manaPct emits `manaRestore`", () => {
    cover("combat-text-mana-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const caster = spawnDummy(w, 0, 0);
    const drained = spawnDummy(w, 1, 0, { mana: 0, maxMana: 400 });
    runEffects([{ kind: "restore", manaPct: 0.5 }], ctx(w, caster, [drained]));
    const [e] = evs(w, "manaRestore");
    expect(e!.amount).toBeCloseTo(200, 6);
    expect(e!.target).toBe(drained);
    expect(w.health.get(drained)!.mana).toBeCloseTo(200, 6);
  });

  it("mana restore is clamped at max and reports the overflow", () => {
    cover("combat-text-mana-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const a = spawnDummy(w, 0, 0, { mana: 390, maxMana: 400 });
    restoreMana(w, { source: a, target: a, amount: 100, origin: "flower" });
    const [e] = evs(w, "manaRestore");
    expect(e!.amount).toBeCloseTo(10, 6);
    expect(e!.overflow).toBeCloseTo(90, 6);
  });

  it("PASSIVE REGEN stays silent — it is read from the bar, never from floating text", () => {
    cover("combat-text-mana-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const a = spawnDummy(w, 0, 0, { hp: 100, mana: 0 });
    const sc = w.stats.get(a)!;
    sc.final[Stat.HealthRegen] = 12;
    sc.final[Stat.ManaRegen] = 8;
    // a full second of ticks: at 30 Hz × 12 champions this would be 720
    // events/s of "+0.4" — spam on the wire and light pollution on screen
    for (let i = 0; i < 30; i++) regenSystem(w);
    expect(w.health.get(a)!.hp).toBeGreaterThan(100);
    expect(w.health.get(a)!.mana).toBeGreaterThan(0);
    expect(evs(w, "heal")).toHaveLength(0);
    expect(evs(w, "manaRestore")).toHaveLength(0);
  });

  it("spending mana on a cast is not 補魔 and emits nothing", () => {
    cover("combat-text-mana-event");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const a = spawnDummy(w, 0, 0, { mana: 400 });
    w.health.get(a)!.mana -= 60; // what abilitySystem does
    expect(evs(w, "manaRestore")).toHaveLength(0);
  });
});

describe("restore events are presentation-only (ct-s03)", () => {
  const fight = (seed: number): { digest: number; healEvents: number } => {
    const w = new SimWorld(SKELETON_ARENA, seed);
    const attacker = spawnDummy(w, 0, 0, { hp: 300, lifesteal: 0.4 });
    const victim = spawnDummy(w, 1, 1, { hp: 900 });
    const medic = spawnDummy(w, 2, 0, { hp: 500 });
    let healEvents = 0;
    for (let t = 0; t < 12; t++) {
      w.damageQueue.push({
        source: attacker,
        target: victim,
        amount: 37,
        type: "true",
        crit: false,
        origin: "basic",
      });
      combatResolveSystem(w);
      runEffects([{ kind: "heal", amount: { flat: 11 } }], ctx(w, medic, [attacker]));
      runEffects([{ kind: "restore", manaPct: 0.05 }], ctx(w, medic, [attacker]));
      healEvents += evs(w, "heal").length + evs(w, "manaRestore").length;
      w.step(new Map());
    }
    return { digest: w.digest(), healEvents };
  };

  it("same seed → identical digest (events are not world state)", () => {
    cover("combat-text-determinism");
    const a = fight(1234);
    const b = fight(1234);
    expect(a.digest).toBe(b.digest);
    expect(a.healEvents).toBe(b.healEvents);
    expect(a.healEvents).toBeGreaterThan(0); // the fixture really does restore
  });

  it("the flower burst still does NOT credit healingDone (a digest-bearing stat)", () => {
    cover("combat-text-determinism");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const killer = spawnDummy(w, 0, 0, { hp: 200 });
    // `score: false` is what FlowerSystem passes — scoring it here would move
    // matchStats.healingDone, which IS hashed into the digest
    healTarget(w, { source: killer, target: killer, amount: 100, origin: "flower", score: false });
    expect(w.matchStats.get(killer)?.healingDone ?? 0).toBe(0);
    expect(evs(w, "heal")).toHaveLength(1); // still drawn, just not scored

    healTarget(w, { source: killer, target: killer, amount: 50, origin: "ability:x", score: true });
    expect(w.matchStats.get(killer)!.healingDone).toBeCloseTo(50, 6);
  });

  it("events carry the target's position so the number lands on the right body", () => {
    cover("combat-text-determinism");
    const w = new SimWorld(SKELETON_ARENA, 7);
    const healer = spawnDummy(w, 0, 0);
    const hurt = spawnDummy(w, 5, 0, { hp: 10, mana: 0 });
    const t = w.transform.get(hurt)!;
    healTarget(w, { source: healer, target: hurt, amount: 40, origin: "x", score: true });
    restoreMana(w, { source: healer, target: hurt, amount: 40, origin: "x" });
    for (const type of ["heal", "manaRestore"]) {
      const [e] = evs(w, type);
      expect(e!.x).toBeCloseTo(t.pos.x, 6);
      expect(e!.z).toBeCloseTo(t.pos.z, 6);
    }
  });
});
