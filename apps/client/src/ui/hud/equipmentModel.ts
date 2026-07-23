/**
 * equipmentModel — the PURE display model behind the persistent in-match
 * equipment bar (task #44). Like the rest of ui/ (the vitest env is node, no
 * DOM), the DOM shell lives in EquipmentBar.tsx and everything testable lives
 * here: turn the local seat's `items` array into a fixed row of six cells, so
 * the LoL-style rules are things the layout can PROVE rather than pixels.
 *
 * THE RULES THIS ENCODES
 *   - SLOT CAP is visible: always exactly `INVENTORY_SLOTS` cells, filled or
 *     empty, so the 6-item ceiling is a thing you can see (never a silent limit
 *     the way a "just render what you own" list would be). `equipmentCap` gives
 *     the `filled / cap` counter and the `full` flag the bar warns with.
 *   - NO-DUPLICATE-UNIQUE feedback: a `unique` item is flagged on its cell and
 *     carries a "唯一" meta chip in its tooltip, so the player can SEE which of
 *     their items are the ones the shop refuses to let them stack (the HUD side
 *     of the shop's "已擁有（唯一道具）" block).
 *   - DETAIL tooltip: each filled cell exposes the SAME full item detail the
 *     shop shelf and the shop's own inventory grid show — the ✦ effect line, the
 *     WC3 原文 claim lines and the lore — built through the shared
 *     `buildItemRow` (itemStats.ts), never a HUD re-derivation. `itemDetailBody`
 *     is exactly the join the shop's InventoryGrid uses (task #140); replicated
 *     here rather than imported so this bar owns its own copy and MerchantShop
 *     stays untouched.
 */
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { buildItemRow, type RowItem } from "../panels/itemStats";

/** The minimal item shape a cell needs — RowItem plus the HUD-only bits. */
export interface EquipItemDef extends RowItem {
  /** content-relative icon path, or null/absent → glyph fallback */
  readonly icon?: string | null;
  /** LoL unique: cannot be held twice (the shop blocks a second copy) */
  readonly unique?: boolean;
}

/** A tooltip meta chip (mirrors the shape `<Tooltip meta>` consumes). */
export interface EquipMeta {
  readonly label: string;
  readonly value: string;
}

/** One equipment cell — a filled slot (itemId set) or an empty one (null). */
export interface EquipCell {
  /** 0-based slot index within the six-slot inventory */
  readonly slot: number;
  /** the owned item's id, or null for an empty slot */
  readonly itemId: string | null;
  /** display name (falls back to the id when the def is missing) */
  readonly name: string | null;
  /** resolved-from-def icon path, or null */
  readonly icon: string | null;
  /** true = a LoL unique item (surfaced as the no-duplicate feedback) */
  readonly unique: boolean;
  /** the detailed hover description (✦ effect + WC3 claims + lore), or null */
  readonly tooltipBody: string | null;
  /** tooltip meta chips (the 唯一 chip for a unique item) */
  readonly meta: EquipMeta[];
}

/** The slot-cap summary the bar's header renders. */
export interface EquipCap {
  /** owned items, clamped to the cap */
  readonly filled: number;
  /** the visible ceiling (INVENTORY_SLOTS) */
  readonly cap: number;
  /** true once every slot is taken — the counter warns in this state */
  readonly full: boolean;
}

/** Owned-item count vs the visible cap. */
export function equipmentCap(items: readonly string[], cap = INVENTORY_SLOTS): EquipCap {
  const filled = items.filter((s) => s !== "" && s != null).length;
  return { filled: Math.min(filled, cap), cap, full: filled >= cap };
}

/**
 * The detailed tooltip body for an item — the ✦ mechanical effect line, then
 * the (non-authoritative) WC3 原文 stat claims, then the lore, newline-joined.
 * Byte-for-byte the join the shop's InventoryGrid uses (#140), so an equipped
 * item reads identically whether hovered in the shop or on the HUD bar. null
 * when the item is a pure stat stick with no prose.
 */
export function itemDetailBody(def: EquipItemDef): string | null {
  const row = buildItemRow(def, null);
  const parts = [
    row.effect ? `✦ ${row.effect}` : "",
    row.claims.length > 0 ? row.claims.join(" · ") : "",
    row.lore ?? "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Build the fixed six-cell row from the seat's item ids. `lookup` resolves an
 * id to its def (the Items registry at runtime; a fake in tests) — a missing
 * def degrades to an id-labelled cell rather than throwing, so a de-whitelisted
 * or renamed item never crashes the HUD.
 */
export function buildEquipmentCells(
  items: readonly string[],
  lookup: (id: string) => EquipItemDef | undefined,
  cap = INVENTORY_SLOTS,
): EquipCell[] {
  return Array.from({ length: cap }, (_, slot): EquipCell => {
    const itemId = items[slot] ?? "";
    if (!itemId) {
      return { slot, itemId: null, name: null, icon: null, unique: false, tooltipBody: null, meta: [] };
    }
    const def = lookup(itemId);
    const unique = !!def?.unique;
    return {
      slot,
      itemId,
      name: def?.name ?? itemId,
      icon: def?.icon ?? null,
      unique,
      tooltipBody: def ? itemDetailBody(def) : null,
      // the no-duplicate-unique feedback, carried into the hover tooltip
      meta: unique ? [{ label: "唯一", value: "不可重複持有" }] : [],
    };
  });
}
