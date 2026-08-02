/**
 * 商店經濟 — the guards for 後台 → 商店經濟 (`config/store.json`).
 *
 * The page exists because the doc had NO console entry at all: the champion
 * unlock price could only be changed by editing content, rebuilding the images
 * and restarting the containers, and two hard-coded 300s (Go + client) had to
 * be moved in the same commit. So the interesting failures here are not "does
 * the form validate", they are:
 *
 *   1. can a partial save DESTROY something the page does not edit
 *      (`mcoinRewards` — required and `.strict()`),
 *   2. does an out-of-range price get through to a schema that will reject it,
 *   3. is a mistyped free-list id VISIBLE, or does it silently free nobody
 *      while the champion it meant to name keeps charging full price.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_UNLOCK_COST,
  SHIPPED_FREE_CHAMPION_IDS,
  SHIPPED_UNLOCK_COST,
  STORE_SCHEMA,
  economySummary,
  extractStore,
  freeListText,
  parseFreeChampionIds,
  parseUnlockCost,
  storeDocFor,
  type StoreEconomy,
} from "./storeEconomy";

const REWARDS = { placement1: 1, placement2: 0, placement3: 0, placement4: 0 };

const economy = (over: Partial<StoreEconomy> = {}): StoreEconomy => ({
  championUnlockCost: SHIPPED_UNLOCK_COST,
  freeChampionIds: ["godie-e002", "godie-hart"],
  randomPickOwnership: "block",
  mcoinRewards: REWARDS,
  ...over,
});

describe("商店經濟: reading the doc", () => {
  it("reads the flat cost and the free list off a real store doc", () => {
    const got = extractStore({
      id: "store",
      schema: STORE_SCHEMA,
      championUnlockCost: 250,
      freeChampionIds: ["godie-hart"],
      mcoinRewards: REWARDS,
    });
    expect(got).toEqual({
      championUnlockCost: 250,
      freeChampionIds: ["godie-hart"],
      // 缺欄位的舊文件讀成出貨預設（owner 的「只能隨機到有解鎖的」）。
      randomPickOwnership: "block",
      mcoinRewards: REWARDS,
    });
  });

  it("refuses a doc of the WRONG schema instead of rendering its fields as a price", () => {
    expect(extractStore({ id: "stat-caps", schema: "config.stat-caps@1", caps: {} })).toBeNull();
    expect(extractStore(null)).toBeNull();
    expect(extractStore("store")).toBeNull();
  });

  it("an old doc with no championUnlockCost falls back to the shipped 300, not to 0", () => {
    // A 0 here would render 「統一價 0」 and, if saved, hand every champion out
    // for free — the exact giveaway the flat-price redesign removed.
    const got = extractStore({ id: "store", schema: STORE_SCHEMA, mcoinRewards: REWARDS });
    expect(got?.championUnlockCost).toBe(SHIPPED_UNLOCK_COST);
  });
});

describe("商店經濟: the price field has BOTH bounds", () => {
  it("accepts a whole number inside the schema's range, including 0", () => {
    expect(parseUnlockCost("300")).toEqual({ ok: true, value: 300 });
    expect(parseUnlockCost(" 0 ")).toEqual({ ok: true, value: 0 });
    expect(parseUnlockCost(String(MAX_UNLOCK_COST))).toEqual({ ok: true, value: MAX_UNLOCK_COST });
  });

  it("rejects anything the Zod schema would reject — including the UPPER bound", () => {
    // The upper bound is the one consoles forget. 300 mistyped as 3000000 has
    // to fail HERE, with a readable message, not at the overlay validator.
    expect(parseUnlockCost(String(MAX_UNLOCK_COST + 1)).ok).toBe(false);
    expect(parseUnlockCost("-1").ok).toBe(false);
    expect(parseUnlockCost("12.5").ok).toBe(false);
    expect(parseUnlockCost("").ok).toBe(false);
    expect(parseUnlockCost("三百").ok).toBe(false);
    expect(parseUnlockCost("1e6").ok).toBe(false);
  });
});

describe("商店經濟: the free list", () => {
  const known = new Set(["godie-e002", "godie-hart", "godie-hjai"]);

  it("accepts newline / comma / space separated ids and dedupes + sorts them", () => {
    const got = parseFreeChampionIds("godie-hart\ngodie-e002, godie-hart  godie-hjai", known);
    expect(got.ids).toEqual(["godie-e002", "godie-hart", "godie-hjai"]);
    expect(got.duplicates).toEqual(["godie-hart"]);
    expect(got.unknown).toEqual([]);
  });

  it("REPORTS an id that is not on the roster instead of dropping it silently", () => {
    // A typo frees nobody AND leaves the champion it meant to name at full
    // price. Both halves are invisible without this, which is why the page
    // surfaces `unknown` rather than filtering the list.
    const got = parseFreeChampionIds("godie-hart\ngodie-hjia", known);
    expect(got.unknown).toEqual(["godie-hjia"]);
    expect(got.ids).toContain("godie-hjia");
  });

  it("does not cry 'unknown' when the roster has not loaded yet", () => {
    // An empty `known` means the whitelist fetch failed / is in flight — not
    // that every id the operator typed is wrong.
    expect(parseFreeChampionIds("godie-hart", new Set()).unknown).toEqual([]);
  });

  it("an EMPTY box is a legal, meaningful state: no free champions at all", () => {
    const got = parseFreeChampionIds("   \n  ", known);
    expect(got.ids).toEqual([]);
    expect(got.unknown).toEqual([]);
  });

  it("round-trips through the textarea renderer", () => {
    expect(freeListText(["godie-hart", "godie-e002"])).toBe("godie-e002\ngodie-hart");
    expect(parseFreeChampionIds(freeListText(SHIPPED_FREE_CHAMPION_IDS), known).ids).toEqual(
      [...SHIPPED_FREE_CHAMPION_IDS].sort(),
    );
  });
});

describe("商店經濟: saving writes the WHOLE doc", () => {
  it("carries mcoinRewards through even though the page never edits it", () => {
    // MUTATION: drop `mcoinRewards` from storeDocFor's return and this fails.
    // In production that partial doc either fails the .strict() schema or
    // silently deletes the 吃雞 1-M幣 reward — the same class of bug 屬性上限
    // documents for its own table.
    const doc = storeDocFor(economy({ championUnlockCost: 250 }));
    expect(doc).toEqual({
      id: "store",
      schema: STORE_SCHEMA,
      championUnlockCost: 250,
      freeChampionIds: ["godie-e002", "godie-hart"],
      randomPickOwnership: "block",
      mcoinRewards: REWARDS,
    });
  });

  it("★ 🎲 擁有權欄位真的被寫進去，而且是操作員選的那一個（不是出貨預設）", () => {
    // 突變：把 `randomPickOwnership: economy.randomPickOwnership` 從 storeDocFor
    // 拿掉 → 這條紅。少了它，操作員在下拉選單改的東西存下去等於沒改（覆蓋層
    // 那份會缺欄位，client 讀成出貨預設）—— 就是 #241「有入口也不叫可調」的形狀。
    expect(storeDocFor(economy({ randomPickOwnership: "whitelist" })).randomPickOwnership).toBe("whitelist");
    expect(storeDocFor(economy({ randomPickOwnership: "block" })).randomPickOwnership).toBe("block");
  });

  it("★ 舊 overlay 沒有這一欄 → 讀成 block，壞值也讀成 block", () => {
    const base = { id: "store", schema: STORE_SCHEMA, championUnlockCost: 300, freeChampionIds: [], mcoinRewards: REWARDS };
    expect(extractStore(base)?.randomPickOwnership).toBe("block");
    expect(extractStore({ ...base, randomPickOwnership: "yes-please" })?.randomPickOwnership).toBe("block");
    expect(extractStore({ ...base, randomPickOwnership: "whitelist" })?.randomPickOwnership).toBe("whitelist");
  });

  it("preserves a NON-default reward table — it must be echoed, not re-defaulted", () => {
    const custom = { placement1: 5, placement2: 3, placement3: 2, placement4: 1 };
    expect(storeDocFor(economy({ mcoinRewards: custom })).mcoinRewards).toEqual(custom);
  });

  it("always writes the free list sorted, so a save is a no-op diff when nothing changed", () => {
    const doc = storeDocFor(economy({ freeChampionIds: ["godie-hart", "godie-e002"] }));
    expect(doc.freeChampionIds).toEqual(["godie-e002", "godie-hart"]);
  });
});

describe("商店經濟: the header tells the operator what he just did", () => {
  it("names the flat price, the free count and the paid count", () => {
    expect(economySummary(economy(), 53)).toBe("統一價 300 藍水晶 · 2 位免費 · 51 位要付費");
  });

  it("says so out loud when the free list is emptied", () => {
    // The owner asked for the ability to「清空變成完全統一」. The page must not
    // present that as a normal state without saying what it means.
    expect(economySummary(economy({ freeChampionIds: [] }), 53)).toContain("沒有任何免費英雄");
  });

  it("says so out loud when the price itself is 0", () => {
    expect(economySummary(economy({ championUnlockCost: 0 }), 53)).toContain("所有英雄免費");
  });
});
