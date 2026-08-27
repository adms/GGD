/**
 * ⭐ GH#509 —— 商店的商品列，手把打得開。
 *
 * 展開（＝ ✦ 效果全文、ItemCardBody 原文、以及「買下去屬性會變多少」的 delta
 * 預覽）唯一的入口是那條軌的 `onClick`，而它在此之前是一塊**裸 div** ——
 * `PadFocusNav.FOCUSABLE_SELECTOR` 對它視而不見，列裡唯一的 `<button>`（購買）
 * 又在自己的 onClick 第一行 `e?.stopPropagation()`。⇒ 純手把玩家只讀得到一行被
 * ellipsis 截斷的說明就得決定要不要花錢。
 *
 * ⛔ 「可聚焦」的定義**沒有在這裡重打一份** —— 從 `ui/PadFocusNav.tsx` 讀出來，
 * 所以放寬/收窄那一層會弄紅這條守衛，⛔ 而不是安靜地把商店解修回去。
 * （形狀抄已證明有效的 `platform/storePadReach.test.ts`。）
 *
 * ── 突變（2026-08-27）：拿掉那條軌的 `data-pad-focusable=""` → 第一條紅
 *    （markup 裡找不到選擇器要的那個屬性）。加回來即綠。
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SeatView } from "../../net/RoomStore";
import { CatalogueRow } from "./MerchantShop";

const PAD_NAV = readFileSync(fileURLToPath(new URL("../PadFocusNav.tsx", import.meta.url)), "utf8");

const SEAT = { gold: 0, items: [] } as unknown as SeatView;

/**
 * ⚠️ 客戶端的 vitest 起跑時**登錄表是空的**（`Items.all()` 回 []），所以夾具
 * 是手寫的 —— ⛔ 但**餵進去的是出貨的元件本身**，量的是它真的吐出來的 markup，
 * ⛔ 不是一份自己造的 payload（失敗形態⑤）。
 */
const ITEM = {
  id: "gh509-test-item",
  name: "測試道具",
  cost: 500,
  description: "測試說明",
  modifiers: [{ stat: "ad", flat: 10 }],
} as unknown as Parameters<typeof CatalogueRow>[0]["item"];

const row = (expanded: boolean): string =>
  renderToStaticMarkup(
    createElement(CatalogueRow, {
      item: ITEM,
      anchorStat: null,
      seat: SEAT,
      full: false,
      canBuy: true,
      density: "detail" as const,
      expanded,
      onToggle: () => undefined,
      preview: null,
      touch: true,
    }),
  );

describe("GH#509 商品列的軌本身是控制項，⛔ 不是一塊掛著 onClick 的 div", () => {
  it("那條軌帶著 PadFocusNav 真的收的那個屬性", () => {
    // 從真的選擇器清單引出來，⛔ 不是從它旁邊的散文
    const selectors = /const FOCUSABLE_SELECTOR\s*=\s*\[([\s\S]*?)\]\s*\.join/.exec(PAD_NAV)?.[1];
    expect(selectors, "找不到 ui/PadFocusNav.tsx 的 FOCUSABLE_SELECTOR").toBeTruthy();
    expect(selectors!).toContain("[data-pad-focusable]");
    const html = row(false);
    expect(html).toContain("data-pad-focusable");
    // A 走的是 `cur.click()`；鍵盤要 role + tabindex 才停得下來、讀得出名字
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    // 非空洞：這確實是**收起**的那一列（購買鍵還在同一列，pickSpatial 橫向到得了）
    expect(html).toContain("g</button>");
  });

  it("⭐ 非空洞：展開才有的東西真的只有展開才畫得出來", () => {
    // ⇒ 上面那條軌就是唯一的入口；它不可聚焦＝那些字手把永遠讀不到
    const collapsed = row(false);
    const open = row(true);
    expect(open.length).toBeGreaterThan(collapsed.length);
    expect(open).toContain('aria-expanded="true"');
    expect(collapsed).toContain('aria-expanded="false"');
  });
});
