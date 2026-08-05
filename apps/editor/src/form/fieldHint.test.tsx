/**
 * 欄位說明真的畫得出來 —— 一條「刪掉就會紅」的守衛。
 *
 * ── 它為什麼存在 ─────────────────────────────────────────────────────────
 * 2026-08-05 之前，schema 上 `.describe()` 寫的每一句話**在編輯器上都看不到**：
 *
 *   · `walk.ts:74` 把 `description` 收進節點 ✅
 *   · `uiSchema.ts` 的 `UIBase.description` 也宣告了 ✅
 *   · **十個 widget 沒有一個畫它** ❌（全 `widgets/` grep `node.description` 零命中）
 *
 * 而 repo 裡當時已經有 **25 句**寫好的 `.describe()`（`schema/item.ts` 24 句、
 * `schema/common.ts` 1 句）。整條路可以從渲染樹刪掉而測試全綠 ——
 * 那正是 CLAUDE.md 失敗形態 ③，而且是它最乾淨的一個標本。
 *
 * ⚠️ 這條守衛的價值不只是「這一次修好了」：ABCD 補完的後續批次
 * （C1/C2 的沉默與混亂、A3b/c 的殭屍提示、D6 的 14 個 preset）**每一個都要寫
 * 欄位說明**。沒有這一條，那些字會全部寫進一個沒有人畫的地方。
 *
 * ── 為什麼斷言的是「畫出來的字串」而不是「node 上有 description」 ─────────
 * 後者是屬性（失敗形態 ⑦），而且**在缺陷發生的那一年是綠的** —— 節點上一直
 * 都有那一格。這裡跑真的 `renderToString`，讀真的 HTML。
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { zItemDoc } from "@ggd/shared/content/schema/item";
import { cover } from "../../../../packages/shared/testkit/cover";
import { walkZod } from "./walk";
import { FormRenderer } from "./FormRenderer";

const TAG = "editor-field-hint";

/** 這一句只住在這個檔案裡 —— 不抄任何出貨文案，所以它不會過期。 */
const HINT = "這一句是探針：如果你在編輯器上看不到它，說明管線又斷了";

/**
 * ⚠️ 包一層 `QueryClientProvider`：`RefSelect`（`ref:` 那一種欄位走的 widget）
 * 用 react-query 抓可選清單，沒有 provider 會直接丟
 * 「No QueryClient set」—— 那是**測試的腳手架不足**，不是被測行為。
 */
function html(schema: z.ZodTypeAny, value: unknown): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(FormRenderer, {
        node: walkZod(schema),
        value,
        dataPath: "",
        errors: {},
        onChange: () => {},
      }),
    ),
  );
}

describe("欄位說明（.describe()）真的畫得出來", () => {
  it("★ 字串欄位的說明出現在 HTML 裡", () => {
    cover(TAG);
    const out = html(z.object({ name: z.string().describe(HINT) }), { name: "x" });
    // 靶：把 `renderNode` 裡包 `<FieldHint>` 的那一段拿掉 → 紅。
    expect(out).toContain(HINT);
  });

  it("★ 數字 / 布林 / enum 三種 widget 也畫得出來（不是只有 text 那一個）", () => {
    cover(TAG);
    // 這一條擋的是「補在某一個 widget 裡」的修法 —— 那種修法下，
    // 忘記補的那幾個 widget 與「那個欄位沒有說明」長得一模一樣。
    const cases: [string, z.ZodTypeAny, unknown][] = [
      ["number", z.object({ n: z.number().describe(HINT) }), { n: 1 }],
      ["boolean", z.object({ b: z.boolean().describe(HINT) }), { b: true }],
      ["enum", z.object({ e: z.enum(["a", "b"]).describe(HINT) }), { e: "a" }],
    ];
    for (const [label, schema, value] of cases) {
      expect(html(schema, value), `${label} widget 沒有畫說明`).toContain(HINT);
    }
  });

  it("★ 沒有 .describe() 的欄位不會憑空多一塊（省略是省略）", () => {
    cover(TAG);
    const out = html(z.object({ name: z.string() }), { name: "x" });
    expect(out).not.toContain("field-hint");
  });

  it("★ `ref:` 那一種不是給人看的說明，不可以被當成提示畫出來", () => {
    cover(TAG);
    // `walk.ts` 用 `description` 這一格兼職標「這是一個參照」（`refFromDescription`），
    // 而那個字串是給程式看的。它已經在 `walk.ts:74` 被濾掉 ——
    // 這一條釘住那個過濾，因為一旦它失效，作者會在畫面上看到 `ref:champions`。
    const out = html(z.object({ who: z.string().describe("ref:champions") }), { who: "" });
    expect(out).not.toContain("ref:champions");
  });

  it("★ 出貨 schema 上真的有人寫過說明 —— 這條路不是為了一個沒人用的功能", () => {
    cover(TAG);
    // ⚠️ 不釘數量（那是第四個住處，而且它預期會成長）。釘的是「>0」：
    // 如果哪天一句都不剩，上面四條就變成在測一個沒有人用的功能，
    // 而那時該做的是刪掉這條路，不是繼續維護它。
    //
    // 直接對出貨 schema 走一遍，讀 walker 的產出（不是掃原始碼字串）。
    const seen: string[] = [];
    const visit = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      const node = n as { description?: string; items?: unknown[]; fields?: unknown[] };
      if (node.description) seen.push(node.description);
      for (const k of ["items", "fields", "options", "variants"] as const) {
        const arr = (n as Record<string, unknown>)[k];
        if (Array.isArray(arr)) arr.forEach(visit);
      }
      for (const v of Object.values(n as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) visit(v);
      }
    };
    visit(walkZod(zItemDoc as unknown as z.ZodTypeAny));
    expect(seen.length, "出貨 schema 上一句 .describe() 都沒有了").toBeGreaterThan(0);
  });
});
