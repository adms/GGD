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
import { ATTR_OFFER_TIER } from "@ggd/shared/sim/economy/attrDraft";
import type { ItemId } from "@ggd/shared/ids";
import { GOLD } from "../theme";
import { buildItemRow, formatAuthoredBonus, type RowItem } from "./itemStats";

/** audio-map.json sfx key for the card lock-in cue (content/config/audio-map.json). */
export const DRAFT_CONFIRM_SFX = "draftConfirm";

/**
 * What a WEAPON (item) draft card says the weapon does.
 *
 * The AUTHORED `description` wins whenever the doc has one. owner 2026-08-01,
 * on being shown that 死之王的意志 rendered an empty card: 「卡片應該要顯示全部
 * 敘述阿」. The 效能/解說 prose is the spec — it is where the mechanics that the
 * effect vocabulary cannot yet express (斬殺, 格擋, 套裝, 反彈…) are written down,
 * and a card built only from `modifiers` silently drops every one of them.
 *
 * The derived effect+stat read is the FALLBACK, not the primary: it only runs
 * for docs with no authored prose, where re-deriving from content still beats
 * resolveChoice's bare `300 g`. Returns null when neither exists, and the caller
 * keeps resolveChoice's text.
 *
 * The `as unknown as RowItem` mirrors MerchantShop: the runtime item doc carries
 * `description`, which the compile-time ItemDef type omits.
 */
export function weaponEffectDescription(choice: string): string | null {
  const item = Items.tryGet(choice as ItemId);
  if (!item) return null;
  const authored = (item as unknown as RowItem).description?.trim();
  if (authored) return authored;
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
  // 能力屬性強化 (#260) — a teal that belongs to no augment rarity, because the
  // card is not a rarity roll: all three magnitudes come off the same uniform
  // 0.1–2.0 draw, so tinting it silver/gold would promise a quality it never has.
  [ATTR_OFFER_TIER]: "#5fd6c4",
};

/** The accent colour for a tier, falling back to GOLD for an unknown tier. */
export function tierColor(tier: string): string {
  return DRAFT_TIER_COLOR[tier] ?? GOLD;
}

/** Bespoke header labels; unknown tiers render as "<TIER> AUGMENT". */
export const DRAFT_TIER_LABEL: Record<string, string> = {
  weapon: "傳說武器 · WEAPON",
  [ATTR_OFFER_TIER]: "能力屬性強化 · 力／敏／智",
};

/** The tier header text (e.g. "GOLD AUGMENT", "傳說武器 · WEAPON"). */
export function tierLabel(tier: string): string {
  return DRAFT_TIER_LABEL[tier] ?? `${tier.toUpperCase()} AUGMENT`;
}
