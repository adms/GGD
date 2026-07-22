/**
 * codex-search / codex-filter / codex-virtualise: the pure browse layer.
 * Node env, no DOM — search, facet counts, ordering by hero 編號 and the
 * row-window math all run as plain functions over fabricated entries.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { normaliseAbility, normaliseChampion, normaliseItem } from "./codexData";
import {
  ALL,
  EMPTY_ABILITY_FILTER,
  EMPTY_CHAMPION_FILTER,
  EMPTY_ITEM_FILTER,
  NO_NUMBER,
  compareAbilities,
  compareChampions,
  compareHeroNumber,
  compareItems,
  enabledState,
  facets,
  filterAbilities,
  filterChampions,
  filterItems,
  heroNumberFacets,
  matchesEnabled,
  matchesQuery,
  rowWindow,
  scrollTopForRow,
} from "./codexSearch";
import type { CodexAbility, CodexChampion, CodexItem, CodexWhitelist } from "@ggd/shared/codex/codexTypes";

function item(id: string, name: string, over: Record<string, unknown> = {}): CodexItem {
  return normaliseItem({ id, name, cost: 100, tier: 2, tags: [], ...over }) as CodexItem;
}
function champ(id: string, name: string, num: string | null, role = "fighter"): CodexChampion {
  return normaliseChampion({
    id,
    name,
    role,
    attackType: "melee",
    abilities: num ? { Q: { id: `${id}.q`, name: `${num}-01 技`, slot: "Q" } } : {},
  }) as CodexChampion;
}
function ability(id: string, name: string, slot: string): CodexAbility {
  return normaliseAbility({ id, name, slot, castType: "self", maxRank: 1, cooldown: [1], manaCost: [0], range: 0, effects: [] }) as CodexAbility;
}

const NO_WL: CodexWhitelist = { enforced: false, champions: new Set(), items: new Set(), abilities: new Set() };
const WL: CodexWhitelist = {
  enforced: true,
  champions: new Set(["c1"]),
  items: new Set(["i1"]),
  abilities: new Set(["c1.q"]),
};

describe("codex search", () => {
  it("matches on every whitespace-separated token, CJK included", () => {
    cover("codex-search");
    const it1 = item("i1", "妖刀村正", { description: "吸血 25%" });
    expect(matchesQuery(it1, "")).toBe(true);
    expect(matchesQuery(it1, "村正")).toBe(true);
    expect(matchesQuery(it1, "I1")).toBe(true); // ascii is case-insensitive
    expect(matchesQuery(it1, "村正 吸血")).toBe(true); // AND, order-free
    expect(matchesQuery(it1, "村正 不存在")).toBe(false);
  });

  it("searches descriptions and stat names, not just the name", () => {
    cover("codex-search");
    const it1 = item("i1", "盾", { modifiers: [{ stat: "armor", op: "flat", value: 5 }] });
    expect(matchesQuery(it1, "armor")).toBe(true);
  });
});

describe("codex filters", () => {
  it("filters items by bucket and tier", () => {
    cover("codex-filter");
    const items = [
      item("i1", "劍", { tier: 4, modifiers: [{ stat: "ad", op: "flat", value: 1 }] }),
      item("i2", "劍製作書", { tier: 1 }),
    ];
    expect(filterItems(items, { ...EMPTY_ITEM_FILTER, bucket: "recipe-book" }, NO_WL).map((i) => i.id)).toEqual(["i2"]);
    expect(filterItems(items, { ...EMPTY_ITEM_FILTER, tier: "4" }, NO_WL).map((i) => i.id)).toEqual(["i1"]);
    expect(filterItems(items, EMPTY_ITEM_FILTER, NO_WL)).toHaveLength(2);
  });

  it("filters champions by role and hero 編號", () => {
    cover("codex-filter");
    const champs = [champ("c1", "王 - 甲", "20"), champ("c2", "乙", null, "marksman")];
    expect(filterChampions(champs, { ...EMPTY_CHAMPION_FILTER, role: "marksman" }, NO_WL).map((c) => c.id)).toEqual(["c2"]);
    expect(filterChampions(champs, { ...EMPTY_CHAMPION_FILTER, heroNumber: "20" }, NO_WL).map((c) => c.id)).toEqual(["c1"]);
    // the unnumbered bucket is selectable too
    expect(filterChampions(champs, { ...EMPTY_CHAMPION_FILTER, heroNumber: NO_NUMBER }, NO_WL).map((c) => c.id)).toEqual(["c2"]);
  });

  it("filters abilities by slot", () => {
    cover("codex-filter");
    const abils = [ability("c1.q", "20-01 甲", "Q"), ability("c1.ex", "20-002 乙", "EX")];
    expect(filterAbilities(abils, { ...EMPTY_ABILITY_FILTER, slot: "EX" }, NO_WL).map((a) => a.id)).toEqual(["c1.ex"]);
  });

  it("says 存在但未啟用 — and says 'unknown' when the platform is unreachable", () => {
    cover("codex-filter");
    expect(enabledState(WL, "champion", "c1")).toBe("enabled");
    expect(enabledState(WL, "champion", "c2")).toBe("disabled");
    expect(enabledState(NO_WL, "champion", "c1")).toBe("unknown");

    // an unknown state must never be filtered AWAY — that would silently empty
    // the codex on a dev machine with no platform running
    expect(matchesEnabled("unknown", "enabled")).toBe(true);
    expect(matchesEnabled("unknown", "disabled")).toBe(true);
    expect(matchesEnabled("disabled", "enabled")).toBe(false);
    expect(matchesEnabled("disabled", ALL)).toBe(true);
  });

  it("counts facets over the entries actually present", () => {
    cover("codex-filter");
    const champs = [champ("c1", "甲", "20"), champ("c2", "乙", "20"), champ("c3", "丙", null)];
    expect(heroNumberFacets(champs)).toEqual([
      { value: "20", count: 2 },
      { value: NO_NUMBER, count: 1 },
    ]);
    expect(facets(champs, (c) => c.role)).toEqual([{ value: "fighter", count: 3 }]);
  });
});

describe("codex ordering", () => {
  it("orders by hero 編號 with the unnumbered entries last", () => {
    cover("codex-search");
    expect(compareHeroNumber("09", "20")).toBeLessThan(0);
    expect(compareHeroNumber(NO_NUMBER, "99")).toBeGreaterThan(0);
    const champs = [champ("c3", "丙", null), champ("c2", "乙", "20"), champ("c1", "甲", "09")];
    expect([...champs].sort(compareChampions).map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("orders a hero's kit Q → W → E → R → EX", () => {
    cover("codex-search");
    const kit = [
      ability("c1.ex", "20-002 五", "EX"),
      ability("c1.r", "20-04 四", "R"),
      ability("c1.q", "20-01 一", "Q"),
    ];
    expect([...kit].sort(compareAbilities).map((a) => a.slot)).toEqual(["Q", "R", "EX"]);
  });

  it("orders items by tier then cost", () => {
    cover("codex-search");
    const items = [item("i2", "b", { tier: 4, cost: 900 }), item("i1", "a", { tier: 1, cost: 5000 })];
    expect([...items].sort(compareItems).map((i) => i.id)).toEqual(["i1", "i2"]);
  });
});

describe("codex virtualisation", () => {
  it("mounts only a viewport of rows out of 879", () => {
    cover("codex-virtualise");
    const win = rowWindow(0, 460, 46, 879);
    expect(win.start).toBe(0);
    expect(win.end).toBeLessThan(40); // ~10 visible + overscan, never 879
    expect(win.padTop).toBe(0);
    expect(win.padTop + (win.end - win.start) * 46 + win.padBottom).toBe(879 * 46);
  });

  it("keeps the scroll height invariant while scrolled into the middle", () => {
    cover("codex-virtualise");
    const win = rowWindow(4600, 460, 46, 879);
    expect(win.start).toBe(100 - 6); // overscan above
    expect(win.padTop).toBe(94 * 46);
    expect(win.padTop + (win.end - win.start) * 46 + win.padBottom).toBe(879 * 46);
  });

  it("degenerate inputs never produce a negative window", () => {
    cover("codex-virtualise");
    expect(rowWindow(0, 460, 46, 0)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
    expect(rowWindow(-50, 460, 46, 3).start).toBe(0);
    const tail = rowWindow(999_999, 460, 46, 3);
    expect(tail.start).toBeLessThanOrEqual(2);
    expect(tail.padBottom).toBeGreaterThanOrEqual(0);
  });

  it("clamps the jump-to-row offset to the scrollable range", () => {
    cover("codex-virtualise");
    expect(scrollTopForRow(0, 46, 879, 460)).toBe(0);
    expect(scrollTopForRow(10, 46, 879, 460)).toBe(460);
    expect(scrollTopForRow(878, 46, 879, 460)).toBe(879 * 46 - 460);
  });
});
