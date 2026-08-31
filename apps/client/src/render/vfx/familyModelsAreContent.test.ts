/**
 * ⭐⭐ GH#761 —— 「**一次施法有幾個發射器**」是內容，⛔ 不是 TS 常數。
 *
 * ── 票文的缺陷，精確版 ────────────────────────────────────────────────────
 * `config.vfx-families@1.families[f]` 帶著這一族的 **10 格** tuning
 * （enabled / primitive / element / scale / alpha / timeScale / heightY /
 *  音效 / groundDecal）—— ⛔ **唯獨少 `models`**。
 * 而「播幾顆發射器」的答案正是
 *   `family.models × p00..p{窗寬-1}` ⇒ `fx.w3x.stock.<model>.p<NN>`
 * ⇒ ⭐ 後台調得到這一族「**長什麼樣**」，⛔ 調不到它「**到底播哪幾顆**」。
 *
 * ── ⛔ 為什麼**不**照票的 AC① 字面把 id 烘進 421 份 ability 文件 ─────────
 * 那會是第〇·四守則的第二個住處（N 支技能 × 每次美術改動 = 一次重新產生鏈），
 * ⭐ 而票自己的 [思考策略] 引的就是那一條。**規則沒有錯，錯的是規則的輸入
 * 不可編輯** ⇒ 讓輸入變成內容，⛔ 不是把輸出攤平。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `stockEmitterIds` 的 `activeFamilyTuning?…models` 拿掉（回讀 TS 常數）
 *       → 「後台換一份 models，播出來的 id 跟著換」紅
 *   · `onAbilityArtBindingsChanged` 裡的 `stockIdCache.clear()` 拿掉
 *       → 「換內容之後快取要失效」紅
 *   · `tuned ?? …` 改成 `tuned?.length ? tuned : …`
 *       → 「空陣列 ≠ 缺席」紅
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { zVfxFamilyTuning, type ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import { setFamilyTuning, extraVfxDocIds } from "./w3xAbilityArt";

const ROOT = resolve(__dirname, "../../../../..");

/** ⭐ **出貨的那一份** —— ⛔ 不是自己造一份（失敗形態⑤）。 */
function shippedTuning(): ConfigVfxFamiliesDoc {
  return JSON.parse(
    readFileSync(resolve(ROOT, "content/config/vfx-families.json"), "utf8"),
  ) as ConfigVfxFamiliesDoc;
}

/** 出貨內容裡真的綁在 `shockwaveRing` 上的一支技能。 */
const ABILITY = "godie-e001.passive";

describe("GH#761 家族的 models 是內容", () => {
  it("量尺先自證：`config.vfx-families@1` 的家族 tuning **收得下** models", () => {
    const ok = zVfxFamilyTuning.safeParse({
      enabled: true,
      primitive: "shockwave",
      element: "earth",
      scale: 1,
      alpha: 1,
      timeScale: 1,
      heightY: 0.15,
      models: ["warstompcaster"],
    });
    expect(ok.success, "⛔ schema 收不下 ⇒ 內容寫了會被 zod 拒絕").toBe(true);
    // ⭐ 反方向：`.strict()` 的表要真的擋得住打錯的欄位名，
    //   ⛔ 否則「收得下」這件事證明不了什麼。
    const bad = zVfxFamilyTuning.safeParse({
      enabled: true,
      primitive: "shockwave",
      element: "earth",
      scale: 1,
      alpha: 1,
      timeScale: 1,
      heightY: 0.15,
      modles: ["typo"],
    });
    expect(bad.success).toBe(false);
  });

  afterEach(() => setFamilyTuning(null));

  it("★ ⭐ **後台換一份 models，播出來的發射器 id 跟著換**（拿掉那一行 ⇒ 後台調不到）", () => {
    const doc = shippedTuning();
    setFamilyTuning(doc);
    const before = [...extraVfxDocIds(ABILITY)];
    expect(before.length, "⛔ 出貨綁定沒有給這支技能任何 stock emitter ⇒ 夾具選錯了").toBeGreaterThan(0);
    expect(before.every((i) => i.startsWith("fx.w3x.stock."))).toBe(true);

    setFamilyTuning({
      ...doc,
      families: {
        ...doc.families,
        shockwaveRing: { ...doc.families.shockwaveRing!, models: ["markofchaostarget"] },
      },
    });
    const after = [...extraVfxDocIds(ABILITY)];
    // ⚠️ ⛔ 不抄窗寬（`p00..p02`）—— 那是 `resolveStockEmitterWindow()` 的事，
    //   而它吃環境覆寫（測試環境量到 16）。抄字面值 = 第四個住處，而它會過期。
    expect(
      after.every((i) => i.startsWith("fx.w3x.stock.markofchaostarget.p")),
      `⛔ 後台換了 \`models\` 而播出來的還是舊的 —— 那一格是裝飾（第一·五守則）。實際：${after.slice(0, 3).join(", ")}`,
    ).toBe(true);
    // ⚠️ ⛔ 不是 `toBe(before.length)` —— 出貨的 shockwaveRing 宣告**兩顆**模型
    //   （warstompcaster + thunderclapcaster），而這裡換成**一顆** ⇒ 數量本來就會減半。
    //   ⭐ 要驗的是「換得動」，⛔ 不是「換完一樣多」。
    expect(after.length, "⛔ 一顆都沒有 ⇒ 換成空的了，⛔ 不是換成新的").toBeGreaterThan(0);
    expect(after.length * 2, "⛔ 一顆模型應該產出出貨兩顆的一半").toBe(before.length);
    expect(after, "⛔ 快取沒失效 ⇒ 存檔成功而畫面一顆都不換").not.toEqual(before);
  });

  it("⭐ **空陣列 ≠ 缺席** —— `[]` 是「這一族不要原作 emitter」的決定（止血閥）", () => {
    const doc = shippedTuning();
    setFamilyTuning({
      ...doc,
      families: {
        ...doc.families,
        shockwaveRing: { ...doc.families.shockwaveRing!, models: [] },
      },
    });
    expect(
      [...extraVfxDocIds(ABILITY)],
      "⛔ `tuned?.length ? tuned : 原型` 會把 `[]` 讀成缺席 ⇒ 那個決定存不下來",
    ).toEqual([]);
  });

  it("⭐ 缺席 ⇒ 退回出貨原型 ＝ **今天的行為，逐位元不變**", () => {
    const doc = shippedTuning();
    setFamilyTuning(doc);
    const withAbsent = [...extraVfxDocIds(ABILITY)];
    // 出貨的 21 個家族**沒有一個**填了 models ⇒ 這條路就是今天走的那一條。
    const anyFilled = Object.values(doc.families).some((f) => f?.models !== undefined);
    expect(anyFilled, "⚠️ 出貨開始填 models 之後，這條斷言要改成比對那一份").toBe(false);
    expect(withAbsent.length).toBeGreaterThan(0);
  });
});
