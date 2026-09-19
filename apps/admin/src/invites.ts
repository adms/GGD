/**
 * 邀請碼 (registration invite codes, task #174) — pure logic.
 *
 * The platform is the gate: `POST /auth/register` refuses a registration that
 * does not burn a valid code. This module is the console half — parse/validate
 * the mint form, normalise the server payload, and build the strings the owner
 * copies. It is deliberately side-effect-free so it can be unit-tested without
 * React or the network; ui/InvitesPage.tsx is presentation + wiring only.
 *
 * The owner will use this page ON A PHONE while a family member is on the line
 * with him, so two things drive the design: minting is ONE action (備註 →
 * 產生), and everything he needs to send is one tap away — the bare code, or a
 * ready-to-paste 邀請訊息.
 */

/** Lifecycle status as the server reports it (`effectiveStatus`). */
export type InviteStatus = "active" | "redeemed" | "revoked" | "expired";

/** One invite code row, mirroring invite.Row on the platform. */
export interface InviteRow {
  code: string;
  note: string;
  status: string;
  effectiveStatus: InviteStatus;
  /** "admin" (operator-minted) or "referral" (#203 player code) — the 由誰產生 column. */
  source: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  redeemedBy: string;
  redeemedUsername: string;
  redeemedAt: string;
  revokedBy: string;
  revokedAt: string;
}

/** Server-owned limits, shipped with the list so the form cannot offer a value the validator refuses. */
export interface InviteLimits {
  maxNoteRunes: number;
  maxBatch: number;
  defaultTtlDays: number;
  minTtlDays: number;
  maxTtlDays: number;
}

/**
 * 註冊邀請碼：必填／選填 (GH#1274).
 *
 * owner 2026-09-15:
 *
 * > 「推薦碼變成選項不需讓玩家也可以直接註冊，但是後台還是要批核
 * >  (但新帳號使用推薦碼後還是可以讓介紹人自動審批過) 這個變成後台選項可以切換」
 *
 * Two named values rather than a boolean, because the server stores these exact
 * two strings — one vocabulary end to end, and room for a third mode later
 * without changing the field's type. See apps/platform/internal/invite/policy.go.
 */
export type InviteCodeMode = "required" | "optional";

export const INVITE_CODE_MODES: readonly InviteCodeMode[] = ["required", "optional"];

/**
 * The SHIPPED default, mirrored from invite.DefaultCodeMode.
 *
 * It exists so the page can render before the first response lands without
 * inventing an answer. It is NOT the source of truth: every response carries
 * `policyDefault` from the server, and the page renders what the SERVER said,
 * so a change on the Go side cannot leave this file quietly advertising a
 * default nobody runs.
 */
export const SHIPPED_INVITE_CODE_MODE: InviteCodeMode = "optional";

export interface InvitePolicy {
  /** 必填 or 選填, as stored — or the compiled default when never saved. */
  inviteCode: InviteCodeMode;
  updatedBy: string;
  updatedAt: string;
}

export interface InvitePayload {
  invites: InviteRow[];
  limits: InviteLimits;
  /** present only on a mint response: the codes just created */
  minted: InviteRow[];
  /** GH#1274 必填／選填, carried on EVERY response from this surface, so the
   * switch and the code list can never be repainted out of step. */
  policy: InvitePolicy;
  /** false ⇒ nobody has ever saved it; the page says「尚未設定（使用內建預設值）」. */
  policyStored: boolean;
  /** the server's OWN compiled default, for the 還原預設 affordance. */
  policyDefault: InviteCodeMode;
}

export const FALLBACK_LIMITS: InviteLimits = {
  maxNoteRunes: 40,
  maxBatch: 50,
  defaultTtlDays: 14,
  minTtlDays: 1,
  maxTtlDays: 365,
};

/** The 有效天數 choices the page offers. Any value in range is accepted server-side. */
export const TTL_CHOICES = [7, 14, 30] as const;

/** The 組數 quick picks — one relative, a household, the whole family. */
export const COUNT_CHOICES = [1, 3, 6, 12] as const;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const STATUSES: ReadonlySet<string> = new Set(["active", "redeemed", "revoked", "expired"]);

function normalizeRow(raw: unknown): InviteRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const eff = str(r.effectiveStatus) || str(r.status);
  return {
    code: str(r.code),
    note: str(r.note),
    status: str(r.status),
    effectiveStatus: (STATUSES.has(eff) ? eff : "active") as InviteStatus,
    source: str(r.source),
    createdBy: str(r.createdBy),
    createdAt: str(r.createdAt),
    expiresAt: str(r.expiresAt),
    redeemedBy: str(r.redeemedBy),
    redeemedUsername: str(r.redeemedUsername),
    redeemedAt: str(r.redeemedAt),
    revokedBy: str(r.revokedBy),
    revokedAt: str(r.revokedAt),
  };
}

