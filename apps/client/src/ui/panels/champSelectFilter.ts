/**
 * Pure, testable logic for the champion-select roster: substring filtering
 * (Chinese/CJK names included — plain substring, no locale casing tricks) and
 * uniform-random pick. No React / registry imports so it unit-tests cleanly.
 */
import { isShopService } from "@ggd/shared/sim/economy/itemTiers";

export interface RosterChampion {
  id: string;
  name: string;
  role?: string;
  tags?: readonly string[];
  /** w3x icon path ("assets/icons/…") — absent for stock-art heroes */
  icon?: string;
}

/**
 * Filter `champs` to those whose name (or id/role/tag) contains `query` as a
 * substring, case-insensitively for ASCII. An empty/whitespace query returns
 * the list unchanged. CJK matching is exact-substring (e.g. "亞瑟" ⊂ "亞瑟王").
 */
export function filterChampions<T extends RosterChampion>(champs: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...champs];
  return champs.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.id.toLowerCase().includes(q)) return true;
    if (c.role && c.role.toLowerCase().includes(q)) return true;
    return (c.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });
}

/**
 * Uniform-random pick from `ids`. `rng` defaults to Math.random and must return
 * [0, 1); injectable for deterministic tests. Returns null for an empty list.
 */
export function pickRandomId(ids: readonly string[], rng: () => number = Math.random): string | null {
  if (ids.length === 0) return null;
  const i = Math.floor(rng() * ids.length);
  // guard the rng()===1 edge so we never index out of range
  return ids[Math.min(i, ids.length - 1)] ?? null;
}

// ---------------------------------------------------------------------------
// Content whitelist (curation contract).
//
// The platform serves an operator-curated whitelist at
// GET /api/v1/curation/whitelist ({ champions, items, abilities }). The
// game-server is the authority; the client renders only whitelisted entries so
// a player never sees — or picks — a champion the server would reject.
//
// DEFAULT-EMPTY is the contract: a fresh install enables nothing. But we must
// distinguish "operator enabled nothing" (→ empty-state message) from
// "platform unreachable in offline/dev" (→ no filter, full roster). So an
// unreachable fetch yields `enforced: false` (allow all) while a successful
// fetch — even of an empty doc — yields `enforced: true`.
// ---------------------------------------------------------------------------

/** A whitelist snapshot for one match (id membership sets + the enforce flag). */
export interface Whitelist {
  /** false = not fetched / offline / dev → no filtering (allow everything) */
  enforced: boolean;
  champions: ReadonlySet<string>;
  items: ReadonlySet<string>;
  abilities: ReadonlySet<string>;
}

/** Permissive default: allow everything (used until/unless a doc is fetched). */
export const NO_FILTER: Whitelist = {
  enforced: false,
  champions: new Set(),
  items: new Set(),
  abilities: new Set(),
};

function toStringSet(v: unknown): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x !== "") out.add(x);
  return out;
}

/**
 * Build an ENFORCED whitelist from a fetched doc. A successfully-read doc is
 * always enforced, even when empty (that is the fresh-install empty-state);
 * only an unreachable platform maps to {@link NO_FILTER} (see useWhitelist).
 */
export function whitelistFromDoc(raw: unknown): Whitelist {
  if (raw === null || typeof raw !== "object") return NO_FILTER;
  const d = raw as Record<string, unknown>;
  return {
    enforced: true,
    champions: toStringSet(d["champions"]),
    items: toStringSet(d["items"]),
    abilities: toStringSet(d["abilities"]),
  };
}

/**
 * Restrict a champion roster to the whitelist. Not enforced → unchanged. The
 * existing search/random then operate on top of this filtered set.
 */
export function applyChampionWhitelist<T extends RosterChampion>(
  champs: readonly T[],
  wl: Whitelist,
): T[] {
  if (!wl.enforced) return [...champs];
  return champs.filter((c) => wl.champions.has(c.id));
}

/** Whitelisted subset of champion ids (for the 🎲 random pick). */
export function whitelistedChampionIds(ids: readonly string[], wl: Whitelist): string[] {
  if (!wl.enforced) return [...ids];
  return ids.filter((id) => wl.champions.has(id));
}

/** Restrict an item catalogue to the whitelist (ShopPanel). */
export function applyItemWhitelist<T extends { id: string }>(items: readonly T[], wl: Whitelist): T[] {
  if (!wl.enforced) return [...items];
  return items.filter((i) => wl.items.has(i.id));
}

/**
 * The shop catalogue for one match.
 *
 * When the whitelist is ENFORCED it is the whole policy — the operator's list
 * is the catalogue, and nothing else may narrow it. The `godie-` prefix rule
 * below is a fallback for the UNENFORCED case only (offline / bare `pnpm dev`
 * / unit tests), where it hides the self-created skeleton demo items
 * (ember-rod/…) once a real imported catalogue is loaded.
 *
 * Applying the prefix rule underneath an enforced whitelist is what broke the
 * demo bundle: `swift-boots` and `serrated-edge` are whitelisted but carry no
 * `godie-` prefix, so the shop silently dropped them — while the AI kept
 * buying them off `buildPriority`, i.e. bots bought items no human could see.
 */
export function shopCatalogue<T extends { id: string; cost?: number }>(items: readonly T[], wl: Whitelist): T[] {
  // A 0g item is NOT a shop entry (task #82): the draft/legendary surfaces are
  // whitelisted so the round-2/round-5 cards can offer them, so they arrive
  // here on the enforced path too — and the sim refuses to sell them. Listing
  // them would show 29 legendaries at "0 g" next to a dead button.
  items = items.filter((i) => i.cost === undefined || i.cost > 0);
  if (wl.enforced) return applyItemWhitelist(items, wl);
  // The two SHOP SERVICES (傳說寶玉 / 能力屬性強化) are MECHANICS, not imported
  // content, so the `godie-` fallback would hide them exactly where they are
  // most needed — offline dev, which is where the shop gets played. They are
  // re-admitted explicitly rather than by loosening the prefix rule, which
  // would let the skeleton demo items back in with them.
  const services = items.filter((i) => isShopService(i.id));
  const imported = items.filter((i) => i.id.startsWith("godie-"));
  return imported.length > 0 ? [...services, ...imported] : [...items];
}

/**
 * True when the whitelist is enforced and yields ZERO champions from the given
 * roster — the champ-select empty-state trigger. Per CONTRACT the panel shows
 * an ACTIONABLE recovery path (/admin/ → 內容白名單 → ⭐ 啟用示範組合 → 儲存,
 * or `make seed-demo`) rather than a broken empty grid.
 */
export function isChampRosterEmpty(champs: readonly RosterChampion[], wl: Whitelist): boolean {
  return wl.enforced && applyChampionWhitelist(champs, wl).length === 0;
}
