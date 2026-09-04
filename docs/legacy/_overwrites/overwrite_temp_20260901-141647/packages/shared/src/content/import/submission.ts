/**
 * ⭐⭐ GH#908 —— **玩家投稿的一筆紀錄，與它什麼時候看得到**。
 *
 * ── ⭐ 這是大目標的最後一段 ────────────────────────────────────────────
 * owner 的大目標逐字：「**開放讓玩家自己設計 英雄、技能、特效**」。
 * ⇒ ⭐ 編輯器做得出內容之後，⛔ 而它今天**沒有出口** ——
 *   玩家那一層量到：身分 ✅（`internal/auth`）· 審核 ✅ 骨架（`internal/curation`）
 *   · **投稿 ⛔ 零** · **發現 ⛔ 零**。
 *
 * ── ⭐ 而它**不是從零開始**（⛔ 這一段是這個檔存在的理由）──────────────
 * | 已經有的 | 在哪 |
 * |---|---|
 * | 投稿包的格式與驗證 | `parseImportPackage`（GH#327）—— 多餘欄位**說得出名字** |
 * | 內容指紋 | `packageDigest()` —— ⭐ 核准會**隨內容過期** |
 * | 壓縮包安全 | `zipSafety.ts` |
 * | 人審流水線 | `tools/review/` 的核准帳本 |
 * ⇒ ⭐ 這個檔**沒有發明任何東西** —— 它只把它們串成一條「一筆投稿的生命」。
 *
 * ── ⛔⛔ 這個檔最重要的一行是**可見性**，⛔ 不是資料形狀 ──────────────────
 * ⭐ 玩家投稿是這個專案**第一個不可信的內容來源** —— 出貨內容都是我們自己寫的。
 * ⇒ ⭐ `isDiscoverable()` 是那條界線：**只有核准過、而且核准當時的指紋還等於
 *   現在的指紋**才看得到。
 * ⚠️ 少了後半句，一個「先送乾淨的、核准後再換掉內容」的投稿就繞過了整條審核
 *   —— ⭐ 而畫面上完全看不出來。
 */
import { parseImportPackage } from "./packageSchema";
import { packageDigest } from "./digest";
import type { ImportDiagnostic } from "./diagnostics";

/** 一筆投稿走過的三個狀態。⛔ 沒有第四個 —— 「編輯中」不是投稿。 */
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface SubmissionRecord {
  /** 這一筆的 id（由呼叫端給 —— ⛔ 這個模組不產生亂數，`sim` 的純度規矩同理）。 */
  readonly id: string;
  /** 投稿者。⭐ 綁 `internal/auth` 的身分，⛔ 不是一個自由字串的暱稱。 */
  readonly accountId: string;
  /** ⭐ 投稿當下的內容指紋。 */
  readonly digest: string;
  readonly status: SubmissionStatus;
  /**
   * ⭐ **核准當時**的指紋。⚠️ 它與 `digest` 分開存是這個模組的重點：
   * ⛔ 只存 status 的話，「核准後換內容」會靜靜地通過。
   */
  readonly approvedDigest?: string;
  /** 被拒的理由（⭐ HITL 必填 —— owner 2026-08-24：「否決**必填原因**」）。 */
  readonly reason?: string;
}

/** ⭐ 一份投稿包 → 一筆紀錄，或一串**指名欄位**的診斷。 */
export function makeSubmission(
  id: string,
  accountId: string,
  raw: unknown,
): { readonly record: SubmissionRecord | null; readonly diagnostics: readonly ImportDiagnostic[] } {
  const parsed = parseImportPackage(raw);
  if (!parsed.ok || parsed.value === null) return { record: null, diagnostics: parsed.diagnostics };
  // ⛔ 空的 id／帳號一律拒 —— ⭐ 一筆沒有主人的投稿是審核流程的破口。
  if (id.length === 0 || accountId.length === 0) {
    return {
      record: null,
      diagnostics: [
        ...parsed.diagnostics,
        { level: "error", path: id.length === 0 ? "id" : "accountId", message: "投稿必須有 id 與投稿者" },
      ] as readonly ImportDiagnostic[],
    };
  }
  return {
    record: {
      id,
      accountId,
      digest: packageDigest((parsed.value as { manifest?: unknown }).manifest),
      status: "pending",
    },
    diagnostics: parsed.diagnostics,
  };
}

/**
 * ⭐⭐ **玩家看不看得到這一筆** —— 這是這個模組唯一承重的判斷。
 *
 * 兩個條件，⛔ 缺一不可：
 * ① `status === "approved"`
 * ② ⭐ **核准當時的指紋 === 現在的指紋** —— ⛔ 否則「核准後換內容」會通過
 */
export function isDiscoverable(r: SubmissionRecord): boolean {
  if (r.status !== "approved") return false;
  return typeof r.approvedDigest === "string" && r.approvedDigest === r.digest;
}

/** ⭐ 核准 —— **把當下的指紋一起釘住**（⛔ 不是只翻一個 status）。 */
export function approve(r: SubmissionRecord): SubmissionRecord {
  return { ...r, status: "approved", approvedDigest: r.digest };
}

/** ⭐ 否決 —— **理由必填**（owner 2026-08-24：「追加原因的 HITL」）。 */
export function reject(r: SubmissionRecord, reason: string): SubmissionRecord {
  return { ...r, status: "rejected", reason: reason.length > 0 ? reason : "（未填原因）" };
}

/**
 * ⭐ 投稿者換了內容 ⇒ **核准自動失效**（hash 過期制，同 `tools/review/` 的帳本）。
 * ⚠️ 這一支存在的理由：⛔ 沒有它，呼叫端會「順手」只改 `digest` 而留著
 * `approvedDigest`，⭐ 而 `isDiscoverable` 就會放行一份沒有人審過的內容。
 */
export function withNewContent(r: SubmissionRecord, raw: unknown): SubmissionRecord {
  const parsed = parseImportPackage(raw);
  const digest = parsed.ok && parsed.value !== null
    ? packageDigest((parsed.value as { manifest?: unknown }).manifest)
    : r.digest;
  // ⭐ 內容變了 ⇒ 退回 pending 並**丟掉**舊的核准指紋。
  return digest === r.digest ? r : { id: r.id, accountId: r.accountId, digest, status: "pending" };
}
