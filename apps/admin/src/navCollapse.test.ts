/**
 * 收納/展開 —— 用**真的元件**驗，不是掃字串。
 *
 * `NavRail` 是出貨在用的那一個左欄（`ui/App.tsx` 的 `Console` 直接 render 它），
 * 這裡用 `renderToString` 把它畫出來讀 HTML。admin 的 vitest 跑在
 * `environment: "node"`，沒有 DOM 也沒有 localStorage —— 所以收納偏好的存放處是一個
 * **注入的** `prefStore`，測試餵一個假的進去。
 *
 * 這條守衛要擋的缺陷是「收納做了但沒有真的收」:一個把 `open` 算出來卻照樣把所有列
 * 都畫出去的實作(例如把 `{open && ...}` 寫成 `{...}`)，在只檢查「有收納按鈕」的
 * 測試底下是全綠的。所以下面每一條都同時斷言**該在的在、該不在的不在**。
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { NAV, NavRail, externalRows } from "./ui/App";
import {
  DEFAULT_COLLAPSED_SECTIONS,
  NAV_COLLAPSE_STORAGE_KEY,
  loadCollapsed,
  saveCollapsed,
  toggleCollapsed,
  type NavPrefStore,
  type NavRow,
} from "./ui/navGroups";
import type { Page } from "./store";

const TAG = "adminui-nav-collapse";

const rows = (): NavRow[] => [...NAV, ...externalRows()];

/** 一個假的 localStorage，開場就裝著指定的收納狀態。 */
function fakeStore(collapsed: readonly string[]): NavPrefStore & { readonly written: string[] } {
  const map = new Map<string, string>([[NAV_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsed)]]);
  const written: string[] = [];
  return {
    written,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
      written.push(v);
    },
  };
}

function render(opts: { page: Page; collapsed: readonly string[]; narrow?: boolean; pending?: number }): string {
  return renderToString(
    createElement(NavRail, {
      rows: rows(),
      page: opts.page,
      narrow: opts.narrow ?? false,
      pendingCount: opts.pending ?? 0,
      isLocked: () => false,
      onNavigate: () => undefined,
      prefStore: fakeStore(opts.collapsed),
    }),
  );
}

describe("左欄畫得出來，而且展開時每一頁都在上面", () => {
  it("沒有收起任何一組時，NAV 的每一個標籤都出現在 DOM 裡", () => {
    cover(TAG);
    const html = render({ page: "hub", collapsed: [] });
    const missing = NAV.filter((n) => !html.includes(n.label)).map((n) => `${n.page}(${n.label})`);
    expect(missing, `這些列算進了 NAV 卻沒有畫出來：${missing.join(", ")}`).toEqual([]);
  });

  it("八個分組標題都畫出來了", () => {
    cover(TAG);
    const html = render({ page: "hub", collapsed: [] });
    for (const s of ["營運", "內容·素材管理", "資產產線", "戰鬥規則", "武器道具", "肉鴿殭屍", "鑄技工坊", "系統"]) {
      expect(html, `分組標題「${s}」沒有畫出來`).toContain(s);
    }
  });

  it("/editor/ 的外部入口是一個真的 <a>，帶著它的說明", () => {
    cover(TAG);
    const html = render({ page: "hub", collapsed: [] });
    expect(html).toContain("鑄技工坊（/editor/）");
    expect(html, "外部入口沒有 href —— 那就是一個死連結").toMatch(/<a[^>]+href="[^"]*editor/);
    expect(html, "沒有把「還沒搬進來」講出來").toContain("尚未搬進本後台");
  });
});

