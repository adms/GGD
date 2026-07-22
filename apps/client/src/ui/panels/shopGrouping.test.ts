/**
 * The shop's shelves — 「依照功能性來群組排列，群組內則用金錢少到多排列」.
 *
 * Two claims are pinned here and they are the whole request: the grouping is
 * FUNCTIONAL (and specifically not `tags`, which is 97% the single useless
 * value `wc3-import`), and within a shelf the order is cheapest first.
 *
 * The last test runs against the REAL catalogue on disk, because a taxonomy
 * that works on hand-written fixtures and dumps 200 items into 其他 has not
 * actually grouped anything.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Items } from "@ggd/shared/sim/content/registry";
import { groupCatalogue, shelfOf, type ShelfItem } from "./shopGrouping";

const item = (over: Partial<ShelfItem> & { id: string }): ShelfItem => ({
  name: over.id,
  cost: 100,
  tags: ["wc3-import"],
  ...over,
});

describe("shelfOf", () => {
  it("routes each stat to the shelf a player would look on", () => {
    cover("shop-grouping");
    expect(shelfOf(item({ id: "a", modifiers: [{ stat: "ad" }] }))).toBe("offense");
    expect(shelfOf(item({ id: "b", modifiers: [{ stat: "lifesteal" }] }))).toBe("offense");
    expect(shelfOf(item({ id: "c", modifiers: [{ stat: "ap" }] }))).toBe("magic");
    expect(shelfOf(item({ id: "d", modifiers: [{ stat: "manaRegen" }] }))).toBe("magic");
    expect(shelfOf(item({ id: "e", modifiers: [{ stat: "armor" }] }))).toBe("defense");
    expect(shelfOf(item({ id: "f", modifiers: [{ stat: "maxHealth" }] }))).toBe("defense");
    expect(shelfOf(item({ id: "g", modifiers: [{ stat: "ms" }] }))).toBe("mobility");
  });

  it("puts a multi-stat item where MOST of its stats point", () => {
    cover("shop-grouping");
    // two defensive stats against one offensive one: it is a defensive item
    const bruiser = item({ id: "x", modifiers: [{ stat: "ad" }, { stat: "maxHealth" }, { stat: "armor" }] });
    expect(shelfOf(bruiser)).toBe("defense");
    // a 1-1 split resolves by declared order, so it never depends on key order
    const split = item({ id: "y", modifiers: [{ stat: "maxHealth" }, { stat: "ad" }] });
    expect(shelfOf(split)).toBe("offense");
  });

  it("gives the economy's ACTIONS their own shelf instead of burying them", () => {
    cover("shop-grouping");
    // task #82's mechanics: an orb you gamble on and a repeatable stat purchase
    // are not equipment, and a player who never notices them never uses them
    expect(shelfOf(item({ id: "orb", tags: ["gacha"] }))).toBe("service");
    expect(shelfOf(item({ id: "path", tags: ["stat-path"] }))).toBe("service");
    expect(shelfOf(item({ id: "svc", tags: ["shop-service"] }))).toBe("service");
    // …and the tag wins even when the item also carries stats
    expect(shelfOf(item({ id: "both", tags: ["gacha"], modifiers: [{ stat: "ad" }] }))).toBe("service");
  });

  it("separates 'does something' from 'does nothing we can read'", () => {
    cover("shop-grouping");
    // a passive with no stat line still has an effect — its own shelf
    expect(shelfOf(item({ id: "p", passive: { kind: "onhit" } }))).toBe("utility");
    // nothing at all: this is the broken-data case the codex surfaces
    expect(shelfOf(item({ id: "q" }))).toBe("misc");
    // an unrecognised stat must not silently become 攻擊
    expect(shelfOf(item({ id: "r", modifiers: [{ stat: "notAStat" }] }))).toBe("misc");
  });
});

describe("groupCatalogue", () => {
  it("sorts CHEAPEST FIRST inside every shelf", () => {
    cover("shop-grouping");
    const shelves = groupCatalogue([
      item({ id: "pricey", cost: 900, modifiers: [{ stat: "ad" }] }),
      item({ id: "cheap", cost: 100, modifiers: [{ stat: "ad" }] }),
      item({ id: "mid", cost: 400, modifiers: [{ stat: "ad" }] }),
    ]);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]!.items.map((i) => i.id)).toEqual(["cheap", "mid", "pricey"]);
  });

  it("orders equal-cost items stably, so the shelf never reshuffles on re-render", () => {
    cover("shop-grouping");
    const a = groupCatalogue([
      item({ id: "b", cost: 100, modifiers: [{ stat: "ad" }] }),
      item({ id: "a", cost: 100, modifiers: [{ stat: "ad" }] }),
    ]);
    expect(a[0]!.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("drops empty shelves rather than printing a header over nothing", () => {
    cover("shop-grouping");
    const shelves = groupCatalogue([item({ id: "only", modifiers: [{ stat: "ad" }] })]);
    expect(shelves.map((s) => s.id)).toEqual(["offense"]);
  });

  it("puts every item on exactly one shelf — no duplicates, nothing dropped", () => {
    cover("shop-grouping");
    const input = [
      item({ id: "1", modifiers: [{ stat: "ad" }] }),
      item({ id: "2", modifiers: [{ stat: "ap" }] }),
      item({ id: "3", tags: ["gacha"] }),
      item({ id: "4" }),
    ];
    const flat = groupCatalogue(input).flatMap((s) => s.items.map((i) => i.id));
    expect(flat.sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("actually classifies the REAL catalogue instead of dumping it in 其他", () => {
    cover("shop-grouping");
    const all = Items.all() as unknown as ShelfItem[];
    if (all.length === 0) return; // whitelist-empty environments have nothing to check
    const shelves = groupCatalogue(all);
    const total = shelves.reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(all.length); // conservation: nothing lost, nothing doubled

    // The point of the exercise. `tags` would have produced ONE shelf; the stat
    // vocabulary has to produce several, and 其他 must not swallow the shop.
    expect(shelves.length).toBeGreaterThan(2);
    const misc = shelves.find((s) => s.id === "misc")?.items.length ?? 0;
    expect(misc).toBeLessThan(all.length * 0.75);

    // and cheapest-first has to hold on real prices, not just fixtures
    for (const shelf of shelves) {
      const costs = shelf.items.map((i) => i.cost);
      expect(costs, `${shelf.id} not ascending`).toEqual([...costs].sort((a, b) => a - b));
    }
  });
});
