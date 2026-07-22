/**
 * ai-build-path: the Tier-0 bot walks its champion's buildPriority instead of
 * re-buying entry #1 every replan, and the authored ladders stay executable
 * (whitelisted ids, ascending cost, within the inventory).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import type { ItemId } from "@ggd/shared/ids";
import { nextBuildPurchase } from "./Tier0Brain";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

const COSTS: Record<string, number> = {
  boots: 600,
  blade: 1100,
  core: 3450,
};
const costOf = (id: ItemId): number | null => COSTS[id] ?? null;
const BUILD = ["boots", "blade", "core"] as ItemId[];
const empty = (): (ItemId | null)[] => Array<ItemId | null>(INVENTORY_SLOTS).fill(null);

describe("build-path stepping (ai-build-path)", () => {
  it("buys the first affordable entry when nothing is owned", () => {
    expect(nextBuildPurchase(BUILD, empty(), 600, costOf)).toBe("boots");
    expect(nextBuildPurchase(BUILD, empty(), 599, costOf)).toBeNull(); // saves
  });

  // THE REGRESSION: without the owned-check this returned "boots" forever, so
  // a bot ended the match holding exactly one item (and for the unique boots
  // the server rejected every repeat buy).
  it("skips what it already owns and advances up the ladder", () => {
    const owned = empty();
    owned[0] = "boots" as ItemId;
    expect(nextBuildPurchase(BUILD, owned, 5000, costOf)).toBe("blade");
    owned[1] = "blade" as ItemId;
    expect(nextBuildPurchase(BUILD, owned, 5000, costOf)).toBe("core");
    owned[2] = "core" as ItemId;
    expect(nextBuildPurchase(BUILD, owned, 99999, costOf)).toBeNull(); // build done
  });

  it("saves for the next rung rather than skipping ahead to a later one", () => {
    const owned = empty();
    owned[0] = "boots" as ItemId;
    // 1100 short of `blade`; every later entry is dearer, so buy nothing
    expect(nextBuildPurchase(BUILD, owned, 1099, costOf)).toBeNull();
  });

  // BUILD TOLERANCE (task #70). MatchController drops a `buyItem` for a
  // non-whitelisted item before the sim sees it, so a blocked rung can never
  // become "owned". Without the predicate the loop returns that same rung on
  // every replan and the bot buys NOTHING for the rest of the match — the
  // arena item model made this live, because godie-i003 聖光石 sits in seven
  // starter builds and is excluded from the shop (it has no modifiers at all;
  // its whole payload is an unported active).
  it("SKIPS a rung it is not allowed to buy instead of stalling on it forever", () => {
    cover("ai-build-tolerance");
    const canBuy = (id: ItemId): boolean => id !== "blade";
    const owned = empty();
    owned[0] = "boots" as ItemId;
    // the old behaviour: "blade" forever. The new behaviour: climb past it.
    expect(nextBuildPurchase(BUILD, owned, 5000, costOf, canBuy)).toBe("core");
    // and with no predicate the pre-whitelist behaviour is unchanged
    expect(nextBuildPurchase(BUILD, owned, 5000, costOf)).toBe("blade");
  });

  it("a blocked rung does not consume the gold saved for a later one", () => {
    cover("ai-build-tolerance");
    const canBuy = (id: ItemId): boolean => id !== "blade";
    const owned = empty();
    owned[0] = "boots" as ItemId;
    // 3449g: `core` is still out of reach and `blade` is blocked -> save.
    expect(nextBuildPurchase(BUILD, owned, 3449, costOf, canBuy)).toBeNull();
  });

  it("buys nothing when the inventory is full or the item is unknown", () => {
    const full = Array<ItemId | null>(INVENTORY_SLOTS).fill("filler" as ItemId);
    expect(nextBuildPurchase(BUILD, full, 99999, costOf)).toBeNull();
    expect(nextBuildPurchase(["ghost"] as ItemId[], empty(), 99999, costOf)).toBeNull();
  });

  it("a full run of an ascending ladder ends with distinct items, never a repeat", () => {
    const owned = empty();
    const bought: ItemId[] = [];
    for (let i = 0; i < 20; i++) {
      const next = nextBuildPurchase(BUILD, owned, 99999, costOf);
      if (next === null) break;
      owned[owned.indexOf(null)] = next;
      bought.push(next);
    }
    expect(bought).toEqual(["boots", "blade", "core"]);
    expect(new Set(bought).size).toBe(bought.length);
  });
});

describe("authored starter ladders are executable (ai-build-path)", () => {
  // the 13 demo starter champions — 12 from task #47, plus godie-e00q, who
  // joined in task #55 and only got a real ladder afterwards (she shipped on
  // the two-item roster placeholder, so her bot stalled at 1100g).
  const STARTERS = [
    "godie-e001", "godie-e008", "godie-edem", "godie-h01u",
    "godie-hart", "godie-hpb1", "godie-o02p", "godie-etyr",
    "godie-h020", "godie-n003", "godie-o00k", "godie-ofar",
    "godie-e00q",
  ];

  beforeAll(async () => {
    registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  });

  it("every starter build is non-trivial, ascending, distinct and slot-sized", () => {
    for (const id of STARTERS) {
      const def = Champions.get(id as never);
      const build = def.buildPriority;
      expect(build.length, `${id} still has a placeholder build`).toBeGreaterThan(2);
      expect(build.length, `${id} exceeds the inventory`).toBeLessThanOrEqual(INVENTORY_SLOTS);
      expect(new Set(build).size, `${id} repeats an item`).toBe(build.length);

      // CLIMBABLE, which is what ASCENDING used to be a proxy for.
      //
      // The old gate required buildPriority to be sorted by cost, because with
      // a continuous price ladder an out-of-order rung made the bot skip ahead
      // to a cheaper, worse item instead of saving. Task #82 removed the
      // ladder: there are exactly two prices and gold-efficiency is FLAT
      // between them, so "buy the 300g one now and the 1200g one next round"
      // is not a mistake — it is the intended play. Sortedness is therefore no
      // longer meaningful, and asserting it would only pin the authoring order
      // of content/champions, which this task does not own.
      //
      // What still has to hold is that the bot never STALLS: given the real
      // match income it eventually owns every rung it is allowed to buy. 0g
      // rungs are draft-only legendaries (they lost their price when
      // 「傳說的武器道具，只能隨機三選一」 landed) and are skipped, not bought.
      // A SHOP rung is priced AND effective — the same S1/S3 shape the
      // curation layer uses. godie-i003 聖光石 sits in seven starter ladders
      // and is an S3 casualty (its whole payload is an unported 500 HP heal),
      // so it keeps its imported price and is skipped by the whitelist in a
      // real match; it is not part of the two-price contract.
      const isShopRung = (i: ItemId): boolean => {
        const d = Items.get(i);
        return d.cost > 0 && ((d.modifiers?.length ?? 0) > 0 || d.passive !== undefined);
      };
      const rungs = (build as ItemId[]).filter(isShopRung);
      expect(rungs.length, `${id} has no purchasable rung left`).toBeGreaterThanOrEqual(2);
      for (const i of rungs) {
        expect([300, 1200], `${id} rung ${i} is off the two-price ladder`).toContain(Items.get(i).cost);
      }

      const costOfReal = (i: ItemId): number | null => Items.tryGet(i)?.cost ?? null;
      const owned: (ItemId | null)[] = Array<ItemId | null>(INVENTORY_SLOTS).fill(null);
      let spent = 0;
      // the deterministic shop-open cumulative purse, round by round
      for (const purse of [600, 1350, 3850, 4850, 6100, 7600]) {
        let buy = nextBuildPurchase(build as ItemId[], owned, purse - spent, costOfReal);
        while (buy !== null) {
          owned[owned.indexOf(null)] = buy;
          spent += Items.get(buy).cost;
          buy = nextBuildPurchase(build as ItemId[], owned, purse - spent, costOfReal);
        }
      }
      for (const i of rungs) {
        expect(owned, `${id}'s bot never reached rung ${i} — its ladder stalls`).toContain(i);
      }
    }
  });

  it("a 0g draft reward on a ladder is SKIPPED, never bought for free", () => {
    // The regression this guards: `gold >= 0` is always true, so a legendary
    // that lost its price would otherwise be the bot's first purchase every
    // single game — and, being refused by the sim, would be re-issued forever.
    const legendary = "godie-i04v" as ItemId; // 正義之杖, draft-only
    const shopItem = "godie-i06c" as ItemId; // 恐龍之斧, POWERFUL 1200g
    const realCost = (i: ItemId): number | null => Items.tryGet(i)?.cost ?? null;
    expect(Items.get(legendary).cost).toBe(0);
    expect(nextBuildPurchase([legendary, shopItem], [null, null], 5000, realCost)).toBe(shopItem);
    expect(nextBuildPurchase([legendary], [null, null], 5000, realCost)).toBeNull();
  });
});
