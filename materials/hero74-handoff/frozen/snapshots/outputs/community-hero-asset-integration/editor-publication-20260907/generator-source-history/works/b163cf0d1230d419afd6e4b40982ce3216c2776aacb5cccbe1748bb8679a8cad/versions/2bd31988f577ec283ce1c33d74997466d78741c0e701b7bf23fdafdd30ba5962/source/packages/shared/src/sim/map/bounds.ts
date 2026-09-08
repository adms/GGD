/**
 * 可玩範圍的形狀 —— **圓與矩形共用的一支**（GH#324 Phase 3）。
 *
 * ## 為什麼這個檔存在
 *
 * owner 2026-08-14 對「方形地圖上的火圈／殭屍波怎麼辦」的裁決是「**一樣要有**」。
 * ⛔ 不是關掉、⛔ 不是用內接圓（那會讓火圈咬到牆外的死角）。
 *
 * 而「把一個點放進可玩範圍」這件事，今天**散落在六個地方各做各的**：
 * `coins.ts` · `flowers.ts` · `mobs.ts` · `revive.ts` · `summons.ts` · `fireRing.ts`，
 * 每一處都寫死了「圓」。要支援矩形就得改六次 —— 那正是第零守則⑨的反面標記
 * （「如果我的 diff 散落在多個檔案各改兩行，而它們在做同一件事，就是漏了一次抽象」）。
 *
 * ⇒ 這一支是那次抽象。
 *
 * ⛔ purity：只用 `Math.sqrt` / `Math.abs` / `Math.min|max`，
 * 沒有三角函式、沒有 `Math.hypot`、沒有 `**`。
 */
import type { ZoneDef } from "../world/ArenaDef";
import type { Vec2 } from "../math/vec2";
// ⚠️ 表在 `map/` 算好再 import —— purity 閘是**掃原始碼**的，
//    `sim/**` 裡出現 Math.cos 就會紅，即使它只在模組載入時跑一次。
//    ⛔ 不要為了繞過它而改閘：那個嚴格是對的。
import { CIRCLE_STEPS, UNIT_CIRCLE } from "../../map/unitCircle";
// ⚠️ `map/spec.ts` 沒有任何 import（它只放常數與界），所以這一條不會產生模組循環。
import { SPAWN_ROOM_BODY_RADII_SHIPPED } from "../../map/spec";
// ⚠️ 單向：`collision/resolve` 不 import 這個檔（它只認 ZoneDef / vec2 / intersect），
//    所以沒有模組循環。
import { overlapsObstacle } from "../collision/resolve";

/** 這個分區的半寬／半深。圓形分區兩者都等於 `boundaryRadius`。 */
export function halfExtents(zone: ZoneDef): { halfW: number; halfD: number; rect: boolean } {
  const b = zone.bounds;
  if (b !== undefined && b.kind === "rect") return { halfW: b.halfW, halfD: b.halfD, rect: true };
  return { halfW: zone.boundaryRadius, halfD: zone.boundaryRadius, rect: false };
}

/**
 * 把 `p` 夾進可玩範圍，並留 `inset` 的邊距（通常是身體半徑）。
 *
 * ⭐ 圓 → 徑向夾；矩形 → 逐軸夾。**回傳新的點**，⛔ 不就地改（呼叫端有的傳的是
 * 共用的 body.pos，就地改會有別名問題）。
 */
export function clampIntoBounds(zone: ZoneDef, p: Vec2, inset = 0): Vec2 {
  const { halfW, halfD, rect } = halfExtents(zone);
  if (rect) {
    const maxX = Math.max(0, halfW - inset);
    const maxZ = Math.max(0, halfD - inset);
    const dx = p.x - zone.center.x;
    const dz = p.z - zone.center.z;
    return {
      x: zone.center.x + Math.min(maxX, Math.max(-maxX, dx)),
      z: zone.center.z + Math.min(maxZ, Math.max(-maxZ, dz)),
    };
  }
  const maxR = Math.max(0, zone.boundaryRadius - inset);
  const dx = p.x - zone.center.x;
  const dz = p.z - zone.center.z;
  const d2 = dx * dx + dz * dz;
  if (d2 <= maxR * maxR) return { x: p.x, z: p.z };
  const d = Math.sqrt(d2);
  if (d < 1e-9) return { x: zone.center.x + maxR, z: zone.center.z };
  return { x: zone.center.x + (dx / d) * maxR, z: zone.center.z + (dz / d) * maxR };
}

