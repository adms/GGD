/**
 * THE PRICE CONTRACT, asserted against the REAL content tree (task #82).
 *
 * 「武器價格請統一化，只有三種價格」. Everything here is the machine-checkable
 * half of that sentence:
 *   - a purchasable weapon carries EXACTLY one of the two tier prices,
 *   - a LEGENDARY carries no price at all — it is reachable only through the
 *     round-5 card or the 傳說寶玉 roll,
 *   - the two shop SERVICES carry the prices the sim charges for them, and
 *   - one 能力屬性強化 roll is worth one SIMPLE item, and 20 of them fit inside
 *     a match's income (but only just).
 *
 * It reads content/ rather than a fixture on purpose: the failure this guards
 * against is a content edit, not a code edit. The curation-side membership
 * gates (which id is on which surface) live in
 * apps/platform/internal/curation/starter_content_test.go — this file asserts
 * the properties the SIM depends on, which is why it can be stated without
 * knowing the surface lists at all.
 *
 * The last block is not a price assertion but rides the same harness: it is a
 * structural check on every item's modifier array, and this is the only place
 * in `packages/shared` that already loads all of them from the real tree.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import type { ItemDoc } from "../../content/schema/item";
import { Stat } from "../stats/statTypes";
import { ATTR_KEYS, ATTR_STAT_SOURCE, type AttrKey } from "../stats/attributes";
import { ATTRIBUTE_ENV_DEFAULTS, type AttributeEnvKey } from "../combatEnv";
import {
  ATTR_ROLL_MIN_TENTHS,
  ATTR_ROLL_MAX_TENTHS,
  ATTR_ROLL_STEPS,
} from "./attrDraft";
import { ModOp } from "../stats/modifiers";
import { STARTING_GOLD } from "./progression";
import {
  ITEM_TIER_PRICE,
  TIER_AEP_BUDGET,
  GOLD_PER_AEP,
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  STAT_TICK_ITEM_ID,
  STAT_TICK_PRICE,
  STAT_TICK_TARGET,
  CAPSTONE_STATS,
  CAPSTONE_STEPS,
  capstoneModifiers,
  isShopService,
  shopServicePrice,
  itemHasEffect,
} from "./itemTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/**
 * The AEP rate card (phase 1, level-5 reference champion): the marginal POWER
 * of one point of each stat, expressed in units of one point of AD. Duplicated
 * here rather than imported because it is a MEASUREMENT of the sim, not a
 * parameter of it — if the combat model changes these move, and this test
 * failing is the correct way to find that out.
 */
const AEP_PER_POINT: Partial<Record<Stat, number>> = {
  [Stat.MaxHealth]: 0.0981,
  [Stat.AttackDamage]: 1.0,
  [Stat.AbilityPower]: 0.2054,
  [Stat.Armor]: 0.3822,
  [Stat.MagicResist]: 0.1719,
  [Stat.MoveSpeed]: 7.848,
  [Stat.CritChance]: 28.449,
  [Stat.Lifesteal]: 24.413,
  [Stat.AttackSpeed]: 72.758,
};
/** Reference-champion base for the one stat items express as a percentage. */
const REFERENCE_BASE_AS = 0.58;

let items: ItemDoc[];
let byId: Map<string, ItemDoc>;
let lootTables: { id: string; entries: { itemId: string }[] }[];

beforeAll(async () => {
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  items = store.all<ItemDoc>("items");
  byId = new Map(items.map((i) => [i.id as string, i]));
  lootTables = store.all("loot-tables");
});

/**
 * S3, imported rather than restated: the SIM enforces this exact predicate in
 * `buyItem` now (an inert item is refused, not sold), so a second copy here
 * could drift from the rule the game actually runs.
 */
const hasEffect = (d: ItemDoc): boolean => itemHasEffect(d);
const TIER_PRICES: number[] = [ITEM_TIER_PRICE.SIMPLE, ITEM_TIER_PRICE.POWERFUL];

