/**
 * ⑤ **modulate 逐像素恆等** —— 判準本體，**一個住處**。(GH#709 的代數 · GH#711 的搬家)
 *
 * ⚠️⚠️ 這個檔存在的唯一理由是 GH#711：判準⑤ 原本住在
 * `vfxDocsBirthVisibility.test.ts` 裡，而**來源側**（`tools/w3x-import/extract_stock_vfx.py`）
 * 需要同一個答案 —— 它當時用的是一個**只看文件、不看貼圖**的近似
 * （`WHITE_RGB_MIN = 0.98`），而那個近似建立在**兩個被推翻的前提**上，
 * 於是它把 `MarkOfChaosTarget` 兩支**真的會變暗背景**的 emitter 當成「逐位元的零」丟掉。
 *
 * ⭐ 所以判準不可以有第二份實作。這個檔是**那一份**；出貨態掃描（TS 測試）與
 * 抽取器（Python，經 `tools/w3x-import/modulate_oracle.ts`）**都**呼叫它。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 代數（⛔ 不是判斷，逐行引用得到出貨路徑）
 * ═══════════════════════════════════════════════════════════════════════════
 * `blendModeFor("modulate") → ParticleSystem.BLENDMODE_MULTIPLY`
 * （`apps/client/src/vfx/particleFactory.ts`）在 Babylon 7.54.3 走**兩段**：
 *
 *   1. `Shaders/particles.fragment` 的 `#ifdef BLENDMULTIPLYMODE`
 *      （`thinParticleSystem` 只在 `BLENDMODE_MULTIPLY` 時 push 這個 define）：
 *        `baseColor.rgb = (tex.rgb·col.rgb)·a + 1·(1 − a)`,  `a = tex.a·col.a`
 *   2. `engine.setAlphaMode(4)` = `ALPHA_MULTIPLY` = `(DST_COLOR, ZERO)`
 *      （`Engines/Extensions/engine.alpha.js` case 4）：`out = src.rgb·dst.rgb`
 *
 *   ⇒ `out = dst·[ 1 − a·(1 − tex.rgb·col.rgb) ]`，令 `δ = a·(1 − tex.rgb·col.rgb)`
 *   ⇒ `|out − dst| = dst·δ ≤ δ`
 *
 * `δ < 1/255` ⇒ **每一個像素都四捨五入回原值** ——「畫不出一個像素」的算術定義。
 *
 * ⛔⛔ **兩個被推翻的前提**（GH#709 的更正，留在這裡是因為它們很好聽而且錯了）：
 * `MULTIPLY = (DST_COLOR, ONE_MINUS_SRC_ALPHA)`（⛔ 是 `(DST_COLOR, ZERO)`，
 * 而且 shader 先做了一次 premultiply-toward-white）與 `tex.rgb ≈ tex.a`
 * （⛔ 實測 `tex.rgb / tex.a` 中位數 **1.273**）。
 * ⇒ ⭐ **`col.rgb` 是白色不足以恆等，貼圖自己也要是白的。**
 * ⇒ 判準只能從**貼圖的實際像素**算，⛔ 不可以退化成 `min(R,G,B) ≥ 0.98`。
 *
 * ⛔ 只涵蓋 `vfx@1` 粒子。`ribbon@1` 的 modulate 走 StandardMaterial + `toWhite`
 * 手工淡出（`apps/client/src/vfx/ribbonMath.ts`），是另一條合成式 —— ⛔ 不套這條。
 *
 * ⚠️ 這個檔**刻意不從 `packages/shared` 的公開 index 匯出**：它 import `node:zlib`，
 * 而 index 會被客戶端打包進瀏覽器。消費端逐個具名 import 這個路徑。
 */
import { inflateSync } from "node:zlib";

/** δ 的恆等門檻 = **1/255**（8-bit 幀緩衝上一個 code value）。 */
export const MODULATE_IDENTITY_DELTA = 1 / 255;

export type Rgba = readonly [number, number, number, number];

