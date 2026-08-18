/**
 * itemTiers — THE price list. 「武器價格請統一化，只有三種價格」.
 *
 * WHY THIS FILE EXISTS. Before task #82 every item carried whatever price the
 * w3x author happened to type: 正義之杖 cost 100,000g for 40 HP / 2 ad / 24
 * mana, 恐龍之斧 cost 1,050g for four times that value, and price rank and
 * VALUE rank disagreed on 41 of the 59 imported shop items. Price therefore
 * carried no information at all, which is why unifying it costs the design
 * nothing and buys it a shop a player can read at a glance.
 *
 * THE MODEL (derived in phase 1; the derivation is not repeated here, only its
 * conclusions, because these constants are the contract every other file in the
 * economy reads):
 *
 *   POWER   = sqrt(DPS_mitigated x eHP) measured on the shipped sim.
 *   1 AEP   = the marginal POWER of 1 point of AD on the roster-median champion
 *             at level 5. It is the common currency: 1 AD = 10.2 HP = 2.6 armor
 *             = 4.87 AP, so 45 armour and 572 maxHealth become comparable
 *             without a hand-picked exchange rate.
 *   x2.5    = the design target for a full 6-slot build at level 8. Solved
 *             numerically against the AEP rates it needs 208 AEP, and the
 *             canonical end state (4 POWERFUL bought + 2 draft-granted
 *             LEGENDARY = 32 SIMPLE-budgets) fixes B_SIMPLE = 6.5 AEP.
 *
 * ⚠️ CORRECTED 2026-08-17 (CLAUDE.md 第三守則). 上面那個「32 SIMPLE 預算」曾經
 * 被當成「終局 = 9,600 金」在引用，而那是 **#82 時代的舊回合表**。現在的
 * `content/config/arena-rules.json` 給的是：R3 累計 1,575 · R5 3,625 ·
 * R8 7,575 · R10 12,075 · R12 20,075 · R13 24,075（`grantGold` 保證收入），
 * 外加小怪 20/隻 · 守護塔 150 · 精英 5,000 · 殭屍王 30,000。⛔ 不要再拿
 * 「32 × 300」當終局金額 —— 兩者早就不是同一個數，而排程隨時會被調。
 *   rho*    = 300 g / 6.5 AEP = 46.15 gold per AEP, UNIFORM across the ladder.
 *
 * WHY 4x BETWEEN TIERS AND NOT A PREMIUM. B_POWERFUL = 4 x B_SIMPLE exactly
 * matches 1200 = 4 x 300, so gold-efficiency is FLAT and there is no arithmetic
 * reason to prefer either. The reason to upgrade is the SLOT: four SIMPLE items
 * and one POWERFUL item are worth the same 26 AEP, but the first eats 4 of your
 * 6 slots and the second eats 1. That makes the late game a slot-pressure game
 * rather than a gold-efficiency spreadsheet.
 *
 * LEGENDARY IS NOT IN {@link ITEM_TIER_PRICE} ON PURPOSE — 「傳說的武器道具，
 * 只能隨機三選一」. It has a BUDGET (52 AEP) but no price: the only ways to it
 * are the round-5 card and the {@link LEGENDARY_ORB_ITEM_ID} roll trigger.
 * `everyPurchasablePriceIsATierPrice` in itemTiers.test.ts is the gate.
 */
import type { ItemId } from "../../ids";
import { ModOp, type StatModifier } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";

/** The ONLY two prices a weapon may carry. 統一化, in one object. */
export const ITEM_TIER_PRICE = {
  SIMPLE: 300,
  POWERFUL: 1200,
} as const;

export type ItemTier = keyof typeof ITEM_TIER_PRICE;

/**
 * Power budget per tier, in AEP. LEGENDARY is here (it is a real budget the
 * draft pool is authored against) even though it has no price.
 */
export const TIER_AEP_BUDGET = {
  SIMPLE: 6.5,
  POWERFUL: 26,
  LEGENDARY: 52,
} as const;

/** The uniform exchange rate every price in this file is derived from. */
export const GOLD_PER_AEP = 46.15;

/**
 * 傳說寶玉 — the legendary ROLL TRIGGER. 2400g for a 52-AEP legendary is
 * exactly rho*, so the orb is priced AT rate and its entire value-add is that
 * it collapses two draft slots into one purchase and lets you choose from
 * three. It is a CONSUMABLE, never an inventory item and never a recipe
 * component (the standing no-crafting decision).
 */
