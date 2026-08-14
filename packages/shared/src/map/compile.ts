/**
 * `map@1` → `arena@1` 的編譯（GH#324 Phase 2）。
 *
 * ```
 *   content/maps/map.*.json    ✍️ 人寫 —— 版面的唯一來源
 *            │  compileMap()
 *            ▼
 *   content/arenas/arena.*.json  ⚙️ 產生器擁有，⛔ 禁止手改
 *            │
 *            ▼  runtime 只認這一份（arenaDefFromDoc）
 * ```
 *
 * ## ⭐ 一張 map = 一個對戰分區的地形
 *
 * owner 2026-08-14「**這是一個 3v3 地形**」⇒ 同一份佈局被**實例化 N 份**
 * （今天 N=2），各自擺在不同中心點，填進 `arena@1` 的 `zones[]`。
 *
 * ⚠️ 這不是美觀考量，是**正確性**：`pairTeams` 在 4 隊存活時一定吐出 zone 0 與
 * zone 1，而 `MatchController` 用的是非空斷言。只有一個分區的場地放進輪替池，
 * 第 1–9 回合會解參考 undefined（GH#324 風險 7.8）。
 *
 * ## ⚠️ 決定性
 *
 * 輸出必須**零時間戳、零 `git describe`、零未排序迭代** —— 一個會浮動的欄位會逼人
 * 把 `--check` 放寬成模糊比對，而放寬的閘不是閘
 * （`tools/capability-export` 與 `tools/legacy-index` 都記錄了這個失敗形態）。
 */
import type { ArenaDoc } from "../content/schema/arena";
import type { MapDoc } from "../content/schema/map";
import type { DEFAULT_MAP_SPEC } from "../content/schema/mapSpecDoc";
import { bakeNav, isWalkable, pickNodes, type GridPos, type TileGrid } from "./graph";
import { mergeWalls, rectToBox, tileCenter } from "./merge";
import { DUEL_ZONES_PER_MAP_MIN } from "./spec";
import { validateMap, type MapReport } from "./validate";

type Spec = typeof DEFAULT_MAP_SPEC;

/** 一隊幾個人。⛔ 從 sim 的常數 import，不抄 3（抄一份就是第四個住處）。 */
export const SPAWNS_PER_SIDE = 3;

/** 導航節點上限。64 節點 ⇒ 64×64 = 4096 個 int，約 4KB／圖。 */
const MAX_NAV_NODES = 64;

/** 兩個對戰分區在世界座標上的間距（倍數 × 地圖寬）。⛔ 不可以重疊。 */
const ZONE_GAP_FACTOR = 1.5;

export interface CompileResult {
  arena: ArenaDoc;
  report: MapReport;
}

/**
 * 從 tiles 挑出生點。
 *
 * 規則（決定性）：side 0 取**最左**的可走格、side 1 取**最右**的，
 * 各往垂直方向散開 `SPAWNS_PER_SIDE` 個。
 * ⚠️ 一定要湊滿 `SPAWNS_PER_SIDE` —— schema 只要求 ≥1，但消費端是
 * `spawns[side]![slot % TEAM_SIZE]!`（GH#325）。湊不滿就讓驗證器紅，
 * ⛔ 不是靜靜地少給。
 */
function pickSpawns(g: TileGrid): GridPos[][] {
  const bySide: GridPos[][] = [[], []];
  const colOrder = [...Array(g.cols).keys()];
  for (const [side, cols] of [
    [0, colOrder],
    [1, [...colOrder].reverse()],
  ] as const) {
    const midR = Math.floor(g.rows / 2);
    // 由中間往外找列，讓三個出生點自然散在中線附近。
    const rowOrder = [...Array(g.rows).keys()].sort(
      (a, b) => Math.abs(a - midR) - Math.abs(b - midR) || a - b,
    );
    for (const c of cols) {
      for (const r of rowOrder) {
        if (bySide[side]!.length >= SPAWNS_PER_SIDE) break;
        if (!isWalkable(g, c, r)) continue;
        // 不要三個疊在同一格附近 —— 至少差 2 列
        if (bySide[side]!.some((p) => Math.abs(p.row - r) < 2 && Math.abs(p.col - c) < 2)) continue;
        bySide[side]!.push({ col: c, row: r });
      }
      if (bySide[side]!.length >= SPAWNS_PER_SIDE) break;
    }
  }
  return bySide;
}

/**
 * 編譯。
 *
 * @param duelZones 要實例化幾個對戰分區。預設 `DUEL_ZONES_PER_MAP_MIN`（2）。
 */