function mode(v: unknown, fallback: InviteCodeMode): InviteCodeMode {
  return v === "required" || v === "optional" ? v : fallback;
}

/** Accept the list, mint, revoke and policy envelopes uniformly. */
export function normalizeInvitePayload(raw: unknown): InvitePayload {
  const body = (raw ?? {}) as Record<string, unknown>;
  const lim = (body.limits ?? {}) as Record<string, unknown>;
  const list = Array.isArray(body.invites) ? body.invites : [];
  const minted = Array.isArray(body.minted) ? body.minted : [];
  const pol = (body.policy ?? {}) as Record<string, unknown>;
  // ⚠️ THE FALLBACK HERE IS 必填, NOT the shipped default. An unparseable
  // response must make the page say the STRICTER thing: a console that renders
  // 「選填」 because it could not read the answer would tell the owner
  // registration is open when it may not be — and the inverse mistake is
  // merely a page that looks out of date. Same fail-closed direction the server
  // takes when it cannot read the document.
  const fallbackMode: InviteCodeMode = "required";
  return {
    invites: list.map(normalizeRow).filter((r) => r.code !== ""),
    minted: minted.map(normalizeRow).filter((r) => r.code !== ""),
    limits: {
      maxNoteRunes: num(lim.maxNoteRunes, FALLBACK_LIMITS.maxNoteRunes),
      maxBatch: num(lim.maxBatch, FALLBACK_LIMITS.maxBatch),
      defaultTtlDays: num(lim.defaultTtlDays, FALLBACK_LIMITS.defaultTtlDays),
      minTtlDays: num(lim.minTtlDays, FALLBACK_LIMITS.minTtlDays),
      maxTtlDays: num(lim.maxTtlDays, FALLBACK_LIMITS.maxTtlDays),
    },
    policy: {
      inviteCode: mode(pol.inviteCode, fallbackMode),
      updatedBy: str(pol.updatedBy),
      updatedAt: str(pol.updatedAt),
    },
    policyStored: body.policyStored === true,
    policyDefault: mode(body.policyDefault, SHIPPED_INVITE_CODE_MODE),
  };
}

/**
 * The console copy for one mode — what it DOES and what it COSTS.
 *
 * 守則第一守則：「說明文字要寫它影響什麼，不是複述欄位名」。The cost line on
 * 選填 is not decoration: the invite gate is also the first thing that stops a
 * stranger probing whether a username is registered (GH#179), and the owner
 * cannot weigh that trade if the page does not say it.
 */
export function describeInviteMode(m: InviteCodeMode): {
  label: string;
  what: string;
  cost: string;
} {
  if (m === "required") {
    return {
      label: "必填",
      what: "一定要有邀請碼才能註冊；沒填會被伺服器擋下來。",
      cost: "家人要先跟你要一組碼；陌生人連「這個帳號存不存在」都問不出來。",
    };
  }
  return {
    label: "選填",
    what: "沒有邀請碼也可以註冊，但帳號一樣會停在「待審」，要你在後台批准才能玩。用了別人的推薦碼一樣會自動批准介紹人。",
    cost: "陌生人可以試出某個帳號名或 email 有沒有被註冊過（不會拿到密碼或資料）。待審人數上限與註冊速率限制是這件事的煞車；想關掉就切回「必填」，存檔後下一個註冊就生效。",
  };
}

/**
 * One line summarising where the current mode came from — 「尚未設定」 vs
 * 「誰在什麼時候改的」. The owner's first question on this page after「現在
 * 是哪一種」 is「這是我設的嗎」.
 */
export function inviteModeOrigin(p: InvitePayload): string {
  if (!p.policyStored) {
    return `尚未設定（使用內建預設值：${describeInviteMode(p.policyDefault).label}）`;
  }
  const who = p.policy.updatedBy || "（不明）";
  const when = p.policy.updatedAt ? shortTime(p.policy.updatedAt) : "—";
  return `由 ${who} 於 ${when} 設定`;
}

/** Badge copy + tone per status. `tone` maps onto the console's theme colours. */
export function statusLabel(s: InviteStatus): { text: string; tone: "ok" | "warn" | "dim" | "danger" } {
  switch (s) {
    case "active":
      return { text: "未使用", tone: "ok" };
    case "redeemed":
      return { text: "已使用", tone: "dim" };
    case "expired":
      return { text: "已過期", tone: "warn" };
    case "revoked":
      return { text: "已撤銷", tone: "danger" };
  }
}

/** A code can only be revoked while it has not been used. */
export function canRevoke(row: InviteRow): boolean {
  return row.effectiveStatus === "active" || row.effectiveStatus === "expired";
}

/** 剩 N 天 / 今天到期 / 已過期 — the owner's actual question about a code. */
export function expiryText(expiresAt: string, now: Date = new Date()): string {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return "—";
  const ms = t - now.getTime();
  if (ms <= 0) return "已過期";
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "今天到期";
  return `剩 ${days} 天`;
}

