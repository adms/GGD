/**
 * ⭐ GH#1106 —— 驗收包的事件節點欄要是**兩個軸**，⛔ 不是一欄兩因。
 *
 * ## ⛔ 在此之前它為什麼讀不出來
 *
 * 一欄 `noCodeEventAuthoring`，值只有兩個：
 *   · `skill-forge-effect-graph`（18 列）
 *   · `not-applicable`（29 列）
 * ⇒ ⭐ `not-applicable` 同時表示「**這一列不需要**事件節點」與「**需要而還沒做**」
 *   —— 讀的人分不出誰還沒做（票文逐字）。
 *
 * ## ⭐ 拆成兩軸之後，它們量的是**不同的東西**
 *
 * | 軸 | 問什麼 | 來源 |
 * |---|---|---|
 * | `adminEventAuthoring` | 後台**現在**編得動嗎 | `brickForm(hook, "hook")` 的**實際回傳** |
 * | `editorEventAuthoring` | 工坊收不收這個事件 | 編輯器自己的 `CAPABILITY_ONLY_HOOK_EVENTS` |
 *
 * ⚠️ ⭐ **今天兩欄的數字剛好一樣（29/18）** —— ⛔ 而那不是它們同一件事：
 * 它們從**兩個獨立的來源**推導 ⇒ 任一邊變，它們就會分開。
 * ⭐ 這正是驗收標準第 3 條要的「反方向」：Codex 交回節點圖之後**只有 editor 那一欄會動**。
 *
 * 突變驗證（2026-09-09）：
 *   · `adminAuthoring` 改成常數 `"admin-form"` → 第 2 條紅（與 `brickForm` 對不上）
 *   · 把 `onReflectSuccess` 塞進 `CAPABILITY_ONLY_HOOK_EVENTS` → 第 3 條紅（兩欄應分開而沒分開）
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brickForm } from "./abilityNodes";
import { CAPABILITY_ONLY_HOOK_EVENTS } from "../../editor/src/forge/skillAcceptanceCatalog";

type Row = {
  id: string;
  hookEvents?: string[];
  adminEventAuthoring?: string;
  editorEventAuthoring?: string;
};

const REPORT = join(__dirname, "..", "..", "..", "docs", "_reports", "editor-skill-acceptance-42x46.json");
const rows = (JSON.parse(readFileSync(REPORT, "utf-8")) as { rows: Row[] }).rows;

describe("事件節點的兩個軸（GH#1106）", () => {
  it("① 兩欄都存在，而且每一列都有值（⛔ 不是只有一欄）", () => {
    expect(rows.length, "驗收包是空的").toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.adminEventAuthoring, `${r.id} 沒有 adminEventAuthoring —— 一欄兩因還沒拆`).toBe("string");
      expect(typeof r.editorEventAuthoring, `${r.id} 沒有 editorEventAuthoring`).toBe("string");
    }
  });

  it("② admin 那一欄與 brickForm() 的實際回傳逐份一致（⛔ 驗關係，不是名詞）", () => {
    for (const r of rows) {
      const hooks = r.hookEvents ?? [];
      const covered = hooks.filter((h) => brickForm(h, "hook").length > 0).length;
      const want =
        hooks.length === 0 ? "not-applicable" : covered === hooks.length ? "admin-form" : `partial:${covered}/${hooks.length}`;
      expect(r.adminEventAuthoring, `${r.id}：報告說 ${r.adminEventAuthoring}，而 brickForm 逐個問出來是 ${want}`).toBe(want);
    }
  });

  it("③ editor 那一欄從編輯器自己的目錄推導 —— ⭐ 與 admin 是兩個獨立來源", () => {
    for (const r of rows) {
      const hooks = r.hookEvents ?? [];
      const blocked = hooks.filter((h) => (CAPABILITY_ONLY_HOOK_EVENTS as readonly string[]).includes(h)).sort();
      const want = hooks.length === 0 ? "not-applicable" : blocked.length === 0 ? "skill-forge-effect-graph" : `capability-only:${blocked.join(",")}`;
      expect(r.editorEventAuthoring, `${r.id}：報告說 ${r.editorEventAuthoring}，而編輯器目錄算出來是 ${want}`).toBe(want);
    }
  });

  it("④ 分母說得出來：兩欄各自的「需要事件節點」列數", () => {
    const needAdmin = rows.filter((r) => r.adminEventAuthoring !== "not-applicable").length;
    const needEditor = rows.filter((r) => r.editorEventAuthoring !== "not-applicable").length;
    // ⛔ 不釘死 18 —— 那是**出貨內容**的數字，會變（第二守則：驗機制不驗數字）。
    // ⭐ 釘的是關係：兩欄的「不適用」必須來自**同一批沒有 hook 的列**。
    const noHook = rows.filter((r) => (r.hookEvents ?? []).length === 0).length;
    expect(rows.length - needAdmin, "admin 的 not-applicable 應該正好是沒有 hook 的那些").toBe(noHook);
    expect(rows.length - needEditor, "editor 的 not-applicable 應該正好是沒有 hook 的那些").toBe(noHook);
  });
});
