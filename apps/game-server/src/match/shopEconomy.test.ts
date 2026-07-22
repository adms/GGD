/**
 * The unified item economy, END TO END through the real MatchController and
 * the real content tree (task #82).
 *
 * The unit tests in packages/shared/src/sim/economy pin the rules; this file
 * pins the WIRING, which is where the two previous item-economy tasks actually
 * broke:
 *   - task #47: a weapon card that rolled nothing granted nothing and said
 *     nothing. The 傳說寶玉 must not be able to do that, and its offer has to
 *     reach `ctl.offers` where the pick/auto-pick machinery can see it.
 *   - the starting purse: every design document assumed 600g while the
 *     controller granted 500, so the turn-1 "two items or bank it" decision
 *     never existed in the running game.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items, LootTables } from "@ggd/shared/sim/content/registry";
import { buyItem } from "@ggd/shared/sim/economy/shop";
import { statPathView } from "@ggd/shared/sim/economy/statPath";
import {
  ITEM_TIER_PRICE,
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  LEGENDARY_POOL_TABLE,
  STAT_TICK_ITEM_ID,
  STAT_TICK_PRICE,
  STAT_TICK_TARGET,
  isShopService,
} from "@ggd/shared/sim/economy/itemTiers";
import { STARTING_GOLD } from "@ggd/shared/sim/economy/progression";
import { asSeatId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";
import { Whitelist } from "../curation/whitelist";
import { HumanDriver } from "../seat/HumanDriver";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

function spawnedMatch(seed = 31): MatchController {
  const ctl = new MatchController(`econ-${seed}`, seed, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
  let n = 0;
  while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
  expect(ctl.phase.phase).toBe("intermission");
  return ctl;
}

const firstEntity = (ctl: MatchController): EntityId =>
  [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId!;

/**
 * Take seat 0 over with a HUMAN driver and return a `buy(itemId)` that pushes a
 * real `buyItem` command down the real input path.
 *
 * Calling economy/shop.buyItem() directly would NOT do: the sim clears
 * `world.events` at the top of every step, so an event emitted outside a tick
 * is gone before the controller's drain ever sees it. The 傳說寶玉's whole
 * wiring is "sim rolls -> event -> host registers the offer", so testing it
 * from outside the tick would test nothing.
 */
function humanBuyer(ctl: MatchController): {
  entity: EntityId;
  buy: (itemId: string) => void;
  pick: (offerId: string) => void;
} {
  const seat = ctl.seats.get(asSeatId(0))!;
  const driver = new HumanDriver();
  seat.setDriver(driver);
  ctl.tick(); // driver swaps land at the tick boundary
  let seq = 0;
  return {
    entity: seat.entityId as EntityId,
    buy: (itemId: string) => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "buyItem", itemId }] });
      ctl.tick();
    },
    // picks ride the same `pickOffer` command a real client sends, so the
    // controller's own drain/resolve path is what the test exercises
    pick: (offerId: string) => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "pickOffer", offerId }] });
      ctl.tick();
    },
  };
}

