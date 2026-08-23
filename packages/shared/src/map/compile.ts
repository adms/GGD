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
import { TEAM_SIZE } from "../constants";
import type { ArenaDoc } from "../content/schema/arena";
import { CHAMPION_BODY_RADIUS } from "../content/displacementTiers";
import { DEFAULT_GROUND_STYLE } from "../content/schema/groundStyle";
import type { MapDoc } from "../content/schema/map";
import { DEFAULT_MAP_SPAWN, type DEFAULT_MAP_SPEC } from "../content/schema/mapSpecDoc";
import { DEFAULT_STAGE1_RADIUS, fireRingSafeAt } from "../sim/fireRing";
import type { ZoneDef } from "../sim/world/ArenaDef";
import { bakeNav, isWalkable, pickNodes, type GridPos, type TileGrid } from "./graph";
import { mergeWalls, rectToBox, tileCenter } from "./merge";
import { FLOOR, WALL } from "./templates";
import { DUEL_ZONES_PER_MAP_MIN } from "./spec";
import { validateMap, type MapReport } from "./validate";

type Spec = typeof DEFAULT_MAP_SPEC;

/**
 * 一隊幾個人。⛔ 從 `constants.ts` 的 `TEAM_SIZE` 來，不抄 3
 * （這一行以前寫著「⛔ 從 sim 的常數 import，不抄 3」——**而它抄了 3**，
 *  第三守則的形狀：一句自我描述的註解與它底下那一行不是同一件事）。
 */
export const SPAWNS_PER_SIDE = TEAM_SIZE;

/** 導航節點上限。64 節點 ⇒ 64×64 = 4096 個 int，約 4KB／圖。 */
const MAX_NAV_NODES = 64;

/** 兩個對戰分區在世界座標上的間距（倍數 × 地圖寬）。⛔ 不可以重疊。 */
const ZONE_GAP_FACTOR = 1.5;

export interface CompileResult {
  arena: ArenaDoc;
  report: MapReport;
}

/**
 * 一格中心到最近一堵牆（含格線外緣）的距離，世界單位。
 *
 * 牆格 `(bc,br)` 佔住世界上的一個方塊 `[bc·ts,(bc+1)·ts] × [br·ts,(br+1)·ts]`，
 * 所以「中心到方塊」是逐軸先減半格再取歐氏距離 —— ⛔ 不是格心到格心
 * （那會把貼著牆的那一格算成一整格遠）。
 */
