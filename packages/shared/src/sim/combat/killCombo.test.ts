/**
 * 連殺 COMBO — the sim half.
 *
 * The owner's sentence is 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo 連殺數量」,
 * and it contains exactly three claims a guard has to be able to fail on:
 *
 *   ① 5 SECONDS IS A REAL WINDOW. Widen `KILL_COMBO_WINDOW_TICKS` to Infinity
 *      and every kill in a round chains. `the window is finite` below is the
 *      test that goes red — it is the mutation the owner explicitly asked for.
 *   ② ZOMBIES COUNT. Delete `creditKillCombo(…, "mob")` from MobSystem and mob
 *      kills stop chaining. `a zombie kill counts` goes red.
 *   ③ HEROES COUNT — ON THE SAME NUMBER. Delete `creditKillCombo(…, "champion")`
 *      from DeathSystem and a champion kill stops chaining. `a champion kill
 *      counts` and `zombie + hero add up on ONE number` go red.
 *
 * ⚠️ The pure-function tests alone would NOT catch ②/③: `nextComboCount` can be
 * perfect while nothing in the sim ever calls it (this repo's failure mode #3 —
 * 「可以從渲染樹整個刪掉而測試全綠」). So every kill test below drives the REAL
 * pipeline: push damage into `world.damageQueue`, `world.step()`, and read the
 * `killCombo` EVENTS the sim emitted — the same events the wire carries. Nothing
 * here calls `creditKillCombo` directly except the unit tests of the pure maths.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { MOB_MODEL_KEY, type MobRules } from "../mobs";
import { beginCombatMobs } from "../systems/MobSystem";
import { TICK_HZ } from "../../constants";
import {
  KILL_COMBO_EVENT,
  KILL_COMBO_MIN_SHOWN,
  KILL_COMBO_WINDOW_MS,
  KILL_COMBO_WINDOW_TICKS,
  comboAlive,
  creditKillCombo,
  killComboOf,
  nextComboCount,
} from "./killCombo";

beforeAll(() => registerSkeletonContent());

/** Mobs on tap: first wave on tick 2, then one every 2 ticks, no alive cap in the way. */
const RULES: MobRules = {
  fromRound: 3,
  firstWaveTicks: 2,
  waveIntervalTicks: 2,
  mobsPerWaveCap: 8,
  maxAlivePerZone: 40,
  level: 3,
  maxHp: 120,
  moveSpeed: 0,
  hpRegenPerSec: 0,
  modelKey: MOB_MODEL_KEY,
  attackDamage: 0,
  attackRangeSq: 0,
  attackCdTicks: 30,
  radius: 0.6,
  rewardGold: 20,
  rewardXp: 40,
  killsPerLevel: 30,
  // #262 EXPLICITLY DISARMED. Every assertion in this file predates the
  // 殭屍王 / 特殊殭屍 sub-mechanics and must keep measuring exactly what it
  // measured before: `special: null` in particular means spawnMob draws
  // NOTHING from `world.rng`, so the shared stream stays where #215 left it.
  boss: null,
  special: null,
};

const newWorld = (seed = 7): SimWorld => {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  return w;
};

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/**
 * Ticks to idle in order to LAPSE a combo, bounded.
 *
 * Why not just `KILL_COMBO_WINDOW_TICKS + 1`: the headline mutation is setting
 * the window to `Infinity`, and `step(w, Infinity)` would HANG the suite rather
 * than fail it — a hang proves nothing and blocks CI. Bounded at 10 s, the
 * mutated run finishes and reports a real RED (the chain that should have broken
 * did not), which is what a guard is for.
 */
const IDLE_PAST_WINDOW = Math.min(KILL_COMBO_WINDOW_TICKS + 1, 10 * TICK_HZ);

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

/** Queue a lethal packet; the next `step` resolves it into a death + a credit. */
function execute(w: SimWorld, killer: EntityId, victim: EntityId): void {
  w.damageQueue.push({
    source: killer,
    target: victim,
    amount: 100000,
    type: "physical",
    crit: false,
    origin: "ability:test",
  });
}