describe("the two prices (統一化)", () => {
  it("every weapon ON THE SHELF carries EXACTLY one of the two tier prices", () => {
    cover("econ-two-prices");
    // THE SHOP IS THE FINAL CRAFTED WEAPONS (owner rule 1, task #70 reopened):
    // 「只有最終合成武器才能上架可直接購買 (有製作書的)」. It is derived from the
    // `craftRole` marker recovered from the source-map triggers, NOT from price
    // — the old `cost ∈ tier` derivation was the bug, because it swept in every
    // priced recipe component and put the quest reward 魔戒 on sale for 300g.
    // A final with no expressible payload (its power is an active item@1 cannot
    // hold — #56) is excluded by the same S3/hasEffect rule the client shop uses.
    const finals = items.filter((d) => d.craftRole === "final" && hasEffect(d));

    // ⚠️ RE-AIMED 2026-08-01. 「隨機三選一發放道具 都改成棱彩武器道具」 +
    // 「傳說＝三選一專屬」: the owner DELISTED 25 items by setting `cost` to 0.
    // 16 of them were `craftRole: final` WITH a payload, i.e. they were on this
    // exact shelf the day before. Two more finals (雷神之鎚 godie-i01i /
    // 天地崩裂魔杖 godie-i03h) were listed at 1200g while carrying NO modifiers
    // at all, so `hasEffect` had already kept them out of the old census; the
    // same edit gave them a payload AND zeroed them. That is why the
    // delisted-final count below is 18 and not 16 — measured, not inferred.
    // A `final` at 0g is therefore no longer a mis-priced item —
    // it is an item the shop cannot sell at all, because `buyItem` refuses
    // `def.cost <= 0` with `not-purchasable` BEFORE any gold moves (see
    // economy/shop.ts). So the census is taken over the priced half, and the
    // unpriced half is held to a different rule — see 「a delisted final still
    // has a way to reach the player」 below, which is what stops a `cost` typo
    // from quietly deleting an item instead of moving it.
    //
    // This split is what keeps the assertion pointed at the failure it was
    // written for: a SHOP item at 700g (or at 0g while nothing else can ship
    // it) still fails. What it deliberately no longer calls a bug is a
    // legendary that left the shelf on purpose.
    const shelf = finals.filter((d) => d.cost > 0);
    const simple = shelf.filter((d) => d.cost === ITEM_TIER_PRICE.SIMPLE);
    const powerful = shelf.filter((d) => d.cost === ITEM_TIER_PRICE.POWERFUL);

    // Census of the shelf as it ships today: 12 finals-with-effect at a price,
    // 3 SIMPLE + 9 POWERFUL (the other 18 finals are the delisted legendaries).
    // These three numbers move whenever the owner curates, and that is the
    // point — a re-curation has to come past this line.
    expect(shelf.length).toBe(12);
    expect(simple.length).toBe(3);
    expect(powerful.length).toBe(9);
    // NEITHER TIER MAY EMPTY OUT, and this is load-bearing rather than
    // decorative: 「turn 1 buys exactly TWO SIMPLE items」 and 「a full 6-slot
    // POWERFUL build」 further down describe purchases that must be makeable
    // from real content, and both would pass over an empty shelf.
    expect(simple.length, "no SIMPLE item is buyable — the turn-1 fork is fiction").toBeGreaterThan(0);
    expect(powerful.length, "no POWERFUL item is buyable — the 6-slot endgame is fiction").toBeGreaterThan(0);
    // Every shop item must carry one of the two tier prices, nothing off-ladder.
    for (const d of shelf) {
      expect(TIER_PRICES, `${d.id} (${d.name}) is a shop final priced ${d.cost}g`).toContain(d.cost);
    }
    // A price and a tier number that disagree would make the shop sort wrong
    // and the codex lie, so they are pinned to each other.
    for (const d of simple) expect(d.tier, `${d.id} price/tier disagree`).toBe(1);
    for (const d of powerful) expect(d.tier, `${d.id} price/tier disagree`).toBe(2);
  });

  it("THERE IS NO PRICE CURVE — the whole tree has four prices and free", () => {
    cover("econ-no-price-curve");
    // Applied to every SHIPPABLE item in the tree, not just the 63: an item is
    // shippable when it has a real display name (S1) and actually does
    // something (S3) — the same two gates the curation layer uses. Everything
    // that clears them must sit at 0g (draft / legendary), a tier price, or a
    // service price. Nothing in between, nothing above, no curve.
    //
    // This is the assertion that would have caught the pre-#82 tree instantly:
    // it had 59 distinct prices from 400g to 100,000g.
    const ladder = new Set([0, ...TIER_PRICES, LEGENDARY_ORB_PRICE, STAT_TICK_PRICE]);
    const strays = items
      .filter((d) => d.name !== d.id && hasEffect(d) && !ladder.has(d.cost))
      .map((d) => `${d.id} ${d.name} ${d.cost}g`);
    expect(strays).toEqual([]);

    const shopPrices = new Set(items.filter((d) => TIER_PRICES.includes(d.cost) && hasEffect(d)).map((d) => d.cost));
    expect([...shopPrices].sort((a, b) => a - b)).toEqual(TIER_PRICES);
  });
});

