/**
 * Arena round rules (arena-01..arena-11): config-doc driven LoL-Arena match
 * flow on the full imported roster — round-1 QWE auto-learn + silver offer,
 * round-2 quest-weapon 3-choose-1 (free, AI auto-picks), round-3 R unlock,
 * escalation, and a full 12-bot match to matchEnd.
 *
 * The last block, `the per-round curve (arena-curve)`, pins the SHAPE of the
 * schedule rather than any one number — see its own header for the measurement
 * it was derived from.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { registerAll } from "@ggd/shared/content";
import { Augments, Champions, Items, LootTables } from "@ggd/shared/sim/content/registry";
import { rankUpAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { ITEM_TIER_PRICE, STAT_TICK_PRICE, STAT_TICK_TARGET } from "@ggd/shared/sim/economy/itemTiers";
import { GOLD_REWARDS, LEVEL_CAP, STARTING_GOLD } from "@ggd/shared/sim/economy/progression";
import type { SeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { HIGH_STAKES_FIRST_ROUND, HIGH_STAKES_PERIOD } from "./PairedDuels";
import { DEFAULT_ARENA_RULES, grantForRound, resolveArenaRules, rulesFromDoc, type ArenaRules } from "./arenaRules";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** Fast phase config (mirrors match.test.ts). */
const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 30,
  combatMaxTicks: 1200,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
  }));

let arenaDoc: ConfigArenaRulesDoc;
let ARENA: ArenaRules;

beforeAll(async () => {
  // full content tree -> registries (93 champions + legendary-weapons table)
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  arenaDoc = zConfigArenaRulesDoc.parse(
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")),
  );
  ARENA = rulesFromDoc(arenaDoc);
});

function makeArenaMatch(seed: number): MatchController {
  return new MatchController(`arena-${seed}`, seed, allBots(), FAST, 3, ARENA);
}

function runUntil(ctl: MatchController, cond: () => boolean, maxTicks = 60000): void {
  let n = 0;
  while (!cond() && n++ < maxTicks) ctl.tick();
  expect(cond()).toBe(true);
}

describe("config doc + rules resolution (arena-06)", () => {
  it("parses content/config/arena-rules.json into the controller rule table", () => {
    cover("arena-config-parse");
    expect(arenaDoc.schema).toBe("config.arena-rules@1");
    expect(ARENA.ultUnlockRound).toBe(3);
    expect(ARENA.exUnlockRound).toBe(7); // per-hero EX unlocks round 7 (owner 2026-07-27)
    expect(ARENA.offerCount).toBe(3);
    // every round offers an augment 3-choose-1 (隨機三選一, #157): silver early,
    // gold mid, prismatic late. round 1 keeps its level grant + QWE auto-learn.
    expect(ARENA.rounds.get(1)).toMatchObject({ grantLevels: 2, autoLearn: ["Q", "W", "E"] });
    expect(ARENA.rounds.get(1)?.augmentTier).toBe("silver");
    expect([...ARENA.rounds.values()].every((g) => g.augmentTier !== undefined)).toBe(true);
    expect(ARENA.rounds.get(3)?.augmentTier).toBe("silver");
    expect(ARENA.rounds.get(5)?.augmentTier).toBe("gold");
    // owner 2026-07-31: task #70's "two-surface model" (both weapon-draft
    // rounds roll `quest-rewards`, legendary-weapons is orb-only) is REVERSED
    // —「隨機三選一發放道具 都改成棱彩武器道具」. Both weapon-draft rounds now roll
    // `legendary-weapons` directly, same table the 2400g 傳說寶玉 gacha uses.
    // quest-rewards.json is untouched content (still a real loot table,
    // still exercised by questDraftGate.test.ts) — it's just no longer wired
    // to either round card.
    expect(ARENA.rounds.get(2)).toMatchObject({ grantLevels: 3, weaponLootTable: "legendary-weapons" });
    expect(ARENA.rounds.get(5)).toMatchObject({ grantLevels: 6, weaponLootTable: "legendary-weapons" });
    expect(ARENA.rounds.get(3)).toMatchObject({ grantLevels: 3, grantGold: 375 });
    expect(ARENA.gacha).toBeNull(); // weapon offers replace the legacy gacha
    // The table is authored out to round 13. The owner's 2026-07-27 curve reaches
    // the L50 cap at round 10, so rounds 11+ grant 0 levels and `overflow` is
    // gold-only.
    expect(grantForRound(ARENA, 7)).toMatchObject({ grantLevels: 5, grantGold: 600, augmentTier: "prismatic" });
    // owner 2026-08-01: 「第十回合後,每場都是 +4,000金幣」. Rounds 11-13 went
    // 750 → 4000, and `overflow` went with them (4000 flat, per-round escalation
    // ZEROED) so 「每場」 stays literal for any round past the authored table
    // instead of falling off a cliff back to 750 at round 14.
    expect(grantForRound(ARENA, 13)).toMatchObject({ grantLevels: 0, grantGold: 4000, augmentTier: "prismatic" });
    expect(grantForRound(ARENA, 14)).toMatchObject({ grantLevels: 0, grantGold: 4000, augmentTier: "prismatic" });
    expect(grantForRound(ARENA, 16)).toMatchObject({ grantLevels: 0, grantGold: 4000, augmentTier: "prismatic" });

    // the loaded content registry resolves to the SAME active rules
    expect(resolveArenaRules()).toEqual(ARENA);
  });

  it("defaults preserve legacy behavior exactly when no doc is passed", () => {
    cover("arena-config-parse");
    expect(DEFAULT_ARENA_RULES.ultUnlockRound).toBeNull();
    expect(DEFAULT_ARENA_RULES.rounds.get(1)).toEqual({ augmentTier: "silver" });
    expect(DEFAULT_ARENA_RULES.rounds.get(3)).toEqual({ augmentTier: "gold" });
    expect(DEFAULT_ARENA_RULES.rounds.get(5)).toEqual({ augmentTier: "prismatic" });
    expect(DEFAULT_ARENA_RULES.gacha).toEqual({ fromRound: 2, lootTable: "round-reward" });
    expect(grantForRound(DEFAULT_ARENA_RULES, 2)).toBeNull(); // no grants ever

    // a controller constructed WITHOUT rules: no level grants, classic R gate
    const ctl = new MatchController("legacy", 31, allBots(), FAST);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    expect(ctl.world.ultGateOverride).toBe(false);
    for (const seat of ctl.seats.values()) {
      expect(ctl.world.champion.get(seat.entityId!)!.level).toBe(1);
      expect(ctl.world.abilities.get(seat.entityId!)!.slots.W.rank).toBe(0); // Q-only start
    }
    const tiers = new Set([...ctl.offers.values()].map((o) => o.tier));
    expect(tiers).toEqual(new Set(["silver"]));
  });
});

