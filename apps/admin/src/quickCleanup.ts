/**
 * Quick Approval 第②區 — 清理／移除 (GH#495). Pure logic, no React, no network.
 *
 * owner 2026-08-21:
 *   「清理變身態、通過邀請碼審查、上下架角色道具 等常用批核，
 *     應該都要在 [Quick Approval] 這邊簡易一鍵批核通過吧？」
 *
 * ---------------------------------------------------------------------------
 * ⭐ WHY A SECOND ZONE INSTEAD OF MORE CHECKBOXES IN THE FIRST ONE
 * ---------------------------------------------------------------------------
 * QuickApprovalPage has carried one promise since #242, printed on the page and
 * true of every request it sends:
 *
 *     「這一頁只會『加入』，永遠不會替你移除任何已啟用的內容」
 *
 * That promise is what makes 一鍵送出確認 safe to press without reading: the
 * worst case of a mis-click is an extra hero on the select screen. ⛔ Relaxing
 * it so that 清理變身態 / 下架 could ride along in the same batch would make the
 * one-click button able to DELETE things the family is currently using, and
 * nothing on screen would look different.
 *
 * So the removals get their own zone with their own contract:
 *
 *   ① 加入   union-only          → one click, no second step
 *   ② 移除   touches live state  → PREVIEW every item by name+id, then confirm,
 *                                  then hand back a one-key 還原
 *
 * ---------------------------------------------------------------------------
 * ⭐ THE PREVIEW IS THE PAYLOAD, NOT A COURTESY
 * ---------------------------------------------------------------------------
 * `cleanupWriteRequest()` and `undoRequest()` take a `CleanupPreview` and can be
 * built from NOTHING ELSE — the ids that get written are literally the ids the
 * operator just read. A "preview" that merely rendered a list while the confirm
 * button recomputed its own set would be the failure this design exists to stop:
 * the list on screen and the list in the request could differ and every test of
 * each half separately would still be green (CLAUDE.md 失敗形態 ⑤).
 *
 * `confirmGate(null)` is therefore a hard refusal, not a hint.
 */
import type { Page } from "./store";
import type { BulkRequest, Kind } from "./curation";
import type { EvictTransformedResponse } from "./api";

/** Which removal this is. Each maps to exactly one write path. */
export type CleanupKind =
  /** 變身態 — the platform re-derives the list and takes an undo snapshot */
  | "transform"
  /** live champions that appear in no version-controlled roster */
  | "undeclared-champions"
  /** live items that appear in no version-controlled roster */
  | "undeclared-items";

/** One thing the confirm would remove, named so a human can agree to it. */
export interface CleanupItem {
  id: string;
  /** display name, or the id when no content doc hydrated */
  name: string;
}

export interface CleanupPreview {
  kind: CleanupKind;
  /** ⭐ THE PAYLOAD. Everything written is derived from this array. */
  items: CleanupItem[];
  /** one sentence naming the consequence, with live numbers in it */
  headline: string;
  /** reconciliation warnings, gate state, ids this action deliberately skips */
  notes: string[];
  /** non-null ⇒ the confirm is refused, and this is the reason to print */
  blocked: string | null;
  /** enabled count before / after, for the headline and the operator's sanity */
  before: number;
  after: number;
}

/** The whitelist kind each cleanup writes, or null when it has its own endpoint. */
const WRITE_KIND: Record<CleanupKind, Kind | null> = {
  transform: null,
  "undeclared-champions": "champions",
  "undeclared-items": "items",
};

/** Human label per cleanup — shared by the card title and the result line. */
export const CLEANUP_LABEL: Record<CleanupKind, string> = {
  transform: "清理變身態",
  "undeclared-champions": "下架未經名單審查的英雄",
  "undeclared-items": "下架未經名單審查的道具",
};

// ------------------------------------------------------------- 變身態 ------

/**
 * What THIS console derived from `/content/`, for the pairing check.
 *
 * `ok: false` means the champion docs could not be read at all — in which case
 * an empty `liveAlternateIds` says nothing, and claiming a mismatch off it would
 * be crying wolf. The reconciliation is then skipped and SAID.
 */
export interface DerivedAlternates {
  ok: boolean;
  liveAlternateIds: readonly string[];
}

/**
 * Turn the platform's dry run into a preview.
 *
 * ⭐ The ids come from the SERVER's own derivation (it re-runs the same rule
 * under its mutex when the confirm lands), and this console's independently
 * derived list is used ONLY to disagree — because the platform's transform gate
 * is fail-open: a platform that cannot read `content/champions/` evicts nothing
 * and its dry run is EMPTY, which is byte-identical to 「已經乾淨了」.
 */
