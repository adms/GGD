/**
 * 🗺 導覽地圖版面的守衛（owner 2026-08-26「後台左側選項已經太長 不容易尋找、閱覽及管理」）。
 *
 * 它只驗 `layoutSections` 這一支純函式，因為那是這一頁**承重**的那條線：
 * 地圖的全部價值就是「一眼看到每個領域有多大」，而它只由兩件事決定 ——
 *   ① 每一頁都真的被畫出來（漏一頁是靜默的：地圖上沒有它，而它的元件/路由全綠）
 *   ② 區塊寬度真的跟著頁數走（不然它就只是把左欄複製成一張一樣長的清單）
 *
 * ⚠️ 讀的是**出貨在用的** `NAV`（`import { NAV } from "./ui/App"`），⛔ 不是自造夾具
 * （失敗形態⑤：被測的不是出貨的那一份）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NAV, SECTION_ORDER, externalRows } from "./ui/App";
import { rowKey, type NavRow } from "./ui/navGroups";
import { GRID_COLUMNS, layoutSections } from "./ui/NavMapPage";

const TAG = "adminui-navmap";
const ROWS: NavRow[] = [...NAV, ...externalRows()];

describe("導覽地圖：把左欄那條線攤成一個平面", () => {
  it("每一列恰好被分配到一個區塊 —— 沒有一頁掉了，也沒有一頁被畫兩次", () => {
    const keys = layoutSections(ROWS, SECTION_ORDER).flatMap((b) => b.rows.map(rowKey));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(ROWS.map(rowKey).sort());
    cover(TAG);
  });

  it("區塊寬度隨頁數單調不減，而且最大的組真的比最小的組寬", () => {
    const blocks = layoutSections(ROWS, SECTION_ORDER);
    expect(blocks.length).toBeGreaterThan(1);

    const asc = [...blocks].sort((a, b) => a.count - b.count);
    let prev = 0;
    for (const b of asc) {
      expect(b.span).toBeGreaterThanOrEqual(prev);
      expect(b.span).toBeLessThanOrEqual(GRID_COLUMNS);
      prev = b.span;
    }

    // ⭐ 這一條是「把 span 算式改成常數」時會紅的那一行。單調不減自己擋不住常數
    // （常數也單調不減）—— 而一張每一塊都一樣寬的地圖，就是把左欄重畫了一次。
    const spans = asc.map((b) => b.span);
    expect(Math.max(...spans)).toBeGreaterThan(Math.min(...spans));
    cover(TAG);
  });

  it("order 沒列到的分組排到最後，⛔ 不是消失", () => {
    const sections = layoutSections(ROWS, []).map((b) => b.section);
    expect(sections.sort()).toEqual([...new Set(ROWS.map((r) => r.section))].sort());
    cover(TAG);
  });
});
