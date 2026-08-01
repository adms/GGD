/**
 * THE ARENA ITEM MODEL (task #70) — item-01..item-05.
 *
 * The governing decision (user, 2026-07-22):
 * 「理論上競技場上的所有道具跟武器都不需要合成」 — there is NO CRAFTING IN THE
 * ARENA AT ALL. No combine step exists anywhere, so every item a player can
 * obtain is complete the moment they get it and nothing is a stepping stone to
 * anything. That is already the engine's reality: grep the sim for
 * combine/craft/recipe and you find ECS *entity* components, never item ones —
 * the WC3 recipes only ever lived in the map's JASS and were never ported.
 *
 * So the arena has exactly TWO ways to obtain an item, and this file is the
 * guard that keeps them from blurring back together:
 *
 *   SHOP  — gold, during intermission. Named, priced, effective, sane.
 *   DRAFT — the free round-2 3-choose-1. The 0g WC3 quest/score rewards, i.e.
 *           precisely the items the shop CANNOT sell you.
 *
 * ---------------------------------------------------------------------------
 * WHAT owner 2026-08-01 CHANGED, AND WHERE THAT LEFT THESE GATES
 * ---------------------------------------------------------------------------
 * 「隨機三選一發放道具 都改成棱彩武器道具」 +「請你將我剛剛輸入的 49 項傳說武器
 * 道具都實作完，登錄在隨機三選一」. content/loot-tables/legendary-weapons.json
 * went 24 → 49, BOTH weapon-draft rounds (2 and 5) now roll it, and 25 of those
 * 49 had their shop `cost` zeroed so 「傳說＝三選一專屬」 still holds.
 *
 * Two consequences these gates had to be re-aimed at, neither of which weakens
 * them:
 *
 *  1. The shop is no longer «every effective final». 18 of the 49 are craftRole
 *     "final" with a real payload, so SHOP = FINAL ∧ effective ∧ sane MINUS the
 *     legendary surface. Same derivation, one more term — and the term is not a
 *     fudge: those 18 all carry `cost: 0` now, which is what makes them
 *     unsellable in the first place.
 *  2. The four surfaces are NO LONGER a partition. 6 quest items (至尊魔戒 /
 *     四魂之玉 / 天堂之劍 / 仙后座 / 獸人船長十字鎬 / 老衲的棒子) are on the
 *     DRAFT surface and in the 49-item 棱彩 pool at once. That is owner's own
 *     list, so the disjointness gate below now separates BUYABLE from FREE
 *     (still absolute) and pins the free/free overlap to exactly those 6 ids
 *     rather than pretending it is empty.
 *
 * The lists live in Go (apps/platform/internal/curation/starter.go) because the
 * platform serves the whitelist; this file re-derives them from the content
 * tree and fails if they have drifted. It also round-trips the WC3 crafting
 * tree artefact against the JASS it was extracted from — NOT because the game
 * implements recipes (it must never), but because that artefact is the
 * design-history record the classification was argued from, and a record
 * nobody checks is a record nobody can trust.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Items, LootTables } from "@ggd/shared/sim/content/registry";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { ITEM_TIER_PRICE } from "@ggd/shared/sim/economy/itemTiers";
import type { ItemId } from "@ggd/shared/ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO, "content");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");
const CRAFT_TREE = join(REPO, "docs/content/wc3-crafting-tree.json");

/** Pull one `name = []string{ … }` block's quoted ids out of the Go source. */
function goList(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) throw new Error(`could not find the end of ${name} in starter.go`);
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

interface ItemFacts {
  id: string;
  name: string;
  cost: number;
  role: string;
  effective: boolean;
  insane: string[];
}

