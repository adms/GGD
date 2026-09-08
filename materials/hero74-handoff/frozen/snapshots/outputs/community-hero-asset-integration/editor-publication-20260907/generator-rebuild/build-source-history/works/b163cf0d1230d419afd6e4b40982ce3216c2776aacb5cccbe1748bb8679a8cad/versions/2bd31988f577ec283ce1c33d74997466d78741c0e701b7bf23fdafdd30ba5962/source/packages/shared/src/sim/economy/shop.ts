/** Shop (道具購買), item gacha (道具抽卡), inventory, and buy/sell undo. */
import type { EntityId, ItemId } from "../../ids";
import type { ChampionComp, ItemAcquisition, ShopTxn } from "../components";
import type { SimWorld } from "../SimWorld";
import { Items, LootTables } from "../content/registry";
import { attachItemSource, detachItemSource } from "./itemSource";
import {
  LEGENDARY_ORB_ITEM_ID,
  STAT_TICK_ITEM_ID,
  itemHasEffect,
  legendaryShelfPrice,
} from "./itemTiers";
import { buyLegendaryOrb, purchasableSlots } from "./legendaryOrb";
import { DEFAULT_SELL_REFUND_PCT, legendaryShelfIds, randomOnlyIds, shelfListable } from "./shopShelf";
import { buyStatUpgrade, resetStatPath } from "./statPath";
import { shopChargeFor } from "./itemTiers";

export const INVENTORY_SLOTS = 6;
/**
 * 出貨的賣出退款率。⛔ **不是**執行期讀的那一個 —— 那是後台可調的
 * {@link sellRefundPct}（`config.arena-rules@1` 的 `legendaryShelf.sellRefundPct`）。
 * 這個名字留著是因為十來個既有守衛 import 它，而它們算的是同一件事：
 * 「出貨設定下賣掉退多少」。
 */
export const SELL_REFUND = DEFAULT_SELL_REFUND_PCT;

/**
 * 這一場的賣出退款率（owner 2026-08-17「賣價一定是取得價的 40%（後台可設定）」）。
 *
 * ⭐ 存在的理由是**位置不該外洩**：這一格今天住在 `legendaryShelf` 區塊裡
 * （見 shopShelf.ts 的 `DEFAULT_SELL_REFUND_PCT`），而它管的是整間商店。
 * 呼叫端問的是「退款率是多少」，⛔ 不是「它住在哪一個 config 區塊」。
 */
export function sellRefundPct(world: SimWorld): number {
  return world.legendaryShelf.sellRefundPct;
}

/**
 * ⭐ 一格裝備的**取得紀錄**（實付多少 · 是不是隨機拿到的）。
 * 沒有紀錄 = 不知道付了多少 = 當作 0（fail-closed，⛔ 不會憑空生錢）。
 *
 * 這是**唯一**的讀取口：UI、退款、undo 全部走它，所以
 * 「`itemAcq` 是 optional」這件事只有這裡需要知道。
 */
export function slotAcquisition(champ: ChampionComp, slot: number): ItemAcquisition | null {
  return champ.itemAcq?.[slot] ?? null;
}

/** 免費且隨機取得（三選一卡 / 傳說寶玉 / 任何 `grantItemFree`）。 */
const FREE_RANDOM: ItemAcquisition = Object.freeze({ paid: 0, random: true });

/**
 * ⚠️ THE ONLY WAY 一件道具進入一個格子。`items` 與 `itemAcq` **一起**寫。
 *
 * 分開寫的代價是量得到的：三個 attach 點（買 / undo 賣 / 免費發）漏掉任何一個，
 * 那一格的取得價就是 `null` → 退款 0 → 玩家賣掉一把 9,600 金的寶具拿回 0，
 * 而**畫面上不會有任何錯誤**（失敗形態 ②）。
 */
