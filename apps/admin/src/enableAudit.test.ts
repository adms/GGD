import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enableAuditSummary, newlyEnabledIds } from "./enableAudit";
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
