/**
 * tile grid → 圖 → **烘焙好的 next-hop 表**（GH#324 Phase 2）。
 *
 * ⭐ 這是整個地圖系統最重要的一個設計決定。
 *
 * 引擎今天**完全沒有導航**（全 repo 掃 navmesh / pathfind / astar / waypoint 零命中），
 * 而 `steerAroundObstacles` 是無狀態的單切線啟發式，**明確跳過線段** ——
 * 垂直撞牆時切向分量為 0，單位會**原地卡死**（程式碼註解記錄的實測是 2,240 tick）。
 *
 * 但 runtime 不能跑搜尋：`sim/**` 禁三角函式、禁 `**`、Map 迭代要排序，而且
 * **客戶端預測必須算出跟伺服器一模一樣的結果**。任何有浮點累積或迭代序敏感的
 * 搜尋都會在那三個約束上撞牆。
 *
 * ⇒ **離線烘焙**：產生器跑一次全點對全點最短路，把 `nextHop` 存進 `arena@1`。
 *   runtime 只做一次陣列查表（`sim/map/navFollow.ts`），零搜尋、零浮點路徑。
 *   N ≤ 64 節點 ⇒ 64×64 = 4KB／圖。
 */
import { FLOOR, VOID, WALL } from "./templates";

export interface TileGrid {
  cols: number;
  rows: number;
  /** rows 行，每行 cols 個字元（`.` 地面 / `#` 牆 / ` ` 虛空）。 */
  tiles: string[];
}

export interface GridPos {
  col: number;
  row: number;
}

export const isWalkable = (g: TileGrid, c: number, r: number): boolean =>
  r >= 0 && r < g.rows && c >= 0 && c < g.cols && g.tiles[r]![c] === FLOOR;

/** 四鄰居（⛔ 不含斜向：斜向會讓單位「切過」兩堵牆的內角）。 */
const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 所有可走的格，**按 (row, col) 排序** —— 決定性的唯一來源。 */
export function walkableTiles(g: TileGrid): GridPos[] {
  const out: GridPos[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) if (isWalkable(g, c, r)) out.push({ col: c, row: r });
  }
  return out;
}

/**
 * 連通元件 —— 每一格屬於哪一塊。⛔ 有兩塊以上就是「有區域走不到」，
 * 那是**正確性**問題，產生器一律拒絕輸出（`HARD_CHECKS`）。
 */
export function components(g: TileGrid): { label: number[][]; count: number } {
  const label: number[][] = Array.from({ length: g.rows }, () => new Array<number>(g.cols).fill(-1));
  let count = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!isWalkable(g, c, r) || label[r]![c] !== -1) continue;
      const id = count++;
      // 明確的堆疊 BFS —— ⛔ 不遞迴（24×18 不會爆，但 64×64 會）。
      const stack: GridPos[] = [{ col: c, row: r }];
      label[r]![c] = id;
      while (stack.length > 0) {
        const p = stack.pop()!;
        for (const [dc, dr] of NEIGHBOURS) {
          const nc = p.col + dc;
          const nr = p.row + dr;
          if (!isWalkable(g, nc, nr) || label[nr]![nc] !== -1) continue;
          label[nr]![nc] = id;
          stack.push({ col: nc, row: nr });
        }
      }
    }
  }
  return { label, count };
}

/**
 * **死路** = 只有一個可走鄰居的格。
 *
 * ⚠️ 逐格數會把每一條走廊的盡頭都算進來，那不是 owner 說的「死路」——
 * 他說的是「進去出不來的**區域**」。所以這裡回傳的是**死路格的連通簇數**。
 */
