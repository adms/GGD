/**
 * 導航路線的**執行期修正** —— GH「地圖路徑還很卡，常常會循環來回拉扯」。
 *
 * owner 2026-08-23（逐字）：
 *
 *     「地圖路徑還很卡，常常會循環來回拉扯，請你重新檢查計算，
 *       特別是飛行單位（翔封界、有翼劍士等）飛行路徑是可以飛過牆，
 *       後端計算與前端預測方法不同」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 量到的根因：**烘焙出來的 `nextHop` 根本不是「下一跳」**
 *
 * `map/graph.ts::bakeNav` 挑 via 的那一行是
 *
 *     cost = dist[from][via] + dist[via][to];  if (cost < bestCost) …
 *
 * 而任何**落在最短路上**的節點 cost 都等於 `dist[from][to]`（含 `to` 自己）。
 * 嚴格小於 ⇒ 取**索引最小**的那一個，而索引是按 (row, col) 排的
 * ⇒ 回傳的是「這條最短路上索引最小的節點」，⛔ **不是離我最近的那一個**。
 *
 * 實測（出貨的 6 張有導航的場地，body radius 0.6）：
 *
 *   | 場地 | nextHop 指向「牆後面」的比例 | 最遠的一跳 |
 *   |---|---:|---:|
 *   | 無限城 infinity-castle | **36.1 %** | 51.6 u（整張圖寬） |
 *   | 進擊 shiganshina | 33.1 % | 51.6 u |
 *   | 芙莉蓮 frieren | 32.8 % | 51.6 u |
 *   | 納薩力克 nazarick | 32.4 % | 51.6 u |
 *   | 天空鬥技場 heavens-arena | 24.3 % | 51.6 u |
 *   | 聖杯 holy-grail / 世界樹 world-tree | 23.6 % | 51.6 u |
 *
 * ⇒ 四分之一到三分之一的查表結果是「**朝著一堵牆直直走**」。
 * `MovementSystem` 把它當成目標，`steerAroundObstacles` 只認**圓形**障礙物
 * （這 6 張圖是 graybox，全部是 `box`）⇒ 切向分量 0 ⇒ **原地卡死**。
 *
 * 實測一條完整的走位（芙莉蓮，出生點 → 對面出生點）：**第 100 tick 起
 * 永遠停在 (-0.73, 9.00)**，離目的地還有 19.73 u，之後 300 tick 一步都沒動。
 * ⛔ 這不是「有點卡」，是走不到。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼修在**執行期**而不是修 `bakeNav`
 *
 * 修 `bakeNav`（改成取 `dist[from][via]` 最小的 via）是對的，但它要**重烘 6 張
 * 場地的 `content/arenas/*.json`**，而那需要 `pnpm content:build` 重寫
 * `bundle.json` —— 這一批**明令禁止**跑它（併行 lane 的鎖）。
 *
 * ⭐ 而且執行期這一份**更強**：它用的是**真實的碰撞幾何**（`zone.obstacles`
 * ＋ 身體半徑），⛔ 不是烘焙時的 tile grid。一條「格網上連得起來」的邊，
 * 在 0.6 半徑的身體走起來可能是卡在門框上 —— 那正是 `bakeNav` 看不到的東西。
 *
 * ⚠️ 兩者不衝突：哪天 `bakeNav` 修好並重烘，這一支只會發現「每一跳本來就看得到」
 * 而原樣放行（`correctedNextHop` 對一份正確的表是恆等的）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 做法：**視線鄰接圖 + 一次性 Dijkstra + 快取**，執行期仍然只是查表
 *
 *   ① 鄰接：節點 i ~ j ⟺ i→j 的直線**帶著身體半徑**不碰到任何障礙物
 *   ② 對每一個目標節點 j 跑一次 Dijkstra（權重＝**真實距離**），得到
 *      `nextHop[i][j]` 與 `cost[i][j]`。⛔ **不是 BFS 跳數** —— 見 `buildRoute`
 *      的註解：視線邊可以長達整張圖，跳數最少的路可以比最短路長好幾倍，
 *      實測會把單位往反方向帶 130 tick（31 次方向反轉）。
 *   ③ 整張表**快取**在 `zone.id | 半徑 | 節點數` 之下 —— 內容在一個 process 裡
 *      是不變的，所以 200 場比賽共用同一份
 *
 * ⇒ 每一跳**保證身體走得過去**，而 runtime 仍然是一次陣列查表（原設計不變）。
 *
 * ⚠️ **決定性**：只有加減乘除與 `Math.sqrt`，資料來源是同一份內容，
 * 迭代全部走升冪的陣列、平手一律取索引最小
 * ⇒ 伺服器與客戶端算出**逐位元相同**的表。
 * 這是這一支必須放在 `sim/` 而不是客戶端的唯一理由。
 *
 * ⚠️ 兩份量測（實測，⛔ 不是估的）：一張表建一次 **38–62 ms**（n≈58，一個
 * process 一輩子一次），之後每次查詢 **3.7–8.5 µs**。⭐ 後者能壓到個位數 µs，
 * 是因為順手修掉了 `map/lineOfSight.ts` 每次呼叫配十幾個物件的成本
 * （**36.9 µs → 0.79 µs**）—— 那條路徑普攻視線也在走。
 *
 * ⚠️ **門（gateGroup）**：鄰接圖用**全部**障礙物建（保守：不假設門是開的），
 * 而「終點直接看得到嗎」與前瞻拉繩用**這一 tick 真的擋路**的那一組
 * ⇒ 門開著的時候直線捷徑自動生效，門關著的時候路線本來就繞開它。
 */
