/**
 * 「新增一張場地」的起手式（GH#324，owner 2026-08-14「之後新增場景盡量自動化」）。
 *
 * ## ⛔ 這一份取代的是編輯器裡一段**手打的** tiles
 *
 * 在此之前 `apps/editor/src/collections.ts` 的 `maps` 樣板裡有 16 行手打的
 * `#` 與 `.`，而它的註解寫著：
 *
 * > ⚠️ 樣板刻意給一張**最小但合法**的圖…好讓「新建一張地圖」不會一開場就是一堆紅字
 *
 * **那句話是假的**（第三守則）。實測跑一次驗證器：
 *
 * ```
 * 樣板通過驗證: false
 * 問題: disconnectedRegions(hard) · loops · chokepoints · interactions · regions · traversal
 * ```
 *
 * 中央那個房間**四面全封**（`#....##########....#` 是一圈實心牆），所以裡面
 * 一格都走不到 —— 那正是 `disconnectedRegions` 這條 hard 檢查存在的理由。
 * ⇒ 按「新建」得到的是一份**產生器會拒絕輸出**的文件。
 *
 * ## ⭐ 根因不是那 16 行打錯，是它**存在**
 *
 * 版面的產生器 `generateTiles()` 就在隔壁，而樣板自己手打了一份 ——
 * 那是第二個真相來源，⛔ 它必然會漂移，而且漂移的時候沒有任何東西會叫。
 * 現在樣板**呼叫同一個產生器**，並且由守衛逐一驗證四個模板都 `report.ok`。
 *
 * ⚠️ 這一份的產出是**起點不是成品**：真正出貨的圖會手工調 tiles（那才是
 * 「看起來像無限城」的地方），驗證器會檢查調完之後仍然合格。
 */
import type { BackdropLayerSpec } from "./backdrop";
import { generateTiles } from "./templates";
import type { MapTemplate } from "../content/schema/map";
import { isWalkable, type TileGrid } from "./graph";

/** 起手式的預設背景 —— 藍紫夜 + 鳥居剪影 + 暖色逆光（動漫母題，owner 2026-08-14）。 */
const STARTER_BACKDROP: BackdropLayerSpec[] = [
  { fromRadius: 1, toRadius: 2.05, y: -4, profile: "torii", jitter: 0.8, segments: 36 },
  { fromRadius: 1.8, toRadius: 3.4, y: -14, profile: "cloudSea", jitter: 0.6, segments: 36 },
  { fromRadius: 3.1, toRadius: 5.2, y: -34, profile: "pagoda", jitter: 0.75, segments: 40 },
  { fromRadius: 4.8, toRadius: 6, y: -70, profile: "flat", jitter: 0, segments: 24 },
];
const STARTER_BACKDROP_SKIN: { color: string; rim?: { color: string; width: number } }[] = [
  { color: "#3b2a5c", rim: { color: "#ffb765", width: 2.2 } },
  { color: "#2a1c46", rim: { color: "#8f6ad6", width: 1.6 } },
  { color: "#1a1230", rim: { color: "#5b3f9e", width: 1.2 } },
  { color: "#0d0a1a" },
];

/**
 * 從可走格裡挑 `count` 個**散得開**的位置。
 *
 * 做法：把格盤切成 `count` 個角度扇區，每個扇區取離中心 55% 半徑處最近的可走格。
 * ⚠️ 決定性（同一張圖永遠同一組），⛔ 零 `Math.random`。
 * ⚠️ 一定要落在**可走**格上 —— 擺在牆裡的互動點會被驗證器判成「到不了的物件」。
 */