export function transformPreview(
  server: EvictTransformedResponse,
  derived: DerivedAlternates,
): CleanupPreview {
  const items = server.remove.map((id) => ({ id, name: server.names[id] || id }));
  const notes: string[] = [];

  if (!server.armed) {
    notes.push(
      "⚠ 平台讀不到 content/champions/，伺服器端的變身態閘是**啞的**（它一個都不會擋，" +
        "而且它的預覽是空的 — 空的預覽跟「已經乾淨了」長得一模一樣）。請確認 platform 容器的 CONTENT_DIR 掛載。",
    );
  }
  if (!server.gateEnabled) {
    notes.push(
      "註：平台的自動剔除開關 GGD_CURATION_TRANSFORM_GATE 目前是關的 — " +
        "這顆按鈕仍然清得掉存量，但下一次有人把變身態存回去時不會被自動擋下。",
    );
  }
  if (!derived.ok) {
    notes.push(
      "註：這一頁讀不到 /content/champions/ 的英雄文件，所以無法用第二條路核對平台算出來的名單。",
    );
  } else {
    const mine = [...derived.liveAlternateIds].sort().join(",");
    const theirs = [...server.remove].sort().join(",");
    if (mine !== theirs) {
      notes.push(
        `⚠ 後台與平台算出來的變身態名單不一致：後台 ${derived.liveAlternateIds.length} 個（${mine || "無"}），` +
          `平台 ${server.remove.length} 個（${theirs || "無"}）。` +
          "兩邊讀的是同一棵內容樹的不同副本 — 通常代表映像與 content/ 版本不同步，請先確認部署。",
      );
    }
  }

  return {
    kind: "transform",
    items,
    headline:
      `這會從白名單移除 ${items.length} 個變身態：啟用英雄 ${server.before} → ${server.after}。` +
      `⭐ 本體（transform.role === "base"）不受影響，變身照舊由技能觸發。` +
      `平台的內容樹目前共宣告 ${server.indexed} 個變身態。`,
    notes,
    blocked:
      items.length === 0
        ? "白名單上沒有變身態 — 不需要清理。"
        : server.after <= 0
          ? "⛔ 清下去白名單會變成空的（選人畫面整個空掉）。這幾乎一定是 transform.role 標錯了，不是白名單髒了。"
          : null,
    before: server.before,
    after: server.after,
  };
}

// ------------------------------------------------------------ 下架 ---------

/**
 * A plain disable of ids this console already knows about (the 未經名單審查 rows).
 *
 * ⛔ No server dry run exists for this one, so the floor is enforced here: a
 * disable that would empty the champion whitelist is refused rather than
 * previewed, for the same reason the platform refuses `would_empty_whitelist`.
 */
export function disablePreview(
  kind: Exclude<CleanupKind, "transform">,
  items: readonly CleanupItem[],
  before: number,
  extraNotes: readonly string[] = [],
): CleanupPreview {
  const list = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const after = before - list.length;
  const what = kind === "undeclared-champions" ? "英雄" : "道具";
  return {
    kind,
    items: list,
    headline:
      `這會從白名單移除 ${list.length} 個${what}：啟用${what} ${before} → ${after}。` +
      `它們都是「已經開放中、但不在版本控管的開放名單（starter.go）裡」的 ${what} — ` +
      "移除之後玩家立刻看不到（進行中的對戰不受影響）。",
    notes: [...extraNotes],
    blocked:
      list.length === 0
        ? `沒有未經名單審查的${what} — 不需要下架。`
        : kind === "undeclared-champions" && after <= 0
          ? "⛔ 下架下去白名單就沒有任何英雄了（選人畫面整個空掉）。請改到「內容白名單」逐一處理。"
          : null,
    before,
    after,
  };
}

// -------------------------------------------------------------- the gate ---

export interface ConfirmGate {
  allowed: boolean;
  /** why not, when `allowed` is false — always a sentence, never "" */
  reason: string;
}

/**
 * ⭐ THE GUARD OF THIS TICKET. Nothing in 第②區 may be written without a preview
 * the operator has seen. `null` is not "not loaded yet" — it is "you have not
 * looked", and it is refused with the same weight as a blocked plan.
 */
export function confirmGate(preview: CleanupPreview | null): ConfirmGate {
  if (preview === null) {
    return {
      allowed: false,
      reason: "⛔ 還沒預覽 — 這一區的每一個移除動作都必須先逐項看過（名字 + id）才送得出去。",
    };
  }
  if (preview.blocked !== null) return { allowed: false, reason: preview.blocked };
  if (preview.items.length === 0) {
    return { allowed: false, reason: "預覽是空的 — 沒有東西要移除。" };
  }
  return { allowed: true, reason: "" };
}