import type { NavTable, Obstacle, ZoneDef } from "./world/ArenaDef";
import type { Vec2 } from "./math/vec2";
import { segmentHitsAny } from "./map/lineOfSight";
// ⛔ **一鍵回頭專用**：`nextWaypoint` 就是本檔頭記錄的那個缺陷本人。
// ⭐ 沿用它而不是在這裡抄一份 —— 抄一份等於「烘焙表怎麼查」有兩個住處，
//    而回頭那條路一旦與原始行為漂走，這個開關就不再是 rollback（第零守則⑨）。
import { nextWaypoint as bakedNextWaypoint } from "./map/navFollow";

/**
 * ⭐ 三個**決策點**（第一守則），owner 2026-08-23：
 *
 *     「沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback」
 *
 * ⇒ 我挑了，而且三格都做成可以一鍵翻回去的開關。
 *
 * ⛔ **為什麼是一個模組現值而不是一份 `config.map-nav@1`**：新增
 * `content/config/*.json` 必須跑 `pnpm content:build` 把它嵌進 `bundle.json`，
 * 而這一批**明令禁止**跑它（併行 lane 的 `bundle.json` 鎖）。
 * ⭐ 逐字沿用同一天 `sim/flight.ts` 的前例（「三格集中在這裡一個住處、
 * 由單一出口供應，之後要抬進 config 是一次搬家」）：
 * {@link applyNavRulesDoc} 已經是 `config.combat-feel@1` 的讀取器形狀，
 * 之後接上去是**一行**。
 */
export interface NavRules {
  /**
   * 用視線重算 next-hop（本檔的主體）。
   * `false` = 逐位元退回烘焙表的原始行為（＝這條缺陷被修之前）。
   */
  losCorrection: boolean;
  /**
   * ⭐ **飛行單位不查導航表**。飛行的定義就是「穿過牆與柱子」
   * （`sim/flight.ts` 的 `ignoreObstacles`），而導航表存在的唯一理由是繞開它們
   * ⇒ 讓飛行單位照著地面路線繞路，是**兩個機制互相矛盾**。
   *
   * ⚠️ 這也是 owner 說的「後端計算與前端預測方法不同」的一半：
   * 伺服器讓她穿牆，路線卻是繞的 ⇒ 她走的是一條沒有人預測得出來的曲線。
   */
  flyersGoStraight: boolean;
  /**
   * 前瞻拉繩（string-pulling）：路線上**看得到**的最遠那一個節點才是目標，
   * ⛔ 不是逐個節點折線走。關掉 = 每經過一個節點轉一次身（可見的鋸齒）。
   */
  lookahead: boolean;
}

