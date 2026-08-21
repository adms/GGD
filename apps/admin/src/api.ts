/** Typed wrappers over the platform admin API (all via the shared ApiClient). */
import { ApiClient, ApiError } from "./session";
import { diffDoc, normalizeStarter, normalizeWhitelist, verifySaved } from "./curation";
import type { BulkRequest, StarterBundle, VerifyResult, WhitelistDoc } from "./curation";
import type { ResetRequestBody } from "./curationReset";
import { normalizeAiConfig } from "./ai";
import type { AiConfigMasked, AiConfigSave } from "./ai";
import { normalizeCombatEnvDoc } from "./combatEnv";
import type { CombatEnvDoc, CombatEnvSave } from "./combatEnv";
import { normalizeOpsPayload } from "./serverOps";
import type { OpsPayload, OpsSave } from "./serverOps";
import { normalizeInvitePayload } from "./invites";
import type { InvitePayload } from "./invites";
import { normalizeLog, normalizeStatus, validateOverlayDoc } from "./contentOverlay";
import type { OverlayHead, OverlayLogLine, OverlayStatus } from "./contentOverlay";
import type {
  ApplyResp,
  ArchiveGroup,
  PlanResp,
  PreviewResp,
  StageResp,
  StatusResp,
} from "./archive";
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
 * Grant (or deduct) admin-issued M幣 / M COIN (task #118).
 *
 * WHICH ROUTE, AND WHY IT CHANGED (task #214). This used to POST
 * `/wallet/admin/grant-mcoin`. That endpoint sat OUTSIDE the `/admin` subrouter,
 * so it never ran AdminOnly — only an in-service `HasRole("admin")` check, which
 * a banned or #126-unapproved operator still passes. It validated nothing but a
 * non-empty account id, and it wrote NO audit line, because the wallet package
 * cannot reach the platform's audit writer without an import cycle. So the one
 * console button that hands out currency was the one that left no trail.
 *
 * It now uses the SAME audited endpoint the players table has always used:
 * `POST /admin/accounts/{id}/mcoin` → admin.Service.AdjustMCoin, which is
 * AdminOnly, bounds-checked server-side, and audited as `mcoin_adjust` (visible
 * in 稽核紀錄). The old route is deleted, so there is no unaudited door left.
 *
 * The exported signature is unchanged apart from the optional `reason`, and the
 * `accountId` in the result is echoed from the argument: the admin route answers
 * with `{mcoin}` alone, and the page renders the id.
 */
export function grantMCoin(
  accountId: string,
  amount: number,
  reason = "",
): Promise<{ accountId: string; mcoin: number }> {
  return api
    .request<{ mcoin: number }>(`/admin/accounts/${encodeURIComponent(accountId)}/mcoin`, {
      body: { delta: amount, reason },
    })
    .then((r) => ({ accountId, mcoin: r.mcoin }));
}

// ---- 藍水晶 crystal grants (task #225) --------------------------------------
// Like grantMCoin above, these live under /admin: that subrouter carries the
// AdminOnly middleware (a usable admin: roled, unbanned, approved under the #126
// gate) AND the platform's audit writer, and the brief requires every grant to be
// logged. The wallet package cannot write an audit line without an import cycle,
// so a currency route over there is unauditable by construction — which is what
// #214 found still true of the old /wallet/admin/grant-mcoin, and deleted.
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

// ------------------------------------------------- GH#326 版本回滾 ----------
//
// owner 2026-08-14：「舊版本可以有版本編號 rollback **往前 n 版都可以（下拉選單）**，
// **可以單獨項目版本控制也可以批次版本控制**變更」。
//
// ⚠️ 它和上面那條 `getOverlayLog` 是**兩件事**，不要混：
//   · log      —— 誰在什麼時候改了哪一格（純紀錄，⛔ 回不去）
//   · versions —— 每一版的**完整內容**（go-git），⭐ 回得去
// 舊的 log 留著是因為它按日切檔、便宜、而且是既有的稽核入口。

/** 一版。`current` 標記線上正在跑的那一版（永遠是第一列）。 */
export interface OverlayVersion {
  hash: string;
  short: string;
  at: string;
  by: string;
  generation: number;
  summary: string;
  current: boolean;
}

/** ⚠️ `unavailable` 非空 = 歷史讀不到。⛔ 不可以把它當成「沒有歷史」。 */
export interface OverlayVersionList {
  entries: OverlayVersion[];
  unavailable?: string;
}

/** 整批的版本清單（每一次存檔一列）。 */
export function getOverlayVersions(limit?: number): Promise<OverlayVersionList> {
  const q = limit === undefined ? "" : `?limit=${String(limit)}`;
  return api.request<OverlayVersionList>(`/content-overlay/versions${q}`);
}

/** 單支文件的版本清單 —— ⚠️ 只有內容**真的變過**的那幾版。 */
export function getOverlayDocVersions(
  collection: string,
  id: string,
): Promise<OverlayVersionList> {
  return api.request<OverlayVersionList>(
    `/content-overlay/versions/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
  );
}

/** 整批回滾。⭐ 伺服器端會**鑄一個新版本**，⛔ 不是倒退指標。 */
export function restoreOverlayVersion(hash: string): Promise<unknown> {
  return api.request<unknown>(`/content-overlay/restore/${encodeURIComponent(hash)}`, {
    method: "POST",
  });
}

/** 單支回滾 —— 只動那一份，但**一樣鑄一個新的批次版本**。 */
export function restoreOverlayDoc(
  hash: string,
  collection: string,
  id: string,
): Promise<unknown> {
  // ⚠️ 路徑寫成**一整條 template literal**，⛔ 不要拆成兩段用 `+` 接 ——
  //    `orphan_route_test.go` 是**grep 前端原始碼**找路由字串的，拆開之後它看不到
  //    這一個呼叫，於是把一個**真的有人用**的路由報成孤兒（2026-08-16 實際發生）。
  //    ⇒ 這不是為了讓測試過而遷就它：那個掃描器的價值就是「路由有沒有人叫」，
  //    而一段機器讀不到的呼叫，對它跟不存在是一樣的。
  return api.request<unknown>(
    `/content-overlay/restore/${encodeURIComponent(hash)}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    { method: "POST" },
  );
}

/**
 * The overlay's OWN copy of one doc, read out of the public bundle.
 *
 * `/content-overlay/status` lists WHICH docs are overlaid but not their bytes,
 * and `/content-overlay/shipped/...` deliberately returns the repo's version.
 * A page that edits a doc IN PLACE (rather than pasting JSON) needs the third
 * thing: what is LIVE right now. The bundle is exactly that — it is the same
 * body the game-server lays over the shipped tree at boot — so reading the live
 * doc from here means the console and the shard can never disagree about what
 * "現在生效的值" is. Returns null when this doc has no overlay entry, which the
 * caller answers by falling back to the shipped doc.
 *
 * Sent WITH the operator's token even though the route is public: every overlay
 * call this console makes is authenticated (contentOverlay.test.ts pins that),
 * and an admin page reading admin state should not be the one exception.
 */
export function getOverlayDoc(collection: string, id: string): Promise<unknown | null> {
  return api
    .request<{ docs?: Record<string, unknown> }>("/content-overlay/bundle")
    .then((body) => body?.docs?.[`${collection}/${id}`] ?? null);
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
 *
 * ⚠️ THE ZOD GATE IS HERE, NOT AT THE CALL SITES (task #283). Nine pages write
 * through this one function; a check bolted onto each of them is a check the
 * tenth page will not have. Rejecting BEFORE the request means a bad doc never
 * reaches `data/content-overlay/overlay.json` — which since the client started
 * reading the overlay is a file that lands on the shard AND on every browser at
 * once. Both sides have fallbacks, but a fallback is insurance, not validation.
 *
 * A collection with no schema (the platform accepts any name matching its regex)
 * is written UNCHECKED and says so on the throw path's sibling — see
 * `validateOverlayDoc`, which returns `validated: false` rather than pretending.
 */
export function putOverlayDoc(
  collection: string,
  id: string,
  doc: Record<string, unknown>,
): Promise<OverlayHead> {
  const verdict = validateOverlayDoc(collection, id, doc);
  if (!verdict.ok) return Promise.reject(new Error(`拒絕寫入：${verdict.error}`));
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

// ---- 回到原廠設定 (reset) ----------------------------------------------------
// The only admin route that REPLACES rather than merges. The server computes
// the plan (see apps/platform/internal/curation/reset.go); the console never
// sends a target document, so a stale local read cannot roll back someone
// else's edit and the empty-whitelist floor is enforced where it is enforceable.

/** One consequence the server reports alongside a plan. */
export interface ResetWarning {
  code: string;
  championId?: string;
  missing?: string[];
}

/** The server's reply to POST /curation/whitelist/reset (dry run or real). */
export interface ResetResponse {
  dryRun: boolean;
  scopes: string[];
  before: Record<string, number>;
  after: Record<string, number>;
  disable: Record<string, string[]>;
  enable: Record<string, string[]>;
  warnings: ResetWarning[];
  snapshotId?: string;
  whitelist: WhitelistDoc;
}

/**
 * Reset the selected kinds to the version-controlled starter bundle.
 *
 * `expect` is the SECOND confirmation, re-checked server-side under the
 * whitelist mutex: if the count moved between the preview and the click, the
 * call comes back 409 `confirm_mismatch` instead of quietly deleting more than
 * the operator agreed to.
 */
export async function resetWhitelist(body: ResetRequestBody): Promise<ResetResponse> {
  const raw = await api.request<Record<string, unknown>>("/curation/whitelist/reset", { body });
  return {
    dryRun: raw["dryRun"] === true,
    scopes: Array.isArray(raw["scopes"]) ? (raw["scopes"] as string[]) : [],
    before: (raw["before"] as Record<string, number>) ?? {},
    after: (raw["after"] as Record<string, number>) ?? {},
    disable: (raw["disable"] as Record<string, string[]>) ?? {},
    enable: (raw["enable"] as Record<string, string[]>) ?? {},
    warnings: Array.isArray(raw["warnings"]) ? (raw["warnings"] as ResetWarning[]) : [],
    snapshotId: typeof raw["snapshotId"] === "string" ? raw["snapshotId"] : undefined,
    whitelist: normalizeWhitelist(raw["whitelist"]),
  };
}

// ---- 一鍵清理變身態 (evict transformed bodies) ------------------------------
// owner 2026-08-21「幫我後台跳出一鍵清理變身態的按鈕」. The SERVER derives the id
// list from `transform.role == "alternate"` in its own content tree and takes an
// undo snapshot; the console never sends ids, so a stale console cannot delete a
// champion the platform does not agree is a 變身態.

/** The server's reply to POST /curation/whitelist/evict-transformed. */
export interface EvictTransformedResponse {
  dryRun: boolean;
  /** false = the platform could not read content/champions/ (its gate is inert). */
  armed: boolean;
  /** the GGD_CURATION_TRANSFORM_GATE switch (the AUTOMATIC half only). */
  gateEnabled: boolean;
  /** how many 變身態 the platform's content tree declares. */
  indexed: number;
  remove: string[];
  names: Record<string, string>;
  before: number;
  after: number;
  snapshotId?: string;
  whitelist: WhitelistDoc;
}

/**
 * Preview (`dryRun`) or run the cleanup. `expect` is the second confirmation,
 * re-checked server-side under the whitelist mutex — a count that moved between
 * the preview and the click comes back 409 `confirm_mismatch`, never a bigger
 * delete than the operator agreed to.
 */
export async function evictTransformedBodies(
  body: { dryRun: boolean; expect?: number },
): Promise<EvictTransformedResponse> {
  const raw = await api.request<Record<string, unknown>>("/curation/whitelist/evict-transformed", {
    body,
  });
  return {
    dryRun: raw["dryRun"] === true,
    armed: raw["armed"] === true,
    gateEnabled: raw["gateEnabled"] === true,
    indexed: typeof raw["indexed"] === "number" ? raw["indexed"] : 0,
    remove: Array.isArray(raw["remove"]) ? (raw["remove"] as string[]) : [],
    names: (raw["names"] as Record<string, string>) ?? {},
    before: typeof raw["before"] === "number" ? raw["before"] : 0,
    after: typeof raw["after"] === "number" ? raw["after"] : 0,
    snapshotId: typeof raw["snapshotId"] === "string" ? raw["snapshotId"] : undefined,
    whitelist: normalizeWhitelist(raw["whitelist"]),
  };
}

export interface WhitelistSnapshot {
  id: string;
  takenAt: string;
  actor: string;
  reason: string;
  scopes?: string[];
  counts: Record<string, number>;
}

/** The undo points, newest first (admin only). */
export function listWhitelistSnapshots(): Promise<WhitelistSnapshot[]> {
  return api
    .request<{ snapshots?: WhitelistSnapshot[] }>("/curation/whitelist/snapshots")
    .then((r) => r.snapshots ?? []);
}

/** Put the whitelist back to a snapshot. Takes its own undo point first. */
export function restoreWhitelistSnapshot(
  snapshotId: string,
): Promise<{ doc: WhitelistDoc; undoSnapshotId: string }> {
  return api
    .request<Record<string, unknown>>("/curation/whitelist/restore", { body: { snapshotId } })
    .then((raw) => ({
      doc: normalizeWhitelist(raw["whitelist"]),
      undoSnapshotId: typeof raw["undoSnapshotId"] === "string" ? raw["undoSnapshotId"] : "",
    }));
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

// ---- 資料搬遷 platform archive (task #243) -----------------------------------
// The most dangerous surface in the console. Every route is admin-gated on the
// server; export and commit additionally re-confirm the OPERATOR'S OWN
// PASSWORD, which is why those two wrappers take one.
//
// EXPORT IS A POST. A GET would land in browser history, be bookmarkable and
// prefetchable, put its parameters in the edge's access log, and have nowhere
// to carry the password re-confirmation — for a response that IS every
// credential hash on the deploy.

export function archivePreview(): Promise<PreviewResp> {
  return api.request<PreviewResp>("/admin/platform-archive/preview", { body: {} });
}

export function archiveStatus(): Promise<StatusResp> {
  return api.request<StatusResp>("/admin/platform-archive/status");
}

/** Stream the archive down as a Blob. `groups` always implies core server-side. */
export function archiveExport(groups: ArchiveGroup[], confirmPassword: string): Promise<Blob> {
  return api.requestBlob("/admin/platform-archive/export", { groups, confirmPassword });
}

/** Upload an archive to the single staging slot. Writes nothing outside _migration. */
export function archiveStage(file: Blob): Promise<StageResp> {
  return api.postRaw<StageResp>("/admin/platform-archive/stage", file, "application/zip");
}

export interface ArchivePlanArgs {
  stageId: string;
  groups?: ArchiveGroup[];
  allowOverwrite?: boolean;
  resolveCollisions?: string;
}

/** Dry run. Writes nothing; returns the digest commit must be given back. */
export function archivePlan(args: ArchivePlanArgs): Promise<PlanResp> {
  return api.request<PlanResp>("/admin/platform-archive/plan", { body: args });
}

/**
 * Back up, then write. `planDigest` MUST be the digest from the plan the
 * operator just approved — the server recomputes the plan and refuses with a
 * 409 if the target moved in between, which is what makes "what you approved is
 * what gets written" a mechanism rather than a hope.
 */
export function archiveCommit(
  args: ArchivePlanArgs & { planDigest: string; confirmPassword: string },
): Promise<ApplyResp> {
  return api.request<ApplyResp>("/admin/platform-archive/commit", { body: args });
}

export function archiveDiscardStage(stageId: string): Promise<{ status: string }> {
  return api.request<{ status: string }>(
    `/admin/platform-archive/stage/${encodeURIComponent(stageId)}`,
    { method: "DELETE" },
  );
}

/**
 * Remove ONE pre-import backup by its UTC stamp.
 *
 * No password re-confirmation, and that asymmetry is deliberate: export and
 * commit are gated because they MOVE credentials; this one destroys a copy of
 * them, which is the direction an operator should never be discouraged from
 * taking. The server audits it.
 */
export function archiveDeleteBackup(stamp: string): Promise<{ status: string; stamp: string }> {
  return api.request<{ status: string; stamp: string }>(
    `/admin/platform-archive/backups/${encodeURIComponent(stamp)}`,
    { method: "DELETE" },
  );
}
