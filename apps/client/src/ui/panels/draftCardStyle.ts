/**
 * draftCardStyle — pure presentation constants for the 3-choose-1 draft cards
 * (task #110). Extracted from AugmentDraftPanel so the tier→colour mapping, the
 * tier label and the confirm-sfx key are node-testable with no React/store
 * import (same pattern as resolveChoice / prepCountdown).
 *
 * The tier COLOUR is the card's whole identity: it tints the flowing border
 * glow (the `--ggd-card-glow` custom property that buttonFx.css `.ggd-btn--card`
 * reads), the GlyphTile frame, the card name and the tier header — so silver /
 * gold / prismatic augments and legendary WEAPON cards read apart at a glance
 * exactly like LoL-Arena rarities.
 */
import { Items } from "@ggd/shared/sim/content/registry";
import type { ItemId } from "@ggd/shared/ids";
import { GOLD } from "../theme";
import { buildItemRow, formatAuthoredBonus, type RowItem } from "./itemStats";

/** audio-map.json sfx key for the card lock-in cue (content/config/audio-map.json). */
export const DRAFT_CONFIRM_SFX = "draftConfirm";

/**
 * A concrete EFFECT description for a WEAPON (item) draft choice, mirroring the
 * shop's inline read of the SAME item (itemStats.buildItemRow): the ✦ mechanical
 * effect line first, then the merged stat bonuses — so a legendary weapon card is
 * never a blind pick. resolveChoice only surfaces an item's cost (`300 g`), which
 * says nothing about what the weapon DOES; this fills that gap from the identical
 * content the shop shelf reads, never a re-derivation.
 *
 * Returns null when the choice is not an item, or the item has no printable
 * effect/stat — the caller then keeps resolveChoice's text (augment/ability
 * descriptions already carry their own, and a bare item keeps its cost).
 *
 * The `as unknown as RowItem` mirrors MerchantShop: the runtime item doc carries
 * `description`, which the compile-time ItemDef type omits.
 */
export function weaponEffectDescription(choice: string): string | null {
  const item = Items.tryGet(choice as ItemId);
  if (!item) return null;
  // no anchor stat on a draft card → every bonus stays a labelled chip
  const row = buildItemRow(item as unknown as RowItem, null);
  const parts: string[] = [];
  if (row.effect) parts.push(row.effect);
  for (const m of row.merged) parts.push(formatAuthoredBonus(m));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Rarity/kind → accent colour. Mirrors LoL-Arena's silver/gold/prismatic. */
export const DRAFT_TIER_COLOR: Record<string, string> = {
  silver: "#b8c4d6",
  gold: "#f2c637",
  prismatic: "#c67ef2",
  weapon: "#f28a37",
};

/** The accent colour for a tier, falling back to GOLD for an unknown tier. */
export function tierColor(tier: string): string {
  return DRAFT_TIER_COLOR[tier] ?? GOLD;
}

/** Bespoke header labels; unknown tiers render as "<TIER> AUGMENT". */
export const DRAFT_TIER_LABEL: Record<string, string> = {
  weapon: "傳說武器 · WEAPON",
};

/** The tier header text (e.g. "GOLD AUGMENT", "傳說武器 · WEAPON"). */
export function tierLabel(tier: string): string {
  return DRAFT_TIER_LABEL[tier] ?? `${tier.toUpperCase()} AUGMENT`;
}
