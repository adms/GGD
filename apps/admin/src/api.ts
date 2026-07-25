/** Typed wrappers over the platform admin API (all via the shared ApiClient). */
import { ApiClient, ApiError } from "./session";
import { diffDoc, normalizeStarter, normalizeWhitelist, verifySaved } from "./curation";
import type { BulkRequest, StarterBundle, VerifyResult, WhitelistDoc } from "./curation";
import { normalizeAiConfig } from "./ai";
import type { AiConfigMasked, AiConfigSave } from "./ai";
import { normalizeCombatEnvDoc } from "./combatEnv";
import type { CombatEnvDoc, CombatEnvSave } from "./combatEnv";
import { normalizeOpsPayload } from "./serverOps";
import type { OpsPayload, OpsSave } from "./serverOps";
import { normalizeInvitePayload } from "./invites";
import type { InvitePayload } from "./invites";
import { normalizeLog, normalizeStatus } from "./contentOverlay";
import type { OverlayHead, OverlayLogLine, OverlayStatus } from "./contentOverlay";
import type {
  AccountRow,
  AccountSearch,
  Announcement,
  AuditList,
  MatchList,
  MatchRecord,
  Profile,
  SessionResp,
  TokenPair,
} from "./types";

/** The app-wide client instance. */
export const api = new ApiClient();

// ---- auth -------------------------------------------------------------------

export function login(username: string, password: string): Promise<SessionResp> {
  return api.request<SessionResp>("/auth/login", { body: { username, password }, auth: false });
}

export function logout(refreshToken: string): Promise<{ status: string }> {
  return api.request<{ status: string }>("/auth/logout", { body: { refreshToken }, auth: false });
}

export function me(): Promise<{ account: { id: string; username: string } }> {
  return api.request<{ account: { id: string; username: string } }>("/me");
}

/** What POST /account/password returns on success. */
export interface ChangePasswordResp {
  status: string;
  tokens: TokenPair;
  sessionsRevoked: boolean;
}

/**
 * 變更密碼 — rotate the SIGNED-IN operator's own password.
 *
 * Session-gated AND current-password-gated: the platform refuses to change a
 * password from a session alone, so a stolen token cannot lock the owner out.
 * A successful change revokes every refresh token of the account — this
 * console's included — and returns a fresh pair, which is swapped in here so
 * the operator stays signed in while every other device is signed out.
 *
 * `refreshOn401: false` because a 401 from this route means "wrong current
 * password", not "expired token": retrying it would double-spend the server's
 * brute-force budget and could sign the operator out over a typo.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResp> {
  const resp = await api.request<ChangePasswordResp>("/account/password", {
    body: { currentPassword, newPassword },
    refreshOn401: false,
  });
  if (resp?.tokens?.accessToken && resp?.tokens?.refreshToken) api.setTokens(resp.tokens);
  return resp;
}

// ---- accounts ---------------------------------------------------------------

/**
 * Search accounts. `status` filters on the #126 approval state
 * ("pending"/"approved"/"denied"); empty means every account, which is the
 * pre-existing behaviour every other caller relies on.
 */
export function searchAccounts(
  query: string,
  page = 1,
  pageSize = 20,
  status = "",
): Promise<AccountSearch> {
  const qs = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize) });
  if (status) qs.set("status", status);
  return api.request<AccountSearch>(`/admin/accounts?${qs.toString()}`);
}

// ---- 帳號審核 · #126 private-deploy approval ---------------------------------
// The gate is the SERVER: registration lands as `pending` and auth.PlayableOnly
// re-reads the durable account on room routes + the lobby WS handshake, so a
// decision here applies on the target's very next request. These three wrappers
// are the console's only approval surface — see ../approvals.ts for the rules.

/**
 * The approval QUEUE, OLDEST FIRST (the platform orders it that way on purpose:
 * the person who has waited longest is a relative currently looking at a
 * "waiting for approval" screen). `total` is the full pending count, so the nav
 * badge can be exact without paging.
 */
export function listPendingAccounts(page = 1, pageSize = 20): Promise<AccountSearch> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return api.request<AccountSearch>(`/admin/accounts/pending?${qs.toString()}`);
}

/**
 * Let this account in. Idempotent server-side, audited as `approval_approved`,
 * and it is the UNDO for a deny — so the console can offer it as a one-tap
 * action with no confirmation.
 */
export function approveAccount(id: string, reason = ""): Promise<{ account: AccountRow }> {
  return api.request<{ account: AccountRow }>(`/admin/accounts/${encodeURIComponent(id)}/approve`, {
    body: { reason },
  });
}

