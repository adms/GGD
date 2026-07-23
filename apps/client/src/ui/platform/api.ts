/**
 * Typed wrappers over every platform endpoint the web UI consumes.
 * All functions go through the shared ApiClient (Bearer + refresh-on-401).
 */
import { ApiClient } from "./session";
import { PAGE_SIZE } from "./ranking";
import type {
  AccountPublic,
  Catalog,
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
 */
export function register(
  username: string,
  email: string,
  password: string,
  inviteCode = "",
): Promise<SessionResp> {
  const body: { username: string; email: string; password: string; inviteCode?: string } = {
    username,
    email,
    password,
  };
  if (inviteCode.trim() !== "") body.inviteCode = inviteCode.trim();
  return api.request<SessionResp>("/auth/register", { body, auth: false });
}

export function login(username: string, password: string): Promise<SessionResp> {
  return api.request<SessionResp>("/auth/login", { body: { username, password }, auth: false });
}

export function logout(refreshToken: string): Promise<{ status: string }> {
  return api.request<{ status: string }>("/auth/logout", { body: { refreshToken }, auth: false });
}

export function me(): Promise<{ account: AccountPublic }> {
  return api.request<{ account: AccountPublic }>("/me");
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

export function createRoom(settings: { name?: string; mapId?: string; botDifficulty?: string }): Promise<RoomResp> {
  return api.request<RoomResp>("/rooms", { body: settings });
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

export function setReady(roomId: string, ready: boolean, champion?: string): Promise<{ status: string }> {
  const body: { ready: boolean; champion?: string } = { ready };
  if (champion) body.champion = champion;
  return api.request<{ status: string }>(`/rooms/${encodeURIComponent(roomId)}/ready`, { body });
}

export function startRoom(roomId: string): Promise<StartInfo> {
  return api.request<StartInfo>(`/rooms/${encodeURIComponent(roomId)}/start`, { body: {} });
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

export function joinByCode(token: string): Promise<RoomResp> {
  return api.request<RoomResp>("/rooms/join-by-code", { body: { token } });
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
