import { z } from "zod";
import { zId } from "../common";
import { ICON_ENCODE } from "../../icons/encodeIcon";

/**
 * `config.icon-upload@1` —— ⭐⭐ **編輯器打包進來的 icon 圖片**要怎麼收（GH#966）。
 *
 * > owner 2026-09-02（逐字）：「codex 技能編輯器要能**打包 icon 圖片**…設計者可以用
 * >  codex 技能編輯器**上傳設定圖片檔（但不是真的馬上上傳）**，而編輯器會**自動縮圖
 * >  轉檔放入一起打包**。請你也**設計該合約形式**」
 *
 * ── ⭐ 三個 owner **沒有裁決**的決策點，各留一格 ───────────────────────────
 * owner 2026-08-23 常設指令逐字：「**沒做完以前別問我了自己判斷 但是留後台開關可以
 * 簡易 rollback**」⇒ ⭐ 我挑了預設，⛔ 而每一個選擇都是一格下拉選單。
 *
 * | 題 | 我挑的 | 為什麼 |
 * |---|---|---|
 * | 上傳的 icon 要不要留審核紀錄 | ⭐ **要** | 它會被**所有玩家**看到，而審核成本是「一頁打勾」 |
 * | 支不支援透明背景 | ⭐ **保留 alpha** | `cwebp` 預設就保留 ⇒ 零額外工作；剝掉會做不出舊 w3x 去背風格 |
 * | 來源尺寸上限 | ⭐ **出貨邊長的 32 倍**（= 4096²） | ⛔ 不憑感覺寫一個數字 —— 它從 `ICON_ENCODE.edge` **推導** |
 *
 * ── ⛔ 為什麼上限存的是**倍數**而不是 4096 ──────────────────────────────────
 * 第〇·四守則：⛔ 同一個數字不可以有第二個住處。出貨邊長哪天從 128 變成 256，
 * 一個寫死的 `4096` 就變成「16 倍」而**沒有任何東西會紅**。
 * ⇒ ⭐ 文件裡只有倍數，`resolveIconUpload()` 在載入時乘出來。
 */
