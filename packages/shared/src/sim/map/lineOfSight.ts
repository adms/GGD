/**
 * 視線：**牆擋普攻，不擋技能**（GH#324，owner 2026-08-14 的裁決）。
 *
 * > owner 逐字：「**擋普攻 不然會風箏到死 但不擋技能**」
 *
 * ## ⭐ 為什麼這是最省的正確答案
 *
 * 有瓶頸卻不擋任何東西，遠程角色可以隔著牆把近戰風箏到死 —— 地形完全沒有意義。
 * 但如果連**技能**也擋，那是靈魂層的大改：全部投射型技能的手感都會變，
 * 而且**所有既有錄影**都不再逐位元重播。
 *
 * ⇒ 只擋普攻：解決了風箏致死，避開了那兩個代價。
 * ⛔ `ProjectileSystem` 一個字都不動。
 *
 * ## ⚠️ 落點乾淨得剛好
 *
 * `BasicAttackSystem` 本來就是「進射程 → wind-up → 命中前再確認一次仍在射程，
 * **走出射程就取消**（LoL 式）」。視線檢查插進**同一個閘**，語意天然一致：
 * **走出視線 ＝ 走出射程**。⛔ 不需要新的狀態、不需要新的事件、不佔 flag bit。
 *
 * ⚠️ 視線要對**這一 tick 真的擋路**的障礙物算（gate 過濾之後）——
 * 一道開著的門不應該擋普攻。
 *
 * ⛔ purity：只有加減乘除與 `Math.sqrt`／`Math.abs`／`Math.min|max`。
 */
import type { Obstacle } from "../world/ArenaDef";
import type { Vec2 } from "../math/vec2";

/**
 * ⭐ **掠過餘裕** —— 視線用的障礙物比碰撞用的**小一點點**。
 *
 * ⚠️ 這不是美化，是實測逼出來的：一個被擠在柱子上的角色，身體會被
 * `pushOutOfObstacle` 頂在**柱面上**（距離剛好等於半徑）。若視線用真尺寸算，
 * 從柱面出發的那條射線在數值上「擦到」柱子 ⇒ 他連旁邊 1.2 單位的敵人都打不到。
 * `attackStandstill.test.ts` 的「被擠在柱子上磨蹭時照樣出手」就是這樣紅的。
 *
 * ⛔ 碰撞**不套**這個餘裕（牆還是實心的）—— 只有看得見／看不見這件事套。
 */
const LOS_GRAZE = 0.15;

/** 線段 A→B 與線段 C→D 相交嗎（含端點）。 */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // 共線且落在區間內的退化情形 —— 一律當成擋住（安全的那一邊）。
  const onSeg = (p: Vec2, q: Vec2, r: Vec2): boolean =>
    Math.abs(cross(p, q, r)) < 1e-9 &&
    r.x >= Math.min(p.x, q.x) - 1e-9 &&
    r.x <= Math.max(p.x, q.x) + 1e-9 &&
    r.z >= Math.min(p.z, q.z) - 1e-9 &&
    r.z <= Math.max(p.z, q.z) + 1e-9;
  return onSeg(c, d, a) || onSeg(c, d, b) || onSeg(a, b, c) || onSeg(a, b, d);
}

/** 線段 A→B 穿過這個圓嗎。`grow` 放大／縮小障礙物（見 {@link LOS_GRAZE}）。 */
function segmentHitsCircle(a: Vec2, b: Vec2, c: Vec2, r: number, grow: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 <= 1e-12 ? 0 : ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + dx * t - c.x;
  const pz = a.z + dz * t - c.z;
  const rr = Math.max(0, r + grow);
  return px * px + pz * pz < rr * rr;
}

/** 線段 A→B 穿過這個軸對齊盒嗎（四條邊各測一次；端點在盒內也算）。 */
function segmentHitsBox(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  halfW: number,
  halfD: number,
  grow: number,
): boolean {
  const hw = Math.max(0, halfW + grow);
  const hd = Math.max(0, halfD + grow);
  const inside = (p: Vec2): boolean => Math.abs(p.x - c.x) <= hw && Math.abs(p.z - c.z) <= hd;
  if (inside(a) || inside(b)) return true;
  const x0 = c.x - hw;
  const x1 = c.x + hw;
  const z0 = c.z - hd;
  const z1 = c.z + hd;
  const corners: Vec2[] = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsCross(a, b, corners[i]!, corners[(i + 1) % 4]!)) return true;
  }
  return false;
}

/**
 * ⭐ **一個 kind 分派，兩個消費者** —— 線段 A→B 有沒有碰到這一組障礙物中的任何一個。
 *
 * ⛔ 不要為了第二個問法再寫一份 switch（`collision/resolve.ts` 的 `obstacleOverlap`
 * 檔頭記著同一條理由）：兩份分派會各自腐爛，而下一個 obstacle kind 只被其中一份
 * 認得 —— 視線擋得住卻擋不住位移（或反過來），而兩邊看起來都是對的。
 *
 * @param grow 障礙物尺寸的增減。視線用 `-LOS_GRAZE`（縮一點，見上），
 *             位移的穿牆判定用 **0**（真尺寸：問的是「這條直線有沒有跨過牆」）。
 */
export function segmentHitsAny(
  from: Vec2,
  to: Vec2,
  obstacles: readonly Obstacle[],
  grow: number,
): boolean {
  for (const ob of obstacles) {
    if (ob.kind === "circle") {
      if (segmentHitsCircle(from, to, ob.center, ob.radius, grow)) return true;
    } else if (ob.kind === "box") {
      if (segmentHitsBox(from, to, ob.center, ob.halfW, ob.halfD, grow)) return true;
    } else if (segmentsCross(from, to, ob.a, ob.b)) {
      return true;
    }
  }
  return false;
}

/**
 * 從 `from` 看得到 `to` 嗎？
 *
 * @param obstacles ⚠️ 傳**這一 tick 真的擋路**的那些（gate 過濾之後）。
 *
 * ⭐ 這一支**只給普攻用**。⛔ 技能與投射物不呼叫它 —— 那是 owner 的裁決，
 * 不是還沒做完。
 */
export function hasLineOfSight(from: Vec2, to: Vec2, obstacles: readonly Obstacle[]): boolean {
  return !segmentHitsAny(from, to, obstacles, -LOS_GRAZE);
}
