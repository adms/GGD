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
/**
 * ⚠️ **模組級，⛔ 不是函式內的箭頭函式** —— 這兩支（與下面 `segmentHitsBox`
 * 的四個角）原本住在呼叫者裡面，於是**每一次呼叫都配一批物件**：
 * 每個盒子 = 1 個 `inside` 閉包 ＋ 1 個陣列 ＋ 4 個角物件 ＋ 4 個 `cross` 閉包。
 *
 * ⭐ 量到的（無限城，16 個障礙物）：`segmentHitsAny` 一次呼叫 **36.9 µs**，
 * 也就是每個盒子 2.3 µs —— 對二十來個浮點運算來說是荒謬的，而它全部是配置成本。
 * 這條路徑是**每 tick 每具身體**都在走的（普攻視線 `BasicAttackSystem`
 * ＋ 導航 `sim/navRoute.ts`），所以它不是微調。
 * ⛔ 幾何一個字都沒改（純提出來，同樣的算式、同樣的容差）。
 */
function crossAt(px: number, pz: number, qx: number, qz: number, rx: number, rz: number): number {
  return (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
}

/** 共線且落在區間內 —— 一律當成擋住（安全的那一邊）。 */
function onSeg(p: Vec2, q: Vec2, r: Vec2): boolean {
  return (
    Math.abs(crossAt(p.x, p.z, q.x, q.z, r.x, r.z)) < 1e-9 &&
    r.x >= Math.min(p.x, q.x) - 1e-9 &&
    r.x <= Math.max(p.x, q.x) + 1e-9 &&
    r.z >= Math.min(p.z, q.z) - 1e-9 &&
    r.z <= Math.max(p.z, q.z) + 1e-9
  );
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  return segmentsCrossXZ(a, b, c.x, c.z, d.x, d.z);
}

/** 同上，但第二條線段以**純數字**傳入（盒子的四條邊不必先做成物件）。 */
function segmentsCrossXZ(a: Vec2, b: Vec2, cx: number, cz: number, dx: number, dz: number): boolean {
  const d1 = crossAt(cx, cz, dx, dz, a.x, a.z);
  const d2 = crossAt(cx, cz, dx, dz, b.x, b.z);
  const d3 = crossAt(a.x, a.z, b.x, b.z, cx, cz);
  const d4 = crossAt(a.x, a.z, b.x, b.z, dx, dz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // 共線且落在區間內的退化情形 —— 一律當成擋住（安全的那一邊）。
  SCRATCH_C.x = cx;
  SCRATCH_C.z = cz;
  SCRATCH_D.x = dx;
  SCRATCH_D.z = dz;
  return (
    onSeg(SCRATCH_C, SCRATCH_D, a) ||
    onSeg(SCRATCH_C, SCRATCH_D, b) ||
    onSeg(a, b, SCRATCH_C) ||
    onSeg(a, b, SCRATCH_D)
  );
}

/**
 * ⚠️ 兩個模組級暫存點，只在 {@link segmentsCrossXZ} 的**同一個同步分支**裡用完即棄
 * （⛔ 從不跨呼叫存活、⛔ 從不外流）。sim 是單執行緒逐 tick 跑的，
 * 所以這不是狀態，是省掉兩次配置。
 */
const SCRATCH_C: Vec2 = { x: 0, z: 0 };
const SCRATCH_D: Vec2 = { x: 0, z: 0 };

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
  if (Math.abs(a.x - c.x) <= hw && Math.abs(a.z - c.z) <= hd) return true;
  if (Math.abs(b.x - c.x) <= hw && Math.abs(b.z - c.z) <= hd) return true;
  const x0 = c.x - hw;
  const x1 = c.x + hw;
  const z0 = c.z - hd;
  const z1 = c.z + hd;
  // ⭐ 早退：線段的 AABB 與盒子的 AABB 不重疊 ⇒ 不可能相交。
  //    這一行擋掉絕大多數的（盒子, 線段）配對，⛔ 而且它不改變任何答案。
  if (a.x < x0 && b.x < x0) return false;
  if (a.x > x1 && b.x > x1) return false;
  if (a.z < z0 && b.z < z0) return false;
  if (a.z > z1 && b.z > z1) return false;
  // 四條邊。⛔ 不做成一個 `corners` 陣列 —— 見 `crossAt` 上面那段配置成本的量測。
  return (
    segmentsCrossXZ(a, b, x0, z0, x1, z0) ||
    segmentsCrossXZ(a, b, x1, z0, x1, z1) ||
    segmentsCrossXZ(a, b, x1, z1, x0, z1) ||
    segmentsCrossXZ(a, b, x0, z1, x0, z0)
  );
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
