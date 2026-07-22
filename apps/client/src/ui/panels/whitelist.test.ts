/**
 * client-whitelist-*: the client half of the curation contract — apply the
 * operator whitelist to the champ-select roster and the shop, keep the
 * random pick inside the whitelist, drive the empty-state, and fall back to
 * "no filter" when the platform is unreachable (offline/dev).
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  NO_FILTER,
  applyChampionWhitelist,
  applyItemWhitelist,
  filterChampions,
  isChampRosterEmpty,
  pickRandomId,
  shopCatalogue,
  whitelistFromDoc,
  whitelistedChampionIds,
  type RosterChampion,
} from "./champSelectFilter";
import { __resetWhitelistCache, fetchWhitelist, whitelistForMatch } from "./whitelist";

const ROSTER: RosterChampion[] = [
  { id: "sela", name: "Sela, the Ember Sage", role: "mage" },
  { id: "thorne", name: "Thorne, the Bramble Knight", role: "bruiser" },
  { id: "godie-e002", name: "亞瑟王", role: "fighter" },
  { id: "godie-e003", name: "亞瑟王的騎士", role: "fighter" },
];

describe("whitelist doc parsing (client-whitelist-fetch)", () => {
  it("a successfully-read doc is ENFORCED even when empty", () => {
    cover("client-whitelist-fetch");
    const empty = whitelistFromDoc({ version: 1, champions: [], items: [], abilities: [] });
    expect(empty.enforced).toBe(true);
    expect(empty.champions.size).toBe(0);

    const some = whitelistFromDoc({ champions: ["sela"], items: ["godie-i000"], abilities: ["x.q"] });
    expect(some.enforced).toBe(true);
    expect(some.champions.has("sela")).toBe(true);
    expect(some.items.has("godie-i000")).toBe(true);
  });

  it("garbage / partial docs degrade to NO_FILTER, never throw", () => {
    cover("client-whitelist-fetch");
    expect(whitelistFromDoc(null).enforced).toBe(false);
    expect(whitelistFromDoc("nope").enforced).toBe(false);
    // non-string junk in an array is dropped
    expect([...whitelistFromDoc({ champions: [1, "sela", null] }).champions]).toEqual(["sela"]);
  });
});

describe("filter application (client-whitelist-filter)", () => {
  it("champions: enforced whitelist restricts the roster; NO_FILTER passes all", () => {
    cover("client-whitelist-filter");
    const wl = whitelistFromDoc({ champions: ["sela", "godie-e002"] });
    expect(applyChampionWhitelist(ROSTER, wl).map((c) => c.id)).toEqual(["sela", "godie-e002"]);
    expect(applyChampionWhitelist(ROSTER, NO_FILTER).map((c) => c.id)).toEqual(ROSTER.map((c) => c.id));
  });

  it("search runs on TOP of the whitelisted set (existing behavior preserved)", () => {
    cover("client-whitelist-filter");
    const wl = whitelistFromDoc({ champions: ["godie-e002", "godie-e003"] });
    const available = applyChampionWhitelist(ROSTER, wl);
    // CJK search still works, but only within the whitelisted subset
    expect(filterChampions(available, "亞瑟").map((c) => c.id)).toEqual(["godie-e002", "godie-e003"]);
    expect(filterChampions(available, "ember")).toEqual([]); // sela not whitelisted
  });

  it("items: shop catalogue is restricted to whitelisted item ids", () => {
    cover("client-whitelist-filter");
    const items = [{ id: "godie-i000" }, { id: "godie-i001" }, { id: "ember-rod" }];
    const wl = whitelistFromDoc({ items: ["godie-i001"] });
    expect(applyItemWhitelist(items, wl).map((i) => i.id)).toEqual(["godie-i001"]);
    expect(applyItemWhitelist(items, NO_FILTER)).toHaveLength(3);
  });

  // REGRESSION: the shop used to intersect the whitelist with an `id` prefix
  // heuristic, so whitelisted items without a `godie-` prefix were unbuyable
  // while the AI kept buying them off buildPriority. The enforced whitelist is
  // the whole catalogue policy — no second filter may narrow it.
  it("items: an enforced whitelist admits non-godie ids (swift-boots/serrated-edge)", () => {
    cover("client-whitelist-filter");
    const catalogue = [{ id: "godie-i05t" }, { id: "swift-boots" }, { id: "serrated-edge" }];
    const wl = whitelistFromDoc({ items: catalogue.map((i) => i.id) });
    expect(shopCatalogue(catalogue, wl).map((i) => i.id)).toEqual([
      "godie-i05t",
      "swift-boots",
      "serrated-edge",
    ]);
  });

  it("items: unenforced (offline/dev) still hides skeleton demo items once imported ones load", () => {
    cover("client-whitelist-filter");
    const mixed = [{ id: "godie-i05t" }, { id: "ember-rod" }];
    expect(shopCatalogue(mixed, NO_FILTER).map((i) => i.id)).toEqual(["godie-i05t"]);
    // skeleton-only context (unit tests): fall back to the full list
    const skeletonOnly = [{ id: "ember-rod" }, { id: "swift-boots" }];
    expect(shopCatalogue(skeletonOnly, NO_FILTER)).toHaveLength(2);
  });
});

describe("empty-state (client-whitelist-empty)", () => {
  it("enforced + zero allowed champions triggers the empty-state", () => {
    cover("client-whitelist-empty");
    // an enforced whitelist that matches none of the roster
    const wl = whitelistFromDoc({ champions: ["not-in-roster"] });
    expect(isChampRosterEmpty(ROSTER, wl)).toBe(true);
  });

  it("a non-empty whitelist or NO_FILTER never shows the empty-state", () => {
    cover("client-whitelist-empty");
    expect(isChampRosterEmpty(ROSTER, whitelistFromDoc({ champions: ["sela"] }))).toBe(false);
    // NO_FILTER (offline/dev) shows the full roster, not the empty-state
    expect(isChampRosterEmpty(ROSTER, NO_FILTER)).toBe(false);
    // even an empty enforced whitelist against an EMPTY roster is not "broken"
    expect(isChampRosterEmpty([], NO_FILTER)).toBe(false);
  });
});

describe("random pick respects the whitelist (client-whitelist-random)", () => {
  const ids = ROSTER.map((c) => c.id);

  it("random only ever draws a whitelisted id", () => {
    cover("client-whitelist-random");
    const wl = whitelistFromDoc({ champions: ["godie-e002", "godie-e003"] });
    const pool = whitelistedChampionIds(ids, wl);
    expect(pool).toEqual(["godie-e002", "godie-e003"]);
    // exhaustively: every rng value maps to a whitelisted id
    for (let r = 0; r < 1; r += 0.05) {
      const pick = pickRandomId(pool, () => r);
      expect(wl.champions.has(pick!)).toBe(true);
    }
  });

  it("NO_FILTER draws from the full id set; an empty pool yields null", () => {
    cover("client-whitelist-random");
    expect(whitelistedChampionIds(ids, NO_FILTER)).toEqual(ids);
    const emptyWl = whitelistFromDoc({ champions: ["nobody"] });
    expect(pickRandomId(whitelistedChampionIds(ids, emptyWl), () => 0)).toBeNull();
  });
});

describe("fetch fallback (client-whitelist-fetch)", () => {
  it("HTTP error and network failure both resolve to NO_FILTER (offline-safe)", async () => {
    cover("client-whitelist-fetch");
    const notOk = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect((await fetchWhitelist("/x", notOk)).enforced).toBe(false);

    const boom = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await fetchWhitelist("/x", boom)).enforced).toBe(false);
  });

  it("a good response is parsed and enforced", async () => {
    cover("client-whitelist-fetch");
    const ok = vi.fn(
      async () => new Response(JSON.stringify({ champions: ["sela"], items: [], abilities: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const wl = await fetchWhitelist("/x", ok);
    expect(wl.enforced).toBe(true);
    expect(wl.champions.has("sela")).toBe(true);
  });

  it("whitelistForMatch memoises one fetch per matchId", async () => {
    cover("client-whitelist-fetch");
    __resetWhitelistCache();
    const p1 = whitelistForMatch("match-A");
    const p2 = whitelistForMatch("match-A");
    expect(p1).toBe(p2); // same in-flight promise reused for the same match
    await p1;
    const p3 = whitelistForMatch("match-B"); // different match → new fetch
    expect(p3).not.toBe(p1);
    __resetWhitelistCache();
  });
});
