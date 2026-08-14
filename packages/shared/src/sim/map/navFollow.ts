/**
 * 導航：**只查表，零搜尋**（GH#324 Phase 3）。
 *
 * ⛔ 這個檔在 `sim/` 底下，所以受 `purity.test.ts` 管：
 * 禁 `Math.random` / `Date.now` / 全部三角函式 / `Math.pow|exp|log|hypot|cbrt` / `**`，
 * Map 迭代要排序，到期用絕對 tick。
 *
 * ⭐ 它天然合規，因為**所有的路徑計算都在離線烘焙時做完了**
 * （`packages/shared/src/map/graph.ts::bakeNav`）。runtime 只做兩件事：
 *   ① 找離某個世界座標最近的導航節點（線性掃 ≤64 個，決定性）
 *   ② 查 `nextHop[from * n + to]`
 *
 * 這是唯一能同時滿足三個約束的形狀：purity 閘 · 決定性 · **客戶端預測必須算出
 * 跟伺服器一模一樣的結果**。任何有浮點累積或迭代序敏感的搜尋都會撞上其中之一。
 */
import type { NavTable } from "../world/ArenaDef";
import type { Vec2 } from "../math/vec2";

/**
 * 離 `p` 最近的節點索引。⚠️ 平手取**索引最小**的 —— 決定性的唯一來源。
 * 找不到（沒有節點）回 -1。
 */
export function nearestNode(nav: NavTable, p: Vec2): number {
  let best = -1;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i]!;
    const dx = n.x - p.x;
    const dz = n.z - p.z;
    const d2 = dx * dx + dz * dz;
    // ⚠️ 嚴格小於 ⇒ 平手保留較小的索引。
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

/**
 * 從 `from` 往 `to` 的**下一個路徑點**（世界座標）。
 *
 * 回 `null` 代表「不需要繞路」或「到不了」——兩種情況呼叫端的處置一樣：
 * 直接朝最終目的地走（既有行為）。
 *
 * ⭐ 判準：如果起點與終點**已經在同一個節點**，也回 null ——
 * 那表示兩點近到不需要導航，硬套 waypoint 反而會讓單位先往節點走再回頭。
 */
export function nextWaypoint(nav: NavTable | undefined, from: Vec2, to: Vec2): Vec2 | null {
  if (nav === undefined || nav.nodes.length === 0) return null;
  const n = nav.nodes.length;
  const a = nearestNode(nav, from);
  const b = nearestNode(nav, to);
  if (a < 0 || b < 0 || a === b) return null;
  const via = nav.nextHop[a * n + b];
  if (via === undefined || via < 0) return null;
  return nav.nodes[via] ?? null;
}
