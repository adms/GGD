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
  /** Private-deploy approval state (#126): "pending" | "approved" | "denied" | "" (grandfathered). */
  status?: string;
  /** The caller's OWN authorization roles (e.g. "admin"); omitted for a plain player. */
  roles?: string[];
  /**
   * The caller's OWN single-use personal referral code (#203), display form
   * GGD-XXXX-XXXX. Share it so a friend can register — and, if you are still
   * pending, their successful registration auto-approves you. Omitted on a
   * non-gated deploy (no invite system) or accounts that predate the feature.
   *
   * PRESENT ONLY WHILE THE CODE IS STILL REDEEMABLE (#237). The server withholds
   * it the moment the code is spent/expired/revoked, so this field is safe to
   * put straight into a copy box: if it is here, it works. Read
   * `referralCodeStatus` to find out what happened to a code that is gone.
   */
  referralCode?: string;
  /**
   * Lifecycle of THIS account's personal referral code, derived server-side from
   * the invite store (#237): "active" | "redeemed" | "expired" | "revoked" |
   * "unknown". Present whenever the account has a code at all — including after
   * it was spent, which is the case `referralCode` deliberately stops covering.
   */
  referralCodeStatus?: string;
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
  /** per-room 肉鴿殭屍模式 toggle (#215); absent/undefined === ON (default-ON). */
  rogueliteMobs?: boolean;
}

/** GH#655 —— 邀請時選的陣營意向（Go: `room.SideAlly` / `room.SideEnemy`）。 */
export type InviteSide = "ally" | "enemy";

export interface RoomMember {
  accountId: string;
  ready: boolean;
  isHost: boolean;
  /** couch players on that member's machine (1..4); each claims a seat */
  localPlayers: number;
  /**
   * GH#655 —— 這個人是帶著哪一種邀請進來的。缺席＝從房間列表／集合令走進來的人
   * （沒有意向），也就是這張票之前每一個人的樣子。
   */
  side?: InviteSide;
  /**
   * GH#655 —— 伺服器**現在**打算把他放在哪一隊（0 起算）。
   *
   * ⭐ 它是由**落座那支函式本身**算出來的（Go `room.PlanSeats`），⛔ 不是第二份
   * 推測 —— 所以「想同隊但那一隊滿了」在開打**之前**就看得見，這正是那張票說的
   * 「⛔ 不是靜靜地換邊」。⚠️ 舊的伺服器不送這一格，所以它是 optional。
   */
  team?: number;
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

/**
 * One row of GET /ranking/champion-usage — the lobby 英雄榜 (GH#645, owner
 * 2026-08-24): champions ranked by how many times human players PICKED them
 * (the sort key); `winRate` (0..1, wins/picks over completed matches) rides
 * along as the auxiliary column. Rows arrive already sorted picks-desc.
 */
export interface ChampionUsageRow {
  championId: string;
  picks: number;
  wins: number;
  winRate: number;
}

/** Envelope for GET /ranking/champion-usage — `{rows}`. */
export interface ChampionUsageResp {
  rows: ChampionUsageRow[];
}

/**
 * One row of GET /ranking/me/nemesis — 宿敵排行榜 (GH#454), always stated with
 * the CALLER as the subject: `wins` is 「我贏他幾場」.
 *
 * `username` is empty when the opponent's account no longer exists; the row
 * still ships, because the matches really happened — the panel falls back to
 * the id rather than dropping a rival off the board.
 */
export interface NemesisRow {
  accountId: string;
  username: string;
  played: number;
  wins: number;
  losses: number;
  /** the CALLER's win rate against this rival, 0..1 */
  winRate: number;
  /** 恩怨值 = 2 × min(wins, losses) — 10:0 是 0、5:5 是 10、9:8 是 16 */
  rivalry: number;
  /** RFC3339 timestamp of the last meeting; absent when never (cannot happen on a shipped row) */
  lastAt?: string;
}

/** Envelope for GET /ranking/me/nemesis — `{sort,limit,rivals}`. */
export interface NemesisResp {
  /** the sort the SERVER actually used (an unknown one falls back, and says so) */
  sort: string;
  /** the limit the SERVER actually applied (clamped, and says so) */
  limit: number;
  rivals: NemesisRow[];
}

// -------------------------------------------------------- wallet/store ----

export interface Wallet {
  mcoin: number;
  /** 藍水晶 — the earn-by-playing currency that unlocks champions (#118/#204). */
  crystal: number;
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
  /**
   * ⭐ 大廳集合令 (GH#492) —— 整個大廳都被叫了，所以要開**強制確認視窗**而不是
   * 角落的小提示。缺席 = 一對一的私人邀請（2026-08-21 之前唯一的那種）。
   */
  broadcast?: boolean;
  /** 主揪的名字與積分。owner:「明顯提示**姓名與積分**」—— 收到的人查不到這兩格。 */
  fromName?: string;
  fromMmr?: number;
  /**
   * **伺服器蓋的**倒數截止時間（unix ms）。⛔ 不可以用「我收到訊息的那一刻 + 10 秒」
   * 代替：sockets 送達時間不同，各自起算會讓比賽已經開打而某個人的視窗還在數。
   */
  expiresAt?: number;
  /** 倒數的**跨距**（秒）—— 進度條要它，光有終點畫不出來。 */
  waitSec?: number;
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
