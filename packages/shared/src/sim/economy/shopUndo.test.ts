/**
 * NO BUY/SELL MONEY EXPLOIT (task #121).
 *
 * The sell refund is a real −60% loss (`SELL_REFUND` = 0.4), and the shop has an
 * UNDO button. The danger is the seam between them: an undo that reversed a
 * RE-DERIVED figure instead of the gold actually applied could leak or burn a
 * coin per cycle, and a buy→sell→undo loop could then manufacture gold. This
 * file pins the invariants that make that impossible:
 *
 *   • undo reverses the EXACT applied gold delta (floored refund included),
 *   • a full round-trip returns to the precise starting gold + inventory,
 *   • an action can be undone at most once (the entry is popped),
 *   • no cycle — buy→sell→undo, repeated — ever climbs above the starting gold.
 *
 * Everything is a SYNTHETIC item so the rules are proved against the mechanic,
 * not against whatever the content tree happens to price. The end-to-end wiring
 * (command path + shop-access gate + per-round commit) is pinned in
 * apps/game-server/src/match/shopEconomy.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { Items } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { ModOp } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { buyItem, sellItem, undoShopAction, commitShopSession, SELL_REFUND } from "./shop";
import { buyStatUpgrade } from "./statPath";
import { STAT_TICK_ITEM_ID } from "./itemTiers";

/** A normal 1200g weapon. */
const POWER = "test-undo-power" as ItemId;
/** An ODD price (303g) so the floored 40% refund (121g) is non-trivial. */
const ODD = "test-undo-odd" as ItemId;
const POWER_COST = 1200;
const ODD_COST = 303;

beforeAll(() => {
  registerSkeletonContent();
  Items.register(POWER, {
    id: POWER,
    name: "測試巨劍",
    cost: POWER_COST,
    tier: 2,
    tags: [],
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 26 }],
  });
  Items.register(ODD, {
    id: ODD,
    name: "測試怪劍",
    cost: ODD_COST,
    tier: 1,
    tags: [],
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 7 }],
  });
});

function makeWorld(gold = 100_000): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  // #261: these guards describe the rules that apply WHEN the weapon shelf is
  // open. The shelf being 暫時下架 today does not retire them — it takes the
  // weapons off sale — so the world is opened explicitly rather than deleting
  // the coverage that comes back the moment the owner flips the flag.
  world.weaponShelfOpen = true;
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

/** Snapshot the observable economy state for exact-equality assertions. */
function snap(world: SimWorld, id: EntityId): { gold: number; items: string; stacks: number } {
  const champ = world.champion.get(id)!;
  return { gold: champ.gold, items: JSON.stringify(champ.items), stacks: champ.statStacks };
}

describe("undo reverses the EXACT gold delta (task #121)", () => {
  it("buy → undo returns to the precise starting gold + inventory", () => {
    cover("econ-undo-buy");
    const { world, id } = makeWorld();
    const before = snap(world, id);

    expect(buyItem(world, id, POWER)).toBe("ok");
    expect(world.champion.get(id)!.gold).toBe(before.gold - POWER_COST);
    expect(world.champion.get(id)!.items[0]).toBe(POWER);

    expect(undoShopAction(world, id)).toBe("ok");
    expect(snap(world, id)).toEqual(before); // gold, inventory AND stat-streak
    // the modifier source the buy attached is gone again
    expect(world.stats.get(id)!.sources.filter((s) => s.id.startsWith("item:"))).toHaveLength(0);
  });

  it("sell → undo returns to the precise pre-sell gold + inventory", () => {
    cover("econ-undo-sell");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, POWER)).toBe("ok");
    commitShopSession(world, id); // fresh session so the sell is the only undoable
    const beforeSell = snap(world, id);

    const refund = Math.floor(POWER_COST * SELL_REFUND);
    expect(sellItem(world, id, 0)).toBe(true);
    expect(world.champion.get(id)!.gold).toBe(beforeSell.gold + refund);
    expect(world.champion.get(id)!.items[0]).toBeNull();

    expect(undoShopAction(world, id)).toBe("ok");
    expect(snap(world, id)).toEqual(beforeSell); // exact reversal of the floored refund
  });

  it("reverses the FLOORED refund exactly, so an odd price nets zero over a full round-trip", () => {
    cover("econ-undo-floor-exact");
    const { world, id } = makeWorld();
    const start = snap(world, id);
    // floor(303 * 0.4) = floor(121.2) = 121 — a re-derived reversal must match
    expect(Math.floor(ODD_COST * SELL_REFUND)).toBe(121);

    expect(buyItem(world, id, ODD)).toBe("ok");
    expect(sellItem(world, id, 0)).toBe(true);
    // net after buy+sell is a strict LOSS, never a gain
    expect(world.champion.get(id)!.gold).toBe(start.gold - ODD_COST + 121);
    expect(world.champion.get(id)!.gold).toBeLessThan(start.gold);

    expect(undoShopAction(world, id)).toBe("ok"); // undo the sell
    expect(undoShopAction(world, id)).toBe("ok"); // undo the buy
    expect(snap(world, id)).toEqual(start); // exactly back — not a coin off
  });
});

