/**
 * 👁 出貨態掃描：每一份 `content/vfx` 文件「有沒有可能畫出一個像素」。(GH#664 R3)
 *
 * owner 2026-08-24（逐字）：
 * > 「所有關於視覺、特效、音效等非結構化資料驗收，你應該要特別對應的自動化流程」
 *
 * ⭐ 為什麼是靜態可判的：連鎖閃電那一族「一個像素都沒畫出來過」的根因
 * （形狀住在 alpha、加法混合疊全黑）**全部寫在文件的數字裡** ——
 * 不用開 WebGL 就能判「這份文件在任何場景下都不可能可見」。
 * 這一支把那幾種病型變成編輯當下就會紅的閘：
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
 * ⭐ 量尺自驗（取代突變）：測試內自造**必不可見**的文件，斷言檢查器抓得到；⑤ 另外
 * 多一層 —— PNG 解碼器本身要能逐位元組還原五種濾波器（解碼器壞掉時 δ 只會變成
 * 另一個看起來合理的數字，⛔ 上面那層 sentinel 抓不到）。
 * 「量尺先被驗過」寫成程式，⛔ 不是一次性的手動突變。
 *
 * ⚠️ KNOWN_INVISIBLE 是**真缺陷名單**，⛔ 不是豁免。名單有過期偵測：哪天有人修好
 * 其中一份，這裡會紅著要求把那一列刪掉 —— 名單只能縮小，不能安靜地變成垃圾桶。
 * ⭐ 上線第一天抓到的那 8 份已於 GH#665 修在**來源側**並清空（見名單處的說明）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  MODULATE_IDENTITY_DELTA,
  decodePng,
  modulateIdentityReason,
  modulateMaxDelta,
  texStatsFromRgba,
  type Rgba,
  type TexStats,
} from "./modulateIdentity";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// ⭐ GH#990 —— 呼叫段要**展開後**再掃，⛔ 不然一段 alpha=0 的子模組樣板會躲在 `call` 後面
import { expandVfxScriptEntries, expandVfxSubtypeRaw } from "./vfxSubtypes/expand";
import { readAllVfxScriptsExpanded, readVfxSubtypesDir } from "./vfxSubtypes/loadFromDir";
import type { VfxScriptSegment } from "./schema/vfxScript";
import type { VfxSubtypeDoc } from "./schema/vfxSubtype";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const VFX_DIR = join(CONTENT_DIR, "vfx");

/** 生命內 peak alpha 要超過這條線才可能被看到 */
const PEAK_ALPHA_MIN = 0.05;
/** additive/modulate 之下，所有 stop 的 max(R,G,B) 低於這條線 = 疊全黑 = 不可見 */
const BLACK_RGB_MAX = 0.02;

