/**
 * ⭐⭐ `config.review-tuning@1` —— **資產驗收漏斗的可調參數**（GH#664 Phase 2）。
 *
 * ⭐ owner 2026-08-24（逐字，這條漏斗的來源）：
 * > 「所有關於**視覺、特效、音效等非結構化資料驗收**，你應該要特別對應的自動化流程，
 * >  並且把**風險高的、辨識能力差的**額外安插**人類驗收**的步驟，
 * >  但**避免全部都給人類驗收的極端**，應該還是要**有邏輯的篩選放到 HITL**」
 *
 * ⛔⛔ **票文逐字要求這幾格不可以寫死**：
 * > 「pHash 閾值做成一格可調（⛔ 寫死 —— **它就是 owner 之後會調的東西**）」
 *
 * ⚠️⚠️ ⭐ **而票文自己記了兩邊的代價**（Known risks 逐字）：
 * · 閾值**太緊** ⇒ 每版全量重進佇列（人審變成每版的事 —— ⛔ 正好違反本票目的）
 * · 閾值**太鬆** ⇒ 真漂移漏放
 * ⇒ ⭐ 那正是它必須是一格**設定**而不是一個常數的理由。
 *
 * ⚠️ ⭐ **參考影格用感知距離比對，⛔ 不是逐位元組**（票文逐字）：
 * 不同機器的 GPU／驅動渲染出來的像素不會逐位元相同。
 */
import { z } from "zod";
import { zId } from "../common";

export const zConfigReviewTuningDoc = z
  .object({
    id: zId,
    schema: z.literal("config.review-tuning@1"),
    note: z.string().optional(),
    /**
     * ⭐ 感知基準線的**漂移閾值**（0–1，漢明距離正規化後）。
     * ⭐ 大於這一格 ⇒ 那份已核准的資產**回 pending**。
     * ⚠️ 出貨 `0.12`：夠鬆到吸收 GPU/驅動差異，⛔ 夠緊到抓得到換一顆模型。
     */
    perceptualDriftThreshold: z.number().min(0).max(1),
    /**
     * ⭐⭐ **感知基準線的總開關** —— ⛔ 出貨 `false`。
     * ⚠️ 它需要**決定性渲染種子**與參考影格，而那一半還沒建
     * ⇒ ⭐ 開著會讓每一份資產在第一次比對時全部回 pending
     *   （＝票文 Known risks 的第一條，逐字「人審變成每版的事」）。
     */
    perceptualBaselineEnabled: z.boolean(),
    /**
     * ⭐ 接觸表（contact sheet）附進 release note 的**前 N 名**。
     * ⚠️ owner 2026-08-24 逐字：「owner 十秒掃完，⛔ 不必進遊戲」——
     * ⭐ 而 N 太大就不是十秒了。
     */
    contactSheetTopN: z.number().int().min(0).max(100),
    /**
     * ⭐ HITL 佇列一次最多送幾筆給人看。
     * ⛔ `0` ＝ 不限（⚠️ 而 322 筆的佇列一次送出去，等於沒有篩選）。
     */
    hitlBatchSize: z.number().int().min(0).max(1000),
    /**
     * ⭐⭐ **硬擋開關** —— ⛔ 出貨 `false`，而那是**硬規定**。
     * ⚠️ 票文 Non-goals 逐字：「把 HITL 變成事前審批門
     * （部署 ⛔ 被『人不在』卡死 —— **預設不擋是硬規定**）」。
     */
    blockShipOnPending: z.boolean(),
  })
  .strict();
export type ConfigReviewTuningDoc = z.infer<typeof zConfigReviewTuningDoc>;

/** ⭐ 出貨值 —— ⛔ 不抄字面量：與 `content/config/review-tuning.json` 逐格相同。 */
export const SHIPPED_REVIEW_TUNING: ConfigReviewTuningDoc = {
  id: "review-tuning",
  schema: "config.review-tuning@1",
  perceptualDriftThreshold: 0.12,
  perceptualBaselineEnabled: false,
  contactSheetTopN: 20,
  hitlBatchSize: 40,
  blockShipOnPending: false,
};