/** 出貨值 —— 三格全開。⛔ 不是「全開比較安全」：見上面每一格自己的理由。 */
export const DEFAULT_NAV_RULES: NavRules = Object.freeze({
  losCorrection: true,
  flyersGoStraight: true,
  lookahead: true,
});

let rules: NavRules = DEFAULT_NAV_RULES;

/** 這一場實際生效的規則。 */
export function navRules(): NavRules {
  return rules;
}

/** 正規化操作者/文件給的表 —— 缺格一律回出貨預設。 */
export function normalizeNavRules(raw: unknown): NavRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_NAV_RULES;
  const r = raw as Record<string, unknown>;
  const pick = (k: keyof NavRules): boolean =>
    typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_NAV_RULES[k];
  return { losCorrection: pick("losCorrection"), flyersGoStraight: pick("flyersGoStraight"), lookahead: pick("lookahead") };
}

/** 套用一份設定文件的 `mapNav` 區塊（缺 = 出貨預設）。測試用 `null` 復位。 */
export function applyNavRulesDoc(doc: unknown): void {
  const raw = (doc as { mapNav?: unknown } | null | undefined)?.mapNav;
  rules = raw === undefined || raw === null ? DEFAULT_NAV_RULES : normalizeNavRules(raw);
}

/**
 * 半徑分桶（0.1 u）—— 快取鍵的一部分。
 *
 * ⚠️ 分桶而不是用原值：`radius` 是浮點數，用它當鍵會讓每一個身體各自建一張表。
 * 0.1 u 遠小於任何一道門的餘裕，⛔ 不會讓一條走得過去的邊變成走不過去。
 */
function radiusBucket(radius: number): number {
  const r = radius > 0 ? radius : 0;
  return Math.round(r * 10);
}

/** 前瞻拉繩最多往前看幾跳 —— 見 {@link walkWaypoint} 步驟 4 的預算說明。 */
const LOOKAHEAD_HOPS = 3;

/** 一份修正過的路由表。`nextHop[i * n + j]` = 從節點 i 走向節點 j 的下一個節點。 */
interface WalkRoute {
  nodes: readonly Vec2[];
  nextHop: Int16Array;
  /** `cost[i * n + j]` = i→j 沿著視線邊的**實際距離**；`Infinity` = 到不了。 */
  cost: Float64Array;
}

/**
 * 全域快取。⚠️ 只做 get/set，**⛔ 從不迭代** —— `sim/purity.test.ts` 管的是
 * 「Map 迭代序」，而這裡沒有任何迭代。
 *
 * 鍵含節點數，所以同一個 `zone.id` 被換過內容（編輯器改圖）也不會拿到舊表。
 */
const routeCache = new Map<string, WalkRoute>();

/** 測試用：清空快取（⛔ 出貨路徑不呼叫）。 */
export function clearNavRouteCache(): void {
  routeCache.clear();
}

/** 兩個節點之間，一具 `radius` 的身體走得過去嗎。 */
function edgeIsWalkable(a: Vec2, b: Vec2, obstacles: readonly Obstacle[], radius: number): boolean {
  return !segmentHitsAny(a, b, obstacles, radius);
}

/**
 * 建一份修正過的路由表。O(n² · 障礙物) 的鄰接 + n 次 O(n²) 的 Dijkstra，
 * 對 n ≤ 64 是一次性的幾十毫秒，之後全部是查表。
 *
 * ⭐ **權重是真實距離，⛔ 不是跳數。** 這一條是量出來的，⛔ 不是品味：
 * 視線鄰接圖上一條邊可以長達整張圖（兩個隔著空地的節點互相看得到），
 * 所以「跳數最少」＝「用最少的長跳」，而它挑出來的路線可以比最短路長好幾倍。
 * 實測（無限城，中心 → 東側出生點）：跳數版把單位往**西北**帶了 130 tick、
 * 橫越整張圖之後才折返，途中 **31 次方向反轉** —— 那正是 owner 說的
 * 「循環來回拉扯」。距離版：**0 次**。
 */