export function deadEndClusters(g: TileGrid): number {
  const isDead = (c: number, r: number): boolean => {
    if (!isWalkable(g, c, r)) return false;
    let n = 0;
    for (const [dc, dr] of NEIGHBOURS) if (isWalkable(g, c + dc, r + dr)) n++;
    return n <= 1;
  };
  const seen = new Set<string>();
  let clusters = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!isDead(c, r) || seen.has(`${r},${c}`)) continue;
      clusters++;
      const stack: GridPos[] = [{ col: c, row: r }];
      seen.add(`${r},${c}`);
      while (stack.length > 0) {
        const p = stack.pop()!;
        for (const [dc, dr] of NEIGHBOURS) {
          const nc = p.col + dc;
          const nr = p.row + dr;
          const key = `${nr},${nc}`;
          if (!isDead(nc, nr) || seen.has(key)) continue;
          seen.add(key);
          stack.push({ col: nc, row: nr });
        }
      }
    }
  }
  return clusters;
}

/**
 * 逐格的環數 = 邊 − 節點 + 連通元件（cyclomatic number）。
 *
 * ⛔ **這個數字不可以拿去對照 owner 的「≥2 條主要循環路線」。**
 * 實測（無限城 24×18）：它回 **207** —— 因為 4 連通格網裡**每一個 2×2 的空地**
 * 都算一條環。207 對人類沒有任何意義，而且讓「≥2」這個檢查恆真＝形同不存在。
 *
 * ⭐ 要報的是 `regionLoopCount()`（區域鄰接圖的環數）——「琵琶廳→月台→庭院→
 * 紙門廊→琵琶廳」才是 owner 說的那種「繞回來」。
 * 這一支留著只當內部診斷（例如「這張圖是不是一棵樹」）。
 */
export function gridLoopCount(g: TileGrid): number {
  const tiles = walkableTiles(g);
  let edges = 0;
  for (const p of tiles) {
    // 只數「右」與「下」，每條邊剛好被數一次。
    if (isWalkable(g, p.col + 1, p.row)) edges++;
    if (isWalkable(g, p.col, p.row + 1)) edges++;
  }
  const { count } = components(g);
  return edges - tiles.length + count;
}

/**
 * **瓶頸** = 通道寬度 ≤ `maxWidth` 的格，取連通簇數。
 *
 * ⛔ 原本用的是「關節點」（拿掉它圖就斷開）。實測回 **0**，而且那是**必然的**：
 * CENTRAL_RING 的中央廳有四道門，任何**單一**格都不會讓圖斷開 ——
 * 換句話說，環形圖上關節點恆為 0，那個檢查形同不存在。
 *
 * ⭐ owner 說的「狹窄瓶頸」是**手感**：那個位置只容得下一兩個人並排，
 * 所以會變成打架的地方。⇒ 量的是**通道寬度**：一格的水平連續可走長度與垂直
 * 連續可走長度，取小的那個。開闊地兩邊都很長，走廊有一邊很短。
 */
export function chokepointClusters(g: TileGrid, maxWidth = 2): number {
  const span = (c: number, r: number, dir: "h" | "v"): number => {
    let n = 1;
    for (let k = 1; ; k++) {
      const cc = dir === "h" ? c + k : c;
      const rr = dir === "h" ? r : r + k;
      if (!isWalkable(g, cc, rr)) break;
      n++;
    }
    for (let k = 1; ; k++) {
      const cc = dir === "h" ? c - k : c;
      const rr = dir === "h" ? r : r - k;
      if (!isWalkable(g, cc, rr)) break;
      n++;
    }
    return n;
  };
  const isCut = (c: number, r: number): boolean => {
    if (!isWalkable(g, c, r)) return false;
    return Math.min(span(c, r, "h"), span(c, r, "v")) <= maxWidth;
  };
  const seen = new Set<string>();
  let clusters = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (seen.has(`${r},${c}`) || !isCut(c, r)) continue;
      clusters++;
      const stack: GridPos[] = [{ col: c, row: r }];
      seen.add(`${r},${c}`);
      while (stack.length > 0) {
        const p = stack.pop()!;
        for (const [dc, dr] of NEIGHBOURS) {
          const nc = p.col + dc;
          const nr = p.row + dr;
          const key = `${nr},${nc}`;
          if (seen.has(key) || !isCut(nc, nr)) continue;
          seen.add(key);
          stack.push({ col: nc, row: nr });
        }
      }
    }
  }
  return clusters;
}

