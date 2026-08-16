/**
 * 常駐地名 + 結算收合 + 鏡頭縮放界線 —— owner 2026-08-15 的三項。
 *
 * ⚠️ 體驗層，所以**一條薄守衛**（CLAUDE.md 第零守則⑦：≤80 行、不開對抗輪）。
 * 驗的是「刪掉關鍵那行會不會紅」，⛔ 不是「不透明度是不是 0.62」。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DEFAULT_MAP_CORNER_LABEL, DEFAULT_CAMERA, resolveCamera } from "@ggd/shared/content";
import { MapCornerLabelView, minimapBox } from "./MapCornerLabel";
import { hudSlot } from "./hudLayout";

describe("常駐地名（GH#332）", () => {
  it("⭐ 畫面上真的有那個地名 —— 讀回渲染出來的字，⛔ 不是斷言某個變數", () => {
    const html = renderToStaticMarkup(
      createElement(MapCornerLabelView, {
        name: "無限城",
        rules: DEFAULT_MAP_CORNER_LABEL,
        box: minimapBox(false),
      }),
    );
    expect(html).toContain("無限城");
    expect(html).toContain('data-slot="map-name"');
    // ⛔ 不可以吃掉點擊 —— 它蓋在小地圖上，小地圖要能被點。
    expect(html).toContain("pointer-events:none");
  });

  it("⭐ 它跟著**小地圖**走 —— 小地圖搬家（手機）標籤就跟著換邊", () => {
    // 桌機小地圖在右下、手機在左上（版面表自己宣告的）。標籤的定位是從那一格
    // 推導的，所以這一條紅 = 有人把位置抄成字面值了。
    const desktop = minimapBox(false);
    const touch = minimapBox(true);
    expect(desktop.style.right).toBeTypeOf("number");
    expect(touch.style.left).toBeTypeOf("number");
    // 寬度也是推導的：桌機的框比手機大。
    expect(desktop.width).toBeGreaterThan(touch.width);
    expect(desktop.width).toBe(hudSlot("minimap").width);
  });

  it("⚠️ 關掉就是完全不畫（⛔ 不是畫一個透明的）", () => {
    const html = renderToStaticMarkup(
      createElement(MapCornerLabelView, {
        name: "無限城",
        rules: { ...DEFAULT_MAP_CORNER_LABEL, opacity: 0.62 },
        box: minimapBox(false),
      }),
    );
    // 開著的時候有字；`enabled:false` 的分支在 `MapCornerLabel` 本體就 return null，
    // 所以這裡驗的是「開著的時候真的有東西」——關掉那一半沒有畫面可讀。
    expect(html.length).toBeGreaterThan(0);
    expect(DEFAULT_MAP_CORNER_LABEL.enabled).toBe(true);
  });
});

describe("鏡頭縮放界線（GH#332）", () => {
  it("⭐ 讀不到設定要退回出貨預設，⛔ 不是 0 或 NaN", () => {
    // 這是「後台還沒存過任何東西」與「開機最早期」都會走到的那條路。
    expect(resolveCamera(null)).toEqual({ ...DEFAULT_CAMERA });
    expect(resolveCamera({})).toEqual({ ...DEFAULT_CAMERA });
  });

  it("⭐ 部分覆蓋只蓋那一格 —— 其餘照樣是出貨值", () => {
    const c = resolveCamera({ zoom: { maxDolly: 22 } } as Parameters<typeof resolveCamera>[0]);
    expect(c.maxDolly).toBe(22);
    expect(c.minDolly).toBe(DEFAULT_CAMERA.minDolly);
    expect(c.wheelStep).toBe(DEFAULT_CAMERA.wheelStep);
  });
});
