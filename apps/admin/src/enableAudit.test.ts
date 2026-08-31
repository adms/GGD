import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enableAuditSummary, newlyEnabledIds, fetchEnableAudit, enableAuditResultText } from "./enableAudit";
import type { WhitelistDoc } from "./curation";

/**
 * ⭐⭐ GH#473 —— **啟用上架的當下自動跑稽核**（owner 2026-08-18：
 * 「你應該是要**設計啟用的時候才做自動跑測試 script**，測試結果再排入是否修理」）。
 *
 * ⭐ 這條守衛釘住**兩件會靜默壞掉**的事，⛔ 不是「函式回對的值」：
 * ① **成本斷言**：沒有新啟用 ⇒ ⛔ 一支稽核都不跑（票文逐字「不啟用就不花錢」）
 * ② ⭐⭐ **基準必須是存檔前的伺服器狀態** —— ⛔ 拿 draft 減 draft 永遠是空集合，
 *    ⇒ 那會是一個**永遠不會叫的閘**（失敗形態⑨），而它看起來完全正常。
 */
const doc = (c: string[], i: string[] = [], a: string[] = []): WhitelistDoc =>
  ({ champions: c, items: i, abilities: a }) as WhitelistDoc;

describe("GH#473 啟用當下的稽核", () => {
  it("⭐ 只算**新啟用**的（⛔ 停用的不算 —— 下架不必驗內容合不合法）", () => {
    expect(newlyEnabledIds(doc(["a", "b"]), doc(["b", "c"]))).toEqual(["c"]);
  });

  it("★ ⭐ 成本斷言：沒有新啟用 ⇒ `null` ⇒ 呼叫端**完全不叫稽核**", () => {
    expect(enableAuditSummary(doc(["a"]), doc(["a"]))).toBeNull();
    // ⚠️ 只有停用也不算 —— ⛔ 不可以因為「有變動」就跑。
    expect(enableAuditSummary(doc(["a", "b"]), doc(["a"]))).toBeNull();
  });

  it("有新啟用時給得出人看得懂的一句（三個集合都算）", () => {
    const s = enableAuditSummary(doc([], [], []), doc(["x"], ["y", "z"], []));
    expect(s).toContain("英雄 1");
    expect(s).toContain("道具 2");
    expect(s).not.toContain("技能"); // ⛔ 沒有新啟用的那一類不該出現
  });

  it("★ ⭐⭐ 接線點抓的是**存檔前的 server**，⛔ 不是 draft（否則是永遠不會叫的閘）", () => {
    const src = readFileSync(resolve(__dirname, "ui/CurationPage.tsx"), "utf8");
    const save = src.slice(src.indexOf("const onSave = async"));
    const iBefore = save.indexOf("const before = server;");
    const iSet = save.indexOf("setServer(doc);");
    expect(iBefore, "⛔ 沒有抓存檔前的基準").toBeGreaterThan(-1);
    expect(
      iBefore,
      "⛔ `const before = server` 必須在 `setServer(doc)` **之前** —— " +
        "之後抓的話 server 已經等於新狀態，差集永遠是空的（⭐ 一個永遠不會叫的閘）。",
    ).toBeLessThan(iSet);
    expect(save).toContain("enableAuditSummary(before, doc)");
  });
});

/**
 * ⭐⭐ GH#473 —— 啟用的當下**真的把稽核跑出來**，而它有**三態**。
 *
 * ⚠️⚠️ 承重的那一條是 `unavailable`：`/__review` 是 **dev-only** 的 vite middleware
 * （CLAUDE.md GH#794：`/__review` 與 `/__live` 在本機活著而**線上沒有**）
 * ⇒ ⛔ 正式後台按下「啟用」時它會 404。
 * ⭐ 而「稽核跑不到」**必須看起來與「稽核通過」不一樣** ——
 * ⛔ 否則操作者把一個沒跑過的稽核讀成一張乾淨的成績單。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `!res.ok` 那一支改成回 `{state:"ran",rows:[]}` → 「跑不到 ≠ 通過」紅
 *   · `ids.length === 0` 提早回傳拿掉 → 「不啟用就不花錢」紅
 */
describe("GH#473 稽核的三態", () => {
  const ok = (rows: unknown[]) =>
    (async () => ({ ok: true, json: async () => ({ rows }) })) as unknown as typeof fetch;

  it("⭐ **沒有新啟用 ⇒ 一個網路都不打**（票文的成本斷言：「不啟用就不花錢」）", async () => {
    let called = 0;
    const spy = (async () => {
      called++;
      return { ok: true, json: async () => ({ rows: [] }) };
    }) as unknown as typeof fetch;
    expect(await fetchEnableAudit([], spy)).toEqual({ state: "skipped" });
    expect(called, "⛔ 空清單還去打網路 = 每次存檔都付一次錢").toBe(0);
  });

  it("⭐ 跑過且乾淨 ⇒ `ran` ＋ 0 列，文字說「稽核通過」", async () => {
    const r = await fetchEnableAudit(["a"], ok([]));
    expect(r).toEqual({ state: "ran", rows: [] });
    expect(enableAuditResultText(r)).toContain("稽核通過");
  });

  it("★⭐⭐ **跑不到 ≠ 通過** —— 404 要說「稽核沒有跑」，⛔ 不是靜靜什麼都不說", async () => {
    // ⚠️ ⭐ 真的 `fetch` 在 404 時**仍然有 `json()`**（回的是錯誤頁）——
    //   ⛔ 我第一版的 stub 沒有它，於是 fall-through 會 throw 而被 catch 接住
    //   ⇒ 突變「404 也當成跑過」**照樣是綠的**（夾具遮住了缺陷，形態⑩）。
    const notThere = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not Found" }),
    })) as unknown as typeof fetch;
    const r = await fetchEnableAudit(["a"], notThere);
    expect(r.state).toBe("unavailable");
    const text = enableAuditResultText(r);
    expect(text, "⛔ 空字串 = 與通過長得一模一樣").not.toBe("");
    expect(text).toContain("稽核沒有跑");
    expect(text, "⛔ 不可以帶「通過」兩個字").not.toContain("稽核通過");
  });

  it("⭐ 連不上（throw）也走 `unavailable`，⛔ 不是讓整個存檔失敗", async () => {
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await fetchEnableAudit(["a"], boom);
    expect(r.state).toBe("unavailable");
    expect(enableAuditResultText(r)).toContain("ECONNREFUSED");
  });

  it("⭐ 有發現 ⇒ 列出前幾筆並帶總數（⛔ 不是只說「有問題」）", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, finding: `問題${i}` }));
    const t = enableAuditResultText(await fetchEnableAudit(["a"], ok(rows)));
    expect(t).toContain("7 個發現");
    expect(t).toContain("x0：問題0");
    expect(t, "⛔ 全部列出來會把 flash 撐爆").toContain("共 7 項");
  });
});
