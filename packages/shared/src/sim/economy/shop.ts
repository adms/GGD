/** Shop (道具購買), item gacha (道具抽卡), and inventory. */
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Items, LootTables } from "../content/registry";
import { attachSource, detachSource } from "../stats/statPipeline";
import { LEGENDARY_ORB_ITEM_ID, STAT_TICK_ITEM_ID, itemHasEffect } from "./itemTiers";
import { buyLegendaryOrb, purchasableSlots } from "./legendaryOrb";
import { buyStatUpgrade, resetStatPath } from "./statPath";

export const INVENTORY_SLOTS = 6;
/**
 * Selling refunds 40% of the item's ORIGINAL price — a real loss, per the user
 * (「賣出會打折是原價的 40%」). Was 0.7; corrected to 0.4. Any UI that shows a
 * "sell for N" figure and any undo/restore must use THIS constant so the number
 * a player sees, the gold they get, and an undo's book-keeping never disagree.
 */
export const SELL_REFUND = 0.4;

export type BuyResult =
  | "ok"
  | "no-gold"
  | "no-slot"
  | "unique-owned"
  | "unknown-item"
  | "empty-pool"
  /**
   * The item exists but has NO PRICE — a draft/legendary reward. 「傳說的武器
   * 道具，只能隨機三選一」 (task #82): a 0g item is reachable only through a
   * 3-choose-1 card or the 傳說寶玉, never by paying for it. This has to be a
   * SIM refusal and not merely a shop-listing rule, because `gold >= 0` is
   * always true — without it, any surface that leaked a 0g id (a dev build
   * with the whitelist off, a hand-rolled command) would hand out every
   * legendary in the game for free.
   */
  | "not-purchasable"
  /**
   * The mirror image of `not-purchasable`: a REAL tier price and NO payload.
   * `item@1` can express only `modifiers` and `passive`, so an item carrying
   * neither is inert by construction — 出動怨念射手兵團 and 出動正義射手兵團 are
   * w3x SUMMONS and 和道一文字製作書 is a recipe book, all three 1200g, all
   * three doing exactly nothing here (their payload is an active the schema
   * cannot hold yet). Charging for one is strictly worse than charging for a
   * free legendary: it takes the gold, eats an inventory slot, attaches an
   * empty modifier source AND resets the stat path, so a player at 19 stacks
   * loses all 19 buying a no-op. Same reason the 0g rule is a SIM refusal and
   * not a listing rule — `starter.go` keeps these three off the shop by not
   * whitelisting them, but that is a membership accident, not an invariant.
   */
  | "no-effect";

/**
 * THE ONE gold-purchase entry point — and therefore the one place the stat
 * path can be broken (task #82). Two of the listings are SHOP SERVICES that
 * take gold but never occupy a slot, so they are dispatched before the
 * inventory path:
 *
 *   stat-attunement  能力屬性強化 — the repeatable 375g tick (economy/statPath).
 *   legendary-orb    傳說寶玉 — the 2400g roll trigger (economy/legendaryOrb).
 *                    Its 3-choose-1 is rolled here but REGISTERED by the host,
 *                    which listens for `legendaryOrbRolled`; offers are host
 *                    state, exactly as they are for the round cards.
 *
 * Everything else is a normal weapon and RESETS the stat streak to zero
 * (user's rule 「第 19 次時買了普通道具會怎樣——歸零」). The orb resets it too:
 * it is a gold purchase of a weapon. `grantItemFree` deliberately does not —
 * 「除了隨機三選一給的武器」.
 */
export function buyItem(world: SimWorld, id: EntityId, itemId: ItemId): BuyResult {
  const champ = world.champion.get(id);
  if (!champ) return "unknown-item";

  if (itemId === STAT_TICK_ITEM_ID) {
    const outcome = buyStatUpgrade(world, id);
    return outcome.result === "ok" ? "ok" : outcome.result === "no-gold" ? "no-gold" : "unknown-item";
  }
  if (itemId === LEGENDARY_ORB_ITEM_ID) {
    const roll = buyLegendaryOrb(world, id);
    if (roll.result !== "ok") return roll.result === "no-champion" ? "unknown-item" : roll.result;
    resetStatPath(world, id, itemId);
    return "ok";
  }

  const def = Items.tryGet(itemId);
  if (!def) return "unknown-item";
  if (def.cost <= 0) return "not-purchasable";
  // Both halves of "you may never be charged for nothing". The two SERVICES
  // are legitimately payload-free and are dispatched by id above, so they
  // never reach this line.
  if (!itemHasEffect(def)) return "no-effect";
  if (def.unique && champ.items.includes(itemId)) return "unique-owned";
  // A slot held by an unpicked 傳說寶玉 card is NOT available to buy into: the
  // orb was paid for and its legendary has to have somewhere to land. Without
  // the reservation term, spending the last slot between the roll and the pick
  // silently voided a 2400g purchase.
  const slot = champ.items.findIndex((s) => s === null);
  if (slot < 0 || purchasableSlots(champ) < 1) return "no-slot";
  if (champ.gold < def.cost) return "no-gold";

  champ.gold -= def.cost;
  champ.items[slot] = itemId;
  attachSource(world, id, {
    id: `item:${itemId}#${slot}`,
    kind: "item",
    modifiers: def.modifiers,
    hooks: def.passive,
  });
  resetStatPath(world, id, itemId);
  world.emit("itemBought", { id, itemId, slot, gold: champ.gold });
  return "ok";
}

export function sellItem(world: SimWorld, id: EntityId, slot: number): boolean {
  const champ = world.champion.get(id);
  if (!champ) return false;
  const itemId = champ.items[slot];
  if (!itemId) return false;
  const def = Items.get(itemId);
  champ.gold += Math.floor(def.cost * SELL_REFUND);
  champ.items[slot] = null;
  detachSource(world, id, `item:${itemId}#${slot}`);
  world.emit("itemSold", { id, itemId, slot, gold: champ.gold });
  return true;
}

/**
 * Grant an item for free into the first open inventory slot (no gold cost) —
 * the landing path for gacha rolls and arena weapon-offer picks.
 * Returns the slot index, or -1 when the inventory is full / item unknown.
 */
export function grantItemFree(world: SimWorld, id: EntityId, itemId: ItemId): number {
  const champ = world.champion.get(id);
  if (!champ) return -1;
  const def = Items.tryGet(itemId);
  if (!def) return -1;
  const slot = champ.items.findIndex((s) => s === null);
  if (slot < 0) return -1;
  champ.items[slot] = itemId;
  attachSource(world, id, {
    id: `item:${itemId}#${slot}`,
    kind: "item",
    modifiers: def.modifiers,
    hooks: def.passive,
  });
  return slot;
}

/** 道具抽卡 — weighted roll from a loot table; grants the item free. */
export function rollItemReward(world: SimWorld, id: EntityId, tableId: string): ItemId | null {
  const champ = world.champion.get(id);
  if (!champ) return null;
  const table = LootTables.get(tableId);
  if (!champ.items.includes(null)) return null;

  const total = table.entries.reduce((s, e) => s + e.weight, 0);
  let roll = world.rng.next() * total;
  let picked = table.entries[table.entries.length - 1]!.itemId;
  for (const e of table.entries) {
    roll -= e.weight;
    if (roll <= 0) {
      picked = e.itemId;
      break;
    }
  }
  const slot = grantItemFree(world, id, picked);
  if (slot < 0) return null;
  world.emit("gachaItem", { id, itemId: picked, slot });
  return picked;
}
