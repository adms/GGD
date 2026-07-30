/**
 * 召喚物 (GH#289 lane P2) — behavioural guards for the `summon` primitive.
 *
 * ── HOW THESE ARE SHAPED (CLAUDE.md 的七種失敗形態) ─────────────────────────
 * Every assertion below drives a REAL `world.step()` and reads FINAL world state
 * (`world.transform` / `world.health` / `world.team` / `world.summon`), never
 * the effect object and never a property of the config:
 *
 *  ② 「算了但沒送到」 — the field-count assertions count entities in
 *     `world.transform`, i.e. the store the snapshot encoder actually walks. A
 *     summon that only existed in `world.summon` would pass a "the store grew"
 *     test and fail these.
 *  ③ 「刪掉還全綠」 — each of expiry / cap / owner-death / eviction has a
 *     recorded MUTATION (see the file-level note in the task report): the guard
 *     was watched go RED with the key line broken, then restored.
 *  ⑤ 「被測的不是出貨的」 — nothing here hand-writes a `SummonComp` or calls
 *     `spawnSummon` directly. Every body on the field got there by running the
 *     SHIPPED `summon` handler through the SHIPPED `runEffects` dispatch, which
 *     is the exact path an ability doc takes.
 *  ⑦ 「掃屬性代替掃行為」 — "the summon has a StatsComp" is not a claim that it
 *     fights, so `it fights` below waits for real damage to land on a real
 *     enemy's `world.health.hp` through `basicAttackSystem`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { zEffectDefUnion } from "../../content/schema/effect";
import { MONSTER_TEAM, mobsAliveInZone } from "../mobs";
import { summonsInGroup } from "../summons";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { baseBonusFor } from "../baseBonus";
import { Stat } from "../stats/statTypes";

const C = SKELETON_ARENA.zones[0]!.center;
const HERO = "sela" as ChampionId;

beforeAll(() => {
  registerSkeletonContent();
});

interface Rig {
  world: SimWorld;
  caster: EntityId;
  /** every entity that is NOT the caster and not a projectile */
  others: () => EntityId[];
  cast: (e: Extract<EffectDef, { kind: "summon" }>, origin?: string) => void;
  stepFor: (ticks: number) => void;
  /** every event emitted since the rig was built (`world.events` is per-tick) */
  log: { type: string; data: Record<string, unknown> }[];
}

