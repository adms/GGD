/**
 * guardianVolley —— 「守衛塔打你」這件事的**純**那一半（GH#567）。
 *
 * owner 2026-08-23（逐字）：
 *
 * > 「**場上打贏可以補血的物件也會攻擊英雄，但沒有明顯的動作跟投射物指引**，
 * >  所以看不出來是物件打英雄，**看起來只會覺得有隱形英雄在打我**」
 * > 「請補上該物件**伸縮抖一下**然後出現**投射物飛向被攻擊方**的攻擊效果吧」
 *
 * ---------------------------------------------------------------------------
 * 缺的**不是**傷害、也不是預告圈 —— 是「誰打的」
 * ---------------------------------------------------------------------------
 * `guardianMark` 一直有客戶端消費端：它在**你腳下**畫一個會填滿的地面圈。
 * 但沒有任何東西把那個圈跟守衛連起來，所以玩家看到的逐字就是 owner 說的
 * 「隱形英雄在打我」。⭐ 這個檔案補的是**來源指引**，⛔ 不是改預告圈
 * （圈的中立琥珀色是刻意的，見 `Telegraph.ts`）。
 *
 * ---------------------------------------------------------------------------
 * 時序：投射物**一定**要在 `impactTick` 那一刻到
 * ---------------------------------------------------------------------------
 * `guardianMark` 帶著 `impactTick`，而地面圈正是在 `(impactTick − now)` 這段
 * 窗口裡填滿的。投射物如果自己挑一個飛行速度，它就會跟圈**說不同的話** ——
 * 一個說「還有 0.4 秒」、一個說「還有 0.9 秒」，而玩家會相信比較嚇人的那個。
 * ⇒ 飛行時間 = 窗口本身，⛔ 不是一格速度。
 *
 * ⚠️ 發射動作（守衛自己伸縮抖一下）要**吃掉窗口的前一小段**：先蹲下蓄力再射，
 * 才讀得出因果。`LAUNCH_SHARE` 是那一段佔窗口的比例。
 */

/** 一個世界座標點（兩端都是點：實體會死掉，點不會 —— 同 `arcBolt.ArcEnd`）。 */
export interface VolleyEnd {
  x: number;
  y: number;
  z: number;
}

/**
 * 發射動作佔整個預告窗口的比例。剩下的才是飛行時間。
 *
 * 0.22 ≈ 一個短窗口（0.9 秒）裡的 0.2 秒 —— 看得出「它動了一下」而不會讓
 * 投射物在剩下的路上快到看不見。
 */
export const LAUNCH_SHARE = 0.22;

/** 投射物飛過去時最高離直線多少（世界單位）—— 一條微彎的拋物線，不是雷射。 */
export const ARC_HEIGHT = 1.1;

/** 守衛塔的砲口高度（世界單位）。塔的渲染高度是 3.2，這是它的胸口。 */
export const MUZZLE_Y = 1.9;

/** 落點高度：貼著地面圈的上方一點，讓「命中」與圈對得起來。 */
export const IMPACT_Y = 0.35;

/**
 * 這一發的發射動作要花多少毫秒、飛行要花多少毫秒（PURE）。
 *
 * `windupMs` 是 `(impactTick − now) × TICK_MS`，也就是預告圈填滿的那段時間。
 * 兩段加起來**恰好**等於它 —— 差一毫秒都會讓投射物比傷害早到或晚到，而
 * 「看起來已經打到了但還沒掉血」正是這張票要消滅的那種不可讀。
 */
export function volleyTiming(windupMs: number): { launchMs: number; flightMs: number } {
  const total = Math.max(1, windupMs);
  const launchMs = Math.min(total * LAUNCH_SHARE, total - 1);
  return { launchMs, flightMs: total - launchMs };
}

/**
 * 投射物在 `u`（0..1 飛行進度）時的世界座標（PURE）。
 *
 * 直線插值 + 一條 `4u(1−u)` 的拋物線抬高。⛔ 不用三角函式也不用 RNG：
 * 這一支被純測試釘住，而且重播同一場比賽要長得一模一樣。
 */
export function volleyPoint(from: VolleyEnd, to: VolleyEnd, u: number): VolleyEnd {
  const t = Math.min(1, Math.max(0, u));
  const lift = 4 * t * (1 - t) * ARC_HEIGHT;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t + lift,
    z: from.z + (to.z - from.z) * t,
  };
}

// ---------------------------------------------------------------------------
// 伸縮抖一下 —— 守衛自己的發射動作
// ---------------------------------------------------------------------------

/** 蓄力時壓多扁（1 = 不動）。 */
export const SQUASH = 0.82;
/** 放出去時抽多長。 */
export const STRETCH = 1.16;

export interface RecoilScale {
  /** 水平縮放倍率 */
  xz: number;
  /** 垂直縮放倍率 */
  y: number;
}

export const RECOIL_IDENTITY: RecoilScale = { xz: 1, y: 1 };

/**
 * 發射動作的伸縮曲線（PURE）。`u` = 0..1 走完整個動作。
 *
 * 前 45%：**蹲下蓄力**（壓扁、變寬）—— 這是「它要出手了」。
 * 後 55%：**抽長彈回**（拉高、收窄）然後回到 1 —— 這是「它出手了」。
 *
 * ⭐ 體積大致守恆（壓扁就變寬），所以它讀起來是一個有重量的東西在動，
 * ⛔ 不是一個忽大忽小的貼圖。
 */
export function recoilScale(u: number): RecoilScale {
  if (!(u > 0) || u >= 1) return RECOIL_IDENTITY;
  if (u < 0.45) {
    const k = u / 0.45; // 0 → 1：站著 → 蹲到底
    const y = 1 + (SQUASH - 1) * k;
    return { xz: 1 / Math.sqrt(y), y };
  }
  const k = (u - 0.45) / 0.55; // 0 → 1：蹲到底 → 抽長 → 回到 1
  // 一次三角脈衝：k=0 在 SQUASH，k=0.35 到 STRETCH，k=1 回到 1
  const y = k < 0.35 ? SQUASH + (STRETCH - SQUASH) * (k / 0.35) : STRETCH + (1 - STRETCH) * ((k - 0.35) / 0.65);
  return { xz: 1 / Math.sqrt(y), y };
}

// ---------------------------------------------------------------------------
// 「它醒了」—— `guardianWake` 的消費端（在此之前是**零**消費端）
// ---------------------------------------------------------------------------

/**
 * 守衛被打醒之後這個伸縮動作跑多久（毫秒）。
 *
 * 比發射動作**長**而且更淺：醒來是一個狀態改變（「這座塔現在會還手了」），
 * 它要看得出來但⛔ 不可以看起來像一次攻擊 —— 那會讓玩家往旁邊跳而其實沒事。
 */
export const WAKE_MS = 520;

/** 醒來的伸縮：同一條曲線，但幅度只有一半（⛔ 不是第二套參數表）。 */
export function wakeScale(u: number): RecoilScale {
  const full = recoilScale(u);
  return { xz: 1 + (full.xz - 1) * 0.5, y: 1 + (full.y - 1) * 0.5 };
}
