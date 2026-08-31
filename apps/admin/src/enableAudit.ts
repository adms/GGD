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
