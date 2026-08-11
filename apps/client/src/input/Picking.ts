/**
 * Picking — PURE math. The cursor is mapped onto the sim's ground plane
 * (y = 0) by ray/plane intersection — never by mesh picking — so the visual
 * click target and the server's planar world always agree. The Babylon side
 * (render/CameraRig) builds the ray; this module does the math, keeping
 * @babylonjs out of input/*.
 */
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface Ray3 {
  origin: Vec3Like;
  dir: Vec3Like;
}

/** Intersect a ray with the mathematical ground plane y=0 → planar (x,z). */
export function intersectRayGround(ray: Ray3): Vec2 | null {
  if (Math.abs(ray.dir.y) < 1e-9) return null; // parallel to the plane
  const t = -ray.origin.y / ray.dir.y;
  if (t < 0) return null; // plane is behind the ray
  return { x: ray.origin.x + ray.dir.x * t, z: ray.origin.z + ray.dir.z * t };
}

export interface PickableUnit {
  id: number;
  x: number;
  z: number;
  radius: number;
  /**
   * 自動索敵時的優先序：**0 = 優先**（英雄／守衛塔／花），**1 = 次要**（小怪）。
   *
   * ⚠️ 只有 {@link pickNearestUnit}（手把瞄準輔助 / 觸控自動取得）讀它。
   * {@link pickUnit}（滑鼠直接點）**刻意不讀** —— 直接點是玩家的明確選擇，
   * 點到誰就是誰，插一個優先序進去等於「我點了殭屍，英雄卻去打別人」。
   */
  priority?: number;
}

/**
 * 小怪在**自動**索敵裡要被扣多少分（GH#315）。
 *
 * ⭐ owner 2026-08-11 核准把它升級成後台欄位：`config.combat-feel@1` 的
 * `aimAssist.mobPenalty`（三個住處 = 內容檔 + Zod DEFAULT + 後台頁）。
 * 這裡留的是**拿不到文件時的結構性回退值**，和 `statCaps` / `cooldownRules`
 * 同一個分層 —— ⛔ 不是「真正生效的那個」。
 *
 * 呼叫端要傳 `penalty`；不傳＝用這個回退值，讓既有呼叫逐位元不變。
 */
export const MOB_AIM_ASSIST_PENALTY = 6.0;

/**
 * pickUnit — nearest unit whose collision circle (+slack for clickability)
 * contains the ground point. Matches the server's circle model, so what you
 * click is what the sim targets.
 */
/**
 * pickNearestUnit — nearest unit within maxRange of a point (gamepad target
 * acquisition). When aimDir is given, units along the aim direction win over
 * strictly-closer units behind the player (console-MOBA feel).
 */
export function pickNearestUnit(
  from: Vec2,
  units: Iterable<PickableUnit>,
  maxRange: number,
  aimDir?: Vec2 | null,
  /** 小怪讓路幅度。省略＝結構性回退值，見 {@link MOB_AIM_ASSIST_PENALTY}。 */
  mobPenalty: number = MOB_AIM_ASSIST_PENALTY,
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const u of units) {
    const dx = u.x - from.x;
    const dz = u.z - from.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const d = len - u.radius;
    if (d > maxRange) continue;
    let score = d;
    if (aimDir && len > 1e-9) {
      const align = (dx * aimDir.x + dz * aimDir.z) / len; // -1..1
      score = d - align * 2.5;
    }
    // 小怪讓路給英雄 —— 見 MOB_AIM_ASSIST_PENALTY。⛔ 這是**自動**索敵才有的
    // 偏好；滑鼠直接點（pickUnit）不讀 priority。
    score += (u.priority ?? 0) * mobPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = u.id;
    }
  }
  return best;
}

export function pickUnit(point: Vec2, units: Iterable<PickableUnit>, slack = 0.45): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const u of units) {
    const dx = u.x - point.x;
    const dz = u.z - point.z;
    const score = Math.sqrt(dx * dx + dz * dz) - u.radius - slack;
    if (score <= 0 && score < bestScore) {
      bestScore = score;
      best = u.id;
    }
  }
  return best;
}