function buildRoute(nodes: readonly Vec2[], obstacles: readonly Obstacle[], radius: number): WalkRoute {
  const n = nodes.length;
  // ① 視線鄰接（無向）。逐 i<j 算一次，兩邊都寫 —— ⛔ 不重複算。
  const adj: number[][] = [];
  const wgt: number[][] = [];
  for (let i = 0; i < n; i++) {
    adj.push([]);
    wgt.push([]);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!edgeIsWalkable(nodes[i]!, nodes[j]!, obstacles, radius)) continue;
      const dx = nodes[j]!.x - nodes[i]!.x;
      const dz = nodes[j]!.z - nodes[i]!.z;
      const w = Math.sqrt(dx * dx + dz * dz);
      adj[i]!.push(j);
      wgt[i]!.push(w);
      adj[j]!.push(i);
      wgt[j]!.push(w);
    }
  }

  const nextHop = new Int16Array(n * n).fill(-1);
  const cost = new Float64Array(n * n).fill(Number.POSITIVE_INFINITY);
  const dist = new Float64Array(n);
  const done = new Uint8Array(n);
  for (let target = 0; target < n; target++) {
    // ② 從 target 反向 Dijkstra（圖是無向的 ⇒ dist[i] = i→target 的最短距離）。
    //    ⚠️ O(n²) 的「掃一遍挑最小」，⛔ 不是二元堆積：n ≤ 64，而且掃描版的
    //    平手規則是「索引最小」—— 一個堆積的平手順序取決於它的內部結構。
    dist.fill(Number.POSITIVE_INFINITY);
    done.fill(0);
    dist[target] = 0;
    for (let iter = 0; iter < n; iter++) {
      let cur = -1;
      let curD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < n; i++) {
        if (done[i] === 1) continue;
        // ⚠️ 嚴格小於 ⇒ 平手取索引最小。決定性靠這一行。
        if (dist[i]! < curD) {
          curD = dist[i]!;
          cur = i;
        }
      }
      if (cur < 0) break; // 剩下的都到不了
      done[cur] = 1;
      const nbs = adj[cur]!;
      const ws = wgt[cur]!;
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k]!;
        if (done[nb] === 1) continue;
        const alt = curD + ws[k]!;
        if (alt < dist[nb]!) dist[nb] = alt;
      }
    }
    for (let i = 0; i < n; i++) {
      cost[i * n + target] = dist[i]!;
      if (i === target) {
        nextHop[i * n + target] = target;
        continue;
      }
      if (dist[i] === Number.POSITIVE_INFINITY) continue; // 到不了 ⇒ 留 -1
      let best = -1;
      let bestTotal = Number.POSITIVE_INFINITY;
      const nbs = adj[i]!;
      const ws = wgt[i]!;
      // ⚠️ 走**升冪**的鄰居清單，平手一律取索引最小 —— 決定性的唯一來源。
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k]!;
        const total = ws[k]! + dist[nb]!;
        if (total < bestTotal) {
          bestTotal = total;
          best = nb;
        }
      }
      nextHop[i * n + target] = best;
    }
  }
  return { nodes, nextHop, cost };
}

/** 取（或建）這個 zone / 半徑的路由表。 */
function routeFor(zone: ZoneDef, nav: NavTable, radius: number): WalkRoute {
  const bucket = radiusBucket(radius);
  const key = `${zone.id}|${bucket}|${nav.nodes.length}`;
  const hit = routeCache.get(key);
  if (hit !== undefined) return hit;
  const built = buildRoute(nav.nodes, zone.obstacles, bucket / 10);
  routeCache.set(key, built);
  return built;
}

