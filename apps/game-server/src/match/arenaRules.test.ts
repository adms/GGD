/**
 * Arena round rules (arena-01..arena-11): config-doc driven LoL-Arena match
 * flow on the full imported roster — round-1 QWE auto-learn + silver offer,
 * round-2 legendary-weapon 3-choose-1 (free, AI auto-picks), round-3 R unlock
 * + gold injection, escalation, and a full 12-bot match to matchEnd.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { registerAll } from "@ggd/shared/content";
import { Champions, Items, LootTables } from "@ggd/shared/sim/content/registry";
import { rankUpAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import type { SeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
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
    expect(ARENA.exUnlockRound).toBe(5); // per-hero EX unlocks round 5 (WC3 lvl 30)
    expect(ARENA.offerCount).toBe(3);
    // every round offers an augment 3-choose-1 (隨機三選一, #157): silver early,
    // gold mid, prismatic late. round 1 keeps its level grant + QWE auto-learn.
    expect(ARENA.rounds.get(1)).toMatchObject({ grantLevels: 2, autoLearn: ["Q", "W", "E"] });
    expect(ARENA.rounds.get(1)?.augmentTier).toBe("silver");
    expect([...ARENA.rounds.values()].every((g) => g.augmentTier !== undefined)).toBe(true);
    expect(ARENA.rounds.get(3)?.augmentTier).toBe("gold");
    expect(ARENA.rounds.get(5)?.augmentTier).toBe("prismatic");
    // task #70 (reopened): EVERY item 3-choose-1 offers ONLY quest items
    // (「隨機三選一…不要放這些任務道具以外的東西」). Both weapon-draft rounds roll
    // `quest-rewards`; there is no longer a round that drafts a non-quest item.
    // The legendary weapons moved to the shop (rule 1); legendary-weapons.json
    // survives only as the 傳說寶玉 gacha pool, which is not a 3-choose-1 card.
    expect(ARENA.rounds.get(2)).toMatchObject({ grantLevels: 1, weaponLootTable: "quest-rewards" });
    expect(ARENA.rounds.get(5)).toMatchObject({ grantLevels: 1, weaponLootTable: "quest-rewards" });
    expect(ARENA.rounds.get(3)).toMatchObject({ grantLevels: 1, grantGold: 2500 });
    expect(ARENA.gacha).toBeNull(); // weapon offers replace the legacy gacha
    // overflow escalation past the table — augment offers continue (#157)
    expect(grantForRound(ARENA, 7)).toEqual({ grantLevels: 1, grantGold: 1500, augmentTier: "prismatic" });
    expect(grantForRound(ARENA, 9)).toEqual({ grantLevels: 1, grantGold: 2000, augmentTier: "prismatic" });

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

  it("legendary-weapons: imported GoGoDie weapons only, all effective (round 5)", () => {
    cover("arena-loot-table");
    const table = LootTables.get("legendary-weapons");
    expect(table.entries.length).toBeGreaterThanOrEqual(20);
    for (const e of table.entries) {
      expect(Items.tryGet(e.itemId), `item ${e.itemId} must exist`).toBeDefined();
      expect(e.weight).toBeGreaterThan(0);
      // every entry is a map-imported item — NOT a self-created skeleton item
      expect(e.itemId.startsWith("godie-"), `${e.itemId} must be a map item`).toBe(true);
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

  it("quest-rewards: the 0g quest set, unbuyable and effective (round 2)", () => {
    cover("arena-loot-table");
    const table = LootTables.get("quest-rewards");
    // has to fill a 3-choose-1 for every seat, twice over if re-rolled
    expect(table.entries.length).toBeGreaterThanOrEqual(6);
    for (const e of table.entries) {
      const def = Items.tryGet(e.itemId as never);
      expect(def, `item ${e.itemId} must exist`).toBeDefined();
      expect(e.weight).toBeGreaterThan(0);
      // THE defining property of this surface: the shop cannot sell it to you.
      expect(def!.cost, `${e.itemId} is buyable — it belongs in the shop`).toBe(0);
      expect(doesSomething(e.itemId), `${e.itemId} would grant NOTHING`).toBe(true);
      expect(
        def!.name.includes("四魂之玉的碎片"),
        `${e.itemId} is a 四魂之玉 shard — shards are dropped, only the assembled jewel is drafted`,
      ).toBe(false);
    }
    // the two draft tables are disjoint: free-quest-trinket vs free-legendary
    const legendary = new Set(LootTables.get("legendary-weapons").entries.map((e) => e.itemId));
    for (const e of table.entries) expect(legendary.has(e.itemId)).toBe(false);
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

  it("round 3: ult gate override active + 2500 gold injected at entry", () => {
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
      // the big-item budget landed in one tick (nothing else grants that tick)
      expect(gold - goldBefore.get(seat.seatId)!).toBe(2500);
    }
    expect(surviving).toBeGreaterThan(0);

    // R is now learnable BELOW the classic level gate (6 for rank 1): pick a
    // seat whose champion level is under 6 with R unlearned — the classic
    // 6/11/16 gate would reject this exact rank-up
    const below = [...ctl.seats.values()].find((s) => {
      const c = ctl.world.champion.get(s.entityId!)!;
      const a = ctl.world.abilities.get(s.entityId!)!;
      return c.level < 6 && a.slots.R.rank === 0;
    });
    expect(below).toBeDefined();
    const ab = ctl.world.abilities.get(below!.entityId!)!;
    ab.unspentPoints = Math.max(1, ab.unspentPoints);
    expect(rankUpAbility(ctl.world, below!.entityId!, "R")).toBe(true);
    expect(ab.slots.R.rank).toBe(1);
  });

  it("per-hero EX unlocks at exUnlockRound (5), not before; EX-less never (ex-unlock-round)", () => {
    cover("ex-unlock-round");
    expect(ARENA.exUnlockRound).toBe(5);
    // high lives so the match reliably survives to round 5 without eliminations
    const ctl = new MatchController("ex-round", 4242, allBots(), FAST, 10, ARENA);

    // round 4 intermission: every EX slot is still LOCKED (rank 0)
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 4);
    for (const seat of ctl.seats.values()) {
      const ab = ctl.world.abilities.get(seat.entityId!)!;
      if (ab.exSlot) expect(ab.exSlot.rank).toBe(0);
    }

    // round 5 intermission: active champions WITH an exAbility unlock it (rank 1),
    // EX-less heroes never grow a slot.
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 5);
    let unlocked = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const ab = ctl.world.abilities.get(seat.entityId!)!;
      const def = Champions.get(seat.championId as never);
      if (def.exAbility) {
        expect(ab.exSlot!.rank).toBe(1); // unlocked exactly at round 5
        unlocked++;
      } else {
        expect(ab.exSlot ?? null).toBeNull(); // never for EX-less heroes
      }
    }
    expect(unlocked).toBeGreaterThan(0); // at least one active hero actually has EX
  });
});

describe("free 3-choose-1 weapon offers (arena-02, arena-03)", () => {
  it("round 2: every seat gets a free 3-choose-1 quest-reward offer; AI auto-picks it", () => {
    cover("arena-weapon-offer");
    cover("arena-weapon-ai-pick");
    const ctl = makeArenaMatch(555);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 2);

    // one weapon offer per surviving seat, 3 DISTINCT choices from the ROUND-2
    // table (task #70: the 0g quest rewards, i.e. items the shop cannot sell).
    // Round 2 ALSO carries a silver augment now (#157), so filter to the weapon
    // (item) offers keyed `${round}:${seatId}:w`.
    const offered = new Map<SeatId, string[]>();
    expect(ctl.offers.size).toBeGreaterThan(0);
    for (const offer of ctl.offers.values()) {
      if (offer.kind !== "item") continue; // skip the coexisting silver augment
      expect(offer.tier).toBe("weapon");
      const choices = offer.choices as string[];
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      const table = LootTables.get("quest-rewards").entries.map((e) => e.itemId);
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
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
    }
    expect(surviving).toBeGreaterThan(0);
  };

  it("config schedules silver/silver/gold/gold/prismatic/prismatic on rounds 1-6", () => {
    cover("arena-config-parse");
    const tiers = [1, 2, 3, 4, 5, 6].map((r) => ARENA.rounds.get(r)?.augmentTier);
    expect(tiers).toEqual(["silver", "silver", "gold", "gold", "prismatic", "prismatic"]);
  });

  it("round 1: a silver augment offer reaches every seat (headless controller)", () => {
    cover("arena-config-parse");
    const ctl = makeArenaMatch(1234);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    assertAugmentPerSeat(ctl, 1, "silver");
  });

  it("round 3: a gold augment offer reaches every surviving seat", () => {
    cover("arena-config-parse");
    const ctl = makeArenaMatch(1234);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 3);
    assertAugmentPerSeat(ctl, 3, "gold");
  });

  it("round 5: a prismatic augment AND the legendary-weapon offer coexist per seat", () => {
    cover("arena-config-parse");
    // high lives so the match reliably reaches round 5 without eliminations
    const ctl = new MatchController("aug-r5", 4242, allBots(), FAST, 10, ARENA);
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 5);
    assertAugmentPerSeat(ctl, 5, "prismatic");
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
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 1);
    // AI auto-picks choice 0 during this intermission — capture it per seat
    const pickedBySeat = new Map<number, string>();
    for (const [key, offer] of ctl.offers) {
      if (!/^1:\d+$/.test(key)) continue;
      pickedBySeat.set(offer.seatId, (offer.choices as string[])[0]!);
    }
    expect(pickedBySeat.size).toBeGreaterThan(0);
    // round 2 is silver again: fresh 3 choices that EXCLUDE the owned pick
    runUntil(ctl, () => ctl.phase.phase === "intermission" && ctl.phase.round === 2);
    let checked = 0;
    for (const seat of ctl.seats.values()) {
      const offer = ctl.offers.get(`2:${seat.seatId}`);
      if (!offer || offer.kind !== "augment") continue;
      const picked = pickedBySeat.get(seat.seatId);
      if (picked === undefined) continue;
      expect(offer.tier).toBe("silver");
      const choices = offer.choices as string[];
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      expect(choices).not.toContain(picked); // owned augment never re-offered
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
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
