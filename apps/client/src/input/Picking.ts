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
  /**
   * ⭐ 這一格是什麼**種類**（GH#863）。⛔ 它與 `priority` 不同義：
   * `priority` 只分「英雄類（0）／小怪（1）」，而守衛塔與花也是 0 ——
   * 「玩家專注」要的是**敵方玩家**，⛔ 不是「所有非小怪」。
   *
   * 省略 ⇒ 不參與任何過濾（既有呼叫端逐位元不變）。
   */
  kind?: "champion" | "mob" | "objective";
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
  /**
   * ⭐ **玩家專注**（spec §11–§13，GH#863）：只有敵方英雄是合法候選。
   *
   * ⚠️ 它是**過濾**，⛔ 不是加權 —— spec §16 逐字禁止「Player +100 / Boss +50」
   * 那種優先權加成（會造成瞄準磁吸）。⭐ 判準是「RS = WHERE，LT = WHO」。
   * ⚠️ 沒有 `kind` 的候選在開啟時會被**排除**（⛔ 不是放行）：一個沒有標種類的
   * 單位無法證明自己是玩家，而放行的代價是「按住 LT 還是打到殭屍」——
   * 那正是這個功能存在要解決的問題。
   */
  opts?: { readonly playersOnly?: boolean },
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const u of units) {
    const dx = u.x - from.x;
    const dz = u.z - from.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const d = len - u.radius;
    if (d > maxRange) continue;
    // ⭐ 無效候選**整個移除**，⛔ 不是給一個很差的分數（spec §54）——
    //   一個「分數很低但還是會被選上」的候選，在場上只剩它時就會被選上。
    if (opts?.playersOnly && u.kind !== "champion") continue;
    let score = d;
    if (aimDir && len > 1e-9) {
      const align = (dx * aimDir.x + dz * aimDir.z) / len; // -1..1
      score = d - align * 2.5;
    }
    // 小怪讓路給英雄 —— 見 MOB_AIM_ASSIST_PENALTY。⛔ 這是**自動**索敵才有的
    // 偏好；滑鼠直接點（pickUnit）不讀 priority。
    // ⭐ `priority` 現在**可以從 `kind` 推導**（GH#863）—— 小怪讓路，其餘不讓。
    //   ⇒ 呼叫端只要給 `kind` 就好，⛔ 不必再寫一次同一個事實（第〇·四守則）。
    //   顯式的 `priority` 仍然贏（既有呼叫端逐位元不變）。
    score += (u.priority ?? (u.kind === "mob" ? 1 : 0)) * mobPenalty;
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
