/**
 * ⭐【GH#482】掛件縮放（`config.form-visuals@1.attachScale` / `attachment@1.scale`）
 * 是**兩個轉檔倍率的比值**，⛔ 不是一個美術挑的數字。
 *
 * ── 這個檔案為什麼存在 ────────────────────────────────────────────────────────
 *
 * 出貨的悟空超三球體是 **0.3221**，而 `schema/vfx.ts` 與 `schema/config.ts` 的註解
 * 都寫著它等於 `0.008946 / 0.027778`。**`0.008946` 在整個 repo 裡不存在。**
 * 那是一段**事後合理化**：把一個看起來對的算式寫在旁邊，於是任何人來查都會
 * 以為它有來源（第三守則的教科書形狀）。
 *
 * 真正的兩個數字**都在** `tools/w3x-import/out/GoDieEX22s/models_report.json` 裡，
 * 而且它們是同一支轉檔器在同一次匯入時寫下的：
 *
 *     goku.mdx      kind: "hero"           scale_factor: 0.01156   （身高規則：整隻 1.70u）
 *     Goku3head.mdx kind: "animated-prop"  scale_factor: 0.02778   （道具規則：1/36）
 *
 * ⇒ `0.01156 / 0.02778` = **0.4161**，而不是 0.3221。
 * owner 2026-08-20 逐字：「**照原著 改成忠實值** 0.3221 → 0.4161」（球變大 29%）。
 *
 * ── ⭐ 為什麼是**比值**而不是一個常數 ───────────────────────────────────────
 *
 * 兩份 glb 各自被轉檔器**正規化過**，而且**用不同的規則**：本體走英雄身高規則、
 * 掛件走道具倍率。把掛件掛到本體的掛點上時，它落在**本體的座標系**裡 ——
 * 所以要先把掛件從「它自己的正規化」換算回「本體的正規化」，
 * 那個換算就是兩個 `scale_factor` 的比值。⭐ 一格常數（例如寫死的 1/36）
 * 只在「掛件永遠是 prop、本體永遠是 hero」時才對，而 `models_report.json` 裡
 * 兩種 kind 的 `scale_factor` 都會因為模型的原始高度而不同。
 *
 * 守衛：`attachmentScale.test.ts` —— 它把 `content/config/form-visuals.json` 的每一格
 * `attachScale` 拿去跟 `models_report.json` 逐筆對，⛔ 不是掃註解字串。
 */

/**
 * 小數位數。⭐ 4 位是 `models_report.json` 自己記 `scale_factor` 的位數
 *（`0.01156` / `0.02778`）—— 比來源精確的位數多寫幾位是假精度。
 */
export const ATTACH_SCALE_DECIMALS = 4;

/**
 * 掛件在**本體座標系**裡該有的縮放。
 *
 * @param bodyScaleFactor       本體 glb 的 `scale_factor`（`models_report.json`）
 * @param attachmentScaleFactor 掛件 glb 的 `scale_factor`（同一份報告）
 *
 * 任一個不是正數就回 `null`（⛔ 不回 1 —— 1 是「和本體一樣的轉檔倍率」這個**斷言**，
 * 而讀不到來源時我們並不知道那是真的；回 null 讓呼叫端說得出「這一格沒有出處」）。
 */
export function attachScaleFor(
  bodyScaleFactor: number,
  attachmentScaleFactor: number,
): number | null {
  if (!(bodyScaleFactor > 0) || !(attachmentScaleFactor > 0)) return null;
  const p = 10 ** ATTACH_SCALE_DECIMALS;
  return Math.round((bodyScaleFactor / attachmentScaleFactor) * p) / p;
}

/**
 * `model@1.glbPath`（`assets/models/imported/goku.glb`）→ `models_report.json` 的
 * `glb` 欄位（`goku.glb`）。⭐ 這是那兩份資料唯一穩定的 join key ——
 * `name` 會因為 id 命名慣例改變，`source` 是 mdx 檔名（大小寫不一致）。
 */
export function glbBasename(glbPath: string): string {
  const i = glbPath.lastIndexOf("/");
  return (i < 0 ? glbPath : glbPath.slice(i + 1)).toLowerCase();
}
