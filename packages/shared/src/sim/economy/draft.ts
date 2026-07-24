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

/**
 * NOT THE SHIPPED SCHEDULE — the no-doc FALLBACK, and the only augment-tier
 * table in code.
 *
 * THE ONE AUTHORITY IS `content/config/arena-rules.json`: `rounds[r].augmentTier`,
 * read by `MatchController` through `grantForRound`. A shipped match always has
 * that doc, and it now schedules silver 1-3 / gold 4-6 / prismatic 7-13.
 *
 * This constant is consumed by exactly one caller — `DEFAULT_ARENA_RULES` in
 * apps/game-server/src/match/arenaRules.ts — which is what a MatchController
 * built with NO rules argument gets (unit tests, the skeleton content path). It
 * is kept at the legacy 1/3/5 shape precisely so those tests keep describing the
 * legacy behaviour they were written against; changing it would silently retune
 * every doc-less test rather than the game.
 *
 * There used to be a THIRD copy: `draft.tierSchedule` in config.match@1, which
 * said {1:silver, 3:gold, 5:prismatic} while arena-rules said something else.
 * Nothing ever read it. It is now an empty record; deleting the field outright
 * needs the `.strict()` schema in content/schema/config.ts to drop it first.
 */
export const AUGMENT_TIER_SCHEDULE: Record<number, AugmentTier> = {
  1: "silver",
  3: "gold",
  5: "prismatic",
};

/**
 * Tiers in ascending power, and therefore in DESCENDING fallback preference —
 * `TIER_FALLBACK[tier]` is the tiers `offerAugments` may borrow from when the
 * requested tier cannot fill a card, best first. See the FALLBACK note there.
 */
const TIER_FALLBACK: Record<AugmentTier, readonly AugmentTier[]> = {
  silver: [],
  gold: ["silver"],
  prismatic: ["gold", "silver"],
};

/**
 * Roll a `count`-choose-1 augment card of `tier`, weighted, without
 * replacement, excluding augments this champion already owns.
 *
 * -------------------------------------------------------------------------
 * FALLBACK — why this does not just filter on `tier` any more
 * -------------------------------------------------------------------------
 * The old body was `Augments.all().filter(a => a.tier === tier && !owned)` and
 * a `while (choices.length < count && working.length > 0)` loop: a HARD tier
 * filter, drawn without replacement, and a loop that stops early and SILENTLY
 * when the tier runs dry. Every pick permanently removes one card from that
 * champion's future pool of that tier, so a long match walks the tier down to
 * nothing and the card quietly shrinks 3 → 2 → 1 → 0. A "choose 1 of 1" is not
 * a choice, and a "choose 1 of 0" is task #47 all over again: a draft card that
 * grants nothing, with no trace anywhere.
 *
 * That was not hypothetical. Under the team-health model a match runs 10-13
 * rounds and `arena-rules` gives PRISMATIC on round 5 and every round after,
 * so a champion draws 7-9 prismatic cards from a 16-card tier. Measured on 30
 * real matches BEFORE the tier was expanded (7 prismatic augments): 339 of
 * 1941 prismatic offers came out under-filled, 132 of them with a single card.
 *
 * So the tier is now a PREFERENCE, not a wall. Fill from the requested tier
 * first — identical rolls, identical weights, identical rng consumption while
 * the tier can serve — and only when it is exhausted borrow the remaining slots
 * from the next tier down. A weaker card the player can actually weigh against
 * the others beats a card that is not a choice. Two invariants hold now that
 * did not before:
 *   • an offer is never shorter than `count` while ANY unowned augment exists;
 *   • `choices[0…k]` is still drawn purely from the requested tier, so the
 *     headline card a player sees is the one the round promised.
 */
export function offerAugments(world: SimWorld, entity: EntityId, tier: AugmentTier, count = 3): AugmentOffer {
  const champ = world.champion.get(entity);
  const owned = new Set(champ?.augments ?? []);

  const choices: AugmentId[] = [];
  const drawFrom = (t: AugmentTier): void => {
    const working = Augments.all().filter((a) => a.tier === t && !owned.has(a.id) && !choices.includes(a.id));
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
  };

  drawFrom(tier);
  for (const lower of TIER_FALLBACK[tier]) {
    if (choices.length >= count) break;
    drawFrom(lower);
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
