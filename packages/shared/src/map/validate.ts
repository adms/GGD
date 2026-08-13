/**
 * 地圖驗證器（GH#324 Phase 2/4）。
 *
 * owner 點名要回報的九項全部在這裡：region 數 · 尺寸 · 不連通區塊 · 死路 ·
 * 迴圈數 · 瓶頸 · 平均與最長最短路徑 · 到不了的物件 · 非法出生點。
 *
 * ## ⛔ 兩種檢查，語意完全不同
 *
 * | | 例 | 誰決定 |
 * |---|---|---|
 * | **正確性**（hard） | 有區域走不到、出生點不可達、gate 某個組態把圖切斷、對戰分區數不足 | ⛔ **產生器一律拒絕輸出**，與後台設定無關 |
 * | **品味**（soft） | 死路數、迴圈數、瓶頸數、捷徑數、互動點數、橫跨時間 | 後台 `severity` 那一格（error / warn / off） |
 *
 * ⚠️ 那條線不可以動：「有區域走不到」不是意見，是壞掉。把它做成可調的那一刻，
 * 就會有人為了讓 CI 綠而把它關掉，然後出一張玩家會卡死在裡面的圖。
 *
 * ⛔ 這個檔**不抄任何規格數字** —— 全部從 `DEFAULT_MAP_SPEC`／傳進來的 spec 讀。
 * 抄一份就是第四個住處，而它沒有守衛（第零守則）。
 */
import type { MapDoc } from "../content/schema/map";
import type { DEFAULT_MAP_SPEC } from "../content/schema/mapSpecDoc";
import { DUEL_ZONES_PER_MAP_MIN, type MapCheckSeverity } from "./spec";
import { describeTemplate } from "./templates";
import {
  bakeNav,
  chokepointClusters,
  components,
  deadEndClusters,
  isWalkable,
  regionLoopCount,
  pathStats,
  pickNodes,
  walkableTiles,
  type GridPos,
  type TileGrid,
} from "./graph";

type Spec = typeof DEFAULT_MAP_SPEC;

export interface MapIssue {
  /** hard = 一律拒絕輸出；soft = 由 severity 決定。 */
  kind: "hard" | "soft";
  check: string;
  message: string;
  severity: MapCheckSeverity;
}

/** owner 點名的九項，全部量出來。 */
export interface MapReport {
  mapId: string;
  template: string;
  grid: { cols: number; rows: number; tileSize: number };
  worldSize: { w: number; d: number };
  regions: number;
  walkableTiles: number;
  disconnectedAreas: number;
  deadEnds: number;
  loops: number;
  chokepoints: number;
  shortcuts: number;
  interactions: number;
  avgShortestPath: number;
  longestShortestPath: number;
  estimatedTraversalSec: number;
  unreachableObjects: string[];
  invalidSpawns: string[];
  duelZones: number;
  issues: MapIssue[];
  /** 有沒有任何 hard 問題，或 severity=error 的 soft 問題。 */
  ok: boolean;
}

const soft = (
  issues: MapIssue[],
  check: string,
  sev: MapCheckSeverity,
  cond: boolean,
  message: string,
): void => {
  if (sev !== "off" && cond) issues.push({ kind: "soft", check, severity: sev, message });
};

const hard = (issues: MapIssue[], check: string, cond: boolean, message: string): void => {
  if (cond) issues.push({ kind: "hard", check, severity: "error", message });
};

/**
 * 驗證一張地圖。
 *
 * @param spawnTiles 這張圖編譯出來的出生格（兩側各 ≥ TEAM_SIZE 個）。
 * @param duelZones  編譯出來的對戰分區數。⭐ owner「這是一個 3v3 地形」⇒
 *                   一張 map = 一個分區的地形，產生器實例化 ≥2 份填進 `zones[]`。
 */
