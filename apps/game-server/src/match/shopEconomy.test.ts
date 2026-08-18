/**
 * The unified item economy, END TO END through the real MatchController and
 * the real content tree (task #82).
 *
 * The unit tests in packages/shared/src/sim/economy pin the rules; this file
 * pins the WIRING, which is where the two previous item-economy tasks actually
 * broke:
 *   - task #47: a weapon card that rolled nothing granted nothing and said
 *     nothing. The 傳說寶玉 must not be able to do that, and its offer has to
 *     reach `ctl.offers` where the pick/auto-pick machinery can see it.
 *   - the starting purse: every design document assumed 600g while the
 *     controller granted 500, so the turn-1 "two items or bank it" decision
 *     never existed in the running game.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items, LootTables } from "@ggd/shared/sim/content/registry";
import { buyItem, SELL_REFUND } from "@ggd/shared/sim/economy/shop";
import { legendaryPool } from "@ggd/shared/sim/economy/legendaryOrb";
import { DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES } from "@ggd/shared/sim/economy/offerEligibility";
import { statPathView } from "@ggd/shared/sim/economy/statPath";
import {
  ITEM_TIER_PRICE,
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  LEGENDARY_POOL_TABLE,
  STAT_TICK_ITEM_ID,
  STAT_TICK_PRICE,
  STAT_TICK_TARGET,
  CAPSTONE_MIN_PCT,
  CAPSTONE_MAX_PCT,
  isShopService,
} from "@ggd/shared/sim/economy/itemTiers";
import { STARTING_GOLD } from "@ggd/shared/sim/economy/progression";
import { asSeatId, type EntityId, type ItemId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";
import { Whitelist } from "../curation/whitelist";
import { HumanDriver } from "../seat/HumanDriver";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

function spawnedMatch(seed = 31): MatchController {
  const ctl = new MatchController(`econ-${seed}`, seed, allBots(), FAST, 3, SHOP_RULES);
  // #261 — the weapon shelf ships 暫時下架. This suite exists to prove the GOLD
  // rules (rule-1 refusals, the stat-path fork, the undo's no-arbitrage
  // invariant), all of which need a buyable weapon; the shelf being closed today
  // does not retire them, so the match runs with the shelf open. The closed-shelf
  // behaviour has its own guard: packages/shared/.../shopShelf.test.ts.
  ctl.world.weaponShelfOpen = true;
  let n = 0;
  while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
  expect(ctl.phase.phase).toBe("intermission");
  return ctl;
}

const firstEntity = (ctl: MatchController): EntityId =>
  [...ctl.seats.values()].find((s) => s.entityId !== null)!.entityId!;

/**
 * Take seat 0 over with a HUMAN driver and return a `buy(itemId)` that pushes a
 * real `buyItem` command down the real input path.
 *
 * Calling economy/shop.buyItem() directly would NOT do: the sim clears
 * `world.events` at the top of every step, so an event emitted outside a tick
 * is gone before the controller's drain ever sees it. The 傳說寶玉's whole
 * wiring is "sim rolls -> event -> host registers the offer", so testing it
 * from outside the tick would test nothing.
 */
function humanBuyer(ctl: MatchController): {
  entity: EntityId;
  buy: (itemId: string) => void;
  sell: (itemSlot: number) => void;
  undo: () => void;
  pick: (offerId: string) => void;
} {
  const seat = ctl.seats.get(asSeatId(0))!;
  const driver = new HumanDriver();
  seat.setDriver(driver);
  ctl.tick(); // driver swaps land at the tick boundary
  let seq = 0;
  return {
    entity: seat.entityId as EntityId,
    buy: (itemId: string) => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "buyItem", itemId }] });
      ctl.tick();
    },
    // sell / undo ride the SAME command channel a real client sends, so the
    // controller's own drain + shop-access gate is what the test exercises
    sell: (itemSlot: number) => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "sellItem", itemSlot }] });
      ctl.tick();
    },
    undo: () => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "undoLastShopStep" }] });
      ctl.tick();
    },
    // picks ride the same `pickOffer` command a real client sends, so the
    // controller's own drain/resolve path is what the test exercises
    pick: (offerId: string) => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "pickOffer", offerId }] });
      ctl.tick();
    },
  };
}