/**
 * The write for a previewed cleanup, built ONLY from the previewed items.
 *
 * Returns null for `transform`: that one goes through
 * POST /curation/whitelist/evict-transformed, where the platform re-derives the
 * ids itself and takes an undo snapshot — the console must never send ids there,
 * or a stale console could delete a champion the platform does not agree is a
 * 變身態.
 */
export function cleanupWriteRequest(preview: CleanupPreview): BulkRequest | null {
  const kind = WRITE_KIND[preview.kind];
  if (kind === null) return null;
  return { kind, enable: [], disable: preview.items.map((i) => i.id) };
}

/**
 * The ONE-KEY 還原 for a previewed cleanup: put exactly those ids back.
 *
 * Whitelist membership is a SET, so re-enabling the same ids restores the
 * previous state exactly — this is a real undo, not an approximation. Null for
 * `transform`, whose undo is the server-side snapshot id instead.
 */
export function undoRequest(preview: CleanupPreview): BulkRequest | null {
  const kind = WRITE_KIND[preview.kind];
  if (kind === null) return null;
  return { kind, enable: preview.items.map((i) => i.id), disable: [] };
}

/** The confirm button's label — the count is part of the consent. */
export function confirmLabel(preview: CleanupPreview): string {
  return `確認移除這 ${preview.items.length} 個`;
}

// ------------------------------------------- 其他只有你能按的動作（盤點）----

/**
 * ⭐ GH#495 item 4: the owner-only actions that still live on their own page.
 *
 * WHAT THIS IS AND IS NOT. It is a SIGNPOST list — page + what only the owner
 * can press there. It is deliberately NOT a list of things Quick Approval can
 * do: a stale entry here can only cost a shortcut, never cause a wrong write.
 * The `page` field is typed `Page`, so a route that gets renamed or deleted
 * fails the type check rather than rendering a dead button.
 *
 * `covered: true` means Quick Approval now does that action itself, and the row
 * is kept so the answer to 「那個按鈕跑去哪了」 is on screen instead of in a
 * commit message.
 */
export interface OwnerOnlyAction {
  page: Page;
  /** the console page's own name */
  where: string;
  /** the action, in the words printed on its button */
  action: string;
  /** one line: what pressing it does that only the owner may decide */
  what: string;
  /** true ⇒ Quick Approval covers it (zone ① or ②) */
  covered: boolean;
}

export const OWNER_ONLY_ACTIONS: readonly OwnerOnlyAction[] = [
  {
    page: "approvals",
    where: "帳號審核",
    action: "通過 / 婉拒",
    what: "註冊後停在等待畫面的家人 — 通過才進得了大廳。",
    covered: true,
  },
  {
    page: "curation",
    where: "內容白名單",
    action: "上架 / 下架 / 清理變身態",
    what: "誰選得到哪個英雄、商店賣哪些道具。",
    covered: true,
  },
  {
    page: "invites",
    where: "邀請碼",
    action: "產生 / 撤銷邀請碼",
    what: "沒有可用的邀請碼，任何人都註冊不了（/auth/register 會拒絕）。",
    covered: false,
  },
  {
    page: "players",
    where: "玩家",
    action: "停權 / 解除停權 · 調整 MCoin / MMR",
    what: "停權與婉拒是兩件事，稽核紀錄也不同 — 逐人決定，沒有批次語意。",
    covered: false,
  },
  {
    page: "curation",
    where: "內容白名單 · 危險操作",
    action: "回到原廠設定 / 還原快照",
    what: "整份白名單換掉 — 這一頁的每一個 還原點 就是被它讀走的。",
    covered: false,
  },
  {
    page: "contentOverlay",
    where: "內容覆蓋層",
    action: "寫入 / 還原覆蓋層文件",
    what: "線上唯一能改內容的門；一份壞文件會讓整棵內容樹載入失敗。",
    covered: false,
  },
  {
    page: "mcoinGrant",
    where: "MCoin 發放",
    action: "批次發放 / 全服發放",
    what: "直接改玩家錢包餘額，沒有還原點。",
    covered: false,
  },
  {
    page: "announcements",
    where: "公告",
    action: "發布 / 刪除公告",
    what: "大廳上所有人都會看到的文字。",
    covered: false,
  },
  {
    page: "dataMigration",
    where: "資料搬遷",
    action: "匯出 / 匯入 / 刪除備份",
    what: "整台機器的帳號與存檔 — 需要再輸入一次密碼。",
    covered: false,
  },
];
