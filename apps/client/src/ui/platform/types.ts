/**
 * Platform API types — mirrors the Go backend's JSON shapes (apps/platform).
 * REST envelopes come from the internal package handlers; WS pushes from
 * internal/lobby + internal/room/invite.go + internal/gamelink/client.go.
 * Errors are always `{"error":{"code","message"}}`.
 */

// ---------------------------------------------------------------- auth ----

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface AccountPublic {
  id: string;
  username: string;
  mmr: number;
  games: number;
  wins: number;
  createdAt: string;
}

export interface SessionResp {
  account: AccountPublic;
  tokens: TokenPair;
}

// ------------------------------------------------------------- friends ----

export interface FriendEntry {
  id: string;
  username: string;
  /** presence: "online" | "in-lobby" | "in-match" | "offline" (friends only) */
  state: string;
}

export interface FriendsList {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
  blocked: string[];
}

// --------------------------------------------------------------- rooms ----

export interface Room {
  id: string;
  name: string;
  hostId: string;
  mapId: string;
  mode: string;
  botDifficulty: string;
  status: string; // "open" | "in-match"
  createdAt: number;
}

export interface RoomMember {
  accountId: string;
  ready: boolean;
  isHost: boolean;
  /** couch players on that member's machine (1..4); each claims a seat */
  localPlayers: number;
}

export interface RoomResp {
  room: Room;
  members: RoomMember[];
}

export interface OpenRoom extends Room {
  players: number;
  max: number;
}

export interface StartInfo {
  matchId: string;
  botFill: number;
}

// ------------------------------------------------------------- ranking ----

export interface LeaderboardEntry {
  rank: number;
  accountId: string;
  username: string;
  mmr: number;
}

export interface LeaderboardResp {
  season: string;
  page: number;
  total: number;
  entries: LeaderboardEntry[];
}

export interface RankingMe {
  season: string;
  ranked: boolean;
  rank?: number;
  mmr?: number;
  around?: LeaderboardEntry[];
}

// ------------------------------------------------- ranked ladder (task #37) --
// Cumulative season-points boards (player + per-champion). Hidden MMR above is
// kept for matchmaking; these drive the two visible ladder screens. `tier` /
// `division` are interpreted client-side by ui/components/tier (Chinese labels
// + LoL colors), so their encoding stays loose here (key/index + 1..4|"I".."IV").

/** One row of the player board or a champion board. */
export interface RankLadderRow {
  rank: number;
  accountId: string;
  username: string;
  points: number;
  tier: string | number;
  division?: string | number | null;
}

/**
 * Envelope for GET /ranking/player and GET /ranking/champion/{id}. The Go
 * handler wraps the rows in `{season,total,limit,offset,entries}` (and adds
 * `championId` on the champion board) — the fetchers unwrap `entries`.
 */
export interface RankBoardResp {
  season: string;
  championId?: string;
  total: number;
  limit: number;
  offset: number;
  entries: RankLadderRow[];
}

/** GET /ranking/player/me — the caller's own player standing (unwrapped). */
export interface PlayerMeStanding {
  points: number;
  tier: string | number;
  division?: string | number | null;
  rank: number;
  percentile: number;
}

/**
 * Raw envelope for GET /ranking/player/me. The handler always answers 200 with
 * `{season,ranked}`; the points/tier/division/rank/percentile keys are present
 * only when `ranked` is true. The fetcher maps this to PlayerMeStanding | null.
 */
export interface PlayerMeResp {
  season: string;
  ranked: boolean;
  points?: number;
  tier?: string | number;
  division?: string | number | null;
  rank?: number;
  percentile?: number;
}

/** One entry of GET /ranking/me/champions — the caller's per-champion standing. */
export interface MyChampionRow {
  championId: string;
  points: number;
  tier: string | number;
  division?: string | number | null;
  rank: number;
}

/** Envelope for GET /ranking/me/champions — `{season,champions}`. */
export interface MyChampionsResp {
  season: string;
  champions: MyChampionRow[];
}

// -------------------------------------------------------- wallet/store ----

export interface Wallet {
  mcoin: number;
  ownedChampions: string[];
  ownedSkins: string[];
  /** championId -> equipped skinId */
  equippedSkins: Record<string, string>;
}

export interface CatalogChampion {
  id: string;
  price: number;
  owned: boolean;
}

export interface CatalogSkin {
  id: string;
  championId: string;
  price: number;
  modelKey: string;
  owned: boolean;
  equipped: boolean;
}

export interface Catalog {
  champions: CatalogChampion[];
  skins: CatalogSkin[];
}

// ------------------------------------------------------------ lobby WS ----

/** Server → client pushes over /api/v1/lobby/ws. */
export interface PresenceMsg {
  type: "presence";
  accountId: string;
  state: string;
}

export interface InviteMsg {
  type: "invite";
  roomId: string;
  roomName: string;
  from: string;
  token: string;
}

export interface ChatMsg {
  type: "chat";
  roomId: string;
  from: string;
  fromName: string;
  text: string;
  at: number;
}

/** One seat reservation of this machine (owner first, then ":pN" guests). */
export interface SeatTokenEntry {
  accountId: string;
  seatToken: string;
}

export interface MatchReadyMsg {
  type: "match_ready";
  matchId: string;
  endpoint: string;
  /** compat: the owner's own token (== seatTokens[0].seatToken) */
  seatToken: string;
  /** couch play: one entry per local player on this machine */
  seatTokens?: SeatTokenEntry[];
}

export interface WsErrorMsg {
  type: "error";
  code: string;
  message: string;
}

export interface HeartbeatAckMsg {
  type: "heartbeat_ack";
}

export type ServerWsMsg =
  | PresenceMsg
  | InviteMsg
  | ChatMsg
  | MatchReadyMsg
  | WsErrorMsg
  | HeartbeatAckMsg;

// ----------------------------------------------------- content (skins) ----

/** content/skins/*.json (skin@1) — fetched for display names/descriptions. */
export interface SkinDoc {
  id: string;
  schema: string;
  championId: string;
  name: string;
  description?: string;
  mcoinPrice: number;
  modelKey: string;
}