/**
 * ⚠️ **這一批測的是「商店」，⛔ 不是「bot 的折扣」。**
 *
 * owner 2026-08-18 讓 bot 半價（`botShop.priceMult`），而這些夾具全是
 * `allBots()` ⇒ 每一筆扣款都會被乘 0.5，於是每一條斷言都變成在同時驗
 * 「商店收對錢」與「折扣是多少」兩件事。折扣有它自己的守衛
 * （`botShopDiscount.test.ts`），所以這裡把倍率調回 1，讓每一條只驗一件事。
 */
const NO_BOT_DISCOUNT = { buyWeapons: true, priceMult: 1 } as const;
const SHOP_RULES = { ...DEFAULT_ARENA_RULES, botShop: NO_BOT_DISCOUNT };

describe("starting gold is 600, not 500", () => {
  it("every champion spawns able to buy exactly TWO SIMPLE items", () => {
    cover("econ-starting-gold");
    const ctl = new MatchController("econ-start", 9, allBots(), FAST, 3, SHOP_RULES);
    let n = 0;
    // stop the moment champions exist, BEFORE the round-1 grant compounds it
    while ([...ctl.seats.values()].every((s) => s.entityId === null) && n++ < 500) ctl.tick();
    for (const seat of ctl.seats.values()) {
      const champ = ctl.world.champion.get(seat.entityId!)!;
      expect(champ.gold, "MatchController granted 500 until task #82").toBe(STARTING_GOLD);
      expect(Math.floor(champ.gold / ITEM_TIER_PRICE.SIMPLE)).toBe(2);
      expect(champ.gold).toBeLessThan(ITEM_TIER_PRICE.POWERFUL);
    }
  });
});