function wallClearance(g: TileGrid, ts: number, col: number, row: number, want: number): number {
  // 只掃「有可能比 want 更近」的那個窗，⛔ 不掃整張圖：預算是 O(格數×窗)，
  // 而 want 通常只有一兩格寬。
  const k = Math.ceil(want / ts + 0.5);
  let best = ts * Math.min(col + 0.5, g.cols - col - 0.5, row + 0.5, g.rows - row - 0.5);
  for (let br = row - k; br <= row + k; br++) {
    for (let bc = col - k; bc <= col + k; bc++) {
      if (br < 0 || bc < 0 || br >= g.rows || bc >= g.cols) continue;
      if (isWalkable(g, bc, br)) continue;
      const dx = Math.max(0, Math.abs(col - bc) - 0.5);
      const dz = Math.max(0, Math.abs(row - br) - 0.5);
      const d = ts * Math.hypot(dx, dz);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * 每一格**走**到火圈口袋要多少格（4 連通，走不到 = `Infinity`）。
 *
 * ⭐ 種子是**真正的口袋** —— 用 sim 自己那一支 {@link fireRingSafeAt} 去問
 * 「火圈停在 `stage1Radius` 的時候，站在這一格還安全嗎」，⛔ 不在這裡重寫幾何，
 * 也⛔ 不用「離中心最近的那一格」當代理。
 *
 * ⚠️ **那個代理是這一批第一版寫的，而它錯得很難看，留在這裡當紀錄**：芙莉蓮的
 * 迷宮正中央有一道貫穿的牆，於是口袋被切成**左右兩塊**（兩塊都真的安全）。
 * 單一種子只落在其中一塊，右半場到它的距離全部要繞過整張圖 ⇒ 右側六個候選格
 * 幾乎全部被路徑預算刷掉，產生器只好一路往內走，把 side 1 的座位擺到 **x = −3**
 * ——**跨過中線、貼在 side 0 臉上**。兩邊出生點的最近距離從 42 掉到 **14.42**。
 * 產生器全綠、驗證器全綠，只有量出來的數字說話（失敗形態⑤：被測的不是出貨的那個）。
 */
function stepsToPocket(
  g: TileGrid,
  ts: number,
  halfW: number,
  halfD: number,
  pocketRadius: number,
): number[] {
  const dist = new Array<number>(g.cols * g.rows).fill(Infinity);
  // 只為了問「這一格在不在口袋裡」而做的最小 zone —— 障礙由 tiles 那一側管。
  const zone = {
    center: { x: 0, z: 0 },
    boundaryRadius: Math.hypot(halfW, halfD),
    bounds: { kind: "rect" as const, halfW, halfD },
    obstacles: [],
    spawns: [],
  } as unknown as ZoneDef;
  const queue: number[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!isWalkable(g, c, r)) continue;
      const p = { x: -halfW + (c + 0.5) * ts, z: -halfD + (r + 0.5) * ts };
      if (!fireRingSafeAt(zone, p, CHAMPION_BODY_RADIUS, pocketRadius)) continue;
      dist[r * g.cols + c] = 0;
      queue.push(r * g.cols + c);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h]!;
    const c = cur % g.cols;
    const r = (cur - c) / g.cols;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isWalkable(g, nc, nr)) continue;
      const n = nr * g.cols + nc;
      if (dist[n] !== Infinity) continue;
      dist[n] = dist[cur]! + 1;
      queue.push(n);
    }
  }
  return dist;
}

/**
 * 從 tiles 挑出生點。
 *
 * ⭐ **GH#364 第二半：這裡就是那個 bug。** 舊規則是「side 0 取最左的可走格、
 * side 1 取最右的」，於是每一張產生出來的圖，六個座位都落在**貼著外牆的那一格**
 * —— 而那同時也是**離火圈收束口袋最遠**的位置。owner 2026-08-18 的截圖
 * （芙莉蓮迷宮，站在窄走道上、旁邊就是圖外、火圈在收）就是這條規則的直接輸出，
 * ⛔ 不是那張圖的資料寫壞了。量到的：七張圖的離牆距離全部是 **1.00**（＝半格）。
 *
 * 新規則多了兩個**候選條件**（順序與散開規則一個字都沒動，所以既有圖只會位移，
 * 不會換一種長相）：
 *
 * | 條件 | 尺 | 擋掉什麼 |
 * |---|---|---|
 * | 離最近的牆 ≥ `minWallClearanceBodyRadii` × 身體半徑 | 身體半徑 | 貼牆的窄走道 |
 * | 走到火圈口袋 ≤ `maxPocketPathFactor` × 分區半徑 | 分區半徑 | 「注定燒死」的遠角 |
 *
 * ⛔ 兩把尺都**與格子大小無關**。owner 提的是「內縮 2–3 格」，但格子大小
 * （`grid.tileSize`）本身是一格後台欄位 —— 寫成格數的話同一個設定在兩張圖上
 * 是兩個距離。出貨值下的實際效果**正好**是內縮 2 格，那是推導出來的結果。
 *
 * ⚠️ 一定要湊滿 `SPAWNS_PER_SIDE` —— schema 只要求 ≥1，但消費端是
 * `spawns[side]![slot % TEAM_SIZE]!`（GH#325）。湊不滿就讓驗證器紅，
 * ⛔ 不是靜靜地少給。
 */
