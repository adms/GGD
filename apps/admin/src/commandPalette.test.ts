/**
 * ⌘K 指令面板 —— 驗**排序純函式**，餵的是出貨在用的那份 `NAV`（⛔ 不是自己編一份
 * 夾具：那會是失敗形態⑤，量一個虛構通道）。admin 的 vitest 跑 node，沒有 DOM，
 * 所以鍵盤那一段的可測性是靠把比對抽成 `rankPages`，⛔ 不是模擬 keydown。
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { NAV } from "./ui/App";
import { CommandPalette, pushRecent, rankPages } from "./ui/CommandPalette";
import type { NavRow } from "./ui/navGroups";

const rows = (): NavRow[] => [...NAV];
const keys = (q: string, recent?: string[]): string[] =>
  rankPages(rows(), q, recent ? { recent } : {}).map((r) => r.key);

describe("指令面板搜尋", () => {
  it("打中文標題找得到那一頁", () => {
    expect(keys("傷害")).toContain("damageTiers");
    // 完全相符要贏過子字串：「暴擊規則」不可以被「暴走規則」之類的壓過去
    expect(keys("暴擊規則")[0]).toBe("critRules");
  });

  it("⭐ 縮寫靠同義詞表命中 —— 突變靶：拿掉 SYNONYM_GROUPS 這一條就紅", () => {
    // 「cd」在任何一個標題上一個字都沒有；沒有同義詞表就只剩 page id 的分散字元
    // 命中（cooldownRules 的 c…d），名次會掉到別的頁後面而且 via 不可能是 synonym。
    const top = rankPages(rows(), "cd")[0];
    expect(top?.key).toBe("cooldownRules");
    expect(top?.via).toBe("synonym");
    expect(keys("vfx")).toContain("vfxCleanup");
    expect(keys("mp")).toContain("manaTiers");
  });

  it("找不到就回空 —— ⛔ 不是回全部 121 頁", () => {
    expect(keys("zzzzq")).toEqual([]);
    // 多個 token 是 AND：兩個都要中
    expect(keys("傷害 zzzzq")).toEqual([]);
  });

  it("同分時最近用過的排前面", () => {
    const plain = keys("五級距");
    expect(plain).toContain("manaTiers");
    expect(plain).toContain("damageTiers");
    const withRecent = keys("五級距", ["manaTiers"]);
    expect(withRecent.indexOf("manaTiers")).toBeLessThan(withRecent.indexOf("damageTiers"));
    // 空 query ⇒ 面板一打開就是「最近用過」
    expect(keys("", ["mobWaves"])[0]).toBe("mobWaves");
  });

  it("pushRecent 去重、最新在前、有上限", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent(["a", "b"], "z", 2)).toEqual(["z", "a"]);
  });
});

describe("指令面板元件", () => {
  const el = (open: boolean): React.JSX.Element =>
    createElement(CommandPalette, { rows: rows(), open, onNavigate: () => {}, onClose: () => {} });

  it("開著的時候真的畫出列（標題＋它在哪一組），關著回 null", () => {
    const html = renderToString(el(true));
    expect(html).toContain(NAV[0]!.label);
    expect(html).toContain(NAV[0]!.section); // ⭐ 分組那一格是這個面板的心智圖來源
    expect(html).toContain("palette-query");
    expect(renderToString(el(false))).toBe("");
  });
});