/** Every `killCombo` count emitted on the tick that just ran, in emit order. */
function comboCounts(w: SimWorld): number[] {
  return w.events.filter((e) => e.type === KILL_COMBO_EVENT).map((e) => e.data.count as number);
}

/** The whole `killCombo` payloads emitted on the tick that just ran. */
function comboEvents(w: SimWorld): Record<string, unknown>[] {
  return w.events.filter((e) => e.type === KILL_COMBO_EVENT).map((e) => e.data);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE WINDOW — decision 1: ticks, not wall-clock
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the 5-second window", () => {
  it("is 5 seconds expressed in TICKS, derived from TICK_HZ", () => {
    cover("kill-combo-window");
    // 150 @ 30 Hz. Asserted BOTH ways round on purpose: the literal pins the
    // owner's 5 s, the derivation pins that it tracks the tick rate.
    expect(KILL_COMBO_WINDOW_TICKS).toBe(150);
    expect(KILL_COMBO_WINDOW_TICKS).toBe(5 * TICK_HZ);
    expect(KILL_COMBO_WINDOW_MS).toBe(5000);
  });

  it("is FINITE — the mutation guard", () => {
    // ⚠️ THE MUTATION THE OWNER ASKED FOR: set KILL_COMBO_WINDOW_TICKS to
    // Infinity (or to any number ≥ the gap below) and this test goes red.
    // A kill one tick past the window starts a NEW chain at 1.
    const before = { lastKillTick: 0, count: 9 };
    expect(nextComboCount(before, KILL_COMBO_WINDOW_TICKS)).toBe(10); // exactly 5.000 s → chains
    expect(nextComboCount(before, KILL_COMBO_WINDOW_TICKS + 1)).toBe(1); // 5.033 s → broken
    expect(Number.isFinite(KILL_COMBO_WINDOW_TICKS)).toBe(true);
  });

  it("chains kills that land in the SAME tick — the AoE sweep", () => {
    // Delta 0 must chain, or the round-9 zombie sweep (the headline case) would
    // read as a pile of separate 1-kills.
    expect(nextComboCount({ lastKillTick: 42, count: 3 }, 42)).toBe(4);
  });

  it("a first kill is a chain of 1, not 0", () => {
    expect(nextComboCount(undefined, 0)).toBe(1);
    expect(nextComboCount(undefined, 99999)).toBe(1);
  });

  it("comboAlive lapses on the same boundary the counter does", () => {
    const st = { lastKillTick: 100, count: 4 };
    expect(comboAlive(st, 100)).toBe(true);
    expect(comboAlive(st, 100 + KILL_COMBO_WINDOW_TICKS)).toBe(true);
    expect(comboAlive(st, 100 + KILL_COMBO_WINDOW_TICKS + 1)).toBe(false);
    expect(comboAlive(undefined, 0)).toBe(false);
  });

  it("a lone kill is not a combo — the display floor is 2", () => {
    // The SIM counts from 1 (it must, or the second kill cannot know it is the
    // second). The DISPLAY starts at 2, so a solitary zombie does not park a
    // permanent 「1 連殺」 on screen.
    expect(KILL_COMBO_MIN_SHOWN).toBe(2);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE TWO CREDIT SITES — owner's ruling: both kinds, ONE number
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("what counts as a kill (owner 2026-07-27: 殭屍與英雄都算)", () => {
  it("a ZOMBIE kill counts — through the real MobSystem payout", () => {
    cover("kill-combo-mob");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    beginCombatMobs(w, RULES, [0]);
    step(w, 2); // wave 1 on the field
    const mobs = [...w.mob.keys()];
    expect(mobs.length).toBeGreaterThan(0);

    execute(w, killer, mobs[0]!);
    step(w, 1);
    // ⚠️ MUTATION: delete `creditKillCombo(world, killer, id, "mob")` from
    // MobSystem's payout branch and this is [] instead of [1].
    expect(comboCounts(w)).toEqual([1]);
    expect(comboEvents(w)[0]!.victimKind).toBe("mob");
    expect(killComboOf(w, killer)).toBe(1);
  });

  it("a CHAMPION kill counts — through the real DeathSystem credit", () => {
    cover("kill-combo-champion");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    const victim = champAt(w, 1, 1, -38, 0);

    execute(w, killer, victim);
    step(w, 1);
    // ⚠️ MUTATION: delete `creditKillCombo(world, killer, id, "champion")` from
    // DeathSystem's kill-credit branch and this is [] instead of [1].
    expect(comboCounts(w)).toEqual([1]);
    expect(comboEvents(w)[0]!.victimKind).toBe("champion");
    expect(killComboOf(w, killer)).toBe(1);
  });

  it("zombie + hero ADD UP ON ONE NUMBER — no split, no weighting", () => {
    cover("kill-combo-shared-counter");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    const victim = champAt(w, 1, 1, -38, 0);
    beginCombatMobs(w, RULES, [0]);
    step(w, 6); // wave k spawns min(k, cap) mobs — 6 ticks is enough for several
    const mobs = [...w.mob.keys()];
    expect(mobs.length).toBeGreaterThanOrEqual(2);

    execute(w, killer, mobs[0]!); // 1 — a zombie
    step(w, 1);
    expect(comboCounts(w)).toEqual([1]);

    execute(w, killer, mobs[1]!); // 2 — another zombie
    step(w, 1);
    expect(comboCounts(w)).toEqual([2]);

    execute(w, killer, victim); // 3 — a HERO, continuing the SAME chain
    step(w, 1);
    // If the two kinds were counted separately this would be 1, not 3. That is
    // the owner's ruling, asserted in the direction the defect would break.
    expect(comboCounts(w)).toEqual([3]);
    expect(comboEvents(w)[0]!.victimKind).toBe("champion");
  });

  it("the AoE sweep: six zombies in ONE tick chain 1→6", () => {
    cover("kill-combo-aoe-sweep");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    beginCombatMobs(w, RULES, [0]);
    step(w, 8); // several waves on the field
    const mobs = [...w.mob.keys()].slice(0, 6);
    expect(mobs.length).toBe(6);

    for (const m of mobs) execute(w, killer, m);
    step(w, 1);
    // Round 9 in miniature: one sweep, one tick, an ascending chain. Not six 1s.
    expect(comboCounts(w)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(killComboOf(w, killer)).toBe(6);
  });

  it("breaks after 5 quiet seconds and starts over at 1", () => {
    cover("kill-combo-breaks");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    const a = champAt(w, 1, 1, -38, 0);
    const b = champAt(w, 2, 1, -36, 0);

    execute(w, killer, a);
    step(w, 1);
    expect(comboCounts(w)).toEqual([1]);

    // idle past the window, then kill again
    step(w, IDLE_PAST_WINDOW);
    expect(killComboOf(w, killer)).toBe(0); // lapsed
    execute(w, killer, b);
    step(w, 1);
    // ⚠️ MUTATION: an infinite window makes this [2].
    expect(comboCounts(w)).toEqual([1]);
  });

  it("survives the round boundary the only way it should — by expiring", () => {
    cover("kill-combo-round-boundary");
    // `MatchController.stepSim` steps the world in EVERY phase, so the shop
    // beat between rounds is far longer than 5 s and the chain dies on its own.
    // Nothing has to remember to reset it — which is why there is no reset.
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    w.killCombo.set(killer, { lastKillTick: w.tick, count: 17 });
    step(w, 3 * TICK_HZ); // three seconds of resolution/intermission
    expect(killComboOf(w, killer)).toBe(17); // still inside the window
    step(w, 3 * TICK_HZ); // three more
    expect(killComboOf(w, killer)).toBe(0);
  });

  it("two killers keep two independent chains", () => {
    cover("kill-combo-per-killer");
    const w = newWorld();
    const p1 = champAt(w, 0, 0, -40, 0);
    const p2 = champAt(w, 1, 0, -42, 0);
    beginCombatMobs(w, RULES, [0]);
    step(w, 8);
    const mobs = [...w.mob.keys()];

    execute(w, p1, mobs[0]!);
    execute(w, p1, mobs[1]!);
    execute(w, p2, mobs[2]!);
    step(w, 1);
    expect(killComboOf(w, p1)).toBe(2);
    expect(killComboOf(w, p2)).toBe(1);
  });

  it("a mob killed by NOBODY credits nobody", () => {
    cover("kill-combo-no-killer");
    const w = newWorld();
    beginCombatMobs(w, RULES, [0]);
    step(w, 2);
    const [mobId] = [...w.mob.keys()];
    // fire-ring / DoT shape: a lethal packet whose source is the victim itself,
    // i.e. not a champion. MobSystem's `champion.has(killer)` gate must hold.
    w.damageQueue.push({
      source: mobId!,
      target: mobId!,
      amount: 100000,
      type: "true",
      crit: false,
      origin: "fireRing",
    });
    step(w, 1);
    expect(comboCounts(w)).toEqual([]);
    expect(w.killCombo.size).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE EVENT — the only way the number reaches a screen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the killCombo event", () => {
  it("carries the seat, the victim kind, the count and the window", () => {
    cover("kill-combo-payload");
    const w = newWorld();
    const killer = champAt(w, 3, 0, -40, 0);
    const victim = champAt(w, 4, 1, -38, 0);
    execute(w, killer, victim);
    step(w, 1);
    const [data] = comboEvents(w);
    expect(data).toBeTruthy();
    expect(data!.killer).toBe(killer);
    // seat id, so the HUD can tell 「my combo」 from someone else's without
    // resolving entity ids — this is the field the display gates on.
    expect(data!.killerSeatId).toBe(3);
    expect(data!.victim).toBe(victim);
    expect(data!.victimKind).toBe("champion");
    expect(data!.count).toBe(1);
    // the window travels WITH the event so the HUD's expiry cannot drift
    expect(data!.windowTicks).toBe(KILL_COMBO_WINDOW_TICKS);
    expect(data!.windowMs).toBe(KILL_COMBO_WINDOW_MS);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * DETERMINISM — decision 1's actual payoff
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("determinism", () => {
  it("two seeded runs produce the identical combo event stream", () => {
    cover("kill-combo-determinism");
    const run = (): number[] => {
      const w = newWorld(123);
      const killer = champAt(w, 0, 0, -40, 0);
      beginCombatMobs(w, RULES, [0]);
      const counts: number[] = [];
      for (let t = 0; t < 40; t++) {
        const mobs = [...w.mob.keys()];
        if (mobs.length > 0 && t % 3 === 0) execute(w, killer, mobs[0]!);
        step(w, 1);
        counts.push(...comboCounts(w));
      }
      return counts;
    };
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(3); // the fixture really did kill things
    expect(a).toEqual(b);
  });

  it("stays OUT of digest() — it grants nothing, it only reports", () => {
    cover("kill-combo-digest");
    // Deliberate, on the `killTracking` precedent: this map changes no gold, no
    // xp, no level and no stat. Folding a pure-presentation counter in would add
    // churn without adding reach. If it ever starts GRANTING something, this
    // test is the place that has to change first.
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    const before = w.digest();
    creditKillCombo(w, killer, killer, "mob");
    expect(w.killCombo.get(killer)!.count).toBe(1);
    expect(w.digest()).toBe(before);
  });

  it("a recycled entity id never inherits a stale chain", () => {
    cover("kill-combo-destroy");
    const w = newWorld();
    const killer = champAt(w, 0, 0, -40, 0);
    creditKillCombo(w, killer, killer, "mob");
    expect(w.killCombo.has(killer)).toBe(true);
    w.destroy(killer);
    expect(w.killCombo.has(killer)).toBe(false);
  });
});
