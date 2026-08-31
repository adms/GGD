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
import { validateOverlayDoc, type OverlayValidation } from "./contentOverlay";
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
/**
 * ⭐⭐ GH#730 —— **寫進覆蓋層之前的那一道決定**，抽成純函式。
 *
 * ── 為什麼它必須是一個可以單獨跑的函式 ─────────────────────────────────────
 * `validateOverlayDoc` 從它被寫下的那天起**一個呼叫端都沒有**
 * （2026-08-31 量到：全 repo 只有定義那一行），⭐ 而它的檔頭記著
 * `packages/shared/src/content/overlay.ts` 對外承諾過
 * 「… and **BY THE ADMIN CONSOLE BEFORE IT EVER WRITES**」
 * ⇒ ⛔ 那句話當時就是假的（第一·五守則：說了但不會發生）。
 *
 * ⚠️ 而後台**沒有 React 測試環境**（`apps/admin` 沒有 testing-library）
 * ⇒ 把判斷留在 `.tsx` 裡等於**驗不到**，唯一驗得到的方式是掃原始碼字串（形態⑥）。
 * ⇒ ⭐ 決定住這裡，頁面只呼叫它一行。
 *
 * ── 三種結果，⛔ 不是兩種 ─────────────────────────────────────────────────
 * | 回傳 | 意思 | UI 要做什麼 |
 * |---|---|---|
 * | `{ok:false}` | schema 不過 / id 對不上 / 不是物件 | ⛔ **不要寫**，顯示 `error` |
 * | `{ok:true, validated:false}` | 這個 collection **沒有 schema**（例：手打的 `experiments`） | ⭐ 寫，⛔ 但要把 `reason` **顯示出來** |
 * | `{ok:true, validated:true}` | 驗過了 | 寫 |
 *
 * ⚠️ ⭐ 中間那一格是重點：**靜靜當成通過**與**通過**長得一模一樣
 * （CLAUDE.md：「fail-open 沒錯，**靜默**才是缺陷」）。
 */
export interface OverlayWriteDecision {
  /** 可不可以寫。 */
  readonly write: boolean;
  /** `write:false` 時給 UI 的一行；否則 `null`。 */
  readonly error: string | null;
  /** ⭐ 寫了但**沒驗到**時的理由 —— UI 必須顯示它，⛔ 不可以吞掉。 */
  readonly unvalidatedReason: string | null;
}

export function decideOverlayWrite(
  collection: string,
  id: string,
  doc: unknown,
  validate: (c: string, i: string, d: unknown) => OverlayValidation = validateOverlayDoc,
): OverlayWriteDecision {
  const v = validate(collection, id, doc);
  if (!v.ok) return { write: false, error: v.error, unvalidatedReason: null };
  return {
    write: true,
    error: null,
    unvalidatedReason: v.validated === false ? v.reason : null,
  };
}

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
