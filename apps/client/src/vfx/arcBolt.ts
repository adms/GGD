/**
 * arcBolt —— 「**一段電弧：從 A 打到 B**」的 PURE 幾何 + 參數表。
 *
 * ---------------------------------------------------------------------------
 * 這是**機制**，不是某一支技能
 * ---------------------------------------------------------------------------
 * CLAUDE.md 第〇·五守則：引擎做機制、JSON 做技能，⛔「為某支技能寫一個 if」
 * 就是越線。所以這個檔案裡**沒有**「連鎖閃電」四個字的邏輯 —— 它只知道
 * 「兩個世界座標之間長出一條會抖的亮線」。
 *
 * 一條鏈 = 呼叫端**逐跳各請求一段**：hop1 = strike(A,B)、hop2 = strike(B,C)…
 * 每一段自己有出生時間與壽命，所以「每個閃電有極小的時間間隔播放」是
 * **呼叫端排程出來的**，⛔ 不是這裡寫死的一段時間軸。同一個單元也直接服務
 * 「鎖鏈/電纜/牽引光束/雷擊補刀」這些同型的東西 —— 第二個只差參數，
 * 所以它不該是第二段程式（第零守則⑨）。
 *
 * ---------------------------------------------------------------------------
 * 為什麼弧帶是**躺平在 XZ 平面**的
 * ---------------------------------------------------------------------------
 * 戰鬥相機的俯角是 68°（`CAMERA_PITCH_RAD`），也就是視線離地板法線只有 22°。
 * 一條**直立**的帶子（`ribbonMath.buildRibbonPaths` 的世界-up 慣例，武器殘影
 * 用的那個）在這個角度會被壓成一條幾乎沒有面積的線；躺平的帶子則保有
 * cos(22°) ≈ 93% 的投影面積，等於幾乎正對鏡頭。這與地面痕跡 / 預告圈選擇
 * 躺平是同一個理由，⛔ 不是美術偏好。
 *
 * ⚠️ 高度（`y`）仍然是**逐點**的：`jitterY` 讓每一節上下歪一點，弧才不會看起來
 * 像貼在地板上的一條膠帶。
 *
 * ---------------------------------------------------------------------------
 * 隨機是**決定性**的
 * ---------------------------------------------------------------------------
 * `arcNoise` 是一個整數雜湊，⛔ 不是 `Math.random`。同一顆 seed 永遠長出同一條
 * 弧，所以 (a) 這個檔案可以被純測試釘住，(b) 重播同一場比賽畫面一樣，
 * (c) 渲染迴圈裡沒有 RNG（`GroundDecalPool` 的黃金角自旋是同一個立場）。
 */
import type { VfxBlendMode } from "@ggd/shared/content";
import { hotToCoolStops, type ColorStop, type Rgb } from "./vfxPresets";
import { sampleColorStops, type Vec3Triple } from "./ribbonMath";

/** 世界座標的一端（電弧兩頭都是點，⛔ 不是實體 —— 實體會死掉，點不會）。 */
export interface ArcEnd {
  x: number;
  y: number;
  z: number;
}

/** 折線上的一個節點。與 `ribbonMath` 共用同一個三元組型別。 */
export type ArcPoint = Vec3Triple;

/** 一段弧的完整參數。**每一個數字只住在這裡一份**。 */
export interface ArcBoltSpec {
  /** 折線段數（節點數 = segments + 1） */
  segments: number;
  /** 側向抖動幅度，佔兩端**水平**距離的比例 */
  jitter: number;
  /** 垂直抖動幅度，world units */
  jitterY: number;
  /** 弧帶半寬，world units */
  halfWidth: number;
  /** 一段弧的壽命（ms）。一跳一閃 —— 這個數字短到會讓人以為是錯字，是故意的 */
  lifeMs: number;
  /** 亮度維持在峰值的比例，之後才開始掉 */
  holdT: number;
  /** 分岔數（每一岔就是**另一段弧**，同一個單元） */
  forks: number;
  /** 分岔長度佔主幹全長的比例 */
  forkLength: number;
  /** 顏色 ramp（白熱 → 本色 → 冷卻 → 沒了） */
  stops: ColorStop[];
  blend: VfxBlendMode;
}

