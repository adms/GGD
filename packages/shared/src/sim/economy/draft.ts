/**
 * Draft offers (3-choose-1), seeded RNG, apply pick.
 *  - Augment draft (能力抽卡): tiered weighted augment offers.
 *  - Item draft (神器三選一): weighted item offers rolled from a loot table,
 *    granted FREE on pick (arena "legendary weapon" rounds).
 */
import type { AugmentId, EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AugmentDef, AugmentTier } from "../content/defs";
import { Augments, LootTables } from "../content/registry";
import { attachSource } from "../stats/statPipeline";
import { sourceGrants } from "../stats/sourceGrants";
import { grantItemFree } from "./shop";
import { DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES, itemOfferableTo } from "./offerEligibility";
import { grailPreferenceMultiplier, grailWishEligible, modeFeaturesFor } from "./augmentEligibility";
import { GRAIL_WISH_TAG } from "./grailVocabulary";

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

  // ⭐ §15 靈基適性條件 + §16 顯現差異。兩者都在 `working` 的**組成**上生效,
  // ⛔ 不在抽完之後過濾 —— 抽完再丟就是 GH#249 那個「卡片 3 → 2 → 1」的形狀。
  const rules = world.grailDraft;
  const features = modeFeaturesFor(world, entity);
  const pickedSlots = new Set<string>();

  /**
   * ⭐ **兩道閘，只有一道可以被放寬。**
   *
   * · `legacyPool` 是一個**偏好** —— 舊的 31 張對每一位英雄都動得起來,
   *   所以寧可發一張舊卡也不要發一張空卡（同這個檔案上面那段 tier fallback
   *   的理由:「a card that is not a choice is task #47 all over again」）。
   *   ⚠️ 這不是假設性的:骨架內容樹**一張聖杯願望都沒有**,所以純粹的
   *   `exclude` 會讓那些場次整個三選一消失,而畫面上只是「沒有跳卡片」。
   * · `eligibility` 是一道**硬閘**,⛔ 永遠不放寬 —— 放寬它等於把死願望發出去,
   *   而一張按不到的卡比一張弱卡更糟(玩家以為自己選了東西)。
   */
  const admissible = (a: AugmentDef, allowLegacy: boolean): boolean => {
    if (!allowLegacy && rules.legacyPool === "exclude" && !a.tags.includes(GRAIL_WISH_TAG)) return false;
    if (!rules.eligibilityEnabled) return true;
    return grailWishEligible(world, entity, a.eligibility, features);
  };
  const weightOf = (a: AugmentDef): number =>
    a.weight * grailPreferenceMultiplier(world, entity, a.eligibility, rules.preferenceBonus);

  const choices: AugmentId[] = [];
  const drawFrom = (t: AugmentTier, allowLegacy: boolean): void => {
    const pool = Augments.all().filter(
      (a) => a.tier === t && !owned.has(a.id) && !choices.includes(a.id) && admissible(a, allowLegacy),
    );
    while (choices.length < count && pool.length > 0) {
      // §16：⭐ **偏好不是分配** —— 先看還有沒有「玩家這一張還沒看過的顯現位置」,
      // 有就只從那一群抽,沒有就退回全池。出貨 60 張裡 generic 只有 10 張,
      // 硬性一格一種會讓第二張願望每一場都是那三張裡的一張。
      const fresh = pool.filter((a) => !pickedSlots.has(a.selectionSlot ?? "generic"));
      const working = rules.slotDiversityEnabled && fresh.length > 0 ? fresh : pool;

      const total = working.reduce((s, a) => s + weightOf(a), 0);
      let roll = world.rng.next() * total;
      let idx = working.length - 1;
      for (let i = 0; i < working.length; i++) {
        roll -= weightOf(working[i]!);
        if (roll <= 0) {
          idx = i;
          break;
        }
      }
      const drawn = working[idx]!;
      choices.push(drawn.id);
      pickedSlots.add(drawn.selectionSlot ?? "generic");
      pool.splice(pool.indexOf(drawn), 1); // without replacement
    }
  };

  drawFrom(tier, false);
  for (const lower of TIER_FALLBACK[tier]) {
    if (choices.length >= count) break;
    drawFrom(lower, false);
  }
  // ⭐ 最後一輪：偏好用完了還沒填滿，就放行舊卡池。⛔ `eligibility` 仍然不放寬。
  // 這一輪存在的理由與上面的 tier fallback 逐字相同 —— 一張發不滿的卡不是選擇。
  if (choices.length < count && rules.legacyPool === "exclude") {
    drawFrom(tier, true);
    for (const lower of TIER_FALLBACK[tier]) {
      if (choices.length >= count) break;
      drawFrom(lower, true);
    }
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
    // 格擋 / 暴擊來源（GH#299 第 2 · 6 條）—— 三選一增益卡在此之前只發得出
    // `modifiers` + `hooks`，所以「這一場每次攻擊 20% 機率 3 倍」只能退化成加
    // 兩條**聚合**屬性，而那會讓身上每一次暴擊都變成那個倍率，不是這張卡自己的
    // 那一次。⛔ 一份轉發 —— 見 `stats/sourceGrants.ts` 檔頭。
    ...sourceGrants(def),
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
 * What a card does when the ELIGIBLE POOL is genuinely smaller than the card —
 * every gate has run and there are simply not `count` legal weapons left.
 *
 *   · `short`     — offer what exists. A 2-card is honest.
 *   · `fallback`  — top up from `fallbackTable` (a second loot table).
 *   · `duplicate` — repeat the drawn entries until the card is full.
 *
 * ⚠️ This is NOT the switch that fixes GH#249. The card owner saw shrink to one
 * was NOT pool exhaustion — it was `MatchController` rolling 3 and THEN dropping
 * the non-whitelisted ones. That is a bug and it is fixed by ordering (the
 * whitelist is now inside {@link eligibleItemPool}), not by a policy an operator
 * can turn off. This enum only governs the genuinely-exhausted case.
 */
export type ShortPoolMode = "short" | "fallback" | "duplicate";

export interface ItemDraftPolicy {
  shortPoolMode: ShortPoolMode;
  /** loot table to borrow from under `fallback`; "" = nothing to borrow from */
  fallbackTable: string;
  /** hard ceiling on weighted draws for ONE card (see `offerItems`) */
  maxDraws: number;
  /**
   * 三選一不可以發哪些 `craftRole`（owner 2026-08-04）。省略 = 出貨值
   * {@link DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES}。
   *
   * ⚠️ **它不在這個檔案裡被讀** —— host 把它抄到 `world.offerExcludedCraftRoles`，
   * 而真正的閘在 `economy/offerEligibility.itemOfferableTo`，**兩條門共用**
   * （免費卡走這裡的 `eligibleItemPool`，寶玉走 `legendaryOrb.legendaryPool`）。
   * 放在 policy 上只是因為它是同一塊後台設定；讀取點刻意只有一個。
   */
  excludedCraftRoles?: readonly string[];
}

/**
 * SHIPPED DEFAULT = `short`, deliberately the most conservative of the three.
 *
 * The other two both hand the player something the content does not say they
 * should get: `duplicate` shows the same weapon twice, which is a card that
 * LOOKS like a choice and is not (task #47's complaint one layer up), and
 * `fallback` hands out items from a table the owner did not put in this round's
 * pool. `short` states the truth — there really were only two legal weapons —
 * and it is byte-identical to the behaviour that shipped before this policy
 * existed, so turning the knob is what changes the game, not adding it.
 *
 * `maxDraws` 64 bounds ONE card's weighted draws. Every draw removes an entry
 * from its working pool, so termination never depends on this number; it is a
 * ceiling on a mis-typed `count` or a future replacement-mode draw, and 64 is
 * comfortably above the largest shipped pool (49, `legendary-weapons`).
 */
export const DEFAULT_ITEM_DRAFT_POLICY: ItemDraftPolicy = {
  shortPoolMode: "short",
  fallbackTable: "",
  maxDraws: 64,
  excludedCraftRoles: DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES,
};

interface PoolEntry {
  itemId: ItemId;
  weight: number;
}

/**
 * Every weapon in `tableId` this champion could legally be offered RIGHT NOW.
 *
 * ---------------------------------------------------------------------------
 * GH#249 — 「傳說武器有時候只有跳出一個而不是三選一」
 * ---------------------------------------------------------------------------
 * THREE gates, and the third one is the one that was in the wrong place:
 *
 *   1. already owned            — always filtered here
 *   2. `itemOfferableTo`        — draftEligible + requiresAttackType (#189)
 *   3. `world.itemEligible`     — the OPERATOR WHITELIST … which until GH#249
 *      ran in `MatchController` AFTER the roll:
 *
 *          const offer = offerItems(world, entity, table, 3);
 *          offer.choices = this.whitelist.filterItems(offer.choices);   // ← 3→1
 *
 * The pool is 49 entries. A whitelist that enables W of them turns a 3-card into
 * an expected 3·W/49 cards — every non-enabled entry the roll happened to pick
 * simply vanished off the card instead of the roll topping back up. That is why
 * the shrink was INTERMITTENT: it depended on what the dice picked.
 *
 * The whitelist has always been a sim input (`SimWorld.itemEligible`, set from
 * the curation snapshot and recorded in the replay header), and the 傳說寶玉 has
 * always consulted it BEFORE its roll (`economy/legendaryOrb.legendaryPool`).
 * The round card is now the same shape, in one shared function so there is no
 * second copy to forget.
 *
 * ⚠️ This CHANGES THE RNG STREAM of a weapon round versus pre-GH#249 builds:
 * rejected entries used to consume a draw and now never enter the pool. Same
 * seed + same code still gives the same cards (that is the invariant replays
 * need); a recording made by an older build will diverge from this round on.
 */
export function eligibleItemPool(world: SimWorld, entity: EntityId, tableId: string): PoolEntry[] {
  const champ = world.champion.get(entity);
  const owned = new Set(champ?.items ?? []);
  const table = LootTables.tryGet(tableId);
  const allow = world.itemEligible;
  const out: PoolEntry[] = [];
  for (const e of table?.entries ?? []) {
    if (owned.has(e.itemId)) continue;
    if (allow !== null && !allow(e.itemId)) continue;
    if (!itemOfferableTo(world, entity, e.itemId)) continue;
    out.push({ itemId: e.itemId, weight: e.weight });
  }
  return out;
}

/**
 * Draw up to `want` entries out of `working` (MUTATED — drawn entries are
 * spliced out, so this is without replacement), weighted, appending onto
 * `into`. Returns how many draws it spent, so one card's total stays bounded.
 *
 * The weighted pick is byte-identical to the pre-GH#249 loop: same
 * `rng.next() * total`, same descending accumulation, same last-entry fallback
 * when floating-point leaves the accumulator positive.
 */
function drawInto(
  world: SimWorld,
  working: PoolEntry[],
  want: number,
  budget: number,
  into: ItemId[],
): number {
  let spent = 0;
  while (into.length < want && working.length > 0 && spent < budget) {
    spent++;
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
    into.push(working[idx]!.itemId);
    working.splice(idx, 1); // without replacement
  }
  return spent;
}

/**
 * Roll a `count`-choose-1 item card from a loot table.
 *
 * FILTER → ROLL → TOP UP. The filter is {@link eligibleItemPool} (owned +
 * offer gates + operator whitelist) and it runs first, so the roll can only ever
 * pick a card the player is allowed to receive and the card is `count` long
 * whenever `count` legal weapons exist — see that function for the GH#249
 * post-filter this replaces. The top-up only runs when the pool is GENUINELY
 * exhausted, and what it does then is `policy.shortPoolMode`.
 *
 * DETERMINISM: every draw comes off `world.rng` in pool order (the loot table's
 * own order — no Map iteration, no clock, no `Math.random`). Same seed + same
 * pool ⇒ same card, every time; `draftTopUp.test.ts` runs one seed twice and
 * compares.
 */
export function offerItems(
  world: SimWorld,
  entity: EntityId,
  tableId: string,
  count = 3,
  policy: ItemDraftPolicy = DEFAULT_ITEM_DRAFT_POLICY,
): ItemOffer {
  const budget = Math.max(1, Math.trunc(policy.maxDraws));
  const working = eligibleItemPool(world, entity, tableId);
  const poolSize = working.length;

  const choices: ItemId[] = [];
  let spent = drawInto(world, working, count, budget, choices);

  // ---- top-up: ONLY reachable when the eligible pool ran out ----
  if (choices.length < count && policy.shortPoolMode === "fallback") {
    // A fallback onto the same table is a no-op by construction (that pool is
    // already empty), so it is skipped rather than spending draws proving it.
    if (policy.fallbackTable !== "" && policy.fallbackTable !== tableId) {
      const already = new Set(choices);
      const extra = eligibleItemPool(world, entity, policy.fallbackTable).filter(
        (e) => !already.has(e.itemId),
      );
      spent += drawInto(world, extra, count, budget - spent, choices);
    }
  }
  if (choices.length < count && policy.shortPoolMode === "duplicate" && choices.length > 0) {
    // Cycle the card in draw order. Consumes NO rng — a mode that drew more
    // random values would make the stream depend on pool size, and the whole
    // point of the exhausted branch is that there was nothing left to draw.
    const distinct = choices.length;
    for (let i = 0; choices.length < count && i < count; i++) {
      choices.push(choices[i % distinct]!);
    }
  }

  const offer: ItemOffer = { entity, tier: ITEM_OFFER_TIER, choices, picked: null };
  // `poolSize` rides the event so the host can say WHY a card came up short
  // (exhausted pool) instead of guessing. `itemOffer` is SERVER_ONLY in
  // net/eventFanout.ts — the card itself reaches the client as SeatState.offers.
  world.emit("itemOffer", { entity, tableId, choices, poolSize, draws: spent });
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
