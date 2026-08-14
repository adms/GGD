/**
 * 四個 layout template（GH#324 Phase 2）。
 *
 * owner 2026-08-14：「**Claude 不要自由發揮。**限定只能從這些 Template 選。」
 * ⛔ 封閉四個，⛔ 沒有第五個，⛔ 沒有「為某一張圖特製的那一個」。
 *
 * ## 這個檔負責的兩件事
 *
 *  1. `generateTiles()` —— 從模板 + 格線**程序生成**一張可玩的 tile grid。
 *     新地圖用它開場，⛔ 不是手畫一張空白然後慢慢補。
 *  2. `describeTemplate()` —— 這個模板**承諾**了什麼拓撲（幾條迴圈、中央區存不存在）。
 *     驗證器拿它去對照**實際**的 tiles，所以 `template` 這一格不會變成裝飾用的字串。
 *
 * ⚠️ 判準（第〇·五守則）：**如果我在這裡為「無限城」寫一個 if，就越線了。**
 * 「無限城」在程式裡不應該有名字 —— 它只是 `CENTRAL_RING` + 一組參數 + 一張 tiles。
 *
 * ⚠️ 這個檔在 `src/map/` 而**不在** `src/sim/` 底下，所以不受 purity 閘管 ——
 * 烘焙期可以自由用 `Math.hypot`。runtime 消費端在 `src/sim/map/`，那些全部是查表。
 */
import type { MapTemplate } from "../content/schema/map";

export const FLOOR = ".";
export const WALL = "#";
export const VOID = " ";

export interface Grid {
  cols: number;
  rows: number;
}

/** 這個模板**承諾**的拓撲 —— 驗證器拿它對照實際 tiles。 */
export interface TemplateShape {
  /** 有沒有一個被包起來的中央區（玩家報位置的地標所在）。 */
  hasCore: boolean;
  /** 至少要有幾條獨立迴圈。⭐ 迴圈是「被追時能不能繞回來」的唯一來源。 */
  minLoops: number;
  /** 人看得懂的一句話，會印進驗證器報告。 */
  summary: string;
}

export function describeTemplate(t: MapTemplate): TemplateShape {
  switch (t) {
    case "CENTRAL_RING":
      return {
        hasCore: true,
        minLoops: 1,
        summary: "中央區被一圈外環包起來，外環自己成一條迴圈。",
      };
    case "CROSS_RING":
      return {
        hasCore: true,
        minLoops: 1,
        summary: "十字通道穿過中央，四角由外環相連。",
      };
    case "DOUBLE_LOOP":
      return {
        hasCore: false,
        minLoops: 2,
        summary: "兩個相鄰的環共用中間一條邊 —— 被追時有兩個方向可以繞。",
      };
    case "ARENA_RING":
      return {
        hasCore: true,
        minLoops: 1,
        summary: "方形觀眾廊包住中央擂台，四角是進出口。",
      };
  }
}

/** 空白畫布：外框一圈牆，內部全地面。 */
function blank(grid: Grid): string[][] {
  const g: string[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < grid.cols; c++) {
      const edge = r === 0 || c === 0 || r === grid.rows - 1 || c === grid.cols - 1;
      row.push(edge ? WALL : FLOOR);
    }
    g.push(row);
  }
  return g;
}

/** 在 grid 上畫一個**空心**矩形牆框，並在指定邊開口（開口 = 走得過去的門）。 */
function hollowRect(
  g: string[][],
  col: number,
  row: number,
  w: number,
  h: number,
  doors: { side: "n" | "s" | "e" | "w"; at: number; width: number }[],
): void {
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      const onEdge = r === row || c === col || r === row + h - 1 || c === col + w - 1;
      if (onEdge && g[r]?.[c] !== undefined) g[r]![c] = WALL;
    }
  }
  for (const d of doors) {
    for (let k = 0; k < d.width; k++) {
      if (d.side === "n" && g[row]?.[d.at + k] !== undefined) g[row]![d.at + k] = FLOOR;
      if (d.side === "s" && g[row + h - 1]?.[d.at + k] !== undefined)
        g[row + h - 1]![d.at + k] = FLOOR;
      if (d.side === "w" && g[d.at + k]?.[col] !== undefined) g[d.at + k]![col] = FLOOR;
      if (d.side === "e" && g[d.at + k]?.[col + w - 1] !== undefined)
        g[d.at + k]![col + w - 1] = FLOOR;
    }
  }
}

/** 一條軸對齊的牆（用來切出通道與瓶頸）。 */
function wallRun(g: string[][], col: number, row: number, len: number, dir: "h" | "v"): void {
  for (let k = 0; k < len; k++) {
    const c = dir === "h" ? col + k : col;
    const r = dir === "h" ? row : row + k;
    if (g[r]?.[c] !== undefined) g[r]![c] = WALL;
  }
}

