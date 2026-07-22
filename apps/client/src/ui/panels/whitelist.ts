/**
 * Client whitelist fetch — reads the operator-curated content whitelist from
 * the platform ONCE per match and exposes it to champ-select / the shop.
 *
 * Contract: GET /api/v1/curation/whitelist ({ champions, items, abilities }).
 * The game-server is the authority; the client filters purely so a player is
 * never shown — or lets them pick — content the server would reject.
 *
 * "Once per match": the fetch is keyed by matchId and memoised, so re-renders
 * and remounts of the panels share a single request. An unreachable platform
 * (offline / bare `pnpm dev` with no platform up) resolves to NO_FILTER, i.e.
 * the full roster, so local play is never blocked — the empty-state only shows
 * when the platform successfully reports an empty whitelist.
 */
import { useEffect, useState } from "react";
import { useHud } from "../../net/RoomStore";
import { NO_FILTER, whitelistFromDoc, type Whitelist } from "./champSelectFilter";

/** Platform read endpoint (same-origin; dev vite proxies /api → :8080). */
export const WHITELIST_URL = "/api/v1/curation/whitelist";

/** Fetch + parse the whitelist; any failure → NO_FILTER (offline/dev safe). */
export async function fetchWhitelist(
  url: string = WHITELIST_URL,
  fetchFn: typeof fetch = (...a: Parameters<typeof fetch>) => fetch(...a),
): Promise<Whitelist> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return NO_FILTER;
    return whitelistFromDoc(await res.json());
  } catch {
    return NO_FILTER;
  }
}

/** Per-match memo so both panels (and re-renders) share one fetch. */
interface CacheEntry {
  matchId: string;
  promise: Promise<Whitelist>;
  value: Whitelist | null;
}
let cache: CacheEntry | null = null;

/** Resolve the whitelist for a match, fetching at most once per matchId. */
export function whitelistForMatch(matchId: string): Promise<Whitelist> {
  if (cache && cache.matchId === matchId) return cache.promise;
  const entry: CacheEntry = { matchId, value: null, promise: Promise.resolve(NO_FILTER) };
  entry.promise = fetchWhitelist().then((wl) => {
    entry.value = wl;
    return wl;
  });
  cache = entry;
  return entry.promise;
}

/** Test-only: forget the memo so a fresh fetch runs. */
export function __resetWhitelistCache(): void {
  cache = null;
}

export interface WhitelistState {
  whitelist: Whitelist;
  /** true until the first fetch for the current match resolves */
  loading: boolean;
}

/**
 * React hook: the whitelist for the current match. Keyed on the HUD matchId so
 * a new match re-fetches; while the first fetch is in flight `loading` is true
 * and the panels show a neutral loading note rather than flashing a full roster
 * they may then have to cull.
 */
export function useWhitelist(): WhitelistState {
  const matchId = useHud((s) => s.matchId);
  const cachedValue = cache && cache.matchId === matchId ? cache.value : null;
  const [state, setState] = useState<WhitelistState>(
    cachedValue ? { whitelist: cachedValue, loading: false } : { whitelist: NO_FILTER, loading: true },
  );

  useEffect(() => {
    let alive = true;
    const hit = cache && cache.matchId === matchId ? cache.value : null;
    if (hit) {
      setState({ whitelist: hit, loading: false });
      return;
    }
    setState((s) => ({ whitelist: s.whitelist, loading: true }));
    void whitelistForMatch(matchId).then((wl) => {
      if (alive) setState({ whitelist: wl, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [matchId]);

  return state;
}
