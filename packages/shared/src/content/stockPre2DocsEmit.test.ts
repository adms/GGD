/**
 * 👁 stock PRE2 抽取物：每一份 `fx.w3x.stock.*` 都要**發得出粒子**且**亮得起來**。(GH#699)
 *
 * ⭐ 為什麼 `vfxDocsBirthVisibility` 不夠：那一支問「alpha 有沒有活著、RGB 是不是全黑」，
 * 而 stock PRE2 這一族有兩個它問不到的死法 ——
 *
 *   ① **發射量 0**：`mode:"burst"` 的 `burstCount` 或 `mode:"continuous"` 的 `rate`
 *      歸零 ⇒ 顏色與尺寸全都漂亮，而**一顆粒子都不會生出來**。
 *      （PRE2 的 `emissionRate` 常常是 0、真正的量住在 KP2E 軌上，
 *        `build_p2_doc` 的峰值回退斷掉就是這個形狀。）
 *   ② **modulate 疊全白**：`additive 疊全黑` 的鏡像病。Babylon 的 MULTIPLY 是
 *      `(DST_COLOR, ONE_MINUS_SRC_ALPHA)` ⇒ `out = dst·(tex.rgb·color.rgb + 1 − tex.a)`，
 *      而出貨的替代精靈圖 RGB 逐位追著自己的 alpha（實測調色盤 (50,50,50)@a=26、
 *      (218,218,218)@a=202）⇒ `tex.rgb ≈ tex.a = t`，配上白色 doc 顏色就是
 *      `dst·(t + 1 − t) = dst` —— **逐像素恆等**，⛔ 不是「比較淡」。
 *
 * ⚠️ 判的是「生命內 peak」，⛔ 不是字面的「出生那一刻」：WarStompCaster 的
 * segmentAlpha 逐字就是 `[0, 200, 0]`（出生透明、中段 peak），那是**原作的作法**，
 * 把它判成缺陷會逼人去改一個忠實的數字。
 *
 * ⭐ 量尺自驗在下面第一條：四份必死的 sentinel，檢查器全部要抓得到。
 * 承重那一行在來源側 —— `tools/w3x-import/extract_stock_vfx.py::invisibility_reasons`
 * 的 modulate 分支；拿掉它 ⇒ MarkOfChaosTarget 的 white02/white03 會被抽出來 ⇒ 這裡紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VFX_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/vfx");
const STOCK_PREFIX = "fx.w3x.stock.";
const WHITE_RGB_MIN = 0.98; // == extract_stock_vfx.py

type Rgba = readonly [number, number, number, number];
interface Doc {
  id: string;
  schema: string;
  mode?: string;
  rate?: number;
  burstCount?: number;
  blendMode?: string;
  color: { start: Rgba; end: Rgba };
  colorStops?: readonly (readonly [number, Rgba])[];
}

const stops = (d: Doc): Rgba[] =>
  d.colorStops?.length ? d.colorStops.map((s) => s[1]) : [d.color.start, d.color.end];

/** 這份 stock 文件為什麼「發不出來」或「亮不起來」。空 = 它有機會被看到。 */
export function stockEmitDefects(d: Doc): string[] {
  const bad: string[] = [];
  const emitted = d.mode === "burst" ? (d.burstCount ?? 0) : (d.rate ?? 0);
  if (!(emitted > 0)) bad.push(`${d.mode} 的發射量 ${emitted} —— 一顆粒子都不會生出來`);
  const cols = stops(d);
  const peakLit = Math.max(...cols.map((c) => Math.max(c[0], c[1], c[2]) * c[3]));
  if (!(peakLit > 0)) bad.push(`生命內 peak(亮度×alpha)=${peakLit} —— 整條生命都不發光`);
  if (d.blendMode === "modulate") {
    const floor = Math.min(...cols.map((c) => Math.min(c[0], c[1], c[2])));
    if (floor >= WHITE_RGB_MIN) bad.push(`modulate 疊全白（min(R,G,B)=${floor}）—— MULTIPLY 恆等`);
  }
  return bad;
}

describe("👁 fx.w3x.stock.* —— 抽出來的 PRE2 要發得出粒子且亮得起來", () => {
  it("⭐ 量尺自驗：四份必死的 sentinel 全部抓得到，一份正常的不誤抓", () => {
    const base = { id: "s", schema: "vfx@1", color: { start: [1, 1, 1, 1], end: [1, 1, 1, 1] } } as Doc;
    expect(stockEmitDefects({ ...base, mode: "burst", burstCount: 0 }).join()).toMatch(/發射量/);
    expect(stockEmitDefects({ ...base, mode: "continuous", rate: 0 }).join()).toMatch(/發射量/);
    expect(
      stockEmitDefects({
        ...base,
        mode: "burst",
        burstCount: 20,
        color: { start: [1, 1, 1, 0], end: [0, 0, 0, 1] },
      }).join(),
    ).toMatch(/不發光/);
    expect(
      stockEmitDefects({ ...base, mode: "burst", burstCount: 20, blendMode: "modulate" }).join(),
    ).toMatch(/恆等/);
    // 對照組：WarStomp 那種「出生 alpha 0、中段 peak」是忠實的，⛔ 不可以被誤抓
    expect(
      stockEmitDefects({
        ...base,
        mode: "burst",
        burstCount: 109,
        blendMode: "additive",
        color: { start: [1, 1, 1, 0], end: [1, 1, 1, 0] },
        colorStops: [
          [0, [1, 1, 1, 0]],
          [0.3, [1, 1, 1, 0.784]],
          [1, [1, 1, 1, 0]],
        ],
      }),
    ).toEqual([]);
  });

  it("⛔ 出貨的每一份 stock PRE2 文件都發得出粒子且亮得起來", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of readdirSync(VFX_DIR)) {
      if (!f.startsWith(STOCK_PREFIX) || !f.endsWith(".json")) continue;
      const doc = JSON.parse(readFileSync(join(VFX_DIR, f), "utf8")) as Doc;
      seen += 1;
      const d = stockEmitDefects(doc);
      if (d.length) bad.push(`${doc.id}: ${d.join("；")}`);
    }
    // ⛔ 零份掃到 = 這條守衛在對空氣說話（前綴改了/目錄搬了都長這樣）
    expect(seen, "一份 fx.w3x.stock.* 都沒掃到 —— 守衛失效了").toBeGreaterThan(0);
    expect(
      bad,
      `這些 stock PRE2 文件玩家永遠看不到；修在**來源側**（tools/w3x-import/extract_stock_vfx.py）再重跑：\n${bad.join("\n")}`,
    ).toEqual([]);
  });
});
