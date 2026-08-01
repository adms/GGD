/**
 * Content-whitelist enforcement (wl-01..wl-10). The platform serves the
 * operator-curated whitelist; the GAME-SERVER is the authority that enforces
 * it. Covered here:
 *   - the Whitelist value object + bypass/allow-all (wl-01)
 *   - fetchWhitelist fail-safe on unreachable / bad platform (wl-02)
 *   - fetchWhitelist parses a good doc into an enforced whitelist (wl-03)
 *   - SELECT_CHAMPION rejects a non-whitelisted champion with a reason (wl-04)
 *   - the RANDOM/bot champion pool is filtered to the whitelist (wl-05)
 *   - autoPickAndSpawn only ever spawns whitelisted champions (wl-06)
 *   - the shop catalogue: non-whitelisted buyItem is dropped before the sim (wl-07)
 *   - the item draft/loot offers are filtered to the whitelist (wl-08)
 *   - GGD_WHITELIST_BYPASS / allow-all disables all filtering (wl-09)
 *   - empty whitelist: bots fall back so the match still runs; humans rejected (wl-10)
 *   - the ability whitelist gates the per-hero EX unlock (wl-11)
 *   - the DEMO STARTER SET is actually playable end-to-end (wl-12)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, type ChampionId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, Items, LootTables } from "@ggd/shared/sim/content/registry";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "../match/arenaRules";
import { HumanDriver } from "../seat/HumanDriver";
import { Whitelist, fetchWhitelist, WhitelistCache, type WhitelistDoc } from "./whitelist";

const FAST = { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Skeleton content = champions {sela, thorne}, items {ember-rod, ironhide-vest,
 * serrated-edge, swift-boots}, loot table "round-reward". */
function newController(wl: Whitelist, specs: SeatSpec[] = allBots()): MatchController {
  registerSkeletonContent();
  return new MatchController("m-wl", 1234, specs, FAST, 3, DEFAULT_ARENA_RULES, undefined, wl);
}

function tickUntil(ctl: MatchController, phase: string, maxTicks = 20000): void {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase).toBe(phase);
}

const doc = (over: Partial<WhitelistDoc>): WhitelistDoc => ({
  version: 1,
  champions: [],
  items: [],
  abilities: [],
  ...over,
});

// ---------------------------------------------------------------------------