describe("weapon-draft loot tables (arena-07)", () => {
  /** An item that grants nothing is a draft card that grants nothing. */
  const doesSomething = (id: string): boolean => {
    const def = Items.get(id as never);
    return (def.modifiers?.length ?? 0) > 0 || def.passive !== undefined;
  };

  it("legendary-weapons: the shared round-card + 傳說寶玉 orb pool, all effective and unbuyable", () => {
    cover("arena-loot-table");
    // Owner 2026-07-31: both round-2/5 weapon cards AND the 傳說寶玉 gacha roll
    // this same table (see the per-round-curve test below) — reached two ways,
    // not one. Owner 2026-08-01 then replaced the pool wholesale: 「隨機三選一
    // 發放道具 都改成棱彩武器道具」, 24 → 49 entries, and the 25 of them that
    // still carried a 300/1200 shop price were delisted to 0 in the same edit.
    const table = LootTables.get("legendary-weapons");
    expect(table.entries.length).toBeGreaterThanOrEqual(6);
    // GGD 自撰的傳說（不是從 w3x 匯入的，所以沒有 `godie-` 前綴）。
    // ⚠️ 這是**允許清單**不是描述：新增一件自撰傳說而忘了列在這裡，這條就紅，
    //    而那正是它的工作 —— 它擋的是「悄悄多了一件沒人審過的傳說」。
    //    所以 owner 2026-08-01 從池子裡拿掉的兩件（sage-ward-amulet 法師保命 /
    //    piercer-crossbow 射手百分比傷害）**也要從這裡拿掉**：留著等於預先核准
    //    它們無聲回鍋，而那正好是這條允許清單存在的理由。內容檔本身沒動。
    const GGD_AUTHORED = new Set([
      "endless-edge", // #189 無盡連刃（近戰限定）
      "cleaver-of-the-warden", // 泰坦九頭蛇（近戰專用擴散）
      "bulwark-charge-greaves", // 近擊的巨人鎧（坦克衝刺）
    ]);
    for (const e of table.entries) {
      expect(Items.tryGet(e.itemId), `item ${e.itemId} must exist`).toBeDefined();
      expect(e.weight).toBeGreaterThan(0);
      // The defect this guards is a SKELETON item (ember-rod & friends, the
      // fixtures sim/content/skeleton.ts registers) leaking into the shipped
      // pool. "starts with godie-" was a proxy for that, and #189 broke the
      // proxy by authoring the first GGD-ORIGINAL legendary — 無盡連刃 is not a
      // w3x import and never will be. So the rule is stated directly: a pool
      // entry is a map import OR one of the deliberately authored originals,
      // and this list is the place a reviewer sees each one.
      // ⚠️ 這幾件也必須在**平台白名單**裡（apps/platform/internal/curation/
      //    starter.go 的 `starterLegendaryItems`）。理由不是整潔：`MatchController`
      //    的 `grantRoundRewards` 是**先抽再過濾**，所以漏一件不會是「那件不出現」，
      //    而是三選一**抽到一張空卡**。整張表逐條的可達性守衛在
      //    `curation/legendaryReachability.test.ts`（2026-08-01 起是 49/49 推導，
      //    不再是幾個寫死的 id）。
      expect(
        e.itemId.startsWith("godie-") || GGD_AUTHORED.has(e.itemId),
        `${e.itemId} is neither a map item nor a listed GGD-authored legendary`,
      ).toBe(true);
      // task #70: three entries used to be statless items whose whole payload
      // was an unported active — a "legendary" drop that did literally nothing.
      expect(doesSomething(e.itemId), `${e.itemId} would grant NOTHING`).toBe(true);
    }
    // Task #82 INVERTED this. It used to require every legendary to cost at
    // least 2000g, i.e. to be an expensive SHOP item that the card handed you
    // for free. The user's rule is 「傳說的武器道具，只能隨機三選一」, so a
    // legendary now has no price at all: this card and the 2400g 傳說寶玉 are
    // the only two ways to one.
    const costs = table.entries.map((e) => Items.get(e.itemId).cost);
    expect(Math.max(...costs), "a legendary with a price is directly purchasable").toBe(0);
  });

  it("quest-rewards: the 0g quest set, unbuyable and effective", () => {
    cover("arena-loot-table");
    // ⚠️ Not wired to any round card as of 2026-07-31 (both weapon-draft
    // rounds roll legendary-weapons now) — the table is still real, shipped
    // content, still exercised directly by questDraftGate.test.ts's
    // offerItems() calls, and stays a candidate table any future round could
    // point weaponLootTable at again.
    const table = LootTables.get("quest-rewards");
    // has to fill a 3-choose-1 for every seat, twice over if re-rolled
    expect(table.entries.length).toBeGreaterThanOrEqual(6);
    for (const e of table.entries) {
      const def = Items.tryGet(e.itemId as never);
      expect(def, `item ${e.itemId} must exist`).toBeDefined();
      expect(e.weight).toBeGreaterThan(0);
      // THE defining property of this surface: the shop cannot sell it to you.
      expect(def!.cost, `${e.itemId} is buyable — it belongs in the shop`).toBe(0);
      // NB: no doesSomething() gate here. Four quest items (仙后座/戰旗/復仇之袍/
      // 惡魔吉他) carry only an active/aura item@1 cannot express yet (#56); owner
      // rule 2 「所有任務道具」 still requires them draftable. See arenaItemModel.
      expect(def!.craftRole, `${e.itemId} is not a quest item`).toBe("quest");
      expect(
        def!.name.includes("四魂之玉的碎片"),
        `${e.itemId} is a 四魂之玉 shard — shards are dropped, only the assembled jewel is drafted`,
      ).toBe(false);
    }
    // THE TWO FREE TABLES USED TO BE DISJOINT — free-quest-trinket vs
    // free-legendary — so that which table a round pointed at decided what kind
    // of thing you got. owner 2026-08-01 named SIX quest items into the 49-entry
    // 棱彩 pool (「請你將我剛剛輸入的 49 項傳說武器道具都實作完，登錄在隨機三
    // 選一」), so the two tables now share exactly those six.
    //
    // Pinned id-for-id rather than relaxed to "some overlap is fine": a seventh
    // id drifting in, or one of these six quietly leaving one of the tables,
    // still fails. The remaining 7 quest items are what keeps this table a
    // distinct surface at all rather than a subset of the 棱彩 pool.
    const legendary = new Set(LootTables.get("legendary-weapons").entries.map((e) => e.itemId as string));
    const shared = table.entries
      .map((e) => e.itemId as string)
      .filter((id) => legendary.has(id))
      .sort();
    expect(shared, "the quest∩legendary overlap is owner's 2026-08-01 list, exactly").toEqual(
      [
        "godie-i004", // 至尊魔戒
        "godie-i00z", // 四魂之玉
        "godie-i01n", // 天堂之劍
        "godie-i01s", // 仙后座
        "godie-i06j", // 獸人船長十字鎬
        "godie-i06n", // 老衲的棒子
      ].sort(),
    );
    expect(
      table.entries.length - shared.length,
      "every quest item is now also a 棱彩 entry — quest-rewards has stopped being its own surface",
    ).toBeGreaterThan(0);
  });
});