/**
 * ⭐ **參數表 —— 這一族視覺的唯一數字來源。**
 *
 * 渲染程式（`ArcBoltFx`）裡**一個數字都沒有**：它拿到的是一份 `ArcBoltSpec`。
 * 呼叫端可以逐次覆寫任何一格（`arcBoltSpec(tint, { halfWidth, forks, … })`），
 * 所以「粗一點 / 短一點 / 多兩岔」不需要改程式。
 *
 * ⚠️ 這一格**還不是**後台欄位：`config.vfx-families@1` 的 Zod schema 住在
 * `packages/shared`，不在這條 lane 裡。⛔ 所以上面那句話講的是「呼叫端可調」，
 * ⛔ 不是「後台可調」—— 第一·五守則：不寫做不到的事。要把它接上後台，
 * 加一格 schema 欄位然後把它折進 `arcBoltSpec` 的 `opts` 即可，
 * ⛔ 不必動 `ArcBoltFx`。
 */
export const ARC_BOLT_TUNING = {
  segments: 8,
  jitter: 0.11,
  jitterY: 0.16,
  halfWidth: 0.085,
  lifeMs: 130,
  holdT: 0.35,
  forks: 2,
  forkLength: 0.22,
  blend: "additive" as VfxBlendMode,
};

/** 元素本色。白熱的核心由 `hotToCoolStops` 自己疊出來，⛔ 不在這裡調白。 */
export const ARC_TINTS = {
  lightning: [0.62, 0.82, 1],
  holy: [1, 0.94, 0.7],
  fire: [1, 0.58, 0.24],
  arcane: [0.76, 0.6, 1],
} as const satisfies Record<string, Rgb>;

