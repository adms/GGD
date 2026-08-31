/**
 * ⭐⭐ GH#730 批 B —— **內容編輯的寫入端走 durable overlay**。
 *
 * ── 為什麼（⭐ 票文的裁決，逐字）──────────────────────────────────────────
 * 「9 個內容編輯頁搬上正式 build 後台 —— **putOverlayDoc 覆蓋層遷移**（⛔ 不是拔 DEV 閘）」
 *
 * `contentApi.ts` 的 `const ENABLED = isDevBuild()` 是**刻意的**：那一整個 chunk
 * （routes / labels / 引擎 / 寫入模組）在 production build 裡一個位元組都不在。
 * ⇒ ⭐ 遷移**不是把閘拿掉**，是**換一條寫入路徑** —— 一條 production 也在的。
 *
 * ── ⭐ 兩條路的語意差（⛔ 這是這個檔存在的全部理由）──────────────────────
 * | | dev 中介層 | ⭐ durable overlay |
 * |---|---|---|
 * | 寫到哪 | `content/` 的**檔案** | 平台的 `data/`（⭐ `:ro` 內容掛載抹不掉它） |
 * | 單位 | 檔案 | ⭐ **文件** |
 * | 撐得過 `git pull` 嗎 | ⛔ 不 | ⭐ 撐得過 |
 * | production 有嗎 | ⛔ 沒有 | ⭐ 有 |
 *
 * ⚠️ ⭐ 而 `putOverlayDoc` **已經有兩個生產頁在用**（`ui/MatchConfigPage.tsx:139`、
 * `vfxForge.ts:48`）⇒ 這條路是通的，⛔ 這個檔沒有發明任何東西。
 *
 * ── ⛔ 刻意**不做**的 ──────────────────────────────────────────────────────
 * · `plan`（寫入計畫）—— ⭐ 它是「會動哪幾個**檔**」，而覆蓋層的單位是**文件**
 *   ⇒ 語意要先裁決（批 D），⛔ 不可以硬翻。
 * · 批次原子性 —— dev 版一次寫一串；⭐ overlay 是一份一份 PUT。
 *   ⇒ 這裡**逐份寫、逐份回報**，⛔ 不假裝它是一次交易。
 */
import { putOverlayDoc, deleteOverlayDoc } from "./api";
import type { EditCollection, WritePlanStep } from "@ggd/shared/content/editModel";

export interface OverlayWriteResult {
  readonly collection: EditCollection;
  readonly id: string;
  readonly reason: WritePlanStep["reason"];
  readonly ok: boolean;
  /** ⭐ 失敗的**那一份**的原因（⛔ 不是整批一句話）。 */
  readonly error: string | null;
}

export interface OverlaySaveOutcome {
  readonly ok: boolean;
  readonly written: readonly OverlayWriteResult[];
  /** ⭐ 第一個失敗的訊息（給 UI 的一行）；全成功時 `null`。 */
  readonly error: string | null;
}

/**
 * ⭐ 逐份寫進覆蓋層。
 *
 * ⛔ **一份失敗不中斷其餘** —— 而且 `written` 逐份帶著自己的成敗。
 * ⚠️ ⭐ 理由：dev 版是「一串檔案一起寫」，⭐ 而 overlay 是**一份一份 PUT** ——
 * 中途停下來會留下一個「一半舊一半新」的狀態，⛔ 而使用者看不出來停在哪。
 * ⇒ 全部試完、逐份回報，⭐ 讓「哪幾份沒進去」是**看得見的**。
 */
export async function saveDocsToOverlay(
  steps: readonly WritePlanStep[],
): Promise<OverlaySaveOutcome> {
  const written: OverlayWriteResult[] = [];
  for (const s of steps) {
    try {
      await putOverlayDoc(s.collection, s.id, s.doc);
      written.push({ collection: s.collection, id: s.id, reason: s.reason, ok: true, error: null });
    } catch (err) {
      written.push({
        collection: s.collection,
        id: s.id,
        reason: s.reason,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const failed = written.find((w) => !w.ok);
  return { ok: failed === undefined, written, error: failed?.error ?? null };
}

/**
 * ⭐ 新增一份 —— 對覆蓋層而言與「編輯」是**同一個動作**（upsert）。
 *
 * ⚠️ ⭐ 這是與 dev 版真正的語意差：那一邊 `create` 要先確認檔案不存在。
 * ⭐ 覆蓋層沒有「檔案存不存在」這個問題 —— 它疊在出貨樹上，
 * ⛔ 而「這個 id 是新的還是覆寫」由**讀端**（`composeDoc` 的 `source`）回答。
 */
export async function createDocInOverlay(
  collection: EditCollection,
  id: string,
  doc: Record<string, unknown>,
): Promise<OverlayWriteResult> {
  return (await saveDocsToOverlay([{ collection, id, doc, reason: "edit" }])).written[0]!;
}

/**
 * ⭐ 刪除 —— 在覆蓋層是**記一筆 tombstone**，⛔ 不是把出貨樹的檔砍掉。
 * ⇒ 讀端看到 `source: "deleted"`（`overlayCompose.ts`），⭐ 而出貨樹**一個位元組都沒動**。
 */
export async function deleteDocInOverlay(
  collection: EditCollection,
  id: string,
): Promise<OverlayWriteResult> {
  try {
    await deleteOverlayDoc(collection, id);
    return { collection, id, reason: "edit", ok: true, error: null };
  } catch (err) {
    return {
      collection, id, reason: "edit", ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