function setSlot(champ: ChampionComp, slot: number, itemId: ItemId, acq: ItemAcquisition): void {
  champ.items[slot] = itemId;
  if (champ.itemAcq === undefined) champ.itemAcq = new Array(champ.items.length).fill(null);
  champ.itemAcq[slot] = acq;
}

/** {@link setSlot} 的反面 —— 賣出與 undo-買 的唯一出口。 */
function clearSlot(champ: ChampionComp, slot: number): void {
  champ.items[slot] = null;
  if (champ.itemAcq !== undefined) champ.itemAcq[slot] = null;
}

/**
 * ⭐ 這一格**現在賣掉會拿到多少金幣**。
 *
 * `sellItem` 付的是這個函式，畫面上顯示的也要是這個函式（透過 snapshot 投影）——
 * ⛔ 兩邊各自算一次就是 #106 的老問題「面板寫的和實際拿到的不一樣」，而這一次
 * 差距不是四捨五入，是 3,840 對 0。
 */
export function slotRefund(world: SimWorld, champ: ChampionComp, slot: number): number {
  return Math.floor((slotAcquisition(champ, slot)?.paid ?? 0) * sellRefundPct(world));
}

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
  | "no-effect"
  /**
   * 暫時下架 (#261): the item is real, priced and effectful, but the weapon
   * SHELF is closed — 「除了能力屬性強化、及傳說寶玉外，其他武器道具先全部暫時
   * 下架無法選擇」.
   *
   * This is a SIM refusal for the same reason `not-purchasable` is: the client's
   * `shopCatalogue` already keeps the weapons off the shelf, but a listing rule
   * is not an invariant — a modified client, a stale bundle or a hand-rolled
   * command could still name a whitelisted 1200g id here. It carries its own
   * reason so the HUD can say 「暫時下架」 rather than a wrong "傳說武器" line,
   * and so re-opening the shelf is one boolean rather than a hunt for the branch
   * that silently swallowed the buy.
   */
  | "shelf-closed";

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
    // A committed stat tick is not a reversible weapon buy, and it mutates the
    // very stat-streak an item-buy undo would restore — so it COMMITS the
    // session, closing the undo history (task #121). Only on success.
    if (outcome.result === "ok") champ.undoStack.length = 0;
    return outcome.result === "ok" ? "ok" : outcome.result === "no-gold" ? "no-gold" : "unknown-item";
  }
  if (itemId === LEGENDARY_ORB_ITEM_ID) {
    const roll = buyLegendaryOrb(world, id);
    if (roll.result !== "ok") return roll.result === "no-champion" ? "unknown-item" : roll.result;
    resetStatPath(world, id, itemId);
    // the orb reserves a slot + rolls a host-side card — not cleanly reversible,
    // so it commits the session too (task #121).
    champ.undoStack.length = 0;
    return "ok";
  }

  // ⭐ 寶具（傳說武器）—— owner 2026-08-17「寶具可以上架直接販售了」。
  // 「在 legendary-weapons 那張表裡」是**唯一**的判準（`legendaryShelfIds`），
  // ⛔ 不是 tier / tag / craftRole（量過：那三個都對不上這 49 把）。
  const inLegendaryPool = legendaryShelfIds().has(itemId);

  // ⭐ 隨機限定階層（owner 2026-08-17：「仍然可以有寶具是**隨機才能取得**的，
  // 我預計是新增的 50~70 個⋯」；名字後來定為 [EX解放]/[EX∅ 根源]）。⛔ 它排在**寶具旁路之前**，而且
  // 是**全域**的一道閘 —— 不是只擋寶具：更高階那兩批各自是一張表，如果它們
  // 剛好帶價格又是 `final`，只擋寶具那一條路的話它們會從普通武器那條路上架。
  //
  // ⚠️ 這道閘與 `shopCatalogue` 的同一條規則**必須同時在**（同一支
  // `randomOnlyIds`）：只擋伺服器 = 畫面上買得到、按下去被拒；只擋畫面 =
  // 一個改過的客戶端就買得到。回 `shelf-closed`，因為對玩家而言它就是
  // 「這件東西不在商店賣」，而 HUD 已經有那一句文案。
  if (randomOnlyIds(world.legendaryShelf.randomOnlyTables).has(itemId)) return "shelf-closed";

  // 兩格**獨立**的貨架，各自回同一個 `shelf-closed` 理由：
  //   寶具   world.legendaryShelf.open —— owner 2026-08-17 起出貨是開的
  //   普通武器 world.weaponShelfOpen  —— #261 暫時下架，仍然關著
  // 都排在任何金幣移動之前，所以關著的貨架不可能收到一塊錢。兩者都 NOT 影響
  // `grantItemFree` / 三選一：「隨機三選一仍然可以隨機到」。
  if (inLegendaryPool) {
    if (!world.legendaryShelf.open) return "shelf-closed";
  } else if (!shelfListable(itemId, world.weaponShelfOpen)) {
    return "shelf-closed";
  }

  const def = Items.tryGet(itemId);
  if (!def) return "unknown-item";
  // 這一場的**成交價**。寶具是推導出來的（49 把 `cost` 全部是 0，統一價 =
  // 傳說寶玉 × 後台倍率），其餘照 doc 上的標價。⚠️ 下面每一處金額都讀這個
  // 變數 —— 扣款、`no-gold` 門檻、undo 的 `goldDelta` 三者對不上就是憑空生錢。
  const listPrice = inLegendaryPool
    ? legendaryShelfPrice(world.legendaryShelf.priceMultiplier)
    : def.cost;
  if (listPrice <= 0) return "not-purchasable";
  // ⭐ 這位英雄的售價倍率（owner 2026-08-18：bot 半價）。⚠️ 打折要在 `price` **這一格**
  // 生效，⛔ 不是只在扣款那一行 —— `paid` 也讀它，而賣出退款讀的是 `paid`。
  // 只在扣款打折的話，bot 用半價買進、原價退出 ＝ 一台印鈔機。
  const price = shopChargeFor(champ.shopPriceMult, listPrice);
  if (price <= 0) return "not-purchasable";
  // Both halves of "you may never be charged for nothing". The two SERVICES
  // are legitimately payload-free and are dispatched by id above, so they
  // never reach this line. Checked BEFORE the role backstop so an inert item
  // keeps its specific `no-effect` reason (the HUD says WHY it is greyed).
  if (!itemHasEffect(def)) return "no-effect";
  // RULE 1 SERVER-SIDE BACKSTOP (owner, task #70): 「只有最終合成武器才能上架可
  // 直接購買」. The client `shopCatalogue` already keeps non-finals off the shelf,
  // but that is a LISTING rule, not an invariant — a modified client, a future
  // caller, or a whitelist that (as today) enables components as items could
  // still name an effectful component id here (e.g. 熱戀魔杖, 300g). The role
  // marker was recovered from the source-map triggers (see defs.ts /
  // extract_item_roles.py), so this is the one authoritative gate: only a
  // `final` may be bought with gold. Services are dispatched by id ABOVE; quest
  // items are 0g and already rejected as `not-purchasable`; a legacy doc with
  // no marker is left alone. A component/token/direct/none is refused here even
  // when priced, effectful and whitelisted.
  //
  // ⭐ 寶具走一條**具名的旁路**（owner 2026-08-17）。那 49 把裡有 17 把 `none`
  // 與 6 把 `quest`，照這道閘會有 23 把靜靜地上不了架 —— 而 owner 說的是整批。
  // ⛔ 旁路只認 `inLegendaryPool`，⛔ 不是把 craftRole 檢查拿掉：那道閘同時
  // 擋著 70 把普通武器的合成原料（GH#70「合成原料不可以直接買」），拿掉它們
  // 就一起上架了。
  if (!inLegendaryPool && def.craftRole !== undefined && def.craftRole !== "final") {
    return "not-purchasable";
  }
  if (def.unique && champ.items.includes(itemId)) return "unique-owned";
  // A slot held by an unpicked 傳說寶玉 card is NOT available to buy into: the
  // orb was paid for and its legendary has to have somewhere to land. Without
  // the reservation term, spending the last slot between the roll and the pick
  // silently voided a 2400g purchase.
  const slot = champ.items.findIndex((s) => s === null);
  if (slot < 0 || purchasableSlots(champ) < 1) return "no-slot";
  if (champ.gold < price) return "no-gold";

  // Capture the stat-streak BEFORE resetStatPath zeroes it, so an undo of this
  // buy can restore it EXACTLY (task #121).
  const statStacksBefore = champ.statStacks;
  champ.gold -= price;
  // ⭐ 取得紀錄與格子**同一行**寫進去（`setSlot`）：`paid` 是這一場真的收走的
  // 金額（寶具＝推導價），`random: false` 因為這是掏錢買的。賣出退款讀的就是
  // 這個 `paid`，⛔ 不是 `def.cost`（那對 49 把寶具全部是 0）。
  setSlot(champ, slot, itemId, { paid: price, random: false });
  // SITE 1 of 3. All three go through `attachItemSource` (economy/itemSource.ts)
  // rather than building the literal here: the 光環 field once had to be pasted
  // onto three sites and 「an item that projects an aura when bought but not when
  // drafted is a bug that only shows up on the 三選一 path」 — and the 職業限定閘
  // on `modifiers` (貫雷槍) would have been the second field to take that bet.
  //
  // ⚠️ CORRECTED 2026-08-01 (CLAUDE.md 第三守則). This paragraph used to cite
  // 「`shopAttachSites.test.ts` drives all three paths」 — **THAT FILE DID NOT
  // EXIST**, and the guard it promised is exactly the one that would have caught
  // the editor's `previewItem` shipping a hand-built literal (it previewed 貫雷槍
  // as +6 on every body). Two real files now hold up the claim:
  //
  //   · `itemGatedModifiers.test.ts` 「every attach site resolves the gate —
  //     buy / undo-sell / free grant」 drives these THREE paths and compares the
  //     resolved modifier lists, so dropping any one back to a literal goes red.
  //   · `shopAttachSites.test.ts` parses the repo and fails on ANY hand-built
  //     `kind:"item"` ModifierSource outside itemSource.ts — the net for the
  //     FOURTH site, which no per-path test can see.
  attachItemSource(world, id, itemId, slot, def);
  resetStatPath(world, id, itemId);
  // Record the exact reversal for the undo button. goldDelta is NEGATIVE (gold
  // spent); undo does `gold -= goldDelta` to refund precisely what was charged.
  // goldDelta 記的是**真的收了多少**（寶具＝推導價），⛔ 不是 `def.cost` ——
  // undo 做的是 `gold -= goldDelta`，抄錯一個來源就是一台印鈔機。
  champ.undoStack.push({ kind: "buy", itemId, slot, goldDelta: -price, statStacksBefore });
  world.emit("itemBought", { id, itemId, slot, gold: champ.gold });
  return "ok";
}

