/** Shared response/entity types mirroring the platform admin API envelopes. */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionResp {
  account: { id: string; username: string };
  tokens: TokenPair;
}

export interface AccountRow {
  id: string;
  username: string;
  email: string;
  mmr: number;
  games: number;
  wins: number;
  mcoin: number;
  banned: boolean;
  banReason?: string;
  roles: string[];
  createdAt: string;

  /**
   * The #126 private-deploy approval state: "pending", "approved", "denied", or
   * "" for an account that predates the gate (grandfathered — see `approved`).
   *
   * OPTIONAL on purpose, even though the platform's admin.AccountRow always
   * emits it (never omitempty, deliberately — see its Go doc comment). Optional
   * here means the CONSOLE can tell three states apart instead of two:
   *   • "pending"/"approved"/"denied" — the server answered.
   *   • ""                            — the server answered "grandfathered".
   *   • undefined                     — the server build predates the gate and
   *                                     does not report approval at all.
   * Typing it as a required `string` would collapse the last two into "" and
   * the console would confidently render 免審核 for a platform that has no idea
   * what approval is. ../approvals.ts is where that distinction is decided
   * once; nothing else may re-derive it.
   */
  status?: string;
  /**
   * Mirrors the platform's account.IsApproved(): may this account get a session
   * RIGHT NOW under the gate. Derived server-side so the console never
   * re-implements the grandfathering rule ("" or "approved") and drifts from it.
   */
  approved?: boolean;

  /**
   * #246 上線燈號 — the last moment this account did ANYTHING on an
   * authenticated session (any REST call, the lobby socket opening, or one of
   * its heartbeats). ISO-8601.
   *
   * OPTIONAL for the same reason `status` is: an ABSENT field is a real,
   * distinct answer. The platform omits it entirely for an account that has
   * never been seen, and a server build that predates #246 omits it for
   * everyone — both correctly render as「沒有記錄」, so the console degrades to
   * "no light" instead of confidently drawing a dark one against a timestamp it
   * invented. ./players.ts `seenState` is where that is decided once.
   */
  lastSeenAt?: string;
  /**
   * #246 second tooltip line — the LIVE lobby-socket state straight out of
   * Redis: "in-match" | "in-lobby" | "online" | "offline".
   *
   * Absent means the presence source could not be read (Redis restarted, or an
   * older server build). That is deliberately NOT the same as "offline": the
   * page then shows the last-seen line alone rather than claiming the player is
   * disconnected. Fail-open, never an error banner — this is a decoration on a
   * row, and it must never keep the row from rendering.
   */
  presence?: string;
}

export interface AccountSearch {
  accounts: AccountRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Wallet {
  mcoin: number;
  ownedChampions: string[];
  ownedSkins: string[];
  equippedSkins: Record<string, string>;
}

export interface Profile {
  account: AccountRow;
  updatedAt: string;
  wallet: Wallet;
  friendsCount: number;
}

export interface MatchSeat {
  accountId: string;
  team: number;
  isBot?: boolean;
}

export interface MatchRecord {
  matchId: string;
  mode: string;
  mapId?: string;
  status: string;
  placements?: { team: number; place: number }[];
  seats?: MatchSeat[];
  endedAt: string;
}

export interface MatchList {
  matches: MatchRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  adminId: string;
  action: string;
  targetId: string;
  detail?: Record<string, unknown>;
  ts: string;
}

export interface AuditList {
  entries: AuditEntry[];
  page: number;
  pageSize: number;
  total: number;
}