/** `p` 在可玩範圍內嗎（留 `inset` 邊距）？ */
export function insideBounds(zone: ZoneDef, p: Vec2, inset = 0): boolean {
  const { halfW, halfD, rect } = halfExtents(zone);
  const dx = p.x - zone.center.x;
  const dz = p.z - zone.center.z;
  if (rect) {
    return Math.abs(dx) <= halfW - inset + 1e-6 && Math.abs(dz) <= halfD - inset + 1e-6;
  }
  const maxR = zone.boundaryRadius - inset;
  return dx * dx + dz * dz <= maxR * maxR + 1e-6;
}

/**
 * 邊緣上的一個點 —— 殭屍從這裡湧進來。
 *
 * `t` ∈ [0,1) 是繞一圈的參數。
 * ⭐ 圓 → 用**多邊形近似**（⛔ 不可以用 sin/cos，purity 閘禁三角函式）：
 *   把單位圓切成 `CIRCLE_STEPS` 段，線性內插相鄰兩個頂點。
 *   頂點表是編譯期常數，決定性、零浮點漂移。
 * 矩形 → 沿著周長走。
 */
export function pointOnBoundary(zone: ZoneDef, t: number, inset = 0): Vec2 {
  const { halfW, halfD, rect } = halfExtents(zone);
  const u = t - Math.floor(t);
  if (rect) {
    const w = Math.max(0, halfW - inset) * 2;
    const d = Math.max(0, halfD - inset) * 2;
    const per = 2 * (w + d);
    if (per <= 0) return { x: zone.center.x, z: zone.center.z };
    let s = u * per;
    const x0 = zone.center.x - w / 2;
    const z0 = zone.center.z - d / 2;
    if (s < w) return { x: x0 + s, z: z0 };
    s -= w;
    if (s < d) return { x: x0 + w, z: z0 + s };
    s -= d;
    if (s < w) return { x: x0 + w - s, z: z0 + d };
    s -= w;
    return { x: x0, z: z0 + d - s };
  }
  const r = Math.max(0, zone.boundaryRadius - inset);
  const f = u * CIRCLE_STEPS;
  const i = Math.min(CIRCLE_STEPS - 1, Math.floor(f));
  const frac = f - i;
  const a = UNIT_CIRCLE[i]!;
  const b = UNIT_CIRCLE[i + 1]!;
  return {
    x: zone.center.x + (a.x + (b.x - a.x) * frac) * r,
    z: zone.center.z + (a.z + (b.z - a.z) * frac) * r,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 邊緣上**站得下**的一個點（殭屍波的落地點）
 *
 * `pointOnBoundary` 只回答「邊緣在哪」，⛔ 不回答「那裡站不站得下」。出貨的七張
 * 矩形圖把**整圈周長**都砌了 2 單位厚的牆（`halfD: 1` 的 box 貼著 `halfD: 18` 的
 * 邊界），所以 inset = 身體半徑的那一圈**逐點都在牆裡** —— 量到 900 個生成點有
 * 360 個落在障礙物內。
 *
 * ⇒ 需要一支會**找**的：沿周長走，走不到就一圈一圈往內縮。
 * ⛔ 不是隨機重試（決定性是硬需求，見 `mobSpawnPos` 的檔頭）。
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 往內縮最多**可玩範圍最短半徑的這個比例**。
 *
 * ⚠️ 它是這支搜尋唯一的「遊戲性」參數，而且刻意**不是無限**：波次的意義就是
 * 「從邊緣湧入」，放寬到 1 就等於允許把殭屍生在場中央。1/3 = 仍然在外圈，
 * 而且對出貨的七張矩形圖（minHalf 18–20）給出 6.0–6.7 的餘裕 —— 遠多於清掉
 * 2 單位厚周長牆所需的 2.0–3.2。
 */
export const EDGE_SPAWN_MAX_INWARD_FRACTION = 1 / 3;
/** 往內縮幾圈。圈距 = `minHalf × FRACTION / RINGS`。 */
export const EDGE_SPAWN_RINGS = 8;
/** 每一圈沿周長取樣幾個候選點。 */
export const EDGE_SPAWN_PERIMETER_SAMPLES = 24;

/**
 * `p` 這個半徑 `radius` 的身體**站得下**嗎 —— 在界內，而且不壓到任何障礙物。
 *
 * ⚠️ 刻意把**兩個**條件綁在一起：分開問正是 `mobSpawnPosAtDir` 原本的缺陷 ——
 * 「推出障礙」與「夾進邊界」各自成立，而它們的**組合**是空的。
 *
 * ⚠️ `gateGroup`（可開關的幾何）在這裡一律視為**擋路**。生成點是一個沒有 tick
 * 的純函式，拿不到 `gateStateAt` 需要的絕對 tick；把關著的門當成通路會讓殭屍生在
 * 門後面，而保守地把開著的門當成牆，最差只是少用幾個候選點。
 */
export function spotIsClear(zone: ZoneDef, p: Vec2, radius: number): boolean {
  if (!insideBounds(zone, p, radius)) return false;
  const body = { pos: p, radius };
  for (const ob of zone.obstacles) if (overlapsObstacle(body, ob)) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 站得下 **≠** 動得了（GH#398）
 *
 * {@link spotIsClear} 是一個**閉集合**測試：`insideBounds` 用 `<=`＋`1e-6`、
 * `overlapsObstacle` 也一樣，所以它連自由空間的**邊界**都說「可以」——
 * 而邊界上的餘裕**恰好是 0**。兩條擺放路徑偏偏都瞄準那條邊界：
 * `mobSpawnPosAtDir` 的 `pushOutOfObstacle`＋`clampToBoundary` 會把身體推到
 * **相切**，`freeEdgeSpot` 的第 0 圈 `inset = radius` 也**正好**是那條線。
 *
 * ⇒ 出貨量到（2026-08-20）：900 個生成點裡有 **4 個**只剩 **0.31 個身體半徑**
 * 的活動空間（`arena.dota` 的殭屍**王**，卡在 r=2.1 的石頭與外牆之間 0.28 單位），
 * 其餘 896 個全部 ≥ 2.00 —— 中間**一個都沒有**。#398 說的「0.01–0.08㎡ 可走空間
 * 碎片」就是同一件事的集合論殘影：那些「碎片」的面積逐格等於**一個取樣格**
 * （0.1 格距量到 0.010㎡、0.05 格距量到 0.003㎡ —— 它隨格距平方縮小，
 * 也就是**測度 0**），⛔ 不是兩張圖各自的資料缺陷。
 *
 * ⇒ 缺的那個運算就是這一支：**離得開嗎**。
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 沿幾個方向試著平移。16 ⇒ `CIRCLE_STEPS`(64) 的整數倍，查表不用內插。 */
export const SPAWN_ROOM_DIRS = 16;
/** 每一個身體半徑切幾段取樣。⚠️ 太粗會「跳過」窄縫而誤判成走得通。 */
export const SPAWN_ROOM_SUBSTEPS = 8;

/**
 * `p` 這個身體**離得開**嗎 —— 至少有一個方向可以直線平移
 * `bodyRadii` 個身體半徑而全程站得下。
 *
 * ⭐ 門檻的單位是**身體半徑**，⛔ 不是公尺 —— owner 調 `special.radiusMult`
 * 時它自己跟著長，⛔ 不必有人記得回來改（同 `nav.headroom` 的做法）。
 *
 * ⚠️ 直線平移是**保守**的近似：彎曲的縫隙會被判成「離不開」。那個方向是對的 ——
 * 誤判的代價只是換一個生成點（`freeEdgeSpot` 就在旁邊找），
 * 而反過來誤判的代價是一隻**站著不動**的殭屍。
 *
 * ⛔ 決定性：只用查表的 `UNIT_CIRCLE` 與乘加，無三角函式／`**`／亂數／時鐘。
 */
export function spotHasRoom(
  zone: ZoneDef,
  p: Vec2,
  radius: number,
  bodyRadii = SPAWN_ROOM_BODY_RADII_SHIPPED,
): boolean {
  const stride = CIRCLE_STEPS / SPAWN_ROOM_DIRS;
  const h = radius / SPAWN_ROOM_SUBSTEPS;
  const n = Math.max(1, Math.round(bodyRadii * SPAWN_ROOM_SUBSTEPS));
  for (let d = 0; d < SPAWN_ROOM_DIRS; d++) {
    const v = UNIT_CIRCLE[d * stride]!;
    let ok = true;
    for (let s = 1; s <= n; s++) {
      if (!spotIsClear(zone, { x: p.x + v.x * h * s, z: p.z + v.z * h * s }, radius)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * 從周長參數 `t0` 出發，找一個**站得下而且離得開**的邊緣點；找不到回 `null`。
 *
 * 搜尋順序（兩層有界迴圈，⛔ 沒有 `while`、⛔ 沒有隨機重試）：
 *   外層 = 一圈一圈**往內**（先貼著邊，縮不動才往內）
 *   內層 = 沿周長**左右交替**離開 `t0`（先靠近原方向，才愈走愈遠）
 *
 * ⭐ 這個順序就是優先序：**離邊緣近 > 離原方向近**。反過來排會讓一面牆把整批
 * 殭屍全部趕到房間中央，而它們本來只需要往內站 2 公尺。
 *
 * ⭐ 決定性：純算術（`Math.floor` / `Math.sqrt` / `Math.min|max`），⛔ 無三角函式、
 * ⛔ 無 `**`、⛔ 無 `Math.random`、⛔ 無時鐘、⛔ 無 Map 迭代 —— 同一組
 * `(zone, t0, radius)` 永遠得到同一個點，錄影重播不會分歧。
 */
export function freeEdgeSpot(zone: ZoneDef, t0: number, radius: number): Vec2 | null {
  const { halfW, halfD } = halfExtents(zone);
  const minHalf = Math.min(halfW, halfD);
  const step = (Math.max(0, minHalf - radius) * EDGE_SPAWN_MAX_INWARD_FRACTION) / EDGE_SPAWN_RINGS;
  for (let ring = 0; ring <= EDGE_SPAWN_RINGS; ring++) {
    const inset = radius + ring * step;
    for (let m = 0; m < EDGE_SPAWN_PERIMETER_SAMPLES; m++) {
      // m = 0, +1, −1, +2, −2, … 個取樣格，從 t0 向兩側交替展開。
      const away = (m + 1) >> 1;
      const dir = (m & 1) === 1 ? 1 : -1;
      const p = pointOnBoundary(zone, t0 + (dir * away) / EDGE_SPAWN_PERIMETER_SAMPLES, inset);
      // ⭐ GH#398 —— 兩個條件**一起**問。分開問正是這個檔早就記過的那個缺陷形狀。
      if (spotIsClear(zone, p, radius) && spotHasRoom(zone, p, radius)) return p;
    }
  }
  return null;
}

/**
 * 火圈／安全區在「收縮到 `radius`」時的**這一刻的形狀**。
 *
 * ⭐ 矩形分區的火圈**內縮成矩形**（owner 的裁決），所以「還在安全區內嗎」
 * 不是比距離，是比逐軸的內縮量。`radius` 對圓是半徑，對矩形是**內縮後的半寬**，
 * 半深按原比例縮 —— 這樣矩形不會被縮成正方形。
 */
export function insideShrunkBounds(zone: ZoneDef, p: Vec2, radius: number, inset = 0): boolean {
  const { halfW, halfD, rect } = halfExtents(zone);
  const dx = p.x - zone.center.x;
  const dz = p.z - zone.center.z;
  if (!rect) {
    const r = Math.max(0, radius - inset);
    return dx * dx + dz * dz <= r * r + 1e-6;
  }
  // 等比內縮：radius / halfW 是收縮比例
  const k = halfW <= 0 ? 0 : Math.max(0, Math.min(1, radius / halfW));
  const hw = Math.max(0, halfW * k - inset);
  const hd = Math.max(0, halfD * k - inset);
  return Math.abs(dx) <= hw + 1e-6 && Math.abs(dz) <= hd + 1e-6;
}