/**
 * ⑤ **modulate 逐像素恆等** —— ⭐ 判準本體**不住這裡**（GH#711）。
 *
 * 它與代數、PNG 解碼器、`TexStats` 一起搬到 `./modulateIdentity`，因為**來源側**
 * （`tools/w3x-import/extract_stock_vfx.py`，經 `tools/w3x-import/modulate_oracle.ts`）
 * 需要**同一個答案** —— 而它在 GH#711 之前用的是一份只看文件不看貼圖的近似
 * （`WHITE_RGB_MIN = 0.98`），那份近似丟掉了兩支真的會變暗背景的 emitter。
 * ⇒ ⛔ 判準不可以有第二份實作；這一支現在是它的**消費端**，
 *    下面第二條測試（量尺自驗⑤）仍然逐條驗它。
 *
 * ⛔ 只涵蓋 vfx@1 粒子。ribbon@1 的 modulate 走 StandardMaterial + `toWhite`
 * 手工淡出（apps/client/src/vfx/ribbonMath.ts），是另一條合成式 —— ⛔ 不套這條。
 */

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
      const reason = modulateIdentityReason(colors, tex);
      if (reason) reasons.push(reason);
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
    expect(birthVisibilityDefects(additiveBlack).join(), "additive 全黑應該被抓到").toMatch(
      /疊全黑/,
    );

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

  it("⭐ 量尺自驗（⑤ modulate 恆等）：白貼圖被抓到、真貼圖不被誤抓", () => {
    const modDoc = (id: string): Vfxish => ({
      id,
      schema: "vfx@1",
      blendMode: "modulate",
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 1] },
      size: { start: 1, end: 1 },
    });
    /** 造一張 n 個 texel 的貼圖：`f(i) → [r,g,b,a]`（⛔ 不從磁碟抄一份壞貼圖）。 */
    const synth = (n: number, f: (i: number) => [number, number, number, number]): TexStats =>
      texStatsFromRgba(Uint8Array.from(Array.from({ length: n }, (_, i) => f(i)).flat()));

    // ① 全白貼圖（RGB=255，alpha 任意）× 白色 doc ⇒ δ ≡ 0 ⇒ 恆等
    const white = synth(256, (i) => [255, 255, 255, i]);
    expect(birthVisibilityDefects(modDoc("sentinel-mod-ident"), white).join()).toMatch(/恆等/);

    // ② 同一張全白貼圖，doc 顏色不是白的 ⇒ 真的會把畫面染色 ⇒ ⛔ 不可以被抓
    const tinted: Vfxish = {
      ...modDoc("sentinel-mod-tint"),
      color: { start: [1, 0.2, 0.2, 1], end: [1, 0.2, 0.2, 1] },
    };
    expect(birthVisibilityDefects(tinted, white), "有色 modulate 被誤抓 —— 量尺壞了").toEqual([]);

    // ③ 出貨真貼圖（smoke_09：RGB 只到 ~0.87 而 alpha ~0.79）⇒ δ≫0 ⇒ ⛔ 不是恆等。
    //    ⚠️ 這一格就是 GH#709 的更正：白色 doc 顏色**不足以**恆等。
    const real = texStatsFor("assets/textures/particles/smoke_09.png");
    expect(real, "出貨貼圖讀不到 —— ⑤ 這條判準對整個語料是瞎的").not.toBeNull();
    expect(modulateMaxDelta([[1, 1, 1, 1]], real!)).toBeGreaterThan(MODULATE_IDENTITY_DELTA);
    expect(birthVisibilityDefects(modDoc("sentinel-mod-real"), real)).toEqual([]);
  });

  it("⭐ 量尺自驗（解碼器）：五種 PNG 濾波器逐位元組還原，⛔ 不是「有讀到東西就算」", () => {
    // ⚠️ 為什麼這一條必須存在：⑤ 的結論**全部**建立在解碼出來的像素上。
    // 解碼器壞掉時 δ 只會變成另一個 >1/255 的數字 ⇒ 上面那條 sentinel 照樣綠。
    // ⇒ 這裡把**逆濾波**單獨釘住：正向預測器編碼 → 解碼 → 逐位元組比對。
    const paeth = (a: number, b: number, c: number): number => {
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    const W = 4;
    // 調色盤索引的真值：5 列 × 4 行，⛔ 刻意不是常數（常數列每種濾波器都會對）
    const truth = [
      [0, 1, 2, 3],
      [3, 0, 1, 2],
      [1, 3, 0, 2],
      [2, 2, 3, 1],
      [0, 3, 1, 0],
    ];
    const raw: number[] = [];
    truth.forEach((row, y) => {
      const f = y; // 第 y 列就用第 y 種濾波器（0=None 1=Sub 2=Up 3=Avg 4=Paeth）
      raw.push(f);
      for (let x = 0; x < W; x++) {
        const A = x > 0 ? truth[y]![x - 1]! : 0;
        const B = y > 0 ? truth[y - 1]![x]! : 0;
        const C = x > 0 && y > 0 ? truth[y - 1]![x - 1]! : 0;
        const pred =
          f === 1 ? A : f === 2 ? B : f === 3 ? (A + B) >> 1 : f === 4 ? paeth(A, B, C) : 0;
        raw.push((truth[y]![x]! - pred) & 0xff);
      }
    });
    const chunk = (type: string, data: Buffer): Buffer => {
      const b = Buffer.alloc(12 + data.length);
      b.writeUInt32BE(data.length, 0);
      b.write(type, 4, "ascii");
      data.copy(b, 8); // ⚠️ CRC 留 0 —— decodePng 不驗 CRC（這裡只餵它同樣的 chunk 佈局）
      return b;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(truth.length, 4);
    ihdr[8] = 8; // bitDepth
    ihdr[9] = 3; // colorType = palette（出貨的 98 張粒子貼圖全是這一種）
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("PLTE", Buffer.from([10, 20, 30, 200, 100, 50, 0, 0, 255, 255, 255, 255])),
      chunk("tRNS", Buffer.from([0, 64, 128])), // idx3 沒列到 ⇒ 不透明
      chunk("IDAT", deflateSync(Buffer.from(raw))),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const want: number[] = [];
    const plte = [
      [10, 20, 30],
      [200, 100, 50],
      [0, 0, 255],
      [255, 255, 255],
    ];
    const trns = [0, 64, 128, 255];
    for (const row of truth) for (const i of row) want.push(...plte[i]!, trns[i]!);
    expect(
      Array.from(decodePng(png).rgba),
      "PNG 逆濾波錯了 ⇒ ⑤ 的每一個 δ 都是編的（⛔ 而它仍然會是一個看起來合理的數字）",
    ).toEqual(want);
  });

  it("⛔ 出貨的每一份 vfx@1 / ribbon@1 都要有可能畫出一個像素（真缺陷已列名）", () => {
    const bad: string[] = [];
    const blind: string[] = [];
    for (const doc of loadShippedDocs()) {
      const tex = texStatsFor(doc.texture);
      // ⭐ fail-loud：modulate 而貼圖讀不到 ⇒ ⑤ 對它是瞎的，而「瞎」與「過」長得一樣
      if (doc.schema === "vfx@1" && doc.blendMode === "modulate" && !tex) {
        blind.push(`${doc.id}（texture=${doc.texture ?? "（無）"}）`);
      }
      if (doc.id in KNOWN_INVISIBLE) continue;
      const reasons = birthVisibilityDefects(doc, tex);
      if (reasons.length > 0) bad.push(`${doc.id}: ${reasons.join("；")}`);
    }
    expect(
      blind,
      `這些 modulate 文件的貼圖讀不到 ⇒ 判準⑤ 對它們是瞎的（⛔ 不是通過）：\n${blind.join("\n")}`,
    ).toEqual([]);
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
      } else if (birthVisibilityDefects(doc, texStatsFor(doc.texture)).length === 0) {
        stale.push(`${id}（已經可見了）`);
      }
    }
    expect(
      stale,
      `這幾列 KNOWN_INVISIBLE 過期了，把它們刪掉（名單只能縮小）：\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * ⭐ GH#990 —— vfx-script 的段落（**展開後**）與 vfx-subtype 的樣板（用預設值展開）：
   * `modelFx.alpha` 的 schema 下界是 0（`spawnModelFx.ts`：`gte(0)`）⇒ 一段 `alpha: 0` 合法、
   * 而它畫不出一個像素。呼叫段展開後才掃 —— ⛔ 不然那一段躲在 `{call}` 後面，這一支永遠看不到。
   * （`vfx` 段的 `alpha` 下界是 0.05、`screenFlash.peakAlpha` 是 positive ⇒ schema 已經擋，這裡不重複。）
   */
  const segmentBirthDefect = (seg: VfxScriptSegment): string | null =>
    seg.kind === "modelFx" && seg.alpha !== undefined && seg.alpha <= PEAK_ALPHA_MIN
      ? `modelFx ${seg.modelKey} alpha=${seg.alpha} ≤ ${PEAK_ALPHA_MIN}`
      : null;

  it("⭐ GH#990 量尺自驗：一段 alpha=0 的子模組樣板，藏在 call 後面也抓得到", () => {
    const sub: VfxSubtypeDoc = {
      id: "sub.sentinel-invisible",
      schema: "vfx-subtype@1",
      label: "sentinel",
      derivedFrom: ["x"],
      params: {},
      segments: [{ kind: "modelFx", on: "castStart", modelKey: "imported.doom", path: "static", lifeSec: 1, alpha: 0 }],
    };
    const segs = expandVfxScriptEntries([{ call: { subtype: sub.id } }], (id) => (id === sub.id ? sub : undefined));
    expect(segs.map(segmentBirthDefect).filter(Boolean), "sentinel：alpha=0 的段落沒被抓到").toHaveLength(1);
  });

  it("⛔ 出貨的每一支 vfx-script（展開後）與每一顆 vfx-subtype（預設展開）都要有可能畫出一個像素", () => {
    const scripts = readAllVfxScriptsExpanded(CONTENT_DIR);
    const subs = readVfxSubtypesDir(join(CONTENT_DIR, "vfx-subtypes"));
    expect(scripts.length + subs.length, "一份都沒讀到 ⇒ 路徑過期").toBeGreaterThan(0);
    const bad: string[] = [];
    for (const s of scripts)
      s.segments.forEach((seg, i) => {
        const r = segmentBirthDefect(seg);
        if (r) bad.push(`vfx-scripts/${s.raw.id}#${i}: ${r}`);
      });
    for (const sub of subs)
      (expandVfxSubtypeRaw(sub) as VfxScriptSegment[]).forEach((seg, i) => {
        const r = segmentBirthDefect(seg);
        if (r) bad.push(`vfx-subtypes/${sub.id}#${i}: ${r}`);
      });
    expect(bad, `這些段落在任何場景下都畫不出一個像素：\n${bad.join("\n")}`).toEqual([]);
  });
});
