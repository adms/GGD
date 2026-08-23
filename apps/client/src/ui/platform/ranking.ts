/**
 * ranking.ts — PURE view logic behind the ranked-ladder panel (task #37). No
 * React / no DOM, so every branch unit-tests in the node vitest env exactly
 * like lobbyReducer.ts / champSelectFilter.ts. Holds:
 *   - the panel's UI-state reducer (player/champion tab, champion sub-view,
 *     champion picker selection + open state),
 *   - "load more" pagination merge/offset math,
 *   - the "you" row-highlight predicate,
 *   - champion-picker option building + icon-absent fallback,
 *   - my-champions sorting,
 *   - a fetch orchestrator so a picker selection can be tested against a mock.
 *
 * Response shapes mirror the CONTRACT (points/tier/division per row); `tier`
 * and `division` stay loose (string|number) and are interpreted by
 * ../components/tier so the backend's exact encoding never breaks the UI.
 */
import type { RankLadderRow, PlayerMeStanding, MyChampionRow } from "./types";

// re-export the API shapes so panel + tests import them from one place
export type { RankLadderRow, PlayerMeStanding, MyChampionRow };

// --------------------------------------------------------------- panel ui-state

export type RankTab = "player" | "champion";
export type ChampionView = "board" | "mine";

export const RANK_TABS: readonly RankTab[] = ["player", "champion"] as const;

export interface RankPanelState {
  tab: RankTab;
  championView: ChampionView;
  /** currently-inspected champion id for the champion board (null = none yet) */
  selectedChampionId: string | null;
  /** whether the champion picker overlay is open */
  pickerOpen: boolean;
}

export const initialRankPanelState: RankPanelState = {
  tab: "player",
  championView: "board",
  selectedChampionId: null,
  pickerOpen: false,
};

export type RankPanelAction =
  | { type: "setTab"; tab: RankTab }
  | { type: "setChampionView"; view: ChampionView }
  | { type: "selectChampion"; championId: string }
  | { type: "clearChampion" }
  | { type: "togglePicker" }
  | { type: "setPicker"; open: boolean };

/**
 * Pure reducer for the panel's local UI state. Selecting a champion also closes
 * the picker and forces the champion sub-view to the board (you just picked one
 * to look at). Unknown actions return the same reference (no needless re-render).
 */
export function rankPanelReducer(state: RankPanelState, action: RankPanelAction): RankPanelState {
  switch (action.type) {
    case "setTab":
      if (state.tab === action.tab) return state;
      return { ...state, tab: action.tab, pickerOpen: false };
    case "setChampionView":
      if (state.championView === action.view) return state;
      return { ...state, championView: action.view, pickerOpen: false };
    case "selectChampion":
      return {
        ...state,
        selectedChampionId: action.championId,
        championView: "board",
        pickerOpen: false,
      };
    // GH#645: the champion board no longer NEEDS a selection (it lands on the
    // pick-count usage board); a selection is a drill-down, and this is the
    // way back up to the usage board.
    case "clearChampion":
      if (state.selectedChampionId === null) return state;
      return { ...state, selectedChampionId: null, pickerOpen: false };
    case "togglePicker":
      return { ...state, pickerOpen: !state.pickerOpen };
    case "setPicker":
      if (state.pickerOpen === action.open) return state;
      return { ...state, pickerOpen: action.open };
    default:
      return state;
  }
}

// ------------------------------------------------------------------- pagination

export const PAGE_SIZE = 25;

/**
 * Merge a freshly-fetched page onto the rows already shown, de-duplicating by
 * accountId (a rank shift between requests can re-list someone) while keeping
 * first-seen order. Used by the player + champion board "load more".
 */
export function appendPage<T extends { accountId: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(prev.map((r) => r.accountId));
  const out = [...prev];
  for (const row of next) {
    if (seen.has(row.accountId)) continue;
    seen.add(row.accountId);
    out.push(row);
  }
  return out;
}

/** A full page came back → assume there may be more. */
export function hasMore(pageLen: number, limit: number = PAGE_SIZE): boolean {
  return pageLen >= limit && limit > 0;
}

/** Offset for the next page given how many rows are already loaded. */
export function nextOffset(loadedCount: number): number {
  return Math.max(0, loadedCount);
}

// ------------------------------------------------------------ you-row highlight

/** True when a ladder row belongs to the signed-in caller (highlight it). */
export function isMeRow(row: { accountId: string }, meId: string | null | undefined): boolean {
  return !!meId && row.accountId === meId;
}

/** Whether the caller already appears in the loaded rows (so a pinned "you" row is redundant). */
export function meInPage(rows: readonly { accountId: string }[], meId: string | null | undefined): boolean {
  return !!meId && rows.some((r) => r.accountId === meId);
}

