/**
 * meta-client-*: champ-select meta progression (task #118) — the CLIENT model.
 * Favourites float to the top, an unlock result flips a champion from locked to
 * owned, and any load failure (no session / unreachable platform) degrades to
 * `available:false` so the champ-select keeps working offline.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CRYSTAL_UNLOCK_COST,
  applyWallet,
  canAfford,
  lockStateOf,
  loadWalletMeta,
  normalizeWallet,
  pricesFromCatalog,
  rosterDisplayAndSelectable,
  selectableByOwnership,
  selectableIdsByOwnership,
  sortFavouritesFirst,
  type MetaData,
  type MetaWallet,
  type WalletMetaDeps,
} from "./walletMeta";

const prices = (): Map<string, number> =>
  pricesFromCatalog({
    champions: [
      { id: "sela", price: 0 }, // free starter
      { id: "thorne", price: 4500 }, // priced (locked until unlocked)
      { id: "vex", price: 6000 },
    ],
  });

function data(over: Partial<MetaData> = {}): MetaData {
  return {
    crystal: 0,
    unlockCost: CRYSTAL_UNLOCK_COST,
    owned: new Set<string>(),
    favourites: new Set<string>(),
    prices: prices(),
    ...over,
  };
}

describe("champ-select meta: favourite sort (meta-client-favourite-sort)", () => {
  const roster = [{ id: "sela" }, { id: "thorne" }, { id: "vex" }, { id: "kai" }];

  it("floats favourited champions to the top, preserving relative order", () => {
    cover("meta-client-favourite-sort");
    const out = sortFavouritesFirst(roster, new Set(["vex", "sela"]));
    // favourites first in their ORIGINAL order (sela before vex), then the rest
    expect(out.map((c) => c.id)).toEqual(["sela", "vex", "thorne", "kai"]);
  });

  it("is a no-op ordering when nothing is favourited", () => {
    cover("meta-client-favourite-sort");
    expect(sortFavouritesFirst(roster, new Set()).map((c) => c.id)).toEqual(["sela", "thorne", "vex", "kai"]);
  });

  it("does not mutate the input list", () => {
    cover("meta-client-favourite-sort");
    const input = [...roster];
    sortFavouritesFirst(input, new Set(["kai"]));
    expect(input.map((c) => c.id)).toEqual(["sela", "thorne", "vex", "kai"]);
  });
});

describe("champ-select meta: lock state + unlock (meta-client-unlock)", () => {
  it("classifies owned / locked / free correctly", () => {
    cover("meta-client-unlock");
    const owned = new Set(["sela"]);
    expect(lockStateOf("sela", prices(), owned)).toBe("owned"); // free starter, seeded owned
    expect(lockStateOf("thorne", prices(), owned)).toBe("locked"); // priced, not owned
    expect(lockStateOf("ghost", prices(), owned)).toBe("free"); // unknown price → not locked
  });

  it("an unlock result flips the champion from locked to owned and spends crystals", () => {
    cover("meta-client-unlock");
    const before = data({ crystal: CRYSTAL_UNLOCK_COST + 20 });
    expect(lockStateOf("thorne", before.prices, before.owned)).toBe("locked");

    // the server returns the updated wallet: thorne now owned, crystals deducted
    const walletAfter: MetaWallet = {
      crystal: 20,
      crystalUnlockCost: CRYSTAL_UNLOCK_COST,
      ownedChampions: ["sela", "thorne"],
      favourites: [],
    };
    const after = applyWallet(before, walletAfter);

    expect(lockStateOf("thorne", after.prices, after.owned)).toBe("owned");
    expect(after.crystal).toBe(20);
    expect(after.prices).toBe(before.prices); // catalog carried across unchanged
  });

  it("affordability gates the unlock button at the flat crystal cost", () => {
    cover("meta-client-unlock");
    expect(CRYSTAL_UNLOCK_COST).toBe(300);
    expect(canAfford(CRYSTAL_UNLOCK_COST)).toBe(true);
    expect(canAfford(CRYSTAL_UNLOCK_COST - 1)).toBe(false);
  });

  it("a favourite result round-trips through applyWallet", () => {
    cover("meta-client-unlock");
    const after = applyWallet(data(), {
      crystal: 0,
      crystalUnlockCost: CRYSTAL_UNLOCK_COST,
      ownedChampions: [],
      favourites: ["vex"],
    });
    expect([...after.favourites]).toEqual(["vex"]);
  });
});

describe("champ-select meta: offline degradation (meta-client-degrade)", () => {
  const okDeps: WalletMetaDeps = {
    hasSession: () => true,
    fetchWallet: async () => ({
      crystal: 120,
      crystalUnlockCost: 250,
      ownedChampions: ["sela"],
      favourites: ["sela"],
    }),
    fetchPrices: async () => prices(),
  };

  it("loads crystal / owned / favourites / prices when the platform answers", async () => {
    cover("meta-client-degrade");
    const res = await loadWalletMeta(okDeps);
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.data.crystal).toBe(120);
      expect(res.data.owned.has("sela")).toBe(true);
      expect(res.data.favourites.has("sela")).toBe(true);
      expect(res.data.prices.get("thorne")).toBe(4500);
      expect(res.data.unlockCost).toBe(250);
    }
  });

  it("degrades to unavailable when there is no session (never calls the network)", async () => {
    cover("meta-client-degrade");
    let called = false;
    const res = await loadWalletMeta({
      hasSession: () => false,
      fetchWallet: async () => {
        called = true;
        return { crystal: 0, crystalUnlockCost: CRYSTAL_UNLOCK_COST, ownedChampions: [], favourites: [] };
      },
      fetchPrices: async () => new Map(),
    });
    expect(res.available).toBe(false);
    expect(called).toBe(false);
  });

  it("degrades to unavailable when the wallet fetch throws (platform unreachable)", async () => {
    cover("meta-client-degrade");
    const res = await loadWalletMeta({
      hasSession: () => true,
      fetchWallet: async () => {
        throw new Error("network down");
      },
      fetchPrices: async () => prices(),
    });
    expect(res.available).toBe(false);
  });

  it("★ 空的價格表是故障，不是「整排都免費」（2026-08-02 owner 回報的 🎲 症狀）", async () => {
    cover("meta-client-degrade");
    // 平台在內容沒掛的時候會回 200 + `{champions: []}`（EmptyCatalog —— 缺檔
    // 在那邊不是錯誤），所以**這條路不會丟例外**，上面那條 catch 分支接不到。
    //
    // 而 `lockStateOf` 對查不到價格的 id 一律回 "free"（逐隻是對的，整表是災難）：
    // 空表 → 每一隻都 free → `selectableIdsByOwnership` 退化成恆等函式 →
    // 🎲 從整個白名單抽。這正是 owner 說的「隨機英雄應該要隨機到能選的」。
    const res = await loadWalletMeta({
      ...okDeps,
      fetchPrices: async () => new Map(),
    });
    expect(res.available, "空價格表被當成正常回應 —— 🎲 會從整個白名單抽").toBe(false);
    if (!res.available) expect(res.ownership).toBe("unknown");
  });

  it("GUARD THE GUARD：非空的價格表仍然是 available（上一條不是把全部關掉）", async () => {
    cover("meta-client-degrade");
    const res = await loadWalletMeta(okDeps);
    expect(res.available).toBe(true);
  });

  it("normalizeWallet coerces missing / malformed fields to safe defaults", () => {
    cover("meta-client-degrade");
    expect(normalizeWallet(null)).toEqual({
      crystal: 0,
      crystalUnlockCost: CRYSTAL_UNLOCK_COST,
      ownedChampions: [],
      favourites: [],
    });
    expect(normalizeWallet({ crystal: -5, ownedChampions: ["a"] })).toEqual({
      crystal: 0,
      crystalUnlockCost: CRYSTAL_UNLOCK_COST,
      ownedChampions: ["a"],
      favourites: [],
    });
  });
});

// ---------------------------------------------------------------------------
// The unlock price is the SERVER's, not ours (2026-07-30). The owner asked for
// one flat 藍水晶 price for every champion, configurable in the admin console —
// which only means anything if the client stops printing its own copy of it.
//
// The direction that matters is the FALLBACK direction: a payload that omits
// the field must resolve to CRYSTAL_UNLOCK_COST, never 0. A 0 would render
// 「🔓 解鎖 (0 水晶)」 and make `canAfford` true for an empty wallet, i.e. the
// button would promise a free unlock and the server would answer 402.
describe("champ-select meta: the unlock price comes from the platform", () => {
  it("takes crystalUnlockCost off the payload, overriding the compiled-in fallback", () => {
    const w = normalizeWallet({ crystal: 0, crystalUnlockCost: 175, ownedChampions: [], favourites: [] });
    expect(w.crystalUnlockCost).toBe(175);
    expect(applyWallet(data(), w).unlockCost).toBe(175);
    // and affordability follows the live number, not the constant
    expect(canAfford(175, w.crystalUnlockCost)).toBe(true);
    expect(canAfford(174, w.crystalUnlockCost)).toBe(false);
  });

  it("a payload with NO cost (old platform) falls back to the constant, not to free", () => {
    expect(normalizeWallet({ crystal: 999 }).crystalUnlockCost).toBe(CRYSTAL_UNLOCK_COST);
    expect(normalizeWallet({ crystal: 0, crystalUnlockCost: -1 }).crystalUnlockCost).toBe(CRYSTAL_UNLOCK_COST);
    expect(normalizeWallet({ crystal: 0, crystalUnlockCost: Number.NaN }).crystalUnlockCost).toBe(
      CRYSTAL_UNLOCK_COST,
    );
    // ...but a server that genuinely says 0 is honoured — the owner may set it.
    expect(normalizeWallet({ crystal: 0, crystalUnlockCost: 0 }).crystalUnlockCost).toBe(0);
  });

  it("applyWallet re-reads the cost so an operator price change lands without a reload", () => {
    const before = data({ unlockCost: 300 });
    const after = applyWallet(before, {
      crystal: 10,
      crystalUnlockCost: 500,
      ownedChampions: [],
      favourites: [],
    });
    expect(after.unlockCost).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Task #201: the roster and the 🎲 random pool are `owned ∩ available`. A LOCKED
// champion (priced + not unlocked) is dropped from BOTH surfaces; free and owned
// champions stay. This is the client-side legibility filter; the server rejects
// an unowned lock-in regardless.
describe("champ-select ownership filter (meta-client-ownership)", () => {
  it("selectableByOwnership drops a locked champion from the manual roster, keeps free + owned", () => {
    cover("meta-client-ownership-roster");
    const roster = [{ id: "sela" }, { id: "thorne" }, { id: "vex" }, { id: "ghost" }];
    // owns thorne (priced+owned → keep). sela free → keep. vex priced+not owned →
    // DROP. ghost unknown price → treated free → keep.
    const owned = new Set(["thorne"]);
    const out = selectableByOwnership(roster, prices(), owned).map((c) => c.id);
    expect(out).toEqual(["sela", "thorne", "ghost"]);
    expect(out).not.toContain("vex"); // the locked champion is unpickable
  });

  it("selectableIdsByOwnership removes locked ids from the random pool", () => {
    cover("meta-client-ownership-random");
    const ids = ["sela", "thorne", "vex"];
    // owns nothing priced: only the free 'sela' survives among priced peers.
    expect(selectableIdsByOwnership(ids, prices(), new Set())).toEqual(["sela"]);
    // owning vex adds it back; thorne (priced, still not owned) stays out.
    expect(selectableIdsByOwnership(ids, prices(), new Set(["vex"]))).toEqual(["sela", "vex"]);
  });

  // Regression guard for 「藍水晶解鎖角色不見了」: #201 first filtered locked
  // champions out of the DISPLAY set too, which removed the 「🔓 解鎖」 button
  // (it lives on the locked champion's own card). The grid must SHOW every
  // available champion; only SELECTION is gated to owned∩available.
  it("rosterDisplayAndSelectable SHOWS locked champions but excludes them from the selectable set", () => {
    cover("meta-client-ownership-display");
    const roster = [{ id: "sela" }, { id: "thorne" }, { id: "vex" }, { id: "ghost" }];
    const owned = new Set(["thorne"]);
    const { display, selectableIds } = rosterDisplayAndSelectable(roster, prices(), owned);
    // DISPLAY keeps the locked champion 'vex' — its unlock button needs a card.
    expect(display.map((c) => c.id)).toEqual(["sela", "thorne", "vex", "ghost"]);
    // SELECTABLE excludes only the locked champion.
    expect(selectableIds.has("vex")).toBe(false); // locked → not pickable
    expect(selectableIds.has("thorne")).toBe(true); // priced but owned
    expect(selectableIds.has("sela")).toBe(true); // free
    expect(selectableIds.has("ghost")).toBe(true); // unknown price → free
  });
});
