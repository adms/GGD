/** Typed wrappers over the platform admin API (all via the shared ApiClient). */
import { ApiClient, ApiError } from "./session";
import { diffDoc, normalizeStarter, normalizeWhitelist, verifySaved } from "./curation";
import type { BulkRequest, StarterBundle, VerifyResult, WhitelistDoc } from "./curation";
import { normalizeAiConfig } from "./ai";
import type { AiConfigMasked, AiConfigSave } from "./ai";
import { normalizeCombatEnvDoc } from "./combatEnv";
import type { CombatEnvDoc, CombatEnvSave } from "./combatEnv";
import type {
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

export function searchAccounts(query: string, page = 1, pageSize = 20): Promise<AccountSearch> {
  const qs = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize) });
  return api.request<AccountSearch>(`/admin/accounts?${qs.toString()}`);
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