function rig(seed = 7): Rig {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const caster = spawnChampion(world, {
    championId: HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const ctxFor = (origin: string): EffectContext => ({
    world,
    caster,
    rank: 1,
    targets: [],
    origin,
    rng: world.rng,
  });
  // `world.events` is CLEARED at the top of every step, so a guard that reads it
  // after a loop can only ever see the last tick. Accumulating here is what lets
  // 「it announced the despawn」 be asserted at all.
  const log: { type: string; data: Record<string, unknown> }[] = [];
  const drain = (): void => {
    for (const e of world.events) log.push({ type: e.type, data: e.data });
  };
  return {
    world,
    caster,
    log,
    others: () =>
      [...world.transform.keys()].filter((id) => id !== caster && !world.projectile.has(id)),
    cast: (e, origin = "ability:test.summon") => {
      runEffects([e], ctxFor(origin));
      drain();
    },
    stepFor: (ticks) => {
      for (let i = 0; i < ticks; i++) {
        world.step(new Map());
        drain();
      }
    },
  };
}

/** Every summon currently on the field (ids ascending). */
function summons(world: SimWorld): EntityId[] {
  return [...world.summon.keys()].sort((a, b) => a - b);
}

describe("summon — bodies really reach the field (gh289-summon)", () => {
  it("spawns `count` LIVE bodies on the OWNER's team, with the champion's own HP", () => {
    cover("gh289-summon");
    const r = rig();
    expect(r.others()).toHaveLength(0);

    r.cast({ kind: "summon", championId: HERO, count: 3, durationSec: 5 });
    r.stepFor(1);

    const ids = summons(r.world);
    expect(ids, "three bodies were asked for").toHaveLength(3);
    // ② the entities are in `world.transform` — the store the wire walks — not
    //    only in the summon marker map.
    expect(r.others().sort((a, b) => a - b)).toEqual(ids);

    const ownerTeam = r.world.team.get(r.caster)!.teamId;
    for (const id of ids) {
      expect(r.world.team.get(id)!.teamId, "歸屬: owner's team").toBe(ownerTeam);
      const hp = r.world.health.get(id)!;
      expect(hp.alive).toBe(true);
      // Not a literal: read the CASTER's own maxHp, so this stays true when the
      // hero sheet or the combat-env multipliers move. A summon that skipped
      // `recomputeStats` would sit at 0 and this is the only assertion that sees
      // that (a 0-hp body is 「alive」 until something hits it).
      expect(hp.maxHp).toBeGreaterThan(0);
      expect(hp.maxHp).toBe(r.world.health.get(r.caster)!.maxHp);
      expect(hp.hp).toBe(hp.maxHp);
      // The three ABSENCES that are the whole design (see sim/summons.ts).
      expect(r.world.champion.has(id), "a summon must not be a champion").toBe(false);
      expect(r.world.mob.has(id), "a summon must not be a mob").toBe(false);
      expect(r.world.matchStats.has(id), "a summon must not be on the scoreboard").toBe(false);
    }
    // The #215 zombie economy must not see them at all.
    expect(mobsAliveInZone(r.world, 0)).toBe(0);
  });

  it("`hpMult` moves the body's REAL maxHealth, through the one stat pipeline", () => {
    cover("gh289-summon");
    const plain = rig();
    plain.cast({ kind: "summon", championId: HERO, count: 1, durationSec: 5 });
    plain.stepFor(1);
    const base = plain.world.health.get(summons(plain.world)[0]!)!.maxHp;

    const halved = rig();
    halved.cast({ kind: "summon", championId: HERO, count: 1, durationSec: 5, hpMult: 0.5 });
    halved.stepFor(1);
    const scaled = halved.world.health.get(summons(halved.world)[0]!)!.maxHp;

    // ⑦: not "there is a modifier source" — the FINAL number moved, and moved by
    // EXACTLY the amount the shipped pipeline says it should.
    //
    // ⚠️ NOT `base * 0.5`. 基礎加成 (#273, owner 2026-07-28 「初始 HP 加成不參與
    // 倍率計算」) is added by `finalizeStat` AFTER every multiplier, so a 0.5×
    // summon is `(base − bonus) × 0.5 + bonus`, not half the displayed number.
    // Reading `world.baseBonus` rather than hard-coding 650 keeps this true when
    // the operator moves the knob — the owner has already moved it three times.
    const bonus = baseBonusFor(halved.world.baseBonus, Stat.MaxHealth);
    expect(bonus, "the fixture must actually exercise the post-multiplier bonus").toBeGreaterThan(0);
    expect(scaled).toBeCloseTo((base - bonus) * 0.5 + bonus, 4);
    // …and it really is SMALLER, so 「the modifier was dropped」 (scaled === base)
    // is red rather than arithmetically indistinguishable.
    expect(scaled).toBeLessThan(base);
  });

  it("bodies are spaced APART — a formation is not N bodies on one point", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 4, durationSec: 5, spread: 3 });
    r.stepFor(1);
    const pts = summons(r.world).map((id) => r.world.transform.get(id)!.pos);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i]!.x - pts[j]!.x;
        const dz = pts[i]!.z - pts[j]!.z;
        expect(Math.sqrt(dx * dx + dz * dz), `bodies ${i} and ${j} overlap`).toBeGreaterThan(0.5);
      }
    }
  });

  it("`scatter` is SEEDED — same seed, same layout; different seed, different", () => {
    cover("gh289-summon");
    const layout = (seed: number): string => {
      const r = rig(seed);
      r.cast({
        kind: "summon",
        championId: HERO,
        count: 4,
        durationSec: 5,
        formation: "scatter",
        spread: 4,
      });
      r.stepFor(1);
      return summons(r.world)
        .map((id) => {
          const p = r.world.transform.get(id)!.pos;
          return `${p.x.toFixed(4)},${p.z.toFixed(4)}`;
        })
        .join("|");
    };
    expect(layout(7), "a replay must reproduce the layout").toBe(layout(7));
    expect(layout(7), "the draw must actually depend on the seed").not.toBe(layout(99));
  });
});

