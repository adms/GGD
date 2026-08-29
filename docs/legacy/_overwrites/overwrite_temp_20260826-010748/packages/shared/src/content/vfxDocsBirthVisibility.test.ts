/**
 * 👁 出貨態掃描：每一份 `content/vfx` 文件「有沒有可能畫出一個像素」。(GH#664 R3)
 *
 * owner 2026-08-24（逐字）：
 * > 「所有關於視覺、特效、音效等非結構化資料驗收，你應該要特別對應的自動化流程」
 *
 * ⭐ 為什麼是靜態可判的：連鎖閃電那一族「一個像素都沒畫出來過」的根因
 * （形狀住在 alpha、加法混合疊全黑）**全部寫在文件的數字裡** ——
 * 不用開 WebGL 就能判「這份文件在任何場景下都不可能可見」。
 * 這一支把那三種病型變成編輯當下就會紅的閘：
 *
 *   ① 生命內 peak alpha ≤ 0.05 —— 整條生命都是透明的
 *   ② sizeStops 覆寫後 peak size = 0 —— schema 只保證 size.start>0，覆寫可以歸零
 *   ③ additive/modulate 疊全黑（所有 stop 的 max(R,G,B) < 0.02）——
 *      加法混合加黑色 = 加零；⭐ 這正是閃電的病型在粒子側的樣子
 *   ④ ribbon@1：widthAbove+widthBelow = 0（零寬帶）或 color alpha = 0
 *   ⑤ modulate **逐像素恆等** —— 乘上去的東西是 1，畫面一個 code value 都不會動
 *     （GH#709；判準從**貼圖的實際像素**推導，⛔ 不是一份壞貼圖清單）
 *
 * ⚠️ 「有效梯度」的取法照 schema 的字面（vfx.ts）：
 * `colorStops` / `sizeStops` **overrides** `color.start/end` / `size.start/end`
 * when present —— 所以覆寫存在時只看覆寫（legacy 欄位在執行期根本不被讀，
 * 拿它們背書是一條逐位元等於不存在的宣稱，第一·五守則）。
 *
 * ⭐ 量尺自驗（取代突變）：測試內自造三份**必不可見**的文件，斷言檢查器抓得到 ——
 * 「量尺先被驗過」寫成程式，⛔ 不是一次性的手動突變。
 *
 * ⚠️ KNOWN_INVISIBLE 是**真缺陷名單**，⛔ 不是豁免。名單有過期偵測：哪天有人修好
 * 其中一份，這裡會紅著要求把那一列刪掉 —— 名單只能縮小，不能安靜地變成垃圾桶。
 * ⭐ 上線第一天抓到的那 8 份已於 GH#665 修在**來源側**並清空（見名單處的說明）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const VFX_DIR = join(CONTENT_DIR, "vfx");

/** 生命內 peak alpha 要超過這條線才可能被看到 */
const PEAK_ALPHA_MIN = 0.05;
/** additive/modulate 之下，所有 stop 的 max(R,G,B) 低於這條線 = 疊全黑 = 不可見 */
const BLACK_RGB_MAX = 0.02;