/**
 * 一張貼圖的**恆等判定摘要**：`maxAlphaAtLevel[ch][L]` =
 * 「該通道值恰為 L(0..255) 的 texel 裡最大的 alpha」，−1 = 沒有這種 texel。
 *
 * ⭐ 為什麼是這個形狀：δ = a·(1 − (L/255)·col.rgb[ch]) 對固定的 col 是
 * **a 遞增、L 遞減**，所以逐 (ch, L) 只需要留最大的 a —— 256×3 個數就**精確**
 * 復原 max δ（8-bit 貼圖沒有第 257 個值），⛔ 不是抽樣近似。
 */
export interface TexStats {
  readonly maxAlphaAtLevel: readonly (readonly number[])[];
}

/** PNG → RGBA8。⛔ 只收 8-bit / 非交錯（出貨的 98 張粒子貼圖全部是 ct=3 8bit）。 */
export function decodePng(buf: Buffer): { w: number; h: number; rgba: Uint8Array } {
  let w = 0;
  let h = 0;
  let ct = 0;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  for (let p = 8; p + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const bitDepth = data[8]!;
      ct = data[9]!;
      const interlace = data[12]!;
      if (bitDepth !== 8 || interlace !== 0) {
        throw new Error(`PNG 不在支援範圍（bitDepth=${bitDepth} interlace=${interlace}）`);
      }
    } else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const chans = ct === 0 ? 1 : ct === 2 ? 3 : ct === 3 ? 1 : ct === 4 ? 2 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * chans;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= chans ? out[y * stride + i - chans]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= chans && y > 0 ? out[(y - 1) * stride + i - chans]! : 0;
      let v = line[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ct === 3) {
      const idx = out[i]!;
      rgba[i * 4] = plte![idx * 3]!;
      rgba[i * 4 + 1] = plte![idx * 3 + 1]!;
      rgba[i * 4 + 2] = plte![idx * 3 + 2]!;
      rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx]! : 255;
    } else if (ct === 0 || ct === 4) {
      const g = out[i * chans]!;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g;
      rgba[i * 4 + 3] = ct === 4 ? out[i * chans + 1]! : 255;
    } else {
      rgba[i * 4] = out[i * chans]!;
      rgba[i * 4 + 1] = out[i * chans + 1]!;
      rgba[i * 4 + 2] = out[i * chans + 2]!;
      rgba[i * 4 + 3] = ct === 6 ? out[i * chans + 3]! : 255;
    }
  }
  return { w, h, rgba };
}

/** RGBA8 → `TexStats`（見上面為什麼 256×3 個數就夠）。 */
export function texStatsFromRgba(rgba: Uint8Array): TexStats {
  const table = [
    new Array<number>(256).fill(-1),
    new Array<number>(256).fill(-1),
    new Array<number>(256).fill(-1),
  ];
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]! / 255;
    for (let ch = 0; ch < 3; ch++) {
      const L = rgba[i + ch]!;
      if (a > table[ch]![L]!) table[ch]![L] = a;
    }
  }
  return { maxAlphaAtLevel: table };
}

/**
 * 這份文件在 modulate 下**最大**的 δ（= 對背景最強的一次改變）。
 * 0 ⇒ 逐像素恆等；⛔ 它量的是「會不會動到畫面」，⛔ 不是「好不好看」。
 */
export function modulateMaxDelta(colors: readonly Rgba[], tex: TexStats): number {
  let worst = 0;
  for (const col of colors) {
    for (let ch = 0; ch < 3; ch++) {
      const table = tex.maxAlphaAtLevel[ch]!;
      for (let L = 0; L < 256; L++) {
        const a = table[L]!;
        if (a < 0) continue;
        const d = a * col[3] * (1 - (L / 255) * col[ch]!);
        if (d > worst) worst = d;
      }
    }
  }
  return worst;
}

/**
 * ⭐ **判準⑤ 的單一入口**：`null` = 這份 modulate 文件動得了畫面；
 * 字串 = 它逐像素恆等的理由（出貨態掃描與抽取器印的是**同一句話**）。
 */
export function modulateIdentityReason(colors: readonly Rgba[], tex: TexStats): string | null {
  const delta = modulateMaxDelta(colors, tex);
  if (delta >= MODULATE_IDENTITY_DELTA) return null;
  return (
    `modulate 逐像素恆等（max δ=${delta.toFixed(5)} < ${MODULATE_IDENTITY_DELTA.toFixed(5)}）` +
    ` —— out = dst·(1−δ)，在 8-bit 幀緩衝上每個像素都四捨五入回原值`
  );
}
