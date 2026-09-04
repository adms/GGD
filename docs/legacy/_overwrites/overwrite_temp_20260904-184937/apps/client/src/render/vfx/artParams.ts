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

/**
 * ⭐⭐ 【這一發的外觀】—— `applyArtParams` 的**簽章版**（GH#977）。
 *
 * ── ⛔ 為什麼 `applyArtParams` 不夠（三個量到的洞）────────────────────────
 * ① ⛔ **它不換 `doc.id`**，而粒子池 key 就是 `doc.id`（`VfxSystem.ts:1114`），
 *    ⭐ 而且 `shapeOf()` 的 memo key `${doc.id}|${maxLifeSec}`（`:1113`）**更早**
 *    別名 ⇒ 只把 tint 放進池 key **看起來修好了而畫面照壞**。
 * ② ⛔ `count` 只寫 `burstCount`（`applyArtParams` 那一行），而拖尾是
 *    `mode:"continuous"`（**349/629** 份出貨文件）只讀 `doc.rate`
 *    ⇒ 那一格對它們**逐位元是死的**（第一·五守則）。
 * ③ ⛔ 它沒有 `scaleAxis` —— ⭐ 而 `vfx@1` **有**兩組已出貨的非等向軸：
 *    `stretched` + `tailLength`（**205 份**在用）與 ring 的 `radius` + `thickness`。
 *    ⚠️ 我原本宣稱「粒子側結構上表達不了」，**那是錯的**（2026-09-04 更正）。
 *
 * ── ⭐ 簽章：**只有真的改了東西才換 id** ────────────────────────────────
 * 缺席／全單位 ⇒ **回傳同一個物件**（`===`），⇒ 逐位元同這一格出現以前。
 * ⛔ 這不是最佳化，是 AC④：不傳外觀時必須與目前行為相容。
 */
export interface VfxLook {
  scale?: number;
  /** `[橫向, 上, 沿行進軸]` —— ⭐ **翻譯**成粒子側的非等向軸，⛔ 不照抄 tuple。 */
  scaleAxis?: readonly [number, number, number];
  tint?: Rgb;
  alpha?: number;
  /** 度。折進 `doc.orient.yawDeg`（走 `applyArtParams` 那條已經有守衛的路）。 */
  facingDeg?: number;
  /** ⭐ burst ⇒ `burstCount`；continuous ⇒ `rate`。⛔ 不是只寫前者。 */
  countMult?: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** ⭐ 簽章 —— 只放**真的會改變輸出**的格子，⛔ 不是把整個 look 序列化。 */
function lookSignature(p: VfxLook): string {
  const bits: string[] = [];
  if (p.scale !== undefined && p.scale !== 1) bits.push(`s${r3(p.scale)}`);
  if (p.scaleAxis !== undefined && !(p.scaleAxis[0] === 1 && p.scaleAxis[1] === 1 && p.scaleAxis[2] === 1))
    bits.push(`x${p.scaleAxis.map(r3).join(",")}`);
  if (p.tint !== undefined) bits.push(`t${p.tint.map(r3).join(",")}`);
  if (p.alpha !== undefined && p.alpha !== 1) bits.push(`a${r3(p.alpha)}`);
  if (p.facingDeg !== undefined) bits.push(`y${r3(p.facingDeg)}`);
  if (p.countMult !== undefined && p.countMult !== 1) bits.push(`n${r3(p.countMult)}`);
  return bits.join("|");
}

/**
 * ⭐ 把 `scaleAxis` **翻譯**成粒子側真的有的非等向表達。
 *
 * ⚠️⚠️ ⭐ **有損，而且我明說**：tuple 是三軸，⛔ 而 `stretched`+`tailLength` 是
 * 「沿行進軸拉長」一軸、ring 的 `radius`/`thickness` 是「半徑 vs 厚度」兩軸。
 * ⇒ 翻得過去的是**沿行進軸的那一維相對於橫向的比例**（`z / x`），
 * ⛔ 而「上」那一維（`[1]`）粒子側沒有對應 —— 它不進翻譯，也⛔ 不假裝有。
 */
function applyScaleAxis(out: VfxDoc, ax: readonly [number, number, number]): void {
  const lateral = ax[0] > 1e-6 ? ax[0] : 1;
  const along = ax[2] > 1e-6 ? ax[2] : 1;
  const ratio = along / lateral;
  if (Math.abs(ratio - 1) < 1e-6) return;
  if (out.emitter.shape === "ring" && out.emitter.thickness !== undefined) {
    // ⭐ 環：把「厚度／半徑」的比例往 ratio 的**反方向**推 —— 沿軸拉長 ＝ 環變薄。
    out.emitter = { ...out.emitter, thickness: r3(out.emitter.thickness / ratio) || 1e-3 };
    return;
  }
  // ⭐ 其餘：走 `stretched` + `tailLength`（205 份出貨文件在用的那一組）。
  out.stretched = true;
  out.tailLength = r3((out.tailLength ?? 1) * ratio) || 1e-3;
}

/**
 * ⭐ 這一發的外觀 —— 回傳一份**換過 id** 的文件（或缺席時的同一個物件）。
 * ⛔ 這是**唯一**該做這件事的地方（第〇·四守則）。
 */
export function applyVfxLook(doc: VfxDoc, look: VfxLook | undefined): VfxDoc {
  if (look === undefined) return doc;
  const sig = lookSignature(look);
  if (sig === "") return doc; // ⭐ 全單位 ⇒ 逐位元同今天（AC④）
  // ⭐ 先走既有的那條路（scale/tint/alpha/facing 都有守衛在），⛔ 不重寫一份。
  const base = applyArtParams(doc, {
    ...(look.scale !== undefined ? { scale: look.scale } : {}),
    ...(look.tint !== undefined ? { tint: look.tint } : {}),
    ...(look.alpha !== undefined ? { alpha: look.alpha } : {}),
    ...(look.facingDeg !== undefined ? { facingDeg: look.facingDeg } : {}),
  });
  const out: VfxDoc = { ...base };
  if (look.scaleAxis !== undefined) applyScaleAxis(out, look.scaleAxis);
  if (look.countMult !== undefined && look.countMult !== 1) {
    const m = look.countMult;
    // ⭐⭐ 兩種模式**兩個旋鈕** —— ⛔ 只寫 burstCount 對 349/629 份拖尾是死的。
    if (out.mode === "burst") out.burstCount = Math.max(1, Math.round((out.burstCount ?? 1) * m));
    else if (out.rate !== undefined) out.rate = r3(out.rate * m) || 1e-3;
  }
  return { ...out, id: `${doc.id}@fx${sig}` };
}
