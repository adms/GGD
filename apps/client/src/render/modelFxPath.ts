/**
 * modelFxPath —— `spawnModelFx` 的**純**路徑數學（⛔ 沒有 Babylon、沒有 DOM）。
 *
 * ── 為什麼這是一個獨立的模組 ────────────────────────────────────────────────
 * owner 2026-08-22:「w3x jass + 球體 + 蝗蟲群單位 3d model 特效
 * (ex. Saber約束勝利之劍的翻滾光束就是)」。
 *
 * ⚠️ 原作那個東西**不是粒子發射器** —— JASS 生的是一隻帶模型的 dummy 單位
 * (`AddSpecialEffect` 貼在一個 locust 單位上)，然後每 0.03 秒把它往前推一格。
 * 所以「翻滾光束」的三個可見特徵全部是**單位運動**，不是粒子行為：
 *   ① 一個**實體**沿直線前進（粒子系統做不出「一顆一直存在的球體」）
 *   ② 它繞**自己的行進軸**滾（`spinDegPerSec`）——那是 `SetUnitFacing` 做不到的
 *      第三軸，原作用的是模型自帶的旋轉動畫
 *   ③ 走完就在**落點**爆（`onArrive`，莉娜龍破斬）
 *
 * ⭐ 這裡只算**位置與姿態**。誰被打到、打多少，是引擎（L1）的事 ——
 * 客戶端算傷害是失敗形態⑤（被測的不是出貨的那個）的最短路徑。
 *
 * ⚠️ 這裡**不可以**出現任何級距數字（第〇·四守則）：`speed`/`distance`/`scale`
 * 全部由呼叫端從技能 JSON 帶進來，這個檔一個字面平衡值都沒有。
 */

/** 路徑家族 —— 逐字照 L1／L2 共同約定的介面。 */
export type ModelFxPath = "forward" | "toTarget" | "orbit" | "radial";

