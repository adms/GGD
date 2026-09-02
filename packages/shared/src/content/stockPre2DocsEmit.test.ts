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
 * ⛔⛔ **第②條原本寫在這裡，而它是錯的**（GH#711 移除）：它宣稱「modulate 疊全白
 * ＝逐像素恆等」，靠的是 `MULTIPLY = (DST_COLOR, ONE_MINUS_SRC_ALPHA)` 與
 * `tex.rgb ≈ tex.a` 兩個前提 —— **兩個都不成立**（實測比值中位數 1.273）。
 * ⇒ 白色 doc 顏色**不足以**恆等，貼圖自己也要是白的。
 * ⭐ 恆等這一題現在**只有一個住處**：`./modulateIdentity`（判準⑤），
 *   由 `vfxDocsBirthVisibility.test.ts` 掃出貨態、由 `modulate_oracle.ts` 服務抽取器。
 * ⛔ 不要在這裡放第二份 —— 這個檔曾經是那份錯判準的**第三個**住處，
 *   而它讓兩支真的會變暗背景的 emitter（δ=0.189 ≈ 48× 門檻）被當成零。
 *
 * ⚠️ 判的是「生命內 peak」，⛔ 不是字面的「出生那一刻」：WarStompCaster 的
 * segmentAlpha 逐字就是 `[0, 200, 0]`（出生透明、中段 peak），那是**原作的作法**，
 * 把它判成缺陷會逼人去改一個忠實的數字。
 *
 * ⭐ 量尺自驗在下面第一條：三份必死的 sentinel，檢查器全部要抓得到。
 * 承重那一行在來源側 —— `build_p2_doc` 的 KP2E 峰值回退；拿掉它 ⇒ 出貨的
 * stock 文件 `rate`/`burstCount` 歸零 ⇒ 這裡紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VFX_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/vfx");
const STOCK_PREFIX = "fx.w3x.stock.";

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
  // ⚠️ GH#711：`modulate` 是**變暗**的混色 —— 拿「發不發光」去問它是問錯問題
  // （白色 × alpha 1 在這把尺上滿分，而它畫出來的是暗煙）。它歸判準⑤ 管。
  if (d.blendMode !== "modulate") {
    const peakLit = Math.max(...cols.map((c) => Math.max(c[0], c[1], c[2]) * c[3]));
    if (!(peakLit > 0)) bad.push(`生命內 peak(亮度×alpha)=${peakLit} —— 整條生命都不發光`);
  }
  // ⛔ modulate 恆等**不在這裡判**（見檔頭）：它要貼圖像素，住 `./modulateIdentity`。
  return bad;
}

describe("👁 fx.w3x.stock.* —— 抽出來的 PRE2 要發得出粒子且亮得起來", () => {
  it("⭐ 量尺自驗：三份必死的 sentinel 全部抓得到，一份正常的不誤抓", () => {
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
    // ⛔ 這裡刻意**沒有** modulate sentinel：恆等歸判準⑤（`./modulateIdentity`），
    // 而 GH#711 之前這裡放的那一條，判的是一個算錯的東西。
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
      // ⛔⛔ **問 schema，⛔ 不是問前綴**（2026-09-02，GH#753）——
      //   同一個前綴底下今天有**兩種** schema：`vfx@1`（PRE2 粒子）與
      //   `ribbon@1`（RIBB 緞帶）。⭐ 而這一支問的是「發不發得出粒子」，
      //   那是粒子的性質：緞帶沒有 `color.start` / `rate` / `burstCount`
      //   ⇒ 一進來就 `Cannot read properties of undefined`。
      // ⚠️ ⭐ 教訓：**一條掃「檔名前綴」的守衛，在同前綴長出第二種 schema 的
      //   那一天會炸** —— 而它炸的方式讀起來像「內容壞了」，⛔ 不是「守衛過期了」。
      if (doc.schema !== "vfx@1") continue;
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
