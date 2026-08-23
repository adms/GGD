/**
 * Typed wrappers over every platform endpoint the web UI consumes.
 * All functions go through the shared ApiClient (Bearer + refresh-on-401).
 */
import type { RoomMatchSettings } from "@ggd/shared/roomSettings";
import { ApiClient } from "./session";
import { PAGE_SIZE } from "./ranking";
import type {
  AccountPublic,
  Catalog,
  ChampionUsageResp,
  ChampionUsageRow,
  FriendsList,
  LeaderboardResp,
  MyChampionRow,
  MyChampionsResp,
  OpenRoom,
  PlayerMeResp,
  PlayerMeStanding,
  RankBoardResp,
  RankingMe,
  RankLadderRow,
  RoomResp,
  SessionResp,
  StartInfo,
  TokenPair,
  Wallet,
  ChatMsg,
} from "./types";

/** The app-wide client instance (screens import this). */
export const api = new ApiClient();

// ---------------------------------------------------------------- auth ----

/**
 * Register. `inviteCode` is the private-deploy gate (task #174): on a gated
 * platform every registration except the deploy's very first must burn a code
 * an admin minted. It is sent as typed — the server normalises case, spaces and
 * hyphens — and simply ignored when the gate is off, so the same call works on
 * a dev platform with no code at all.
 *
 * The GATE IS THE SERVER. Omitting this argument does not open anything; it
 * just produces a 403 `invite_required` the caller shows.
 *
 * `bootstrapToken` is the FIRST-OWNER claim (T0 / #180). On a brand-new gated
 * deploy the server has no admin yet and no code can exist, so the first owner
 * instead presents the one-time token printed to the boot log and written to
 * DATA_DIR/owner-setup-token. It is ignored in every other case (an established
 * deploy has an admin, so claimOwnership refuses regardless), which is why an
 * ordinary family registration never sends it. Without this the browser could
 * not bootstrap the owner at all — the byte the server needs was never on the
 * wire.
 */
export function register(
  username: string,
  email: string,
  password: string,
  inviteCode = "",
  bootstrapToken = "",
): Promise<SessionResp> {
  const body: {
    username: string;
    email: string;
    password: string;
    inviteCode?: string;
    bootstrapToken?: string;
  } = {
    username,
    email,
    password,
  };
  if (inviteCode.trim() !== "") body.inviteCode = inviteCode.trim();
  if (bootstrapToken.trim() !== "") body.bootstrapToken = bootstrapToken.trim();
  return api.request<SessionResp>("/auth/register", { body, auth: false });
}

/**
 * Reported by the public GET /auth/bootstrap-state. `needsOwner` is true only
 * while this deploy has no administrator (the first-owner window); `requireToken`
 * is true when claiming ownership must present the one-time owner token. Reveals
 * nothing else — never the token, never whether any account exists.
 */
export interface BootstrapState {
  needsOwner: boolean;
  requireToken: boolean;
}

/** GET /auth/bootstrap-state — lets the register UI switch into first-owner mode. */
export function bootstrapState(): Promise<BootstrapState> {
  return api.request<BootstrapState>("/auth/bootstrap-state", { auth: false });
}

export function login(username: string, password: string): Promise<SessionResp> {
  return api.request<SessionResp>("/auth/login", { body: { username, password }, auth: false });
}

// ------------------------------------------------ QR device login (#197/#199)

/**
 * QR reverse-login for the keyboard-less handheld (RFC 8628 adapted). The
 * handheld — which cannot type a credential on a gamepad — mints a grant here,
 * renders `verificationUriComplete` as a QR, and polls until an already-logged-in
 * PHONE scans it and approves. See ./deviceLogin for the poll driver and ./qr
 * for the self-contained (no-CDN) encoder.
 */
export interface DeviceStartResp {
  /** SECRET — handheld-only, never rendered. Feeds devicePoll, never the QR. */
  deviceCode: string;
  /** public short code (XXXX-XXXX), the only credential-ish thing in the QR. */
  userCode: string;
  /** where the phone approves, e.g. https://ggd.adms.ai/link */
  verificationUri: string;
  /** the EXACT QR payload: verificationUri + ?code=<userCode>, nothing else. */
  verificationUriComplete: string;
  expiresIn: number;
  pollInterval: number;
}

/** The RFC-8628-style discriminated union devicePoll returns (HTTP 200 body). */
export type DevicePollResp =
  | { status: "authorization_pending" }
  | { status: "slow_down"; pollInterval: number }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "approved"; tokens: TokenPair; account: AccountPublic };

/**
 * POST /auth/device/start — mint a grant. UNAUTH: the handheld has no session
 * yet, that is the whole point. The server reads only the User-Agent (audit).
 */
export function deviceStart(): Promise<DeviceStartResp> {
  return api.request<DeviceStartResp>("/auth/device/start", { body: {}, auth: false });
}