describe("summon — 存活時間 (gh289-summon)", () => {
  it("a TIMED summon is GONE after its deadline, and present the tick before", () => {
    cover("gh289-summon");
    const r = rig();
    // 1 second = 30 ticks at 30 Hz.
    r.cast({ kind: "summon", championId: HERO, count: 2, durationSec: 1 });
    r.stepFor(1);
    expect(summons(r.world)).toHaveLength(2);

    // BOTH sides of the deadline are asserted: still there at 25 ticks (so a
    // "despawn immediately" implementation is red too), gone by 35.
    r.stepFor(24);
    expect(summons(r.world), "despawned early").toHaveLength(2);

    r.stepFor(10);
    expect(summons(r.world), "the deadline did not remove it").toHaveLength(0);
    // ② the ENTITY is gone, not just its marker — a body left in `transform`
    // would still be on the wire, still collide and still block navigation.
    expect(r.others()).toHaveLength(0);
    expect(r.log.some((e) => e.type === "summonDespawn" && e.data.reason === "expired")).toBe(true);
  });

  it("a PERMANENT summon (no durationSec) is still there minutes later", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 1 });
    r.stepFor(1);
    expect(summons(r.world)).toHaveLength(1);
    r.stepFor(30 * 120); // two minutes
    expect(summons(r.world), "a permanent summon expired").toHaveLength(1);
  });
});

describe("summon — 上限 (gh289-summon)", () => {
  it("`maxAlive` caps ONE cast — the extra bodies are never placed", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 9, durationSec: 30, maxAlive: 3 });
    r.stepFor(1);
    expect(summons(r.world), "the cap did not hold within one cast").toHaveLength(3);
  });

  it("`maxAlive` caps ACROSS casts, and frees up when a body dies", () => {
    cover("gh289-summon");
    const r = rig();
    const e: Extract<EffectDef, { kind: "summon" }> = {
      kind: "summon",
      championId: HERO,
      count: 2,
      durationSec: 30,
      maxAlive: 3,
    };
    r.cast(e);
    r.cast(e);
    r.cast(e);
    r.stepFor(1);
    expect(summons(r.world), "three casts of 2 must stop at the cap").toHaveLength(3);

    // Kill one: the slot must come back, or a hero whose swarm was wiped could
    // never re-summon.
    const victim = summons(r.world)[0]!;
    r.world.health.get(victim)!.hp = 0;
    r.stepFor(1);
    expect(summons(r.world)).toHaveLength(2);
    r.cast(e);
    r.stepFor(1);
    expect(summons(r.world)).toHaveLength(3);
  });

  it("`capScope` decides whether two ABILITIES share one budget", () => {
    cover("gh289-summon");
    const perAbility = rig();
    const e = (cap: "caster" | "casterAbility"): Extract<EffectDef, { kind: "summon" }> => ({
      kind: "summon",
      championId: HERO,
      count: 2,
      durationSec: 30,
      maxAlive: 2,
      capScope: cap,
    });
    perAbility.cast(e("casterAbility"), "ability:test.q");
    perAbility.cast(e("casterAbility"), "ability:test.r");
    perAbility.stepFor(1);
    expect(summons(perAbility.world), "separate budgets").toHaveLength(4);

    const shared = rig();
    shared.cast(e("caster"), "ability:test.q");
    shared.cast(e("caster"), "ability:test.r");
    shared.stepFor(1);
    expect(summons(shared.world), "one shared budget").toHaveLength(2);
  });

  it("`onCap: replaceOldest` evicts the OLDEST body (37-02 黑核晶)", () => {
    cover("gh289-summon");
    const r = rig();
    const e: Extract<EffectDef, { kind: "summon" }> = {
      kind: "summon",
      championId: HERO,
      count: 1,
      durationSec: 30,
      maxAlive: 2,
      onCap: "replaceOldest",
    };
    r.cast(e);
    r.stepFor(1);
    const first = summons(r.world)[0]!;
    r.cast(e);
    r.stepFor(1);
    const second = summons(r.world).filter((id) => id !== first)[0]!;
    expect(summons(r.world)).toHaveLength(2);

    r.cast(e);
    r.stepFor(1);
    const after = summons(r.world);
    expect(after, "the cap must still hold after an eviction").toHaveLength(2);
    expect(after, "the OLDEST body should have been the one evicted").not.toContain(first);
    expect(after, "the middle body must survive").toContain(second);
    // The direction matters: `skip` would have kept `first` and placed nothing,
    // so this pair of assertions distinguishes the two modes rather than passing
    // for both.
  });

  it("`onCap: skip` keeps the OLD bodies — the opposite decision, also honoured", () => {
    cover("gh289-summon");
    const r = rig();
    const e: Extract<EffectDef, { kind: "summon" }> = {
      kind: "summon",
      championId: HERO,
      count: 1,
      durationSec: 30,
      maxAlive: 1,
      onCap: "skip",
    };
    r.cast(e);
    r.stepFor(1);
    const first = summons(r.world)[0]!;
    r.cast(e);
    r.stepFor(1);
    expect(summons(r.world)).toEqual([first]);
  });

  it("the cap-group helper counts ONLY this owner's live bodies in this group", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 2, durationSec: 30 }, "ability:test.q");
    r.cast({ kind: "summon", championId: HERO, count: 1, durationSec: 30 }, "ability:test.r");
    r.stepFor(1);
    expect(summonsInGroup(r.world, r.caster, "ability:test.q")).toHaveLength(2);
    expect(summonsInGroup(r.world, r.caster, "ability:test.r")).toHaveLength(1);
    expect(summonsInGroup(r.world, r.caster, "ability:nobody")).toHaveLength(0);
  });
});

