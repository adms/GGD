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
