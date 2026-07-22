/**
 * shopGrouping — the shop's shelves.
 *
 * 「商店應該依照功能性來群組排列，群組內則用金錢少到多排列，而非全部不分類直接排下去」
 * — group by FUNCTION, and inside a group sort cheapest first.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DERIVES THE TAXONOMY INSTEAD OF READING `tags`
 * ---------------------------------------------------------------------------
 * The obvious implementation is `groupBy(item.tags)`. It does not work here:
 * of 215 imported items, 208 carry exactly one tag — `wc3-import`. That is
 * provenance, not function. Grouping on it produces one shelf containing
 * everything, which is the flat list the user is asking us to replace.
 *
 * What the items DO carry is `modifiers[].stat`, on 107 of them, drawn from a
 * closed vocabulary the sim already understands (ad, ap, armor, maxHealth,
 * maxMana, as, ms, …). That is a real functional signal, and it has a second
 * virtue: it survives task #82's economy rewrite. #82 is re-pricing and
 * re-tiering the whole catalogue right now, so any grouping keyed on `cost` or
 * `tier` would be stale within the hour — but an item that grants attack damage
 * grants attack damage regardless of what it ends up costing.
 *
 * ---------------------------------------------------------------------------
 * THE SHELVES
 * ---------------------------------------------------------------------------
 * Ordered the way a player shops: the special actions first because they are
 * the headline mechanics of the new economy and are easy to miss in a list,
 * then offence, magic, defence, mobility, then the ones we cannot classify.
 *
 * An item with several stats belongs to whichever shelf holds the MOST of them
 * (a sword with +ad +ad-scaling is offence; a bruiser item with +ad +hp lands
 * by count, then by the declared order below). One item, one shelf: a catalogue
 * where things appear twice is harder to scan than one flat list, not easier.
 */

/** The stat vocabulary actually present in content/items (measured, not guessed). */
type StatKey =
  | "ad" | "as" | "critChance" | "critDamage" | "lifesteal"
  | "ap" | "maxMana" | "manaRegen"
  | "maxHealth" | "armor" | "mr" | "healthRegen"
  | "ms";

/** The minimum shape this module needs — deliberately structural, not the full ItemDef. */
export interface ShelfItem {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly tags: readonly string[];
  readonly modifiers?: readonly { readonly stat?: string }[];
  readonly passive?: unknown;
}

export type ShelfId = "service" | "offense" | "magic" | "defense" | "mobility" | "utility" | "misc";

export interface Shelf {
  readonly id: ShelfId;
  /** Chinese label, matching the rest of the shop chrome. */
  readonly label: string;
  /** One line saying what the shelf is FOR, so the grouping teaches as it sorts. */
  readonly hint: string;
  /**
   * The shelf's ANCHOR stat — the one that wins the shelf's own vote and gets
   * its own right-aligned column so a whole shelf is comparable down a single
   * column of tabular numerals (#106). null for shelves whose members do not
   * share a numeric axis (services, effect-only utilities). It is a `Stat`
   * value string (`"ad"`, `"ap"`, …) so callers can hand it straight to
   * `buildItemRow` without importing the enum.
   */
  readonly anchorStat: string | null;
  readonly items: readonly ShelfItem[];
}

/**
 * Each shelf's anchor stat. Deliberately the SAME stat the shelf's vote is
 * about (offence→ad, magic→ap, defence→maxHealth, mobility→ms), so the column a
 * player reads down is the reason the item is on that shelf at all. The four
 * anchors are all flat-only in the catalogue, so the column is always a clean
 * absolute number.
 */
export const SHELF_ANCHOR: Readonly<Record<ShelfId, string | null>> = {
  service: null,
  offense: "ad",
  magic: "ap",
  defense: "maxHealth",
  mobility: "ms",
  utility: null,
  misc: null,
};

/** Which shelf each stat votes for. */
const STAT_SHELF: Readonly<Record<StatKey, ShelfId>> = {
  ad: "offense",
  as: "offense",
  critChance: "offense",
  critDamage: "offense",
  lifesteal: "offense",
  ap: "magic",
  maxMana: "magic",
  manaRegen: "magic",
  maxHealth: "defense",
  armor: "defense",
  mr: "defense",
  healthRegen: "defense",
  ms: "mobility",
};

/**
 * Tags that override the stat vote entirely. These are task #82's new economy
 * mechanics (the 傳說寶玉 gacha orb, the 20-stack stat path) plus shop services
 * — they are ACTIONS rather than equipment, and burying them among swords is
 * how a player never discovers them.
 */
const SERVICE_TAGS = new Set(["gacha", "stat-path", "shop-service"]);

/** Display order. Ties in the stat vote also resolve in this order. */
const SHELF_ORDER: readonly { id: ShelfId; label: string; hint: string }[] = [
  { id: "service", label: "特殊 · 商店服務", hint: "寶玉抽取、屬性強化路線" },
  { id: "offense", label: "攻擊", hint: "攻擊力、攻速、爆擊、吸血" },
  { id: "magic", label: "法術", hint: "法術強度、魔力與回復" },
  { id: "defense", label: "防禦", hint: "生命、護甲、魔抗、回血" },
  { id: "mobility", label: "機動", hint: "移動速度" },
  { id: "utility", label: "特殊效果", hint: "沒有數值加成，但帶被動或觸發效果" },
  { id: "misc", label: "其他", hint: "未分類" },
];

/** The shelf a single item belongs on. Exported for the test and the codex. */
export function shelfOf(item: ShelfItem): ShelfId {
  if (item.tags.some((t) => SERVICE_TAGS.has(t))) return "service";

  // count the votes, then take the winner in declared order (so a 2-2 split
  // between offence and defence resolves to offence, not to iteration order)
  const votes = new Map<ShelfId, number>();
  for (const mod of item.modifiers ?? []) {
    const shelf = mod.stat ? STAT_SHELF[mod.stat as StatKey] : undefined;
    if (shelf) votes.set(shelf, (votes.get(shelf) ?? 0) + 1);
  }
  if (votes.size > 0) {
    let best: ShelfId = "misc";
    let bestCount = 0;
    for (const { id } of SHELF_ORDER) {
      const n = votes.get(id) ?? 0;
      if (n > bestCount) {
        best = id;
        bestCount = n;
      }
    }
    return best;
  }

  // No stat modifiers at all. An item with a passive still DOES something —
  // that is a shelf of its own, not "misc". Only a truly featureless entry
  // falls through, and those are the broken-data rows the codex surfaces.
  return item.passive ? "utility" : "misc";
}

/**
 * Group a catalogue onto its shelves, cheapest first within each.
 *
 * Empty shelves are dropped rather than rendered as headers over nothing —
 * with the whitelist enforced, most of these will be empty most of the time.
 * The sort is stable on id after cost so the order never flickers between
 * renders for two items that happen to cost the same.
 */
export function groupCatalogue(items: readonly ShelfItem[]): Shelf[] {
  const buckets = new Map<ShelfId, ShelfItem[]>();
  for (const item of items) {
    const id = shelfOf(item);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(item);
    else buckets.set(id, [item]);
  }
  const out: Shelf[] = [];
  for (const { id, label, hint } of SHELF_ORDER) {
    const bucket = buckets.get(id);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out.push({ id, label, hint, anchorStat: SHELF_ANCHOR[id], items: bucket });
  }
  return out;
}
