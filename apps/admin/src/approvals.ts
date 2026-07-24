/**
 * 帳號審核 (private-deploy account approval, task #126) — pure logic.
 *
 * THE GATE IS THE SERVER. A registration on the family deploy lands as
 * `pending`; `auth.PlayableOnly` re-reads the durable account on every room
 * route and on the lobby WebSocket handshake, so an un-approved person cannot
 * reach a match no matter what the console shows. This module is the console
 * half — classify the state, name it in the operator's language, and decide
 * which actions a row admits. Side-effect-free so it unit-tests without React
 * or the network; ui/ApprovalsPage.tsx is presentation + wiring only.
 *
 * WHY IT EXISTS AT ALL: the backend (POST /admin/accounts/{id}/approve|deny,
 * GET /admin/accounts/pending) shipped complete and tested with NO button
 * anywhere, and `AccountRow` did not even carry `status` — so a relative who
 * registered was invisible in the players list and could only be let in with a
 * hand-rolled bearer-token curl. Two rules follow from that, and both are
 * encoded here rather than left to each page:
 *
 *   1. EVERY list of accounts shows approval state. `accountBadges()` is the
 *      single renderer; a page that lists accounts calls it and cannot
 *      accidentally omit the column, because omitting it is exactly how this
 *      was missed for a whole release.
 *   2. NO STATE IS BLANK. approved, denied, grandfathered and "the server does
 *      not report this" each get their own visible badge. A blank cell reads as
 *      "fine" and three of those four are not.
 *
 * The owner uses this ON A PHONE while a relative waits, so: approving is ONE
 * tap with no confirm (it is the happy path and it is reversible), and denying
 * confirms — because 婉拒 and 停權 are different decisions and picking the wrong
 * one is the mistake worth one extra tap. See DENY_VS_BAN.
 */

/**
 * The approval state as the CONSOLE sees it — five cases, not three.
 *
 * `legacy` and `unknown` are separate on purpose: "the server says this account
 * predates the gate" and "the server never mentioned approval" look identical
 * in JSON (`""` vs absent) and mean completely different things to an operator
 * staring at a deploy wondering why nobody is queued.
 */
export type ApprovalState = "pending" | "approved" | "denied" | "legacy" | "unknown";

/** The subset of an account row this module reasons about. */
export interface ApprovableAccount {
  status?: string;
  approved?: boolean;
  banned?: boolean;
}

/** Badge tone names, mapped onto the console theme by the pages. */
export type Tone = "ok" | "warn" | "dim" | "danger" | "accent";

export interface StateBadge {
  text: string;
  tone: Tone;
  /** leading glyph — the thing that survives being glanced at on a phone */
  emoji: string;
  /** long-form explanation, used as the title/tooltip and in the detail drawer */
  hint: string;
}

/**
 * Classify one row. `undefined` status means the platform build did not report
 * approval at all — reported as `unknown`, never quietly as approved.
 */
export function approvalState(row: ApprovableAccount): ApprovalState {
  if (typeof row.status !== "string") return "unknown";
  switch (row.status) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    case "":
      return "legacy";
    default:
      // A status the server invented and this console has never heard of. Say
      // so rather than guessing — guessing here would let somebody in.
      return "unknown";
  }
}

const STATE_BADGES: Record<ApprovalState, StateBadge> = {
  pending: {
    text: "待審核",
    tone: "warn",
    emoji: "⏳",
    hint: "已註冊，還沒被放行。這個人現在進不了對戰，正在等你按「通過」。",
  },
  approved: {
    text: "已通過",
    tone: "ok",
    emoji: "✓",
    hint: "審核通過，可以正常登入遊戲。",
  },
  denied: {
    text: "已婉拒",
    tone: "danger",
    emoji: "✕",
    hint: "註冊被婉拒，帳號還在但進不來。想反悔的話按「通過」就可以放行。",
  },
  legacy: {
    text: "免審核",
    tone: "dim",
    emoji: "•",
    hint: "審核機制上線前就存在的舊帳號，視同已通過（伺服器端的 grandfather 規則）。",
  },
  unknown: {
    text: "狀態未知",
    tone: "dim",
    emoji: "？",
    hint: "平台沒有回報審核狀態 — 後端版本可能比這個主控台舊。請不要當成「已通過」。",
  },
};

/** The badge for one approval state. */
export function stateBadge(state: ApprovalState): StateBadge {
  return STATE_BADGES[state];
}