/**
 * ⑤ modulate 恆等的門檻 = **1/255**。
 *
 * ⭐ 代數（⛔ 不是判斷）—— 出貨路徑逐行引用得到：
 * `blendModeFor("modulate") → ParticleSystem.BLENDMODE_MULTIPLY`
 * （apps/client/src/vfx/particleFactory.ts）走 Babylon 的兩段：
 *
 *   1. particles.fragment `#ifdef BLENDMULTIPLYMODE`（thinParticleSystem 只在
 *      BLENDMODE_MULTIPLY 時 push 這個 define）：
 *        baseColor.rgb = (tex.rgb·col.rgb)·a + 1·(1 − a),  a = tex.a·col.a
 *   2. `engine.setAlphaMode(4)` = ALPHA_MULTIPLY = `(DST_COLOR, ZERO)`
 *      （Engines/Extensions/engine.alpha.js case 4）：out = src.rgb·dst.rgb
 *
 *   ⇒ out = dst·[ 1 − a·(1 − tex.rgb·col.rgb) ]     令 δ = a·(1 − tex.rgb·col.rgb)
 *   ⇒ |out − dst| = dst·δ ≤ δ
 *
 * δ < 1/255 ⇒ **每一個像素都四捨五入回原值** ——「畫不出一個像素」的算術定義。
 *
 * ⚠️⚠️ 這一格是 GH#709 的**更正**：票與 `docs/_reports/PRE2_temp_20260826-0000.md`
 * §2.2 寫的是 `MULTIPLY = (DST_COLOR, ONE_MINUS_SRC_ALPHA)` 且 `tex.rgb ≈ tex.a`，
 * 由此得到「modulate 疊全白 ⇒ 逐像素恆等」。**兩個前提都不成立**（見上面的引用；
 * 實測 `smoke_09` / `light_03` 的 `tex.rgb / tex.a ≈ 1.36`）⇒
 * ⭐ **`col.rgb` 是白色不足以恆等，還要貼圖自己是白的。**
 * 所以這條判準**只**能從貼圖的實際像素算，⛔ 不可以退化成「min(R,G,B) ≥ 0.98」。
 *
 * ⛔ 只涵蓋 vfx@1 粒子。ribbon@1 的 modulate 走 StandardMaterial + `toWhite`
 * 手工淡出（apps/client/src/vfx/ribbonMath.ts），是另一條合成式 —— ⛔ 不套這條。
 */
const MODULATE_IDENTITY_DELTA = 1 / 255;