describe("summon — 主人死了 / 歸屬 (gh289-summon)", () => {
  it("`onOwnerDeath: despawn` (the default) removes the body when the owner dies", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 2, durationSec: 60 });
    r.stepFor(1);
    expect(summons(r.world)).toHaveLength(2);

    r.world.health.get(r.caster)!.hp = 0;
    r.stepFor(2);
    expect(summons(r.world), "the summons outlived their dead master").toHaveLength(0);
    expect(
      r.log.some((e) => e.type === "summonDespawn" && e.data.reason === "ownerDead"),
      "the despawn was not announced as an owner death",
    ).toBe(true);
  });

  it("`onOwnerDeath: persist` keeps it fighting — the OTHER half of the decision", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({
      kind: "summon",
      championId: HERO,
      count: 2,
      durationSec: 60,
      onOwnerDeath: "persist",
    });
    r.stepFor(1);
    r.world.health.get(r.caster)!.hp = 0;
    r.stepFor(5);
    expect(summons(r.world), "`persist` was ignored").toHaveLength(2);
  });

  it("`team: neutral` puts the body on the MONSTER sentinel, hostile to its summoner", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 1, durationSec: 30, team: "neutral" });
    r.stepFor(1);
    const id = summons(r.world)[0]!;
    expect(r.world.team.get(id)!.teamId).toBe(MONSTER_TEAM);
    expect(r.world.team.get(id)!.teamId).not.toBe(r.world.team.get(r.caster)!.teamId);
  });
});

