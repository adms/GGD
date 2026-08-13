/**
 * 把牆格合併成**盡量少的盒**（GH#324 Phase 2）。
 *
 * ⭐ 這個檔比 broad phase 重要，而且是量出來的：
 *
 *   碰撞的 relax 是 2 pass × 全部 obstacles，每個 body 每 tick 最多 3 個呼叫點
 *   ⇒ 約 5 次全掃。
 *
 *   | 情況 | obstacle 數 | 成本 |
 *   |---|---:|---|
 *   | **合併之後** | 30–60 | 60 body × 60 × 5 = 18,000 次／tick ≈ **0.1ms 級** |
 *   | 每格一個盒 | 150–200 | ×3–4，開始有感 |
 *
 * ⇒ 先做合併，空間索引（`staticGrid`）列為 optional，只有合併後仍 >150 個才做。
 *
 * ## 演算法：貪婪最大矩形
 *
 * 逐列掃，把連續的牆格拉成一條橫向 run，再往下試著把**寬度完全相同**的 run 疊起來。
 * ⚠️ 這不是最佳解（最佳矩形分割是 NP-hard），但它**決定性**、O(cols·rows)、
 * 而且對「房間的四面牆」這種真實輸入效果很好 —— 一面 10 格的牆會變成 1 個盒。
 */
import { WALL } from "./templates";
import type { TileGrid } from "./graph";

export interface TileRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

/**
 * 合併牆格。
 *
 * ⚠️ 回傳的順序是**掃描順序**（上到下、左到右）—— 決定性的唯一來源。
 * 產生器的 `--check` 靠它做位元比對，⛔ 任何「看起來比較整齊」的重排都會讓
 * 乾淨的重跑變成 diff，然後逼人把 `--check` 放寬成模糊比對 —— 而放寬的閘不是閘。
 */
export function mergeWalls(g: TileGrid): TileRect[] {
  const used: boolean[][] = Array.from({ length: g.rows }, () =>
    new Array<boolean>(g.cols).fill(false),
  );
  const isWall = (c: number, r: number): boolean =>
    r >= 0 && r < g.rows && c >= 0 && c < g.cols && g.tiles[r]![c] === WALL;

  const out: TileRect[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!isWall(c, r) || used[r]![c]) continue;

      // ① 往右拉出最長的一條 run
      let w = 0;
      while (isWall(c + w, r) && !used[r]![c + w]) w++;

      // ② 往下疊：只有整條寬度都還是未用的牆才算一層
      let h = 1;
      for (let rr = r + 1; rr < g.rows; rr++) {
        let ok = true;
        for (let cc = c; cc < c + w; cc++) {
          if (!isWall(cc, rr) || used[rr]![cc]) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
        h++;
      }

      for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) used[rr]![cc] = true;
      out.push({ col: c, row: r, w, h });
    }
  }
  return out;
}

/**
 * 格矩形 → 世界座標的盒（AABB）。
 *
 * 座標系：tile (0,0) 的**左上角**落在 `origin`，+col 往 +x，+row 往 +z。
 * ⚠️ 盒的 `center` 是**格的中心**，所以 halfW/halfD 是 `w * tileSize / 2`。
 */
export function rectToBox(
  rect: TileRect,
  tileSize: number,
  origin: { x: number; z: number },
): { center: { x: number; z: number }; halfW: number; halfD: number } {
  return {
    center: {
      x: origin.x + (rect.col + rect.w / 2) * tileSize,
      z: origin.z + (rect.row + rect.h / 2) * tileSize,
    },
    halfW: (rect.w * tileSize) / 2,
    halfD: (rect.h * tileSize) / 2,
  };
}

/** 格中心的世界座標（出生點、互動點、導航節點都走這一支）。 */
export function tileCenter(
  col: number,
  row: number,
  tileSize: number,
  origin: { x: number; z: number },
): { x: number; z: number } {
  return { x: origin.x + (col + 0.5) * tileSize, z: origin.z + (row + 0.5) * tileSize };
}
