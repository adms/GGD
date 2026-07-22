/**
 * Icon resolution — the pure "which image URL does this doc get, if any" logic
 * behind the IconImg component (task #33). w3x-imported docs carry an optional
 * `icon` ("assets/icons/…", BLP→PNG); docs whose WC3 art was Blizzard stock
 * have NO icon field and must keep the pre-icon rendering everywhere. All
 * helpers therefore resolve to `null` on absent/foreign/failed icons and the
 * UI treats null as "render the existing fallback". Pure + node-testable.
 */
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import type { ChampionId, ItemId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { contentAssetUrl } from "../content/ContentDb";

/**
 * URL for a doc's `icon` field, or null when the icon is absent/invalid or the
 * image already failed to load (404 → caller falls back, never a broken img).
 */
export function iconSrc(icon: string | null | undefined, failed = false): string | null {
  if (failed) return null;
  return contentAssetUrl(icon);
}

/** Champion portrait URL by id (champ-select grid/header, scoreboard rows). */
export function championIconUrl(championId: string | null | undefined): string | null {
  if (!championId) return null;
  return iconSrc(Champions.tryGet(championId as ChampionId)?.icon);
}

/** Embedded Q/W/E/R ability icon URL for a champion's slot (ability bar). */
export function abilityIconUrl(
  championId: string | null | undefined,
  slot: CoreAbilitySlot,
): string | null {
  if (!championId) return null;
  return iconSrc(Champions.tryGet(championId as ChampionId)?.abilities[slot]?.icon);
}

/** Item icon URL by id (shop rows, inventory slots, weapon draft cards). */
export function itemIconUrl(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  return iconSrc(Items.tryGet(itemId as ItemId)?.icon);
}