/** 逐次覆寫。`power` 是「這一段有多重」的單一旋鈕（粗細 + 分岔一起動）。 */
export interface ArcBoltOptions extends Partial<Omit<ArcBoltSpec, "stops">> {
  /** 整體強度，0.4–2（粗細與分岔數一起放大） */
  power?: number;
  /** ramp 峰值透明度 */
  peakAlpha?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 參數表 + 這一次的覆寫 → 一份 spec。 */
export function arcBoltSpec(tint: Rgb = ARC_TINTS.lightning, opts: ArcBoltOptions = {}): ArcBoltSpec {
  const t = ARC_BOLT_TUNING;
  const p = clamp(opts.power ?? 1, 0.4, 2);
  return {
    segments: Math.max(2, Math.floor(opts.segments ?? t.segments)),
    jitter: opts.jitter ?? t.jitter,
    jitterY: opts.jitterY ?? t.jitterY,
    halfWidth: (opts.halfWidth ?? t.halfWidth) * p,
    lifeMs: Math.max(1, opts.lifeMs ?? t.lifeMs),
    holdT: clamp(opts.holdT ?? t.holdT, 0, 0.95),
    forks: Math.max(0, Math.round(opts.forks ?? t.forks * p)),
    forkLength: opts.forkLength ?? t.forkLength,
    blend: opts.blend ?? t.blend,
    stops: hotToCoolStops(tint, { peakAlpha: opts.peakAlpha ?? 1, hotT: 0.12 }),
  };
}

/** 決定性雜湊 → [-1, 1)。⛔ 不是 `Math.random`（見檔頭）。 */
export function arcNoise(seed: number, i: number): number {
  let h = (Math.imul(seed | 0, 374761393) + Math.imul(i | 0, 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return h / 2147483648;
}

/**
 * A → B 的折線。
 *
 * ⭐ **兩端是精確的。** 中間的節點才抖（`sin(πt)` 讓抖動在中段最大、兩端歸零）——
 * 一條沒有打在目標身上的閃電，玩家讀到的是「這一跳沒中」，
 * 而那正是這個特效存在的目的的反面。
 */
export function buildArcPath(a: ArcEnd, b: ArcEnd, spec: ArcBoltSpec, seed: number): ArcPoint[] {
  const n = spec.segments;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  // XZ 平面上的法線 —— 側向位移就是玩家真正看得到的那個方向（見檔頭）
  const px = -dz / len;
  const pz = dx / len;
  const amp = len * spec.jitter;
  const out: ArcPoint[] = new Array<ArcPoint>(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = i === 0 || i === n ? 0 : Math.sin(Math.PI * t);
    const j = arcNoise(seed, i) * amp * taper;
    const jy = arcNoise(seed ^ 0x9e37, i) * spec.jitterY * taper;
    out[i] = [a.x + dx * t + px * j, a.y + dy * t + jy, a.z + dz * t + pz * j];
  }
  return out;
}

/**
 * 折線 → 躺平的弧帶（`CreateRibbon` 的兩條 path）。
 *
 * 每個節點的半寬沿著**局部切線的 XZ 法線**推開，兩端收窄成尖點 ——
 * 等寬的矩形帶讀起來是緞帶，不是閃電。
 */
export function arcStripPaths(
  points: readonly ArcPoint[],
  halfWidth: number,
): { left: ArcPoint[]; right: ArcPoint[] } {
  const n = points.length;
  const left: ArcPoint[] = new Array<ArcPoint>(n);
  const right: ArcPoint[] = new Array<ArcPoint>(n);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[i > 0 ? i - 1 : 0]!;
    const next = points[i < n - 1 ? i + 1 : n - 1]!;
    let tx = next[0] - prev[0];
    let tz = next[2] - prev[2];
    const m = Math.hypot(tx, tz) || 1e-6;
    tx /= m;
    tz /= m;
    const w = halfWidth * (i === 0 || i === n - 1 ? 0.15 : 1);
    left[i] = [p[0] - tz * w, p[1], p[2] + tx * w];
    right[i] = [p[0] + tz * w, p[1], p[2] - tx * w];
  }
  return { left, right };
}

/** 一條分岔：從主幹上的某一節點岔出去的**另一段弧**。 */
export interface ArcFork {
  from: ArcEnd;
  to: ArcEnd;
}

/**
 * 主幹 → 分岔清單。分岔一律從**內部**節點長出來（從端點岔會讓人以為那是主幹
 * 的續段，也就是把「打到誰」這個資訊弄糊）。方向由兩顆雜湊值正規化而來，
 * ⛔ 不需要三角函數，也⛔ 不需要 RNG。
 */
export function arcForks(points: readonly ArcPoint[], spec: ArcBoltSpec, seed: number): ArcFork[] {
  const k = spec.forks;
  if (k <= 0 || points.length < 3) return [];
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1e-6;
  const reach = len * spec.forkLength;
  const inner = points.length - 2;
  const out: ArcFork[] = [];
  for (let f = 0; f < k; f++) {
    const idx = 1 + Math.floor(Math.abs(arcNoise(seed + f * 7919, 101)) * inner) % inner;
    const p = points[idx]!;
    let ux = arcNoise(seed + f * 7919, idx * 3 + 1);
    let uz = arcNoise(seed + f * 7919, idx * 3 + 2);
    const m = Math.hypot(ux, uz) || 1e-6;
    ux /= m;
    uz /= m;
    const scale = 0.5 + Math.abs(arcNoise(seed + f * 7919, idx * 3 + 3)) * 0.5;
    out.push({
      from: { x: p[0], y: p[1], z: p[2] },
      to: {
        x: p[0] + ux * reach * scale,
        y: p[1] + arcNoise(seed + f * 7919, idx * 3 + 4) * spec.jitterY,
        z: p[2] + uz * reach * scale,
      },
    });
  }
  return out;
}

/**
 * 亮度隨壽命：**維持在峰值，然後啪一聲不見**。
 *
 * ⛔ 不是線性淡出 —— 電弧慢慢變暗會讀成「一道光」而不是「一次放電」，
 * 而 owner 要的正是「一跳一閃」的顆粒感。
 */
export function arcFade(t: number, holdT: number): number {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  if (t <= holdT) return 1;
  const k = (1 - t) / (1 - holdT || 1);
  return k * k;
}

/**
 * 這一刻該畫成什麼顏色 / 多亮。
 *
 * 回傳的 `rgb` 是 ramp 的顏色，`alpha` 已經把 ramp 自己的 alpha 與 `arcFade`
 * 乘在一起 —— 加法混合（`ALPHA_ADD` = `SRC_ALPHA, ONE`）只有 alpha 這個通道
 * 會縮放亮度，所以「消失」必須從這裡算出來，⛔ 不可以只把材質 alpha 設 0
 * 之外還指望 RGB 幫忙（`ribbonMath` 檔頭記錄的就是這條被踩過的線）。
 */
export function arcColorAt(spec: ArcBoltSpec, t: number): { rgb: Rgb; alpha: number } {
  const [r, g, b, a] = sampleColorStops(spec.stops, t);
  return { rgb: [r, g, b], alpha: a * arcFade(t, spec.holdT) };
}
