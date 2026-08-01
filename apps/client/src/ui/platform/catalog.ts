/**
 * Catalog derivation helpers — group the flat /store/catalog response into
 * per-champion rows with owned/equipped badges, and build the equipped-skin
 * modelKey override map handed to the match scene (client-side visual only;
 * a server-authoritative skin field on the seat is future work).
 */
import type { ChampionDisplay } from "./championDisplay";
import { championDisplayFrom } from "./championDisplay";
import { applyChampionWhitelist, type Whitelist } from "../panels/champSelectFilter";
import { retiredChampionIds } from "@ggd/shared/content/championRetirement";
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
      // skin for a champion the catalog does not carry (its doc is not in the
      // content tree, or the whitelist cull removed the champion row) — still
      // sellable, and still named from content, because the missing champion
      // row must not cost the player the champion's name.
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
 * Keep only the champions this deploy actually OFFERS.
 *
 * WHY THE STORE NEEDS THIS NOW (2026-07-30). `/store/catalog` used to enumerate
 * exactly the 53 ids that content/config/store.json priced by hand. That map is
 * gone — the owner asked for one flat price and no per-hero line — so the
 * platform now prices every champion in the content tree, and the tree carries
 * 119 docs: 變身 alternates, 測試 stand-ins, heroes nobody has whitelisted. Left
 * alone the lobby store would list all of them and happily sell a player a
 * champion champ-select will never show.
 *
 * The operator whitelist is the right filter and the client already holds it
 * (the same `applyChampionWhitelist` champ-select gates picks with), so the
 * store reuses it rather than inventing a second definition of "on the roster".
 * `enforced:false` (offline / bare `pnpm dev`) passes everything through, which
 * is the same degradation every other whitelist consumer takes.
 *
 * This is UX legibility only. The server still refuses to sell nothing and
 * still 404s an unknown champion; what it cannot do from inside internal/wallet
 * is see the whitelist (curation → admin → wallet is an import cycle).
 */
export function storeRowsForWhitelist(rows: readonly ChampionRow[], wl: Whitelist): ChampionRow[] {
  // 下架的不上架 —— 讓玩家花水晶解鎖一隻 QWER 全空的英雄是最糟的失敗形態。
  return applyChampionWhitelist(rows, wl, retiredChampionIds());
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
