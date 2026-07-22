/**
 * codexSearch — the pure browse layer of the 內容圖鑑: search, filters, facet
 * counts, ordering, and the row-window math that keeps 879 entries cheap.
 *
 * No React, no fetch, no DOM: every function here is a total function of the
 * already-fetched entries, which is what makes the codex's behaviour testable
 * without a browser (the client's vitest env is node).
 *
 * ORDERING is deliberate, not incidental. Champions and abilities sort by hero
 * 編號 because that is the IDENTITY of a character in this content set (task
 * #55) and the way the user reasons about it; abilities then order Q→W→E→R→EX
 * so a hero's kit reads in kit order. Items sort by tier then cost, the axis a
 * shop reader actually scans.
 */
import type {
  CodexAbility,
  CodexChampion,
  CodexEntry,
  CodexItem,
  CodexKind,
  CodexSlot,
  CodexWhitelist,
} from "@ggd/shared/codex/codexTypes";

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

/**
 * Substring match over the entry's precomputed `searchKey`, ALL whitespace-
 * separated tokens required (so 「20 saber」 narrows). ASCII is matched case-
 * insensitively; CJK is exact-substring, matching champSelectFilter's contract.
 */
export function matchesQuery(entry: { searchKey: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return q.split(/\s+/).every((token) => entry.searchKey.includes(token));
}

export function searchEntries<T extends { searchKey: string }>(entries: readonly T[], query: string): T[] {
  const q = query.trim();
  if (q === "") return [...entries];
  return entries.filter((e) => matchesQuery(e, q));
}

// ---------------------------------------------------------------------------
// curation state
// ---------------------------------------------------------------------------

/**
 * "enabled" = the operator whitelisted it; "disabled" = the operator did not;
 * "unknown" = no whitelist was fetched (offline / platform down), which must
 * never be rendered as "disabled" — a codex that cannot say 「存在但未啟用」
 * would mislead, and one that says 「未啟用」 when it simply does not know
 * would mislead worse.
 */
export type EnabledState = "enabled" | "disabled" | "unknown";

export function enabledState(wl: CodexWhitelist, kind: CodexKind, id: string): EnabledState {
  if (!wl.enforced) return "unknown";
  const set = kind === "item" ? wl.items : kind === "champion" ? wl.champions : wl.abilities;
  return set.has(id) ? "enabled" : "disabled";
}

export type EnabledFilter = "all" | "enabled" | "disabled";

export function matchesEnabled(state: EnabledState, filter: EnabledFilter): boolean {
  if (filter === "all") return true;
  // With no whitelist there is nothing to filter ON — keep every row visible
  // rather than silently emptying the list.
  if (state === "unknown") return true;
  return state === filter;
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

export const ALL = "all" as const;
export type Any = typeof ALL;

export interface ItemFilter {
  query: string;
  bucket: string | Any;
  tier: string | Any;
  enabled: EnabledFilter;
}
export interface ChampionFilter {
  query: string;
  role: string | Any;
  heroNumber: string | Any;
  enabled: EnabledFilter;
}
export interface AbilityFilter {
  query: string;
  slot: string | Any;
  heroNumber: string | Any;
  enabled: EnabledFilter;
}

export const EMPTY_ITEM_FILTER: ItemFilter = { query: "", bucket: ALL, tier: ALL, enabled: ALL };
export const EMPTY_CHAMPION_FILTER: ChampionFilter = { query: "", role: ALL, heroNumber: ALL, enabled: ALL };
export const EMPTY_ABILITY_FILTER: AbilityFilter = { query: "", slot: ALL, heroNumber: ALL, enabled: ALL };

/** The 編號 bucket an unnumbered entry falls into (shown as 「無編號」). */
export const NO_NUMBER = "—";

function heroKey(n: string | null): string {
  return n ?? NO_NUMBER;
}

export function filterItems(items: readonly CodexItem[], f: ItemFilter, wl: CodexWhitelist): CodexItem[] {
  return items.filter(
    (it) =>
      matchesQuery(it, f.query) &&
      (f.bucket === ALL || it.bucket === f.bucket) &&
      (f.tier === ALL || String(it.tier) === f.tier) &&
      matchesEnabled(enabledState(wl, "item", it.id), f.enabled),
  );
}

export function filterChampions(
  champions: readonly CodexChampion[],
  f: ChampionFilter,
  wl: CodexWhitelist,
): CodexChampion[] {
  return champions.filter(
    (c) =>
      matchesQuery(c, f.query) &&
      (f.role === ALL || c.role === f.role) &&
      (f.heroNumber === ALL || heroKey(c.heroNumber) === f.heroNumber) &&
      matchesEnabled(enabledState(wl, "champion", c.id), f.enabled),
  );
}

export function filterAbilities(
  abilities: readonly CodexAbility[],
  f: AbilityFilter,
  wl: CodexWhitelist,
): CodexAbility[] {
  return abilities.filter(
    (a) =>
      matchesQuery(a, f.query) &&
      (f.slot === ALL || a.slot === f.slot) &&
      (f.heroNumber === ALL || heroKey(a.heroNumber) === f.heroNumber) &&
      matchesEnabled(enabledState(wl, "ability", a.id), f.enabled),
  );
}

// ---------------------------------------------------------------------------
// facets (filter dropdown options, with live counts)
// ---------------------------------------------------------------------------

export interface Facet {
  value: string;
  count: number;
}

/** Distinct values of `pick` with counts, ordered by `compare` (default: value). */
export function facets<T>(
  entries: readonly T[],
  pick: (e: T) => string,
  compare: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): Facet[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const v = pick(e);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => compare(a[0], b[0])).map(([value, count]) => ({ value, count }));
}

/** 編號 ordering: numeric ascending, with the unnumbered bucket last. */
export function compareHeroNumber(a: string, b: string): number {
  if (a === b) return 0;
  if (a === NO_NUMBER) return 1;
  if (b === NO_NUMBER) return -1;
  return Number(a) - Number(b);
}

export function heroNumberFacets(entries: readonly { heroNumber: string | null }[]): Facet[] {
  return facets(entries, (e) => heroKey(e.heroNumber), compareHeroNumber);
}

// ---------------------------------------------------------------------------
// ordering
// ---------------------------------------------------------------------------

const SLOT_ORDER: Record<CodexSlot, number> = { Q: 0, W: 1, E: 2, R: 3, EX: 4 };

export function compareItems(a: CodexItem, b: CodexItem): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.cost !== b.cost) return a.cost - b.cost;
  return a.id.localeCompare(b.id);
}