/** The shipped facts each gate is stated in terms of — nothing else. */
function factsOf(id: string): ItemFacts {
  const def = Items.get(id as ItemId);
  const mods = def.modifiers ?? [];
  const insane: string[] = [];
  for (const m of mods) {
    const bad =
      (m.stat === "critChance" && m.value > 1.0) ||
      (m.stat === "lifesteal" && m.value > 1.0) ||
      (m.stat === "ad" && m.value > 500) ||
      (m.stat === "ap" && m.value > 500) ||
      (m.stat === "maxHealth" && m.value > 5000) ||
      (m.stat === "maxMana" && m.value > 5000) ||
      (m.stat === "armor" && m.value > 200) ||
      (m.stat === "mr" && m.value > 200);
    if (bad) insane.push(`${m.stat} ${m.value}`);
  }
  return {
    id,
    name: def.name,
    cost: def.cost,
    role: (def as { craftRole?: string }).craftRole ?? "none",
    effective: mods.length > 0 || def.passive !== undefined,
    insane,
  };
}

/** The four 四魂之玉 shards — dropped by policy, see starter.go gate D4. */
const isJewelShard = (f: ItemFacts): boolean => f.name.includes("四魂之玉的碎片");

let shop: string[] = [];
let draft: string[] = [];
let services: string[] = [];
let legendary: string[] = [];
let allItems: string[] = [];

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  const src = readFileSync(STARTER_GO, "utf-8");
  shop = goList(src, "starterShopItems");
  draft = goList(src, "starterDraftItems");
  services = goList(src, "starterServiceItems");
  legendary = goList(src, "starterLegendaryItems");
  allItems = [...Items.ids()] as string[];
});

// ---------------------------------------------------------------------------