export function validateMap(
  doc: MapDoc,
  spec: Spec,
  spawnTiles: GridPos[][],
  duelZones: number,
): MapReport {
  const g: TileGrid = { cols: doc.grid.cols, rows: doc.grid.rows, tiles: doc.tiles };
  const issues: MapIssue[] = [];

  // ── 尺寸（品味項：規格窗）────────────────────────────────────────────────
  soft(
    issues,
    "gridSize",
    "warn",
    doc.grid.cols < spec.grid.colsMin ||
      doc.grid.cols > spec.grid.colsMax ||
      doc.grid.rows < spec.grid.rowsMin ||
      doc.grid.rows > spec.grid.rowsMax,
    `尺寸 ${doc.grid.cols}×${doc.grid.rows} 落在規格窗 ` +
      `${spec.grid.colsMin}–${spec.grid.colsMax} × ${spec.grid.rowsMin}–${spec.grid.rowsMax} 之外`,
  );

  // ── 連通性（⛔ 正確性，不可調）───────────────────────────────────────────
  const comp = components(g);
  hard(
    issues,
    "disconnectedRegions",
    comp.count !== 1,
    `可走區域被切成 ${comp.count} 塊 —— 玩家會被關在其中一塊裡。` +
      `⛔ 這不是品味問題，產生器拒絕輸出。`,
  );

  const tiles = walkableTiles(g);
  hard(issues, "disconnectedRegions", tiles.length === 0, "一格可走的地面都沒有");

  // ── 對戰分區數（⛔ 正確性）───────────────────────────────────────────────
  hard(
    issues,
    "duelZoneCount",
    duelZones < DUEL_ZONES_PER_MAP_MIN,
    `只編譯出 ${duelZones} 個對戰分區，至少要 ${DUEL_ZONES_PER_MAP_MIN} 個。` +
      `⚠️ 配對在 4 隊存活時一定吐出 zone 0 與 zone 1，而 MatchController 用的是` +
      `非空斷言 —— 只有一個分區的場地會在第 1–9 回合解參考 undefined。`,
  );

  // ── 出生點（⛔ 正確性）───────────────────────────────────────────────────
  const invalidSpawns: string[] = [];
  spawnTiles.forEach((side, si) => {
    side.forEach((p, pi) => {
      if (!isWalkable(g, p.col, p.row)) invalidSpawns.push(`side ${si} slot ${pi} @ ${p.col},${p.row}`);
    });
  });
  hard(
    issues,
    "unreachableSpawn",
    invalidSpawns.length > 0,
    `${invalidSpawns.length} 個出生點不在可走的地面上：${invalidSpawns.join(" / ")}`,
  );

  // ── 互動點可達（⛔ 正確性）───────────────────────────────────────────────
  const unreachable: string[] = [];
  for (const it of doc.interactions) {
    if (!isWalkable(g, it.at.col, it.at.row)) unreachable.push(`interaction "${it.id}"`);
  }
  // region 至少要有一格可走 —— 否則那個名字是畫上去的
  for (const rg of doc.regions) {
    const any = rg.rects.some((rc) => {
      for (let r = rc.row; r < rc.row + rc.h; r++) {
        for (let c = rc.col; c < rc.col + rc.w; c++) if (isWalkable(g, c, r)) return true;
      }
      return false;
    });
    if (!any) unreachable.push(`region "${rg.id}"`);
  }
  hard(
    issues,
    "unreachableInteraction",
    unreachable.length > 0,
    `到不了的物件：${unreachable.join(" / ")}`,
  );

  // ── 模板承諾的拓撲 ───────────────────────────────────────────────────────
  const shape = describeTemplate(doc.template);
  const loops = regionLoopCount(g, doc.regions);
  soft(
    issues,
    "loops",
    spec.severity.loops,
    loops < Math.max(spec.topology.loopsMin, shape.minLoops),
    `只有 ${loops} 條獨立迴圈（模板「${doc.template}」承諾 ≥${shape.minLoops}，` +
      `規格要求 ≥${spec.topology.loopsMin}）。⚠️ 迴圈是「被追時能不能繞回來」的唯一來源。`,
  );

  const deadEnds = deadEndClusters(g);
  soft(
    issues,
    "deadEnds",
    spec.severity.deadEnds,
    deadEnds > spec.topology.deadEndsMax,
    `${deadEnds} 個死路（上限 ${spec.topology.deadEndsMax}）—— 死路多會讓追人變成「堵住就贏」。`,
  );

  const chokes = chokepointClusters(g);
  soft(
    issues,
    "chokepoints",
    spec.severity.chokepoints,
    chokes < spec.topology.chokepointsMin || chokes > spec.topology.chokepointsMax,
    `${chokes} 個瓶頸（規格 ${spec.topology.chokepointsMin}–${spec.topology.chokepointsMax}）`,
  );

  const shortcuts = doc.gimmick.gateGroups.length;
  soft(
    issues,
    "shortcuts",
    spec.severity.shortcuts,
    shortcuts < spec.topology.shortcutsMin || shortcuts > spec.topology.shortcutsMax,
    `${shortcuts} 個捷徑／gate 群組（規格 ${spec.topology.shortcutsMin}–${spec.topology.shortcutsMax}）`,
  );

  soft(
    issues,
    "interactions",
    spec.severity.interactions,
    doc.interactions.length < spec.interactions.countMin ||
      doc.interactions.length > spec.interactions.countMax,
    `${doc.interactions.length} 個互動點（規格 ${spec.interactions.countMin}–${spec.interactions.countMax}）`,
  );

  soft(
    issues,
    "regions",
    "warn",
    doc.regions.length !== spec.topology.regionsPreferred,
    `${doc.regions.length} 個地圖區域 —— owner 最推薦 ${spec.topology.regionsPreferred} 個` +
      `（合法範圍 ${spec.topology.regionsMin}–${spec.topology.regionsMax}，這只是提示）`,
  );

  // ── 路徑長度與橫跨時間（估算）──────────────────────────────────────────
  const must = spawnTiles.flat().concat(doc.interactions.map((i) => i.at));
  const nav = bakeNav(g, pickNodes(g, must, 64));
  const stats = pathStats(nav);
  // 最長最短路徑（格）→ 世界單位 → 秒
  const traversalSec =
    (stats.longest * doc.grid.tileSize) / Math.max(1e-6, spec.traversal.referenceMoveSpeed);
  soft(
    issues,
    "traversal",
    spec.severity.traversal,
    traversalSec < spec.traversal.secMin || traversalSec > spec.traversal.secMax,
    `估算橫跨 ${traversalSec.toFixed(1)} 秒（規格 ${spec.traversal.secMin}–${spec.traversal.secMax}）。` +
      `⚠️ 這是估算：最長最短路徑 ${stats.longest} 格 × ${doc.grid.tileSize} ÷ 移速 ` +
      `${spec.traversal.referenceMoveSpeed}，⛔ 不是實測。`,
  );

  const ok = !issues.some((i) => i.kind === "hard" || i.severity === "error");
  return {
    mapId: doc.id,
    template: doc.template,
    grid: doc.grid,
    worldSize: { w: doc.grid.cols * doc.grid.tileSize, d: doc.grid.rows * doc.grid.tileSize },
    regions: doc.regions.length,
    walkableTiles: tiles.length,
    disconnectedAreas: comp.count,
    deadEnds,
    loops,
    chokepoints: chokes,
    shortcuts,
    interactions: doc.interactions.length,
    avgShortestPath: Math.round(stats.avg * 10) / 10,
    longestShortestPath: stats.longest,
    estimatedTraversalSec: Math.round(traversalSec * 10) / 10,
    unreachableObjects: unreachable,
    invalidSpawns,
    duelZones,
    issues,
    ok,
  };
}

