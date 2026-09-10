/**
 * legendaryOrb — 傳說寶玉. 「傳說的武器道具，只能隨機三選一（購買也可傳說寶玉
 * 觸發而非直接購買傳說武器道具）」.
 *
 * ⚠️ CORRECTED 2026-09-06（GH#1030）：下面那句「You never buy a legendary」自 2026-08-17
 * 起不成立 —— `legendaryShelf.open` 出貨 true，`buyItem` 直購 30 把基礎寶具；而寶玉只是
 * 取得管道之一（完整聯集：`obtainableItems.test.ts`）。這一段其餘機制描述仍然成立。
 *
 * THE SHAPE OF THE MECHANIC. You never buy a legendary. You buy the GACHA
 * TOKEN, and the token immediately opens the same 3-choose-1 card the round-5
 * draft opens, rolled from the same `legendary-weapons` table. The orb is
 * consumed on use and occupies no inventory slot. What it can ROLL is gated by
 * {@link orbEligible}, which excludes recipe components, 兌換 tokens and shop
 * services — so buying the orb can never hand out a raw crafting COMPONENT
 * (task #70, the reported second door). It respects the standing no-crafting
 * decision by construction too: there is no combine STEP anywhere in it.
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
import { economyRules } from "./economyRules";
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Items, LootTables } from "../content/registry";
import { LEGENDARY_ORB_PRICE, LEGENDARY_POOL_TABLE, itemHasEffect, shopChargeFor } from "./itemTiers";
import { itemOfferableTo } from "./offerEligibility";

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
    .filter(
      (itemId) =>
        !owned.has(itemId) &&
        (eligible === null || eligible(itemId)) &&
        orbEligible(itemId) &&
        // #189 近戰限定 — see economy/offerEligibility.ts. Filtered here, BEFORE
        // the roll, for the reason spelled out in this file's header: an empty
        // pool must refuse the 2400g purchase, never charge for a dead card.
        itemOfferableTo(world, id, itemId),
    );
}

/**
 * THE SECOND-DOOR GUARD (task #70, reopened) — **它的 craftRole 那一半在
 * 2026-08-04 搬走了，這裡只剩「發出去的東西必須做得了事」。**
 *
 * ── 原本的守衛 ─────────────────────────────────────────────────────────────
 * The report found that buying the 2400g orb could hand the player a raw recipe
 * COMPONENT (天叢雲劍/貫雷槍/名刀-天狼/斬岩刃/熾天使之弓/龍騎士之劍/八取武士刀),
 * because the pool was filtered by ownership + whitelist ALONE. It closed that
 * by excluding `component` / `token` / `service` **here, in this file only**.
 *
 * ── 為什麼搬走 ─────────────────────────────────────────────────────────────
 * ⛔ **只在這裡擋，就是本檔與 `economy/offerEligibility.ts` 兩份檔頭都警告過的
 * 「半套修法」的活標本** —— 第 2/5 回合的免費武器卡走 `economy/draft.ts`，
 * 那條路**從來沒有 craftRole 閘**（2026-08-04 實測 `grep craftRole draft.ts`
 * 零命中）。於是同一支合成原料：免費卡發得出來、寶玉抽不到。
 *
 * owner 2026-08-04:「**49支可被隨機三選一 就好**」 →
 * 判斷是**放寬**而不是把免費卡也關起來，三個理由：
 *   1. **GGD 沒有合成系統**（owner 2026-07-22:「理論上競技場上的所有道具跟武器
 *      都不需要合成」），所以 `craftRole:"component"` 描述的是一個不存在的系統
 *      裡的角色 —— 它在這個遊戲裡不是「半成品」，就只是一件武器。
 *   2. owner 2026-08-01 **逐支親筆寫了全部 49 支的「效能」文案**
 *      (`content/__fixtures__/legendary49OwnerText.json`) —— 那就是核准。
 *   3. 那 8 支每一支都通過 `itemHasEffect`，不是空殼。
 *
 * 現在清單住在 `offerEligibility.DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES`
 * ＋後台欄位 `config.arena-rules@1` 的 `itemDraft.excludedCraftRoles`，
 * **兩條門讀同一份**（`itemOfferableTo` 在下面的 filter 裡已經被呼叫）。
 * 出貨值保留 `token` / `service`（獎勵池裡無意義，而且 49 支裡一支都不是，
 * 所以留著零代價）。owner 想把 `component` 關回去是**存檔不是部署**。
 *
 * 這裡剩下的 `itemHasEffect` 是**不可協商**的那一半：
 * A doc with no role marker is legacy/skeleton and passes.
 * **Everything offered must still DO something.**
 */
function orbEligible(itemId: ItemId): boolean {
  const def = Items.tryGet(itemId);
  if (!def) return false;
  return itemHasEffect(def);
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
  // ⭐ 這位英雄的售價倍率（見 `itemTiers.shopChargeFor`）。owner 2026-08-18 的
  // 「bot 一樣花錢買隨機寶具，只是消耗金錢是半價」走的就是這一顆寶玉 + 這一格。
  const price = shopChargeFor(champ.shopPriceMult, economyRules(world).legendaryOrbPrice);
  if (champ.gold < price) return { result: "no-gold", choices: [] };
  // The roll has to land somewhere. Checking BEFORE charging means a full
  // inventory is a refusal, never a 2400g no-op — and the check counts slots
  // already RESERVED by orbs still awaiting their pick, so buying two orbs
  // with one slot free is refused on the second rather than overbooking it.
  if (freeSlots(champ) <= champ.pendingOrbSlots) return { result: "no-slot", choices: [] };

  const pool = legendaryPool(world, id);
  if (pool.length === 0) return { result: "empty-pool", choices: [] };

  champ.gold -= price;
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