/**
 * ⭐ **區域鄰接圖的環數** —— 這才是 owner 說的「主要循環路線」。
 *
 * 「琵琶廳 → 月台 → 庭院 → 紙門廊 → 琵琶廳」是一條；
 * 一張只有一條主幹的圖是 0 條，被追上就等於死。
 *
 * 做法：兩個區域只要**有可走的格互為四鄰**就算相鄰；
 * 環數 = 邊 − 節點 + 連通元件（同一個 cyclomatic 公式，只是在對的粒度上）。
 */
export function regionLoopCount(
  g: TileGrid,
  regions: { id: string; rects: { col: number; row: number; w: number; h: number }[] }[],
): number {
  if (regions.length === 0) return 0;
  // 每一格屬於哪一個區域（後面的覆蓋前面的 —— 與 regionAt 的規則一致）
  const owner: (number | undefined)[][] = Array.from({ length: g.rows }, () =>
    new Array<number | undefined>(g.cols).fill(undefined),
  );
  regions.forEach((rg, i) => {
    for (const rc of rg.rects) {
      for (let r = rc.row; r < rc.row + rc.h; r++) {
        for (let c = rc.col; c < rc.col + rc.w; c++) {
          if (r >= 0 && r < g.rows && c >= 0 && c < g.cols) owner[r]![c] = i;
        }
      }
    }
  });

  const edges = new Set<string>();
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!isWalkable(g, c, r)) continue;
      const a = owner[r]![c];
      if (a === undefined) continue;
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!isWalkable(g, nc, nr)) continue;
        const b = owner[nr]![nc];
        if (b === undefined || b === a) continue;
        edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
      }
    }
  }

  // 區域鄰接圖自己的連通元件數
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < regions.length; i++) adj.set(i, new Set());
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number) as [number, number];
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const seen = new Set<number>();
  let comps = 0;
  // ⚠️ 用索引順序走，⛔ 不迭代 Map 的插入序 —— 決定性。
  for (let i = 0; i < regions.length; i++) {
    if (seen.has(i)) continue;
    comps++;
    const stack = [i];
    seen.add(i);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const n of [...adj.get(cur)!].sort((x, y) => x - y)) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return edges.size - regions.length + comps;
}

/** 從一格出發的 BFS 步數場（走不到 = -1）。 */
export function bfsFrom(g: TileGrid, from: GridPos): number[][] {
  const dist: number[][] = Array.from({ length: g.rows }, () => new Array<number>(g.cols).fill(-1));
  if (!isWalkable(g, from.col, from.row)) return dist;
  dist[from.row]![from.col] = 0;
  let frontier: GridPos[] = [from];
  while (frontier.length > 0) {
    const next: GridPos[] = [];
    for (const p of frontier) {
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = p.col + dc;
        const nr = p.row + dr;
        if (!isWalkable(g, nc, nr) || dist[nr]![nc] !== -1) continue;
        dist[nr]![nc] = dist[p.row]![p.col]! + 1;
        next.push({ col: nc, row: nr });
      }
    }
    frontier = next;
  }
  return dist;
}

export interface NavGraph {
  /** 節點的格座標，**按 (row, col) 排序**。 */
  nodes: GridPos[];
  /** `nextHop[from * n + to]` = 從 from 走向 to 的下一個節點索引；-1 = 到不了。 */
  nextHop: number[];
  /** 每一對之間的步數（格）；-1 = 到不了。診斷與驗證器用。 */
  dist: number[];
}