/**
 * POST /auth/device/poll — advance the grant. UNAUTH and rate-limited per
 * device-code server-side; the caller must honor `slow_down`.
 */
export function devicePoll(deviceCode: string): Promise<DevicePollResp> {
  return api.request<DevicePollResp>("/auth/device/poll", { body: { deviceCode }, auth: false });
}

/**
 * POST /auth/device/approve — the phone's decision. AUTHENTICATED: the approving
 * account is the trust anchor, taken from the bearer token server-side, never
 * the body. A cross-site page cannot attach the bearer, so it cannot approve.
 */
export function deviceApprove(userCode: string, decision: "approve" | "deny"): Promise<{ ok: boolean }> {
  return api.request<{ ok: boolean }>("/auth/device/approve", { body: { userCode, decision } });
}

export function logout(refreshToken: string): Promise<{ status: string }> {
  return api.request<{ status: string }>("/auth/logout", { body: { refreshToken }, auth: false });
}

export function me(): Promise<{ account: AccountPublic }> {
  return api.request<{ account: AccountPublic }>("/me");
}

/** What POST /account/password returns on success (mirrors changePasswordResp). */
export interface ChangePasswordResp {
  status: string;
  tokens: TokenPair;
  sessionsRevoked: boolean;
}

/**
 * 修改密碼 — rotate the SIGNED-IN player's OWN password (self-service, #211).
 *
 * Reuses the #172 platform route `POST /api/v1/account/password`. It is
 * session-gated AND demands the CURRENT password in the body, so a stolen token
 * alone can never lock a player out of their own account. A successful change
 * revokes every refresh token of the account — this client's included — and
 * returns a FRESH pair, which is swapped in here so the player stays signed in
 * on THIS device while every other device is signed out.
 *
 * `refreshOn401: false` because a 401 from this route means "wrong current
 * password", not "expired token": auto-refreshing + retrying would double-spend
 * the server's brute-force budget and could sign the player out over a typo.
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

// ------------------------------------------------------------- friends ----

export function listFriends(): Promise<FriendsList> {
  return api.request<FriendsList>("/friends");
}

export function sendFriendRequest(username: string): Promise<{ status: string }> {
  return api.request<{ status: string }>("/friends/requests", { body: { username } });
}

export function acceptFriend(accountId: string): Promise<{ status: string }> {
  return api.request<{ status: string }>(`/friends/requests/${encodeURIComponent(accountId)}/accept`, { body: {} });
}

export function declineFriend(accountId: string): Promise<{ status: string }> {
  return api.request<{ status: string }>(`/friends/requests/${encodeURIComponent(accountId)}/decline`, { body: {} });
}

export function removeFriend(accountId: string): Promise<{ status: string }> {
  return api.request<{ status: string }>(`/friends/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

// --------------------------------------------------------------- rooms ----

export function listOpenRooms(): Promise<{ rooms: OpenRoom[] }> {
  return api.request<{ rooms: OpenRoom[] }>("/lobby/rooms");
}

/**
 * POST /rooms.
 *
 * ⚠️ The four #288 host settings ride as FLAT keys in the same body as
 * `rogueliteMobs`, not as a nested object: the platform forwards them the same
 * way (#215's `RogueliteMobs *bool` is the live precedent) and the game server
 * feeds the body straight to `sanitizeRoomSettings`, which reads top-level keys.
 * A key that is ABSENT means "keep the shipped value" all the way down — so
 * never spread an object with `undefined` values in here (JSON.stringify drops
 * them, but a `null` would not be dropped and reads as an explicit clear).
 */
export function createRoom(settings: {
  name?: string;
  mapId?: string;
  botDifficulty?: string;
  // Per-room 肉鴿殭屍模式 toggle (#215). Only send `false` when the host unchecks;
  // omitting it entirely keeps the default-ON behavior all the way down.
  rogueliteMobs?: boolean;
} & RoomMatchSettings): Promise<RoomResp> {
  return api.request<RoomResp>("/rooms", { body: settings });
}

/** Host edits room settings post-create (PATCH). The #215 toggle takes effect
 *  for the NEXT match — arenaRules is frozen at match start. */
export function updateRoomSettings(
  roomId: string,
  settings: { name?: string; mapId?: string; botDifficulty?: string; rogueliteMobs?: boolean },
): Promise<RoomResp> {
  return api.request<RoomResp>(`/rooms/${encodeURIComponent(roomId)}/settings`, { method: "PATCH", body: settings });
}

export function getRoom(roomId: string): Promise<RoomResp> {
  return api.request<RoomResp>(`/rooms/${encodeURIComponent(roomId)}/`);
}