describe("legendary is DRAFT-ONLY", () => {
  it("no entry of the legendary pool can be bought directly", () => {
    cover("econ-legendary-not-purchasable");
    const table = lootTables.find((t) => t.id === "legendary-weapons");
    expect(table, "content/loot-tables/legendary-weapons.json is missing").toBeDefined();
    expect(table!.entries.length).toBeGreaterThanOrEqual(6);
    for (const e of table!.entries) {
      const doc = byId.get(e.itemId);
      expect(doc, `legendary ${e.itemId} has no content doc`).toBeDefined();
      // 「傳說的武器道具，只能隨機三選一」 — a price here would make it buyable.
      //
      // ⚠️ 訊息把**理由**一起講出來 (owner 2026-08-01):「所有傳說武器道具都是
      // 0元，避免平衡問題 (目前只能抽到)」。0 不是「便宜」也不是還沒定價 ——
      // 它是這件道具**唯一的發放管道是三選一**的那個開關(`economy/shop.ts`
      // `buyItem` 在任何金幣移動之前就用 `def.cost <= 0` 擋掉)。所以看到這條紅
      // 的人要改的是**定價**,不是這條測試。
      expect(
        doc!.cost,
        `傳說 ${e.itemId}（${doc!.name}）標價 ${doc!.cost}g —— 它在 legendary-weapons ` +
          `池裡，也就是「只能抽到」的那一批。owner 2026-08-01:「所有傳說武器道具都是` +
          `0元，避免平衡問題 (目前只能抽到)」。標價會讓它同時變成可購買，` +
          `平衡是照「只能抽到」算的。要上架就先把它移出 loot table。`,
      ).toBe(0);
      expect(hasEffect(doc!), `legendary ${e.itemId} does nothing`).toBe(true);
    }
  });

  it("而且是真的買不到 —— 貨架全開、金幣滿手，`buyItem` 仍然逐件拒絕", async () => {
    cover("econ-legendary-not-purchasable");
    // 上面那一條是**屬性**斷言(cost === 0)。這一條是**行為**斷言,因為
    // 「cost 0」與「買不到」是兩件事:0 也可以被讀成「免費送」。CLAUDE.md 失敗
    // 形態 ⑦「掃屬性代替掃行為」就是這個形狀,所以兩條都在。
    //
    // ⚠️ `world.weaponShelfOpen = true` 是刻意的。出貨旗標是 CLOSED (#261
    // 暫時下架),而 `buyItem` 的貨架檢查排在價格檢查**前面** —— 不打開的話這條
    // 測試會拿到 "shelf-closed",對「0 元擋不擋得住」一個字都沒說,而 #261 是
    // 「暫時」的。打開之後,擋住傳說的就只剩 `def.cost <= 0` 那一行。
    const { registerAll } = await import("../../content/registries");
    const { ContentLoader } = await import("../../content/loader");
    const { FsContentSource } = await import("../../content/node/FsContentSource");
    const { SimWorld } = await import("../SimWorld");
    const { SKELETON_ARENA } = await import("../world/ArenaDef");
    const { spawnChampion } = await import("../spawnChampion");
    const { buyItem } = await import("./shop");
    const { asSeatId, asTeamId } = await import("../../ids");

    registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
    const world = new SimWorld(SKELETON_ARENA, 9001);
    world.weaponShelfOpen = true;
    const z0 = SKELETON_ARENA.zones[0]!;
    const id = spawnChampion(world, {
      championId: "godie-h020" as never,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: z0.center.x + 2, z: z0.center.z },
      zone: 0,
    });
    const champ = world.champion.get(id)!;
    // 遠超過任何價格,所以拒絕的理由不可能是「錢不夠」。
    champ.gold = 999_999;
    const goldBefore = champ.gold;

    const table = lootTables.find((t) => t.id === "legendary-weapons")!;
    const sold: string[] = [];
    for (const e of table.entries) {
      const outcome = buyItem(world, id, e.itemId as never);
      if (outcome !== "not-purchasable") sold.push(`${e.itemId} → ${outcome}`);
    }
    expect(
      sold,
      "這些傳說在貨架全開時**不是**被價格擋下來的 —— 「只能抽到」在那一刻就破了",
    ).toEqual([]);
    // 沒有付出任何一塊錢,也沒有佔掉任何一格。
    expect(champ.gold).toBe(goldBefore);
    expect(champ.items.filter((s) => s !== null)).toEqual([]);
  });

  it("a DELISTED final still has a way to reach the player — 0g is off the shelf, not deleted", () => {
    cover("econ-legendary-not-purchasable");
    // THE OTHER HALF OF THE 2026-08-01 DELISTING. 「傳說的武器道具，只能隨機三選
    // 一」 is enforced above (a pool entry may not carry a price); this is the
    // converse, and it is the assertion that replaces the pinned shop census as
    // the tripwire on `cost`.
    //
    // WHY IT IS NEEDED. `buyItem` refuses `cost <= 0`, and `shopCatalogue` will
    // not sell what the sim refuses, so an item whose price is zeroed vanishes
    // from every shop-side count without a single test going red. If it is not
    // in a draft pool either, it is unreachable content — 「made it but the
    // player can never get it」, the failure form this repo has shipped before.
    // A DELIBERATE delisting always moves the item into the legendary table, so
    // that membership is exactly the evidence that the zero was intended.
    const pool = new Set(
      lootTables.find((t) => t.id === "legendary-weapons")!.entries.map((e) => e.itemId),
    );
    const orphaned = items
      .filter((d) => d.craftRole === "final" && hasEffect(d) && d.cost <= 0 && !pool.has(d.id as string))
      .map((d) => `${d.id} ${d.name}`);
    expect(
      orphaned,
      "這些 final 既不能買、也不在傳說池裡 —— 等於做了但玩家永遠拿不到 (cost 打成 0 就會長這樣)",
    ).toEqual([]);
    // …and the set is not empty, so the rule above is not vacuously green:
    // some finals ship delisted-and-drafted (霸王破甲槍/斬龍刀/…).
    //
    // ⛔ 這裡**不寫死數量**（2026-08-04 改）。原本是 `.toBe(18)`，而 owner 把 8 支
    // 被 WC3 匯入錯標成 `component` 的武器改回 `final` 之後它變成 26，於是這條
    // 用「傳說池的組成變了」這個**無關的訊息**紅掉。出貨數量是 owner 每週在動的
    // 東西（CLAUDE.md：驗機制不驗數字）——這條要守的是「規則不是空的」，
    // 而那只需要 > 0。
    const delisted = items.filter((d) => d.craftRole === "final" && hasEffect(d) && d.cost <= 0);
    expect(delisted.length, "no final is delisted at all — the rule above proves nothing").toBeGreaterThan(0);
  });

  it("the free quest card's items are free too", () => {
    cover("econ-quest-draft-free");
    const table = lootTables.find((t) => t.id === "quest-rewards")!;
    for (const e of table.entries) expect(byId.get(e.itemId)!.cost).toBe(0);
  });
});