describe("the two surfaces are exactly what the gates say (item-01)", () => {
  it("SHOP = every FINAL crafted weapon with an effect the 棱彩 pool has not claimed", () => {
    cover("arena-item-surfaces");
    // Owner rule 1 (task #70, reopened): 「只有最終合成武器才能上架可直接購買
    // (有製作書的)」. The shop is derived from the craftRole marker (recovered
    // from the source-map triggers), NOT from price — the old `cost > 0`
    // derivation is the bug that put components and the quest reward 魔戒 on the
    // shelf. A final with no expressible payload is held off by the S3/effect
    // gate (its power is an active item@1 cannot hold — #56).
    //
    // owner 2026-08-01 added the fourth term: MINUS the legendary surface.
    // Eighteen of the 49 棱彩 entries are effective finals, and the same edit
    // zeroed their `cost`, so rule 1 and 「傳說＝三選一專屬」 both point the same
    // way — an effective final that the pool claims is NOT shop stock. This is
    // derived from the shipped loot table, not from a hand-kept exclusion list,
    // so moving an item between the two surfaces needs no edit here.
    const claimedByLegendary = new Set(LootTables.get("legendary-weapons").entries.map((e) => e.itemId as string));
    const want = allItems
      .filter((id) => {
        const f = factsOf(id);
        return (
          f.name !== id &&
          f.role === "final" &&
          f.effective &&
          f.insane.length === 0 &&
          !claimedByLegendary.has(id)
        );
      })
      .sort();
    expect(
      [...shop].sort(),
      "starter.go's shop list has drifted from the FINAL-weapon set the content tree justifies",
    ).toEqual(want);
    // The old floor was a flat `>= 20`, which was the shelf's size in July and
    // says nothing once 18 finals move to the draft. Re-aimed at what the number
    // has to PROTECT: a shelf smaller than a champion's inventory is not a shop,
    // it is a fixed build handed out one slot at a time.
    expect(
      shop.length,
      `only ${shop.length} finals are for sale — fewer than the ${INVENTORY_SLOTS} slots a build has to fill`,
    ).toBeGreaterThan(INVENTORY_SLOTS);
    // EXCLUSION: nothing but a final may be on the shelf, and nothing on the
    // shelf may be a 棱彩 entry.
    for (const id of shop) {
      expect(factsOf(id).role, `shop item ${id} is not a final crafted weapon`).toBe("final");
      expect(claimedByLegendary.has(id), `${id} is on the shelf AND in the 棱彩 pool`).toBe(false);
    }
  });

  it("DRAFT = exactly the QUEST set, both halves (item-01)", () => {
    cover("arena-item-surfaces");
    // Owner rule 2: 「隨機三選一才能選到 所有任務道具 … 不要放這些任務道具以外的
    // 東西」. The draft is derived from craftRole == "quest" — and crucially the
    // effect gate is NOT applied, because four quest items (仙后座/戰旗/復仇之袍/
    // 惡魔吉他) carry only an active/aura item@1 cannot express yet (#56) and the
    // owner still wants them draftable. INCLUSION and EXCLUSION are both pinned.
    const wantQuest = allItems.filter((id) => factsOf(id).role === "quest").sort();
    expect([...draft].sort(), "the draft surface has drifted from the quest set").toEqual(wantQuest);
    expect(draft.length).toBeGreaterThanOrEqual(6);
    for (const id of draft) {
      expect(factsOf(id).role, `draft item ${id} is not a quest item`).toBe("quest");
    }
    // The legendary/orb pool is a SEPARATE surface (not a 3-choose-1 draft); it
    // is asserted for its own closure below.
    expect(legendary.length).toBeGreaterThanOrEqual(6);
  });

  it("nothing is BUYABLE and FREE at once; the two FREE surfaces overlap on exactly owner's 6", () => {
    cover("arena-item-surfaces");
    // THE LOAD-BEARING HALF, and it has no exceptions. 「傳說的武器道具，只能隨機
    // 三選一」 (task #82) is only a rule if the gold surfaces and the card
    // surfaces share nothing: an id on both is a "legendary" you can just buy,
    // which is the exact regression #82 was opened to fix (29 of 29 legendaries
    // were purchasable before it).
    const paid = new Map<string, string>();
    for (const [surface, list] of [
      ["shop", shop],
      ["services", services],
    ] as const) {
      for (const id of list) {
        expect(paid.get(id), `${id} is on both the ${paid.get(id)} and ${surface} surfaces`).toBeUndefined();
        paid.set(id, surface);
      }
    }
    const free = new Map<string, string>();
    for (const [surface, list] of [
      ["legendary", legendary],
      ["draft", draft],
    ] as const) {
      for (const id of list) {
        expect(
          paid.get(id),
          `${id} is on the ${paid.get(id)} surface AND the free ${surface} surface — it can be bought`,
        ).toBeUndefined();
        free.set(id, surface);
      }
    }

    // THE HALF owner 2026-08-01 BROKE, stated honestly instead of asserted away.
    // 「請你將我剛剛輸入的 49 項傳說武器道具都實作完，登錄在隨機三選一」 named 6
    // craftRole-"quest" items into the 棱彩 pool. They therefore sit on the DRAFT
    // surface (owner rule 2 is 「所有任務道具」 — every quest item is draftable,
    // and the Go guard TestStarterDraftIsQuestSet enforces that in both
    // directions) and in the legendary pool at the same time.
    //
    // This is NOT a skip-list: the overlap is pinned id-for-id, so a SEVENTH id
    // drifting in fails here, and each of the 6 still has to be a 0g quest item
    // (i.e. free through both doors, never purchasable through either).
    // 2026-08-01: quest-rewards is not wired to any round, so nothing in a live
    // match reaches these two ways today — the round card rolls legendary-weapons
    // for both weapon rounds. See match/arenaRules.test.ts.
    const bothFree = [...draft].filter((id) => legendary.includes(id)).sort();
    expect(bothFree, "the DRAFT∩LEGENDARY overlap is owner's 2026-08-01 list, exactly").toEqual(
      [
        "godie-i004", // 至尊魔戒
        "godie-i00z", // 四魂之玉
        "godie-i01n", // 天堂之劍
        "godie-i01s", // 仙后座
        "godie-i06j", // 獸人船長十字鎬
        "godie-i06n", // 老衲的棒子
      ].sort(),
    );
    for (const id of bothFree) {
      const f = factsOf(id);
      expect(f.role, `${id} (${f.name}) is on two FREE surfaces but is not a quest item`).toBe("quest");
      expect(f.cost, `${id} (${f.name}) is on two FREE surfaces and carries a price`).toBe(0);
    }
    // The old single-pass `seen` map also caught a list that repeats an id.
    // Keeping that: two surfaces are now allowed to share an id, one surface
    // listing it twice never was.
    for (const [surface, list] of [
      ["shop", shop],
      ["services", services],
      ["legendary", legendary],
      ["draft", draft],
    ] as const) {
      expect(new Set(list).size, `the ${surface} surface lists the same id twice`).toBe(list.length);
    }
    // PRICE AND SURFACE MUST AGREE, in both directions — and this is the half
    // that actually has teeth at RUNTIME. `economy/shop.buyItem` refuses on
    // `def.cost <= 0` ("not-purchasable") before it consults any list, so a 0g
    // item cannot be bought no matter who routes to it, and a PRICED one can be
    // bought the moment anything does. The surface lists are routing; the price
    // is the enforcement of 「傳說的武器道具，只能隨機三選一」. owner's 2026-08-01
    // delisting IS this edit (25 pool entries 300/1200 → 0), so state it where
    // it can rot: a legendary that quietly regains a price is buyable again
    // without any starter.go list changing.
    for (const id of free.keys()) {
      const f = factsOf(id);
      expect(f.cost, `${id} (${f.name}) is only ever handed out free, but carries a price`).toBe(0);
    }
    for (const id of paid.keys()) {
      const f = factsOf(id);
      expect(f.cost, `${id} (${f.name}) is on a GOLD surface but costs nothing`).toBeGreaterThan(0);
    }
  });

  it("the assembled 四魂之玉 is offered whole and no shard is offered at all", () => {
    cover("arena-item-surfaces");
    // The governing decision resolved the 四魂之玉 question: no collection
    // chain, because nothing combines. The jewel is a single draft reward and
    // the four shards are dropped OUTRIGHT — not gated behind one another. An
    // item literally named "shard OF the jewel" sitting next to the completed
    // jewel is the last artefact that could send a player hunting for a
    // crafting UI that does not exist.
    expect(draft).toContain("godie-i00z"); // 四魂之玉
    const shards = allItems.filter((id) => isJewelShard(factsOf(id)));
    expect(shards.length, "the four shards must still exist as content").toBe(4);
    for (const id of shards) {
      expect(shop, `shard ${id} is purchasable`).not.toContain(id);
      expect(draft, `shard ${id} is draftable`).not.toContain(id);
    }
  });
});