export function joinRoom(roomId: string): Promise<RoomResp> {
  return api.request<RoomResp>(`/rooms/${encodeURIComponent(roomId)}/join`, { body: {} });
}

export function leaveRoom(roomId: string): Promise<{ status: string }> {
  return api.request<{ status: string }>(`/rooms/${encodeURIComponent(roomId)}/leave`, { body: {} });
}

/**
 * POST /rooms/:id/ready. The route ALSO accepts an optional `champion` (the
 * room-level pre-pick), and this client deliberately never sends it — GH#491
 * took the pre-pick dropdown out because nothing downstream consumed it (the
 * reasoning is in RoomView.tsx's header). The Go side keeps the field as a
 * defence against a crafted client; adding it back here needs that whole chain
 * wired first, starting with `gamelink.Seat.Champion`, which no one assigns.
 */
export function setReady(roomId: string, ready: boolean): Promise<{ status: string }> {
  return api.request<{ status: string }>(`/rooms/${encodeURIComponent(roomId)}/ready`, {
    body: { ready },
  });
}

/**
 * Start the room. `ignoreNotReady` is the GH#492 集合令 deadline: 「最多等 10 秒」
 * is a DEADLINE, not a consensus, so the rally's auto-start lifts the
 * 「all players must be ready」 gate. ⛔ An ordinary 按開始 must NOT pass it —
 * that gate is what stops a host yanking a room-mate out of champ select.
 */
export function startRoom(roomId: string, ignoreNotReady = false): Promise<StartInfo> {
  return api.request<StartInfo>(`/rooms/${encodeURIComponent(roomId)}/start`, {
    body: ignoreNotReady ? { ignoreNotReady: true } : {},
  });
}

/**
 * 大廳集合令 (GH#492) — fan a confirm-dialog invite out to EVERY account sitting
 * in the lobby. Host-only, open-rooms-only.
 *
 * ⛔ Accounts in a match are excluded SERVER-side (internal/room/rally.go), not
 * here: owner's rule is 「所有線上**在大廳**的人」 and a client-side filter would
 * be decoration — the browser cannot see who is playing.
 *
 * The response's `expiresAt` is the SERVER's stamp and is the ONLY clock the
 * countdown may use; every recipient counts down to the same instant.
 */
export function rallyRoom(
  roomId: string,
  waitSec: number,
): Promise<{ invited: number; inLobby: number; truncated: boolean; expiresAt: number; waitSec: number }> {
  return api.request(`/rooms/${encodeURIComponent(roomId)}/rally`, { body: { waitSec } });
}

/**
 * One-click bot match (#188): the platform creates a private room and starts it
 * in the same call, so this is the WHOLE client side of 「一鍵開房直接玩」.
 *
 * It returns only the match id + bot count; the seat token arrives moments later
 * over the lobby WebSocket as `match_ready`, exactly like a room start — which
 * is why entering the match needs no new code path. Do NOT confuse this with
 * `store.playOffline`, which joins the game server directly and settles NOWHERE
 * (dev tool). This one records, rates and pays.
 */
export function startSoloMatch(settings?: {
  mapId?: string;
  botDifficulty?: string;
  rogueliteMobs?: boolean;
  /**
   * 練習模式（GH#343）。⭐ 刻意**沒有開新端點**：練習房就是一間 solo 房，差別
   * 只有這一格旗標，所以它走同一條 POST /rooms/solo —— 開第二條路等於開第二份
   * 會各自腐爛的座位／回呼／心跳接線。
   *
   * ⚠️ 平台這一層只轉送，不判斷；真正決定「這是不是練習房」的是 game server
   * （`MatchRoom.onCreate`），而練習房**完全沒有獎勵積分**是由結算那一端保證的
   * （練習房不發 result callback），⛔ 不是靠這裡少送什麼。
   */
  practice?: boolean;
}): Promise<StartInfo> {
  return api.request<StartInfo>("/rooms/solo", { body: settings ?? {} });
}

/** Couch play: how many local players share MY machine in this room (1..4). */
export function setLocalPlayers(roomId: string, count: number): Promise<RoomResp> {
  return api.request<RoomResp>(`/rooms/${encodeURIComponent(roomId)}/local-players`, {
    method: "PATCH",
    body: { count },
  });
}

export function inviteToRoom(roomId: string, accountId: string): Promise<{ token: string }> {
  return api.request<{ token: string }>(`/rooms/${encodeURIComponent(roomId)}/invite`, { body: { accountId } });
}

/**
 * Redeem an invite token.
 *
 * `ready` marks the caller ready IN THE SAME REQUEST (GH#492): pressing 加入 on a
 * 集合令 dialog IS the consent the ready flag records, and the host's countdown is
 * already running — a second round trip to /ready is a window the start can fire
 * inside, leaving the accepter behind in a room that just emptied.
 */