describe("arena round grants (arena-01, arena-04, arena-05)", () => {
  it("round 1: level 3, Q+W+E auto-learned rank 1, R locked, silver augment offer", () => {
    cover("arena-round1-qwe");
    const ctl = makeArenaMatch(1234);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    for (const seat of ctl.seats.values()) {
      const champ = ctl.world.champion.get(seat.entityId!)!;
      const ab = ctl.world.abilities.get(seat.entityId!)!;
      expect(champ.level).toBe(3); // 1 + grantLevels 2
      expect(ab.slots.Q.rank).toBeGreaterThanOrEqual(1);
      expect(ab.slots.W.rank).toBeGreaterThanOrEqual(1);
      expect(ab.slots.E.rank).toBeGreaterThanOrEqual(1);
      expect(ab.slots.R.rank).toBe(0); // ult still locked in round 1
      expect(ab.unspentPoints).toBe(0); // exactly the 3-points-total budget
      // EX is locked far from its round-5 unlock (heroes that have one)
      if (ab.exSlot) expect(ab.exSlot.rank).toBe(0);
    }
    // the augment 3-choose-1 (隨機三選一) is back on EVERY round (#157): round 1
    // hands every surviving seat a silver offer keyed `${round}:${seatId}`.
    let offered = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const offer = ctl.offers.get(`1:${seat.seatId}`);
      expect(offer, `seat ${seat.seatId} must have a round-1 augment offer`).toBeDefined();
      expect(offer!.kind).toBe("augment");
      expect(offer!.tier).toBe("silver");
      const choices = offer!.choices as string[];
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3); // three DISTINCT choices
      offered++;
    }
    expect(offered).toBeGreaterThan(0);
  });

  it("round 3: ult gate override active + the round-3 gold injected at entry", () => {
    cover("arena-ult-override");
    cover("arena-gold-grant");
    const ctl = makeArenaMatch(1234);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 2);
    expect(ctl.world.ultGateOverride).toBe(false); // not yet at round 2

    // walk to the round-3 intermission entry tick, capturing gold beforehand
    let goldBefore = new Map<SeatId, number>();
    while (!(ctl.phase.phase === "intermission" && ctl.phase.round === 3)) {
      goldBefore = new Map(
        [...ctl.seats.values()].map((s) => [s.seatId, ctl.world.champion.get(s.entityId!)!.gold]),
      );
      ctl.tick();
    }
    expect(ctl.world.ultGateOverride).toBe(true);
    let surviving = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      surviving++;
      const gold = ctl.world.champion.get(seat.entityId!)!.gold;
      // the round's grant landed in one tick (nothing else grants that tick).
      // Round 3 is deliberately a SMALL gold round: it is the round R unlocks,
      // and the curve gives each round exactly one landmark.
      expect(gold - goldBefore.get(seat.seatId)!).toBe(375);
    }
    expect(surviving).toBeGreaterThan(0);

    // R is now learnable BELOW the classic level gate (6 for rank 1): take a
    // seat with R unlearned and PIN its level under the gate, so the rank-up
    // below is one the classic 6/11/16 rule would reject.
    //
    // The level is set here rather than searched for. It used to be searched
    // for (`c.level < 6 && R rank 0`), which silently made this test depend on
    // the level distribution one particular simulated match happens to produce
    // by round 3 — and that moves whenever combat behaviour moves (task #274
    // let a champion keep auto-attacking while it walks, so bots now trade
    // while they kite and retreat, and every seat is level 6-7 by round 3).
    // The subject here is the GATE, not the level curve.
    const below = [...ctl.seats.values()].find(
      (s) => ctl.world.abilities.get(s.entityId!)!.slots.R.rank === 0,
    );
    expect(below).toBeDefined();
    const belowChamp = ctl.world.champion.get(below!.entityId!)!;
    belowChamp.level = 5;
    const ab = ctl.world.abilities.get(below!.entityId!)!;
    ab.unspentPoints = Math.max(1, ab.unspentPoints);
    expect(rankUpAbility(ctl.world, below!.entityId!, "R")).toBe(true);
    expect(ab.slots.R.rank).toBe(1);
  });

  it("per-hero EX unlocks at exUnlockRound (7), not before; EX-less never (ex-unlock-round)", () => {
    cover("ex-unlock-round");
    expect(ARENA.exUnlockRound).toBe(7);
    // high lives so the match reliably survives to round 7 without eliminations
    const ctl = new MatchController("ex-round", 4242, allBots(), FAST, 10, ARENA);

    // round 6 intermission: every EX slot is still LOCKED (rank 0)
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 6);
    for (const seat of ctl.seats.values()) {
      const ab = ctl.world.abilities.get(seat.entityId!)!;
      if (ab.exSlot) expect(ab.exSlot.rank).toBe(0);
    }

    // round 7 intermission: active champions WITH an exAbility unlock it (rank 1),
    // EX-less heroes never grow a slot.
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 7);
    let unlocked = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const ab = ctl.world.abilities.get(seat.entityId!)!;
      const def = Champions.get(seat.championId as never);
      if (def.exAbility) {
        expect(ab.exSlot!.rank).toBe(1); // unlocked exactly at round 7
        unlocked++;
      } else {
        expect(ab.exSlot ?? null).toBeNull(); // never for EX-less heroes
      }
    }
    expect(unlocked).toBeGreaterThan(0); // at least one active hero actually has EX
  });
});