describe("starting gold is 600, not 500", () => {
  it("every champion spawns able to buy exactly TWO SIMPLE items", () => {
    cover("econ-starting-gold");
    const ctl = new MatchController("econ-start", 9, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    let n = 0;
    // stop the moment champions exist, BEFORE the round-1 grant compounds it
    while ([...ctl.seats.values()].every((s) => s.entityId === null) && n++ < 500) ctl.tick();
    for (const seat of ctl.seats.values()) {
      const champ = ctl.world.champion.get(seat.entityId!)!;
      expect(champ.gold, "MatchController granted 500 until task #82").toBe(STARTING_GOLD);
      expect(Math.floor(champ.gold / ITEM_TIER_PRICE.SIMPLE)).toBe(2);
      expect(champ.gold).toBeLessThan(ITEM_TIER_PRICE.POWERFUL);
    }
  });
});

describe("傳說寶玉 → a real 3-choose-1 offer on the controller", () => {
  it("a purchased orb registers an offer the pick machinery can resolve", () => {
    cover("econ-orb-offer");
    const ctl = spawnedMatch();
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;

    buy(LEGENDARY_ORB_ITEM_ID);

    const orbOffers = [...ctl.offers.entries()].filter(([k]) => k.startsWith("orb:"));
    expect(orbOffers.length, "the orb rolled but no offer reached the controller").toBe(1);
    const [offerId, offer] = orbOffers[0]!;
    expect(offer.kind).toBe("item");
    expect(offer.choices.length).toBe(3);
    expect(champ.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
    // the ORB is consumed, not carried: it takes no inventory slot
    expect(champ.items).not.toContain(LEGENDARY_ORB_ITEM_ID);

    // every choice is a real legendary from the round-5 pool, and none of them
    // is purchasable — the orb bought the ROLL, never the item
    const pool = new Set(LootTables.get(LEGENDARY_POOL_TABLE).entries.map((e) => e.itemId));
    for (const c of offer.choices) {
      expect(pool.has(c as ItemId)).toBe(true);
      expect(Items.get(c as ItemId).cost).toBe(0);
    }
    expect(new Set<string>(offer.choices as string[]).size).toBe(3);
    expect(offerId.startsWith("orb:")).toBe(true);
  });

  it("two orbs in one shopping phase are two cards, not one overwrite", () => {
    cover("econ-orb-two-cards");
    const ctl = spawnedMatch(77);
    const { entity, buy } = humanBuyer(ctl);
    ctl.world.champion.get(entity)!.gold = 10_000;
    buy(LEGENDARY_ORB_ITEM_ID);
    buy(LEGENDARY_ORB_ITEM_ID);
    expect([...ctl.offers.keys()].filter((k) => k.startsWith("orb:")).length).toBe(2);
    expect(ctl.world.champion.get(entity)!.gold).toBe(10_000 - 2 * LEGENDARY_ORB_PRICE);
  });

  it("an operator whitelist that enables no legendary refuses the sale, free of charge", () => {
    cover("econ-orb-whitelist-empty");
    // A whitelist that enables the ORB but NO legendary: the exact shape of
    // task #47's silent failure. The orb must refuse rather than take 2400g
    // and hand back nothing.
    const wl = new Whitelist(
      { version: 1, champions: [], items: ["ember-rod", LEGENDARY_ORB_ITEM_ID], abilities: [] },
      false,
    );
    const ctl = new MatchController("econ-wl", 5, allBots(), FAST, 3, DEFAULT_ARENA_RULES, undefined, wl);
    let n = 0;
    while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
    const { entity, buy } = humanBuyer(ctl);
    ctl.world.champion.get(entity)!.gold = 10_000;

    buy(LEGENDARY_ORB_ITEM_ID);

    expect(ctl.world.champion.get(entity)!.gold, "the orb charged for an empty pool").toBe(10_000);
    expect([...ctl.offers.keys()].filter((k) => k.startsWith("orb:")).length).toBe(0);
    // and it SAID SO — the refusal rides the same buyRejected channel the HUD
    // already renders, rather than vanishing.
    const rejects = ctl.world.events.filter((e) => e.type === "buyRejected");
    expect(rejects.map((e) => e.data.reason)).toContain("empty-pool");
  });

  it("the last free slot cannot be spent between the roll and the pick", () => {
    cover("econ-orb-slot-reserved");
    // THE THEFT WINDOW. `buyLegendaryOrb` checks for a free slot at PURCHASE
    // time, but the legendary only lands when the card is PICKED — and the
    // shop stays open in between. Buy the orb with one slot left, spend that
    // slot on a 300g item, and the pick has nowhere to land: `grantItemFree`
    // returns -1, `applyItemPick` returns false, and `applyPick` deletes the
    // offer regardless. 2400g gone, nothing granted — task #47's silent
    // failure wearing a different hat.
    const ctl = spawnedMatch(21);
    const { entity, buy, pick } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;

    // fill 5 of 6 slots, leaving exactly one
    for (let i = 0; i < 5; i++) champ.items[i] = "godie-i002" as ItemId;
    buy(LEGENDARY_ORB_ITEM_ID);
    expect(champ.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
    const orbOffers = [...ctl.offers.entries()].filter(([k]) => k.startsWith("orb:"));
    expect(orbOffers.length).toBe(1);

    // now spend the slot the legendary was going to land in
    buy("ember-rod");

    const [offerId] = orbOffers[0]!;
    pick(`${offerId}#0`);

    // The legendary must still be reachable: either the sale was refused, or
    // the pick lands. What must NEVER happen is 2400g charged for nothing.
    const ownsALegendary = champ.items.some(
      (s) => s !== null && LootTables.get(LEGENDARY_POOL_TABLE).entries.some((e) => e.itemId === s),
    );
    expect(ownsALegendary, "2400g was charged and no legendary was ever granted").toBe(true);
  });
});

describe("no legendary is directly purchasable, whatever the surface says", () => {
  it("the sim refuses a 0g item even when nothing filtered it out", () => {
    cover("econ-legendary-refused");
    const ctl = spawnedMatch(3);
    const entity = firstEntity(ctl);
    ctl.world.champion.get(entity)!.gold = 100_000;
    // This is the LAST line of defence: `gold >= 0` is always true, so a
    // legendary that leaked into any shop listing (a dev build with the
    // whitelist off, a hand-rolled buyItem command) would otherwise be free.
    for (const e of LootTables.get(LEGENDARY_POOL_TABLE).entries) {
      expect(buyItem(ctl.world, entity, e.itemId), `${e.itemId} was purchasable`).toBe("not-purchasable");
    }
    expect(ctl.world.champion.get(entity)!.items.every((s) => s === null)).toBe(true);
    expect(ctl.world.champion.get(entity)!.gold).toBe(100_000);
  });

  /**
   * The MIRROR of the rule above, against the REAL tree. A 0g legendary is
   * refused for having no price; these are refused for having no PAYLOAD.
   *
   * Three 1200g items ship inert today (出動怨念射手兵團, 出動正義射手兵團,
   * 和道一文字製作書 — two w3x summons and a recipe book, whose real payload is
   * an active `item@1` cannot express yet), and ~80 more sit at their raw
   * un-repriced w3x costs, up to 9,065g. `starter.go` whitelists none of them,
   * which is exactly the protection task #82 refused to rely on for 0g items.
   *
   * Derived from content rather than pinned to those ids: if #78 later gives
   * them real effects the list simply shrinks, and a shrink to empty is a PASS
   * because it means the tree is clean. The rule itself is proved
   * unconditionally against a synthetic item in
   * packages/shared/src/sim/economy/shop.test.ts.
   */
  it("the sim refuses a PRICED item that does nothing, however it was listed", () => {
    cover("econ-inert-refused-e2e");
    const ctl = spawnedMatch(4);
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 100_000;

    const inert = Items.all().filter(
      (d) => d.cost > 0 && !isShopService(d.id) && (d.modifiers?.length ?? 0) === 0 && (d.passive?.length ?? 0) === 0,
    );
    for (const d of inert) {
      expect(buyItem(ctl.world, entity, d.id), `${d.id} ${d.name} (${d.cost}g) was purchasable`).toBe("no-effect");
    }

    // …and through the REAL command path, so the reason reaches the HUD
    // channel rather than being swallowed (task #60).
    if (inert.length > 0) {
      buy(inert[0]!.id);
      const rejects = ctl.world.events.filter((e) => e.type === "buyRejected");
      expect(rejects.map((e) => e.data.reason)).toContain("no-effect");
    }

    expect(champ.gold, "an item with no effect took gold").toBe(100_000);
    expect(champ.items.every((s) => s === null), "an item with no effect took a slot").toBe(true);
  });
});

describe("the stat path, through the controller's own economy", () => {
  it("20 ticks are affordable on the real round grants and the fork is exclusive", () => {
    cover("econ-stat-path-e2e");
    const ctl = spawnedMatch(11);
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = STAT_TICK_PRICE * STAT_TICK_TARGET;
    // #104: the capstone is now withheld until round >= 6 (「大約是第五場之後」),
    // so exercise the grant at an eligible round rather than round 1.
    ctl.world.round = 6;

    // through the REAL command path: CommandSystem -> shopAccess -> buyItem
    for (let i = 0; i < STAT_TICK_TARGET; i++) buy(STAT_TICK_ITEM_ID);
    expect(champ.statStacks).toBe(STAT_TICK_TARGET);
    expect(champ.statCapstonePct).toBeGreaterThanOrEqual(10);
    expect(champ.statCapstonePct).toBeLessThanOrEqual(100);
    expect(champ.gold).toBe(0);
    // …and it cost every slot's worth of gold: the player owns no items.
    expect(champ.items.every((s) => s === null)).toBe(true);

    const view = statPathView(champ.statStacks, champ.statCapstonePct);
    expect(view.live).toBe(false);
    expect(view.remaining).toBe(0);
    expect(view.atRisk).toBe(0);
  });

  it("the shop-facing view warns about the stacks a purchase would destroy", () => {
    cover("econ-stat-path-view");
    const ctl = spawnedMatch(12);
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 100_000;
    for (let i = 0; i < 19; i++) buy(STAT_TICK_ITEM_ID);

    const view = statPathView(champ.statStacks, champ.statCapstonePct);
    expect(view.stacks).toBe(19);
    expect(view.remaining).toBe(1);
    expect(view.live).toBe(true);
    expect(view.atRisk, "the shop must be able to say 19 stacks are on the line").toBe(19);

    buy("ember-rod");
    expect(statPathView(champ.statStacks, champ.statCapstonePct).stacks).toBe(0);
    // the destruction is ANNOUNCED, so a HUD can say "19 stacks lost"
    expect(ctl.world.events.some((e) => e.type === "statPathReset" && e.data.lost === 19)).toBe(true);
  });
});
