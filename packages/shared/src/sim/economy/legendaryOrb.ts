/**
 * legendaryOrb — 傳說寶玉. 「傳說的武器道具，只能隨機三選一（購買也可傳說寶玉
 * 觸發而非直接購買傳說武器道具）」.
 *
 * THE SHAPE OF THE MECHANIC. You never buy a legendary. You buy the GACHA
 * TOKEN, and the token immediately opens the same 3-choose-1 card the round-5
 * draft opens, rolled from the same `legendary-weapons` table. The orb is
 * consumed on use, occupies no inventory slot, and is never a recipe component
 * — it respects the standing no-crafting decision by construction, because
 * there is no combine STEP anywhere in it.
 *
 * WHY IT IS PRICED AT RATE. 2400g for a 52-AEP legendary is exactly the
 * economy's uniform 46.15 g/AEP. The orb therefore buys you no gold efficiency
 * at all; what it buys is SLOTS and CHOICE — one purchase instead of two, and
 * three candidates instead of a fixed drop. At the round-3 shop (3850g
 * cumulative) 1 POWERFUL + 1 ORB costs 3600g, which is where the interesting
 * decision lives.
 *
 * THE EMPTY-POOL FAILURE IS THE WHOLE POINT OF THIS FILE. Task #47 found that
 * the round-2/round-5 weapon cards SILENTLY GRANT NOTHING when whitelist
 * filtering empties their table: `offerItems` returns zero choices and
 * MatchController just skips the offer. Doing that to a 2400g PURCHASE would be
 * theft, so this module:
 *   1. filters the pool BEFORE rolling (never post-filters a rolled offer down
 *      to nothing, which is exactly how #47 happened),
 *   2. refuses the purchase and charges NO GOLD when the pool is empty, and
 *   3. returns a distinct "empty-pool" reason so the caller can say WHY
 *      instead of showing a dead button.
 *
 * DETERMINISM. Every roll comes off `world.rng`, without replacement, in pool
 * order — no wall-clock, no Math.random, so same seed + same intents = same
 * three cards.
 */
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { LootTables } from "../content/registry";
import { LEGENDARY_ORB_PRICE, LEGENDARY_POOL_TABLE } from "./itemTiers";

export type OrbResult =
  | "ok"
  /** cannot afford the 2400g token */
  | "no-gold"
  /** every inventory slot is full — the roll would have nowhere to land */
  | "no-slot"
  /** the loot table is missing, or every entry is owned / not whitelisted */
  | "empty-pool"
  | "no-champion";

export interface OrbRoll {
  result: OrbResult;
  choices: ItemId[];
}

/**
 * The legendary candidates this champion could actually be offered right now:
 * table entries they do not already own, restricted to what the host says is
 * eligible (the operator whitelist — see {@link SimWorld.itemEligible}).
 * Exposed so the shop UI can grey the orb out BEFORE it is clicked.
 */
/** Inventory slots that are physically empty, ignoring any orb reservation. */
function freeSlots(champ: { items: readonly (ItemId | null)[] }): number {
  return champ.items.reduce<number>((n, s) => (s === null ? n + 1 : n), 0);
}

/**
 * Slots a champion may still fill by BUYING — physically empty minus the ones
 * an unpicked 傳說寶玉 card is holding. This is the number the shop must gate
 * purchases on, and the number a slot-count UI should show as available.
 */
export function purchasableSlots(champ: { items: readonly (ItemId | null)[]; pendingOrbSlots: number }): number {
  return Math.max(0, freeSlots(champ) - champ.pendingOrbSlots);
}

/**
 * Release one orb reservation. Called by the host when an orb card leaves the
 * offer table — on a successful pick, on the expiry auto-pick, and on the
 * failure paths — so the reservation can never outlive the card that owns it.
 * Clamped at 0 so a double release is harmless.
 */
export function releaseOrbSlot(world: SimWorld, id: EntityId): void {
  const champ = world.champion.get(id);
  if (!champ || champ.pendingOrbSlots <= 0) return;
  champ.pendingOrbSlots -= 1;
}

export function legendaryPool(world: SimWorld, id: EntityId): ItemId[] {
  const champ = world.champion.get(id);
  if (!champ) return [];
  const table = LootTables.tryGet(LEGENDARY_POOL_TABLE);
  if (!table) return [];
  const owned = new Set(champ.items);
  const eligible = world.itemEligible;
  return table.entries
    .map((e) => e.itemId)
    .filter((itemId) => !owned.has(itemId) && (eligible === null || eligible(itemId)));
}

/**
 * Buy one 傳說寶玉 and roll its 3-choose-1. Returns the choices for the host to
 * register as an offer (offers are host state — the sim only ever rolls them,
 * exactly as `draft.offerItems` does for the round cards).
 *
 * Gold is charged ONLY on "ok".
 */
export function buyLegendaryOrb(world: SimWorld, id: EntityId, count = 3): OrbRoll {
  const champ = world.champion.get(id);
  if (!champ) return { result: "no-champion", choices: [] };
  if (champ.gold < LEGENDARY_ORB_PRICE) return { result: "no-gold", choices: [] };
  // The roll has to land somewhere. Checking BEFORE charging means a full
  // inventory is a refusal, never a 2400g no-op — and the check counts slots
  // already RESERVED by orbs still awaiting their pick, so buying two orbs
  // with one slot free is refused on the second rather than overbooking it.
  if (freeSlots(champ) <= champ.pendingOrbSlots) return { result: "no-slot", choices: [] };

  const pool = legendaryPool(world, id);
  if (pool.length === 0) return { result: "empty-pool", choices: [] };

  champ.gold -= LEGENDARY_ORB_PRICE;
  // Hold the slot until the card resolves. Released by `releaseOrbSlot` on the
  // pick — see MatchController.applyPick, which releases on EVERY exit path so
  // a dropped card cannot strand the reservation.
  champ.pendingOrbSlots += 1;

  const working = [...pool];
  const choices: ItemId[] = [];
  while (choices.length < count && working.length > 0) {
    const idx = world.rng.int(working.length);
    choices.push(working[idx]!);
    working.splice(idx, 1); // without replacement
  }
  world.emit("legendaryOrbRolled", { id, tableId: LEGENDARY_POOL_TABLE, choices, gold: champ.gold });
  return { result: "ok", choices };
}
