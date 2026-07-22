/**
 * Catalog derivation helpers — group the flat /store/catalog response into
 * per-champion rows with owned/equipped badges, and build the equipped-skin
 * modelKey override map handed to the match scene (client-side visual only;
 * a server-authoritative skin field on the seat is future work).
 */
import type { Catalog, CatalogSkin, SkinDoc, Wallet } from "./types";

export interface SkinRow extends CatalogSkin {
  /** display name/description from the content skin doc (id fallback) */
  name: string;
  description: string;
}

export interface ChampionRow {
  id: string;
  price: number;
  owned: boolean;
  skins: SkinRow[];
}

/** Merge catalog + content skin docs into champion-grouped store rows. */
export function deriveStoreRows(catalog: Catalog, skinDocs: Map<string, SkinDoc>): ChampionRow[] {
  const rows: ChampionRow[] = catalog.champions.map((c) => ({
    id: c.id,
    price: c.price,
    owned: c.owned,
    skins: [],
  }));
  const byChampion = new Map(rows.map((r) => [r.id, r]));
  for (const sk of catalog.skins) {
    const doc = skinDocs.get(sk.id);
    const row: SkinRow = {
      ...sk,
      name: doc?.name ?? sk.id,
      description: doc?.description ?? "",
    };
    let champ = byChampion.get(sk.championId);
    if (!champ) {
      // skin for a champion missing from championPrices — still sellable
      champ = { id: sk.championId, price: 0, owned: true, skins: [] };
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
