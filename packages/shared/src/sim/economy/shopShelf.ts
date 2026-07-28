/**
 * shopShelf — the REVERSIBLE 下架 flag (#261).
 *
 * owner, 2026-07-28: 「除了能力屬性強化、及傳說寶玉外，其他武器道具先全部暫時
 * 下架無法選擇，但隨機三選一仍然可以隨機到」.
 *
 * ---------------------------------------------------------------------------
 * TWO PATHS, AND THIS FLAG ONLY GOVERNS ONE OF THEM
 * ---------------------------------------------------------------------------
 * A weapon can reach a champion through exactly two doors, and the owner's
 * sentence closes one and explicitly leaves the other open:
 *
 *   SHELF  the 中場 shop — `shopCatalogue` lists it, `buyItem` charges gold for
 *          it.  ← CLOSED by this flag
 *   DROP   the 3-choose-1 cards and the 傳說寶玉 roll — `offerItems`,
 *          `rollItemReward`, `legendaryPool`, all landing through
 *          `grantItemFree`.  ← UNTOUCHED, deliberately
 *
 * So nothing in this module is imported by the draft/loot path, and
 * shopShelf.test.ts asserts that a closed shelf still rolls and still grants.
 * If a future change routes a card through `buyItem`, that test goes red — which
 * is the whole point of writing the two doors down.
 *
 * ---------------------------------------------------------------------------
 * WHY A CONSTANT AND NOT A CONTENT FIELD
 * ---------------------------------------------------------------------------
 * 「暫時下架」 is a TEMPORARY, global, one-decision switch, not a per-item
 * property. Putting a `shelved: false` on 59 item docs would (a) need every one
 * of them edited back when the owner re-opens the shop, and (b) make "is the
 * shop open" a question you answer by reading 59 files. One exported boolean is
 * the whole switch: flip it to `true` and every weapon is back on the shelf,
 * with no content rebuild and no migration.
 *
 * It is NOT a deletion: every item doc, price, loot-table entry and whitelist
 * membership is exactly as it was.
 */
import { isShopService } from "./itemTiers";

/**
 * Whether NORMAL weapons/items may be listed and bought in the 中場 shop.
 *
 * `false` (today) = 「其他武器道具先全部暫時下架」: only the two SHOP SERVICES
 * (能力屬性強化 / 傳說寶玉) are purchasable. Set to `true` to restore the full
 * catalogue — that single edit is the whole re-listing.
 */
export const WEAPON_SHELF_OPEN = false;

/**
 * May this id be listed on — and bought from — the shop shelf?
 *
 * The two services are ALWAYS listable: they are what the owner kept, and they
 * are dispatched by id inside `buyItem` before the inventory path, so gating
 * them here would take the shop down to nothing.
 *
 * `open` defaults to the shipped flag. The sim passes `world.weaponShelfOpen`
 * (same default, host-overridable) so a MATCH can run with the full catalogue —
 * which is what every weapon-economy test does, because those rules did not go
 * away, they went off sale. The client's `shopCatalogue` has no world and uses
 * the default, exactly as it mirrors the server's whitelist.
 */
export function shelfListable(itemId: string, open: boolean = WEAPON_SHELF_OPEN): boolean {
  return open || isShopService(itemId);
}
