/**
 * GH#274 —— 「回合報告卡說買得起 4 件,而商店只有 1 個按鈕能按」。
 *
 * 根因不在 `affordableFrom`（它算得完全正確）,在**餵給它的那一份目錄**:
 * `RoundReportCard` 硬給 `shopCatalogue(..., true)`,等於在正式 UI 裡把 GH#261
 * 的下架旗標關掉,於是 12 支架外的武器被算進提示。
 *
 * 兩條各擋一種失敗形態:
 *   ① 行為 —— 提示數得到的東西必須是商店**真的列得出來**的子集
 *      （並且證明這條斷言不是空的:開架時的目錄嚴格比較多）
 *   ② 呼叫端 —— 一支純函式守衛看不見「呼叫端換了參數」(失敗形態 ②/⑥),
 *      所以另外釘住正式那一行:⛔ 沒有第三個參數。
 *
 * ⛔ 斷言裡沒有 4 / 12 / 750 這種出貨數字（CLAUDE.md 第二守則:驗機制不驗數字）
 * —— 每一個量都從 `shopCatalogue` 自己算出來。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEGENDARY_ORB_ITEM_ID, STAT_TICK_ITEM_ID } from "@ggd/shared/sim/economy/itemTiers";
import { shopCatalogue, NO_FILTER } from "./champSelectFilter";
import { affordableFrom } from "./RoundReportCard";

const EFFECT = [{ stat: "ad", op: "flat", value: 10 }];
/**
 * 一份最小目錄:兩件**架外**的成品武器 + 兩個永遠在架上的服務。
 * 武器刻意標成 1 / 2 金 —— 比任何一個服務價都低,所以「提示引用了一個買不到的
 * 價格」這件事在下面是一條**嚴格小於**,⛔ 不必抄任何一個出貨數字。
 */
const CATALOGUE = [
  { id: "godie-i05t", craftRole: "final", cost: 1, modifiers: EFFECT },
  { id: "swift-boots", craftRole: "final", cost: 2, modifiers: EFFECT },
  { id: STAT_TICK_ITEM_ID as string, cost: 375 },
  { id: LEGENDARY_ORB_ITEM_ID as string, cost: 2400 },
];
/** 買得起全部 —— 讓「數得到幾件」只取決於**架上有什麼**,不取決於錢。 */
const RICH = CATALOGUE.reduce((m, i) => Math.max(m, i.cost), 0) + 1;

describe("回合報告卡的金幣提示只數得到架上的貨 (#274)", () => {
  it("提示的母體 ⊆ 商店真的列出來的那一份", () => {
    const shelf = shopCatalogue(CATALOGUE, NO_FILTER); // MerchantShop 自己的那一行
    const open = shopCatalogue(CATALOGUE, NO_FILTER, true); // 被拿掉的那個 `true`
    // 這條斷言不是空的:開架時嚴格多出東西,所以參數真的會改變答案。
    expect(open.length).toBeGreaterThan(shelf.length);
    expect(affordableFrom(shelf, RICH).count).toBe(shelf.length);
    expect(affordableFrom(open, RICH).count).toBeGreaterThan(affordableFrom(shelf, RICH).count);
    // 「最便宜的一件」也必須來自架上,⛔ 不是一件買不到的武器 —— 那句提示會叫
    // 玩家去買一個他按不下去的按鈕。開架版本會報出更低的那個價,這就是症狀本身。
    const shelfCheapest = affordableFrom(shelf, RICH).cheapest;
    expect(shelfCheapest).not.toBeNull();
    expect(affordableFrom(open, RICH).cheapest!).toBeLessThan(shelfCheapest!);
  });

  it("正式呼叫端沒有把貨架旗標關掉", () => {
    // 純函式守衛看不見呼叫端換了參數 —— 這是唯一能釘住它的檢查,
    // 形狀與 `shopShelfListing.test.ts` 對 MerchantShop 的那一條相同。
    const src = readFileSync(fileURLToPath(new URL("./RoundReportCard.tsx", import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).toContain("shopCatalogue(Items.all(), whitelist)");
    expect(src).not.toMatch(/shopCatalogue\(Items\.all\(\),\s*whitelist\s*,/);
  });
});