export function sellItem(world: SimWorld, id: EntityId, slot: number): boolean {
  const champ = world.champion.get(id);
  if (!champ) return false;
  // ⛔⛔ **格子編號必須是一個真的陣列索引** —— sec-input-01 的那條線。
  //
  // 客戶端送得出 `itemSlot: "__proto__"`，而 `champ.items["__proto__"]` 回的是
  // `Array.prototype`：**truthy**，所以它會直接穿過下面那道 `if (!itemId)`。
  // 2026-08-17 之前這條路會在 `Items.get(Array.prototype)` 丟例外，而 #46 的
  // tick catch 把例外變成整房斷線（一則訊息就能 DoS 6–12 個人）。
  // 那一句 `Items.get` 在賣價改成「取得價 × 退款率」之後不再需要，於是它被拿掉了 ——
  // ⚠️ **而它同時是唯一擋住這條路的東西**。少了它就不會炸了，但會走到
  // `clearSlot(champ, "__proto__")`，也就是 `champ.items["__proto__"] = null`
  // ⇒ **把那個陣列的原型設成 null**，那位英雄的背包從此沒有任何陣列方法，
  // 而且**完全不丟例外**。比原本的崩潰更難查。
  //
  // ⇒ 這道閘是**深度防禦**：`sanitizeInputMessage` 在入口已經丟掉它（那是外層），
  // 這裡確保就算有人繞過入口，sim 也只是**拒絕**而不是損毀狀態。
  // 守衛：`apps/game-server/src/net/validateInput.test.ts` 的 sec-input-01。
  if (!Number.isInteger(slot) || slot < 0 || slot >= champ.items.length) return false;
  const itemId = champ.items[slot];
  if (!itemId) return false;
  // ⚠️ 這裡本來有一句 `const def = Items.get(itemId)`，唯一的用途是 `def.cost`。
  // 退款不再讀它，所以它整句拿掉 —— 留著會是一個「看起來在驗證什麼」的空 call。
  // ⭐ 賣價 = **這一格當初實付的金額** × 後台退款率（owner 2026-08-17：
  // 「賣價一定是取得價的 40%（後台可設定）」）。
  //
  // ⛔ 乘的**不是** `def.cost`。那是 2026-08-17 之前的寫法，而它對 49 把寶具
  // 全部是 0 —— 花 14,400 買一把，賣掉退 0，畫面上還理直氣壯地寫著「+0 g」。
  // ⛔ 也**不是**「推導的上架價 × 40%」：那會讓每一張**免費**發出去的三選一
  // 寶具都能換一筆錢（回合 2、5 各一張），是一台比前者嚴重得多的印鈔機。
  // 唯一不會兩邊都錯的量是**真的付了多少**，所以它被記在格子上。
  //
  // 沒有紀錄（舊 replay / 手寫夾具 / 繞過 `setSlot` 的路徑）→ `paid` 當 0，
  // fail-CLOSED：退不到錢是看得見的，而憑空生錢不是。
  const acq = slotAcquisition(champ, slot);
  const refund = slotRefund(world, champ, slot);
  champ.gold += refund;
  clearSlot(champ, slot);
  // DETACH SITE 1 of 2 — through `detachItemSource`, never `detachSource`
  // directly: the slot is cleared first, then the helper re-runs the 套裝 check
  // so a completed set stops paying the moment a piece is sold. Bypassing it
  // gives 「賣掉還留著」, which no per-item test can see.
  detachItemSource(world, id, itemId, slot);
  // goldDelta is POSITIVE (refund received); undo does `gold -= goldDelta`.
  // `acq` 一起收進去：undo 要把格子還原成**當初那一格**，取得價也是那一格的
  // 一部分。少了它，undo 之後再賣一次只退 0（見 ShopTxn.acq）。
  champ.undoStack.push({ kind: "sell", itemId, slot, goldDelta: refund, statStacksBefore: 0, acq });
  world.emit("itemSold", { id, itemId, slot, gold: champ.gold });
  return true;
}