export const LEGENDARY_ORB_ITEM_ID = "legendary-orb" as ItemId;
export const LEGENDARY_ORB_PRICE = 2400;
/** The pool the orb rolls from — the same table the round-5 card uses. */
export const LEGENDARY_POOL_TABLE = "legendary-weapons";

/**
 * 寶具（傳說武器）直接上架時的**統一價**（owner 2026-08-17：「價格統一是隨機抽的
 * N 倍」）。
 *
 * ⭐ 它是**推導**出來的，不是第三個價階：49 把寶具的 `cost` 全部是 0，所以價格
 * 只有一個來源 —— {@link LEGENDARY_ORB_PRICE}（「隨機抽的」那顆寶玉）乘上倍率。
 * ⛔ 任何地方都不要重打 2400 或最後那個金額；要改倍率就改後台的
 * `legendaryShelf.priceMultiplier`（出貨 **4** → 9,600 金；owner 同日把 6 改成
 * 4，因為 14,400 讓「終局至少買得起兩把」在保證收入下做不到）。
 *
 * `Math.round` 是因為倍率可以是小數（後台合法區間 0.1–50），而金幣是整數：
 * 不取整的話玩家會看到 3192.5 這種價格，而扣款與退款會對不上一塊錢。
 */
export function legendaryShelfPrice(multiplier: number): number {
  return Math.round(LEGENDARY_ORB_PRICE * multiplier);
}

/**
 * 能力屬性強化 — the repeatable stat tick. 375g for the same 6.5 AEP a SIMPLE
 * item carries is 57.69 g/AEP, a flat 25% premium over rho*. That premium is
 * SLOT RENT: the tick consumes no inventory slot and is uncapped, which is
 * worth strictly more than an item of equal stats. Without it the stat path
 * would dominate on pure arithmetic and the fork would be fake in the other
 * direction.
 *
 * WHY 375 AND NOT THE USER'S 380 (= 7600/20). 380 x 20 = 7,600 lands exactly ON
 * the deterministic income ceiling with zero margin, so a single lost round
 * makes the capstone unreachable. 375 x 20 = 7,500 leaves a 100g cushion, is
 * exactly 1.25 x SIMPLE so the slot rent is an exact 25%, and keeps every price
 * in the ladder a clean multiple of 75. Simulated against all three income
 * paths the 20th tick lands in the ROUND-6 shop on every one of them — 「大約
 * 是第五場之後」, reachable but only just.
 */
export const STAT_TICK_ITEM_ID = "stat-attunement" as ItemId;
export const STAT_TICK_PRICE = 375;
/** 20th cumulative tick = the capstone. 20 x 375 = 7,500g of a ~7,600g match. */
export const STAT_TICK_TARGET = 20;

/**
 * The two SHOP SERVICES: listings that take gold but never occupy a slot.
 * They are real item@1 documents (so they carry a name, a description and the
 * operator whitelist gates them like anything else) but `buyItem` intercepts
 * them BEFORE the inventory path — see economy/shop.ts.
 */
export const SHOP_SERVICE_ITEM_IDS: readonly ItemId[] = [STAT_TICK_ITEM_ID, LEGENDARY_ORB_ITEM_ID];

export function isShopService(itemId: string): boolean {
  return itemId === STAT_TICK_ITEM_ID || itemId === LEGENDARY_ORB_ITEM_ID;
}

/**
 * S3 — «this item does SOMETHING in the shipped engine». THE definition of an
 * effect, in the one place both the price contract and the sim can read it.
 *
 * `item@1` can express exactly three static payloads — `modifiers`, `passive`
 * and (since 死之王套裝) `sets` — so an item carrying none of them is inert BY
 * CONSTRUCTION: no amount of tags, tier or description makes it do anything at
 * runtime. That is not hypothetical: 18
 * imported "final" items and all 55 recipe books (製作書) came out of the w3x
 * with their whole payload in an ACTIVE ability the schema cannot express yet,
 * so they ship as inert docs on purpose (the curation layer's own copy of this
 * rule, `itemDoc.hasEffect` in starter_content_test.go, is what keeps them off
 * both surfaces).
 *
 * Structural parameter type so the ONE rule covers both sides of the content
 * boundary: `ItemDoc` (the loaded JSON, checked in itemTiers.test.ts) and
 * `ItemDef` (the registered runtime def, checked in shop.ts).
 */