/**
 * 「照 `key` 由小到大試，回傳**第一個看得過去**的節點」——
 * 挑起點節點與終點節點共用的那一支。
 *
 * ⭐ **為什麼是「排序後早退」而不是「全掃一遍取最小」**：這是量出來的。
 * 全掃版每次查詢要做 n×障礙物 ≈ 58 × 16 ≈ **928 次線段測試**，實測
 * **每次查詢 1–2 ms** ⇒ 30 Hz × 12 具身體 = 每秒 0.4–0.7 秒的 CPU，⛔ 不能出貨。
 * 排序後早退的**期望**測試次數是 1–2 次（最近/最短的那個通常就看得到），
 * 只有「站在牆裡」這種病態情況才退化回全掃。
 *
 * ⚠️ 平手取索引最小（`<` 嚴格小於）—— 決定性的唯一來源。
 * ⚠️ `used` 是模組級暫存，⛔ 不是狀態：它在**同一次同步呼叫**內用完即棄，
 * 而 sim 是單執行緒逐 tick 跑的。這樣就不用每次查詢配一個陣列。
 */
let usedScratch = new Uint8Array(128);
function firstVisibleByKey(
  n: number,
  key: (i: number) => number,
  visible: (i: number) => boolean,
): number {
  if (usedScratch.length < n) usedScratch = new Uint8Array(n);
  const used = usedScratch;
  for (let i = 0; i < n; i++) used[i] = 0;
  for (let iter = 0; iter < n; iter++) {
    let pick = -1;
    let pickKey = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (used[i] === 1) continue;
      const k = key(i);
      if (k < pickKey) {
        pickKey = k;
        pick = i;
      }
    }
    if (pick < 0) return -1; // 剩下的全是 Infinity（到不了）
    used[pick] = 1;
    if (visible(pick)) return pick;
  }
  return -1;
}

/**
 * 離 `p` **最近而且看得到**的節點索引。
 *
 * ⛔ 為什麼不是單純「最近」（`map/navFollow.ts::nearestNode` 的做法）：
 * 一具貼著牆的身體，離它最近的節點常常在**牆的另一邊** —— 於是第一步就朝著
 * 一個穿不過去的點走。這正是「循環來回拉扯」的一半：走兩步、最近節點翻面、
 * 再走回來。
 */
function nearestVisibleNode(
  nodes: readonly Vec2[],
  p: Vec2,
  obstacles: readonly Obstacle[],
  radius: number,
): number {
  const hit = firstVisibleByKey(
    nodes.length,
    (i) => {
      const dx = nodes[i]!.x - p.x;
      const dz = nodes[i]!.z - p.z;
      return dx * dx + dz * dz;
    },
    (i) => edgeIsWalkable(p, nodes[i]!, obstacles, radius),
  );
  if (hit >= 0) return hit;
  // 一個都看不到（生在牆裡、或在門的死角）⇒ 退回純最近，行為與修正前相同。
  let fallback = -1;
  let fallbackD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i]!.x - p.x;
    const dz = nodes[i]!.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < fallbackD2) {
      fallbackD2 = d2;
      fallback = i;
    }
  }
  return fallback;
}

/**
 * 從 `p` **進入圖**的那個節點：看得到、而且
 * 「走到它 ＋ 從它走到 `target` 節點」的**總長**最短。
 *
 * ⛔ 為什麼不是「最近的那個」：最近的節點常常在**身後**。挑它 ⇒ 單位先往回走，
 * 到了節點才轉頭 ⇒ 畫面上就是一次 180° 的來回拉扯，而且**每次重新下令都會
 * 再來一次**。把「剩下的路有多長」算進去，身後的節點自然被淘汰。
 */
