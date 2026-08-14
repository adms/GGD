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