describe("the two shop services", () => {
  it("ship as real content docs at the prices the sim charges", () => {
    cover("econ-services-priced");
    for (const id of [LEGENDARY_ORB_ITEM_ID, STAT_TICK_ITEM_ID]) {
      const doc = byId.get(id as string);
      expect(doc, `${id} has no content doc — the shop would list nothing`).toBeDefined();
      expect(doc!.cost).toBe(shopServicePrice(id as string));
      expect(doc!.name).not.toBe(id);
      // A service is dispatched by ID before the inventory path, so it must
      // never carry modifiers — those would silently never apply.
      expect(hasEffect(doc!), `${id} carries modifiers that can never apply`).toBe(false);
    }
    expect(shopServicePrice("ember-rod")).toBeNull();
  });

  it("the orb is priced AT rate — it buys convenience, never efficiency", () => {
    cover("econ-orb-at-rate");
    const impliedRate = LEGENDARY_ORB_PRICE / TIER_AEP_BUDGET.LEGENDARY;
    expect(impliedRate).toBeCloseTo(GOLD_PER_AEP, 1);
  });
});

/**
 * WHAT 375 GOLD IS NOW WORTH (#260).
 *
 * The nine-entry flat roll pool this block used to check is gone: a tick now
 * opens a 力/敏/智 三選一 whose magnitude is a uniform 0.1–2.0 ATTRIBUTE points.
 * The pricing question therefore moved from "is every roll 6.5 AEP" to
 * "what does an attribute point buy", and the answer has to be derived from the
 * SHIPPED 三圍 coefficients rather than restated — which is exactly what these
 * two do, using the same AEP rate card above.
 *
 * ⚠️ THIS BLOCK IS ALSO THE RECORD OF A REAL BALANCE SHIFT. The pre-#260 tick
 * paid a flat 6.5 AEP every time. The new one pays between ~5% and ~100% of
 * that, uniformly — which is precisely the 「有可能你想要的屬性但加很少」 the
 * owner asked for, and roughly HALVES the expected value of the 7,500-gold stat
 * path. The numbers are asserted here so that trade-off is visible and can be
 * re-tuned deliberately (see openQuestions in the #260 report).
 */