/**
 * EVERY badge one account row should show, in render order.
 *
 * Approval and ban are INDEPENDENT axes on the platform — an approved account
 * can be banned, and a banned account keeps its approval state — so this
 * returns up to two badges rather than folding them into one status word. That
 * folding is what made 待審核 invisible: the players table had a single
 * "Status" column that only ever said banned/active.
 */
export function accountBadges(row: ApprovableAccount): StateBadge[] {
  const out: StateBadge[] = [stateBadge(approvalState(row))];
  if (row.banned) {
    out.push({
      text: "已停權",
      tone: "danger",
      emoji: "⛔",
      hint: "已通過審核但被停權（違規處分），無法登入。與「婉拒」不同 — 見停權說明。",
    });
  }
  return out;
}

/**
 * 婉拒 vs 停權 — the distinction the console must make visible, because the two
 * buttons sit next to each other and do different things.
 *
 * They are separate mechanisms on the platform: deny writes the #126 approval
 * status, ban writes `banned` + a reason shown to the player. Both revoke live
 * sessions. Mixing them up is not fatal (both are reversible) but it records
 * the wrong thing in the audit log, and "為什麼表哥被停權" is a conversation
 * nobody wants to have about a mis-click.
 */
export const DENY_VS_BAN = {
  deny: {
    label: "婉拒",
    what: "婉拒註冊",
    who: "不認識 / 不該進來的註冊",
    effect: "帳號留著但進不來，隨時可以再按「通過」放行。記在稽核紀錄的 approval_denied。",
  },
  ban: {
    label: "停權",
    what: "停權處分",
    who: "已經放行的玩家，因為違規要擋下來",
    effect: "帳號被停權並顯示理由給對方，用「解除停權」還原。記在稽核紀錄的 ban。",
  },
} as const;

/**
 * Can this row be approved? Pending and denied both can (approving a denied
 * account is how the owner reverses himself). Already-approved cannot, and
 * neither can a state we could not read — offering a button whose effect we
 * cannot predict is worse than offering none.
 */
export function canApprove(row: ApprovableAccount): boolean {
  const s = approvalState(row);
  return s === "pending" || s === "denied";
}

/**
 * Can this row be denied? Anything that is not already denied — including a
 * grandfathered account, which is precisely the case where the owner may want
 * to take access away from someone who was let in before the gate existed.
 */
export function canDeny(row: ApprovableAccount): boolean {
  const s = approvalState(row);
  return s === "pending" || s === "approved" || s === "legacy";
}

/** Rows that are waiting on the operator right now. */
export function pendingRows<T extends ApprovableAccount>(rows: T[]): T[] {
  return rows.filter((r) => approvalState(r) === "pending");
}

/** Headline counts for a list header. */
export function summarizeApprovals(rows: ApprovableAccount[]): {
  pending: number;
  approved: number;
  denied: number;
  other: number;
} {
  const out = { pending: 0, approved: 0, denied: 0, other: 0 };
  for (const r of rows) {
    const s = approvalState(r);
    if (s === "pending") out.pending++;
    else if (s === "approved") out.approved++;
    else if (s === "denied") out.denied++;
    else out.other++;
  }
  return out;
}

/**
 * 等了多久 — how long this person has been staring at the "waiting for approval"
 * screen. The queue is served oldest-first by the platform precisely so this
 * number is the operator's sort order; showing it makes that ordering legible
 * instead of arbitrary.
 */
export function waitedText(createdAt: string, now: Date = new Date()): string {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return "—";
  const ms = now.getTime() - t;
  if (ms < 0) return "剛剛";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "剛剛註冊";
  if (mins < 60) return `等了 ${mins} 分鐘`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `等了 ${hours} 小時`;
  return `等了 ${Math.floor(hours / 24)} 天`;
}

/** Short local date-time, matching the 邀請碼 page's column formatting. */
export function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The queue-count line for the nav badge / banner. Empty string when idle. */
export function pendingBannerText(count: number): string {
  if (count <= 0) return "";
  return `${count} 個帳號在等你審核`;
}

/** Status filter values the players list offers (server-side ?status=). */
export const STATUS_FILTERS: readonly { value: string; label: string }[] = [
  { value: "", label: "全部" },
  { value: "pending", label: "待審核" },
  { value: "approved", label: "已通過" },
  { value: "denied", label: "已婉拒" },
];