/**
 * Result of an {@link undoShopAction}. `ok` reversed the top transaction;
 * `nothing-to-undo` means the session's undo history is empty (you cannot undo
 * more than you did, so a second undo of the same action is impossible); `stale`
 * means the recorded slot no longer holds what the reversal expects and the undo
 * was refused rather than clobber inventory (defensive — the commit rules below
 * keep this from arising in normal play).
 */
export type UndoResult = "ok" | "nothing-to-undo" | "stale" | "no-champion";

/**
 * Undo the most recent buy/sell of the current shopping session (task #121).
 *
 * THE NO-ARBITRAGE INVARIANT. Every entry stores the gold delta that was
 * actually applied, so an undo is the exact inverse — `gold -= goldDelta` —
 * and a buy→sell (a real −60% loss) followed by undo→undo returns to the precise
 * starting gold and inventory, never a coin more. The entry is POPPED, so no
 * action is ever undone twice; the stack is cleared when combat commits the
 * round (enterCombat) and the command gate refuses undo once the shop closes, so
 * there is no way to repeat any buy→sell→undo cycle to manufacture gold.
 */
export function undoShopAction(world: SimWorld, id: EntityId): UndoResult {
  const champ = world.champion.get(id);
  if (!champ) return "no-champion";
  const txn: ShopTxn | undefined = champ.undoStack[champ.undoStack.length - 1];
  if (!txn) return "nothing-to-undo";

  if (txn.kind === "buy") {
    // reversing a buy: the item must still sit where it landed
    if (champ.items[txn.slot] !== txn.itemId) return "stale";
    clearSlot(champ, txn.slot);
    // DETACH SITE 2 of 2 — see sellItem.
    detachItemSource(world, id, txn.itemId, txn.slot);
    champ.gold -= txn.goldDelta; // goldDelta < 0 → refund the exact cost
    champ.statStacks = txn.statStacksBefore; // restore the streak the buy 歸零'd
  } else {
    // reversing a sell: the slot must still be empty for the item to return
    if (champ.items[txn.slot] !== null) return "stale";
    const def = Items.get(txn.itemId);
    // 取得紀錄跟著回來。⚠️ `?? FREE_RANDOM` 是給**這一格出現之前**存下的
    // 交易（沒有 `acq`）用的：當作「免費隨機拿到的」，退款 0，⛔ 不會生錢。
    setSlot(champ, txn.slot, txn.itemId, txn.acq ?? FREE_RANDOM);
    // SITE 2 of 3 — see the buy path.
    attachItemSource(world, id, txn.itemId, txn.slot, def);
    champ.gold -= txn.goldDelta; // goldDelta > 0 → take the exact refund back
  }

  champ.undoStack.pop(); // consumed — the same action can never be undone twice
  world.emit("shopUndone", {
    id,
    kind: txn.kind,
    itemId: txn.itemId,
    slot: txn.slot,
    gold: champ.gold,
  });
  return "ok";
}

