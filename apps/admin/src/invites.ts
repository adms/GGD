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

export interface InvitePayload {
  invites: InviteRow[];
  limits: InviteLimits;
  /** present only on a mint response: the codes just created */
  minted: InviteRow[];
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

/** Accept the list, mint and revoke envelopes uniformly. */
export function normalizeInvitePayload(raw: unknown): InvitePayload {
  const body = (raw ?? {}) as Record<string, unknown>;
  const lim = (body.limits ?? {}) as Record<string, unknown>;
  const list = Array.isArray(body.invites) ? body.invites : [];
  const minted = Array.isArray(body.minted) ? body.minted : [];
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
  };
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

/** Headline counts for the panel header. */
export function summarize(rows: InviteRow[]): { active: number; redeemed: number; dead: number } {
  let active = 0;
  let redeemed = 0;
  let dead = 0;
  for (const r of rows) {
    if (r.effectiveStatus === "active") active++;
    else if (r.effectiveStatus === "redeemed") redeemed++;
    else dead++;
  }
  return { active, redeemed, dead };
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
