/**
 * ⭐⭐ GH#473 —— **「啟用上架」的當下自動跑稽核**。
 *
 * owner 2026-08-18 逐字：
 * > 「你應該是要**設計啟用的時候才做自動跑測試 script**，測試結果再排入是否修理」
 *
 * ── ⭐ 這個檔只做**純函式**那一半，⛔ 不碰 UI 狀態 ──────────────────────────
 * 「這一次**新啟用**了哪些 id」是一個**集合差**，⛔ 不是一個 React 生命週期問題。
 * ⇒ 把它抽出來才測得到；⭐ 而 `CurationPage` 只負責在存檔成功之後叫它。
 *
 * ── ⛔ 為什麼是「新啟用的」而不是「全部啟用的」──────────────────────────────
 * 票文逐字的成本斷言：**「不啟用就不花錢，啟用就一定驗」**。
 * ⭐ 對全部 63 隻上架英雄跑三支稽核，每次存檔都要等；而 owner 改的通常是**一格**。
 * ⚠️ 而「新啟用」必須用**存檔前的伺服器狀態**當基準 —— ⛔ 不是 draft：
 *   draft 在存檔成功之後**已經等於**新狀態，拿它自己減自己永遠是空集合
 *   （⭐ 一個永遠不會叫的閘，失敗形態⑨）。
 */
import type { Kind, WhitelistDoc } from "./curation";

/** 三個集合的 kind（與 `WhitelistDoc` 的鍵一致）。 */
const KINDS: readonly Kind[] = ["champions", "items", "abilities"];

export interface NewlyEnabled {
  readonly kind: Kind;
  readonly ids: readonly string[];
}

/**
 * ⭐ 這一次**新啟用**的 id —— `after` 有而 `before` 沒有的。
 *
 * ⛔ **順序不可以顛倒**：`before` 是**存檔前的伺服器狀態**。
 * ⚠️ 停用（`before` 有而 `after` 沒有）**刻意不算** —— 下架不需要跑「這份內容合不合法」。
 */
export function newlyEnabled(before: WhitelistDoc, after: WhitelistDoc): NewlyEnabled[] {
  const out: NewlyEnabled[] = [];
  for (const kind of KINDS) {
    const had = new Set(before[kind]);
    const ids = after[kind].filter((id) => !had.has(id));
    if (ids.length > 0) out.push({ kind, ids });
  }
  return out;
}

/** 攤平成一串 id（`auditPlan(repoRoot, ids)` 吃的形狀）。 */
export function newlyEnabledIds(before: WhitelistDoc, after: WhitelistDoc): string[] {
  return newlyEnabled(before, after).flatMap((g) => g.ids);
}

/**
 * ⭐ 給人看的一句話。⛔ 空集合回 `null` —— 呼叫端據此**完全不叫稽核**
 * （那就是「不啟用不花錢」的實作，⛔ 不是一句註解）。
 */
export function enableAuditSummary(before: WhitelistDoc, after: WhitelistDoc): string | null {
  const groups = newlyEnabled(before, after);
  if (groups.length === 0) return null;
  const parts = groups.map((g) => `${LABEL[g.kind]} ${g.ids.length}`);
  return `本次新啟用 ${parts.join("、")} —— 已排入稽核待修表`;
}

const LABEL: Record<Kind, string> = {
  champions: "英雄",
  items: "道具",
  abilities: "技能",
};

// ──────────────────────────────────────────────────────────────────────────
// ⭐⭐ GH#473 —— **啟用的當下真的把稽核結果拿回來**
// ──────────────────────────────────────────────────────────────────────────

/** 稽核的一列（`tools/review/enable-audit.mjs` 的 `auditPlan` 產出）。 */
export interface EnableAuditRow {
  readonly id: string;
  readonly kind?: string;
  readonly finding: string;
  readonly severity?: string;
}

/**
 * ⭐ 稽核結果的**三態**，⛔ 不是兩態。
 *
 * ⚠️⚠️ **這是整段的重點**：`/__review` 是 **dev-only** 的 vite middleware
 * （CLAUDE.md GH#794 記過：`/__review` 與 `/__live` 在本機活著而**線上沒有**）。
 * ⇒ ⛔ 在正式後台按下「啟用」時，這個端點會 404。
 *
 * ⭐ 而「稽核跑不到」**必須看起來與「稽核通過」不一樣** ——
 * ⛔ 否則操作者會把一個沒有跑過的稽核讀成一張乾淨的成績單。
 * （CLAUDE.md：「fail-open 沒錯，**靜默**才是缺陷」。）
 */