/**
 * 從模板程序生成一張 tile grid。
 *
 * ⭐ 產出**一定**滿足：外框封閉、內部全連通、至少一條迴圈。
 * ⚠️ 但它只是**起點** —— 真正出貨的圖會在 `map@1` 的 `tiles` 手工調過
 * （那才是「看起來像無限城」的地方），而驗證器會逐項檢查調完之後仍然合格。
 */
export function generateTiles(template: MapTemplate, grid: Grid): string[] {
  const g = blank(grid);
  const midC = Math.floor(grid.cols / 2);
  const midR = Math.floor(grid.rows / 2);

  switch (template) {
    case "CENTRAL_RING": {
      // 中央一個房間，四面各開一道門 ⇒ 外圈自然形成一條環。
      const w = Math.max(5, Math.floor(grid.cols * 0.42));
      const h = Math.max(5, Math.floor(grid.rows * 0.42));
      const c0 = midC - Math.floor(w / 2);
      const r0 = midR - Math.floor(h / 2);
      // ⚠️ 門寬 4 而不是 2：**2 格寬的門會被判成瓶頸**（通道寬度 ≤2），
      // 四道門就是四個瓶頸，而規格只要 2–3 個。實測（無限城）把南北門加寬到 4、
      // 東西門留 1 之後，瓶頸剛好落在 2 —— 那兩個窄門才是真正想要的戰術地形。
      hollowRect(g, c0, r0, w, h, [
        { side: "n", at: midC - 2, width: 4 },
        { side: "s", at: midC - 2, width: 4 },
        { side: "w", at: midR, width: 1 },
        { side: "e", at: midR, width: 1 },
      ]);
      break;
    }
    case "CROSS_RING": {
      // 四個角落各一塊實心街區 ⇒ 中間留下十字，外圈仍然通。
      // ⚠️ 街區 0.28 + pad 3 讓四周只剩 3 格寬的走廊，實測回報 **8 個瓶頸**。
      // 縮到 0.22 / pad 4 之後走廊變寬，瓶頸落回規格內 —— ⛔ 不是把規格調鬆。
      const bw = Math.max(3, Math.floor(grid.cols * 0.22));
      const bh = Math.max(3, Math.floor(grid.rows * 0.22));
      // ⭐ **刻意不對稱**：兩塊貼近外牆（留 2 格 ⇒ 那就是兩個瓶頸），
      // 兩塊退開（留 4 格 ⇒ 寬走廊）。全部對稱的話不是 8 個瓶頸就是 0 個 ——
      // 實測兩種都試過，規格要的 2–3 只有不對稱做得到。
      const near = 2;
      const far = 4;
      // ⚠️ **只有一塊**貼近外牆。兩塊貼近時實測是 4 個瓶頸（每塊在兩個方向各造一條
      // 窄走廊），而規格要 2–3 ⇒ 一塊剛好給 2 個。
      for (const [c0, r0] of [
        [near, near],
        [grid.cols - far - bw, far],
        [far, grid.rows - far - bh],
        [grid.cols - far - bw, grid.rows - far - bh],
      ] as const) {
        for (let r = r0; r < r0 + bh; r++) {
          for (let c = c0; c < c0 + bw; c++) if (g[r]?.[c] !== undefined) g[r]![c] = WALL;
        }
      }
      break;
    }
    case "DOUBLE_LOOP": {
      // 一道中央隔牆把場地切成兩半，兩端各留開口 ⇒ 兩個環共用中間那條邊。
      wallRun(g, midC, 2, grid.rows - 4, "v");
      // 左右各再放一塊街區，讓兩邊各自成環而不是兩條走廊。
      const bw = Math.max(3, Math.floor(grid.cols * 0.18));
      const bh = Math.max(3, Math.floor(grid.rows * 0.34));
      const r0 = midR - Math.floor(bh / 2);
      for (const c0 of [Math.floor(grid.cols * 0.2), Math.floor(grid.cols * 0.72)]) {
        for (let r = r0; r < r0 + bh; r++) {
          for (let c = c0; c < c0 + bw; c++) if (g[r]?.[c] !== undefined) g[r]![c] = WALL;
        }
      }
      break;
    }
    case "ARENA_RING": {
      // 中央實心擂台 + 一圈觀眾廊；擂台四角開口。
      const w = Math.max(5, Math.floor(grid.cols * 0.38));
      const h = Math.max(5, Math.floor(grid.rows * 0.38));
      const c0 = midC - Math.floor(w / 2);
      const r0 = midR - Math.floor(h / 2);
      // ⚠️ 同 CENTRAL_RING：兩道寬門（不算瓶頸）＋ 兩道窄門（就是那 2 個瓶頸）。
      hollowRect(g, c0, r0, w, h, [
        { side: "n", at: c0 + 1, width: 4 },
        { side: "s", at: c0 + w - 5, width: 4 },
        { side: "w", at: r0 + 1, width: 1 },
        { side: "e", at: r0 + h - 2, width: 1 },
      ]);
      break;
    }
  }
  return g.map((row) => row.join(""));
}