export function compileMap(doc: MapDoc, spec: Spec, duelZones = DUEL_ZONES_PER_MAP_MIN): CompileResult {
  const g: TileGrid = { cols: doc.grid.cols, rows: doc.grid.rows, tiles: doc.tiles };
  const ts = doc.grid.tileSize;
  const halfW = (doc.grid.cols * ts) / 2;
  const halfD = (doc.grid.rows * ts) / 2;
  // 外接圓：舊的 `boundaryRadius` 夾制對矩形是**寬鬆但安全**的（不會誤擋）。
  const boundaryRadius = Math.hypot(halfW, halfD);

  // ⚠️ 內容管線要求「檔名 stem == doc id」（`arena.castle.json` 的 id 就是
  // `arena.castle`）。map 的 id 是 `map.xxx`，所以編譯出來的場地換前綴，
  // ⛔ 不是沿用 —— 沿用會讓 content:build 直接拒收。
  const arenaId = doc.id.startsWith("map.") ? `arena.${doc.id.slice(4)}` : `arena.${doc.id}`;

  const wallRects = mergeWalls(g);
  const spawnTiles = pickSpawns(g);
  const must = spawnTiles.flat().concat(doc.interactions.map((i) => i.at));
  const nav = bakeNav(g, pickNodes(g, must, MAX_NAV_NODES));

  const gateOf = new Map<string, string>();
  for (const grp of doc.gimmick.gateGroups) {
    for (const t of grp.tiles) gateOf.set(`${t.row},${t.col}`, grp.id);
  }

  const zones = [];
  for (let zi = 0; zi < duelZones; zi++) {
    // 分區沿 +x 排開；地圖的 tile(0,0) 左上角落在 origin。
    const centerX = zi * doc.grid.cols * ts * ZONE_GAP_FACTOR;
    const origin = { x: centerX - halfW, z: -halfD };

    const obstacles = wallRects.map((rc) => {
      const box = rectToBox(rc, ts, origin);
      // 一個牆矩形若**整塊**屬於同一個 gate 群組，才帶 gateGroup ——
      // ⚠️ 半塊屬於 gate 是資料錯誤，讓它保持永遠擋路（安全的那一邊）。
      let gg: string | undefined;
      let allSame = true;
      for (let r = rc.row; r < rc.row + rc.h && allSame; r++) {
        for (let c = rc.col; c < rc.col + rc.w; c++) {
          const here = gateOf.get(`${r},${c}`);
          if (gg === undefined) gg = here;
          if (here !== gg) {
            allSame = false;
            break;
          }
        }
      }
      return {
        kind: "box" as const,
        center: box.center,
        halfW: box.halfW,
        halfD: box.halfD,
        ...(allSame && gg !== undefined ? { gateGroup: gg } : {}),
      };
    });

    zones.push({
      id: `${arenaId}-z${zi}`,
      center: { x: centerX, z: 0 },
      boundaryRadius,
      obstacles,
      spawns: [
        spawnTiles[0]!.map((p) => tileCenter(p.col, p.row, ts, origin)),
        spawnTiles[1]!.map((p) => tileCenter(p.col, p.row, ts, origin)),
      ] as [{ x: number; z: number }[], { x: number; z: number }[]],
      bounds: { kind: "rect" as const, halfW, halfD },
      regions: doc.regions.map((rg) => ({ id: rg.id, label: rg.label, rects: rg.rects })),
      nav: {
        nodes: nav.nodes.map((p) => tileCenter(p.col, p.row, ts, origin)),
        nextHop: nav.nextHop,
      },
      // ⭐ gate 排程逐字帶過去 —— runtime 用它 + 絕對 tick 自己算開關狀態。
      ...(doc.gimmick.schedule === undefined ? {} : { gates: doc.gimmick.schedule }),
      // ⭐ 互動點原樣帶過去 —— 引擎拿它當既有系統的擺放錨點。
      ...(doc.interactions.length === 0
        ? {}
        : {
            interactions: doc.interactions.map((i) => ({
              id: i.id,
              kind: i.kind,
              at: tileCenter(i.at.col, i.at.row, ts, origin),
              radius: i.radius,
            })),
          }),
      // ⭐ `toggleGate` 互動點 → 玩家站著就生效的 gate 覆寫。
      // ⚠️ `params.gateGroup` 指到不存在的群組 = 這個點永遠沒有作用 ⇒ 直接跳過，
      //    而驗證器會把它列成「到不了的物件」讓人看得見（⛔ 不是靜靜吞掉）。
      ...(() => {
        const groupIds = new Set(doc.gimmick.gateGroups.map((g) => g.id));
        const holds = doc.interactions
          .filter((i) => i.kind === "toggleGate")
          .map((i) => ({
            at: tileCenter(i.at.col, i.at.row, ts, origin),
            radius: i.radius,
            gateGroup: String(i.params.gateGroup ?? ""),
            mode: (i.params.mode === "close" ? "close" : "open") as "open" | "close",
          }))
          .filter((h) => groupIds.has(h.gateGroup));
        return holds.length === 0 ? {} : { gateHolds: holds };
      })(),
    });
  }

  const arena: ArenaDoc = {
    schema: "arena@1",
    id: arenaId,
    name: doc.name,
    zones,
    // landmark 層帶 blocks:false 的道具走視覺；blocks:true 的已經在 tiles 裡了。
    // ⛔ background 層**永遠不**編譯成 decor 以外的東西。
    decor: [...doc.landmarkProps, ...doc.backgroundProps].map((p) => ({
      model: p.model,
      x: -halfW + (p.at.col + 0.5) * ts,
      z: -halfD + (p.at.row + 0.5) * ts,
      rotQuarter: p.rotQuarter,
      scale: p.scale,
    })),
    groundStyle: "stone",
  };

  const report = validateMap(doc, spec, spawnTiles, duelZones);
  return { arena, report };
}