export const zConfigIconUploadDoc = z
  .object({
    id: zId,
    schema: z.literal("config.icon-upload@1"),
    note: z.string().optional(),
    /**
     * ⭐⭐ **總開關 ＝ 一鍵 rollback。** 關掉之後，任何帶 `role:"asset"` 的包會被
     * **明確拒絕**（`ASSET_UPLOAD_DISABLED`）—— ⛔ 不是靜靜地把圖丟掉，
     * ⚠️ 而那正是本票要修的那個 bug 的樣子。
     */
    enabled: z.boolean().describe(
      "@zh 收不收編輯器打包的 icon（總開關）\n" +
      "@note ⭐⭐ **這一格就是這個功能的一鍵 rollback。** 出貨 **{{出貨值}}**。⛔ 關掉之後，帶 icon 的包會被**明確拒絕**（診斷碼 `ASSET_UPLOAD_DISABLED`）—— ⭐ 而不是靜靜地把圖丟掉，⚠️ 因為「靜靜丟掉」正是這張票要修的那個 bug。⚠️ 關掉**不會**動到任何已經落地的 icon（那些檔案照常出貨）。",
    ),
    /**
     * ⭐ 上線之後留一筆**待審**紀錄（owner 對「一頁批次後台驗收」的定義是
     * 「**先上線成果**，但是在**後台可以一鍵否決還原**」）。
     * ⛔ 它**不是事前審批門** —— 關掉它只是不留那筆紀錄。
     */
    requiresReview: z.boolean().describe(
      "@zh 上線後留一筆待審紀錄\n" +
      "@note 出貨 **{{出貨值}}**。⭐ 開著時，每一次落地的 icon 會寫進匯入稽核尾巴（`content-import.icon-pending-review`），供批次審查頁列出來。⚠️ ⭐ 它**不是事前審批門** —— owner 對「一頁批次後台驗收」的定義逐字是「**先上線成果**，但是在**後台可以一鍵否決還原**」⇒ 圖是先上線的。⛔⛔ 關掉它的後果要看清楚：設計師上傳的圖會**直接對所有玩家可見而沒有任何人審過**，⭐ 而 icon 是全遊戲曝光度最高的素材之一（技能格、商店、選人畫面都在用）。",
    ),
    /** ⭐ 保留透明背景。⛔ 關掉會讓技能格上的去背風格變成一塊方形底。 */
    preserveAlpha: z.boolean().describe(
      "@zh 保留透明背景\n" +
      "@note 出貨 **{{出貨值}}**。⭐ `cwebp` 預設就保留 alpha ⇒ 開著是**零額外工作**。⛔ 關掉會讓去背的圖在技能格上變成一塊不透明方形 —— ⚠️ 出貨的 119 份 legacy PNG 正是靠 alpha 疊在技能格上的那種風格。⚠️ 這一格**只影響新上傳的圖**，⛔ 不會回頭改既有的 1,039 份 WebP。",
    ),
    /**
     * 來源圖邊長上限 ＝ 這個倍數 × 出貨邊長（`ICON_ENCODE.edge`）。
     * ⚠️ 上界 128（= 16384²）：再高就等於沒有擋，⭐ 而這一格擋的是**圖片解壓炸彈**。
     */
    maxSourceEdgeMultiple: z.number().int().min(1).max(128).describe(
      "@zh 來源圖邊長上限 — 出貨邊長的幾倍\n" +
      "@note 出貨 **{{出貨值}}** 倍（⭐ 出貨邊長 128 ⇒ 實際上限 4096²）。⭐⭐ 這裡存的是**倍數**而不是 4096，理由是第〇·四守則：出貨邊長哪天從 128 變成 256，一個寫死的 4096 就變成「16 倍」而**沒有東西會紅**。⚠️ ⭐ 它擋的是**圖片解壓炸彈**：一張宣稱 65535×65535 的 PNG 檔頭只有 24 bytes，壓縮比與 entry 大小**全部過得了** zip 那一層，⛔ 而真的 decode 它就是幾十 GB 的記憶體。⇒ ⭐ 判準是**讀檔頭**（decode 之前），⛔ 不是「解開來看看多大」。⚠️ 上界 128 倍（16384²）：再高就等於沒有擋。",
    ),
  })
  .strict();

export type ConfigIconUploadDoc = z.infer<typeof zConfigIconUploadDoc>;

/** 出貨文件的 id。⭐ 消費端一律用它，⛔ 不要重打字串。 */
export const ICON_UPLOAD_DOC_ID = "icon-upload";

/**
 * ⭐ 出貨值。`content/config/icon-upload.json` 與後台那一頁都要與它一致
 * （三個住處 + drift 測試，第一守則）。
 */
export const DEFAULT_ICON_UPLOAD: ConfigIconUploadDoc = Object.freeze({
  id: ICON_UPLOAD_DOC_ID,
  schema: "config.icon-upload@1",
  enabled: true,
  requiresReview: true,
  preserveAlpha: true,
  maxSourceEdgeMultiple: 32,
});

/** 解析後的政策 —— ⭐ **邊長上限是算出來的**，⛔ 文件裡沒有那個數字。 */
export interface IconUploadPolicyResolved {
  readonly enabled: boolean;
  readonly requiresReview: boolean;
  readonly preserveAlpha: boolean;
  readonly maxSourceEdge: number;
}

/**
 * ⭐ 讀不到文件（或它壞了）⇒ 回出貨預設，⛔ 不是丟例外 ——
 * ⚠️ 而「回退了」這件事由呼叫端的診斷說出來（fail-open 沒錯，靜默才是缺陷）。
 */
export function resolveIconUpload(doc: unknown): IconUploadPolicyResolved {
  const parsed = zConfigIconUploadDoc.safeParse(doc);
  const d = parsed.success ? parsed.data : DEFAULT_ICON_UPLOAD;
  return Object.freeze({
    enabled: d.enabled,
    requiresReview: d.requiresReview,
    preserveAlpha: d.preserveAlpha,
    maxSourceEdge: d.maxSourceEdgeMultiple * ICON_ENCODE.edge,
  });
}