function entryNode(
  route: WalkRoute,
  p: Vec2,
  target: number,
  obstacles: readonly Obstacle[],
  radius: number,
): number {
  const n = route.nodes.length;
  return firstVisibleByKey(
    n,
    (i) => {
      const rest = route.cost[i * n + target]!;
      if (rest === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
      const dx = route.nodes[i]!.x - p.x;
      const dz = route.nodes[i]!.z - p.z;
      return Math.sqrt(dx * dx + dz * dz) + rest;
    },
    (i) => edgeIsWalkable(p, route.nodes[i]!, obstacles, radius),
  );
}

export interface WaypointQuery {
  zone: ZoneDef;
  from: Vec2;
  to: Vec2;
  radius: number;
  /** ⚠️ 這一 tick **真的擋路**的障礙物（gate 過濾之後）。 */
  liveObstacles: readonly Obstacle[];
}

/**
 * 這一 tick 該朝哪裡走 —— 世界座標，或 `null` =「直接朝最終目的地走」。
 *
 * 順序（每一步都是**單調**的，這是不震盪的理由）：
 *
 *   1. **終點直接走得到** → `null`。⭐ 走在這條淨空線段上的任何一點到終點
 *      仍然是同一條線段的子段 ⇒ 一旦成立就不會再翻回去，⛔ 沒有 flip-flop。
 *   2. 沒有導航表 → `null`（6 張手寫場地的既有行為，一個字都不用改）。
 *   3. 起點/終點各取**最近而且看得到**的節點，查修正過的表拿下一跳。
 *   4. 前瞻拉繩：沿著路線往前找**還看得到**的最遠節點 —— 同樣單調
 *      （朝著看得到的點走，它一路上都看得到）。
 */
export function walkWaypoint(q: WaypointQuery): Vec2 | null {
  const { zone, from, to, radius, liveObstacles } = q;
  // 1) 終點直接走得到 ⇒ 不需要任何導航。
  if (edgeIsWalkable(from, to, liveObstacles, radius)) return null;
  // 1′) 終點**在牆裡**（點到柱子上/牆上）⇒ ⛔ 不導航，直直走過去讓推出把身體
  //     停在牆面上 —— 那才是這個命令的意思。
  //     ⭐ 逐字沿用 `collision/avoid.ts` 對同一件事的裁決（「rounding a circle
  //     you were told to stand in is an endless orbit」）。⛔ 少了這一條，單位會
  //     停在離牆 4.2 u 的一個導航節點上不動（量到的：芙莉蓮場地中心 (0,0)
  //     正好落在一堵 x∈[0,2] 的牆裡）。
  if (segmentHitsAny(to, to, liveObstacles, 0)) return null;
  const nav = zone.nav;
  if (nav === undefined || nav.nodes.length === 0) return null;
  if (!rules.losCorrection) {
    // ⛔ 一鍵回頭：逐位元退回烘焙表的原始查法。
    return bakedNextWaypoint(nav, from, to);
  }
  const route = routeFor(zone, nav, radius);
  const n = route.nodes.length;
  // 終點那一端只能用「最近而且看得到」—— 那裡沒有「剩下的路」可以比。
  const b = nearestVisibleNode(route.nodes, to, liveObstacles, radius);
  if (b < 0) return null;
  const a = entryNode(route, from, b, liveObstacles, radius);
  if (a < 0) return bakedNextWaypoint(nav, from, to); // 一個進得去的節點都沒有
  if (a === b || !rules.lookahead) return route.nodes[a] ?? null;
  // 4) 前瞻拉繩 —— 沿路線往前走，回傳**還看得到**的最遠那一個節點。
  //    ⚠️ 起點是 `nodes[a]`（`entryNode` 保證它看得到），⛔ 不是它的下一跳 ——
  //    下一跳從**現在的位置**可能是穿牆的，那正是這一整支要修掉的東西。
  //    ⚠️ 上限 {@link LOOKAHEAD_HOPS} 跳，而這個數字是**量出來的預算**，
  //    ⛔ 不是「拉多一點比較平滑」：每一跳是一次視線測試，而視線測試是這一支
  //    最貴的東西。實測 8 跳 → 每次查詢 ~113 µs，而 30 隻殭屍 × 30 Hz 就吃掉
  //    整整 10 % 的一顆核心。3 跳已經把「逐節點折線」的鋸齒拉直
  //    （量到的方向反轉數不變：280 條路線 10 次）。
  let bestNode = route.nodes[a]!;
  let cur = a;
  for (let step = 0; step < LOOKAHEAD_HOPS && cur !== b; step++) {
    const nxt = route.nextHop[cur * n + b]!;
    if (nxt < 0 || nxt === cur) break;
    if (!edgeIsWalkable(from, route.nodes[nxt]!, liveObstacles, radius)) break;
    bestNode = route.nodes[nxt]!;
    cur = nxt;
  }
  return bestNode;
}
