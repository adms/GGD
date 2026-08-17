/**
 * 傳說寶玉 — the legendary roll trigger (task #82).
 *
 * The headline behaviours, and why each is here:
 *  - it produces a legendary 3-choose-1 rather than a chosen item, because
 *    「傳說的武器道具，只能隨機三選一（購買也可傳說寶玉觸發而非直接購買）」;
 *  - it rolls on `world.rng`, so a replay of the same seed offers the same
 *    three cards (a Math.random here would desync every client);
 *  - IT NEVER CHARGES FOR NOTHING. Task #47 found the round-2/5 weapon cards
 *    silently granting nothing when whitelist filtering emptied the table.
 *    Doing that to a 2400g purchase would be theft, so the empty pool is a
 *    refusal with a reason and the gold is untouched. That is the single most
 *    important assertion in this file.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { LootTables, Items } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { buyItem } from "./shop";
import { buyLegendaryOrb, legendaryPool, purchasableSlots, releaseOrbSlot } from "./legendaryOrb";
import { LEGENDARY_ORB_ITEM_ID, LEGENDARY_ORB_PRICE, LEGENDARY_POOL_TABLE, STAT_TICK_ITEM_ID, legendaryShelfPrice } from "./itemTiers";

/** The four skeleton items stand in for the 29 shipped legendaries. */
const POOL: ItemId[] = ["ember-rod", "ironhide-vest", "serrated-edge", "swift-boots"] as ItemId[];

beforeAll(() => {
  registerSkeletonContent();
  Items.register(LEGENDARY_ORB_ITEM_ID, {
    id: LEGENDARY_ORB_ITEM_ID,
    name: "傳說寶玉",
    cost: LEGENDARY_ORB_PRICE,
    tier: 3,
    tags: [],
  });
  Items.register(STAT_TICK_ITEM_ID, {
    id: STAT_TICK_ITEM_ID,
    name: "能力屬性強化",
    cost: 375,
    tier: 1,
    tags: [],
  });
});

function armPool(entries: ItemId[]): void {
  LootTables.register(LEGENDARY_POOL_TABLE, { id: LEGENDARY_POOL_TABLE, entries: entries.map((itemId) => ({ itemId, weight: 1 })) });
}

afterEach(() => armPool(POOL));

function makeWorld(seed = 7): { world: SimWorld; id: EntityId } {
  armPool(POOL);
  const world = new SimWorld(SKELETON_ARENA, seed);
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
  world.champion.get(id)!.gold = 10_000;
  return { world, id };
}