export function joinByCode(token: string, ready = false): Promise<RoomResp> {
  return api.request<RoomResp>("/rooms/join-by-code", {
    body: ready ? { token, ready: true } : { token },
  });
}

export function chatHistory(roomId: string): Promise<{ messages: ChatMsg[] }> {
  return api.request<{ messages: ChatMsg[] }>(`/rooms/${encodeURIComponent(roomId)}/chat`);
}

// ------------------------------------------------------------- ranking ----

export function leaderboard(page = 1, pageSize = 20): Promise<LeaderboardResp> {
  return api.request<LeaderboardResp>(`/ranking/leaderboard?page=${page}&pageSize=${pageSize}`, { auth: false });
}

export function rankingMe(): Promise<RankingMe> {
  return api.request<RankingMe>("/ranking/me");
}

// -- ranked ladder (task #37): cumulative season-points player + champion boards.
// Board reads are public (auth:false); the two /me reads carry the caller.
// The Go handlers wrap every response in an envelope (player/champion boards →
// `{season,total,limit,offset,entries}`; me/champions → `{season,champions}`;
// player/me → `{season,ranked,…}`). These fetchers unwrap it to the row shapes
// the store + panel consume, so the envelope never leaks into view logic.

/** GET /ranking/player — the player board (one row per account by total points). */
export async function playerBoard(limit = PAGE_SIZE, offset = 0, season?: string): Promise<RankLadderRow[]> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (season) q.set("season", season);
  const resp = await api.request<RankBoardResp>(`/ranking/player?${q.toString()}`, { auth: false });
  return resp.entries ?? [];
}

/**
 * GET /ranking/player/me — the caller's own player standing. The handler always
 * answers 200; `ranked:false` (no points yet) maps to null so the "you" row is
 * hidden without treating the empty standing as an error.
 */
export async function playerMe(): Promise<PlayerMeStanding | null> {
  const resp = await api.request<PlayerMeResp>("/ranking/player/me");
  if (!resp.ranked) return null;
  return {
    points: resp.points ?? 0,
    tier: resp.tier ?? "",
    division: resp.division ?? null,
    rank: resp.rank ?? 0,
    percentile: resp.percentile ?? 0,
  };
}

/** GET /ranking/champion/{id} — a single champion's board (per-account points on that champion). */
export async function championBoard(championId: string, limit = PAGE_SIZE, offset = 0): Promise<RankLadderRow[]> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const resp = await api.request<RankBoardResp>(
    `/ranking/champion/${encodeURIComponent(championId)}?${q.toString()}`,
    { auth: false },
  );
  return resp.entries ?? [];
}

/** GET /ranking/me/champions — the caller's per-champion standings (each champion's tier/points). */
export async function myChampions(): Promise<MyChampionRow[]> {
  const resp = await api.request<MyChampionsResp>("/ranking/me/champions");
  return resp.champions ?? [];
}

/**
 * GET /ranking/champion-usage — 英雄被選用次數榜 (GH#645). Rows arrive sorted
 * picks-desc from the platform; no selection or auth needed (the whole point:
 * the lobby 英雄榜 renders without picking a champion first).
 */
export async function championUsage(): Promise<ChampionUsageRow[]> {
  const resp = await api.request<ChampionUsageResp>("/ranking/champion-usage", { auth: false });
  return resp.rows ?? [];
}

// -------------------------------------------------------- wallet/store ----

export function getWallet(): Promise<Wallet> {
  return api.request<Wallet>("/wallet");
}

export function getCatalog(): Promise<Catalog> {
  return api.request<Catalog>("/store/catalog");
}

export function buyItem(kind: "champion" | "skin", id: string): Promise<Wallet> {
  return api.request<Wallet>("/store/buy", { body: { kind, id } });
}

export function equipSkin(championId: string, skinId: string | null): Promise<Wallet> {
  return api.request<Wallet>("/store/equip", { body: { championId, skinId } });
}

// ------------------------------------------------------- announcements ----

/**
 * 大廳公告 — the ACTIVE operator announcements (task #259).
 *
 * `auth: false` is not an oversight and not a laxity: the route is registered by
 * `admin.Handlers.MountPublic` on the platform's PUBLIC router, above
 * `pr.Use(s.Auth.Middleware)`, and the response is the `PublicAnnouncement`
 * projection with `active`/`updatedAt` stripped. Sending a Bearer header would
 * be pointless, and — the reason it matters — it would make the feed fail for a
 * player whose access token has just expired, at exactly the moment the lobby
 * is loading. An announcement must never depend on session freshness.
 *
 * The raw body is returned UNPARSED so `./announcements.parseAnnouncementFeed`
 * can be the single, total, defensive reader of the wire shape.
 */
export function publicAnnouncements(): Promise<unknown> {
  return api.request<unknown>("/announcements", { auth: false });
}