/** `spawnModelFx` 的可見那一半（⛔ 不含 onArrive/onTouch 的 EffectDef[]，那是引擎的）。 */
export interface ModelFxMotionSpec {
  shape: "single" | "circle";
  modelKey: string;
  path: ModelFxPath;
  /** 世界單位／秒。`orbit` 時是**切線**速度，角速度由半徑推出來 */
  speed: number;
  /** 走多遠（forward/radial），也是 `orbit` 的半徑 */
  distance?: number;
  /** radial/orbit：幾個實例等分一圈 */
  count?: number;
  /** ⭐ 翻滾：繞自己的**行進軸**轉（度／秒） */
  spinDegPerSec?: number;
  scale?: number;
  lifeSec?: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** 發射當下的場景資訊。`facingRad` 是施法者朝向（世界 Y 軸偏航）。 */
export interface ModelFxOrigin {
  origin: Vec3Like;
  facingRad: number;
  /** `toTarget` 用；缺席時 `toTarget` 退化成 `forward`（fail-open，但呼叫端會拿到 usedFallback） */
  target?: Vec3Like;
}

/** 一個實例在某個時刻的姿態。 */
export interface ModelFxPose {
  x: number;
  y: number;
  z: number;
  /** 世界偏航（模型的「前方」指向哪） */
  yawRad: number;
  /** 繞行進軸的翻滾角 */
  rollRad: number;
  /** 這一格已經走完全程（forward/toTarget/radial）；orbit 永遠 false */
  arrived: boolean;
}

/** 一支 `spawnModelFx` 會生幾個實例。`single` 恆為 1，`circle` 吃 `count`。 */
export function modelFxInstanceCount(spec: ModelFxMotionSpec): number {
  if (spec.shape === "single") return 1;
  const n = Math.floor(spec.count ?? 1);
  return n > 0 ? n : 1;
}

/**
 * 一個實例活多久（秒）。
 *
 * 優先序：明寫的 `lifeSec` > 走完全程要的時間（`distance / speed`）> 一個保底。
 * ⚠️ 沒有上界的話一支忘了寫 `distance` 的技能會留下永久的孤兒（#131 的形狀），
 * 所以 `maxSec` 是**硬**上限，⛔ 不是建議。
 */
export function modelFxLifeSec(spec: ModelFxMotionSpec, maxSec: number): number {
  const explicit = spec.lifeSec;
  if (explicit !== undefined && explicit > 0) return Math.min(explicit, maxSec);
  const dist = spec.distance;
  if (dist !== undefined && dist > 0 && spec.speed > 0) {
    return Math.min(dist / spec.speed, maxSec);
  }
  return maxSec;
}

const TAU = Math.PI * 2;

/**
 * 第 `index` 個實例在 `tSec` 時的姿態。
 *
 * ⭐ 純函式、⛔ 無狀態 —— 所以「暫停 / 倒帶 / 錄影逐格步進」都跟即時播放走同一條路
 * （`W3xEmitterRig` 的 `pendingStartAtSec` 註解記過同一個坑：任何靠 wall clock
 * 的東西一暫停就漂掉）。
 */
export function modelFxPose(
  spec: ModelFxMotionSpec,
  at: ModelFxOrigin,
  index: number,
  tSec: number,
): ModelFxPose {
  const n = modelFxInstanceCount(spec);
  const i = Math.min(Math.max(Math.floor(index), 0), n - 1);
  const t = tSec > 0 ? tSec : 0;
  const speed = spec.speed > 0 ? spec.speed : 0;
  const rollRad = ((spec.spinDegPerSec ?? 0) * Math.PI) / 180 * t;
  const o = at.origin;

  if (spec.path === "orbit") {
    const radius = spec.distance !== undefined && spec.distance > 0 ? spec.distance : 1;
    // 切線速度 → 角速度。半徑越大轉越慢,這樣同一組參數在大小圈上看起來一樣快。
    const omega = speed / radius;
    const ang = at.facingRad + (i / n) * TAU + omega * t;
    return {
      x: o.x + Math.sin(ang) * radius,
      y: o.y,
      z: o.z + Math.cos(ang) * radius,
      // 面向切線方向(繞著跑的東西頭要朝前)
      yawRad: ang + Math.PI / 2,
      rollRad,
      arrived: false,
    };
  }

  // 直線家族:先決定方向與全長,再走 min(speed*t, span)。
  let dirX: number;
  let dirZ: number;
  let span: number;

  if (spec.path === "radial") {
    const ang = at.facingRad + (i / n) * TAU;
    dirX = Math.sin(ang);
    dirZ = Math.cos(ang);
    span = spec.distance !== undefined && spec.distance > 0 ? spec.distance : 0;
  } else if (spec.path === "toTarget" && at.target) {
    const dx = at.target.x - o.x;
    const dz = at.target.z - o.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) {
      dirX = dx / len;
      dirZ = dz / len;
    } else {
      dirX = Math.sin(at.facingRad);
      dirZ = Math.cos(at.facingRad);
    }
    // ⚠️ `toTarget` 的全長是**到目標的距離**,⛔ 不是 `distance` ——
    // 一支寫了 distance 的指定型技能不應該飛過頭。distance 只當上界。
    span = spec.distance !== undefined && spec.distance > 0 ? Math.min(len, spec.distance) : len;
  } else {
    // forward,以及 toTarget 缺目標時的退化
    dirX = Math.sin(at.facingRad);
    dirZ = Math.cos(at.facingRad);
    span = spec.distance !== undefined && spec.distance > 0 ? spec.distance : 0;
  }

  // `circle` + 直線家族(非 radial):等分一個側向排開,這樣「一排光束」不會疊成一根。
  let lateral = 0;
  if (spec.shape === "circle" && spec.path !== "radial" && n > 1) {
    lateral = (i - (n - 1) / 2) * (spec.scale ?? 1);
  }

  const travelled = span > 0 ? Math.min(speed * t, span) : speed * t;
  const px = o.x + dirX * travelled + -dirZ * lateral;
  const pz = o.z + dirZ * travelled + dirX * lateral;

  return {
    x: px,
    y: o.y,
    z: pz,
    yawRad: Math.atan2(dirX, dirZ),
    rollRad,
    arrived: span > 0 && travelled >= span - 1e-6,
  };
}
