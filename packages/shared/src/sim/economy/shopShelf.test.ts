/**
 * shopShelf — 暫時下架 (#261), and THE SPLIT it must not break.
 *
 * owner: 「除了能力屬性強化、及傳說寶玉外，其他武器道具先全部暫時下架無法選擇，
 * 但隨機三選一仍然可以隨機到」.
 *
 * That is TWO rules, and each gets its own guard here:
 *
 *   SHELF CLOSED   `buyItem` refuses a normal weapon with `shelf-closed`, takes
 *                  no gold and occupies no slot; the two SERVICES still sell.
 *   DROP UNTOUCHED `offerItems` still rolls weapons, `grantItemFree` still
 *                  grants them and the 傳說寶玉 still rolls its pool — with the
 *                  shelf closed. If a future refactor ever routes a card through
 *                  `buyItem`, the drop half of this file goes red.
 *
 * The flag is REVERSIBLE by construction, and that is asserted too: opening
 * `world.weaponShelfOpen` restores the purchase with nothing else changed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { Items, LootTables } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { buyItem, grantItemFree, rollItemReward } from "./shop";
import { offerItems } from "./draft";
import { buyLegendaryOrb, legendaryPool } from "./legendaryOrb";
import { shelfListable, WEAPON_SHELF_OPEN } from "./shopShelf";
import {
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  LEGENDARY_POOL_TABLE,
  STAT_TICK_ITEM_ID,
  STAT_TICK_PRICE,
} from "./itemTiers";

/** A real, priced, effectful, final-role weapon — the thing being 下架'd. */
const WEAPON = "shelf-test-blade" as ItemId;
/** A free legendary the DROP path may still hand out. */
const LEGENDARY = "shelf-test-legendary" as ItemId;

beforeAll(() => {
  registerSkeletonContent();
  Items.register(WEAPON, {
    id: WEAPON,
    name: "下架測試劍",
    cost: 300,
    tier: 1,
    tags: [],
    craftRole: "final",
    modifiers: [{ stat: "ad", op: "flat", value: 6 }],
  } as never);
  Items.register(LEGENDARY, {
    id: LEGENDARY,
    name: "下架測試神器",
    cost: 0,
    tier: 3,
    tags: [],
    craftRole: "final",
    modifiers: [{ stat: "ad", op: "flat", value: 40 }],
  } as never);
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
  LootTables.register("shelf-test-pool", {
    id: "shelf-test-pool",
    entries: [{ itemId: WEAPON, weight: 1 }],
  });
  LootTables.register(LEGENDARY_POOL_TABLE, {
    id: LEGENDARY_POOL_TABLE,
    entries: [{ itemId: LEGENDARY, weight: 1 }],
  });
});

function makeWorld(gold = 100_000): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 11);
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

describe("the shelf is CLOSED (#261)", () => {
  it("ships closed — the flag is the whole switch", () => {
    cover("shelf-default-closed");
    expect(WEAPON_SHELF_OPEN).toBe(false);
    // …and a fresh world inherits it, so no host wiring is needed to honour it
    expect(new SimWorld(SKELETON_ARENA, 1).weaponShelfOpen).toBe(false);
  });

  it("refuses a normal weapon, and takes NEITHER gold NOR a slot", () => {
    cover("shelf-refuses-weapon");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    const goldBefore = champ.gold;
    expect(buyItem(world, id, WEAPON)).toBe("shelf-closed");
    expect(champ.gold, "a closed shelf must never charge").toBe(goldBefore);
    expect(champ.items.every((s) => s === null)).toBe(true);
    expect(champ.undoStack).toHaveLength(0);
  });

  it("still sells the two SERVICES — 「除了能力屬性強化、及傳說寶玉外」", () => {
    cover("shelf-services-open");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, STAT_TICK_ITEM_ID)).toBe("ok");
    expect(buyItem(world, id, LEGENDARY_ORB_ITEM_ID)).toBe("ok");
    expect(shelfListable(STAT_TICK_ITEM_ID)).toBe(true);
    expect(shelfListable(LEGENDARY_ORB_ITEM_ID)).toBe(true);
    expect(shelfListable(WEAPON)).toBe(false);
  });

  it("is REVERSIBLE: opening the shelf restores the purchase, unchanged", () => {
    cover("shelf-reversible");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, WEAPON)).toBe("shelf-closed");
    world.weaponShelfOpen = true;
    expect(buyItem(world, id, WEAPON)).toBe("ok");
    expect(world.champion.get(id)!.items[0]).toBe(WEAPON);
  });
});

describe("the DROP path is UNTOUCHED — 「隨機三選一仍然可以隨機到」", () => {
  it("a 3-choose-1 still offers the very weapon the shelf refuses", () => {
    cover("shelf-draft-unaffected");
    const { world, id } = makeWorld();
    expect(world.weaponShelfOpen).toBe(false);
    const offer = offerItems(world, id, "shelf-test-pool", 3);
    expect(offer.choices).toContain(WEAPON);
  });

  it("a FREE grant still lands it in the inventory", () => {
    cover("shelf-grant-unaffected");
    const { world, id } = makeWorld();
    expect(grantItemFree(world, id, WEAPON)).toBe(0);
    expect(world.champion.get(id)!.items[0]).toBe(WEAPON);
    // and the gacha reward path, which is the other free door
    expect(rollItemReward(world, id, "shelf-test-pool")).toBe(WEAPON);
  });

  it("the 傳說寶玉 still rolls its pool with the shelf shut", () => {
    cover("shelf-orb-unaffected");
    const { world, id } = makeWorld();
    expect(legendaryPool(world, id)).toContain(LEGENDARY);
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("ok");
    expect(roll.choices).toContain(LEGENDARY);
  });
});