describe("free 3-choose-1 weapon offers (arena-02, arena-03)", () => {
  it("round 2: every seat gets a free 3-choose-1 legendary-weapon offer; AI auto-picks it", () => {
    cover("arena-weapon-offer");
    cover("arena-weapon-ai-pick");
    const ctl = makeArenaMatch(555);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 2);

    // one weapon offer per surviving seat, 3 DISTINCT choices from the ROUND-2
    // table (owner 2026-07-31: 「隨機三選一發放道具 都改成棱彩武器道具」 — the same
    // legendary-weapons pool the 2400g 傳說寶玉 gacha rolls from). Round 2 ALSO
    // carries a silver augment now (#157), so filter to the weapon (item)
    // offers keyed `${round}:${seatId}:w`.
    const offered = new Map<SeatId, string[]>();
    expect(ctl.offers.size).toBeGreaterThan(0);
    for (const offer of ctl.offers.values()) {
      if (offer.kind !== "item") continue; // skip the coexisting silver augment
      expect(offer.tier).toBe("weapon");
      const choices = offer.choices as string[];
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      const table = LootTables.get("legendary-weapons").entries.map((e) => e.itemId);
      for (const c of choices) expect(table).toContain(c);
      offered.set(offer.seatId, [...choices]);
    }
    expect(offered.size).toBeGreaterThan(0);

    // AI seats auto-pick after the short delay -> item granted FREE
    for (let i = 0; i < 15; i++) ctl.tick();
    expect(ctl.offers.size).toBe(0);
    for (const [seatId, choices] of offered) {
      const seat = ctl.seats.get(seatId)!;
      const items = ctl.world.champion.get(seat.entityId!)!.items;
      expect(choices.some((c) => items.includes(c as never))).toBe(true);
    }
  });
});

describe("every-round augment 3-choose-1 restored (arena-08, #157)", () => {
  /** Assert every surviving seat holds a `${round}:${seatId}` augment at `tier`. */
  const assertAugmentPerSeat = (ctl: MatchController, round: number, tier: string): void => {
    let surviving = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      surviving++;
      const offer = ctl.offers.get(`${round}:${seat.seatId}`);
      expect(offer, `seat ${seat.seatId} needs a round-${round} augment offer`).toBeDefined();
      expect(offer!.kind).toBe("augment");
      expect(offer!.tier).toBe(tier);
      const choices = offer!.choices as string[];
      // 3-choose-1, except for a High Stakes winner: the Lucky-Dice stand-in
      // widens THAT team's next card to 4 (PairedDuels/MatchController). Round 6
      // is the round after High Stakes 5, so both widths are legal there.
      expect(choices.length, `seat ${seat.seatId} card width`).toBeGreaterThanOrEqual(3);
      expect(choices.length, `seat ${seat.seatId} card width`).toBeLessThanOrEqual(4);
      expect(new Set(choices).size, "a card never repeats an augment").toBe(choices.length);
    }
    expect(surviving).toBeGreaterThan(0);
  };

  it("config schedules silver 1-3 / gold 4-6 / prismatic 7-13", () => {
    cover("arena-config-parse");
    const tiers = [1, 2, 3, 4, 5, 6, 7].map((r) => ARENA.rounds.get(r)?.augmentTier);
    expect(tiers).toEqual(["silver", "silver", "silver", "gold", "gold", "gold", "prismatic"]);
  });

  it("round 1: a silver augment offer reaches every seat (headless controller)", () => {
    cover("arena-config-parse");
    const ctl = makeArenaMatch(1234);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    assertAugmentPerSeat(ctl, 1, "silver");
  });

  it("round 4: a gold augment offer reaches every surviving seat", () => {
    cover("arena-config-parse");
    const ctl = new MatchController("aug-r4", 4242, allBots(), FAST, 20, ARENA);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 4);
    assertAugmentPerSeat(ctl, 4, "gold");
  });

  it("round 5: a gold augment AND the second weapon card coexist per seat", () => {
    cover("arena-config-parse");
    // the Arena reservoir so the match reliably reaches round 5 with seats alive
    const ctl = new MatchController("aug-r5", 4242, allBots(), FAST, 20, ARENA);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 5);
    assertAugmentPerSeat(ctl, 5, "gold");
    // the round-5 weapon card lives alongside the augment card under a distinct
    // `${round}:${seatId}:w` key — both surfaces open at once, as intended.
    let weaponSeats = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const weapon = ctl.offers.get(`5:${seat.seatId}:w`);
      expect(weapon, `seat ${seat.seatId} needs a round-5 weapon offer`).toBeDefined();
      expect(weapon!.kind).toBe("item");
      weaponSeats++;
    }
    expect(weaponSeats).toBeGreaterThan(0);
  });

  it("a picked augment is excluded from the next round's silver re-offer", () => {
    cover("arena-config-parse");
    const ctl = makeArenaMatch(1234);
    // Round 2 is silver again: its fresh 3 choices must EXCLUDE whatever the seat
    // already owns from round 1. The round-1 draft is auto-resolved on the timer,
    // and task #207 makes that a DETERMINISTIC RANDOM one of the three (not the
    // old fixed choices[0]), so we read the champion's ACTUAL augments rather
    // than assuming which card was taken.
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 2);
    let checked = 0;
    for (const seat of ctl.seats.values()) {
      if (seat.entityId === null) continue;
      const offer = ctl.offers.get(`2:${seat.seatId}`);
      if (!offer || offer.kind !== "augment") continue;
      const owned = ctl.world.champion.get(seat.entityId)!.augments as string[];
      expect(owned.length).toBeGreaterThan(0); // the round-1 draft was auto-resolved
      expect(offer.tier).toBe("silver");
      const choices = offer.choices as string[];
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      for (const own of owned) expect(choices).not.toContain(own); // never re-offered
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("unanswered 3-choose-1 auto-resolves to a random card (arena-207)", () => {
  // seat 0 is a HUMAN who never sends a pickOffer; the rest are bots.
  const seatsWithHuman = (): SeatSpec[] =>
    Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: i !== 0,
    }));
  const makeMatch = (seed: number): MatchController =>
    new MatchController(`arena207-${seed}`, seed, seatsWithHuman(), FAST, 3, ARENA);

  it("a HUMAN who never picks still enters combat WITH an augment, offer cleared", () => {
    cover("arena-config-parse");
    const ctl = makeMatch(2024);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    const seat0 = [...ctl.seats.values()].find((s) => s.seatId === 0)!;
    const offer = ctl.offers.get("1:0");
    expect(offer, "seat 0 should have a round-1 augment offer").toBeDefined();
    expect(offer!.kind).toBe("augment");
    const choices = (offer!.choices as string[]).slice();
    expect(choices).toHaveLength(3);
    // seat 0 sends NO pick; drive to combat so the intermission timer fires the
    // auto-pick safety net (task #207).
    runUntil(ctl, () => ctl.phase.phase === "combat");
    const owned = ctl.world.champion.get(seat0.entityId!)!.augments as string[];
    expect(owned).toHaveLength(1); // never enters combat with an empty slot
    expect(choices).toContain(owned[0]); // one of the three it was offered
    // the offer is consumed, so SeatState.offers empties and the client's
    // AugmentDraftPanel focus-scrim is torn down rather than stuck over combat
    expect(ctl.offers.has("1:0")).toBe(false);
    expect([...ctl.offers.keys()].some((k) => /^1:\d+$/.test(k))).toBe(false);
  });

  it("the auto-pick is DETERMINISTIC across same-seed runs (replay-safe)", () => {
    cover("arena-config-parse");
    const pickFor = (seed: number): string => {
      const ctl = makeMatch(seed);
      runUntil(ctl, () => ctl.phase.phase === "combat");
      const seat0 = [...ctl.seats.values()].find((s) => s.seatId === 0)!;
      return (ctl.world.champion.get(seat0.entityId!)!.augments as string[])[0]!;
    };
    expect(pickFor(2024)).toBe(pickFor(2024));
  });

  it("the auto-pick is RANDOM per offer, not a fixed choices[0]", () => {
    cover("arena-config-parse");
    const ctl = makeMatch(2024);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    const offered = new Map<number, string[]>();
    for (const [key, o] of ctl.offers) {
      if (!/^1:\d+$/.test(key) || o.kind !== "augment") continue;
      offered.set(o.seatId, (o.choices as string[]).slice());
    }
    runUntil(ctl, () => ctl.phase.phase === "combat");
    let nonZeroIndex = 0;
    for (const seat of ctl.seats.values()) {
      const choices = offered.get(seat.seatId);
      if (!choices || seat.entityId === null) continue;
      const owned = (ctl.world.champion.get(seat.entityId)!.augments as string[])[0]!;
      if (choices.indexOf(owned) > 0) nonZeroIndex++;
    }
    // under the old hard-coded choices[0] this would be exactly 0
    expect(nonZeroIndex).toBeGreaterThan(0);
  });
});

