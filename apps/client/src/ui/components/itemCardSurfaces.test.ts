/**
 * item-card-surfaces — 「卡片排版真的畫出來了,而且四個地方都畫」。
 *
 * owner 2026-08-02 給的兩個要求各有一條命:
 *   ·「效果及數值的部分應該要特殊顏色表示」→ 這裡**真的 render**,讀吐出來的 HTML。
 *   ·「四個地方全套」→ 這是**結構**問題(哪一棵樹掛了什麼),不是像素問題。
 *
 * ── 為什麼是「一半真 render、一半掃結構」 ───────────────────────────────────
 * `ItemCardBody` 是純的,`react-dom/server` 在 node env 直接 render 得出來,所以
 * 顏色與分行是量出來的,不是掃字串猜的(避開失敗形態 ⑥)。
 *
 * 四個呼叫點不是純的:MerchantShop / EquipmentBar / AugmentDraftPanel 吃 HUD
 * store,CodexDetail 吃編輯 context,而且它們的 tooltip 會 portal 到 <body> ——
 * 客戶端的 vitest env 是 node。這正是 `ui/surfaceParity.test.ts` 檔頭講的同一個
 * 判斷:失敗形態是「哪一棵樹掛了什麼」,structural 掃描才是對的層級。
 * 掃描前**先把註解剝掉**,所以一段講 `<ItemCardBody>` 的散文永遠不能冒充一個真的
 * mount —— 這也是 surfaceParity 的規矩。
 *
 * ── 這裡最重要的一條 ────────────────────────────────────────────────────────
 * 「換了 config,畫出來的顏色真的跟著換」。少了它,整套 config 可以完全沒接上而
 * 這個檔還是綠的(失敗形態 ②),而那正是 `content/config/item-card.json` 存在的
 * 唯一理由。
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_ITEM_CARD } from "@ggd/shared/content";
import { ItemCardBody } from "./ItemCardBody";
import { applyItemCardDoc, getItemCardConfig } from "./itemCardTheme";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string): string => readFileSync(SRC + rel, "utf-8");
/** 剝掉註解 —— 講 `<ItemCardBody>` 的散文不可以冒充一個真的 mount。 */
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 死之王的神盾 godie-i061 的真實原文(owner 點名的 `[焚身]` 就在這一支)。 */
const SHIELD =
  "傳說\n效能\n[焚身] 每秒造成周圍範圍燃燒 10% AP 傷害\n[腐蝕] 周圍敵方單位防禦 -30\n額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%\n\n解說\n死之王最讓人害怕的時刻，莫過於在魔法學校的大屠殺。";