describe("收起來的那一組，它的頁面不在 DOM 裡（所以點不到）", () => {
  it("收起「肉鴿殭屍」→ 兩列消失，標題還在，其他組一列都沒少", () => {
    cover(TAG);
    const open = render({ page: "hub", collapsed: [] });
    const shut = render({ page: "hub", collapsed: ["肉鴿殭屍"] });

    // 展開時在
    expect(open).toContain("殭屍波系統");
    expect(open).toContain("殭屍王出場演出");
    // 收起後不在 —— 這是收納功能的行為定義
    expect(shut, "收起來了但那一列還畫在 DOM 上 —— 收納根本沒生效").not.toContain("殭屍波系統");
    expect(shut).not.toContain("殭屍王出場演出");
    // 標題必須留著,否則「收起來」跟「那一組被刪掉」在畫面上一模一樣
    expect(shut, "分組標題也不見了 —— 那就沒有東西可以展開回來").toContain("肉鴿殭屍");
    // 其他組完全不受影響
    for (const n of NAV.filter((x) => x.section !== "肉鴿殭屍")) {
      expect(shut, `收起「肉鴿殭屍」不該影響 ${n.label}`).toContain(n.label);
    }
  });

  it("展開回來 → 那兩列又點得到了", () => {
    cover(TAG);
    const reopened = render({ page: "hub", collapsed: [] });
    expect(reopened).toContain("殭屍波系統");
    expect(reopened).toContain("殭屍王出場演出");
  });

  it("手機版（橫向捲動條）也一樣會收 —— 收納不是只有桌機有", () => {
    cover(TAG);
    // 手機上分組標題畫成一顆行內的小 chip，而不是整行的標題,所以那條「單一橫向
    // 捲動列」的版型還在。⚠️ 少了這一條，手機上就會出現「收起來了但還是全部畫著」
    // 的第二套行為，而沒有人會發現（失敗形態 ⑤：被測的不是出貨的那個）。
    const open = render({ page: "hub", collapsed: [], narrow: true });
    const shut = render({ page: "hub", collapsed: ["肉鴿殭屍"], narrow: true });
    expect(open).toContain("殭屍波系統");
    expect(shut).not.toContain("殭屍波系統");
    expect(shut).toContain("肉鴿殭屍");
  });

  it("目前所在的那一組被收起來時，會被強制展開", () => {
    cover(TAG);
    const html = render({ page: "mobWaves", collapsed: ["肉鴿殭屍"] });
    expect(html, "站在被收起來的分組裡卻看不到自己那一列").toContain("殭屍波系統");
  });

  it("待審徽章不會被收納吃掉 —— 它跳到收起來的標題上", () => {
    cover(TAG);
    const shut = render({ page: "hub", collapsed: ["營運"], pending: 3 });
    expect(shut, "帳號審核那一列被收起來了（預期中）").not.toContain("帳號審核");
    expect(shut, "有人在等審核，但收納把通知一起藏掉了（#126 的整個重點）").toContain(
      "3 個帳號在等審核",
    );
  });
});

describe("收納狀態記得住（重整之後還在）", () => {
  it("存進去什麼就讀回什麼", () => {
    cover(TAG);
    const store = fakeStore([]);
    saveCollapsed(store, new Set(["系統", "營運"]));
    expect(loadCollapsed(store)).toEqual(new Set(["系統", "營運"]));
  });

  it("沒有 store（node / 隱私模式）不會炸，退回預設", () => {
    cover(TAG);
    expect(loadCollapsed(null)).toEqual(new Set(DEFAULT_COLLAPSED_SECTIONS));
    expect(() => saveCollapsed(null, new Set(["系統"]))).not.toThrow();
  });

  it("壞掉的偏好值退回預設，而不是讓左欄空掉", () => {
    cover(TAG);
    const broken: NavPrefStore = { getItem: () => "{not json", setItem: () => undefined };
    expect(loadCollapsed(broken)).toEqual(new Set(DEFAULT_COLLAPSED_SECTIONS));
    const wrongShape: NavPrefStore = { getItem: () => '{"系統":true}', setItem: () => undefined };
    expect(loadCollapsed(wrongShape)).toEqual(new Set(DEFAULT_COLLAPSED_SECTIONS));
  });

  it("出貨的預設是「全部展開」—— 第一次打開後台不會看起來像頁面被刪光了", () => {
    cover(TAG);
    expect(DEFAULT_COLLAPSED_SECTIONS).toEqual([]);
  });

  it("toggle 來回一次回到原狀，而且不改原本的集合", () => {
    cover(TAG);
    const start: ReadonlySet<string> = new Set(["系統"]);
    const once = toggleCollapsed(start, "營運");
    expect(once).toEqual(new Set(["系統", "營運"]));
    expect(start, "toggle 改到了傳進去的那個集合").toEqual(new Set(["系統"]));
    expect(toggleCollapsed(once, "營運")).toEqual(new Set(["系統"]));
  });
});
