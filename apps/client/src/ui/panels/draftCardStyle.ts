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
import { GOLD } from "../theme";

/** audio-map.json sfx key for the card lock-in cue (content/config/audio-map.json). */
export const DRAFT_CONFIRM_SFX = "draftConfirm";

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
