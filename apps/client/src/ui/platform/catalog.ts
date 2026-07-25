/**
 * Catalog derivation helpers — group the flat /store/catalog response into
 * per-champion rows with owned/equipped badges, and build the equipped-skin
 * modelKey override map handed to the match scene (client-side visual only;
 * a server-authoritative skin field on the seat is future work).
 */
import type { ChampionDisplay } from "./championDisplay";
import { championDisplayFrom } from "./championDisplay";
import { CHAMPION_CURRENCY, SKIN_CURRENCY, type StoreCurrency } from "./currency";
import type { Catalog, CatalogSkin, SkinDoc, Wallet } from "./types";

export interface SkinRow extends CatalogSkin {
  /** display name/description from the content skin doc (id fallback) */
  name: string;
  description: string;
  /** 造型 are bought with M幣 — see currency.ts for the owner's rule. */
  currency: StoreCurrency;
}

export interface ChampionRow {
  id: string;
  price: number;
  owned: boolean;
  /**
   * 英雄解鎖 is paid in 藍水晶 (#118/#227). Carried on the ROW rather than
   * decided in the markup so the price glyph, the affordability check and the
   * confirm dialog cannot disagree — the exact drift that let the store print
   * an M幣 price for a crystal-priced champion.
   */
  currency: StoreCurrency;
  /**
   * Task #227 — the PLAYER-FACING strings. The Go catalog only carries id+price
   * for champions, so these come from the content bundle via the injected
   * `championDisplay` lookup (see championDisplay.ts). Nothing that renders a
   * champion row may reach for `id` again: `name`/`fullName` already fall back
   * to the id when no doc is registered, so the id path stays a FALLBACK
   * instead of being the default.
   */
  name: string;
  title: string | null;
  fullName: string;
  blurb: string;
  /** false ⇒ no content doc was found and `name` is the raw id */
  named: boolean;
  skins: SkinRow[];
}

/** Fallback lookup: id-only display, i.e. exactly the pre-#227 behaviour. */
const idOnlyDisplay = (id: string): ChampionDisplay => championDisplayFrom(id);

/**
 * Merge catalog + content docs into champion-grouped store rows.
 *
 * `championDisplay` is INJECTED (same pattern as `buildSkinOverrides`'s
 * `baseModelKeyFor`) so this module stays registry-agnostic and unit-testable;
 * the real callers pass `championDisplayFor` and MUST re-run this whenever
 * `useContentReady()` flips, or they snapshot an empty registry and print ids.
 */
export function deriveStoreRows(
  catalog: Catalog,
  skinDocs: Map<string, SkinDoc>,
  championDisplay: (id: string) => ChampionDisplay = idOnlyDisplay,
): ChampionRow[] {
  const rows: ChampionRow[] = catalog.champions.map((c) => ({
    id: c.id,
    price: c.price,
    owned: c.owned,
    currency: CHAMPION_CURRENCY,
    ...championDisplay(c.id),
    skins: [],
  }));
  const byChampion = new Map(rows.map((r) => [r.id, r]));
  for (const sk of catalog.skins) {
    const doc = skinDocs.get(sk.id);
    const row: SkinRow = {
      ...sk,
      name: doc?.name ?? sk.id,
      description: doc?.description ?? "",
      currency: SKIN_CURRENCY,
    };
    let champ = byChampion.get(sk.championId);
    if (!champ) {
      // skin for a champion missing from championPrices — still sellable, and
      // still named from content (the store.json omission must not cost the
      // player the champion's name).
      champ = {
        id: sk.championId,
        price: 0,
        owned: true,
        currency: CHAMPION_CURRENCY,
        ...championDisplay(sk.championId),
        skins: [],
      };
      byChampion.set(sk.championId, champ);
      rows.push(champ);
    }
    champ.skins.push(row);
  }
  for (const r of rows) r.skins.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

/**
 * Equipped-skin substitution map for the match scene:
 *   base champion modelKey → equipped skin modelKey.
 * baseModelKeyFor resolves championId → modelKey via the shared champion
 * registry (injected so this stays registry-agnostic and unit-testable).
 */
export function buildSkinOverrides(
  wallet: Pick<Wallet, "equippedSkins" | "ownedSkins">,
  skins: CatalogSkin[],
  baseModelKeyFor: (championId: string) => string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  const skinById = new Map(skins.map((s) => [s.id, s]));
  for (const [championId, skinId] of Object.entries(wallet.equippedSkins ?? {})) {
    if (!skinId) continue;
    if (!wallet.ownedSkins?.includes(skinId)) continue; // never render unowned
    const skin = skinById.get(skinId);
    if (!skin || skin.championId !== championId) continue;
    const baseKey = baseModelKeyFor(championId);
    if (!baseKey || !skin.modelKey || skin.modelKey === baseKey) continue;
    out.set(baseKey, skin.modelKey);
  }
  return out;
}