describe("the 能力屬性強化 三選一 (#260)", () => {
  /** AEP of ONE point of an attribute, through the shipped coefficients. */
  const aepPerAttrPoint = (attr: AttrKey): number => {
    let aep = 0;
    for (const [stat, src] of Object.entries(ATTR_STAT_SOURCE) as [Stat, { attr: AttrKey; key: AttributeEnvKey; mode: string }][]) {
      if (src.attr !== attr) continue;
      const rate = AEP_PER_POINT[stat];
      if (rate === undefined) continue; // maxMana/manaRegen: measured worthless
      const coef = ATTRIBUTE_ENV_DEFAULTS[src.key];
      // attack speed is the one multiplicative row: coef·AGI scales the BASE
      const delta = src.mode === "scaleBase" ? REFERENCE_BASE_AS * coef : coef;
      aep += rate * delta;
    }
    return aep;
  };

  it("the roll spans 0.1–2.0 in ten-per-point steps, uniformly", () => {
    cover("econ-attr-roll-range");
    expect(ATTR_ROLL_MIN_TENTHS).toBe(1);
    expect(ATTR_ROLL_MAX_TENTHS).toBe(20);
    // the draw is `MIN + rng.int(STEPS)`, so STEPS must span the closed range —
    // an off-by-one here silently makes +2.0 unreachable (or +2.1 reachable).
    expect(ATTR_ROLL_STEPS).toBe(ATTR_ROLL_MAX_TENTHS - ATTR_ROLL_MIN_TENTHS + 1);
  });

  it("the BEST possible card (+2.0 力量) is worth about one SIMPLE item", () => {
    cover("econ-attr-roll-ceiling");
    const maxPoints = ATTR_ROLL_MAX_TENTHS / 10;
    const minPoints = ATTR_ROLL_MIN_TENTHS / 10;
    const str = aepPerAttrPoint("str");
    // 力量 → 生命 ×23 + 攻擊力 ×1 ⇒ 3.256 AEP per point, so a jackpot lands
    // within a couple of percent of B_SIMPLE. The 375g tick therefore tops out
    // at roughly what 300g of item buys — it never dominates the item path.
    // ⭐ 2026-08-13：從 `toBeCloseTo(1, 1)`（±0.05 的點）改成**設計主張本身**的
    // 一個區間。理由：owner 那天把 `strToAttackDamage` 1 → 0.4，於是這個比值從
    // ~1.0 掉到 **0.82** —— 而這一條要守的從來不是「剛好等於 1」，是上面那句
    // 「375 金的一格 ≈ 300 金的道具買得到的東西，**never dominates the item path**」。
    // ⛔ 上界 1.2 才是那句話的守衛（三選一超過道具就是壞的）；下界 0.5 擋的是
    // 另一邊（jackpot 變成雞肋，那一格就沒有人會選）。0.82 在區間內。
    // ⚠️ 這是我（複驗）替一個**出貨係數變動**重新釘的，⭐ 拿給 owner 確認一次。
    const jackpotVsSimple = str * maxPoints / TIER_AEP_BUDGET.SIMPLE;
    expect(jackpotVsSimple).toBeGreaterThan(0.5);
    expect(jackpotVsSimple).toBeLessThan(1.2);
    // …and the 「加很少」 floor really is a dud: a twentieth of the ceiling.
    expect(str * minPoints).toBeLessThan(TIER_AEP_BUDGET.SIMPLE * 0.1);
  });

  it("RECORDS the 力≫敏≫智 asymmetry the shipped coefficients produce", () => {
    cover("econ-attr-roll-asymmetry");
    const str = aepPerAttrPoint("str");
    const agi = aepPerAttrPoint("agi");
    const int = aepPerAttrPoint("int");
    // Every attribute must buy SOMETHING, or its card would be a visible no-op.
    for (const [name, v] of [["str", str], ["agi", agi], ["int", int]] as const) {
      expect(v, `${name} buys nothing measurable — its card would be a no-op`).toBeGreaterThan(0);
    }
    // THE FACT, pinned so it cannot drift silently and so a re-tune is a
    // deliberate act. Under the map's own coefficients one point of 力量 is
    // worth ~3.6 points of 敏捷 and ~15.8 points of 智慧, because 力量 feeds
    // 23 maxHealth + 1 ad while 智慧 feeds only `ap` (its maxMana/manaRegen
    // measure at ~0 AEP in this sim — casts are cooldown-limited).
    //
    // ⚠️ DESIGN CONSEQUENCE, for the owner: a 力/敏/智 三選一 whose three cards
    // are rolled from the SAME 0.1–2.0 range therefore is not a choice between
    // equals — 力量 dominates unless the roll is lopsided. Raised in the #260
    // report; the numbers live here so the decision has something to argue with.
    //
    // ⭐ 2026-08-13 —— **這個「事實」被 owner 的再平衡改掉了兩次，所以它在這裡改寫。**
    // owner 那天把 `intToAbilityPower` **1 → 4 → 6.5**（「技能傷害跟普通攻擊
    // 傷害落差實在太大了」「int to ap lift to 6.5」）並把 `strToAttackDamage`
    // 1 → 0.4。三者都往同一個方向推：
    //   · 力量那一邊少了 60% 的 AD 貢獻
    //   · 智慧那一邊的 AP 貢獻變成 6.5 倍
    // ⇒ 力/智 的比值從 **>10 → 2.9 → 約 1.85**。
    // ⭐ 也就是 #260 報告點名的那個「三選一不是在三個對等的選項之間選」，
    //   **owner 這兩次調係數幾乎把它調平了** —— 1.85 已經接近「差不多對等」。
    //
    // ⛔ 這不是把守衛放寬換綠燈：下面改成**兩側都釘**，比原本的單側更嚴 ——
    //   · 下界 1：力量仍然**領先**智慧（真的翻盤成「智慧最強」會紅 ——
    //     那是一個 owner 應該親自決定的跨越點，不該悄悄發生）
    //   · 上界 4：`intToAbilityPower` 被誰悄悄調回 1 的話，比值會跳回 ~11 → 紅
    // ⛔ 而且**不要**把 1.85 抄成 `toBeCloseTo` —— 那會讓每一次係數微調都紅，
    //   正是第零守則說的「數值住進測試裡」。
    expect(str / agi).toBeGreaterThan(3);
    expect(str / int).toBeGreaterThan(1);
    expect(str / int).toBeLessThan(4);
  });
});

