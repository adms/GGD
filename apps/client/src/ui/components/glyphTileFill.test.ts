/**
 * glyph-tile-fill (#338) — 「商店寶具的圖示真的填滿那一格」。
 *
 * owner 2026-08-17:「商店購買寶具(武器道具)的圖示比例過小 沒有符合空格」。
 * 根因是**純 CSS**:格子是 `repeat(6,1fr)` 的流動寬度,圖示卻是寫死的 px 邊長。
 * 所以這裡守的是**幾何機制**(fill 到底有沒有換掉幾何),⛔ 不是任何一個出貨數字
 * —— 格子多寬、圖示佔幾成,那是後台 `iconFillPct` 的事,會變。
 *
 * 兩條各擋一種失敗形態:
 *   ① fill 只是多了一個沒人理的 prop(真 render,兩個方向一起讀)
 *   ② 機制做好了但呼叫端沒接上(失敗形態 ②)—— 掃描前先剝註解,
 *      一段講 fill 的散文不可以冒充一個真的 prop。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GlyphTile } from "./GlyphTile";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const code = (rel: string): string =>
  readFileSync(SRC + rel, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 寫死的 px 邊長 —— `width:100%` 刻意不算(那正是我們要的東西)。 */
const PX_EDGE = /width:\s*\d+(\.\d+)?px/;

describe("GlyphTile fill 換掉幾何 (#338)", () => {
  it("fill 蓋滿父容器,沒 fill 的呼叫端一個字都沒變", () => {
    const props = { seed: "godie-i061", label: "神盾", size: 38 };
    const filled = renderToStaticMarkup(createElement(GlyphTile, { ...props, fill: true }));
    const fixed = renderToStaticMarkup(createElement(GlyphTile, props));
    expect(filled).toMatch(/inset:\s*0/);
    expect(filled).not.toMatch(PX_EDGE);
    // 反方向:少了這兩條,「fill 沒生效」與「fill 生效了」長得一模一樣。
    expect(fixed).toMatch(PX_EDGE);
    expect(fixed).not.toMatch(/inset:\s*0/);
  });

  it("商店裝備格真的用了 fill,而不是一個寫死的邊長", () => {
    const grid = code("ui/panels/MerchantShop.tsx");
    const mount = grid.slice(grid.indexOf("function InventoryGrid")).match(/<GlyphTile[\s\S]*?\/>/);
    expect(mount).not.toBeNull();
    expect(mount![0]).toMatch(/\bfill\b/);
    expect(mount![0]).not.toMatch(/size=\{\d/);
  });

  /**
   * GH#344 —— HUD 裝備欄是**同一個形狀**的第二處:格子是 `repeat(N,1fr)` 的
   * 流動寬度,而 tile 曾經是 `size={touch ? 20 : 26}` 的固定 px（觸控 120px
   * 分六格 ≈ 15.5px,塞 20px ⇒ 溢出被裁）。⛔ 這裡不可以只查 `size={數字}`：
   * 那個缺陷的字面值是 `size={tile}`,一個**識別字**——只擋數字的正則對它是綠的。
   */
  it("HUD 裝備欄也走 fill,而且一個邊長變數都不留 (#344)", () => {
    const bar = code("ui/hud/EquipmentBar.tsx");
    const mount = bar.match(/<GlyphTile[\s\S]*?\/>/);
    expect(mount).not.toBeNull();
    expect(mount![0]).toMatch(/\bfill\b/);
    expect(mount![0]).not.toMatch(/\bsize=/);
    // 兩個方向一起讀:那個 px 常數必須從檔案裡消失,⛔ 不是留在原地沒人用。
    expect(bar).not.toMatch(/const\s+tile\s*=/);
    // 圖示佔格比例讀**商店那一格**後台參數,⛔ 不是第二個住處。
    expect(bar).toMatch(/itemIconFillPct\(\)/);
  });
});
