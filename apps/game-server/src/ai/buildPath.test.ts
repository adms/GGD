/**
 * ai-build-path: `nextBuildPurchase` 的步進規則（不重複買、不卡在買不到的那一階、
 * 不把 0 元的三選一獎品當成免費商品）。
 *
 * ⭐ **2026-08-20（GH#474）**：「推薦出裝」這個**內容機制**退場了 —— 出貨的
 * `buildPriority` 一律是空的，bot 一律走「半價 + 隨機寶具」。這一支**沒有跟著刪掉**，
 * 因為那個函式仍然是骨架註冊表（`sim/content/skeleton.ts` 的兩位）與除錯路徑的
 * 購買邏輯；退場本身由下面第二個 describe 守著。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { shippedChampionIds } from "../testkit/contentFixtures";
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

/**
 * ⭐【GH#474】「推薦出裝」**整條退場**了 —— 這個 describe 取代了原本的
 * 「authored starter ladders are executable」。
 *
 * owner 2026-08-18：「66 位英雄的推薦出裝變成空的 => **不需要推薦出裝**」
 * owner 2026-08-20（裁決 A）：「**拔乾淨**，現在 bot 都是**半價購買隨機寶具**」
 *                             「`[v] A　清乾淨 + 拔後台欄`」
 *
 * ⛔ 舊的那條 `it` **不是刪掉**是**取代**（第一·五守則：留著一條說得出舊行為的
 * 守衛比沒有守衛更糟 —— 它會在梯子回來的時候變綠，而那正是要擋的事）。
 * 被清空的 12 條梯子逐字存在 `docs/legacy/_bot-build-priority-retired-20260820.md`。
 */
describe("推薦出裝已退場（ai-build-path · GH#474）", () => {
  beforeAll(async () => {
    registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  });

  it("出貨內容裡沒有任何一位英雄還帶著梯子", () => {
    cover("ai-build-tolerance");
    // ⭐ 讀**真的註冊表**（＝載入器跑完的那一份），⛔ 不是掃 JSON 字串：
    //   champion-embedded 與 standalone 兩條路都要落在同一個答案上。
    const withLadder: string[] = [];
    let checked = 0;
    for (const id of shippedChampionIds()) {
      const def = Champions.tryGet(id as never);
      if (!def) continue;
      checked++;
      if ((def.buildPriority?.length ?? 0) > 0) withLadder.push(`${id}(${def.buildPriority.length})`);
    }
    // ⚠️ 空語料 = 讀壞了，⛔ 不是「一位都沒有」。同 roster-guard 的那一條。
    expect(checked, "一位出貨英雄都讀不到 —— 讀取器壞了，這條守衛在空轉").toBeGreaterThan(0);
    expect(
      withLadder,
      `這幾位又長出推薦出裝了 —— 它會讓 bot 走回舊的購買路徑，而其餘 ${checked - withLadder.length} 位走隨機寶具：${withLadder.join(", ")}`,
    ).toEqual([]);
  });

  it("梯子空了之後，購買分支一定落到「半價隨機寶具」那一條", () => {
    cover("ai-build-tolerance");
    // ⭐ 這是**接線**那一半：`Tier0Brain.replan` 寫的是
    //     `const buy = nextBuildPurchase(...); if (buy !== null) … else 買寶具`
    //   ⇒ 「梯子退場」要真的變成「走寶具」，唯一的條件就是這一支對空梯子回 null。
    //   ⛔ 沒有這一條，拔掉內容之後 bot 有可能整場什麼都不買，而 12 位英雄的
    //     JSON 看起來完全正常（失敗形態②）。
    const costOfReal = (i: ItemId): number | null => Items.tryGet(i)?.cost ?? null;
    expect(nextBuildPurchase([], empty(), 999_999, costOfReal)).toBeNull();
    for (const id of shippedChampionIds()) {
      const def = Champions.tryGet(id as never);
      if (!def) continue;
      expect(
        nextBuildPurchase(def.buildPriority as ItemId[], empty(), 999_999, costOfReal),
        `${id} 的梯子還買得出東西 —— 這一位不會走隨機寶具`,
      ).toBeNull();
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