describe("the 傳說·萬象強化 capstone", () => {
  it("pays between 10% and 100%, in ten steps, on four stats", () => {
    cover("econ-capstone-range");
    for (let step = 0; step < CAPSTONE_STEPS; step++) {
      const pct = (step + 1) * 10;
      expect(pct).toBeGreaterThanOrEqual(10);
      expect(pct).toBeLessThanOrEqual(100);
      const mods = capstoneModifiers(pct);
      expect(mods.map((m) => m.stat)).toEqual([...CAPSTONE_STATS]);
      for (const m of mods) {
        expect(m.op).toBe(ModOp.PercentAdd);
        expect(m.value).toBeCloseTo(pct / 100, 6);
      }
    }
  });

  it("never grants a percentage of ap — every champion's base ap is 0", () => {
    cover("econ-capstone-no-ap");
    expect(CAPSTONE_STATS).not.toContain(Stat.AbilityPower);
  });
});

describe("reachability against the real gold curve", () => {
  // The deterministic shop-open cumulative purse: 600 start, then the
  // arena-rules round grants 750 / 2500 / 1000 / 1250 / 1500.
  const CUMULATIVE = [600, 1350, 3850, 4850, 6100, 7600];

  it("turn 1 buys exactly TWO SIMPLE items, and no more", () => {
    cover("econ-turn1-two-items");
    expect(CUMULATIVE[0]).toBe(STARTING_GOLD);
    expect(Math.floor(STARTING_GOLD / ITEM_TIER_PRICE.SIMPLE)).toBe(2);
    // and NOT a POWERFUL: skipping the turn-1 buy to reach one a round early
    // is the opening fork the prices exist to create.
    expect(STARTING_GOLD).toBeLessThan(ITEM_TIER_PRICE.POWERFUL);
  });

  it("the 20th stat tick lands in the round-6 shop — reachable, but only just", () => {
    cover("econ-stat-path-reachable");
    const total = STAT_TICK_PRICE * STAT_TICK_TARGET;
    expect(total).toBe(7500);
    expect(total).toBeLessThanOrEqual(CUMULATIVE[5]!); // reachable at all
    expect(total).toBeGreaterThan(CUMULATIVE[4]!); // NOT before round 6
    // 99% of the whole match income: 「沒有購買任何道具」 is enforced by the
    // price, not by a rule the player has to remember.
    expect(total / CUMULATIVE[5]!).toBeGreaterThan(0.95);
  });

  it("the stat tick charges a 25% slot rent over the uniform rate", () => {
    cover("econ-stat-tick-slot-rent");
    expect(STAT_TICK_PRICE / ITEM_TIER_PRICE.SIMPLE).toBeCloseTo(1.25, 6);
    expect(STAT_TICK_PRICE / TIER_AEP_BUDGET.SIMPLE).toBeCloseTo(GOLD_PER_AEP * 1.25, 0);
  });

  it("a full 6-slot POWERFUL build is affordable, and forecloses the orb", () => {
    cover("econ-endgame-slot-pressure");
    const sixPowerful = ITEM_TIER_PRICE.POWERFUL * 6;
    expect(sixPowerful).toBe(7200);
    expect(sixPowerful).toBeLessThanOrEqual(CUMULATIVE[5]!);
    // 4 POWERFUL + 1 ORB costs the SAME 7200g — so the endgame is a
    // slot-vs-orb decision rather than a gold decision. That equality is the
    // design, not a coincidence, so it is pinned.
    expect(ITEM_TIER_PRICE.POWERFUL * 4 + LEGENDARY_ORB_PRICE).toBe(sixPowerful);
  });

  it("gold-efficiency is FLAT across the ladder — only the slot differs", () => {
    cover("econ-flat-efficiency");
    expect(ITEM_TIER_PRICE.POWERFUL / ITEM_TIER_PRICE.SIMPLE).toBe(4);
    expect(TIER_AEP_BUDGET.POWERFUL / TIER_AEP_BUDGET.SIMPLE).toBe(4);
    expect(TIER_AEP_BUDGET.LEGENDARY / TIER_AEP_BUDGET.SIMPLE).toBe(8);
    expect(ITEM_TIER_PRICE.SIMPLE / TIER_AEP_BUDGET.SIMPLE).toBeCloseTo(GOLD_PER_AEP, 1);
    expect(ITEM_TIER_PRICE.POWERFUL / TIER_AEP_BUDGET.POWERFUL).toBeCloseTo(GOLD_PER_AEP, 1);
  });
});