export function compareChampions(a: CodexChampion, b: CodexChampion): number {
  const byNumber = compareHeroNumber(heroKey(a.heroNumber), heroKey(b.heroNumber));
  if (byNumber !== 0) return byNumber;
  return a.id.localeCompare(b.id);
}

export function compareAbilities(a: CodexAbility, b: CodexAbility): number {
  const byNumber = compareHeroNumber(heroKey(a.heroNumber), heroKey(b.heroNumber));
  if (byNumber !== 0) return byNumber;
  const byChampion = (a.championId ?? "").localeCompare(b.championId ?? "");
  if (byChampion !== 0) return byChampion;
  const bySlot = SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
  return bySlot !== 0 ? bySlot : a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// virtualisation
// ---------------------------------------------------------------------------

export interface RowWindow {
  /** first row index to mount (inclusive) */
  start: number;
  /** last row index to mount (exclusive) */
  end: number;
  /** spacer height above the mounted rows, px */
  padTop: number;
  /** spacer height below the mounted rows, px */
  padBottom: number;
}

/**
 * Which rows a fixed-row-height list must actually mount for a given scroll
 * position. At 879 entries mounting everything is what makes a "codex" a
 * stutter; this keeps it to ~viewport + overscan rows.
 *
 * Total list height is always `count * rowHeight`, so `padTop + rendered +
 * padBottom` is invariant and the scrollbar never jumps.
 */
export function rowWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 6,
): RowWindow {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const top = Math.max(0, scrollTop);
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + overscan * 2 + 1;
  const start = Math.min(first, Math.max(0, count - 1));
  const end = Math.min(count, start + visible);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}

/** Scroll offset that puts row `index` at the top of the window (clamped). */
export function scrollTopForRow(index: number, rowHeight: number, count: number, viewportHeight: number): number {
  const max = Math.max(0, count * rowHeight - viewportHeight);
  return Math.max(0, Math.min(index * rowHeight, max));
}

// ---------------------------------------------------------------------------
// lookup
// ---------------------------------------------------------------------------

/** id → entry, for the cross-links (champion → abilities → owner → items). */
export function indexById<T extends CodexEntry>(entries: readonly T[]): Map<string, T> {
  return new Map(entries.map((e) => [e.id, e]));
}