/** Short local date for the 建立 / 使用 columns. */
export function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The ready-to-paste invite message. This is the thing the owner actually sends
 * in LINE, so it carries what a family member needs and nothing else: where to
 * go, the code, and how long it lasts.
 */
export function inviteMessage(row: InviteRow, url: string): string {
  return [
    "【去死團的逆襲】內測邀請",
    `註冊網址：${url}`,
    `邀請碼：${row.code}`,
    `有效期限：${expiryText(row.expiresAt)}（一組只能用一次）`,
    "註冊時把邀請碼填進「邀請碼」欄位就可以了。",
  ].join("\n");
}

/** Raw mint-form fields, straight off the inputs. */
export interface MintInput {
  note: string;
  count: number;
  ttlDays: number;
}

export interface MintParsed {
  note: string;
  count: number;
  ttlDays: number;
}

export type MintParse = { ok: true; value: MintParsed } | { ok: false; error: string };

/** Validate the mint form against the SERVER's limits (never a local copy). */
export function parseMint(input: MintInput, limits: InviteLimits): MintParse {
  const note = input.note.trim();
  if (note === "") return { ok: false, error: "請先填備註：這組邀請碼要給誰（例如「媽媽」）" };
  if ([...note].length > limits.maxNoteRunes) {
    return { ok: false, error: `備註最多 ${limits.maxNoteRunes} 個字` };
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > limits.maxBatch) {
    return { ok: false, error: `組數必須介於 1 到 ${limits.maxBatch}` };
  }
  if (!Number.isInteger(input.ttlDays) || input.ttlDays < limits.minTtlDays || input.ttlDays > limits.maxTtlDays) {
    return { ok: false, error: `有效天數必須介於 ${limits.minTtlDays} 到 ${limits.maxTtlDays} 天` };
  }
  return { ok: true, value: { note, count: input.count, ttlDays: input.ttlDays } };
}

// ---- 來源 (#246) --------------------------------------------------------------
//
// WHY THIS EXISTS. Since #203 every registration auto-mints that account's own
// personal referral code, and List() returns those alongside the operator's own
// — newest first, interleaved, with no grouping. So the table the owner opens to
// find「我發給媽媽的那組」 grows by one row per signup that he never created and
// does not manage, and on a 35-account deploy those are the MAJORITY of rows.
// That is the real reason the page reads as cramped; CSS alone could not fix it.
//
// The fix is a VIEW filter, not a content cut (「不要減少資訊」): every row is
// still one tap away, the header counts both kinds, and the filtered-out count
// is stated out loud rather than silently dropped.

/** The 來源 segment control. Order matters — this is the tab order. */
export const SOURCE_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "admin", label: "後台發出" },
  { value: "referral", label: "玩家推薦" },
  { value: "", label: "全部" },
];

/**
 * Filter by source. An empty filter means everything.
 *
 * A row whose `source` is missing counts as `admin`, deliberately: only the
 * referral path is explicitly tagged (`srcOf` on the platform derives it from a
 * non-empty referrerId), so an untagged row from an older server build is an
 * operator-minted code — and defaulting the unknown case INTO the owner's own
 * view is the direction that cannot hide his codes from him.
 */
export function filterBySource(rows: InviteRow[], source: string): InviteRow[] {
  if (source === "") return rows;
  if (source === "referral") return rows.filter((r) => r.source === "referral");
  return rows.filter((r) => r.source !== "referral");
}

/**
 * Headline counts for the panel header.
 *
 * `admin` / `referral` were ADDED in #246 rather than replacing anything, so the
 * header can state how much of the list is referral traffic — which is the one
 * number that tells the owner whether the filter is hiding anything he cares
 * about. Adding information, not removing it.
 */
export function summarize(rows: InviteRow[]): {
  active: number;
  redeemed: number;
  dead: number;
  admin: number;
  referral: number;
} {
  let active = 0;
  let redeemed = 0;
  let dead = 0;
  let admin = 0;
  let referral = 0;
  for (const r of rows) {
    if (r.effectiveStatus === "active") active++;
    else if (r.effectiveStatus === "redeemed") redeemed++;
    else dead++;
    if (r.source === "referral") referral++;
    else admin++;
  }
  return { active, redeemed, dead, admin, referral };
}

/**
 * Where a family member should go to register. The console is served under
 * /admin on the same host the client is published from in the family deploy, so
 * the origin is the honest default; it stays overridable because a dev console
 * on :60721 is NOT where the game lives.
 */
export function defaultRegisterUrl(origin: string): string {
  if (!origin) return "";
  try {
    const u = new URL(origin);
    // the vite dev console runs on its own port — the game does not live there
    if (u.port === "60721") return `${u.protocol}//${u.hostname}:39527/`;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return origin;
  }
}