describe("summon — it FIGHTS, and it pays nobody (gh289-summon)", () => {
  it("acquires an enemy and damages it through the SHIPPED attack path", () => {
    cover("gh289-summon");
    const world = new SimWorld(SKELETON_ARENA, 11);
    const caster = spawnChampion(world, {
      championId: HERO,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: C.x - 2, z: C.z },
      zone: 0,
    });
    const enemy = spawnChampion(world, {
      championId: HERO,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: C.x + 2, z: C.z },
      zone: 0,
    });
    // Park the enemy: this test is about the SUMMON's aggression, not a duel.
    world.health.get(enemy)!.maxHp = 100000;
    world.health.get(enemy)!.hp = 100000;

    runEffects(
      [
        {
          kind: "summon",
          championId: HERO,
          count: 1,
          durationSec: 60,
          at: "self",
          spread: 1,
        } satisfies EffectDef,
      ],
      { world, caster, rank: 1, targets: [], origin: "ability:test.summon", rng: world.rng },
    );
    for (let i = 0; i < 3; i++) world.step(new Map());
    const id = summons(world)[0]!;
    expect(world.nav.get(id)!.attackTarget, "the summon never acquired a target").toBe(enemy);

    const before = world.health.get(enemy)!.hp;
    for (let i = 0; i < 180; i++) world.step(new Map());
    // ⑦: not "it has a StatsComp" — real hp came off a real enemy.
    expect(world.health.get(enemy)!.hp, "the summon never actually hit anything").toBeLessThan(
      before,
    );
  });

  it("killing a summon pays NO gold and records NO champion death", () => {
    cover("gh289-summon");
    const r = rig();
    r.cast({ kind: "summon", championId: HERO, count: 1, durationSec: 60 });
    r.stepFor(1);
    const id = summons(r.world)[0]!;
    const goldBefore = r.world.champion.get(r.caster)!.gold;
    const deathsBefore = r.world.matchStats.get(r.caster)!.deaths;

    r.world.health.get(id)!.hp = 0;
    r.stepFor(2);

    // A ChampionComp'd summon would have paid `GOLD_REWARDS.kill` + the
    // once-per-victim bounty here. This is the assertion that keeps the economy
    // safe from the "just give it a ChampionComp, everything works" shortcut.
    expect(r.world.champion.get(r.caster)!.gold).toBe(goldBefore);
    expect(r.world.matchStats.get(r.caster)!.deaths).toBe(deathsBefore);
    expect(summons(r.world)).toHaveLength(0);
  });
});

describe("summon — the loud refusals (gh289-summon)", () => {
  it("`killCredit: \"owner\"` THROWS rather than silently paying nobody", () => {
    cover("gh289-summon");
    const r = rig();
    expect(() =>
      r.cast({
        kind: "summon",
        championId: HERO,
        count: 1,
        durationSec: 5,
        killCredit: "owner",
      }),
    ).toThrow(/killCredit/);
  });

  it("an UNKNOWN body summons nothing and says so — it must not crash the tick", () => {
    cover("gh289-summon");
    const r = rig();
    expect(() =>
      r.cast({ kind: "summon", championId: "no-such-hero", count: 2, durationSec: 5 }),
    ).not.toThrow();
    r.stepFor(1);
    expect(summons(r.world), "an unknown body must place nothing").toHaveLength(0);
    expect(r.others(), "…and leave no half-built entity behind").toHaveLength(0);
    // It must be LOUD, not silent: failure shape ② is the card promising a
    // summon while the sim quietly does nothing.
    expect(r.log.some((e) => e.type === "summonFailed")).toBe(true);
  });
});

describe("summon — schema mirrors the sim (gh289-summon)", () => {
  it("every decision the handler reads is ACCEPTED by the Zod union", () => {
    cover("gh289-summon");
    const full = {
      kind: "summon",
      body: "self",
      championId: HERO,
      count: 3,
      durationSec: 12,
      level: 5,
      team: "neutral",
      at: "point",
      formation: "line",
      spread: 2.5,
      maxAlive: 4,
      capScope: "caster",
      onCap: "replaceOldest",
      onOwnerDeath: "persist",
      hpMult: 0.4,
      damageMult: 0.6,
      killCredit: "none",
    };
    expect(zEffectDefUnion.safeParse(full).success, "the schema rejects a field the sim reads").toBe(
      true,
    );
    // …and the bounds are real: an un-converted WC3 offset must not get in.
    expect(zEffectDefUnion.safeParse({ ...full, spread: 450 }).success).toBe(false);
    expect(zEffectDefUnion.safeParse({ ...full, formation: "spiral" }).success).toBe(false);
  });
});