describe("nothing that cannot work is reachable (item-02)", () => {
  it("no recipe book is on either surface — they are pure no-ops", () => {
    cover("arena-item-noop-unreachable");
    const books = allItems.filter((id) => Items.get(id as ItemId).name.includes("製作書"));
    // Delete recipe books by the 製作書 SUBSTRING, never by a count: an earlier
    // pass quoted "64 books", which is a 書 query that also catches the five
    // 山/林/火/澤/風之書 elemental items and three genuine shop items
    // (嗜血邪書 / 盾甲天書 / 黑色魔書). The real count is 55.
    expect(books.length).toBe(55);
    for (const id of books) {
      expect(shop, `recipe book ${id} is purchasable`).not.toContain(id);
      expect(draft, `recipe book ${id} is draftable`).not.toContain(id);
      // and every one of them is a no-op, which is WHY it is unreachable
      expect(factsOf(id).effective).toBe(false);
    }
  });

  it("no zero-effect item is in the SHOP, and none was deleted from content", () => {
    cover("arena-item-noop-unreachable");
    const dead = allItems.filter((id) => !factsOf(id).effective);
    // A no-effect item may never be SOLD (the shop's S3 gate). It MAY be drafted
    // if it is a quest item: 仙后座/戰旗/復仇之袍/惡魔吉他 are quest rewards the
    // owner named/implied whose whole payload is an active item@1 cannot express
    // yet (#56). Owner rule 2 is 「所有任務道具」, so they are draftable regardless
    // — dropping them for lacking ported stats is how 仙后座 went missing before.
    expect(dead.length).toBeGreaterThan(50);
    for (const id of dead) {
      expect(shop, `no-effect item ${id} is on the shop shelf`).not.toContain(id);
      if (factsOf(id).role !== "quest") {
        expect(draft, `no-effect non-quest item ${id} is draftable`).not.toContain(id);
      }
      expect(Items.tryGet(id as ItemId), `${id} must still exist as content`).toBeDefined();
    }
  });

  it("no reachable item has an impossible value (unit / import bug)", () => {
    cover("arena-item-noop-unreachable");
    // `legendary` joined this sweep on 2026-08-01. It used to be the surface a
    // player reached least (the 2400g orb only); it is now what BOTH weapon
    // 3-choose-1 rounds hand out, so it is the MOST reachable of the three and
    // was the only one nothing scanned for a unit/import blowout.
    for (const id of [...shop, ...draft, ...legendary]) {
      const f = factsOf(id);
      expect(f.insane, `${id} (${f.name}) carries impossible values`).toEqual([]);
    }
    // …and as of this writing the whole collection is clean, which is the real
    // finding: the extreme numbers task #47 recorded (ad 99999, critChance
    // 2.75..10, a 0g item with 20000 maxHealth) are NOT in the shipped docs.
    // Every critChance is a fraction.
    const crits = allItems.flatMap((id) =>
      (Items.get(id as ItemId).modifiers ?? []).filter((m) => m.stat === "critChance").map((m) => m.value),
    );
    expect(crits.length).toBeGreaterThan(0);
    for (const v of crits) expect(v, "critChance must be a fraction, not a raw percent").toBeLessThanOrEqual(1);
  });
});

