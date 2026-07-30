/**
 * offerEligibility — 「這件武器可以發給這個英雄嗎」, in ONE place.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS ITS OWN MODULE (#189)
 * ---------------------------------------------------------------------------
 * owner 2026-07-28:「傳說武器三選一…只出現在近戰英雄」. The legendary pool had
 * no attack-type dimension at all — and it is rolled from TWO places:
 *
 *   · `economy/draft.offerItems`        the round weapon card (arena-rules)
 *   · `economy/legendaryOrb.legendaryPool`  the 2400g 傳說寶玉 roll
 *
 * Both filtered on ownership + operator whitelist + craftRole and nothing else.
 * Adding the melee gate to only one of them is the obvious way to ship a
 * half-fix: the card would respect it and the orb would not, and the orb is the
 * path the owner explicitly said the legendaries live behind. So the predicate
 * lives here and BOTH import it — there is no second copy to forget.
 *
 * ---------------------------------------------------------------------------
 * IT GATES THE OFFER, NOT THE INVENTORY
 * ---------------------------------------------------------------------------
 * Nothing re-checks `requiresAttackType` after the item is in a slot. A ranged
 * champion can never be OFFERED a melee-only weapon, but an item already held
 * keeps working — deleting somebody's weapon mid-match because a form-swap
 * changed their attack type would be a much worse bug than the one this fixes.
 *
 * PURITY: pure reads of world components + the content registry. No rng, no
 * clock — the filter runs BEFORE the roll, so it cannot perturb `world.rng`
 * (post-filtering a rolled offer is exactly how task #47's empty cards
 * happened).
 */
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Champions, Items } from "../content/registry";

/**
 * This entity's attack type, or `null` when it is not a champion / its doc is
 * not registered. `null` means "unknown", and an unknown attack type passes
 * every gate below — a restriction is a statement about the CONTENT, and it
 * must never become a silent way to hand a test harness an empty pool.
 */
export function championAttackType(world: SimWorld, id: EntityId): "melee" | "ranged" | null {
  const champ = world.champion.get(id);
  if (!champ) return null;
  const def = Champions.tryGet(champ.championId);
  return def?.attackType ?? null;
}

/**
 * May `itemId` be OFFERED to `id`? Absent `requiresAttackType` (every pre-#189
 * doc) and absent `draftEligible` (every pre-2026-07-30 doc) = yes, for
 * everybody.
 *
 * TWO GATES, DELIBERATELY DIFFERENT SHAPES. `requiresAttackType` is about the
 * CARRIER (「這個英雄配不配得上這把武器」) and so consults the world;
 * `draftEligible` is about the ITEM ALONE (「這件東西還能不能發出去」) and does
 * not — a card that grants nothing but a penalty is a bad card on every body.
 * Order matters only for readability; both must pass.
 */
export function itemOfferableTo(world: SimWorld, id: EntityId, itemId: ItemId): boolean {
  const def = Items.tryGet(itemId);
  if (!def) return false;
  // 抽卡池開關 (owner 2026-07-30). Explicit `false` only — `undefined` is the
  // shipped default for 200+ docs and must keep meaning "offerable".
  if (def.draftEligible === false) return false;
  const need = def.requiresAttackType;
  if (need === undefined) return true;
  const have = championAttackType(world, id);
  // Unknown attack type → do not filter. See `championAttackType`.
  return have === null || have === need;
}