describe("傳說寶玉 → a real 3-choose-1 offer on the controller", () => {
  it("a purchased orb registers an offer the pick machinery can resolve", () => {
    cover("econ-orb-offer");
    const ctl = spawnedMatch();
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;

    buy(LEGENDARY_ORB_ITEM_ID);

    const orbOffers = [...ctl.offers.entries()].filter(([k]) => k.startsWith("orb:"));
    expect(orbOffers.length, "the orb rolled but no offer reached the controller").toBe(1);
    const [offerId, offer] = orbOffers[0]!;
    expect(offer.kind).toBe("item");
    expect(offer.choices.length).toBe(3);
    expect(champ.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
    // the ORB is consumed, not carried: it takes no inventory slot
    expect(champ.items).not.toContain(LEGENDARY_ORB_ITEM_ID);

    // every choice is a real legendary from the round-5 pool, and none of them
    // is purchasable — the orb bought the ROLL, never the item
    const pool = new Set(LootTables.get(LEGENDARY_POOL_TABLE).entries.map((e) => e.itemId));
    for (const c of offer.choices) {
      expect(pool.has(c as ItemId)).toBe(true);
      expect(Items.get(c as ItemId).cost).toBe(0);
    }
    expect(new Set<string>(offer.choices as string[]).size).toBe(3);
    expect(offerId.startsWith("orb:")).toBe(true);
  });

  it("two orbs in one shopping phase are two cards, not one overwrite", () => {
    cover("econ-orb-two-cards");
    const ctl = spawnedMatch(77);
    const { entity, buy } = humanBuyer(ctl);
    ctl.world.champion.get(entity)!.gold = 10_000;
    buy(LEGENDARY_ORB_ITEM_ID);
    buy(LEGENDARY_ORB_ITEM_ID);
    expect([...ctl.offers.keys()].filter((k) => k.startsWith("orb:")).length).toBe(2);
    expect(ctl.world.champion.get(entity)!.gold).toBe(10_000 - 2 * LEGENDARY_ORB_PRICE);
  });

  it("an operator whitelist that enables no legendary refuses the sale, free of charge", () => {
    cover("econ-orb-whitelist-empty");
    // A whitelist that enables the ORB but NO legendary: the exact shape of
    // task #47's silent failure. The orb must refuse rather than take 2400g
    // and hand back nothing.
    const wl = new Whitelist(
      { version: 1, champions: [], items: ["ember-rod", LEGENDARY_ORB_ITEM_ID], abilities: [] },
      false,
    );
    const ctl = new MatchController("econ-wl", 5, allBots(), FAST, 3, SHOP_RULES, undefined, wl);
    let n = 0;
    while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
    const { entity, buy } = humanBuyer(ctl);
    ctl.world.champion.get(entity)!.gold = 10_000;

    buy(LEGENDARY_ORB_ITEM_ID);

    expect(ctl.world.champion.get(entity)!.gold, "the orb charged for an empty pool").toBe(10_000);
    expect([...ctl.offers.keys()].filter((k) => k.startsWith("orb:")).length).toBe(0);
    // and it SAID SO — the refusal rides the same buyRejected channel the HUD
    // already renders, rather than vanishing.
    const rejects = ctl.world.events.filter((e) => e.type === "buyRejected");
    expect(rejects.map((e) => e.data.reason)).toContain("empty-pool");
  });

  it("the last free slot cannot be spent between the roll and the pick", () => {
    cover("econ-orb-slot-reserved");
    // THE THEFT WINDOW. `buyLegendaryOrb` checks for a free slot at PURCHASE
    // time, but the legendary only lands when the card is PICKED — and the
    // shop stays open in between. Buy the orb with one slot left, spend that
    // slot on a 300g item, and the pick has nowhere to land: `grantItemFree`
    // returns -1, `applyItemPick` returns false, and `applyPick` deletes the
    // offer regardless. 2400g gone, nothing granted — task #47's silent
    // failure wearing a different hat.
    const ctl = spawnedMatch(21);
    const { entity, buy, pick } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;

    // fill 5 of 6 slots, leaving exactly one
    for (let i = 0; i < 5; i++) champ.items[i] = "godie-i002" as ItemId;
    buy(LEGENDARY_ORB_ITEM_ID);
    expect(champ.gold).toBe(10_000 - LEGENDARY_ORB_PRICE);
    const orbOffers = [...ctl.offers.entries()].filter(([k]) => k.startsWith("orb:"));
    expect(orbOffers.length).toBe(1);

    // now spend the slot the legendary was going to land in
    buy("ember-rod");

    const [offerId] = orbOffers[0]!;
    pick(`${offerId}#0`);

    // The legendary must still be reachable: either the sale was refused, or
    // the pick lands. What must NEVER happen is 2400g charged for nothing.
    const ownsALegendary = champ.items.some(
      (s) => s !== null && LootTables.get(LEGENDARY_POOL_TABLE).entries.some((e) => e.itemId === s),
    );
    expect(ownsALegendary, "2400g was charged and no legendary was ever granted").toBe(true);
  });
});

describe("寶具直接販售 —— 但關掉那一格就一塊錢都不收", () => {
  /**
   * ⚠️ RE-AIMED 2026-08-17。這一條原本叫「no legendary is directly purchasable」，
   * 守的是 owner 2026-08-01 的裁決「傳說的武器道具，只能隨機三選一」。
   * owner 2026-08-17 推翻了它：「寶具(傳說武器) 可以上架直接販售了，價格統一是
   * 隨機抽的 6 倍（後台可設定）」。
   *
   * 所以守的性質換成**開關真的關得住** —— 那才是舊裁決現在剩下的機械形狀，
   * 也是 rollback 這條路唯一的保證。「開著會怎樣」在
   * packages/shared/src/sim/economy/legendaryShelf.test.ts。
   */
  it("關掉寶具貨架：金幣滿手也逐件被拒，一塊錢都不收", () => {
    cover("econ-legendary-refused");
    const ctl = spawnedMatch(3);
    const entity = firstEntity(ctl);
    ctl.world.champion.get(entity)!.gold = 100_000;
    ctl.world.legendaryShelf = { ...ctl.world.legendaryShelf, open: false };
    // 這仍然是最後一道防線：`gold >= 0` 永遠為真，所以一件漏進任何商店列表的
    // 寶具（白名單關掉的 dev build、手打的 buyItem 指令）不可以因此變成免費。
    for (const e of LootTables.get(LEGENDARY_POOL_TABLE).entries) {
      expect(buyItem(ctl.world, entity, e.itemId), `${e.itemId} was purchasable`).toBe("shelf-closed");
    }
    expect(ctl.world.champion.get(entity)!.items.every((s) => s === null)).toBe(true);
    expect(ctl.world.champion.get(entity)!.gold).toBe(100_000);
  });

  /**
   * The MIRROR of the rule above, against the REAL tree. A 0g legendary is
   * refused for having no price; these are refused for having no PAYLOAD.
   *
   * Three 1200g items ship inert today (出動怨念射手兵團, 出動正義射手兵團,
   * 和道一文字製作書 — two w3x summons and a recipe book, whose real payload is
   * an active `item@1` cannot express yet), and ~80 more sit at their raw
   * un-repriced w3x costs, up to 9,065g. `starter.go` whitelists none of them,
   * which is exactly the protection task #82 refused to rely on for 0g items.
   *
   * Derived from content rather than pinned to those ids: if #78 later gives
   * them real effects the list simply shrinks, and a shrink to empty is a PASS
   * because it means the tree is clean. The rule itself is proved
   * unconditionally against a synthetic item in
   * packages/shared/src/sim/economy/shop.test.ts.
   */
  it("the sim refuses a PRICED item that does nothing, however it was listed", () => {
    cover("econ-inert-refused-e2e");
    const ctl = spawnedMatch(4);
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 100_000;

    const inert = Items.all().filter(
      (d) => d.cost > 0 && !isShopService(d.id) && (d.modifiers?.length ?? 0) === 0 && (d.passive?.length ?? 0) === 0,
    );
    for (const d of inert) {
      expect(buyItem(ctl.world, entity, d.id), `${d.id} ${d.name} (${d.cost}g) was purchasable`).toBe("no-effect");
    }

    // …and through the REAL command path, so the reason reaches the HUD
    // channel rather than being swallowed (task #60).
    if (inert.length > 0) {
      buy(inert[0]!.id);
      const rejects = ctl.world.events.filter((e) => e.type === "buyRejected");
      expect(rejects.map((e) => e.data.reason)).toContain("no-effect");
    }

    expect(champ.gold, "an item with no effect took gold").toBe(100_000);
    expect(champ.items.every((s) => s === null), "an item with no effect took a slot").toBe(true);
  });
});

/**
 * TASK #70 REOPENED — the two doors rule 1 (「只有最終合成武器才能上架可直接購買」)
 * has to close, verified against the REAL content tree, not a fixture.
 */
describe("rule 1 covers every gold route, not just the shop shelf", () => {
  /**
   * ⚠️ **owner 2026-08-04 縮小了這一條的範圍**:「49支可被隨機三選一 就好」。
   *
   * task #70 重開時,這條斷言的是「寶玉永遠不會發 component / token / service」。
   * 那道閘寫死在 `legendaryOrb.orbEligible` 裡,而**免費武器卡那條路根本沒有它**
   * —— 同一支合成原料回合卡發得出來、寶玉抽不到,正是 `offerEligibility.ts`
   * 檔頭警告過的「半套修法」。
   *
   * 現在清單是後台欄位(`itemDraft.excludedCraftRoles`,出貨 token/service)而且
   * **兩條門共用**。所以這條改成斷言「**出貨清單真的被執行**」——
   * 池子裡不可以出現排除清單上的任何角色,而清單本身從出貨值讀,不再手抄。
   * `component` 現在**應該**滾得到,那由 `curation/legendaryReachability.test.ts`
   * 逐支釘住(owner 的裁決本身要有守衛,不是靜靜地變寬)。
   */
  it("the 傳說寶玉 pool obeys the shipped craftRole exclusion list (both doors read it)", () => {
    cover("econ-orb-no-component");
    const ctl = spawnedMatch(9);
    const { entity } = humanBuyer(ctl);
    // The pool as the orb would actually roll it, with the whitelist off so this
    // proves the SIM guard, not a curation accident.
    ctl.world.itemEligible = null;
    const pool = legendaryPool(ctl.world, entity);
    expect(pool.length, "the orb pool went empty — that would silently disable the orb").toBeGreaterThan(0);
    for (const id of pool) {
      const role = Items.get(id).craftRole ?? "";
      expect(
        DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES,
        `${id} (${Items.get(id).name}) is offerable by the orb but its role ${role} is on the exclusion list`,
      ).not.toContain(role);
    }
    // ⭐ owner 2026-08-04:「**49支已經全部都是傳說武器道具，並非原料**」——
    // 那 8 支曾經被標成 `component` 的其實是神器/武器/防具(每一支都有完整
    // modifiers + passive，描述自己就寫著「武器」)。標記是 WC3 匯入留下的：
    // 在原作它們是別人的合成材料，而 **GGD 沒有合成系統**。資料已改成 "final"。
    //
    // 所以這一條現在釘的是那個**內容決定**：傳說池裡不可以再出現 component。
    // 突變：把任何一支改回 "component" → 紅，而且訊息說得出是哪一支。
    const mislabelled = LootTables.get(LEGENDARY_POOL_TABLE)
      .entries.map((e) => e.itemId)
      .filter((id) => Items.get(id).craftRole === "component");
    expect(
      mislabelled,
      "傳說池裡出現 craftRole:\"component\" —— owner 裁決 49 支全部是武器道具不是原料",
    ).toEqual([]);
  });

  it("a priced, effectful recipe component is refused with gold — even if whitelisted", () => {
    cover("econ-component-not-purchasable");
    const ctl = spawnedMatch(3);
    const { entity } = humanBuyer(ctl);
    ctl.world.champion.get(entity)!.gold = 100_000;
    const component = Items.all().find(
      (d) => d.craftRole === "component" && d.cost > 0 && ((d.modifiers?.length ?? 0) > 0 || (d.passive?.length ?? 0) > 0),
    );
    expect(component, "no priced+effectful component in the tree — test is vacuous").toBeDefined();
    // This is exactly the id the client shop hides but a raw buyItem call did not:
    // priced, has stats, passes every OTHER gate — refused only by the role backstop.
    expect(buyItem(ctl.world, entity, component!.id)).toBe("not-purchasable");
    expect(ctl.world.champion.get(entity)!.gold, "a component took gold").toBe(100_000);
  });
});

describe("the stat path, through the controller's own economy", () => {
  it("20 ticks are affordable on the real round grants and the fork is exclusive", () => {
    cover("econ-stat-path-e2e");
    const ctl = spawnedMatch(11);
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = STAT_TICK_PRICE * STAT_TICK_TARGET;
    // #104: the capstone is now withheld until round >= 6 (「大約是第五場之後」),
    // so exercise the grant at an eligible round rather than round 1.
    ctl.world.round = 6;

    // through the REAL command path: CommandSystem -> shopAccess -> buyItem
    for (let i = 0; i < STAT_TICK_TARGET; i++) buy(STAT_TICK_ITEM_ID);
    expect(champ.statStacks).toBe(STAT_TICK_TARGET);
    // Bounds read from the CONSTANTS, not re-typed. The literals here used to be
    // 10..100 — the pre-2026-07-26 range — and passed only because this seed's
    // capstone roll happened to fall inside it; the owner's 60~150 widening
    // (itemTiers) had left them stale and unnoticed. #260 shifted the rng stream
    // (a tick now draws three magnitudes instead of one stat), the roll moved to
    // 130, and the stale literal finally spoke up.
    expect(champ.statCapstonePct).toBeGreaterThanOrEqual(CAPSTONE_MIN_PCT);
    expect(champ.statCapstonePct).toBeLessThanOrEqual(CAPSTONE_MAX_PCT);
    expect(champ.gold).toBe(0);
    // …and it cost every slot's worth of gold: the player owns no items.
    expect(champ.items.every((s) => s === null)).toBe(true);

    const view = statPathView(champ.statStacks, champ.statCapstonePct);
    expect(view.live).toBe(false);
    expect(view.remaining).toBe(0);
    expect(view.atRisk).toBe(0);
  });

  it("the shop-facing view warns about the stacks a purchase would destroy", () => {
    cover("econ-stat-path-view");
    const ctl = spawnedMatch(12);
    const { entity, buy } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 100_000;
    for (let i = 0; i < 19; i++) buy(STAT_TICK_ITEM_ID);

    const view = statPathView(champ.statStacks, champ.statCapstonePct);
    expect(view.stacks).toBe(19);
    expect(view.remaining).toBe(1);
    expect(view.live).toBe(true);
    expect(view.atRisk, "the shop must be able to say 19 stacks are on the line").toBe(19);

    buy("ember-rod");
    expect(statPathView(champ.statStacks, champ.statCapstonePct).stacks).toBe(0);
    // the destruction is ANNOUNCED, so a HUD can say "19 stacks lost"
    expect(ctl.world.events.some((e) => e.type === "statPathReset" && e.data.lost === 19)).toBe(true);
  });
});

/**
 * NO BUY/SELL MONEY EXPLOIT, end to end (task #121). The unit tests in
 * packages/shared/src/sim/economy/shopUndo.test.ts pin the reversal arithmetic;
 * this file pins the WIRING — the real command channel, the shop-access gate
 * that closes undo when the shop closes, and the enterCombat commit that stops a
 * purchase being reversed across rounds.
 */
describe("shop undo has no money exploit, through the real command path (task #121)", () => {
  it("buy → sell → undo → undo returns to the EXACT starting gold + inventory", () => {
    cover("econ-undo-roundtrip-e2e");
    const ctl = spawnedMatch(51);
    const { entity, buy, sell, undo } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;
    const item = "ember-rod";
    const cost = Items.get(item as ItemId).cost;
    const start = { gold: champ.gold, items: JSON.stringify(champ.items) };

    buy(item);
    const slot = champ.items.indexOf(item as ItemId);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(champ.gold).toBe(start.gold - cost);

    sell(slot);
    expect(champ.gold).toBe(start.gold - cost + Math.floor(cost * SELL_REFUND));
    expect(champ.gold, "buy→sell must be a net loss, never a gain").toBeLessThan(start.gold);
    expect(champ.items[slot]).toBeNull();

    undo(); // reverse the sell
    expect(champ.gold).toBe(start.gold - cost);
    expect(champ.items[slot]).toBe(item);

    undo(); // reverse the buy
    expect(champ.gold, "a full round-trip returns to the exact starting gold").toBe(start.gold);
    expect(JSON.stringify(champ.items)).toBe(start.items);
    // the reversal rides the same channel the HUD reads
    expect(ctl.world.events.some((e) => e.type === "shopUndone")).toBe(true);
  });

  it("N buy→sell→undo→undo cycles never let gold climb above the start", () => {
    cover("econ-undo-nocycle-e2e");
    // A LONG intermission so all 12 cycles stay inside one open shop — otherwise
    // the FAST 30-tick prep window would end mid-loop and enterCombat would
    // (correctly) commit the session, which a separate test already covers.
    const LONG = { champSelectTicks: 5, intermissionTicks: 100_000, combatMaxTicks: 1200, resolutionTicks: 5 };
    const ctl = new MatchController("econ-cycle", 52, allBots(), LONG, 3, SHOP_RULES);
    let g = 0;
    while (ctl.phase.phase !== "intermission" && g++ < 500) ctl.tick();
    expect(ctl.phase.phase).toBe("intermission");
    const { entity, buy, sell, undo } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;
    const item = "ember-rod";
    const start = champ.gold;
    let peak = start;

    for (let n = 0; n < 12; n++) {
      buy(item);
      peak = Math.max(peak, champ.gold);
      const slot = champ.items.indexOf(item as ItemId);
      sell(slot);
      peak = Math.max(peak, champ.gold);
      undo(); // reverse sell
      peak = Math.max(peak, champ.gold);
      undo(); // reverse buy
      peak = Math.max(peak, champ.gold);
      expect(champ.gold).toBe(start); // exact reset each cycle
    }
    expect(peak, "no cycle ever manufactured a single coin").toBe(start);
  });

  it("cannot undo once combat starts — the purchase is committed, the gate refuses", () => {
    cover("econ-undo-closed-e2e");
    const ctl = spawnedMatch(53);
    const { entity, buy, undo } = humanBuyer(ctl);
    const champ = ctl.world.champion.get(entity)!;
    champ.gold = 10_000;
    const item = "ember-rod";

    buy(item);
    const slot = champ.items.indexOf(item as ItemId);
    const goldAfterBuy = champ.gold;
    expect(slot).toBeGreaterThanOrEqual(0);

    // advance into round-1 combat (enterCombat COMMITS the shop session). With 4
    // teams there is no bye, so every fighter — seat 0 included — is alive here.
    let n = 0;
    while (ctl.phase.phase !== "combat" && n++ < 2000) ctl.tick();
    expect(ctl.phase.phase).toBe("combat");
    expect(ctl.world.health.get(entity)!.alive, "seat 0 should be a live fighter this round").toBe(true);

    // a LIVING champion cannot shop during combat — the undo rides the same gate
    // as buy/sell, so it is refused and nothing is reversed (undo() pushes the
    // command and ticks once, so world.events holds only that tick's events).
    undo();

    const undone = ctl.world.events.filter((e) => e.type === "shopUndone" && e.data.id === entity);
    const rejected = ctl.world.events.filter((e) => e.type === "undoRejected" && e.data.seatId === 0);
    expect(undone, "combat undo must NOT reverse anything").toHaveLength(0);
    expect(rejected.map((e) => e.data.reason)).toContain("combat-alive");
    // the item bought in the shop is committed: still owned, gold not refunded
    expect(champ.items[slot]).toBe(item);
    expect(champ.gold).toBe(goldAfterBuy);
  });
});