describe("buy → sell is a real loss, and undo cannot recover more than was spent", () => {
  it("buy → sell loses the 60% (no free money from the round-trip)", () => {
    cover("econ-buysell-loss");
    const { world, id } = makeWorld();
    const start = world.champion.get(id)!.gold;
    expect(buyItem(world, id, POWER)).toBe("ok");
    expect(sellItem(world, id, 0)).toBe(true);
    const after = world.champion.get(id)!.gold;
    // exactly the floored 40% came back; 60% is gone
    expect(after).toBe(start - POWER_COST + Math.floor(POWER_COST * SELL_REFUND));
    expect(start - after).toBe(POWER_COST - Math.floor(POWER_COST * SELL_REFUND)); // 720
  });

  it("buy → sell → undo → undo returns to EXACT start; N cycles never increase gold", () => {
    cover("econ-no-arbitrage-cycle");
    const { world, id } = makeWorld();
    const start = snap(world, id);
    let peak = start.gold;

    for (let n = 0; n < 25; n++) {
      expect(buyItem(world, id, POWER)).toBe("ok"); // -1200
      peak = Math.max(peak, world.champion.get(id)!.gold);
      expect(sellItem(world, id, 0)).toBe(true); // +480
      peak = Math.max(peak, world.champion.get(id)!.gold);
      expect(undoShopAction(world, id)).toBe("ok"); // undo sell: -480, own item
      peak = Math.max(peak, world.champion.get(id)!.gold);
      expect(undoShopAction(world, id)).toBe("ok"); // undo buy: +1200, own nothing
      peak = Math.max(peak, world.champion.get(id)!.gold);
      // back to the exact start after every full cycle
      expect(snap(world, id)).toEqual(start);
    }
    // gold NEVER rose above the starting purse at any point in any cycle
    expect(peak).toBe(start.gold);
  });

  it("repeating the SINGLE buy→sell→undo (of the sell) can never climb above start", () => {
    cover("econ-no-arbitrage-partial");
    const { world, id } = makeWorld();
    const start = world.champion.get(id)!.gold;
    // buy once, then oscillate sell→undo forever; the exploit hunt is: does gold
    // ever exceed `start`? It must not — the item was paid for and stays paid.
    expect(buyItem(world, id, POWER)).toBe("ok");
    let peak = world.champion.get(id)!.gold;
    for (let n = 0; n < 50; n++) {
      expect(sellItem(world, id, 0)).toBe(true);
      peak = Math.max(peak, world.champion.get(id)!.gold);
      expect(undoShopAction(world, id)).toBe("ok"); // reverses the sell only
      peak = Math.max(peak, world.champion.get(id)!.gold);
    }
    expect(peak).toBeLessThan(start); // stuck at a loss forever, never a profit
    expect(peak).toBe(start - POWER_COST + Math.floor(POWER_COST * SELL_REFUND));
  });
});

describe("an action can be undone at most once (task #121)", () => {
  it("undoing past the history is a no-op that takes no gold", () => {
    cover("econ-undo-once");
    const { world, id } = makeWorld();
    const start = snap(world, id);
    expect(buyItem(world, id, POWER)).toBe("ok");

    expect(undoShopAction(world, id)).toBe("ok");
    expect(snap(world, id)).toEqual(start);
    // a SECOND undo has nothing to reverse — it cannot re-refund the same buy
    expect(undoShopAction(world, id)).toBe("nothing-to-undo");
    expect(snap(world, id)).toEqual(start); // gold unchanged, no double refund
    // …and a third, and a fourth
    expect(undoShopAction(world, id)).toBe("nothing-to-undo");
    expect(snap(world, id)).toEqual(start);
  });

  it("committing the session (combat start) drops the undo history", () => {
    cover("econ-undo-commit");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, POWER)).toBe("ok");
    const committed = snap(world, id); // own the item, gold spent

    commitShopSession(world, id); // enterCombat does this each round

    // the purchase can no longer be reversed — nothing to undo after commit
    expect(undoShopAction(world, id)).toBe("nothing-to-undo");
    expect(snap(world, id)).toEqual(committed);
  });

  it("a stat-tick bought through the shop COMMITS the session, clearing the prior buy's undo", () => {
    cover("econ-undo-statcommit");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, POWER)).toBe("ok");
    // a stat-tick COMMITS the session (it mutates the very streak an item-undo
    // would restore), so the earlier weapon buy can no longer be undone
    expect(buyItem(world, id, STAT_TICK_ITEM_ID)).toBe("ok");
    const after = snap(world, id);
    expect(undoShopAction(world, id)).toBe("nothing-to-undo");
    expect(snap(world, id)).toEqual(after);
  });
});

describe("undo restores the stat-streak a buy reset (task #121)", () => {
  it("a buy 歸零s the streak; undo puts it back EXACTLY", () => {
    cover("econ-undo-statstreak");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    // build a 5-tick streak, then a fresh session so the buy is the only undoable
    for (let i = 0; i < 5; i++) expect(buyStatUpgrade(world, id).result).toBe("ok");
    expect(champ.statStacks).toBe(5);
    commitShopSession(world, id);
    const beforeBuy = snap(world, id);

    expect(buyItem(world, id, POWER)).toBe("ok");
    expect(champ.statStacks, "a real weapon buy zeroes the streak").toBe(0);

    expect(undoShopAction(world, id)).toBe("ok");
    expect(champ.statStacks, "undo restores the exact streak the buy destroyed").toBe(5);
    expect(snap(world, id)).toEqual(beforeBuy);
  });
});
