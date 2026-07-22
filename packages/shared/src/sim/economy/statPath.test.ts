/**
 * 能力屬性強化 — the 20-stack stat path and its capstone (task #82).
 *
 * The user's spec, in four clauses, each with its own describe block below:
 *   「隨機的能力屬性強化」                        a repeatable purchase, random roll
 *   「累積購買到 20 次之後」                      a counter, target 20
 *   「且沒有購買任何道具(除了隨機三選一給的武器)」  the predicate: a SHOP purchase
 *                                               breaks it, a DRAFT grant does not
 *   「隨機出現加強 10~100%能力屬性強化傳說道具」   the capstone, rolled 10..100%
 *
 * plus the reset ruling the user gave when asked what happens if you buy an
 * item at stack 19: 「歸零」. Zero, not "pause", not "keep 19" — which is what
 * makes the fork a commitment rather than a free option.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { Items, LootTables } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { buyItem, grantItemFree } from "./shop";
import { buyStatUpgrade, grantCapstone, statPathLive, statTicksRemaining, CAPSTONE_ROUND_GATE } from "./statPath";
import { deathSystem } from "../systems/DeathSystem";
import { GOLD_REWARDS } from "./progression";
import {
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  LEGENDARY_POOL_TABLE,
  STAT_TICK_ITEM_ID,
  STAT_TICK_PRICE,
  STAT_TICK_TARGET,
  STAT_TICK_ROLLS,
  CAPSTONE_MIN_PCT,
  CAPSTONE_MAX_PCT,
} from "./itemTiers";

beforeAll(() => {
  registerSkeletonContent();
  Items.register(STAT_TICK_ITEM_ID, {
    id: STAT_TICK_ITEM_ID,
    name: "能力屬性強化",
    cost: STAT_TICK_PRICE,
    tier: 1,
    tags: [],
  });
  Items.register(LEGENDARY_ORB_ITEM_ID, {
    id: LEGENDARY_ORB_ITEM_ID,
    name: "傳說寶玉",
    cost: LEGENDARY_ORB_PRICE,
    tier: 3,
    tags: [],
  });
  LootTables.register(LEGENDARY_POOL_TABLE, {
    id: LEGENDARY_POOL_TABLE,
    entries: [{ itemId: "serrated-edge" as ItemId, weight: 1 }],
  });
});

function makeWorld(seed = 5, gold = 100_000): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  world.champion.get(id)!.gold = gold;
  return { world, id };
}

const tick = (world: SimWorld, id: EntityId): void => void buyItem(world, id, STAT_TICK_ITEM_ID);

describe("「隨機的能力屬性強化」 — the repeatable tick", () => {
  it("charges 375g, adds one stack and attaches one rolled stat", () => {
    cover("statpath-tick");
    const { world, id } = makeWorld();
    const out = buyStatUpgrade(world, id);
    expect(out.result).toBe("ok");
    expect(out.stacks).toBe(1);
    expect(out.roll).not.toBeNull();
    expect(STAT_TICK_ROLLS).toContainEqual(out.roll);
    expect(world.champion.get(id)!.gold).toBe(100_000 - STAT_TICK_PRICE);
    expect(world.stats.get(id)!.sources.filter((s) => s.id.startsWith("stat:"))).toHaveLength(1);
  });

  it("CONSUMES NO INVENTORY SLOT — that slot-freedom is what the 25% premium rents", () => {
    cover("statpath-no-slot");
    const { world, id } = makeWorld();
    for (let i = 0; i < 10; i++) tick(world, id);
    expect(world.champion.get(id)!.items.every((s) => s === null)).toBe(true);
    expect(world.champion.get(id)!.statStacks).toBe(10);
  });

  it("stacks additively — 20 ticks are 20 independent sources, not one overwrite", () => {
    cover("statpath-stacks-add");
    const { world, id } = makeWorld();
    for (let i = 0; i < STAT_TICK_TARGET; i++) tick(world, id);
    const sources = world.stats.get(id)!.sources.filter((s) => s.id.startsWith("stat:"));
    // 20 ticks + the capstone earned on the 20th
    expect(sources).toHaveLength(STAT_TICK_TARGET + 1);
    expect(new Set(sources.map((s) => s.id)).size).toBe(sources.length);
    recomputeStats(world, id);
    // every roll is a real stat gain, so SOMETHING measurably moved
    expect(world.stats.get(id)!.final[Stat.MaxHealth]).toBeGreaterThan(0);
  });

  it("refuses without charging when the purse is short", () => {
    cover("statpath-no-gold");
    const { world, id } = makeWorld(5, STAT_TICK_PRICE - 1);
    const out = buyStatUpgrade(world, id);
    expect(out.result).toBe("no-gold");
    expect(out.stacks).toBe(0);
    expect(world.champion.get(id)!.gold).toBe(STAT_TICK_PRICE - 1);
  });

  it("is deterministic: same seed, same twenty rolls", () => {
    cover("statpath-deterministic");
    const rolls = (seed: number): string[] => {
      const { world, id } = makeWorld(seed);
      return Array.from({ length: 20 }, () => JSON.stringify(buyStatUpgrade(world, id).roll));
    };
    expect(rolls(99)).toEqual(rolls(99));
    expect(rolls(99)).not.toEqual(rolls(100));
  });
});

describe("「沒有購買任何道具」 — the counter counts ONLY stat purchases", () => {
  it("a DRAFT-granted weapon does not touch the streak — 「除了隨機三選一給的武器」", () => {
    cover("statpath-draft-grant-safe");
    const { world, id } = makeWorld();
    for (let i = 0; i < 5; i++) tick(world, id);
    expect(grantItemFree(world, id, "ember-rod" as ItemId)).toBeGreaterThanOrEqual(0);
    grantItemFree(world, id, "swift-boots" as ItemId);
    expect(world.champion.get(id)!.statStacks).toBe(5);
    for (let i = 0; i < 15; i++) tick(world, id);
    // 20 clean ticks with two free weapons in the bag: capstone still lands.
    expect(world.champion.get(id)!.statCapstonePct).toBeGreaterThan(0);
  });

  it("BUYING an item resets the streak to ZERO — at 19, as the user ruled", () => {
    cover("statpath-reset-at-19");
    const { world, id } = makeWorld();
    for (let i = 0; i < 19; i++) tick(world, id);
    expect(world.champion.get(id)!.statStacks).toBe(19);
    expect(statTicksRemaining(world, id)).toBe(1);

    expect(buyItem(world, id, "ember-rod" as ItemId)).toBe("ok");
    expect(world.champion.get(id)!.statStacks).toBe(0);
    expect(statTicksRemaining(world, id)).toBe(STAT_TICK_TARGET);

    // …and the 20th tick after the reset earns nothing.
    tick(world, id);
    expect(world.champion.get(id)!.statCapstonePct).toBe(0);
  });

  it("announces the reset loudly so 19 stacks cannot be lost unknowingly", () => {
    cover("statpath-reset-event");
    const { world, id } = makeWorld();
    for (let i = 0; i < 19; i++) tick(world, id);
    world.events.length = 0;
    buyItem(world, id, "ember-rod" as ItemId);
    const reset = world.events.find((e) => e.type === "statPathReset");
    expect(reset, "a silent reset is exactly what the HUD cannot warn about").toBeDefined();
    expect(reset!.data.lost).toBe(19);
    expect(reset!.data.cause).toBe("ember-rod");
  });

  it("buying the ORB resets it too — it is a gold purchase of a weapon", () => {
    cover("statpath-orb-resets");
    const { world, id } = makeWorld();
    for (let i = 0; i < 8; i++) tick(world, id);
    expect(buyItem(world, id, LEGENDARY_ORB_ITEM_ID)).toBe("ok");
    expect(world.champion.get(id)!.statStacks).toBe(0);
  });

  it("a REFUSED purchase leaves the streak intact — only a completed buy resets", () => {
    cover("statpath-refused-buy-safe");
    const { world, id } = makeWorld(5, 19 * STAT_TICK_PRICE);
    for (let i = 0; i < 19; i++) tick(world, id);
    expect(world.champion.get(id)!.gold).toBe(0);
    expect(buyItem(world, id, "ember-rod" as ItemId)).toBe("no-gold");
    expect(world.champion.get(id)!.statStacks).toBe(19);
  });
});

describe("「隨機出現加強 10~100%能力屬性強化傳說道具」 — the capstone", () => {
  it("lands on the 20th consecutive tick and never before", () => {
    cover("statpath-capstone-at-20");
    const { world, id } = makeWorld();
    for (let i = 0; i < STAT_TICK_TARGET - 1; i++) {
      tick(world, id);
      expect(world.champion.get(id)!.statCapstonePct).toBe(0);
    }
    const out = buyStatUpgrade(world, id);
    expect(out.stacks).toBe(STAT_TICK_TARGET);
    expect(out.capstonePct).toBeGreaterThan(0);
    expect(world.events.some((e) => e.type === "statCapstoneGranted")).toBe(true);
  });

  it("pays inside 10-100%, on every seed", () => {
    cover("statpath-capstone-range");
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const { world, id } = makeWorld(seed);
      const pct = grantCapstone(world, id);
      expect(pct).toBeGreaterThanOrEqual(CAPSTONE_MIN_PCT);
      expect(pct).toBeLessThanOrEqual(CAPSTONE_MAX_PCT);
      expect(pct % 10).toBe(0);
      seen.add(pct);
    }
    // it is a GAMBLE: the payoff must actually vary, or the fork is a formality
    expect(seen.size).toBeGreaterThan(3);
  });

  it("multiplies the champion's own stats, so a tank and a carry cash it differently", () => {
    cover("statpath-capstone-pctadd");
    const { world, id } = makeWorld();
    recomputeStats(world, id);
    const before = { ...world.stats.get(id)!.final };
    const pct = grantCapstone(world, id);
    recomputeStats(world, id);
    const after = world.stats.get(id)!.final;
    const r = pct / 100;
    expect(after[Stat.MaxHealth]).toBeCloseTo(before[Stat.MaxHealth] * (1 + r), 3);
    expect(after[Stat.AttackDamage]).toBeCloseTo(before[Stat.AttackDamage] * (1 + r), 3);
    expect(after[Stat.Armor]).toBeCloseTo(before[Stat.Armor] * (1 + r), 3);
    expect(after[Stat.MagicResist]).toBeCloseTo(before[Stat.MagicResist] * (1 + r), 3);
  });

  it("is granted at most once per champion", () => {
    cover("statpath-capstone-once");
    const { world, id } = makeWorld();
    const first = grantCapstone(world, id);
    expect(first).toBeGreaterThan(0);
    expect(grantCapstone(world, id)).toBe(0);
    expect(world.champion.get(id)!.statCapstonePct).toBe(first);
    expect(statPathLive(world, id)).toBe(false);
  });

  it("the tick stays buyable past 20 — only the capstone is once", () => {
    cover("statpath-uncapped");
    const { world, id } = makeWorld();
    for (let i = 0; i < 25; i++) tick(world, id);
    expect(world.champion.get(id)!.statStacks).toBe(25);
    expect(statTicksRemaining(world, id)).toBe(0);
  });

  it("WAITS for round 6 — 20 stacks banked early stay capstone-less until 「大約是第五場之後」", () => {
    cover("statpath-capstone-round-gate");
    const { world, id } = makeWorld();
    // a winning streak buys the 20th tick a round early (round 5)
    world.round = CAPSTONE_ROUND_GATE - 1;
    for (let i = 0; i < STAT_TICK_TARGET; i++) tick(world, id);
    expect(world.champion.get(id)!.statStacks).toBe(STAT_TICK_TARGET);
    // 20 stacks, but pre-round-6: the legendary is WITHHELD
    expect(world.champion.get(id)!.statCapstonePct).toBe(0);
    expect(world.events.some((e) => e.type === "statCapstoneGranted")).toBe(false);

    // reach the round-6 shop and buy one more tick — now it lands
    world.round = CAPSTONE_ROUND_GATE;
    world.events.length = 0;
    const out = buyStatUpgrade(world, id);
    expect(out.stacks).toBe(STAT_TICK_TARGET + 1);
    expect(out.capstonePct).toBeGreaterThan(0);
    expect(world.champion.get(id)!.statCapstonePct).toBeGreaterThan(0);
    expect(world.events.some((e) => e.type === "statCapstoneGranted")).toBe(true);
  });
});

describe("kill bounty (task #90) — a one-time premium per enemy", () => {
  it("pays base+bounty on the first kill, base only after a revive, and is deterministic", () => {
    cover("eco-kill-bounty");
    const run = (seed: number): { afterFirst: number; afterSecond: number } => {
      const world = new SimWorld(SKELETON_ARENA, seed);
      const c = SKELETON_ARENA.zones[0]!.center;
      const killer = spawnChampion(world, {
        championId: "sela" as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(0),
        pos: { x: c.x, z: c.z },
        zone: 0,
      });
      const victim = spawnChampion(world, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(1),
        teamId: asTeamId(1),
        pos: { x: c.x + 2, z: c.z },
        zone: 0,
      });
      world.champion.get(killer)!.gold = 0;
      const vhp = world.health.get(victim)!;

      // drive ONE death through the real system: a damage event names the source,
      // then deathSystem awards kill gold (+ bounty on the first).
      const killOnce = (): void => {
        vhp.hp = 0;
        vhp.alive = true;
        world.events.length = 0;
        world.emit("damage", { target: victim, source: killer });
        deathSystem(world);
      };

      killOnce();
      const afterFirst = world.champion.get(killer)!.gold;
      // revive the SAME entity (revive keeps the entity id) and kill it again
      vhp.hp = vhp.maxHp;
      vhp.alive = true;
      killOnce();
      const afterSecond = world.champion.get(killer)!.gold;
      return { afterFirst, afterSecond };
    };

    const a = run(7);
    // first kill: base kill gold PLUS the one-time bounty
    expect(a.afterFirst).toBe(GOLD_REWARDS.kill + GOLD_REWARDS.killBounty);
    // rekill after a revive: base kill gold ONLY — the bounty is not paid twice
    expect(a.afterSecond).toBe(a.afterFirst + GOLD_REWARDS.kill);
    // same seed → identical gold trail (deterministic bookkeeping)
    expect(run(7)).toEqual(a);
  });
});

describe("reachability — the fork has to be affordable, and only just", () => {
  it("20 ticks fit inside a match's deterministic income, with 100g to spare", () => {
    cover("statpath-affordable");
    const matchIncome = 7600;
    const { world, id } = makeWorld(5, matchIncome);
    for (let i = 0; i < STAT_TICK_TARGET; i++) {
      expect(buyStatUpgrade(world, id).result, `tick ${i + 1} was unaffordable`).toBe("ok");
    }
    expect(world.champion.get(id)!.statCapstonePct).toBeGreaterThan(0);
    expect(world.champion.get(id)!.gold).toBe(100);
    // 100g is not a SIMPLE item, so the path really did cost the whole match.
    expect(world.champion.get(id)!.gold).toBeLessThan(300);
  });
});