export function itemHasEffect(def: {
  modifiers?: readonly unknown[];
  passive?: readonly unknown[];
  /**
   * 套裝. Counted, because an item whose only payload is a set clause is NOT
   * payload-free — it is conditional. Leaving it out would make a future priced
   * set piece refuse to sell with reason `no-effect`, i.e. a card the shop
   * greys out for a reason that is not true. Purely ADDITIVE: none of the
   * existing inert docs carry `sets`, so every current classification is
   * unchanged.
   */
  sets?: readonly unknown[];
}): boolean {
  return (
    (def.modifiers?.length ?? 0) > 0 ||
    (def.passive?.length ?? 0) > 0 ||
    (def.sets?.length ?? 0) > 0
  );
}

/** Price of a shop service, or null when the id is a normal item. */
export function shopServicePrice(itemId: string): number | null {
  if (itemId === STAT_TICK_ITEM_ID) return STAT_TICK_PRICE;
  if (itemId === LEGENDARY_ORB_ITEM_ID) return LEGENDARY_ORB_PRICE;
  return null;
}

/**
 * WHAT ONE 375g TICK NOW BUYS — nothing directly. #260 replaced the nine-entry
 * flat roll pool that used to live here with a 力/敏/智 三選一 whose magnitudes
 * are rolled 0.1–2.0 (economy/attrDraft.ts) and applied as 三圍, not as stats.
 *
 * The old pool was DELETED rather than kept beside the new one: it was the
 * tick's whole payload, so leaving it would have shipped a nine-row table that
 * nothing reads and that reviewers would keep trying to reconcile with the
 * cards on screen. The AEP reasoning it carried now lives with the roll range,
 * in economy/attrDraft.ts and itemTiers.test.ts — where it can be checked
 * against the attribute coefficients that actually decide what a point is worth.
 */

/**
 * 傳說·萬象強化 — the capstone granted on the 20th clean tick.
 *
 * pctAdd r to all four of these with r ~ U[10%, 100%] in 10% steps, which is
 * literally the user's 「加強 10~100%能力屬性強化」. Measured at level 8:
 * r=10% -> 11.9 AEP (a genuine dud, 0.23 of a legendary), r=55% -> 56.7 AEP
 * (1.09), r=100% -> 91.9 AEP (1.77, the jackpot). Using pctAdd rather than flat
 * is what makes it read as 能力屬性強化 and makes it self-balancing across
 * archetypes: a tank cashes it as HP, a carry as AD.
 *
 * `ap` is EXCLUDED on purpose — base ap is 0 on all 113 champions, so a
 * percentage of it is a percentage of nothing.
 */
export const CAPSTONE_ITEM_ID = "legendary-attunement";
export const CAPSTONE_STATS: readonly Stat[] = [Stat.MaxHealth, Stat.AttackDamage, Stat.Armor, Stat.MagicResist];
/** r is drawn from {0.1, 0.2, … 1.0} — ten equally likely 10% steps. */
export const CAPSTONE_STEPS = 10;
export const CAPSTONE_MIN_PCT = 60;
export const CAPSTONE_MAX_PCT = 150;

/** Build the capstone's modifier list for a rolled percentage (10..100). */
export function capstoneModifiers(pct: number): StatModifier[] {
  const value = pct / 100;
  return CAPSTONE_STATS.map((stat) => ({ stat, op: ModOp.PercentAdd, value }));
}

/**
 * ⭐ **這位英雄實際要付多少**（owner 2026-08-18：bot「消耗金錢是半價」）。
 *
 * ⛔ 三個收費站（道具 / 能力屬性強化 / 傳說寶玉）**共用這一支**。各自寫
 * `price * mult` 的話，第四個收費站出現的那天它就會忘記乘 —— 而「忘記打折」
 * 在畫面上跟「這個人比較窮」長得一模一樣。
 *
 * 四捨五入到整數：金幣是整數，`Math.round` 讓 375 × 0.5 = 188 而不是 187.5。
 * ⚠️ 夾在 0 以上 —— 負倍率會變成「買東西送錢」，那是 #277 那一族的形狀。
 */
export function shopChargeFor(priceMult: number | undefined, price: number): number {
  const m = typeof priceMult === "number" && Number.isFinite(priceMult) && priceMult >= 0 ? priceMult : 1;
  return Math.round(price * m);
}
