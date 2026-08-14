/**
 * 編輯器的地圖面板守衛（GH#324，體驗層 —— 一條薄守衛，⛔ 不開對抗輪）。
 *
 * ⭐ 這一支要釘住的**不是** UI 長什麼樣，是「編輯器印出來的指標
 * 跟 `pnpm map:gen` 寫進 `content/` 的那一份**是同一段程式算的**」。
 *
 * ⚠️ 那才是這一頁唯一會無聲腐爛的地方：一個自己重畫一遍 tiles 的預覽會很好寫，
 * 然後慢慢跟產生器分岔，而畫面上不會有任何異狀 —— 直到有人照著預覽擺完一張圖、
 * 跑 CLI、被拒絕（失敗形態⑤：被測的不是出貨的那個）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { zMapDoc, DEFAULT_MAP_SPEC, type MapDoc } from "@ggd/shared/content";
import { compileMap } from "@ggd/shared/map/compile";
import { generateTiles } from "@ggd/shared/map/templates";
import { starterMap } from "@ggd/shared/map/starter";
import { has3DPreview } from "./which";
import { MapPanel } from "./MapPanel";
import { collectionEntry } from "../collections";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const readJson = (rel: string): unknown => JSON.parse(readFileSync(`${REPO}${rel}`, "utf8"));

describe("編輯器 · 地圖版面面板", () => {
  it("★ maps 有 3D 面板（沒註冊的話這一整頁在 UI 上根本不存在）", () => {
    expect(has3DPreview("maps")).toBe(true);
  });

  it("★ 面板算出來的報告 = 產生器寫進 content/config/map-report.json 的那一列", () => {
    const doc = zMapDoc.parse(readJson("content/maps/map.infinity-castle.json"));
    const { report } = compileMap(doc, DEFAULT_MAP_SPEC);
    const shipped = readJson("content/config/map-report.json") as {
      maps: Record<string, unknown>[];
    };
    const row = shipped.maps.find((m) => m.mapId === report.mapId);
    expect(row, "產生器的報告裡找不到這張圖").toBeDefined();
    for (const k of ["loops", "chokepoints", "deadEnds", "interactions", "duelZones", "ok"]) {
      expect(row![k], k).toEqual((report as unknown as Record<string, unknown>)[k]);
    }
  });

  it("★ 面板真的畫得出來，而且九項指標與模板按鈕都在 HTML 裡", () => {
    // ⚠️ 跑真的 `renderToString` 讀真的 HTML —— ⛔ 不是「元件有被 import」。
    //    一個 mount 就爆掉的元件會讓上面兩條照樣全綠（失敗形態③）。
    const html = renderToString(
      createElement(MapPanel, { doc: readJson("content/maps/map.infinity-castle.json") }),
    );
    for (const label of ["區域數", "迴圈", "瓶頸", "互動點", "橫跨秒數", "對戰分區"]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("重新產生 tiles");
    expect(html).toContain("通過");
  });

  it("⛔ 「新建一張地圖」拿到的必須是**產生器會接受**的文件（四個模板都要）", () => {
    // 在這條之前，`maps` 樣板是 16 行手打的 tiles，中央房間四面全封
    // ⇒ `disconnectedRegions`(hard) 直接紅，另外五項超規格。
    // ⚠️ 而樣板的註解寫著「刻意給一張最小但合法的圖」—— 註解會說謊（第三守則）。
    for (const t of ["CENTRAL_RING", "CROSS_RING", "DOUBLE_LOOP", "ARENA_RING"] as const) {
      const parsed = zMapDoc.safeParse(starterMap("map.new", t));
      expect(parsed.success, `${t} 不合 map@1`).toBe(true);
      const { report } = compileMap((parsed as { data: MapDoc }).data, DEFAULT_MAP_SPEC);
      expect(
        report.ok,
        `${t}: ${report.issues.map((i) => `${i.check}(${i.kind})`).join(" ")}`,
      ).toBe(true);
    }
    // ⭐ 而且新場地一開場就有背景 —— 否則圓盤外是一片黑（失敗形態①）。
    const doc = zMapDoc.parse(starterMap("map.new"));
    expect(doc.backdrop?.layers.length ?? 0).toBeGreaterThan(0);
    // 編輯器的 `maps` 樣板走的就是這一個工廠，⛔ 不是另外抄一份
    expect(collectionEntry("maps").template("map.new")).toEqual(starterMap("map.new"));
  });

  it("★ 「用模板重新產生」吐出的 tiles 形狀對得上 grid（否則按下去就變成一份紅字文件）", () => {
    const doc = zMapDoc.parse(readJson("content/maps/map.infinity-castle.json"));
    const tiles = generateTiles(doc.template, { cols: doc.grid.cols, rows: doc.grid.rows });
    expect(tiles.length).toBe(doc.grid.rows);
    expect(new Set(tiles.map((r) => r.length))).toEqual(new Set([doc.grid.cols]));
    // 產生出來的版面本身必須是合法的 map@1 —— 按鈕不可以吐出一份 schema 拒收的東西
    expect(zMapDoc.safeParse({ ...doc, tiles }).success).toBe(true);
  });
});