describe("Whitelist value object (wl-01)", () => {
  it("enforces membership, and bypass/allow-all allows everything", () => {
    cover("wl-value-object");
    const wl = new Whitelist(doc({ champions: ["sela"], items: ["swift-boots"], abilities: ["sela.ex"] }), false);
    expect(wl.bypass).toBe(false);
    expect(wl.allowsChampion("sela")).toBe(true);
    expect(wl.allowsChampion("thorne")).toBe(false);
    expect(wl.allowsItem("swift-boots")).toBe(true);
    expect(wl.allowsItem("ember-rod")).toBe(false);
    expect(wl.allowsAbility("sela.ex")).toBe(true);
    expect(wl.filterChampions(["sela", "thorne"])).toEqual(["sela"]);
    expect(wl.filterItems(["swift-boots" as ItemId, "ember-rod" as ItemId])).toEqual(["swift-boots"]);

    const all = Whitelist.allowAll();
    expect(all.bypass).toBe(true);
    expect(all.allowsChampion("anything")).toBe(true);
    expect(all.filterChampions(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("fetchWhitelist fail-safe (wl-02)", () => {
  it("bypass never touches the network and returns allow-all", async () => {
    cover("wl-fetch-failsafe");
    let called = 0;
    const wl = await fetchWhitelist("http://platform:8080", {
      bypass: true,
      fetchImpl: (async () => {
        called++;
        return new Response("{}");
      }) as typeof fetch,
    });
    expect(called).toBe(0);
    expect(wl.bypass).toBe(true);
  });

  it("an unreachable platform fails SAFE to allow-all (never bricks the match)", async () => {
    const wl = await fetchWhitelist("http://platform:8080", {
      bypass: false,
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
    });
    expect(wl.bypass).toBe(true);
    expect(wl.allowsChampion("sela")).toBe(true);
  });

  it("a 500 or malformed body also fails safe to allow-all", async () => {
    const bad500 = await fetchWhitelist("http://p", {
      bypass: false,
      fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch,
    });
    expect(bad500.bypass).toBe(true);

    const badJson = await fetchWhitelist("http://p", {
      bypass: false,
      fetchImpl: (async () => new Response("<html>not json</html>", { status: 200 })) as typeof fetch,
    });
    expect(badJson.bypass).toBe(true);
  });
});

describe("fetchWhitelist parses an enforced doc (wl-03)", () => {
  it("a good 200 doc yields an ENFORCED whitelist (even when empty)", async () => {
    cover("wl-fetch-enforced");
    const fetchImpl = (async () =>
      new Response(JSON.stringify(doc({ champions: ["sela"], items: ["swift-boots"] })), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const wl = await fetchWhitelist("http://platform:8080/", { bypass: false, fetchImpl });
    expect(wl.bypass).toBe(false);
    expect(wl.allowsChampion("sela")).toBe(true);
    expect(wl.allowsChampion("thorne")).toBe(false);

    // A successfully-fetched EMPTY doc is still enforced (fresh-install state).
    const empty = await fetchWhitelist("http://p", {
      bypass: false,
      fetchImpl: (async () => new Response(JSON.stringify(doc({})), { status: 200 })) as typeof fetch,
    });
    expect(empty.bypass).toBe(false);
    expect(empty.allowsChampion("sela")).toBe(false);
  });

  it("WhitelistCache shares one fetch within the TTL window", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify(doc({ champions: ["sela"] })), { status: 200 });
    }) as typeof fetch;
    const cache = new WhitelistCache("http://p", 10_000, { bypass: false, fetchImpl });
    const a = await cache.get(1000);
    const b = await cache.get(2000);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    // After the TTL it re-fetches.
    await cache.get(1000 + 20_000);
    expect(calls).toBe(2);
  });
});

describe("SELECT_CHAMPION rejection (wl-04)", () => {
  it("rejects a non-whitelisted champion with reason 'not-whitelisted'", () => {
    cover("wl-select-reject");
    const ctl = newController(new Whitelist(doc({ champions: ["sela"] }), false));
    const seat = asSeatId(0);

    expect(ctl.selectChampion(seat, "sela")).toEqual({ ok: true });
    expect(ctl.selectChampion(seat, "thorne")).toEqual({ ok: false, reason: "not-whitelisted" });
    expect(ctl.selectChampion(seat, "does-not-exist")).toEqual({ ok: false, reason: "unknown-champion" });
    expect(ctl.selectChampion(asSeatId(99), "sela")).toEqual({ ok: false, reason: "no-seat" });

    // wrong phase once champ-select is over
    tickUntil(ctl, "intermission");
    expect(ctl.selectChampion(seat, "sela")).toEqual({ ok: false, reason: "wrong-phase" });
  });

  it("allow-all accepts any real champion (dev/bypass)", () => {
    const ctl = newController(Whitelist.allowAll());
    expect(ctl.selectChampion(asSeatId(0), "thorne")).toEqual({ ok: true });
  });
});

describe("random/bot pool filtering (wl-05, wl-06)", () => {
  it("randomChampionPool is restricted to the whitelist", () => {
    cover("wl-random-pool");
    const only = newController(new Whitelist(doc({ champions: ["thorne"] }), false));
    expect(only.randomChampionPool().sort()).toEqual(["thorne"]);

    const both = newController(new Whitelist(doc({ champions: ["sela", "thorne"] }), false));
    expect(both.randomChampionPool().sort()).toEqual(["sela", "thorne"]);
  });

  it("every auto-picked (bot) champion is whitelisted", () => {
    cover("wl-random-spawn");
    const ctl = newController(new Whitelist(doc({ champions: ["thorne"] }), false));
    tickUntil(ctl, "intermission"); // triggers autoPickAndSpawn
    for (const seat of ctl.seats.values()) {
      expect(seat.championId).toBe("thorne");
      expect(seat.entityId).not.toBeNull();
    }
  });
});

describe("shop catalogue enforcement (wl-07)", () => {
  it("drops a non-whitelisted buyItem before it reaches the sim; allows a whitelisted one", () => {
    cover("wl-shop-filter");
    // whitelist champion so the match spawns; allow ONLY swift-boots in the shop
    const ctl = newController(new Whitelist(doc({ champions: ["sela"], items: ["swift-boots"] }), false));
    // #261: this is the WHITELIST guard — it must prove the whitelist filters a
    // buy, which needs a buyable weapon. The 暫時下架 shelf is a SEPARATE gate
    // with its own guard (shopShelf.test.ts), so it is opened here rather than
    // letting it mask what this test is actually about.
    ctl.world.weaponShelfOpen = true;
    tickUntil(ctl, "intermission");

    const seatId = asSeatId(0);
    const seat = ctl.seats.get(seatId)!;
    const entity = seat.entityId as EntityId;
    // afford anything
    ctl.world.champion.get(entity)!.gold = 9000;

    const driver = new HumanDriver();
    seat.setDriver(driver);
    ctl.tick(); // land the driver swap at the tick boundary

    // try to buy a NON-whitelisted item -> filtered out, never purchased
    driver.mailbox.push({ seq: 1, commands: [{ kind: "buyItem", itemId: "ember-rod" }] });
    ctl.tick();
    expect(ctl.world.champion.get(entity)!.items).not.toContain("ember-rod");

    // buy the WHITELISTED item -> goes through
    driver.mailbox.push({ seq: 2, commands: [{ kind: "buyItem", itemId: "swift-boots" }] });
    ctl.tick();
    expect(ctl.world.champion.get(entity)!.items).toContain("swift-boots");
  });
});

describe("draft/loot offer filtering (wl-08)", () => {
  it("weapon-draft offers only ever contain whitelisted items", () => {
    cover("wl-offer-filter");
    // allow every champion; allow ONLY swift-boots among the loot items.
    // Own rules object (fresh rounds Map) so we never mutate the shared
    // DEFAULT_ARENA_RULES const — a weapon draft on round 1 generates an offer.
    registerSkeletonContent();
    const rules: ArenaRules = {
      ...DEFAULT_ARENA_RULES,
      rounds: new Map([[1, { weaponLootTable: "round-reward" }]]),
    };
    const wl = new Whitelist(doc({ champions: ["sela", "thorne"], items: ["swift-boots"] }), false);
    const ctl = new MatchController("m-wl-offer", 7, allBots(), FAST, 3, rules, undefined, wl);
    tickUntil(ctl, "intermission");

    let sawOffer = false;
    for (const offer of ctl.offers.values()) {
      if (offer.kind !== "item") continue;
      sawOffer = true;
      for (const choice of offer.choices) expect(choice).toBe("swift-boots");
    }
    // whichever offers exist, none contain a non-whitelisted item
    expect(sawOffer || ctl.offers.size === 0).toBe(true);
  });
});

describe("bypass + empty-whitelist behavior (wl-09, wl-10)", () => {
  it("bypass disables all filtering", () => {
    cover("wl-bypass");
    const ctl = newController(Whitelist.allowAll());
    expect(ctl.randomChampionPool().sort()).toEqual(["sela", "thorne"]);
    expect(ctl.selectChampion(asSeatId(0), "thorne")).toEqual({ ok: true });
  });

  it("an ENFORCED empty whitelist: bots fall back so the match runs, humans are rejected", () => {
    cover("wl-empty");
    const ctl = newController(new Whitelist(doc({}), false)); // enforced, nothing enabled
    // human selection is rejected for every real champion
    expect(ctl.selectChampion(asSeatId(0), "sela")).toEqual({ ok: false, reason: "not-whitelisted" });
    expect(ctl.selectChampion(asSeatId(0), "thorne")).toEqual({ ok: false, reason: "not-whitelisted" });
    // but the RANDOM/bot pool fails safe to the full pool (never an empty pool
    // that would crash spawning)
    expect(ctl.randomChampionPool().length).toBeGreaterThan(0);
    tickUntil(ctl, "intermission");
    for (const seat of ctl.seats.values()) expect(seat.entityId).not.toBeNull();
  });
});

describe("ability whitelist gates EX unlock (wl-11)", () => {
  const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
  let exChampion: string | undefined;
  let exAbility: string | undefined;

  beforeAll(async () => {
    // Full content tree gives champions that actually have a per-hero EX skill
    // (the skeleton has none). Pick the first such champion.
    const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(result.store);
    for (const id of Champions.ids()) {
      const def = Champions.get(id);
      if (def.exAbility) {
        exChampion = id;
        exAbility = def.exAbility;
        break;
      }
    }
  });

  // EX unlocks on the FIRST intermission (round 1) so the test is fast.
  const EX_RULES = (): ArenaRules => ({ ...DEFAULT_ARENA_RULES, exUnlockRound: 1 });

  function runToRound1(wl: Whitelist): MatchController {
    const ctl = new MatchController("m-wl-ex", 99, allBots(), FAST, 10, EX_RULES(), undefined, wl);
    let n = 0;
    while (!(ctl.phase.phase === "intermission" && ctl.phase.round === 1) && n < 20000) {
      ctl.tick();
      n++;
    }
    expect(ctl.phase.phase).toBe("intermission");
    expect(ctl.phase.round).toBe(1);
    return ctl;
  }

  it("a whitelisted champion whose EX is NOT whitelisted does not unlock EX; whitelisting the EX unlocks it", () => {
    cover("wl-ex-gate");
    expect(exChampion, "content tree must have a champion with an EX ability").toBeDefined();

    // champion enabled, EX ability NOT enabled -> EX stays locked at round 5.
    const noEx = runToRound1(new Whitelist(doc({ champions: [exChampion!] }), false));
    for (const seat of noEx.seats.values()) {
      if ((noEx.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const ab = noEx.world.abilities.get(seat.entityId!)!;
      if (ab.exSlot) expect(ab.exSlot.rank).toBe(0);
    }

    // champion + its EX ability enabled -> EX unlocks (rank 1).
    const withEx = runToRound1(
      new Whitelist(doc({ champions: [exChampion!], abilities: [exAbility!] }), false),
    );
    let unlocked = 0;
    for (const seat of withEx.seats.values()) {
      if ((withEx.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const ab = withEx.world.abilities.get(seat.entityId!)!;
      if (ab.exSlot && seat.championId === exChampion) {
        expect(ab.exSlot.rank).toBe(1);
        unlocked++;
      }
    }
    expect(unlocked).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------------
// wl-starter-playable: the DEMO STARTER SET makes a fresh install playable.
//
// Cross-language guard. The bundle's single source of truth is Go
// (apps/platform/internal/curation/starter.go); this test parses those id lists
// out of the Go source and runs them through the SAME enforcement the live
// game-server applies. If the Go bundle drifts to a champion/item the TS
// content registry cannot resolve, or that the whitelist filter starves, this
// fails — which is exactly the "seeded install is dead on arrival" bug the
// starter set exists to prevent.
// --------------------------------------------------------------------------
describe("demo starter set is playable (wl-starter-playable)", () => {
  const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
  const STARTER_GO = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../platform/internal/curation/starter.go",
  );

  /** Pull one `name = []string{ "a", "b" }` block's quoted ids out of the Go source. */
  function goList(src: string, name: string): string[] {
    const start = src.indexOf(`${name} = []string{`);
    if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
    const open = src.indexOf("{", start);
    const close = src.indexOf("\n\t}", open);
    if (close < 0) throw new Error(`could not find the end of ${name} in starter.go`);
    // Drop `//` line comments FIRST: the per-entry annotations are prose and can
    // themselves contain quoted words (e.g. folded her away as a "duplicate"),
    // which the id regex would otherwise scrape in as bogus elements.
    const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  }

  let starterChampions: string[] = [];
  let starterItems: string[] = [];
  let starterShopItems: string[] = [];
  let starterDraftItems: string[] = [];
  let starterServiceItems: string[] = [];
  let starterLegendaryItems: string[] = [];
  let starterAbilities: string[] = [];

  beforeAll(async () => {
    const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(result.store);
    const src = readFileSync(STARTER_GO, "utf-8");
    starterChampions = goList(src, "starterChampions");
    // The bundle's item half is declared as FOUR surfaces (task #70 drew the
    // first two, task #82 split LEGENDARY out of the shop and added SERVICES),
    // and the whitelist gates their union. LEGENDARY must stay in the union
    // even though nothing there is purchasable, or the round-2/5 cards starve.
    //
    // ⚠️ owner 2026-08-01 — THE UNION HAS DUPLICATES NOW. 6 craftRole-"quest"
    // items are on the DRAFT surface and in the 49-entry 棱彩 pool at once, so
    // this concat is 76 long and the SET behind it is 70. Go's `StarterSet()`
    // runs the same concat through `union()`, which sorts and dedupes, so the
    // served doc carries each id once — every comparison against a filtered
    // catalogue below must therefore compare SETS, not arrays.
    starterShopItems = goList(src, "starterShopItems");
    starterDraftItems = goList(src, "starterDraftItems");
    starterServiceItems = goList(src, "starterServiceItems");
    starterLegendaryItems = goList(src, "starterLegendaryItems");
    starterItems = [
      ...starterShopItems,
      ...starterServiceItems,
      ...starterLegendaryItems,
      ...starterDraftItems,
    ];
    // abilities are DERIVED in Go (champions x {q,w,e,r,ex}) — mirror that here.
    starterAbilities = starterChampions.flatMap((id) =>
      ["q", "w", "e", "r", "ex"].map((slot) => `${id}.${slot}`),
    );
  });

  it("every starter champion + item resolves in the real content registry", () => {
    cover("wl-starter-playable");
    expect(starterChampions.length).toBeGreaterThanOrEqual(12);
    // The shop is FINAL crafted weapons only (owner rule 1, task #70) MINUS
    // whatever the 棱彩 pool claims (owner 2026-08-01), a much sharper shelf
    // than the old cost-filtered 70. `>= 20` was the July shelf's size; the
    // property worth holding is that the shelf still outnumbers the 6 slots a
    // build has to fill, i.e. it is a shop and not a fixed loadout.
    expect(starterShopItems.length).toBeGreaterThan(INVENTORY_SLOTS);
    expect(starterDraftItems.length).toBeGreaterThanOrEqual(6);
    expect(starterLegendaryItems.length).toBeGreaterThanOrEqual(6);
    // This used to assert `starterItems.length === sum of the four` — true by
    // construction (it IS the concat) and therefore untestable. Re-aimed at the
    // thing that is NOT free: how much the union collapses, i.e. exactly which
    // ids sit on two surfaces. Pinned id-for-id, so a seventh overlap fails.
    const twice = starterItems.filter((id, i) => starterItems.indexOf(id) !== i).sort();
    expect(twice, "an id is on two starter surfaces that owner did not put there").toEqual(
      [
        "godie-i004", // 至尊魔戒   ┐
        "godie-i00z", // 四魂之玉   │ quest items owner named into the 49-entry
        "godie-i01n", // 天堂之劍   │ 棱彩 pool on 2026-08-01, while owner rule 2
        "godie-i01s", // 仙后座     │ 「所有任務道具」 keeps them on the DRAFT
        "godie-i06j", // 獸人船長十字鎬 │ surface too.
        "godie-i06n", // 老衲的棒子 ┘
      ].sort(),
    );
    expect(new Set(starterItems).size).toBe(starterItems.length - twice.length);
    for (const id of starterChampions) {
      expect(Champions.tryGet(id as ChampionId), `champion ${id} is not in the registry`).toBeDefined();
    }
    for (const id of starterItems) {
      expect(Items.tryGet(id as ItemId), `item ${id} is not in the registry`).toBeDefined();
    }
  });

  it("the whitelist offers EXACTLY the seeded content and nothing else", () => {
    cover("wl-starter-playable");
    const wl = new Whitelist(
      doc({ champions: starterChampions, items: starterItems, abilities: starterAbilities }),
      false,
    );

    // Champions: the full roster filters down to exactly the seeded 12, and a
    // non-seeded champion is rejected.
    const allowed = wl.filterChampions([...Champions.ids()]);
    expect([...allowed].sort()).toEqual([...starterChampions].sort());
    const excluded = [...Champions.ids()].find((id) => !starterChampions.includes(id));
    expect(excluded, "roster must be larger than the starter set").toBeDefined();
    expect(wl.allowsChampion(excluded!)).toBe(false);

    // Items: same, over the whole catalogue — as a SET on both sides. The
    // whitelist is a membership test, so its output can only ever be a subset of
    // the catalogue with no repeats; the seeded side is a concat of four
    // surfaces that owner 2026-08-01 made overlap on 6 quest ids. Comparing the
    // raw arrays measured "does the Go source repeat an id", which is pinned
    // exactly in the resolves-in-the-registry test above and is NOT what this
    // assertion is for.
    //
    // ⚠️ WHAT THIS DOES AND DOES NOT CATCH — measured, not assumed. `wl` is
    // BUILT from `starterItems`, so "the whitelist offers nothing else" is true
    // by construction and cannot fail here; appending a real catalogue id to the
    // seeded union leaves this test green (verified 2026-08-01). What DOES bite
    // is the other direction: a seeded id that resolves to no content item never
    // comes back out of `filterItems`, so a typo or a deleted doc in starter.go
    // fails here. The "and nothing else" half lives where the surfaces are
    // DERIVED from the content tree instead of read from Go —
    // `curation/arenaItemModel.test.ts`, where shop == the FINAL set minus the
    // 棱彩 pool and draft == the quest set, both pinned as equalities.
    const allowedItems = wl.filterItems([...Items.ids()] as ItemId[]);
    expect([...allowedItems].sort()).toEqual([...new Set(starterItems)].sort());
    const notSeeded = [...Items.ids()].find((id) => !starterItems.includes(id));
    expect(notSeeded, "the catalogue must be larger than the starter set").toBeDefined();
    expect(wl.allowsItem(notSeeded!)).toBe(false);

    // Abilities: every seeded champion's EX is enabled (the only gated slot),
    // so no champion is half-enabled.
    for (const id of starterChampions) {
      const def = Champions.get(id as ChampionId);
      expect(def.exAbility, `champion ${id} declares no EX`).toBeTruthy();
      expect(wl.allowsAbility(def.exAbility!), `EX of ${id} is not enabled`).toBe(true);
    }
  });

  it("a match seeded with only the starter set actually runs and spawns", () => {
    cover("wl-starter-playable");
    const wl = new Whitelist(
      doc({ champions: starterChampions, items: starterItems, abilities: starterAbilities }),
      false,
    );
    const ctl = new MatchController("m-wl-starter", 4242, allBots(), FAST, 3, DEFAULT_ARENA_RULES, undefined, wl);

    // The bot/RANDOM pool is non-empty and drawn only from the seeded set.
    const pool = ctl.randomChampionPool();
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) expect(starterChampions).toContain(id);

    // Every seat spawns with a seeded champion — no fallback to the full roster.
    tickUntil(ctl, "intermission");
    for (const seat of ctl.seats.values()) {
      expect(seat.entityId).not.toBeNull();
      expect(starterChampions).toContain(seat.championId!);
    }
  });

  it("BOTH weapon-draft rounds can still roll a card (each table survives the filter)", () => {
    cover("wl-starter-playable");
    const wl = new Whitelist(doc({ items: starterItems }), false);
    // Both weapon-draft rounds (2 and 5) roll legendary-weapons as of
    // 2026-07-31; quest-rewards is checked here too since it's still real,
    // shipped content a future round could point weaponLootTable at again.
    // MatchController SKIPS the grant when nothing survives the filter, so an
    // under-seeded bundle makes the card silently give the player NOTHING.
    for (const id of ["quest-rewards", "legendary-weapons"]) {
      const table = LootTables.tryGet(id);
      expect(table, `${id} loot table must exist`).toBeTruthy();
      const survivors = table!.entries.filter((e) => wl.allowsItem(e.itemId));
      expect(survivors.length, `${id} is starved by the whitelist`).toBeGreaterThan(0);
      // and the offer itself must be able to fill a 3-choose-1
      expect(survivors.length, `${id} cannot fill a 3-choose-1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the draft surface is exactly the quest-rewards table, and is unbuyable", () => {
    cover("wl-starter-playable");
    const table = LootTables.get("quest-rewards");
    expect([...table.entries.map((e) => e.itemId)].sort()).toEqual([...starterDraftItems].sort());
    // Every draft card grants something, and none of them is purchasable —
    // that is what makes the free card worth more than the gold it saves.
    for (const id of starterDraftItems) {
      const def = Items.get(id as ItemId);
      expect(def.cost, `${id} (${def.name}) is buyable — it belongs in the shop`).toBe(0);
      // A draft item is a QUEST item (owner rule 2), not "an item with stats".
      // Four quest items (仙后座/戰旗/復仇之袍/惡魔吉他) carry only an active item@1
      // cannot express yet (#56); 「所有任務道具」 still requires them draftable,
      // so no effect gate here — the craftRole marker IS the membership rule.
      expect(
        (def as { craftRole?: string }).craftRole,
        `${id} (${def.name}) is not a quest item`,
      ).toBe("quest");
      expect(starterShopItems, `${id} is on both surfaces`).not.toContain(id);
    }
  });

  it("the legendary surface is exactly the legendary-weapons table, and is UNBUYABLE", () => {
    cover("wl-starter-playable");
    // 「傳說的武器道具，只能隨機三選一」 (task #82). Before this, all 29 of these
    // were ALSO in starterShopItems — 29 of 29 — so every legendary in the game
    // could simply be bought. The rule is now structural: they are their own
    // surface, whitelisted so the round-2/5 cards and the 傳說寶玉 can offer them,
    // and priced at 0 so nothing can sell them.
    //
    // owner 2026-08-01 grew the pool 24 → 49 and zeroed the 25 of them that
    // still carried a shop price. 16 of those 25 stayed in `starterShopItems`
    // until this batch pulled them — this assertion is what caught it, and it is
    // deliberately stated over the WHOLE list rather than a sample.
    const table = LootTables.get("legendary-weapons");
    expect([...table.entries.map((e) => e.itemId)].sort()).toEqual([...starterLegendaryItems].sort());
    for (const id of starterLegendaryItems) {
      const def = Items.get(id as ItemId);
      expect(def.cost, `${id} (${def.name}) is directly purchasable — legendaries are draft-only`).toBe(0);
      expect(
        (def.modifiers?.length ?? 0) > 0 || def.passive !== undefined,
        `${id} (${def.name}) would grant NOTHING when drafted`,
      ).toBe(true);
      expect(starterShopItems, `${id} is on both the shop and legendary surfaces`).not.toContain(id);
    }
  });

  it("the two shop services are whitelisted, or the shop lists no mechanics at all", () => {
    cover("wl-starter-playable");
    expect([...starterServiceItems].sort()).toEqual(["legendary-orb", "stat-attunement"]);
    const wl = new Whitelist(doc({ items: starterItems }), false);
    for (const id of starterServiceItems) {
      expect(Items.tryGet(id as ItemId), `service ${id} has no content doc`).toBeDefined();
      expect(wl.allowsItem(id), `service ${id} is not whitelisted`).toBe(true);
    }
  });
});
