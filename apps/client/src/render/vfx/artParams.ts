/**
 * PER-INVOCATION ART PARAMS (task #50).
 *
 * One primitive-generated doc should serve many abilities with DIFFERENT
 * looks. `ArtParams` is that knob set: `scale`, `tint`, `alpha`, `count`,
 * `timeScale` transform the DOC (they map onto vfx@1 fields, so the transform
 * is authored once and rides the existing particleFactory → VfxSystem path);
 * `heightY` and `facingDeg` are SPATIAL and don't live in a VfxDoc — they are
 * surfaced for the invocation site (VfxSystem.play already takes a world `y`;
 * a directed emitter reads `facingDeg`), returned by `resolveSpatial`.
 *
 * Pure + unit-tested. Applying no params returns the doc unchanged (identity).
 */
import type { VfxDoc } from "@ggd/shared/content";
import type { Rgb } from "./primitives";
import { DEFAULT_AIM_YAW_STEP_DEG, DEFAULT_PITCH_DEG, quantizeYawDeg } from "../../vfx/orient";

export interface ArtParams {
  /** multiply every size + the emitter radius */
  scale?: number;
  /** recolour: replace the ramp hue while keeping its white-hot→cool shape */
  tint?: Rgb;
  /** multiply every stop's alpha (0..1) */
  alpha?: number;
  /** override the burst particle count */
  count?: number;
  /** stretch/compress lifetimes (>1 = slower/longer, <1 = snappier) */
  timeScale?: number;
  /** world-y the effect spawns at (torso ~1.0, ground ~0.1) — spatial */
  heightY?: number;
  /**
   * 方位角,度 (#366)。0 = +X。
   *
   * ⚠️ **這一格在 2026-08-18 之前是死的。** 檔頭原本寫它是「spatial,surfaced
   * for the invocation site」,而 `resolveSpatial()` 在整個 repo 裡**沒有任何
   * production 呼叫者** —— 宣告了、驗了、沒有人讀(故障 ②)。後果是
   * `beam`/`slash`/`bolt`/`dash`/`tornado` 這 111 支有方向的技能,每一次施法都朝
   * 同一個方向噴。
   *
   * 現在它**折進 `doc.orient.yawDeg`**,也就是走 `scale`/`tint`/`alpha` 那條
   * 已經有池、有 id 簽章、有守衛的路,⛔ 不是另開一條平行的空間管線 ——
   * `flyHeight` 當年就是走平行管線,在 `familyRow()` 一行之內蒸發掉的。
   */
  facingDeg?: number;
  /** 仰角,度 (#366)。90 = 直立(預設),0 = 橫放 —— 「橫放的柱狀砲」就是這一格 */
  pitchDeg?: number;
  /** 繞自身軸的切線角速度,度/秒 (#366)。龍捲風的「旋轉」 */
  swirlDegPerSec?: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * True when `p` carries no doc-affecting knob (identity fast-path).
 *
 * ⚠️ 方位那三格要跟**這份文件現在的值**比,⛔ 不是跟出貨預設比。`facingDeg: 0`
 * 的意思是「把方位轉正」—— 對一份 `orient.yawDeg = 30` 的文件那是**一個真的改動**,
 * 而拿它跟 0 比會把改動整格吞掉,畫面上看起來只是「這一招沒有轉回來」。
 * (#377 之前沒有文件填過 `yawDeg`,所以這個坑一直是空的;瞄準偏移一上來就會踩到。)
 */
function isDocIdentity(p: ArtParams, doc: VfxDoc): boolean {
  const o = doc.orient;
  return (
    (p.scale === undefined || p.scale === 1) &&
    p.tint === undefined &&
    (p.alpha === undefined || p.alpha === 1) &&
    p.count === undefined &&
    (p.timeScale === undefined || p.timeScale === 1) &&
    (p.facingDeg === undefined || p.facingDeg === (o?.yawDeg ?? 0)) &&
    (p.pitchDeg === undefined || p.pitchDeg === (o?.pitchDeg ?? DEFAULT_PITCH_DEG)) &&
    (p.swirlDegPerSec === undefined || p.swirlDegPerSec === (o?.swirlDegPerSec ?? 0))
  );
}

/**
 * Recolour a stop's rgb toward `tint` while preserving its luminance profile
 * (so the white-hot core stays whiter than the tint stop). We scale the tint
 * by the stop's original max channel — a full-bright core → near-white tint,
 * a cooled stop → a dim tint.
 */
function retint(rgba: readonly [number, number, number, number], tint: Rgb): [number, number, number, number] {
  // AVERAGE brightness (not max): a whitened core (all channels high) keeps a
  // higher level than a saturated single-hue tint stop, so recolouring keeps
  // the core-brighter-than-tint flash shape instead of collapsing them.
  const level = (rgba[0] + rgba[1] + rgba[2]) / 3;
  return [round4(clamp01(tint[0] * level)), round4(clamp01(tint[1] * level)), round4(clamp01(tint[2] * level)), rgba[3]];
}

/**
 * Return a NEW VfxDoc with the doc-expressible art params applied. The doc is
 * treated as immutable; callers get a fresh object (safe to pool by a fresh
 * id). Spatial params (`heightY`/`facingDeg`) are ignored here — see
 * `resolveSpatial`.
 */
export function applyArtParams(doc: VfxDoc, p: ArtParams): VfxDoc {
  if (isDocIdentity(p, doc)) return doc;
  const scale = p.scale ?? 1;
  const alpha = p.alpha ?? 1;
  const ts = p.timeScale ?? 1;

  const out: VfxDoc = { ...doc };

  if (scale !== 1) {
    out.size = { start: round(doc.size.start * scale) || 1e-3, end: round(doc.size.end * scale) };
    if (doc.sizeStops) out.sizeStops = doc.sizeStops.map(([t, s]) => [t, round(s * scale)]) as VfxDoc["sizeStops"];
    if (doc.emitter.shape === "sphere") out.emitter = { ...doc.emitter, radius: round(doc.emitter.radius * scale) };
    else if (doc.emitter.shape === "cone") out.emitter = { ...doc.emitter, radius: round(doc.emitter.radius * scale) };
    // ring (#366) —— 環的**厚度**要跟著半徑一起縮,否則放大 3 倍的衝擊波會變成一條
    // 相對薄到看不見的線(而「大小」這格是 owner 點名的四個參數之一)。
    else if (doc.emitter.shape === "ring")
      out.emitter = {
        ...doc.emitter,
        radius: round(doc.emitter.radius * scale),
        ...(doc.emitter.thickness !== undefined ? { thickness: round(doc.emitter.thickness * scale) } : {}),
      };
  }

  if (p.tint || alpha !== 1) {
    const mapStop = (rgba: readonly [number, number, number, number]): [number, number, number, number] => {
      const base = p.tint ? retint(rgba, p.tint) : ([...rgba] as [number, number, number, number]);
      base[3] = round4(clamp01(rgba[3] * alpha));
      return base;
    };
    out.color = { start: mapStop(doc.color.start), end: mapStop(doc.color.end) };
    if (doc.colorStops) out.colorStops = doc.colorStops.map(([t, c]) => [t, mapStop(c)]) as VfxDoc["colorStops"];
  }

  if (ts !== 1) {
    out.lifetimeSec = { min: round(doc.lifetimeSec.min * ts), max: round(doc.lifetimeSec.max * ts) };
  }

  if (p.count !== undefined) out.burstCount = Math.max(1, Math.round(p.count));

  // #366 方位 —— 疊在文件自己的 `orient` 上(ABSENT ≠ ZERO:沒給的那一半保留
  // 文件的值,所以「一支會旋轉的龍捲風」被轉個方向之後仍然在旋轉)。
  if (p.facingDeg !== undefined || p.pitchDeg !== undefined || p.swirlDegPerSec !== undefined) {
    const base = doc.orient ?? {};
    const merged = {
      yawDeg: p.facingDeg ?? base.yawDeg,
      pitchDeg: p.pitchDeg ?? base.pitchDeg,
      swirlDegPerSec: p.swirlDegPerSec ?? base.swirlDegPerSec,
    };
    const orient: NonNullable<VfxDoc["orient"]> = {};
    // ⚠️ `yawFrom` 是**文件自己的宣告**(方位從哪裡來),不是一格可覆寫的參數 ——
    // 重建 orient 物件時漏抄它,這份文件就會在被縮放/染色的那一刻靜靜地失去瞄準。
    if (base.yawFrom !== undefined) orient.yawFrom = base.yawFrom;
    if (merged.yawDeg !== undefined) orient.yawDeg = round(merged.yawDeg);
    if (merged.pitchDeg !== undefined) orient.pitchDeg = round(merged.pitchDeg);
    if (merged.swirlDegPerSec !== undefined) orient.swirlDegPerSec = round(merged.swirlDegPerSec);
    out.orient = orient;
  }

  return out;
}

/**
 * #377 —— 把**這一次施法的瞄準角**折進一份文件。
 *
 * 這是 129 支有方向的技能(beam 47 / slash 41 / bolt 11 / dash 6 / tornado 6)
 * 從「每次施法都朝同一邊噴」變成「朝你打的那個人噴」的**唯一**接縫。
 *
 * ⭐ 走的是 `applyArtParams` 那條已經有池、有 id 簽章、有守衛的路
 * (`facingDeg` → `doc.orient.yawDeg`),⛔ 不是第二條平行的空間參數管線 ——
 * `flyHeight` 當年就是走平行管線,在 `familyRow()` 一行之內蒸發掉的。
 *
 * 三件事按順序:
 * ① **opt-in 在文件上**。`orient.yawFrom !== "aim"` 的文件原樣回傳(同一個物件
 *    reference),所以 633 份沒有 `orient` 的出貨文件一位元都不變。
 * ② **`yawDeg` 是偏移**。作者寫 180 = 往身後噴的塵尾;寫 0(或不寫)= 正對目標。
 * ③ ⭐ **換 pool key**。`VfxSystem` 的粒子池 key 是 `doc.id`,不換 key 的話第二次
 *    施法會借到第一次那個**已經按舊角度建好**的 `ParticleSystem` —— 特效照樣播、
 *    方向卻是上一次的,而任何只讀 VfxDoc 的斷言都會是綠的(故障 ③)。
 */
export function applyAimYaw(
  doc: VfxDoc,
  aimYawDeg: number | null | undefined,
  stepDeg: number = DEFAULT_AIM_YAW_STEP_DEG,
): VfxDoc {
  if (doc.orient?.yawFrom !== "aim") return doc;
  if (aimYawDeg === null || aimYawDeg === undefined || !Number.isFinite(aimYawDeg)) return doc;
  const yaw = quantizeYawDeg(aimYawDeg + (doc.orient.yawDeg ?? 0), stepDeg);
  if (yaw === (doc.orient.yawDeg ?? 0)) return doc;
  const out = applyArtParams(doc, { facingDeg: yaw });
  return { ...out, id: `${doc.id}@aim${yaw}` };
}

/** The spatial params, defaulted, for the invocation site (play y / facing). */
export function resolveSpatial(p: ArtParams, defaults: { heightY: number; facingDeg: number } = { heightY: 1, facingDeg: 0 }): {
  heightY: number;
  facingDeg: number;
} {
  return { heightY: p.heightY ?? defaults.heightY, facingDeg: p.facingDeg ?? defaults.facingDeg };
}
