/**
 * 🪟 GH#699 —— **出貨的 stock emitter 文件，玩家真的播得到**（⛔ 不是「檔案在」）。
 *
 * ## 病灶（量到的，⛔ 不是假設）
 * `stockEmitterIds()` 只問 `p00..p{窗寬-1}`，而窗寬是寫死的 **3**，辯護詞逐字是
 * 「3 = 目前任何一個原作模型抽出來的最多 emitter 數」。
 * ⚠️ `markofchaostarget` 出貨 **6 份**（PRE2×6）的那一天那句話就過期了，
 * 而**沒有任何東西變紅** ⇒ `p03/p04/p05` 三份出貨文件在結構上永遠播不到。
 *
 * ## ⭐ 這一條問的是**關係**，⛔ 不是名詞
 * 「有幾份 `fx.w3x.stock.*` 文件」是名詞（`ls` 就答得出來，而且它一直是對的）。
 * 缺陷住在「**出貨的文件** ↔ **執行期問得到的 id**」這兩者對不對得上 ——
 * 分別檢查每一半都會是綠的。所以這裡走的是出貨那條路：
 *      出貨的 content/vfx/ → 宣告它的家族 → 出貨 config 上綁那一族的技能
 *                          → `extraVfxDocIds()`（＝ `VfxSystem` 真的會問的那串）
 *
 * ⭐ 而且**兩個方向都走**：預設窗底下「播得到」，rollback 窗（3）底下「播不到」。
 * ⛔ 只驗前者的話，一個永遠回傳全部 id 的實作也會綠（單邊校準的量尺）。
 *
 * ── 突變紀錄 ─────────────────────────────────────────────────────────
 *  · `stockEmitterIds()` 的 `for (let i = 0; i < win; i++)` 換回字面值 3
 *    → 「p03 以後也播得到」紅，訊息指名 `…markofchaostarget.p03`。實測過。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import {
  DEFAULT_STOCK_EMITTER_WINDOW,
  resolveStockEmitterWindow,
  setFamilyTuning,
  extraVfxDocIds,
} from "./w3xAbilityArt";
import { W3X_ART_FAMILIES } from "./w3xArtFamilies";

const REPO = resolve(__dirname, "../../../../..");
// ⭐ 出貨的那一份，⛔ 不是手寫夾具（失敗形態⑤）。
const tuning = JSON.parse(
  readFileSync(join(REPO, "content/config/vfx-families.json"), "utf8"),
) as ConfigVfxFamiliesDoc;

/** 出貨的 `fx.w3x.stock.<stem>.p<NN>` —— 從磁碟推導，⛔ 不抄一張清單。 */
const shipped = readdirSync(join(REPO, "content/vfx"))
  .map((f) => /^fx\.w3x\.stock\.(.+)\.p(\d+)\.json$/.exec(f))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ docId: `fx.w3x.stock.${m[1]}.p${m[2]}`, stem: m[1]!, index: Number(m[2]) }));

/** stem → 宣告它的家族（`W3X_ART_FAMILIES[f].models` 就是那條規則）。 */
const familyOf = new Map<string, string>();
for (const [fid, f] of Object.entries(W3X_ART_FAMILIES))
  for (const model of f.models ?? []) familyOf.set(model, fid);

/** 出貨 config 上綁到這一族的第一支技能，⛔ 不寫死 id（內容會變）。 */
function anAbilityOf(family: string): string | undefined {
  for (const [id, b] of Object.entries(tuning.abilities ?? {}))
    if (b.family === family && b.enabled !== false) return id;
  return undefined;
}

describe("stock emitter 候選窗（GH#699）", () => {
  it("每一份出貨的 stock emitter 文件都有技能播得到 —— 含 p03 以後", () => {
    setFamilyTuning(tuning);
    expect(shipped.length, "content/vfx/ 一份 fx.w3x.stock.* 都沒有").toBeGreaterThan(0);

    let checked = 0;
    let beyondOldWindow = 0;
    for (const { docId, stem, index } of shipped) {
      const family = familyOf.get(stem);
      // 沒有家族宣告它 ⇒ 那是另一條線（#699 的 `family=None`），⛔ 不是這一格的事。
      if (family === undefined) continue;
      const ability = anAbilityOf(family);
      if (ability === undefined) continue;
      expect(extraVfxDocIds(ability), `${docId} 出貨了，卻沒有任何技能問得到它`).toContain(docId);
      checked += 1;
      if (index >= 3) beyondOldWindow += 1;
    }
    expect(checked, "一份都沒驗到 —— 這條斷言是空的（失敗形態④）").toBeGreaterThan(0);
    // ⭐ 反方向：舊的寫死窗（3）**證明得出來**構不到今天的內容 ——
    //    ⛔ 沒有這一格，一條永遠綠的斷言看起來跟真的一模一樣。
    expect(beyondOldWindow, "沒有任何 p03 以後的文件 ⇒ 舊窗其實夠用，這張票的前提消失了")
      .toBeGreaterThan(0);
  });

  it("預設窗寬涵蓋今天出貨的最寬那一支，而 rollback 那一格會縮回去", () => {
    const needed = Math.max(...shipped.map((s) => s.index)) + 1;
    expect(
      DEFAULT_STOCK_EMITTER_WINDOW,
      `出貨的 stock 文件最深到 p${needed - 1} ⇒ 預設窗至少要 ${needed}（改 DEFAULT_STOCK_EMITTER_WINDOW）`,
    ).toBeGreaterThanOrEqual(needed);
    // rollback：填 3 就是逐位元組的舊行為；打錯字回預設（⛔ 不可以把特效關掉）。
    expect(resolveStockEmitterWindow("3")).toBe(3);
    expect(resolveStockEmitterWindow(undefined)).toBe(DEFAULT_STOCK_EMITTER_WINDOW);
    expect(resolveStockEmitterWindow("nonsense")).toBe(DEFAULT_STOCK_EMITTER_WINDOW);
  });
});