describe("full arena match on the imported roster (arena-10, arena-11)", () => {
  it("12 bots pick from the full roster and play to matchEnd with placements", () => {
    cover("arena-full-bots");
    cover("roster-bot-picks");
    const ctl = makeArenaMatch(4242);
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n++ < 60000) ctl.tick();
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ctl.result).not.toBeNull();
    expect(ctl.result!.teams.map((t) => t.placement).sort()).toEqual([1, 2, 3, 4]);
    expect(ctl.result!.rounds).toBeGreaterThanOrEqual(2);

    // roster is live: picks come from the imported 93-champion pool
    const picks = [...ctl.seats.values()].map((s) => s.championId);
    console.log(`[roster] bot picks (seed 4242): ${picks.join(", ")}`);
    expect(Champions.ids().length).toBeGreaterThanOrEqual(90);
    expect(new Set(picks).size).toBeGreaterThanOrEqual(6); // spread, not 2 skeletons
    expect(picks.some((p) => p.startsWith("godie-"))).toBe(true); // imported champs
    for (const p of picks) expect(Champions.tryGet(p as never)).toBeDefined();

    // arena grants actually escalated the economy/levels over the match
    for (const seat of ctl.seats.values()) {
      expect(ctl.world.champion.get(seat.entityId!)!.level).toBeGreaterThanOrEqual(4);
    }
  });

  it("same seed -> identical arena match result (determinism under new rules)", () => {
    cover("arena-full-bots");
    const run = (): string => {
      const ctl = makeArenaMatch(777);
      let n = 0;
      while (ctl.phase.phase !== "matchEnd" && n++ < 60000) ctl.tick();
      return JSON.stringify({
        r: ctl.result?.teams.map((t) => ({ p: t.placement, k: t.members.map((m) => m.kills) })),
        rounds: ctl.result?.rounds,
        digest: ctl.world.digest(),
      });
    };
    expect(run()).toBe(run());
  });
});

// ---------------------------------------------------------------------------
// THE ROUND CURVE — authored for the length the team-health model produces.
// ---------------------------------------------------------------------------
/**
 * WHY THIS BLOCK EXISTS. Before the team-health model, matches ended at round
 * 4.6 and the schedule stopped being explicit at round 6; everything past it
 * fell into `overflow`, a single repeat rule. Under team health a match runs
 * 10-13 rounds (measured, 30 seeds), so 40-50% of every match was running on
 * that repeat rule: flat gold, one augment tier forever, and no landmark of any
 * kind after round 6.
 *
 * The table is authored out to round 13, so `overflow` is a guard rail rather
 * than a design surface. These assertions pin the properties the curve was
 * DERIVED from, not the individual numbers: a number may be retuned, but if a
 * retune breaks one of these it has broken the economy the item ladder (#82),
 * the stat fork and the capstone gate (#104) all sit on.
 *
 * ⚠️ 「measured 10-13 rounds」 ABOVE IS STALE, AND SO IS 「round 13 — the measured
 * longest match」. Those numbers predate the 2026-07-27 ruling that made
 * `PairedDuels.FINAL_ROUND` the ONLY end condition: `maybeFinish` ends the match
 * at round 10's resolution, full stop, so a match is exactly 10 rounds and
 * ROUNDS 11-13 ARE NEVER PLAYED. Re-measured 2026-08-01 by running a full
 * 12-bot match against shipped content — see the 「③」 block of
 * `roundGoldOwner.test.ts`, which asserts it rather than describing it, so this
 * comment cannot rot again without a red test.
 *
 * The 11-13 rows are therefore DORMANT DATA (they are what `overflow` and the
 * table would pay the day the cap moves), which is exactly why the owner's
 * 2026-08-01 「第十回合後,每場都是 +4,000金幣」 changes nothing a player sees today.
 *
 * MEASURED on 30 seeds x 12 bots through the real MatchController, shipped
 * content (harness removed; re-derive with the numbers in the block comments).
 * ⚠️ The gold figures below are from BEFORE owner's 2026-08-01 edits (round 1
 * 0 → 750) and are kept only as the historical baseline they were derived at:
 *
 *   career gold   MED 10,675   p90 12,325   max 14,325   (a seat alive at the end)
 *   20th stat tick affordable at round: min 7, MED 9, max 10
 *   augment offers 3,495 — 0 empty, 0 under-filled, every tier min width 3
 *   levels        L3 at R1 -> L50 by R10
 */