describe("both draft tables can actually pay out (item-03)", () => {
  it("quest-rewards mirrors the draft surface exactly", () => {
    cover("arena-item-draft-tables");
    const table = LootTables.get("quest-rewards");
    expect([...table.entries.map((e) => e.itemId)].sort()).toEqual([...draft].sort());
  });

  it("every legendary-weapons entry is real, effective, and NOT purchasable", () => {
    cover("arena-item-draft-tables");
    // This assertion is INVERTED from task #70's, on purpose. #70 required
    // every legendary to be in the shop so a drop was never something you
    // could not otherwise obtain. The user's rule for the arena is the
    // opposite — 「傳說的武器道具，只能隨機三選一」 — and it is what makes the
    // round-2/5 cards and the 2400g 傳說寶玉 worth anything at all. All 29 were
    // in the shop before task #82; none of the 49 may be now.
    //
    // owner 2026-08-01 re-broke and re-fixed exactly this: 25 of the new pool
    // carried a 300/1200 price, all 25 were zeroed with the pool edit, and 16 of
    // them were still listed in starter.go's `starterShopItems` until this batch
    // pulled them (see the surface note in that file).
    const inShop = new Set(shop);
    expect([...LootTables.get("legendary-weapons").entries.map((e) => e.itemId)].sort()).toEqual(
      [...legendary].sort(),
    );
    for (const e of LootTables.get("legendary-weapons").entries) {
      expect(Items.tryGet(e.itemId), `${e.itemId} must exist`).toBeDefined();
      expect(factsOf(e.itemId).effective, `${e.itemId} would grant NOTHING`).toBe(true);
      expect(inShop.has(e.itemId), `${e.itemId} is a legendary you can simply BUY`).toBe(false);
      expect(Items.get(e.itemId).cost, `${e.itemId} carries a price`).toBe(0);
    }
  });
});

