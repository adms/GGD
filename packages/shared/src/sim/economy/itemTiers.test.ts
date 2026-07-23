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
import { Stat, STAT_CLAMPS } from "../stats/statTypes";
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
  STAT_TICK_ROLLS,
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
  it("every purchasable weapon carries EXACTLY one of the two tier prices", () => {
    cover("econ-two-prices");
    // The shop surface is derivable without the curation list: a weapon is
    // buyable iff it is priced at a tier AND actually does something (three
    // effect-less WC3 recipe books happen to sit at 1200g and are excluded by
    // the same S3 rule the curation layer uses).
    const shop = items.filter((d) => TIER_PRICES.includes(d.cost) && hasEffect(d));
    const simple = shop.filter((d) => d.cost === ITEM_TIER_PRICE.SIMPLE);
    const powerful = shop.filter((d) => d.cost === ITEM_TIER_PRICE.POWERFUL);

    // Task #108 re-curated 7 mis-placed items onto the shop surface (63 -> 70):
    // +3 SIMPLE (網友手環/嚇人假面/祕銀鎖子甲) and +4 POWERFUL (蜂蜜罐/瑪那魔杖/
    // 破甲槍/分手之鎚). See apps/platform/internal/curation/starter.go.
    expect(shop.length).toBe(70);
    expect(simple.length).toBe(42);
    expect(powerful.length).toBe(28);
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
      expect(doc!.cost, `legendary ${e.itemId} is directly purchasable at ${doc!.cost}g`).toBe(0);
      expect(hasEffect(doc!), `legendary ${e.itemId} does nothing`).toBe(true);
    }
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

describe("the 能力屬性強化 roll pool", () => {
  it("every roll is worth one SIMPLE item, within 2%", () => {
    cover("econ-stat-roll-parity");
    for (const roll of STAT_TICK_ROLLS) {
      const rate = AEP_PER_POINT[roll.stat];
      expect(rate, `${roll.stat} has no measured AEP rate — it cannot be priced`).toBeDefined();
      const delta = roll.op === ModOp.PercentAdd ? REFERENCE_BASE_AS * roll.value : roll.value;
      const aep = rate! * delta;
      expect(aep / TIER_AEP_BUDGET.SIMPLE, `${roll.stat} roll is off budget`).toBeCloseTo(1, 1);
    }
  });

  it("excludes every stat this sim cannot pay for", () => {
    cover("econ-stat-roll-exclusions");
    const offered = new Set(STAT_TICK_ROLLS.map((r) => r.stat));
    // cdr measures 0.047 AEP per 10%; maxMana/manaRegen are worth ~nothing
    // because casts are cooldown-limited, not mana-limited; critDamage is
    // identically 0 at the champion base critChance of 0.
    for (const dead of [Stat.CooldownReduction, Stat.MaxMana, Stat.ManaRegen, Stat.CritDamage]) {
      expect(offered.has(dead), `${dead} is a dead stat in this sim and must not be a roll`).toBe(false);
    }
    expect(new Set(offered).size).toBe(STAT_TICK_ROLLS.length); // no duplicate stat
  });

  it("a roll never exceeds the stat's own runtime clamp on its own", () => {
    cover("econ-stat-roll-clamped");
    for (const roll of STAT_TICK_ROLLS) {
      const clamp = STAT_CLAMPS[roll.stat];
      if (!clamp || roll.op !== ModOp.Flat) continue;
      expect(roll.value, `one ${roll.stat} roll alone busts its clamp`).toBeLessThanOrEqual(clamp[1]);
    }
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