function spreadPoints(g: TileGrid, count: number): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  const cc = (g.cols - 1) / 2;
  const cr = (g.rows - 1) / 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const wantC = cc + Math.cos(a) * cc * 0.62;
    const wantR = cr + Math.sin(a) * cr * 0.62;
    // 由近而遠找最近的可走格；⛔ 不重複已挑過的。
    let best: { col: number; row: number } | null = null;
    let bestD = Infinity;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (!isWalkable(g, c, r)) continue;
        if (out.some((p) => p.col === c && p.row === r)) continue;
        // 跟已挑的點至少隔開 3 格，否則兩個點會擠在同一個角落
        if (out.some((p) => Math.abs(p.col - c) < 3 && Math.abs(p.row - r) < 3)) continue;
        const d = (c - wantC) ** 2 + (r - wantR) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { col: c, row: r };
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/**
 * 產生一份**完整、合法、通得過驗證器**的 `map@1`。
 *
 * @param id 文件 id（`map.xxx`）
 * @param template 四個封閉模板之一
 * @param grid 格數；預設 24×18（出貨七張圖用的尺寸）
 */
export function starterMap(
  id: string,
  template: MapTemplate = "CENTRAL_RING",
  grid: { cols: number; rows: number; tileSize: number } = { cols: 24, rows: 18, tileSize: 2 },
): Record<string, unknown> {
  const tiles = generateTiles(template, grid);
  const g: TileGrid = { cols: grid.cols, rows: grid.rows, tiles };

  // 5 個區域（規格偏好 5）。中央核心 + 四邊。⚠️ 用矩形而不是逐格列舉。
  const coreW = Math.max(4, Math.floor(grid.cols * 0.42));
  const coreH = Math.max(4, Math.floor(grid.rows * 0.42));
  const coreC = Math.floor(grid.cols / 2) - Math.floor(coreW / 2);
  const coreR = Math.floor(grid.rows / 2) - Math.floor(coreH / 2);
  const regions = [
    { id: "core", label: "中央", role: "landmark" as const, rects: [{ col: coreC, row: coreR, w: coreW, h: coreH }] },
    { id: "north", label: "北側", role: "outer" as const, rects: [{ col: 1, row: 1, w: grid.cols - 2, h: Math.max(1, coreR - 1) }] },
    { id: "south", label: "南側", role: "court" as const, rects: [{ col: 1, row: coreR + coreH, w: grid.cols - 2, h: Math.max(1, grid.rows - coreR - coreH - 1) }] },
    { id: "west", label: "西廊", role: "corridor" as const, rects: [{ col: 1, row: coreR, w: Math.max(1, coreC - 1), h: coreH }] },
    { id: "east", label: "東廊", role: "corridor" as const, rects: [{ col: coreC + coreW, row: coreR, w: Math.max(1, grid.cols - coreC - coreW - 1), h: coreH }] },
  ];

  // 8 個互動點（規格 6–10）。⭐ kind 交錯，讓治療花與守衛塔都有錨點 ——
  // ⛔ 全部同一種的話，兩個消費端只有一個會動。
  const KINDS = ["pickup", "capture"] as const;
  const interactions = spreadPoints(g, 8).map((at, i) => ({
    id: `poi-${i + 1}`,
    kind: KINDS[i % 2]!,
    at,
    radius: 2,
    // 區域只影響報告分類，所以逐點對應到哪一區用的是**位置**而不是猜的。
    regionId:
      at.row < coreR
        ? "north"
        : at.row >= coreR + coreH
          ? "south"
          : at.col < coreC
            ? "west"
            : at.col >= coreC + coreW
              ? "east"
              : "core",
    params: {},
  }));

  return {
    id,
    schema: "map@1",
    name: "新場地",
    note: "⚙️ 這份是「新增場地」的起手式，tiles 由 starterMap() 產生。手工調 tiles 之後編輯器會即時重跑九項驗證。",
    template,
    grid,
    tiles,
    regions,
    landmark: "core",
    interactions,
    gimmick: { kind: "none" },
    landmarkProps: [],
    backgroundProps: [],
    backdrop: {
      layers: STARTER_BACKDROP.map((l, i) => ({ ...l, ...STARTER_BACKDROP_SKIN[i]!, alpha: 1 })),
    },
  };
}
