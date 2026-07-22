/**
 * Draft offers (3-choose-1), seeded RNG, apply pick.
 *  - Augment draft (能力抽卡): tiered weighted augment offers.
 *  - Item draft (神器三選一): weighted item offers rolled from a loot table,
 *    granted FREE on pick (arena "legendary weapon" rounds).
 */
import type { AugmentId, EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AugmentTier } from "../content/defs";
import { Augments, LootTables } from "../content/registry";
import { attachSource } from "../stats/statPipeline";
import { grantItemFree } from "./shop";

export interface AugmentOffer {
  entity: EntityId;
  tier: AugmentTier;
  choices: AugmentId[];
  picked: AugmentId | null;
}

/** Which rounds gate which augment tier (configurable). */
export const AUGMENT_TIER_SCHEDULE: Record<number, AugmentTier> = {
  1: "silver",
  3: "gold",
  5: "prismatic",
};

export function offerAugments(world: SimWorld, entity: EntityId, tier: AugmentTier, count = 3): AugmentOffer {
  const champ = world.champion.get(entity);
  const owned = new Set(champ?.augments ?? []);
  const pool = Augments.all().filter((a) => a.tier === tier && !owned.has(a.id));

  const choices: AugmentId[] = [];
  const working = [...pool];
  while (choices.length < count && working.length > 0) {
    const total = working.reduce((s, a) => s + a.weight, 0);
    let roll = world.rng.next() * total;
    let idx = working.length - 1;
    for (let i = 0; i < working.length; i++) {
      roll -= working[i]!.weight;
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    choices.push(working[idx]!.id);
    working.splice(idx, 1); // without replacement
  }
  const offer: AugmentOffer = { entity, tier, choices, picked: null };
  world.emit("augmentOffer", { entity, tier, choices });
  return offer;
}

export function applyAugmentPick(world: SimWorld, offer: AugmentOffer, pick: AugmentId): boolean {
  if (offer.picked || !offer.choices.includes(pick)) return false;
  const champ = world.champion.get(offer.entity);
  if (!champ) return false;
  const def = Augments.get(pick);
  offer.picked = pick;
  champ.augments.push(pick);
  attachSource(world, offer.entity, {
    id: `aug:${pick}`,
    kind: "augment",
    modifiers: def.modifiers,
    hooks: def.hooks,
  });
  world.emit("augmentPicked", { entity: offer.entity, augmentId: pick });
  return true;
}

// ---------- item offers (arena weapon rounds) ----------

/** Pseudo-tier carried on item offers so OfferState projection stays generic. */
export const ITEM_OFFER_TIER = "weapon";

export interface ItemOffer {
  entity: EntityId;
  /** always ITEM_OFFER_TIER — discriminates from AugmentTier in the host */
  tier: string;
  choices: ItemId[];
  picked: ItemId | null;
}

/**
 * Roll a 3-choose-1 item offer from a loot table (weighted, without
 * replacement, excluding items already owned). Deterministic via world.rng.
 */
export function offerItems(world: SimWorld, entity: EntityId, tableId: string, count = 3): ItemOffer {
  const champ = world.champion.get(entity);
  const owned = new Set(champ?.items ?? []);
  const table = LootTables.tryGet(tableId);
  const working = (table?.entries ?? []).filter((e) => !owned.has(e.itemId)).map((e) => ({ ...e }));

  const choices: ItemId[] = [];
  while (choices.length < count && working.length > 0) {
    const total = working.reduce((s, e) => s + e.weight, 0);
    let roll = world.rng.next() * total;
    let idx = working.length - 1;
    for (let i = 0; i < working.length; i++) {
      roll -= working[i]!.weight;
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    choices.push(working[idx]!.itemId);
    working.splice(idx, 1); // without replacement
  }
  const offer: ItemOffer = { entity, tier: ITEM_OFFER_TIER, choices, picked: null };
  world.emit("itemOffer", { entity, tableId, choices });
  return offer;
}

/** Apply an item-offer pick: grants the chosen item FREE into the inventory. */
export function applyItemPick(world: SimWorld, offer: ItemOffer, pick: ItemId): boolean {
  if (offer.picked || !offer.choices.includes(pick)) return false;
  const slot = grantItemFree(world, offer.entity, pick);
  if (slot < 0) return false;
  offer.picked = pick;
  world.emit("itemPicked", { entity: offer.entity, itemId: pick, slot });
  return true;
}