export type EnableAuditResult =
  /** ⭐ 跑過了，這是結果（`rows` 可能是空的 ＝ 真的沒問題）。 */
  | { readonly state: "ran"; readonly rows: readonly EnableAuditRow[] }
  /** ⛔ 這個環境跑不到（端點不在／不通）—— ⭐ 要**說出來**。 */
  | { readonly state: "unavailable"; readonly why: string }
  /** ⭐ 這一次沒有新啟用任何東西 ⇒ ⛔ 一支稽核都不跑（「不啟用就不花錢」）。 */
  | { readonly state: "skipped" };

/** dev middleware 的端點。⚠️ 正式 build 沒有它 —— 那是刻意的，見上面的三態。 */
export const ENABLE_AUDIT_URL = "/__review/enable-audit";

/**
 * ⭐ 把「這一次新啟用的 id」送去跑稽核。
 *
 * ⚠️ ⭐ 空清單**不打網路**（⛔ 也不回 `ran`）—— 票文逐字的成本斷言
 * 「不啟用就不花錢」。
 */
/**
 * ⭐⭐ GH#473 —— dev 的 `/__review` 不在時的**退路：build 期預算的那一份**。
 *
 * ⛔ 在此之前正式後台按下「啟用」看到的是「⚠️ 稽核沒有跑」。⭐ 那是**誠實的**
 *（三態刻意分開），⛔ 但不是最終狀態 —— ⭐ 而它其實**算得出來**。
 *
 * ⭐ 為什麼不必開一條 platform API：`auditPlan()` 只讀「那個 id 屬於哪個集合」
 * 與「稽核實作檔有沒有匯出進入點」⇒ ⭐ **零個執行期狀態**
 * ⇒ build 的那一刻就完全決定了。⛔ 開一條 API 去算一個常數，
 * 是把靜態檔案偽裝成服務。
 *
 * ⚠️ 產物住 `content/assets/review/`（跟著 `content/` bind-mount）
 * ⇒ ⭐ 正式站**不必重建映像**就拿得到 —— 與 bundle 同一條路。
 *
 * ⚠️ ⭐ 連這一份都拿不到、或裡面沒有這幾個 id 時**仍然回 `unavailable`**
 * —— ⛔ 不可以假裝跑過了。
 */
const PRECOMPUTED_URL = "/content/assets/review/enable-audit.json";

async function fromPrecomputed(
  ids: readonly string[],
  fetchFn: typeof fetch,
  liveWhy: string,
): Promise<EnableAuditResult> {
  try {
    const res = await fetchFn(PRECOMPUTED_URL);
    if (!res.ok) return { state: "unavailable", why: `${liveWhy}；預算檔也回 ${res.status}` };
    const body = (await res.json()) as { rows?: EnableAuditRow[] };
    const want = new Set(ids);
    const rows = (body.rows ?? []).filter((r) => want.has(r.id));
    // ⚠️ ⭐ 預算檔在而這幾個 id 一列都沒有 ⇒ 它們是**新內容**（產物還沒重跑）
    //   ⇒ ⛔ 回「跑過了、零列」會是謊話。
    if (rows.length === 0) {
      return { state: "unavailable", why: `${liveWhy}；預算檔裡沒有這幾個 id（⭐ 內容比產物新）` };
    }
    return { state: "ran", rows };
  } catch {
    return { state: "unavailable", why: `${liveWhy}；預算檔也拿不到` };
  }
}

export async function fetchEnableAudit(
  ids: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<EnableAuditResult> {
  if (ids.length === 0) return { state: "skipped" };
  try {
    const res = await fetchFn(`${ENABLE_AUDIT_URL}?ids=${encodeURIComponent(ids.join(","))}`);
    if (!res.ok) return fromPrecomputed(ids, fetchFn, `稽核端點回 ${res.status}`);
    const body = (await res.json()) as { rows?: EnableAuditRow[] };
    return { state: "ran", rows: body.rows ?? [] };
  } catch (err) {
    return fromPrecomputed(
      ids,
      fetchFn,
      `稽核端點連不上（${err instanceof Error ? err.message : String(err)}）`,
    );
  }
}

/**
 * ⭐ 一行給操作者看的字。
 *
 * ⚠️ ⭐ 三態各有**不同的字**，⛔ 而 `unavailable` 那一行刻意用 `⚠️` 開頭：
 * 它與「⭐ 稽核通過」在畫面上**必須長得不一樣**。
 */
export function enableAuditResultText(r: EnableAuditResult): string {
  if (r.state === "skipped") return "";
  if (r.state === "unavailable") return `　⚠️ **稽核沒有跑**：${r.why}`;
  if (r.rows.length === 0) return "　⭐ 稽核通過（0 個發現）";
  const head = r.rows.slice(0, 5).map((x) => `${x.id}：${x.finding}`).join("；");
  const more = r.rows.length > 5 ? `⋯共 ${r.rows.length} 項` : "";
  return `　⚠️ 稽核 ${r.rows.length} 個發現 —— ${head}${more}`;
}