describe("傳說寶玉 rolls a legendary 3-choose-1", () => {
  it("offers three distinct legendaries and charges the token price", () => {
    cover("orb-roll");
    const { world, id } = makeWorld();
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("ok");
    expect(roll.choices).toHaveLength(3);
    expect(new Set(roll.choices).size).toBe(3); // without replacement
    for (const c of roll.choices) expect(POOL).toContain(c);
    expect(world.champion.get(id)!.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
    // The item is NOT granted — the orb buys the CARD. The host turns the
    // event into an offer; picking is what grants.
    expect(world.champion.get(id)!.items.every((s) => s === null)).toBe(true);
    expect(world.events.filter((e) => e.type === "legendaryOrbRolled")).toHaveLength(1);
  });

  it("offers fewer than three when the pool is smaller, rather than repeating", () => {
    cover("orb-small-pool");
    const { world, id } = makeWorld();
    armPool(POOL.slice(0, 2));
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("ok");
    expect(roll.choices).toHaveLength(2);
    expect(new Set(roll.choices).size).toBe(2);
  });

  it("never offers a legendary the champion already holds", () => {
    cover("orb-excludes-owned");
    const { world, id } = makeWorld();
    world.champion.get(id)!.items[0] = POOL[0]!;
    world.champion.get(id)!.items[1] = POOL[1]!;
    const roll = buyLegendaryOrb(world, id);
    expect(roll.choices).not.toContain(POOL[0]);
    expect(roll.choices).not.toContain(POOL[1]);
  });
});

describe("the empty pool is SURFACED, never silently swallowed", () => {
  it("refuses the sale and charges NO gold when nothing is left to roll", () => {
    cover("orb-empty-pool");
    const { world, id } = makeWorld();
    armPool([]);
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("empty-pool");
    expect(roll.choices).toEqual([]);
    // THE ASSERTION. Task #47's failure mode was "take the action, grant
    // nothing, say nothing"; on a 2400g purchase that is theft.
    expect(world.champion.get(id)!.gold).toBe(10_000);
    expect(world.events.filter((e) => e.type === "legendaryOrbRolled")).toHaveLength(0);
  });

  it("treats a whitelist that allows no legendary as an empty pool, not an empty offer", () => {
    cover("orb-whitelist-empty");
    const { world, id } = makeWorld();
    world.itemEligible = () => false;
    expect(legendaryPool(world, id)).toEqual([]);
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("empty-pool");
    expect(world.champion.get(id)!.gold).toBe(10_000);
  });

  it("filters the pool BEFORE rolling, so a partial whitelist still offers", () => {
    cover("orb-whitelist-partial");
    const { world, id } = makeWorld();
    world.itemEligible = (itemId) => itemId === POOL[2];
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("ok");
    expect(roll.choices).toEqual([POOL[2]]);
  });

  it("refuses when the loot table itself is missing", () => {
    cover("orb-missing-table");
    const { world, id } = makeWorld();
    LootTables.clear();
    registerSkeletonContent();
    const roll = buyLegendaryOrb(world, id);
    expect(roll.result).toBe("empty-pool");
    expect(world.champion.get(id)!.gold).toBe(10_000);
  });
});

describe("orb refusals that are not about the pool", () => {
  it("refuses on insufficient gold without touching the purse", () => {
    cover("orb-no-gold");
    const { world, id } = makeWorld();
    world.champion.get(id)!.gold = LEGENDARY_ORB_PRICE - 1;
    expect(buyLegendaryOrb(world, id).result).toBe("no-gold");
    expect(world.champion.get(id)!.gold).toBe(LEGENDARY_ORB_PRICE - 1);
  });

  it("refuses on a full inventory — the roll must have somewhere to land", () => {
    cover("orb-no-slot");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    champ.items = champ.items.map(() => "ember-rod" as ItemId);
    expect(buyLegendaryOrb(world, id).result).toBe("no-slot");
    expect(champ.gold).toBe(10_000);
  });
});

describe("determinism", () => {
  it("the same seed offers the same three cards", () => {
    cover("orb-deterministic");
    const a = makeWorld(1234);
    const b = makeWorld(1234);
    expect(buyLegendaryOrb(a.world, a.id).choices).toEqual(buyLegendaryOrb(b.world, b.id).choices);
  });

  it("a different seed eventually offers a different order", () => {
    cover("orb-seed-sensitive");
    const orders = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { world, id } = makeWorld(seed);
      orders.add(buyLegendaryOrb(world, id).choices.join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("the orb is routed through buyItem like any other listing", () => {
  it("buying it by id rolls the card instead of taking an inventory slot", () => {
    cover("orb-via-buyitem");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, LEGENDARY_ORB_ITEM_ID)).toBe("ok");
    expect(world.champion.get(id)!.items.every((s) => s === null)).toBe(true);
    expect(world.events.filter((e) => e.type === "legendaryOrbRolled")).toHaveLength(1);
  });

  it("an empty pool surfaces through buyItem as a reason, not a silent no-op", () => {
    cover("orb-buyitem-empty-pool");
    const { world, id } = makeWorld();
    armPool([]);
    expect(buyItem(world, id, LEGENDARY_ORB_ITEM_ID)).toBe("empty-pool");
    expect(world.champion.get(id)!.gold).toBe(10_000);
  });
});

/**
 * THE RESERVATION. The orb checks for a slot when it ROLLS but only fills one
 * when the card is PICKED, and the shop is open the whole time in between. The
 * reservation is what stops that gap from voiding a 2400g purchase.
 */
describe("a rolled orb holds the slot its legendary will land in", () => {
  it("the last free slot cannot then be bought out from under the card", () => {
    cover("orb-slot-reserved");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    for (let i = 0; i < 5; i++) champ.items[i] = "ironhide-vest" as ItemId;

    expect(buyLegendaryOrb(world, id).result).toBe("ok");
    expect(champ.pendingOrbSlots).toBe(1);
    // one slot is physically empty, but it belongs to the unpicked card
    expect(buyItem(world, id, "ember-rod" as ItemId)).toBe("no-slot");
    expect(champ.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
  });

  it("a second orb is refused rather than overbooking the same slot", () => {
    cover("orb-no-overbook");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    for (let i = 0; i < 5; i++) champ.items[i] = "ironhide-vest" as ItemId;

    expect(buyLegendaryOrb(world, id).result).toBe("ok");
    expect(buyLegendaryOrb(world, id).result).toBe("no-slot");
    // and the refused orb charged nothing
    expect(champ.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
    expect(champ.pendingOrbSlots).toBe(1);
  });

  it("releasing gives the slot back, and a double release is harmless", () => {
    cover("orb-slot-released");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    for (let i = 0; i < 5; i++) champ.items[i] = "ironhide-vest" as ItemId;
    buyLegendaryOrb(world, id);

    releaseOrbSlot(world, id);
    expect(champ.pendingOrbSlots).toBe(0);
    releaseOrbSlot(world, id); // never goes negative — a freed slot stays freed
    expect(champ.pendingOrbSlots).toBe(0);
    expect(purchasableSlots(champ)).toBe(1);
    // ⚠️ 這個檔案把**四件骨架道具當成傳說池**（見 POOL），所以 2026-08-17 之後
    // 它們在商店裡是**寶具價**（傳說寶玉 × 倍率），⛔ 不是 `def.cost` 的 900。
    // 這一條驗的是「放掉的格子可以再買東西」這個機制，不是價格，所以直接補到
    // 買得起 —— 金額**推導**，⛔ 不寫字面值（倍率是後台旋鈕，隨時會被調）。
    champ.gold += legendaryShelfPrice(world.legendaryShelf.priceMultiplier);
    expect(buyItem(world, id, "ember-rod" as ItemId)).toBe("ok");
  });

  it("an unreserved champion can still spend every slot it has", () => {
    cover("orb-no-false-lockout");
    // The guard must not cost a slot to players who never touched the orb.
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    expect(purchasableSlots(champ)).toBe(6);
    // 同上：這裡驗的是「沒碰過寶玉的人六格都花得掉」，⛔ 不是價格。
    champ.gold = legendaryShelfPrice(world.legendaryShelf.priceMultiplier) * 6;
    for (let i = 0; i < 6; i++) expect(buyItem(world, id, "ember-rod" as ItemId)).toBe("ok");
    expect(champ.items.every((s) => s !== null)).toBe(true);
  });
});