/**
 * 挑導航節點。
 *
 * ⭐ 規則（決定性、與內容無關）：
 *   ① 每 `stride` 格取一個可走的格（粗格點，保證覆蓋）
 *   ② 加上**每一個關節點簇的代表**（瓶頸一定要有節點，否則路線會抄穿牆的近路）
 *   ③ 加上呼叫端指定的必經點（出生點、互動點）
 * 全部去重之後按 (row, col) 排序。
 *
 * ⚠️ 上限 `maxNodes`：超過就把 stride 調大重來 —— ⛔ 不是截斷
 * （截斷會讓某些區域沒有節點，路線就繞不進去）。
 */
export function pickNodes(g: TileGrid, must: GridPos[], maxNodes: number): GridPos[] {
  const key = (p: GridPos): string => `${p.row},${p.col}`;
  for (let stride = 3; stride <= Math.max(g.cols, g.rows); stride++) {
    const picked = new Map<string, GridPos>();
    for (const p of must) if (isWalkable(g, p.col, p.row)) picked.set(key(p), p);
    for (let r = 1; r < g.rows; r += stride) {
      for (let c = 1; c < g.cols; c += stride) {
        if (isWalkable(g, c, r)) picked.set(key({ col: c, row: r }), { col: c, row: r });
      }
    }
    const out = [...picked.values()].sort((a, b) => a.row - b.row || a.col - b.col);
    if (out.length <= maxNodes) return out;
  }
  // 走到這裡代表 must 自己就超過上限 —— 呼叫端的責任，回傳排序後的它們。
  return [...must].sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * 烘焙 next-hop 表。
 *
 * 做法：對**每一個節點**跑一次網格 BFS（O(N · cols · rows)，24×18 × 64 節點 ≈ 28k 步，
 * 離線一瞬間），再用「從 from 的鄰接節點裡挑一個讓 dist(它→to) 最小的」決定下一跳。
 *
 * ⚠️ 平手時取**索引最小**的那一個 —— 決定性的唯一來源，⛔ 不是「隨便挑一個」。
 */
export function bakeNav(g: TileGrid, nodes: GridPos[]): NavGraph {
  const n = nodes.length;
  const field = nodes.map((nd) => bfsFrom(g, nd));
  const dist = new Array<number>(n * n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      dist[i * n + j] = field[i]![nodes[j]!.row]![nodes[j]!.col]!;
    }
  }
  const nextHop = new Array<number>(n * n).fill(-1);
  for (let from = 0; from < n; from++) {
    for (let to = 0; to < n; to++) {
      if (from === to) {
        nextHop[from * n + to] = to;
        continue;
      }
      if (dist[from * n + to] === -1) continue;
      let best = -1;
      let bestCost = Number.POSITIVE_INFINITY;
      for (let via = 0; via < n; via++) {
        if (via === from) continue;
        const step = dist[from * n + via]!;
        const rest = dist[via * n + to]!;
        if (step === -1 || rest === -1) continue;
        const cost = step + rest;
        // ⚠️ 嚴格小於 ⇒ 平手取索引最小。決定性靠這一行。
        if (cost < bestCost) {
          bestCost = cost;
          best = via;
        }
      }
      nextHop[from * n + to] = best;
    }
  }
  return { nodes, nextHop, dist };
}

/** 所有可達配對的最短路：平均與最長（格數）。走不到的配對**不計入**。 */
export function pathStats(nav: NavGraph): { avg: number; longest: number; unreachable: number } {
  const n = nav.nodes.length;
  let sum = 0;
  let count = 0;
  let longest = 0;
  let unreachable = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = nav.dist[i * n + j]!;
      if (d < 0) {
        unreachable++;
        continue;
      }
      sum += d;
      count++;
      if (d > longest) longest = d;
    }
  }
  return { avg: count === 0 ? 0 : sum / count, longest, unreachable };
}

/** 把 `#`／` ` 以外的字元一律視為牆 —— 讀進來的字串防呆。 */
export const normaliseTiles = (tiles: string[]): string[] =>
  tiles.map((row) =>
    [...row].map((ch) => (ch === FLOOR ? FLOOR : ch === VOID ? VOID : WALL)).join(""),
  );