/**
 * Decline this registration. NOT a ban (see approvals.ts DENY_VS_BAN): the
 * account stays, loses access, and is restored by approving it. Revokes live
 * sessions, so a person already signed in is out on their next request. The
 * platform refuses (409 last_admin) if this would leave the deploy with no
 * administrator who can sign in.
 */
export function denyAccount(id: string, reason = ""): Promise<{ account: AccountRow }> {
  return api.request<{ account: AccountRow }>(`/admin/accounts/${encodeURIComponent(id)}/deny`, {
    body: { reason },
  });
}

export function getProfile(id: string): Promise<Profile> {
  return api.request<Profile>(`/admin/accounts/${encodeURIComponent(id)}`);
}

export function adjustMCoin(id: string, delta: number, reason: string): Promise<{ mcoin: number }> {
  return api.request<{ mcoin: number }>(`/admin/accounts/${encodeURIComponent(id)}/mcoin`, {
    body: { delta, reason },
  });
}

/**
 * Grant (or deduct) admin-issued M幣 / M COIN via the wallet meta endpoint
 * (task #118). Role-gated server-side; a non-admin caller is a 403. Returns the
 * target account's resulting balance.
 */
export function grantMCoin(accountId: string, amount: number): Promise<{ accountId: string; mcoin: number }> {
  return api.request<{ accountId: string; mcoin: number }>("/wallet/admin/grant-mcoin", {
    body: { accountId, amount },
  });
}

// ---- 藍水晶 crystal grants (task #225) --------------------------------------
// BOTH live under /admin, not beside grantMCoin's /wallet/admin/grant-mcoin.
// That is deliberate: /admin/* carries the AdminOnly middleware (a usable admin:
// roled, unbanned, approved under the #126 gate) AND the platform's audit
// writer, and the brief requires every crystal grant to be logged. The wallet
// package cannot write an audit line without an import cycle, so a crystal route
// next to grant-mcoin would have been silently unaudited.
//
// Amounts are validated SERVER-side (positive whole numbers, capped);
// ../crystalGrant re-checks the same rules so the console fails fast.

/** Grant 藍水晶 to ONE account. Additive. Returns the resulting balance. */
export function grantCrystal(
  id: string,
  amount: number,
  reason = "",
): Promise<{ crystal: number }> {
  return api.request<{ crystal: number }>(`/admin/accounts/${encodeURIComponent(id)}/crystal`, {
    body: { amount, reason },
  });
}

/**
 * 一鍵發放所有帳號藍水晶 — the bulk grant. Returns the per-account outcome
 * counts, including `firstError` when some accounts failed: a partial run is a
 * 200 with counts, not an error, because the operator must be able to tell
 * "everyone got it" from "900 of 901 got it" before deciding whether to re-run
 * (re-running double-grants the 900 — this action is repeatable by design).
 */
export function grantCrystalAll(
  amount: number,
  reason = "",
): Promise<{ accounts: number; granted: number; failed: number; firstError?: string }> {
  return api.request<{ accounts: number; granted: number; failed: number; firstError?: string }>(
    "/admin/crystals/grant-all",
    { body: { amount, reason } },
  );
}

export function setMMR(id: string, mmr: number, reason: string): Promise<{ mmr: number }> {
  return api.request<{ mmr: number }>(`/admin/accounts/${encodeURIComponent(id)}/mmr`, {
    body: { mmr, reason },
  });
}

export function banAccount(id: string, reason: string): Promise<{ account: unknown }> {
  return api.request<{ account: unknown }>(`/admin/accounts/${encodeURIComponent(id)}/ban`, {
    body: { reason },
  });
}

export function unbanAccount(id: string): Promise<{ account: unknown }> {
  return api.request<{ account: unknown }>(`/admin/accounts/${encodeURIComponent(id)}/unban`, {
    body: {},
  });
}

// ---- matches ----------------------------------------------------------------

export function listMatches(accountId = "", page = 1, pageSize = 20): Promise<MatchList> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (accountId) qs.set("accountId", accountId);
  return api.request<MatchList>(`/admin/matches?${qs.toString()}`);
}

export function getMatch(id: string): Promise<{ match: MatchRecord }> {
  return api.request<{ match: MatchRecord }>(`/admin/matches/${encodeURIComponent(id)}`);
}

// ---- announcements ----------------------------------------------------------

export function listAnnouncements(): Promise<{ announcements: Announcement[] }> {
  return api.request<{ announcements: Announcement[] }>("/admin/announcements");
}

export function createAnnouncement(
  title: string,
  body: string,
  active: boolean,
): Promise<{ announcement: Announcement }> {
  return api.request<{ announcement: Announcement }>("/admin/announcements", {
    body: { title, body, active },
  });
}

