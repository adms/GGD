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