const html = (description: string, props: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(createElement(ItemCardBody, { description, ...props }));

/** react-dom 會把 `#FF7BA6` 寫成 `color:#FF7BA6`;比對時一律轉小寫。 */
const has = (s: string, needle: string): boolean =>
  s.toLowerCase().includes(needle.toLowerCase());

afterEach(() => {
  applyItemCardDoc(null); // 回到出貨預設,免得測試之間互相污染
});

describe("卡片本體真的畫出顏色與分行 (item-card-surfaces)", () => {
  it("[焚身] 畫成負面/控場那一類的顏色,不是一般文字", () => {
    const out = html(SHIELD);
    expect(has(out, DEFAULT_ITEM_CARD.categories.debuff.color)).toBe(true);
    expect(out).toContain("焚身");
  });

  it("[死之王套裝] 畫成屬性加成那一類 —— 四個分類在同一張卡上分得開", () => {
    const out = html(SHIELD);
    expect(has(out, DEFAULT_ITEM_CARD.categories.stat.color)).toBe(true);
  });

  it("數值上數值色", () => {
    const out = html(SHIELD);
    expect(has(out, DEFAULT_ITEM_CARD.numberColor)).toBe(true);
    expect(out).toContain("10%");
  });

  it("三行效能是三個並排的列 —— owner 抱怨的 ` · ` 串接不在畫面上", () => {
    const out = html(SHIELD);
    expect(out).not.toContain(" · ");
    // 每一行的第一段文字都必須各自出現,而且中間隔著一個 </div><div
    const i1 = out.indexOf("每秒造成周圍範圍燃燒");
    const i2 = out.indexOf("周圍敵方單位防禦");
    const i3 = out.indexOf("同時裝備死之王長槍");
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(out.slice(i1, i2)).toContain("</div>");
    expect(out.slice(i2, i3)).toContain("</div>");
  });

  it("解說自成一段,而且可以關掉(hover tooltip 那種矮的地方)", () => {
    expect(html(SHIELD)).toContain("魔法學校的大屠殺");
    expect(html(SHIELD, { showLore: false })).not.toContain("魔法學校的大屠殺");
  });

  it("空 description 什麼都不畫(不是畫一個空框)", () => {
    expect(renderToStaticMarkup(createElement(ItemCardBody, { description: "" }))).toBe("");
  });

  it("⭐ 換了 config,畫出來的顏色真的跟著換 —— 這才證明那份 JSON 有接上", () => {
    const before = html(SHIELD);
    expect(has(before, "#FF00AA")).toBe(false);
    applyItemCardDoc({
      ...DEFAULT_ITEM_CARD,
      categories: {
        ...DEFAULT_ITEM_CARD.categories,
        debuff: { label: "負面控場", color: "#FF00AA" },
      },
    });
    const after = html(SHIELD);
    expect(has(after, "#FF00AA")).toBe(true);
    expect(has(after, DEFAULT_ITEM_CARD.categories.debuff.color)).toBe(false);
  });

  it("config 裡的一格壞掉只賠那一格,其餘照舊(overlay 寫入路徑不跑 Zod, #283)", () => {
    applyItemCardDoc({
      ...DEFAULT_ITEM_CARD,
      // overlay 的寫入路徑不跑 Zod(#283),所以 `"紅色"` 這種值真的到得了這裡;
      // 型別上它就是 string,所以連編譯器都攔不住 —— 這正是逐格防禦存在的理由。
      numberColor: "紅色",
    });
    const cfg = getItemCardConfig();
    expect(cfg.numberColor).toBe(DEFAULT_ITEM_CARD.numberColor);
    expect(cfg.categories.debuff.color).toBe(DEFAULT_ITEM_CARD.categories.debuff.color);
  });

  it("表上查不到的標記仍然畫成 chip(用預設分類),不會讓卡片壞掉", () => {
    const out = html("傳說\n效能\n[明天才發明的標記] 做某件事+5\n");
    expect(out).toContain("明天才發明的標記");
    expect(has(out, DEFAULT_ITEM_CARD.categories[DEFAULT_ITEM_CARD.unknownCategory].color)).toBe(
      true,
    );
  });
});

describe("四個渲染點都接上了 (item-card-surfaces)", () => {
  // owner 指名的四個地方。value 是那個檔案裡**一定要存在**的 mount 形狀。
  const SURFACES: ReadonlyArray<[label: string, file: string]> = [
    ["商店卡片", "ui/panels/MerchantShop.tsx"],
    ["三選一抽卡", "ui/panels/AugmentDraftPanel.tsx"],
    ["裝備欄 hover 詳情 (#140)", "ui/hud/EquipmentBar.tsx"],
    ["圖鑑 / 後台", "ui/codex/CodexDetail.tsx"],
  ];

  it.each(SURFACES)("%s 真的 import 並 mount <ItemCardBody>", (_label, file) => {
    const src = code(file);
    expect(src).toContain("ItemCardBody");
    // import + 真的出現在 JSX 裡。只 import 不 mount 是失敗形態 ③。
    expect(/import\s*\{[^}]*ItemCardBody[^}]*\}\s*from/.test(src)).toBe(true);
    expect(/<ItemCardBody\b/.test(src)).toBe(true);
  });

  it.each(SURFACES)("%s 餵給它的是 description,不是別的字串", (_label, file) => {
    const src = code(file);
    // `<ItemCardBody ... description={...}` —— 沒有 description 就等於畫空白。
    const mounts = src.match(/<ItemCardBody\b[\s\S]*?\/>/g) ?? [];
    expect(mounts.length).toBeGreaterThan(0);
    for (const m of mounts) expect(m).toMatch(/description=\{/);
  });

  it("ContentDb 真的呼叫 applyItemCardDoc —— 否則那份 JSON 沒有人讀", () => {
    // 失敗形態 ②:檔案存在、後台改得動、遊戲永遠讀不到。
    const src = code("content/ContentDb.ts");
    expect(src).toMatch(/applyItemCardDoc\(\s*this\.configDoc<[^>]*>\(\s*"item-card"/);
  });

  it("<Tooltip> 的 bodyNode 通道存在 —— 沒有它,hover 詳情只能吃純字串", () => {
    const src = code("ui/components/Tooltip.tsx");
    expect(src).toContain("bodyNode");
    // 而且它必須真的被畫出來,不是只在 props 型別上宣告。
    expect(/\{bodyNode\s*\?/.test(src)).toBe(true);
  });
});