/** 報告 → 人看得懂的表（CLI 與後台唯讀頁共用）。 */
export function formatReport(r: MapReport): string {
  const lines = [
    `地圖 ${r.mapId}  ·  模板 ${r.template}`,
    `尺寸        ${r.grid.cols}×${r.grid.rows} 格  =  ${r.worldSize.w}×${r.worldSize.d} 世界單位  (tileSize ${r.grid.tileSize})`,
    `地圖區域    ${r.regions}`,
    `可走格數    ${r.walkableTiles}`,
    `不連通區塊  ${r.disconnectedAreas}${r.disconnectedAreas === 1 ? "" : "  ⛔"}`,
    `死路        ${r.deadEnds}`,
    `迴圈        ${r.loops}`,
    `瓶頸        ${r.chokepoints}`,
    `捷徑        ${r.shortcuts}`,
    `互動點      ${r.interactions}`,
    `最短路徑    平均 ${r.avgShortestPath} 格 · 最長 ${r.longestShortestPath} 格`,
    `估算橫跨    ${r.estimatedTraversalSec} 秒`,
    `對戰分區    ${r.duelZones}`,
    `到不了的物件 ${r.unreachableObjects.length === 0 ? "無" : r.unreachableObjects.join(" / ")}`,
    `非法出生點   ${r.invalidSpawns.length === 0 ? "無" : r.invalidSpawns.join(" / ")}`,
  ];
  if (r.issues.length > 0) {
    lines.push("");
    for (const i of r.issues) {
      lines.push(`${i.kind === "hard" ? "⛔" : i.severity === "error" ? "🔴" : "⚠️ "} [${i.check}] ${i.message}`);
    }
  }
  lines.push("", r.ok ? "✓ 通過" : "✗ 未通過");
  return lines.join("\n");
}
