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
 * RULE 1 (owner, task #70, stated twice): 只有最終合成武器才能上架可直接購買
 * (有製作書的) — the shop lists ONLY final crafted weapons. This is now read
 * off the `craftRole` marker recovered from the source-map triggers, NOT from
 * cost or name. The previous pass filtered on `cost > 0`, which let 96 recipe
 * components and 54 no-op recipe books onto the shelf and put the quest item
 * 魔戒 on sale for 300g — because cost encodes neither craft stage nor quest
 * provenance. See tools/w3x-import/extract_item_roles.py for how the marker is
 * derived, and packages/shared/src/sim/content/defs.ts for the role vocabulary.
 *
 * Buyable = `craftRole === "final"` OR a shop SERVICE (傳說寶玉 / 能力屬性強化,
 * which are mechanics, not weapons). Nothing else — no components, no books, no
 * quest items, no direct/token/none items — may ever be listed.
 *
 * When the whitelist is ENFORCED the operator's list narrows the buyable set
 * further, but can never WIDEN it past the final/service rule: a mis-curated
 * whitelist cannot resurrect the old "every priced item" shop.
 */
export function shopCatalogue<T extends { id: string; cost?: number; craftRole?: string }>(
  items: readonly T[],
  wl: Whitelist,
): T[] {
  const buyable = items.filter((i) => i.craftRole === "final" || isShopService(i.id));
  if (wl.enforced) return applyItemWhitelist(buyable, wl);
  // Unenforced / offline dev is where the shop actually gets played, and the
  // final/service rule holds there too. The ONLY concession is the bare
  // skeleton box (unit tests, `pnpm dev` with no imported content): if not a
  // single final-role item is loaded, fall back to the demo stat sticks so the
  // shop is not an empty grid. Real matches always load the 34 map finals, so
  // this branch never runs in the product.
  if (buyable.some((i) => i.craftRole === "final")) return buyable;
  const services = items.filter((i) => isShopService(i.id));
  const demo = items.filter((i) => (i.cost ?? 0) > 0 && !isShopService(i.id));
  return demo.length > 0 ? [...services, ...demo] : [...items];
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