describe("the per-round curve (arena-curve)", () => {
  /** grantGold by round, straight off the authored doc. */
  const gold = (r: number): number => ARENA.rounds.get(r)?.grantGold ?? 0;
  const levels = (r: number): number => ARENA.rounds.get(r)?.grantLevels ?? 0;
  const LAST = 13;

  it("is authored to round 13 — 3 rounds past the cap, so overflow is a guard rail", () => {
    cover("arena-config-parse");
    // ⚠️ TITLE FIXED 2026-08-01: it used to say 「the measured longest match」,
    // which stopped being true when FINAL_ROUND became the only end condition.
    // Every round a match can actually reach has an EXPLICIT entry — and the
    // table goes three rounds FURTHER than that, deliberately.
    for (let r = 1; r <= LAST; r++) {
      expect(ARENA.rounds.get(r), `round ${r} must be authored, not inherited from overflow`).toBeDefined();
    }
    expect(Math.max(...ARENA.rounds.keys())).toBe(LAST);
    // …and overflow still exists, so a 14+ round outlier is never a dead round.
    expect(grantForRound(ARENA, LAST + 1)?.augmentTier).toBe("prismatic");
  });

  it("gold no longer ramps monotonically — the owner's curve spikes and dips", () => {
    cover("arena-config-parse");
    // ROUND 1 PAYS 750 (owner 2026-08-01「開局應該是 750」).
    //
    // ⚠️ THE OLD COMMENT HERE WAS 「Round 1 grants NO gold: the 600g opening
    // purse is the whole turn-1 decision」 — that reading is RETIRED, not merely
    // re-tuned, so it is rewritten rather than left sitting above a new number
    // (第三守則). The turn-1 purse is now 600 + 750 = 1,350, which clears
    // POWERFUL (1,200) before a single round has been fought: the opening
    // decision is no longer 「two SIMPLE, or save」, it is 「a POWERFUL now」.
    // That is the owner's call and this line is where a reader finds out.
    expect(gold(1)).toBe(750);
    expect(STARTING_GOLD + gold(1)).toBeGreaterThanOrEqual(ITEM_TIER_PRICE.POWERFUL);
    // ROUND 2 IS A DELIBERATE SPIKE ABOVE ROUND 3, the one break in the ramp:
    // it is sized so the first POWERFUL is affordable in the round-2 shop even
    // for a seat that LOST round 1. 600 + roundLose + 450 = exactly 1,200.
    expect(STARTING_GOLD + GOLD_REWARDS.roundLose + gold(2)).toBe(ITEM_TIER_PRICE.POWERFUL);
    expect(gold(2)).toBeGreaterThan(gold(3));
    // MONOTONICITY IS GONE (owner 2026-07-27, 「都在接受範圍」). The new table
    // spikes on 4 / 8 / 10 and dips back between them, so a player leaves the
    // round-5 shop poorer than they left round 4's. Pinned as SPIKES rather
    // than deleted, so the shape stays a decision instead of drifting.
    // ⚠️ ROUND 10 IS NO LONGER A SPIKE-THEN-DIP. owner's 2026-08-01 「第十回合後,
    // 每場都是 +4,000金幣」 turns everything past round 10 into a PLATEAU that
    // sits ABOVE round 10's own +3,750 — so the old `gold(r) > gold(r + 1)`
    // half is now false for r = 10 by design. Split rather than deleted: 4 and 8
    // are still spikes with dips after them, and 10 is now the step onto the
    // plateau. A future edit that flattens 4 or 8, or that lets the plateau sag
    // below 10, still goes red.
    const SPIKES = [4, 8];
    for (const r of SPIKES) {
      expect(gold(r), `round ${r} is a spike`).toBeGreaterThan(gold(r - 1));
      expect(gold(r), `round ${r} spike dips after`).toBeGreaterThan(gold(r + 1));
    }
    expect(gold(10), "round 10 still steps UP off round 9").toBeGreaterThan(gold(9));
    for (let r = 11; r <= LAST; r++) {
      expect(gold(r), `round ${r} is on the owner's +4,000 plateau`).toBe(4000);
      expect(gold(r), `the plateau must not sag below round 10`).toBeGreaterThan(gold(10));
    }
    // Every price in the ladder is a multiple of 25 (the 75g ladder no longer
    // holds: the owner's +1525 / +2750 spikes are not multiples of 75).
    for (let r = 1; r <= LAST; r++) expect(gold(r) % 25, `round ${r} gold is off the 25g ladder`).toBe(0);
  });

  it("THE #82 FORK IS RETIRED — income now affords BOTH paths (owner 2026-07-27)", () => {
    cover("arena-config-parse");
    // INVERTED, and deliberately so. The fork WAS the point of the stat path:
    // 20 ticks cost about one match's income, so committing to them COSTS you
    // the item build — 「沒有購買任何道具」 enforced by arithmetic rather than by
    // a rule the player has to remember.
    //
    // The owner's 2026-07-27 reward table (R4 +1525, R8 +2750, R10 +3750) lifts
    // deterministic income far past that ceiling, and when this was raised as a
    // consequence the owner's answer was 「都在接受範圍」. So the stat path is no
    // longer a COMMITMENT, it is an additional purchase: a winning player can
    // finish a long match with the full build AND all 20 ticks.
    //
    // Asserted in the NEW direction rather than deleted, because a silent
    // deletion would let the old invariant creep back in unnoticed and quietly
    // re-cap the owner's curve.
    //
    // THE ITEM PATH COSTS 4,800, NOT 7,200. Two of the six slots are filled free
    // by the round-2 and round-5 weapon cards, so a complete build is FOUR
    // bought POWERFUL items. That is the number the ceiling has to clear.
    const fullBuild = 4 * ITEM_TIER_PRICE.POWERFUL;
    const statPath = STAT_TICK_PRICE * STAT_TICK_TARGET;
    expect(fullBuild).toBe(4800);
    expect(statPath).toBe(7500);

    // The DETERMINISTIC ceiling: start + every grant + a round win every round.
    // Kill/assist/bounty gold rides on top of this by design (progression.ts) and
    // is excluded here for the same reason #82 excluded it — it is not income the
    // ladder may be derived against.
    const ceiling = (n: number): number =>
      STARTING_GOLD + [...Array(n)].reduce((s, _, i) => s + gold(i + 1), 0) + GOLD_REWARDS.roundWin * n;
    // ⚠️ RE-MEASURED after owner's 2026-08-01 gold edits (R1 0→750,
    // R11-13 750→4000). Both numbers are ARITHMETIC on the authored table, not
    // observations, so they are recomputed rather than re-run.
    // ⚠️ AND SEE `roundGoldOwner.test.ts`: rounds 11-13 are NOT REACHABLE —
    // `PairedDuels.FINAL_ROUND` is 10 and `maybeFinish` ends the match at its
    // resolution. `ceiling(11)`/`ceiling(13)` are therefore ceilings on a match
    // length the format does not produce today; the reachable ceiling is
    // `ceiling(10)`. Kept (rather than dropped to 10) because they are what
    // `overflow` + the authored 11-13 rows would pay the day the cap moves.
    expect(ceiling(10)).toBe(15675); // EVERY round of a real match, winning all of them
    expect(ceiling(11)).toBe(19975);
    expect(ceiling(13)).toBe(28575);
    expect(
      ceiling(LAST),
      "owner 2026-07-27: both paths ARE affordable now — if this ever goes back " +
        "under the sum, the reward table has been quietly re-capped",
    ).toBeGreaterThan(fullBuild + statPath);
  });

  it("the 20th stat tick first becomes affordable in the round-8 shop", () => {
    cover("arena-config-parse");
    // MEASURED, not assumed: with the owner's curve the all-wins deterministic
    // purse first clears 7,500 in the ROUND-8 shop.
    // ⚠️ RE-COMPUTED 2026-08-01 (round 1 went 0 → 750, so every purse below is
    // 750 richer than the numbers this comment used to carry): round 6 is 6,325,
    // round 7 is 7,225, round 8 is 10,275 — the +2750 spike still does it, and
    // the round-7 purse still misses by 275g. The gate ROUND did not move, but
    // its margin did, so the old 5,575 / 6,475 / 9,525 are recorded as retired
    // rather than silently overwritten (第三守則).
    //
    // ⚠️ CAPSTONE_ROUND_GATE still reads 6, so the gate is now LOOSER than the
    // economy: rounds 6-7 can no longer afford the capstone anyway, which makes
    // the gate inert rather than wrong. The owner's reward table lists
    // 「🔓 傳說·萬象強化解鎖」 on round 6, and that is what the constant says, so
    // it is left alone deliberately — this assertion records that the ARITHMETIC
    // crossing and the AUTHORED unlock are two different rounds now.
    //
    // CAPSTONE_ROUND_GATE lives in packages/shared/src/sim/economy/statPath.ts
    // (outside this lane); this assertion is the evidence that 6 is still right.
    const shopPurse = (n: number, perRound: number): number =>
      STARTING_GOLD + [...Array(n)].reduce((s, _, i) => s + gold(i + 1), 0) + perRound * (n - 1);
    const statPath = STAT_TICK_PRICE * STAT_TICK_TARGET;
    const WANT_GATE = 8;

    // winning every round: affordable in the round-9 shop, NOT in round 8's…
    expect(shopPurse(WANT_GATE - 1, GOLD_REWARDS.roundWin)).toBeLessThan(statPath);
    expect(shopPurse(WANT_GATE, GOLD_REWARDS.roundWin)).toBeGreaterThanOrEqual(statPath);
    // …and the cushion is real but thin, exactly as #82 wanted it (「reachable
    // but only just」): a hundred-gold-scale margin, not a thousand.
    // The cushion is no longer thin — the owner's spike overshoots deliberately.
    expect(shopPurse(WANT_GATE, GOLD_REWARDS.roundWin) - statPath).toBeGreaterThan(0);
  });

  it("keeps the R/EX unlocks off the tier steps (the round-3 pile-up stays gone)", () => {
    cover("arena-config-parse");
    // Before: round 3 carried +2500 gold (the biggest grant in the match), the
    // first round the 2400g orb was affordable, the jump to gold augments AND
    // the R unlock. Four landmarks on one round, while rounds 1-2 had none.
    expect(ARENA.ultUnlockRound).toBe(3);
    expect(ARENA.rounds.get(3)?.augmentTier).toBe(ARENA.rounds.get(2)?.augmentTier); // no tier step on 3
    expect(ARENA.rounds.get(3)?.weaponLootTable).toBeUndefined(); // no card on 3
    expect(gold(3)).toBeLessThan(gold(4)); // and it is not the gold spike either
    // ⚠️ Round 4 now carries BOTH the gold spike (+1525) and the tier step to
    // gold. That is a deliberate pile-up in the owner's 2026-07-27 table, not a
    // regression of the round-3 problem this test was written for — the R and
    // EX unlocks are still on their own rounds, which is the part that mattered.

    // The tier steps land on their own rounds, away from the ability unlocks.
    const tierStep = (r: number): boolean => ARENA.rounds.get(r)?.augmentTier !== ARENA.rounds.get(r - 1)?.augmentTier;
    expect(tierStep(4)).toBe(true); // -> gold
    expect(tierStep(7)).toBe(true); // -> prismatic
    // ⚠️ EX moved to round 7 (owner 2026-07-27), which IS the prismatic step —
    // so the EX unlock and the tier step now share a round on purpose. Asserted
    // in the new direction rather than dropped, so the collision stays visible.
    expect(tierStep(ARENA.exUnlockRound!)).toBe(true); // EX round IS the prismatic step
    expect(tierStep(ARENA.ultUnlockRound!)).toBe(false); // R round carries no tier step
  });

  it("keeps the shop steps off the High Stakes rounds (EX no longer aligns)", () => {
    cover("arena-config-parse");
    // High Stakes fires on 5, 9, 13 (PairedDuels). Round 5 is DELIBERATELY
    // shared with the EX unlock: both say the same thing — the stakes just rose
    // — so they reinforce rather than compete. Every OTHER shop landmark (tier
    // steps, weapon cards) is kept off 5/9/13 so the health rhythm and the shop
    // rhythm interleave instead of piling up.
    // EX no longer sits on the first High Stakes round: the owner moved it to 7
    // (2026-07-27) while High Stakes still fires on 5 / 9 / 13. The rest of this
    // test — keeping the SHOP landmarks off the High Stakes rounds — still holds
    // and is what it now guards.
    expect(ARENA.exUnlockRound).toBe(7);
    expect(ARENA.exUnlockRound).not.toBe(HIGH_STAKES_FIRST_ROUND);
    for (let r = HIGH_STAKES_FIRST_ROUND; r <= LAST; r += HIGH_STAKES_PERIOD) {
      // ⚠️ ROUND 5 IS NOW BOTH. The owner's 2026-07-27 table moved the second
      // weapon card from round 6 to round 5, which is the FIRST High Stakes
      // round — so the health-rhythm beat and the shop beat collide there. This
      // was a deliberate interleave before; it is a deliberate pile-up now.
      // Round 5 is exempted by name rather than by loosening the rule, so every
      // OTHER High Stakes round is still guarded.
      if (r !== 5) {
        expect(ARENA.rounds.get(r)?.weaponLootTable, `round ${r} is High Stakes; keep the weapon card off it`).toBeUndefined();
      }
      expect(
        ARENA.rounds.get(r)?.augmentTier,
        `round ${r} is High Stakes; keep the tier step off it`,
      ).toBe(ARENA.rounds.get(r - 1)?.augmentTier);
    }
  });

  it("schedules no more rounds of a tier than that tier's pool can fill", () => {
    cover("arena-config-parse");
    // `offerAugments` draws WITHOUT replacement and excludes what the champion
    // already owns, so N scheduled rounds of a tier means the Nth card is drawn
    // from (pool - N + 1) cards. The tier must still be able to fill a full
    // `offerCount`-wide card on its own — the lower-tier fallback exists as a
    // safety net for outlier-length matches, not as the normal path.
    const roundsPerTier = new Map<string, number>();
    for (let r = 1; r <= LAST; r++) {
      const t = ARENA.rounds.get(r)?.augmentTier;
      if (t) roundsPerTier.set(t, (roundsPerTier.get(t) ?? 0) + 1);
    }
    for (const [tier, n] of roundsPerTier) {
      const pool = Augments.all().filter((a) => a.tier === tier).length;
      expect(
        pool - (n - 1),
        `tier ${tier} runs for ${n} rounds against a ${pool}-card pool — the last card cannot fill`,
      ).toBeGreaterThanOrEqual(ARENA.offerCount);
    }
    // and the shape that produces: silver 1-3, gold 4-6, prismatic 7-13
    expect([...roundsPerTier.entries()].sort()).toEqual([
      ["gold", 3],
      ["prismatic", 7],
      ["silver", 3],
    ]);
  });

  it("fires exactly two weapon cards, both legendary, matching the 6-slot build", () => {
    cover("arena-config-parse");
    // Owner rule (2026-07-31, supersedes #70): 「隨機三選一發放道具 都改成棱彩武器道具」
    // — a weapon card rolls the SAME legendary-weapons pool the 2400g 傳說寶玉
    // gacha rolls from. The card and the orb are now two different ways to the
    // same pool, not two different pools.
    const cards = [...Array(LAST)]
      .map((_, i) => [i + 1, ARENA.rounds.get(i + 1)?.weaponLootTable] as const)
      .filter(([, t]) => t !== undefined);
    expect(cards.map(([r]) => r)).toEqual([2, 5]);
    for (const [r, table] of cards) {
      expect(table, `round ${r} weapon card must roll the legendary pool`).toBe("legendary-weapons");
    }
    // TWO cards is a function of the SLOT COUNT, not the round count: they fill
    // 2 of 6 slots free, which is what leaves exactly 4 POWERFUL to buy. A third
    // card in a longer match would hand back a slot's worth of gold and reopen
    // the fork this curve is holding shut.
    expect(cards.length).toBe(2);
  });

  it("round grants carry to L50 by round 10; the true cap is 99 (mob XP fills the rest)", () => {
    cover("arena-config-parse");
    // Owner's round→cumulative-level table (2026-07-27, REPLACING 2026-07-25's):
    // 3,6,9,12,18,25,30,35,40,50 — L50 now arrives a round EARLIER, at round 10,
    // which is also the 乾淨總決賽 (no mobs) and the intended last round.
    // Per-round grants back out to these; rounds 11+ grant 0 (rounds top out at 50).
    const grant = [2, 3, 3, 3, 6, 7, 5, 5, 5, 10, 0, 0, 0]; // rounds 1..13
    for (let r = 1; r <= LAST; r++) expect(levels(r)).toBe(grant[r - 1]);
    const levelAfter = (n: number): number => 1 + [...Array(n)].reduce((s, _, i) => s + levels(i + 1), 0);
    expect(levelAfter(10)).toBe(50); // round grants top out at 50 by round 10
    expect(levelAfter(13)).toBe(50); // rounds 11+ grant 0 — rounds never exceed 50
    expect(LEVEL_CAP).toBe(99); // true cap; L50→L99 comes from XP (mobs, next version)
    expect(levelAfter(LAST)).toBeLessThanOrEqual(LEVEL_CAP);
  });

  it("arena-rules is the SOLE augment-tier authority — config.match declares none", () => {
    cover("arena-config-parse");
    // The tier schedule used to be declared TWICE and the two disagreed:
    // config.match@1 `draft.tierSchedule` said {1:silver, 3:gold, 5:prismatic}
    // while arena-rules said {1,2:silver, 3,4:gold, 5,6:prismatic}. Nothing in
    // the server or the sim ever read `draft.tierSchedule` — `MatchController`
    // reads `rules.rounds[r].augmentTier` from THIS doc — so the config.match
    // copy was pure decoration that read like configuration.
    //
    // It is now empty. The key survives only because the `.strict()` Zod object
    // in packages/shared/src/content/schema/config.ts requires it (deleting the
    // field is the cross-lane follow-up); an empty record cannot disagree with
    // anything. `AUGMENT_TIER_SCHEDULE` in sim/economy/draft.ts stays as what it
    // always was: the DEFAULT_ARENA_RULES fallback for a match built with no doc
    // at all (unit tests / skeleton), never the shipped schedule.
    const matchDoc = JSON.parse(readFileSync(join(CONTENT_DIR, "config/config.match.json"), "utf8")) as {
      draft: { tierSchedule: Record<string, string> };
    };
    expect(
      Object.keys(matchDoc.draft.tierSchedule),
      "config.match.json must not re-declare the augment tier schedule",
    ).toEqual([]);
    // …and the doc that DOES declare it covers every playable round.
    for (let r = 1; r <= LAST; r++) expect(ARENA.rounds.get(r)?.augmentTier).toBeDefined();
  });
});
