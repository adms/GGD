/**
 * THE «you may never be charged for nothing» rule, both halves (task #82).
 *
 * `buyItem` has always refused a 0g item — 「傳說的武器道具，只能隨機三選一」 —
 * because `gold >= 0` is always true and a leaked legendary id would otherwise
 * be free. This file pins the MIRROR IMAGE, which that guard does not cover: an
 * item with a REAL tier price and NO payload.
 *
 * `item@1` can express exactly two payloads (`modifiers`, `passive`), so an
 * item carrying neither is inert BY CONSTRUCTION. Three ship at 1200g today —
 * 出動怨念射手兵團 and 出動正義射手兵團 (w3x summons) and 和道一文字製作書 (a
 * recipe book) — because their real payload is an ACTIVE the schema cannot hold
 * yet. Selling one is strictly worse than giving away a legendary: it takes
 * 1200g, eats one of six slots, attaches an empty modifier source, AND resets
 * the stat path, so a player at 19 stacks loses all 19 for a no-op.
 *
 * They are unreachable today only because `starter.go` does not whitelist them.
 * That is a MEMBERSHIP ACCIDENT, not an invariant — the identical shape of leak
 * the 0g guard exists to close (a dev build with the whitelist off, a
 * hand-rolled buyItem command, a bot's buildPriority). So the refusal belongs
 * in the sim, next to its twin.
 *
 * Everything here is a SYNTHETIC item on purpose: the rule must hold whatever
 * the content tree happens to contain, so it keeps testing something real even
 * if the three inert docs later gain effects. The real tree is checked end to
 * end in apps/game-server/src/match/shopEconomy.test.ts.
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
import { buyItem } from "./shop";
import { buyStatUpgrade } from "./statPath";
import { ITEM_TIER_PRICE, STAT_TICK_ITEM_ID, STAT_TICK_PRICE, itemHasEffect } from "./itemTiers";

/** A priced item with NO payload — the exact shape of the three w3x imports. */
const INERT = "test-inert-powerful" as ItemId;
/** The same price, with a payload: the control, so the test cannot pass by accident. */
const REAL = "test-real-powerful" as ItemId;

beforeAll(() => {
  registerSkeletonContent();
  Items.register(INERT, { id: INERT, name: "出動測試射手兵團", cost: ITEM_TIER_PRICE.POWERFUL, tier: 2, tags: [] });
  Items.register(REAL, {
    id: REAL,
    name: "測試巨劍",
    cost: ITEM_TIER_PRICE.POWERFUL,
    tier: 2,
    tags: [],
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 26 }],
  });
  Items.register(STAT_TICK_ITEM_ID, {
    id: STAT_TICK_ITEM_ID,
    name: "能力屬性強化",
    cost: STAT_TICK_PRICE,
    tier: 1,
    tags: [],
  });
});

function makeWorld(seed = 7, gold = 100_000): { world: SimWorld; id: EntityId } {
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
  world.champion.get(id)!.gold = gold;
  return { world, id };
}

describe("an item that does NOTHING is not for sale, whatever it costs", () => {
  it("refuses a priced item with neither modifiers nor a passive, taking nothing", () => {
    cover("econ-inert-refused");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;

    expect(buyItem(world, id, INERT)).toBe("no-effect");

    // Nothing moved: not the gold, not the slot, not the stat pipeline.
    expect(champ.gold, "an inert item was charged for").toBe(100_000);
    expect(champ.items.every((s) => s === null), "an inert item took a slot").toBe(true);
    expect(world.stats.get(id)!.sources.filter((s) => s.id.startsWith("item:")), "an EMPTY modifier source was attached")
      .toHaveLength(0);
  });

  it("is refused at every price, including one the champion cannot afford", () => {
    cover("econ-inert-refused");
    const { world, id } = makeWorld(8, 0);
    // The reason must be the PAYLOAD, not the purse — otherwise the item
    // becomes buyable the moment the player is rich, which is the bug.
    expect(buyItem(world, id, INERT)).toBe("no-effect");
    expect(world.champion.get(id)!.gold).toBe(0);
  });

  it("does NOT refuse the same price when the item actually does something", () => {
    cover("econ-inert-refused");
    const { world, id } = makeWorld();
    expect(buyItem(world, id, REAL)).toBe("ok");
    expect(world.champion.get(id)!.gold).toBe(100_000 - ITEM_TIER_PRICE.POWERFUL);
    expect(world.champion.get(id)!.items[0]).toBe(REAL);
  });

  it("still sells the two payload-free SHOP SERVICES — they are dispatched by id first", () => {
    cover("econ-inert-services-safe");
    const { world, id } = makeWorld();
    // 能力屬性強化 legitimately carries no modifiers (itemTiers.test.ts asserts
    // it MUST not), so a naive payload check placed above the service dispatch
    // would break the entire stat path. This is that regression.
    expect(itemHasEffect(Items.get(STAT_TICK_ITEM_ID)), "the fixture stopped being payload-free").toBe(false);
    expect(buyItem(world, id, STAT_TICK_ITEM_ID)).toBe("ok");
    expect(world.champion.get(id)!.statStacks).toBe(1);
  });
});

describe("the 19-stack consequence — why this is a REFUSAL and not a listing rule", () => {
  it("a no-op purchase can no longer destroy a 19-tick stat path", () => {
    cover("econ-inert-keeps-statpath");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    for (let i = 0; i < 19; i++) expect(buyStatUpgrade(world, id).result).toBe("ok");
    expect(champ.statStacks).toBe(19);

    expect(buyItem(world, id, INERT)).toBe("no-effect");

    // 「第 19 次時買了普通道具會怎樣 —— 歸零」 is the rule for a REAL weapon: you
    // trade the streak for stats. An inert item offers no stats to trade for,
    // so charging the streak for it is pure loss — 7,125g of ticks deleted by
    // an item that cannot even be felt.
    expect(champ.statStacks, "19 ticks were destroyed by an item that does nothing").toBe(19);
    expect(champ.gold).toBe(100_000 - STAT_TICK_PRICE * 19);

    // and the real weapon still resets it, exactly as before.
    expect(buyItem(world, id, REAL)).toBe("ok");
    expect(champ.statStacks).toBe(0);
  });
});