function pickSpawns(
  g: TileGrid,
  ts: number,
  halfW: number,
  halfD: number,
  pocketRadius: number,
  spawn: Spec["spawn"],
): GridPos[][] {
  const rules = spawn ?? DEFAULT_MAP_SPAWN;
  const wantClearance = rules.minWallClearanceBodyRadii * CHAMPION_BODY_RADIUS;
  const pathBudget = rules.maxPocketPathFactor * Math.hypot(halfW, halfD);
  const steps = stepsToPocket(g, ts, halfW, halfD, pocketRadius);
  const eligible = (c: number, r: number): boolean =>
    isWalkable(g, c, r) &&
    wallClearance(g, ts, c, r, wantClearance) >= wantClearance - 1e-9 &&
    steps[r * g.cols + c]! * ts <= pathBudget + 1e-9;

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
        if (!eligible(c, r)) continue;
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
 * @param pocketRadius 火圈「停止縮圈」停下來的半徑（`config.match@1` 的
 *   `stage1Radius`）。⭐ 出生點的路徑預算量的就是「走到這塊口袋要多遠」，
 *   ⛔ 這個數字**沒有第二個住處** —— 呼叫端（`tools/anime-arena-map/gen.ts`）
 *   從出貨的 `config.match.json` 讀，讀不到才退回 sim 的 `DEFAULT_STAGE1_RADIUS`。
 */
export function compileMap(
  doc: MapDoc,
  spec: Spec,
  duelZones = DUEL_ZONES_PER_MAP_MIN,
  pocketRadius = DEFAULT_STAGE1_RADIUS,
): CompileResult {
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

  const spawnTiles = pickSpawns(g, ts, halfW, halfD, pocketRadius, spec.spawn);
  const must = spawnTiles.flat().concat(doc.interactions.map((i) => i.at));
  const nav = bakeNav(g, pickNodes(g, must, MAX_NAV_NODES));

  const gateOf = new Map<string, string>();
  for (const grp of doc.gimmick.gateGroups) {
    for (const t of grp.tiles) gateOf.set(`${t.row},${t.col}`, grp.id);
  }

  // ⭐ GH#397／#624 —— gate 的障礙物**自己一個來源**，⛔ 不從牆格推。
  //
  // ⚠️ 這一段在 2026-08-24 之前是這樣寫的：牆格合併成矩形之後，若「整塊矩形
  //    都屬於同一個 gate 群組」才給它 `gateGroup`。那個形狀對**兩個方向**都失效：
  //
  //    ① 門在基礎格網裡是**地板**（`.`）—— 七張圖有六張這樣寫，而那是對的：
  //       基礎格網＝「全部的門都開著」，驗證器的 `gateTrapsPlayers` 也正是把
  //       關上的門**畫成 `#`** 再驗連通。⇒ 合併牆格時它根本不存在 ⇒ 產出 0 個。
  //    ② 門若真的寫成 `#` 又貼著一堵長牆，`mergeWalls` 會把它**吞進同一個盒**
  //       ⇒ `allSame` 為 false ⇒ 一樣產出 0 個。
  //
  //    ⇒ 兩個方向都得到「宣告 N 道門、產出 0 個 gateGroup」，而每一條既有守衛
  //    都是綠的（失敗形態⑧：宣告在、消費端拿不到）。實測 6/7 張圖是 0。
  //
  // ⭐ 現在的規則只有一條：**gate 格由 gateGroups 決定，與 tiles 無關**。
  //    永久牆先把 gate 格挖掉（⛔ 免得一堵長牆把門吞進同一個盒），
  //    gate 的盒再逐群組各自合併。守衛 `gateWiring.test.ts` 逐圖比對數量。
  const permGrid: TileGrid =
    gateOf.size === 0
      ? g
      : {
          cols: g.cols,
          rows: g.rows,
          tiles: g.tiles.map((row, r) =>
            [...row].map((ch, c) => (gateOf.has(`${r},${c}`) ? FLOOR : ch)).join(""),
          ),
        };
  const wallRects = mergeWalls(permGrid);
  // ⚠️ 順序＝`gateGroups` 的文件序 × `mergeWalls` 的掃描序 ⇒ 決定性（`--check` 靠它）。
  const gateRects = doc.gimmick.gateGroups.map((grp) => ({
    id: grp.id,
    rects: mergeWalls({
      cols: g.cols,
      rows: g.rows,
      tiles: Array.from({ length: g.rows }, (_, r) =>
        Array.from({ length: g.cols }, (_, c) =>
          gateOf.get(`${r},${c}`) === grp.id ? WALL : FLOOR,
        ).join(""),
      ),
    }),
  }));

  const zones = [];
  for (let zi = 0; zi < duelZones; zi++) {
    // 分區沿 +x 排開；地圖的 tile(0,0) 左上角落在 origin。
    const centerX = zi * doc.grid.cols * ts * ZONE_GAP_FACTOR;
    const origin = { x: centerX - halfW, z: -halfD };

    const obstacles = [
      ...wallRects.map((rc) => {
        const box = rectToBox(rc, ts, origin);
        return { kind: "box" as const, center: box.center, halfW: box.halfW, halfD: box.halfD };
      }),
      // ⭐ 門：`gateGroup` 有值 ⇒ `activeObstacles` 只在該組**關上**的 tick 留下它。
      ...gateRects.flatMap((gr) =>
        gr.rects.map((rc) => {
          const box = rectToBox(rc, ts, origin);
          return {
            kind: "box" as const,
            center: box.center,
            halfW: box.halfW,
            halfD: box.halfD,
            gateGroup: gr.id,
          };
        }),
      ),
    ];

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
    // ⭐ 圓盤外的 2D 景深背景逐字帶過去。⛔ 它只落在 `ArenaDoc`，
    // 而 `arenaDefFromDoc()` 不看這一格 ⇒ sim 永遠拿不到它（見 `zBackdrop` 檔頭）。
    ...(doc.backdrop === undefined ? {} : { backdrop: doc.backdrop }),
    // ⭐ GH#362 —— 場景特色（配色／打光／裝飾散佈）同樣逐字帶過去，同樣只落在
    // `ArenaDoc` ⇒ sim 拿不到。⛔ 不在這裡加工：加工過的顏色會讓「地圖裡寫的」
    // 與「畫面上的」變成兩個不同的東西，而那正是查不出來的那一類。
    ...(doc.scenery === undefined ? {} : { scenery: doc.scenery }),
    // landmark 層帶 blocks:false 的道具走視覺；blocks:true 的已經在 tiles 裡了。
    // ⛔ background 層**永遠不**編譯成 decor 以外的東西。
    decor: [...doc.landmarkProps, ...doc.backgroundProps].map((p) => ({
      model: p.model,
      x: -halfW + (p.at.col + 0.5) * ts,
      z: -halfD + (p.at.row + 0.5) * ts,
      // ⭐ GH#386 ③ —— 架高。⚠️ `y === 0` 時**整格省略**，⛔ 不寫 `y: 0`：
      // 出貨的 13 張圖一件都沒架高，所以重新編譯出來的 arena doc 必須逐位元組
      // 不變（`mapArtCannotChangeCollision` 的同一條紀律），而且 `y: 0` 一旦寫進
      // content 就會被**舊映像**的 `zDecor.strict()` 整份拒絕（2026-08-02 的形狀）。
      ...(p.y === undefined ? {} : { y: p.y }),
      rotQuarter: p.rotQuarter,
      scale: p.scale,
    })),
    // ⭐ GH#342 —— 地板材質**跟著 map doc 走**。
    // ⚠️ 這一行以前寫死 `"stone"`，於是七張動漫場地共用同一張歐式地牢石板，
    //    而作者在 `map@1` 裡連宣告的欄位都沒有（第一守則說的「決策點寫死」）。
    // ⛔ 沒宣告時仍然是 `stone` —— 舊圖的行為一個位元組都不變。
    groundStyle: doc.groundStyle ?? DEFAULT_GROUND_STYLE,
  };

  const report = validateMap(doc, spec, spawnTiles, duelZones);
  return { arena, report };
}