/**
 * Commit the current shopping session — drop the undo history so nothing bought
 * this round can be reversed once combat starts (task #121). Called by the
 * MatchController at enterCombat; keeping it here means the shop owns its own
 * lifecycle and a stray cross-round undo can never manufacture a free refund.
 */
export function commitShopSession(world: SimWorld, id: EntityId): void {
  const champ = world.champion.get(id);
  if (champ) champ.undoStack.length = 0;
}

/**
 * Grant an item for free into the first open inventory slot (no gold cost) —
 * the landing path for gacha rolls and arena weapon-offer picks.
 * Returns the slot index, or -1 when the inventory is full / item unknown.
 *
 * ⭐ 記下來的取得紀錄是 `{ paid: 0, random: true }`（owner 2026-08-17：三選一與
 * 寶玉抽到的都算**隨機取得**，而且賣掉退 0）。`acq` 有預設值是為了讓未來
 * 「免費但**不是**隨機」的發法（活動 / 劇情 / 後台送）不必再開一條路 ——
 * 今天全部四個呼叫端（三選一、寶玉、gacha、dev cheat）都是隨機路徑。
 */
export function grantItemFree(
  world: SimWorld,
  id: EntityId,
  itemId: ItemId,
  acq: ItemAcquisition = FREE_RANDOM,
): number {
  const champ = world.champion.get(id);
  if (!champ) return -1;
  const def = Items.tryGet(itemId);
  if (!def) return -1;
  const slot = champ.items.findIndex((s) => s === null);
  if (slot < 0) return -1;
  setSlot(champ, slot, itemId, acq);
  // SITE 3 of 3 — the 三選一 / gacha path, the one a hand-copied literal has
  // already been forgotten on once. See the buy path.
  attachItemSource(world, id, itemId, slot, def);
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