type Rgba = readonly [number, number, number, number];

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
function decodePng(buf: Buffer): { w: number; h: number; rgba: Uint8Array } {
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

interface Vfxish {
  id: string;
  schema: string;
  blendMode?: string;
  color?: { start: Rgba; end: Rgba } | Rgba;
  colorStops?: readonly (readonly [number, Rgba])[];
  size?: { start: number; end: number };
  sizeStops?: readonly (readonly [number, number])[];
  widthAbove?: number;
  widthBelow?: number;
  texture?: string;
}

/** 有效顏色梯度：colorStops 存在時**只有它**會被執行期讀到（schema 字面：overrides）。 */
function effectiveColors(doc: Vfxish): Rgba[] {
  if (doc.colorStops && doc.colorStops.length > 0) return doc.colorStops.map((s) => s[1]);
  const c = doc.color as { start: Rgba; end: Rgba };
  return [c.start, c.end];
}

/**
 * 回傳這份文件**在任何場景下都畫不出一個像素**的理由；空陣列 = 有機會可見。
 * ⛔ 它判的是「不可能」，不是「好看」—— 所以每一條都是保守的下界。
 */
export function birthVisibilityDefects(doc: Vfxish, tex?: TexStats | null): string[] {
  const reasons: string[] = [];
  if (doc.schema === "vfx@1") {
    const colors = effectiveColors(doc);
    const peakA = Math.max(...colors.map((c) => c[3]));
    if (peakA <= PEAK_ALPHA_MIN) {
      reasons.push(`生命內 peak alpha=${peakA} ≤ ${PEAK_ALPHA_MIN} —— 整條生命都是透明的`);
    }
    const sizes =
      doc.sizeStops && doc.sizeStops.length > 0
        ? doc.sizeStops.map((s) => s[1])
        : [doc.size!.start, doc.size!.end];
    const peakS = Math.max(...sizes);
    if (peakS <= 0) {
      reasons.push(`sizeStops 覆寫後 peak size=${peakS} —— 粒子沒有面積`);
    }
    if (doc.blendMode === "additive" || doc.blendMode === "modulate") {
      const peakRgb = Math.max(...colors.map((c) => Math.max(c[0], c[1], c[2])));
      if (peakRgb < BLACK_RGB_MAX) {
        reasons.push(
          `${doc.blendMode} 疊全黑（所有 stop 的 max(R,G,B)=${peakRgb} < ${BLACK_RGB_MAX}）—— 加黑等於加零`,
        );
      }
    }
    // ⑤ modulate 逐像素恆等 —— 只有拿到**貼圖的實際像素**才判得動（見 MODULATE_IDENTITY_DELTA）
    if (doc.blendMode === "modulate" && tex) {
      const delta = modulateMaxDelta(colors, tex);
      if (delta < MODULATE_IDENTITY_DELTA) {
        reasons.push(
          `modulate 逐像素恆等（max δ=${delta.toFixed(5)} < ${MODULATE_IDENTITY_DELTA.toFixed(5)}）` +
            ` —— out = dst·(1−δ)，在 8-bit 幀緩衝上每個像素都四捨五入回原值`,
        );
      }
    }
  } else if (doc.schema === "ribbon@1") {
    const width = (doc.widthAbove ?? 0) + (doc.widthBelow ?? 0);
    if (width <= 0) reasons.push(`widthAbove+widthBelow=${width} —— 零寬的帶子沒有面積`);
    const c = doc.color as Rgba;
    if (c[3] <= 0) reasons.push(`color alpha=${c[3]} —— 整條帶子透明`);
    if (
      (doc.blendMode === "additive" || doc.blendMode === "modulate") &&
      Math.max(c[0], c[1], c[2]) < BLACK_RGB_MAX
    ) {
      reasons.push(`${doc.blendMode} 疊全黑（max(R,G,B)=${Math.max(c[0], c[1], c[2])}）`);
    }
  }
  return reasons;
}

/**
 * ⛔ 真缺陷名單（⛔ 不是豁免）。值 = 病型摘要，讓修的人不用重掃。
 * 修好一份 ⇒ 過期偵測會紅著要求刪掉那一列 —— 名單只能縮小。
 *
 * ⭐ 2026-08-24（GH#665）：**清空**。上線第一天抓到的 8 份全部修在來源側 ——
 * `tools/w3x-import/extract_particles.py` 的 LUMA-KEY（additive/modulate 在 WC3
 * 根本不取樣 alpha ⇒ 原作把 alpha 寫 0 是免費的，而我們的管線會照著乘）
 * 與 KRHA/KRHB 峰值回退（SD2 的帶寬整個住在動畫軌上），
 * 加上兩份手寫的 `fx.w3x.particle.holyawakening.p0*` 比照套上同一組值。
 * ⛔ 新增內容不可以往這裡塞 —— 這一格是給既有 w3x 匯入債的，而它已經還完了。
 */
const KNOWN_INVISIBLE: Record<string, string> = {};

/** 貼圖 → TexStats，一張只解一次。`null` = 讀不到（⭐ 由呼叫端 fail-loud，⛔ 不靜默跳過）。 */
const TEX_CACHE = new Map<string, TexStats | null>();
function texStatsFor(rel: string | undefined): TexStats | null {
  if (!rel) return null;
  if (!TEX_CACHE.has(rel)) {
    const p = join(CONTENT_DIR, rel);
    try {
      TEX_CACHE.set(rel, existsSync(p) ? texStatsFromRgba(decodePng(readFileSync(p)).rgba) : null);
    } catch {
      TEX_CACHE.set(rel, null);
    }
  }
  return TEX_CACHE.get(rel) ?? null;
}

function loadShippedDocs(): Vfxish[] {
  const docs: Vfxish[] = [];
  for (const f of readdirSync(VFX_DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    docs.push(JSON.parse(readFileSync(join(VFX_DIR, f), "utf8")) as Vfxish);
  }
  return docs;
}

describe("👁 vfx 出貨態掃描：每份文件要有可能畫出一個像素", () => {
  it("⭐ 量尺自驗：三份必不可見的 sentinel 文件，檢查器全部抓得到", () => {
    // ① alpha 0 整條生命（legacy 兩點式）
    const alphaZero: Vfxish = {
      id: "sentinel-alpha0",
      schema: "vfx@1",
      blendMode: "alpha",
      color: { start: [1, 1, 1, 0], end: [1, 1, 1, 0] },
      size: { start: 1, end: 1 },
    };
    expect(birthVisibilityDefects(alphaZero).join(), "alpha 0 應該被抓到").toMatch(/peak alpha/);

    // ② additive 疊全黑（alpha 全滿 —— 只靠 alpha 檢查抓不到它）
    const additiveBlack: Vfxish = {
      id: "sentinel-add-black",
      schema: "vfx@1",
      blendMode: "additive",
      color: { start: [0, 0, 0, 1], end: [0, 0, 0, 1] },
      colorStops: [
        [0, [0, 0, 0, 1]],
        [1, [0.01, 0.01, 0.01, 1]],
      ],
      size: { start: 1, end: 1 },
    };
    expect(birthVisibilityDefects(additiveBlack).join(), "additive 全黑應該被抓到").toMatch(/疊全黑/);

    // ③ sizeStops 把 size 覆寫成 0（schema 只擋 size.start，覆寫是繞得過去的）
    const sizeZero: Vfxish = {
      id: "sentinel-size0",
      schema: "vfx@1",
      blendMode: "alpha",
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 1] },
      size: { start: 1, end: 1 },
      sizeStops: [
        [0, 0],
        [1, 0],
      ],
    };
    expect(birthVisibilityDefects(sizeZero).join(), "size 覆寫成 0 應該被抓到").toMatch(/size/);

    // ④ 對照組：一份普通可見文件不可以被誤抓（檢查器不是「什麼都紅」）
    const visible: Vfxish = {
      id: "sentinel-visible",
      schema: "vfx@1",
      blendMode: "additive",
      color: { start: [1, 0.8, 0.2, 1], end: [1, 0.4, 0.1, 0] },
      size: { start: 0.5, end: 0.1 },
    };
    expect(birthVisibilityDefects(visible), "普通文件被誤抓 —— 量尺壞了").toEqual([]);

    // ⑤ ribbon sentinel：零寬帶
    const flatRibbon: Vfxish = {
      id: "sentinel-rib0",
      schema: "ribbon@1",
      blendMode: "additive",
      widthAbove: 0,
      widthBelow: 0,
      color: [1, 1, 1, 1],
    };
    expect(birthVisibilityDefects(flatRibbon).join(), "零寬 ribbon 應該被抓到").toMatch(/零寬/);
  });

  it("⛔ 出貨的每一份 vfx@1 / ribbon@1 都要有可能畫出一個像素（真缺陷已列名）", () => {
    const bad: string[] = [];
    for (const doc of loadShippedDocs()) {
      if (doc.id in KNOWN_INVISIBLE) continue;
      const reasons = birthVisibilityDefects(doc);
      if (reasons.length > 0) bad.push(`${doc.id}: ${reasons.join("；")}`);
    }
    expect(
      bad,
      [
        "這些出貨文件在任何場景下都畫不出一個像素（技能卡會引用它們，而玩家什麼都看不到）：",
        ...bad.map((b) => `  · ${b}`),
        "⛔ 不要把它們塞進 KNOWN_INVISIBLE 了事 —— 那是給既有 w3x 匯入債的，",
        "新增內容請直接修數字（alpha / RGB / size / width 至少一個要活著）。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("⭐ KNOWN_INVISIBLE 過期偵測：修好的（或消失的）要從名單刪掉", () => {
    const byId = new Map(loadShippedDocs().map((d) => [d.id, d]));
    const stale: string[] = [];
    for (const id of Object.keys(KNOWN_INVISIBLE)) {
      const doc = byId.get(id);
      if (!doc) {
        stale.push(`${id}（文件已不存在）`);
      } else if (birthVisibilityDefects(doc).length === 0) {
        stale.push(`${id}（已經可見了）`);
      }
    }
    expect(
      stale,
      `這幾列 KNOWN_INVISIBLE 過期了，把它們刪掉（名單只能縮小）：\n${stale.join("\n")}`,
    ).toEqual([]);
  });
});
