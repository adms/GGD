/**
 * 「這個座標在哪一個**地圖區域**」（GH#324 Phase 3）—— O(1) 查表。
 *
 * ⛔ **不要跟 `zone` 搞混。** `zone` 在這個 codebase 裡是「一場獨立的 3v3 對戰
 * 實例」，而且是**隔離**的（zone 0 的單位對 zone 1 看不到打不到治不到）。
 * 這裡的 `region` 是**同一張地圖裡的命名區域**（琵琶廳／庭院／月台）——
 * 兩者是相反的東西，搞混會同時造成五件事而一條測試都不會紅
 * （完整清單見 `docs/_新場地計畫.md` 第二節）。
 *
 * ## ⛔ 為什麼是推導不是欄位
 *
 * `ENTITY_FLAG` 的 16 顆 bit **已經用光**（`ENTITY_FLAG_FREE_BITS` 是空陣列），
 * 而重用看起來閒置的 bit 會讓線上舊客戶端**靜默 desync**、沒有任何一處報錯。
 * ⇒ 區域歸屬做成「從 (doc, 座標) 算出來」的東西，**wire 成本 0**。
 * 這不是省事，是唯一可行的路。
 */
import type { MapRegion, ZoneDef } from "../world/ArenaDef";
import type { Vec2 } from "../math/vec2";

/**
 * 世界座標 → 格座標。
 *
 * ⚠️ 需要知道這張地圖的 `tileSize` 與原點。`ZoneDef` 上沒有存 tileSize，
 * 但 `bounds.rect` 的 halfW/halfD 加上 region rects 的格範圍足以還原它 ——
 * ⭐ 這裡改用**比例**而不是絕對格數，就不必存第二份 tileSize（第四個住處）。
 */
function toTile(zone: ZoneDef, p: Vec2, cols: number, rows: number): { col: number; row: number } {
  const b = zone.bounds;
  const halfW = b !== undefined && b.kind === "rect" ? b.halfW : zone.boundaryRadius;
  const halfD = b !== undefined && b.kind === "rect" ? b.halfD : zone.boundaryRadius;
  const u = (p.x - (zone.center.x - halfW)) / (halfW * 2);
  const v = (p.z - (zone.center.z - halfD)) / (halfD * 2);
  return { col: Math.floor(u * cols), row: Math.floor(v * rows) };
}

/** region rects 的外接格數 —— 從資料推，⛔ 不另存一份 cols/rows。 */
function gridExtent(regions: readonly MapRegion[]): { cols: number; rows: number } {
  let cols = 0;
  let rows = 0;
  for (const rg of regions) {
    for (const rc of rg.rects) {
      if (rc.col + rc.w > cols) cols = rc.col + rc.w;
      if (rc.row + rc.h > rows) rows = rc.row + rc.h;
    }
  }
  return { cols, rows };
}

/**
 * `p` 落在哪一個地圖區域？沒有區域資料或不在任何區域內時回 `null`。
 *
 * ⚠️ 重疊時**後面的贏**（與產生器烘焙 tile→region 表的規則一致）——
 * 兩邊不一致的話，同一個座標在伺服器與客戶端會得到不同的名字。
 */
export function regionAt(zone: ZoneDef, p: Vec2): MapRegion | null {
  const regions = zone.regions;
  if (regions === undefined || regions.length === 0) return null;
  const { cols, rows } = gridExtent(regions);
  if (cols === 0 || rows === 0) return null;
  const t = toTile(zone, p, cols, rows);
  if (t.col < 0 || t.row < 0 || t.col >= cols || t.row >= rows) return null;

  let hit: MapRegion | null = null;
  // ⚠️ 正序掃、後面的覆蓋前面的 —— ⛔ 不可以 early-return（那會變成「前面的贏」）。
  for (const rg of regions) {
    for (const rc of rg.rects) {
      if (t.col >= rc.col && t.col < rc.col + rc.w && t.row >= rc.row && t.row < rc.row + rc.h) {
        hit = rg;
        break;
      }
    }
  }
  return hit;
}

/** 給 HUD／語音／報位置用的短標籤。沒有區域資料時回空字串。 */
export const regionLabelAt = (zone: ZoneDef, p: Vec2): string => regionAt(zone, p)?.label ?? "";