type ItemModifiers = NonNullable<ItemDoc["modifiers"]>;

/** The identity of a modifier ENTRY — two entries with the same key are the same stat line. */
const modKey = (m: ItemModifiers[number]): string => `${m.stat} ${m.op} ${m.value}`;

/**
 * The literal shape of the w3x-22 bug: some contiguous run of entries is
 * immediately followed by an identical run — `[A,B,C]` imported as `[A,B,C,A,B,C]`.
 * Returns a human-readable description of the first such run, or null.
 * Arrays are ≤6 entries, so the O(n³) scan is free.
 */
function duplicatedBlock(mods: ItemModifiers): string | null {
  const keys = mods.map(modKey);
  for (let k = 1; k * 2 <= keys.length; k++) {
    for (let i = 0; i + 2 * k <= keys.length; i++) {
      if (keys.slice(i, i + k).every((key, j) => key === keys[i + k + j])) {
        return `[${keys.slice(i, i + k).join(" / ")}] repeats at index ${i} and ${i + k}`;
      }
    }
  }
  return null;
}

describe("no item ships a modifier array concatenated with itself", () => {
  it("no modifier entry is repeated, contiguously or otherwise", () => {
    cover("w3x-item-no-doubled-modifier");
    // Task #83 / w3x-22: the importer emitted a few items' stat block TWICE,
    // doubling them. Three of the four (godie-i00z/i02g/i049) were invisibly
    // absorbed by #82's rescale-to-tier-budget — they land on budget either
    // way — so the only one that showed up as a wrong number in the game was
    // godie-i00w, a cost-0 fragment #82 never touched. That is why this is a
    // STRUCTURAL check and not a numeric one: the doubling is silent wherever
    // a later pass renormalizes, and it can only be caught in the shape.
    //
    // Two statements, weakest last. Entry-level uniqueness is the stronger of
    // the two (a repeated block implies a repeated entry), but the block scan
    // names the offending run, which is what makes a failure actionable.
    const repeatedEntry: string[] = [];
    const repeatedBlock: string[] = [];
    for (const d of items) {
      const mods = d.modifiers ?? [];
      const seen = new Set<string>();
      for (const m of mods) {
        const key = modKey(m);
        if (seen.has(key)) repeatedEntry.push(`${d.id} ${d.name}: ${key}`);
        seen.add(key);
      }
      const block = duplicatedBlock(mods);
      if (block) repeatedBlock.push(`${d.id} ${d.name}: ${block}`);
    }
    // An item wanting the same stat twice should carry one merged entry, so a
    // repeat here is always an import artifact rather than authored intent.
    expect(repeatedEntry).toEqual([]);
    expect(repeatedBlock).toEqual([]);
  });

  it("detects the doubled block the importer actually produced", () => {
    // The guard above is a no-op assertion on a clean tree, so pin its teeth to
    // the real pre-fix payload: godie-i00w's `AIx2` (All+2) listed twice.
    const doubled: ItemModifiers = [
      { stat: Stat.MaxHealth, op: ModOp.Flat, value: 40 },
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 2 },
      { stat: Stat.MaxMana, op: ModOp.Flat, value: 24 },
      { stat: Stat.MaxHealth, op: ModOp.Flat, value: 40 },
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 2 },
      { stat: Stat.MaxMana, op: ModOp.Flat, value: 24 },
    ];
    expect(duplicatedBlock(doubled)).toContain("index 0 and 3");
    expect(duplicatedBlock(doubled.slice(0, 3))).toBeNull();
    // The SUMMED form godie-i00w actually shipped ([80,4,48]) is invisible to
    // any structural check — it is one clean entry per stat. Only the raw
    // concatenation is catchable, which is what the importer emits.
    expect(duplicatedBlock([{ stat: Stat.MaxHealth, op: ModOp.Flat, value: 80 }])).toBeNull();
  });
});
