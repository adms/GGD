/**
 * ⭐⭐ GH#730 批 C —— **版本／還原**走 durable overlay。
 *
 * ── ⭐ 兩邊的型別語意**不同**，⛔ 而 overlay 那一份更豐富 ──────────────────
 * | dev 的 `BackupEntry` | overlay 的 `OverlayVersion` |
 * |---|---|
 * | `file` · `at`(number) · `bytes` | `hash` · `short` · `at`(ISO) · **`by`** · `generation` · **`summary`** · **`current`** |
 *
 * ⭐ dev 版記的是「**一個檔案的一份副本**」；overlay 記的是「**一次存檔**」——
 * 帶著**是誰**、**改了什麼**、**現在是不是這一版**。
 * ⇒ ⛔ 這個檔**不把 overlay 壓成 BackupEntry** —— 那會丟掉三格資訊，
 *   ⭐ 而那三格正是後台版本頁存在的理由。
 *
 * ── ⛔⛔ `unavailable` 不可以被讀成「沒有歷史」──────────────────────────────
 * `api.ts:338` 逐字：「⚠️ `unavailable` 非空 = 歷史讀不到。⛔ 不可以把它當成「沒有歷史」」。
 * ⭐ 兩者在 UI 上長一樣（都是空清單）就是 fail-open 的靜默版：
 * 使用者會以為「這份文件從來沒被改過」，而真相是「**我讀不到**」。
 * ⇒ ⭐ 這裡把它獨立成一格 `unavailable`，⛔ 呼叫端必須顯示它。
 */
import { getOverlayDocVersions, restoreOverlayDoc } from "./api";
import type { OverlayVersion } from "./api";
import type { EditCollection } from "@ggd/shared/content/editModel";

export interface DocHistory {
  readonly versions: readonly OverlayVersion[];
  /**
   * ⭐ 非 `null` ＝ **歷史讀不到**（⛔ 不是「沒有歷史」）。
   * ⚠️ 呼叫端**必須**把它顯示出來 —— 兩者都畫成空清單就是靜默。
   */
  readonly unavailable: string | null;
}

/** ⭐ 一份文件的版本史。⛔ 讀不到與沒有歷史**分開回報**。 */
export async function docHistory(
  collection: EditCollection,
  id: string,
): Promise<DocHistory> {
  try {
    const list = await getOverlayDocVersions(collection, id);
    return {
      versions: list.entries ?? [],
      unavailable: list.unavailable ? list.unavailable : null,
    };
  } catch (err) {
    // ⭐ 網路/權限失敗也是「讀不到」，⛔ 不是「沒有歷史」。
    return { versions: [], unavailable: err instanceof Error ? err.message : String(err) };
  }
}

export interface RestoreOutcome {
  readonly ok: boolean;
  readonly error: string | null;
}

/**
 * ⭐ 還原**一份文件**到某一版。
 *
 * ⚠️ ⭐ 刻意用 `restoreOverlayDoc`（逐文件）而**不是** `restoreOverlayVersion`（整批）——
 * 後者會把**整個覆蓋層**倒回那一代，⛔ 而使用者在版本頁上點的是**這一份**。
 * ⇒ 兩者語意差一個數量級，而它們在 UI 上都叫「還原」。
 */
export async function restoreDocVersion(
  hash: string,
  collection: EditCollection,
  id: string,
): Promise<RestoreOutcome> {
  try {
    await restoreOverlayDoc(hash, collection, id);
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
