import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { walkZod } from "./walk";
import type { UINode } from "./uiSchema";

/**
 * ⭐⭐ **契約說引擎做得到的每一種 effect，表單產生器都要走得出來。**
 *
 * ── ⛔ 為什麼這條閘在此之前不存在 ────────────────────────────────────────
 * 我在 `docs/editor-contract/CODEX_CATCHUP_20260830.md` 與
 * `packages/shared/src/ops/editorCoverageFresh.test.ts` 的檔頭裡都寫過：
 *
 * > 「⚠️ `apps/editor` **不在 main 上** ⇒ 一條寫在 main 的測試讀不到它
 * >   ⇒ 那會是一條**永遠不會紅的閘**」
 *
 * ⛔⛔ **那句話是假的。** 2026-08-31 量到：
 * `git ls-files apps/editor/` = **78 個檔**、**17 支測試**、在 pnpm workspace 裡。
 *
 * ⇒ ⭐ 我因為一個假前提，把一條**今天就寫得了**的閘外包了出去 ——
 * ⚠️ 而那反而製造了它自己描述的那個問題（main 這邊永遠看不到它綠也看不到它紅）。
 *
 * ── ⭐ 這條閘問的是**兩個名詞的關係** ──────────────────────────────────
 * 「契約（`ggd-editor-coverage.json`）宣告的每一個 **effect kind**，
 *   `walkZod(zAbilityDoc)` 走出來的表單樹裡有沒有對應的一格？」
 *
 * ⚠️ ⭐ 而它**必須兩個方向都驗**（⛔ 只驗一頭一定會漏）：
 * · 契約有而表單沒有 ⇒ 🔴 **玩家碰不到那個機制**
 * · 表單有而契約沒有 ⇒ 🔴 ⭐ **玩家做出來的東西上線就是死的**
 *
 * ── ⚠️ 它為什麼比「掃原始碼」強 ──────────────────────────────────────
 * 它跑的是**出貨的** `walkZod` 吃**出貨的** `zAbilityDoc` ——
 * ⛔ 不是 grep 檔案裡有沒有出現那個字串（失敗形態⑥）。
 * ⭐ 2026-08-31 實測過它抓得到的一個真實回歸：把 `zEffectDef` 包一層
 * `z.any().superRefine(...)` 之後，這棵樹的 `variants` 變成 `undefined`
 * ⇒ **46 種 effect 一格都走不出來**，而 `tsc` 是綠的。
 */

const REPO = join(import.meta.dirname, "../../../..");

/** 契約裡宣告的 effect kind（⭐ 機器可讀的那一份，⛔ 不是 md 的表格）。 */
const contractKinds = (): string[] => {
  const p = join(REPO, "docs/editor-contract/ggd-editor-coverage.json");
  const d = JSON.parse(readFileSync(p, "utf8")) as {
    required: { group: string; name: string }[];
  };
  return d.required.filter((r) => r.group === "effectKind").map((r) => r.name).sort();
};

/**
 * 表單樹裡 `effects` 那一格走得出來的 kind。
 * ⭐ 取法逐字照 `walk.test.ts:34` 的 `fieldsOf`（⛔ 不自己發明一個第二種走法）。
 */
const formKinds = (): string[] => {
  const root = walkZod(zAbilityDoc as never, "", "Ability") as UINode;
  if (root.kind !== "object") return [];
  const fields = (root as unknown as { fields: { path: string }[] }).fields;
  const effects = fields.find((f) => f.path.split(".").pop() === "effects") as unknown as {
    item?: { variants?: { tag: string }[] };
  };
  return (effects?.item?.variants ?? []).map((v) => v.tag).sort();
};

describe("表單產生器走得出契約宣告的每一種 effect", () => {
  it("⭐ 量尺先自證：兩邊都讀得到，⛔ 不是掃到 0 在空轉", () => {
    const c = contractKinds();
    const f = formKinds();
    expect(c.length, "契約讀不到 effectKind —— ggd-editor-coverage.json 過期或搬家").toBeGreaterThan(30);
    expect(
      f.length,
      "⛔ `walkZod` 一種 effect 都走不出來 —— ⭐ 多半是 `zEffectDef` 被包了一層 " +
        "（`superRefine` / `z.any()`）⇒ 可內省型別從 `discriminatedUnion` 變成 `unknown`。" +
        "⚠️ 那正是 2026-08-31 真的發生過的回歸，而 `tsc` 是綠的。",
    ).toBeGreaterThan(30);
  });

  it("★ 兩個方向：契約有而表單沒有 ⇒ 紅；表單有而契約沒有 ⇒ 也紅", () => {
    const c = new Set(contractKinds());
    const f = new Set(formKinds());
    const missingInForm = [...c].filter((k) => !f.has(k)).sort();
    const missingInContract = [...f].filter((k) => !c.has(k)).sort();

    expect(
      { 契約有而表單沒有: missingInForm, 表單有而契約沒有: missingInContract },
      [
        "⛔⛔ 契約與表單產生器**對不起來**：",
        `   · 契約有而表單走不出來（${missingInForm.length}）：${missingInForm.join(" · ") || "（無）"}`,
        `     ⇒ ⭐ **玩家碰不到那個機制**`,
        `   · 表單走得出來而契約沒宣告（${missingInContract.length}）：${missingInContract.join(" · ") || "（無）"}`,
        `     ⇒ ⭐⭐ **玩家做出來的東西上線就是死的**（失敗形態⑧）`,
        "",
        "⭐ 契約重生成：`pnpm editorcov:build`（⛔ 不要手改那份 JSON）",
        "⚠️ ⭐ 而如果**兩邊都是空的**，多半是 `zEffectDef` 被包了一層 —— 見上一條的訊息。",
      ].join("\n"),
    ).toEqual({ 契約有而表單沒有: [], 表單有而契約沒有: [] });
  });
});