// ---------------------------------------------------------- champion picker opts

export interface RosterEntry {
  id: string;
  name: string;
  icon?: string;
}

export interface ChampOption {
  id: string;
  name: string;
  /** resolved icon path or null (absent w3x art → picker shows the letter tile) */
  icon: string | null;
}

/**
 * Build champion-picker options from the shared roster, sorted by display name.
 * Icon-less (Blizzard stock-art) champions carry `icon: null` so the UI drops to
 * its letter-tile fallback instead of a broken image.
 */
export function buildChampionOptions(roster: readonly RosterEntry[]): ChampOption[] {
  return roster
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** First visible character of a champion name — the letter-tile fallback glyph. */
export function championInitial(name: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed === "") return "?";
  return [...trimmed][0] ?? "?";
}

// --------------------------------------------------------------- my champions

/**
 * Sort the caller's per-champion standings by points (desc), breaking ties by
 * server rank (asc) then championId so the order is stable/deterministic.
 */
export function sortMyChampions(rows: readonly MyChampionRow[]): MyChampionRow[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.championId.localeCompare(b.championId);
  });
}

// ------------------------------------------------- champion usage board ----

/**
 * 勝率 cell of the 英雄榜 (GH#645): "33%", or "—" when the champion has no
 * completed picks (a 0/0 winrate rendered as "0%" would read as "always
 * loses" — a said-but-not-true label, 第一·五守則).
 */
export function formatUsageWinRate(row: { picks: number; winRate: number }): string {
  if (row.picks <= 0) return "—";
  return `${Math.round(row.winRate * 100)}%`;
}

// -------------------------------------------------- post-match rank delta ----
// The victory-settlement "查看戰績變化" flow snapshots the caller's standing when
// a match launches, then compares it to the freshly-refreshed standing after the
// match. The game server never sends points/tier deltas (those are the platform's
// job); this derives them client-side from before/after standings so the
// leaderboard screen can highlight what changed. Pure + node-testable.

export interface RankDelta {
  pointsBefore: number | null;
  pointsAfter: number | null;
  /** after − before, or null when either side is unknown (unplaced/offline). */
  pointsGain: number | null;
  tierBefore: string | number | null;
  tierAfter: string | number | null;
  /** the displayed rank crest changed — tier OR division (e.g. gold II → gold I). */
  tierChanged: boolean;
  rankBefore: number | null;
  rankAfter: number | null;
  /** placement climbed: before − after (positive = moved UP the ladder). */
  rankGain: number | null;
}

/** Compare two standings (pre/post match) into a display-ready delta. */
export function computeRankDelta(
  before: PlayerMeStanding | null | undefined,
  after: PlayerMeStanding | null | undefined,
): RankDelta {
  const pointsBefore = before ? before.points : null;
  const pointsAfter = after ? after.points : null;
  const rankBefore = before ? before.rank : null;
  const rankAfter = after ? after.rank : null;
  const tierBefore = before ? before.tier : null;
  const tierAfter = after ? after.tier : null;
  return {
    pointsBefore,
    pointsAfter,
    pointsGain: pointsBefore !== null && pointsAfter !== null ? pointsAfter - pointsBefore : null,
    tierBefore,
    tierAfter,
    tierChanged:
      before !== null &&
      before !== undefined &&
      after !== null &&
      after !== undefined &&
      (String(tierBefore) !== String(tierAfter) ||
        String(before.division ?? "") !== String(after.division ?? "")),
    rankBefore,
    rankAfter,
    rankGain: rankBefore !== null && rankAfter !== null ? rankBefore - rankAfter : null,
  };
}

/** Signed point-gain label: "+18", "-5", "0", or "—" when unknown. */
export function formatPointsDelta(gain: number | null): string {
  if (gain === null) return "—";
  return gain > 0 ? `+${gain}` : `${gain}`;
}

// ------------------------------------------------------------ fetch orchestrator

/** Signature of the champion-board fetcher (api.ts binds the real one). */
export type ChampionBoardFetcher = (
  championId: string,
  limit: number,
  offset: number,
) => Promise<RankLadderRow[]>;

export interface ChampionBoardResult {
  rows: RankLadderRow[];
  hasMore: boolean;
}

/**
 * Load one page of a champion's board through an injected fetcher and compute
 * whether more pages remain. Selecting a champion in the picker runs this — the
 * test asserts the fetcher is called with the chosen championId.
 */
export async function loadChampionBoard(
  championId: string,
  opts: { limit?: number; offset?: number },
  fetcher: ChampionBoardFetcher,
): Promise<ChampionBoardResult> {
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const rows = await fetcher(championId, limit, offset);
  return { rows, hasMore: hasMore(rows.length, limit) };
}