export function updateAnnouncement(
  id: string,
  title: string,
  body: string,
  active: boolean,
): Promise<{ announcement: Announcement }> {
  return api.request<{ announcement: Announcement }>(`/admin/announcements/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { title, body, active },
  });
}

export function deleteAnnouncement(id: string): Promise<{ status: string }> {
  return api.request<{ status: string }>(`/admin/announcements/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---- audit ------------------------------------------------------------------

export function listAudit(page = 1, pageSize = 50): Promise<AuditList> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return api.request<AuditList>(`/admin/audit?${qs.toString()}`);
}

// ---- content overlay (task #189) --------------------------------------------
// THE PRODUCTION CONTENT WRITE PATH. Every call here goes to the PLATFORM with
// an admin JWT and is audited server-side; none of it touches /content-api (the
// dev-only loopback editor), which has no route in the production edge and must
// keep having none. See src/contentOverlay.ts for why this is a second writer
// rather than a relaxation of the dev gate.
//
// The public GET /content-overlay/head is deliberately NOT wrapped: it blanks
// updatedBy for anonymous callers, so the console reads the admin-only
// /content-overlay/status instead, which carries the per-entry "when + by whom".

/** What is overlaid, what the repo says now, and which entries need a look. */
export function getOverlayStatus(): Promise<OverlayStatus> {
  return api.request<unknown>("/content-overlay/status").then(normalizeStatus);
}

/** The generation history from data/content-overlay-log/ (newest first). */
export function getOverlayLog(): Promise<OverlayLogLine[]> {
  return api.request<unknown>("/content-overlay/log").then(normalizeLog);
}

/** What the SHIPPED (repo) tree currently says for a doc — the editor's starting point. */
export function getShippedDoc(
  collection: string,
  id: string,
): Promise<{ present: boolean; hash: string; doc: unknown }> {
  return api
    .request<{ present?: boolean; hash?: string; doc?: unknown }>(
      `/content-overlay/shipped/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    )
    .then((r) => ({ present: r?.present === true, hash: r?.hash ?? "", doc: r?.doc ?? null }));
}

/**
 * Upsert a doc into the durable overlay. The platform records the SHIPPED hash
 * at this moment as the entry's merge base — the console deliberately does not
 * supply it, so a stale browser tab cannot stamp an edit as verified against a
 * doc it read an hour ago.
 */
export function putOverlayDoc(
  collection: string,
  id: string,
  doc: Record<string, unknown>,
): Promise<OverlayHead> {
  return api.request<OverlayHead>(
    `/content-overlay/docs/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    { method: "PUT", body: doc },
  );
}

/** Tombstone a doc: the merged content tree drops it, shipped version included. */
export function deleteOverlayDoc(collection: string, id: string): Promise<OverlayHead> {
  return api.request<OverlayHead>(
    `/content-overlay/docs/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/**
 * REVERT: drop the overlay's entry entirely so the merged tree falls back to the
 * shipped doc. This is the non-destructive exit from a `stale` row — a tombstone
 * would hide the repo's newer version too, which is the opposite of the intent.
 */
export function revertOverlayDoc(collection: string, id: string): Promise<OverlayHead> {
  return api.request<OverlayHead>(
    `/content-overlay/entries/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// ---- curation (content whitelist) -------------------------------------------
// GET is public (the game-server and the client read it too); PUT/POST are
// admin-only. Responses are run through normalizeWhitelist so either the bare
// doc or a `{ whitelist: … }` envelope works.

export function getWhitelist(): Promise<WhitelistDoc> {
  return api
    .request<unknown>("/curation/whitelist", { auth: false })
    .then(normalizeWhitelist);
}

/** Replace the whole doc (admin only). version/updatedAt are server-owned. */
export function putWhitelist(doc: WhitelistDoc): Promise<WhitelistDoc> {
  return api
    .request<unknown>("/curation/whitelist", {
      method: "PUT",
      body: { champions: doc.champions, items: doc.items, abilities: doc.abilities },
    })
    .then(normalizeWhitelist);
}

/** Enable/disable a set of ids for one kind (admin only). */
export function bulkWhitelist(req: BulkRequest): Promise<WhitelistDoc> {
  return api
    .request<unknown>("/curation/whitelist/bulk", { body: req })
    .then(normalizeWhitelist);
}

/**
 * PREVIEW the platform's demo starter bundle WITHOUT applying it (public read).
 * The bundle is server-owned (internal/curation/starter.go) so the console, the
 * `seed -starter` binary and `make seed-demo` all install the exact same set.
 */
export function getStarterSet(): Promise<StarterBundle> {
  return api
    .request<unknown>("/curation/whitelist/starter", { auth: false })
    .then(normalizeStarter);
}

/**
 * APPLY the starter bundle server-side (admin only). UNION-only — it can never
 * disable an operator's existing picks — and audited as `curation.starter`.
 * Returns the resulting whole document.
 */
export function applyStarterSet(): Promise<WhitelistDoc> {
  return api
    .request<unknown>("/curation/whitelist/starter", { body: {} })
    .then(normalizeWhitelist);
}

/**
 * Save a draft and VERIFY it: send the per-kind diff through the bulk endpoint
 * (a minimal write that cannot clobber a concurrent edit to another kind),
 * fall back to a full PUT replace if bulk is unavailable (404/405 — the
 * platform half may not have shipped it yet), then re-GET and compare. The
 * caller shows a green tick only when `verify.ok`.
 */
export async function saveWhitelist(
  server: WhitelistDoc,
  draft: WhitelistDoc,
): Promise<{ doc: WhitelistDoc; verify: VerifyResult; via: "bulk" | "put" }> {
  const diffs = diffDoc(server, draft);
  let via: "bulk" | "put" = "bulk";
  try {
    if (diffs.length === 0) {
      // nothing to write — still re-read so the caller sees server truth
    } else {
      for (const d of diffs) {
        await bulkWhitelist({ kind: d.kind, enable: d.enable, disable: d.disable });
      }
    }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      await putWhitelist(draft);
      via = "put";
    } else {
      throw err;
    }
  }
  const doc = await getWhitelist();
  return { doc, verify: verifySaved(draft, doc), via };
}

// ---- AI provider config (AI 生成設定) ---------------------------------------
// Both admin-only. The GET returns the MASKED config (the raw key never leaves
// the server); the PUT body's apiKey is write-only (omit to keep, "" to clear).

export function getAiConfig(): Promise<AiConfigMasked> {
  return api.request<unknown>("/admin/ai/config").then(normalizeAiConfig);
}

export function putAiConfig(body: AiConfigSave): Promise<AiConfigMasked> {
  return api.request<unknown>("/admin/ai/config", { method: "PUT", body }).then(normalizeAiConfig);
}

// ---- 戰鬥系統 combat-env multipliers ----------------------------------------
// Both admin-only. PUT-replace: the body is the COMPLETE desired table (an
// omitted key resets to the neutral 1.0). The game-server reads the same
// document from the PUBLIC `/combat-env` endpoint at match creation, so a save
// applies from the NEXT match — running matches keep their snapshot.

export function getCombatEnv(): Promise<CombatEnvDoc> {
  return api.request<unknown>("/admin/combat-env").then(normalizeCombatEnvDoc);
}

export function putCombatEnv(body: CombatEnvSave): Promise<CombatEnvDoc> {
  return api
    .request<unknown>("/admin/combat-env", { method: "PUT", body })
    .then(normalizeCombatEnvDoc);
}

// ---- 系統運維 server-ops ----------------------------------------------------
// Both admin-only. PUT-replace: the body is the COMPLETE desired table (an
// omitted key resets to the COMPILED default, not to zero). The game-server
// reads the same document from the PUBLIC `/server-ops` endpoint at match
// creation, so 同時對戰上限 is live at the next create attempt while 快照頻率
// applies from the NEXT match — running matches keep their snapshot.
//
// The GET carries the knob DESCRIPTORS (bounds, units, safety class, zh-Hant
// copy) and the read-only inventory, so the bounds live on the server only and
// this console cannot render a range the validator does not enforce.

export function getServerOps(): Promise<OpsPayload> {
  return api.request<unknown>("/admin/server-ops").then(normalizeOpsPayload);
}

export function putServerOps(body: OpsSave): Promise<OpsPayload> {
  return api
    .request<unknown>("/admin/server-ops", { method: "PUT", body })
    .then(normalizeOpsPayload);
}

// ---- 邀請碼 registration invite codes (task #174) ----------------------------
// ALL admin-only. There is deliberately no public read and no "is this code
// valid?" endpoint — an invite code is a credential, and a validity endpoint
// would be a free guessing oracle. The only way to test a code is to attempt a
// registration, which burns it. See apps/platform/internal/invite.

export function getInvites(): Promise<InvitePayload> {
  return api.request<unknown>("/admin/invites").then(normalizeInvitePayload);
}

/** Mint `count` single-use codes for one 備註. Returns the new codes + the refreshed list. */
export function mintInvites(note: string, count: number, ttlDays: number): Promise<InvitePayload> {
  return api
    .request<unknown>("/admin/invites", { body: { note, count, ttlDays } })
    .then(normalizeInvitePayload);
}

/** Kill an unredeemed code. Irreversible — mint a new one instead of un-revoking. */
export function revokeInvite(code: string): Promise<InvitePayload> {
  return api
    .request<unknown>(`/admin/invites/${encodeURIComponent(code)}/revoke`, { body: {} })
    .then(normalizeInvitePayload);
}
