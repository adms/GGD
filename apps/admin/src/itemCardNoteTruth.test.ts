/**
 * itemCardNoteTruth.test.ts — 後台說明文字不可以描述一個不存在的畫面元素。
 *
 * ── 為什麼有這個檔案 (2026-08-02) ─────────────────────────────────────────
 *
 * `ITEM_CARD_SPEC` 交付時，11 格裡有 4 格的 note 寫「卡片頂端那排**分類圖例**」，
 * 而客戶端**沒有任何圖例**：`categories.*.label` 唯一的去處是 `ItemCardBody.tsx`
 * 裡 chip 的 `title=`（滑鼠停留才看得到的原生 tooltip）。第五格 `loreHeadings`
 * 的 note 寫標題會「顯示出來」，而 `ItemCard.loreHeading` 在 production **零消費端**。
 *
 * ⚠️ 這比「複述欄位名」更糟：操作者會照著改、存檔、然後**找不到任何變化**，
 * 而畫面上沒有一個字告訴他哪裡錯了。CLAUDE.md 第三守則的後台版本。
 *
 * ⚠️ 而且它是**四層自洽一起錯**的形狀：`itemCardCategories()` /
 * `ITEM_CARD_CATEGORY_ORDER` / `ItemCard.loreHeading` 三個 API 都存在、有型別、
 * 有測試 —— 只是沒有人呼叫。API 存在讓那些 note 讀起來像真的。
 *
 * 這條守衛的作法：**掃 note 裡的「畫面元素名詞」，要求它在客戶端真的有消費端。**
 * 不是行為測試（掃字串，失敗形態 ⑥ 的親戚），但這是唯一在「說明文字說謊」這個
 * 問題上會紅的東西 —— 沒有任何行為測試會因為一段文案寫錯而失敗。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DOC_SPECS } from "./configForms";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * 讀客戶端原始碼，**剝掉註解**。
 *
 * ⚠️ 這個剝除不是潔癖：第一版直接掃全文，於是 `ItemCardBody.tsx` 檔頭一句
 * 「`legendary49OwnerText.test.ts` 逐位元組比對」裡的 **legendary** 命中了
 * `legend`，前提檢查當場誤報「客戶端有圖例了」。同一個坑 `hostDeployScript.test.ts`
 * 也踩過（`# export GGD_BUILD_STAMP=` 註解掉之後守衛沒紅）——
 * **「檔案裡出現這串字」與「這件事真的會執行」是兩回事**（失敗形態 ⑥）。
 */
function clientSource(rel: string): string {
  return readFileSync(join(REPO, "apps/client/src", rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** 一份 spec 裡所有的說明文字（欄位 note + 表格 intro/note + 頁面 intro）。 */
function allProse(spec: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") return void out.push(v);
    if (Array.isArray(v)) return void v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === "note" || k === "intro" || k === "title" || k === "zh") walk(x);
        else if (typeof x === "object") walk(x);
      }
    }
  };
  walk(spec);
  return out;
}

describe("後台說明不可以描述不存在的畫面元素", () => {
  const spec = CONFIG_DOC_SPECS.find((s) => s.docId === "item-card");

  it("★ ITEM_CARD_SPEC 真的註冊了（否則下面全是真空）", () => {
    expect(spec, "item-card 沒有後台頁 —— 這條守衛沒有東西可以驗").toBeTruthy();
  });

  it("★ 沒有任何一格說明提到「圖例」——因為客戶端沒有做圖例", () => {
    const body = clientSource("ui/components/ItemCardBody.tsx");
    // 前提先自我檢查：如果哪天真的做了圖例，這條斷言會失效，而下面那條就該放行。
    const hasLegend = /圖例|ITEM_CARD_CATEGORY_ORDER|itemCardCategories\(/.test(body);
    expect(
      hasLegend,
      "ItemCardBody 現在有圖例了 —— 那麼下面那條「不准提圖例」就過期了，請一起改。",
    ).toBe(false);

    const lying = allProse(spec).filter((t) => t.includes("圖例"));
    expect(
      lying,
      "後台說明提到「圖例」，但客戶端沒有畫任何圖例。\n" +
        "`categories.*.label` 唯一的去處是 chip 的 title= tooltip。\n" +
        "操作者會照著改、存檔、然後找不到變化（CLAUDE.md 第三守則）。",
    ).toEqual([]);
  });

  it("★ 沒有任何一格說明宣稱解說標題會「顯示出來」——它零消費端", () => {
    const body = clientSource("ui/components/ItemCardBody.tsx");
    expect(
      /loreHeading/.test(body),
      "ItemCardBody 現在會畫 loreHeading 了 —— 下面那條就過期了，請一起改。",
    ).toBe(false);

    const lying = allProse(spec).filter(
      (t) => t.includes("解說標題") && /顯示出來|印出來|畫出來/.test(t),
    );
    expect(lying, "說明宣稱解說標題會顯示，但 ItemCardBody 從不畫它。").toEqual([]);
  });

  it("★ 對照組：說明真的有提到 tooltip（＝有人把真實去處寫出來了）", () => {
    // 沒有這一條的話，把所有相關說明整段刪光也會綠 —— 那是失敗形態 ③。
    const honest = allProse(spec).filter((t) => t.includes("tooltip"));
    expect(honest.length, "沒有任何一格說出 label 真正的去處").toBeGreaterThan(0);
  });
});