describe("the shop is a shop, not a museum (item-04)", () => {
  it("THERE IS NO PRICE CURVE — two prices, and everything is reachable", () => {
    cover("arena-item-price-curve");
    // 600g starting gold; round rewards 750+2500+1000+1250+1500 = 7600g total.
    const START = 600;
    const CEILING = 7600;
    const costs = shop.map((id) => Items.get(id as ItemId).cost);
    // Task #70 asserted that every 1000g band held SOMETHING, because a
    // continuous price ladder was the model and an empty band meant a round's
    // income bought nothing new. Task #82 replaced the ladder with two points
    // (「武器價格請統一化，只有三種價格」), so band coverage is not just failing,
    // it is the wrong question. What replaces it: the two prices exist, both
    // are reachable, and nothing sits anywhere else.
    //
    // ⚠️ A THIRD value appearing here is never "a new tier" — it is 0, i.e. an
    // unsellable draft item that leaked onto the shelf. That is exactly how this
    // assertion caught owner's 2026-08-01 delisting: 16 zeroed 棱彩 finals were
    // still in `starterShopItems`, and the set came back [0, 300, 1200].
    expect([...new Set(costs)].sort((a, b) => a - b)).toEqual([
      ITEM_TIER_PRICE.SIMPLE,
      ITEM_TIER_PRICE.POWERFUL,
    ]);
    const openers = costs.filter((c) => c <= START).length;
    // The shop is FINAL weapons only now (owner rule 1), minus whatever the 棱彩
    // pool claims — a much sharper shelf than the old cost-filtered 70. Turn 1
    // must still offer a real choice (a SIMPLE final buyable on the 600g purse),
    // and the late game must still be a CHOICE rather than a shopping list: a
    // player filling all six slots with POWERFUL items has to have had an
    // alternative at every one of them. `>= 10` was the July shelf's size and
    // says nothing about either property.
    expect(openers, `only ${openers} finals are buyable at turn 1`).toBeGreaterThanOrEqual(1);
    const powerful = costs.filter((c) => c === ITEM_TIER_PRICE.POWERFUL).length;
    expect(
      powerful,
      `${powerful} POWERFUL finals for ${INVENTORY_SLOTS} slots — the late shop is a forced build`,
    ).toBeGreaterThan(INVENTORY_SLOTS);
    expect(Math.max(...costs), "nothing in the shop may be unreachable").toBeLessThanOrEqual(CEILING);
    // The 600g purse buys exactly TWO of the cheap tier and none of the dear
    // one — that asymmetry IS the turn-1 fork.
    expect(Math.floor(START / 300)).toBe(2);
    expect(START).toBeLessThan(1200);
  });
});

describe("the WC3 crafting tree artefact round-trips against the JASS (item-05)", () => {
  it("every jass-sourced recipe matches the trigger it was extracted from", () => {
    cover("arena-recipe-tree-roundtrip");
    // THIS IS NOT A SPEC. The arena implements no combining and never will.
    // The artefact is the design-history record the item classification was
    // argued from, so it has to still describe the map it claims to describe.
    const tree = JSON.parse(readFileSync(CRAFT_TREE, "utf-8")) as {
      meta: { sourceJass: string };
      recipes: {
        source: string;
        jassFunction?: string;
        product: { rawcode: string; contentId: string };
        components: { rawcode: string; contentId: string }[];
      }[];
    };
    const jassPath = join(REPO, tree.meta.sourceJass);
    let jass: string;
    try {
      jass = readFileSync(jassPath, "utf-8");
    } catch {
      // The raw import output is a build artefact, not a checked-in source.
      return;
    }

    const fromJass = tree.recipes.filter((r) => r.source === "jass");
    expect(fromJass.length).toBeGreaterThanOrEqual(60);

    for (const r of fromJass) {
      const fn = r.jassFunction!;
      const at = jass.indexOf(`function ${fn} takes nothing returns nothing`);
      expect(at, `JASS has no action function ${fn} for ${r.product.contentId}`).toBeGreaterThanOrEqual(0);
      const body = jass.slice(at, jass.indexOf("endfunction", at));

      // the product is the item the trigger HANDS OUT
      const granted = [...body.matchAll(/UnitAddItemByIdSwapped\('([^']+)'/g)].map((m) => m[1]!);
      expect(granted, `${fn} does not grant ${r.product.rawcode}`).toContain(r.product.rawcode);

      // the components are the items the trigger CONSUMES
      const consumed = new Set([...body.matchAll(/RemoveItem\(GetItemOfTypeFromUnitBJ\([^,]+,'([^']+)'\)/g)].map((m) => m[1]!));
      const declared = new Set(r.components.map((c) => c.rawcode));
      expect([...declared].sort(), `${fn} component list drifted from the JASS`).toEqual([...consumed].sort());
    }
  });

  it("every id the artefact names still resolves to a real content item", () => {
    cover("arena-recipe-tree-roundtrip");
    const tree = JSON.parse(readFileSync(CRAFT_TREE, "utf-8")) as {
      recipes: { product: { contentId: string }; components: { contentId: string }[] }[];
    };
    for (const r of tree.recipes) {
      expect(Items.tryGet(r.product.contentId as ItemId), `${r.product.contentId} vanished`).toBeDefined();
      for (const c of r.components) {
        expect(Items.tryGet(c.contentId as ItemId), `${c.contentId} vanished`).toBeDefined();
      }
    }
  });
});
