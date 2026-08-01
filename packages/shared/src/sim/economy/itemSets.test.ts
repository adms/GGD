/**
 * 套裝 (item sets) — THE MECHANISM, on synthetic content, through the REAL shop.
 *
 * The shipped 死之王套裝 documents get their own file
 * (`sim/lichkingSet.test.ts`) so neither can pass by accident of the other —
 * CLAUDE.md 失敗形態 ⑤ 「被測的不是出貨的那個」.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY ASSERTION READS THE FINISHED STAT, NOT A SOURCE
 *
 * `stats.final[Stat.AbilityPower]`, folded by `recomputeStats` — the number the
 * sim fights with. A set that attached a source the pipeline ignores would pass
 * any source-shaped assertion and change nothing a player can feel (失敗形態 ②).
 * The one place a source is counted is 「只加一次」, and there the COUNT is the
 * defect being pinned, so the count is the honest assertion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND EVERY PATH IS DRIVEN THROUGH `economy/shop.ts`, never through
 * `syncItemSetSources` directly. `attachItemSource`/`detachItemSource` re-check
 * the set by reading `champ.items`, so they depend on the caller having written
 * the slot FIRST. Calling the sync function by hand would test the reconciler
 * and silently exempt that ordering contract — which is the half most likely to
 * break, because it is invisible in a signature.
 *
 * THE SIX THINGS THAT CAN SILENTLY BREAK, one describe() each:
 *   1. 2/3 pieces pays NOTHING and 3/3 pays.
 *   2. 只加一次 — three pieces, ONE source, +100 % and not +300 %.
 *   3. 賣掉就沒了, and 反悔就回來 (`undoShopAction`, task #121) — both directions.
 *   4. every ACQUISITION path arms it: buy / undo-of-a-sell / 三選一 free grant.
 *   5. the fields: requiredPieces / countDuplicates / enabled.
 *   6. the cross-document audit really finds a broken declaration.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import type { ChampionDef, ItemDef, ItemSetBonus } from "../content/defs";
import { Items, registerChampion } from "../content/registry";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { recomputeStats } from "../stats/statPipeline";
import { itemHasEffect } from "./itemTiers";
import {
  INVENTORY_SLOTS,
  buyItem,
  grantItemFree,
  sellItem,
  undoShopAction,
} from "./shop";
import { zItemSetBonus } from "../../content/schema/item";
import {
  ITEM_SET_MAX_PIECES,
  ITEM_SET_MIN_PIECES,
  activeItemSets,
  auditItemSets,
  itemSetSourceId,
  requiredPieces,
} from "./itemSets";

const Z0 = SKELETON_ARENA.zones[0]!;
const HOLDER = "set-holder" as ChampionId;

/** Base AP high enough that a percentage bonus is unmistakable in the total. */
const BASE_AP = 40;

const A = "set-piece-a" as ItemId;
const B = "set-piece-b" as ItemId;
const C = "set-piece-c" as ItemId;
/** Not in any set — the control that proves a bare item moves nothing. */
const PLAIN = "set-plain" as ItemId;
/** A 2-of-3 partial set + a duplicate-counting set + a disabled set. */
const P1 = "set-partial-1" as ItemId;
const P2 = "set-partial-2" as ItemId;
const P3 = "set-partial-3" as ItemId;
const D1 = "set-dup-1" as ItemId;
const D2 = "set-dup-2" as ItemId;
const OFF1 = "set-off-1" as ItemId;
const OFF2 = "set-off-2" as ItemId;

const TRIO = "trio" as const;
const SET_AP_PCT = 1.0;

function bonus(over: Partial<ItemSetBonus> & Pick<ItemSetBonus, "id" | "pieces">): ItemSetBonus {
  return {
    modifiers: [{ stat: Stat.AbilityPower, op: ModOp.PercentAdd, value: SET_AP_PCT }],
    ...over,
  };
}

function item(id: ItemId, sets?: ItemSetBonus[], cost = 0): ItemDef {
  return {
    id,
    name: `set item ${id}`,
    cost,
    tier: 1,
    tags: [],
    craftRole: "final",
    // A bare stat so the item is never payload-free for reasons unrelated to
    // the set; every assertion below measures a DELTA against the same baseline
    // inventory, so this row cancels out.
    modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 1 }],
    ...(sets ? { sets } : {}),
  };
}

function champ(): ChampionDef {
  return {
    ...THORNE,
    id: HOLDER,
    name: "set holder",
    baseStats: { ...THORNE.baseStats, [Stat.AbilityPower]: BASE_AP },
  };
}

beforeAll(() => {
  registerSkeletonContent();
  registerChampion(champ(), { overrideAbilities: true });

  const trio = bonus({ id: TRIO, name: "三件套", pieces: [A, B, C] });
  Items.register(A, item(A, [trio]));
  Items.register(B, item(B, [trio]));
  // C is PRICED so the gold-buy path is reachable with a real `buyItem`.
  Items.register(C, { ...item(C, [trio], 1200) });
  Items.register(PLAIN, item(PLAIN));

  const partial = bonus({ id: "partial", pieces: [P1, P2, P3], requiredPieces: 2 });
  for (const id of [P1, P2, P3]) Items.register(id, item(id, [partial]));

  const dup = bonus({ id: "dup", pieces: [D1, D2], requiredPieces: 2, countDuplicates: true });
  for (const id of [D1, D2]) Items.register(id, item(id, [dup]));

  const off = bonus({ id: "off", pieces: [OFF1, OFF2], enabled: false });
  for (const id of [OFF1, OFF2]) Items.register(id, item(id, [off]));
});

let seat = 0;
function spawn(world: SimWorld): EntityId {
  const s = seat++;
  return spawnChampion(world, {
    championId: HOLDER,
    seatId: asSeatId(s),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + 2 + s, z: Z0.center.z },
    zone: 0,
  });
}

const apOf = (world: SimWorld, id: EntityId): number => {
  recomputeStats(world, id);
  return world.stats.get(id)!.final[Stat.AbilityPower];
};

const setSources = (world: SimWorld, id: EntityId): string[] =>
  world.stats
    .get(id)!
    .sources.map((s) => s.id)
    .filter((s) => s.startsWith("item-set:"));

/** Grant `ids` through the 三選一 path and return the finished AP. */
function apHolding(world: SimWorld, ids: readonly ItemId[]): { id: EntityId; ap: number } {
  const id = spawn(world);
  for (const itemId of ids) expect(grantItemFree(world, id, itemId)).toBeGreaterThanOrEqual(0);
  return { id, ap: apOf(world, id) };
}

// ---------------------------------------------------------------------------
// 1. THE THRESHOLD
// ---------------------------------------------------------------------------

describe("湊不齊不給，湊齊了才給", () => {
  it("2 of 3 pieces pays NOTHING; the 3rd piece is what turns it on", () => {
    cover("item-set-threshold");
    const world = new SimWorld(SKELETON_ARENA, 3);
    const bare = apHolding(world, []);
    const two = apHolding(world, [A, B]);
    const three = apHolding(world, [A, B, C]);

    // the two-piece holder is byte-identical to the empty one on AP
    expect(two.ap).toBeCloseTo(bare.ap, 6);
    expect(setSources(world, two.id)).toEqual([]);

    // and the third piece is worth exactly +100 % of the bare AP
    expect(three.ap).toBeCloseTo(bare.ap * (1 + SET_AP_PCT), 6);
    expect(setSources(world, three.id)).toEqual([itemSetSourceId(TRIO)]);
    // sanity: the bonus is a real, visible number, not a rounding artefact
    expect(three.ap - two.ap).toBeGreaterThan(1);
  });

  it("holding three UNRELATED items pays nothing (the set, not the count)", () => {
    cover("item-set-threshold-unrelated");
    const world = new SimWorld(SKELETON_ARENA, 5);
    const bare = apHolding(world, []);
    const three = apHolding(world, [PLAIN, A, B]);
    expect(three.ap).toBeCloseTo(bare.ap, 6);
  });
});

// ---------------------------------------------------------------------------
// 2. 只加一次 — the +300 % trap
// ---------------------------------------------------------------------------

describe("三件到齊只加一次，不是每件加一次", () => {
  it("is ONE source and +100 %, never three sources and +300 %", () => {
    cover("item-set-no-double-count");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const bare = apHolding(world, []);
    const full = apHolding(world, [A, B, C]);

    expect(setSources(world, full.id).length).toBe(1);
    expect(full.ap).toBeCloseTo(bare.ap * 2, 6);
    // THE defect, stated as a number so the failure message names it
    expect(full.ap).not.toBeCloseTo(bare.ap * 4, 6);
  });

  it("re-equipping (sell + re-grant) does not accumulate a second source", () => {
    cover("item-set-no-source-leak");
    const world = new SimWorld(SKELETON_ARENA, 11);
    const bare = apHolding(world, []);
    const { id } = apHolding(world, [A, B, C]);
    for (let i = 0; i < 3; i++) {
      expect(sellItem(world, id, 2)).toBe(true);
      expect(grantItemFree(world, id, C)).toBeGreaterThanOrEqual(0);
    }
    expect(setSources(world, id).length).toBe(1);
    expect(apOf(world, id)).toBeCloseTo(bare.ap * 2, 6);
  });
});

// ---------------------------------------------------------------------------
// 3. REVOKE + UNDO
// ---------------------------------------------------------------------------

describe("賣掉就沒了，反悔就回來", () => {
  it("selling one piece revokes the whole bonus, and undo restores it", () => {
    cover("item-set-sell-undo");
    const world = new SimWorld(SKELETON_ARENA, 13);
    const bare = apHolding(world, []);
    const { id } = apHolding(world, [A, B, C]);
    const armed = apOf(world, id);
    expect(armed).toBeCloseTo(bare.ap * 2, 6);

    expect(sellItem(world, id, 1)).toBe(true); // drop B
    expect(apOf(world, id)).toBeCloseTo(bare.ap, 6);
    expect(setSources(world, id)).toEqual([]);

    expect(undoShopAction(world, id)).toBe("ok"); // task #121
    expect(apOf(world, id)).toBeCloseTo(armed, 6);
    expect(setSources(world, id)).toEqual([itemSetSourceId(TRIO)]);
  });

  it("undoing the BUY that completed the set revokes it again", () => {
    cover("item-set-undo-buy");
    const world = new SimWorld(SKELETON_ARENA, 17);
    const bare = apHolding(world, []);
    const { id } = apHolding(world, [A, B]);
    const champ = world.champion.get(id)!;
    champ.gold = 5000;
    world.weaponShelfOpen = true; // 武器貨架預設是關的 (#261)

    expect(buyItem(world, id, C)).toBe("ok");
    expect(apOf(world, id)).toBeCloseTo(bare.ap * 2, 6);

    expect(undoShopAction(world, id)).toBe("ok");
    expect(apOf(world, id)).toBeCloseTo(bare.ap, 6);
    expect(setSources(world, id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. EVERY ACQUISITION PATH
// ---------------------------------------------------------------------------

describe("每一條取得路徑都會重算 —— 買 / 反悔賣出 / 三選一", () => {
  /** The AP a full set produces, reached by three different routes. */
  function viaGrant(): number {
    const world = new SimWorld(SKELETON_ARENA, 19);
    return apHolding(world, [A, B, C]).ap;
  }
  function viaBuy(): number {
    const world = new SimWorld(SKELETON_ARENA, 19);
    const { id } = apHolding(world, [A, B]);
    world.champion.get(id)!.gold = 5000;
    world.weaponShelfOpen = true; // 武器貨架預設是關的 (#261)
    expect(buyItem(world, id, C)).toBe("ok");
    return apOf(world, id);
  }
  function viaUndoOfASell(): number {
    const world = new SimWorld(SKELETON_ARENA, 19);
    const { id } = apHolding(world, [A, B, C]);
    expect(sellItem(world, id, 0)).toBe(true);
    expect(undoShopAction(world, id)).toBe("ok");
    return apOf(world, id);
  }

  it("all three land on the SAME finished AP", () => {
    cover("item-set-all-attach-sites");
    const g = viaGrant();
    expect(viaBuy()).toBeCloseTo(g, 6);
    expect(viaUndoOfASell()).toBeCloseTo(g, 6);
    // and that number is really the bonus, not three matching zeroes
    const world = new SimWorld(SKELETON_ARENA, 19);
    expect(g).toBeCloseTo(apHolding(world, []).ap * 2, 6);
  });
});

// ---------------------------------------------------------------------------
// 5. THE FIELDS
// ---------------------------------------------------------------------------

describe("每一個決策都是欄位", () => {
  it("requiredPieces 2-of-3 pays at two pieces (default would need three)", () => {
    cover("item-set-required-pieces");
    const world = new SimWorld(SKELETON_ARENA, 23);
    const bare = apHolding(world, []);
    expect(apHolding(world, [P1]).ap).toBeCloseTo(bare.ap, 6);
    expect(apHolding(world, [P1, P2]).ap).toBeCloseTo(bare.ap * 2, 6);
    // and a third piece does NOT pay a second time
    expect(apHolding(world, [P1, P2, P3]).ap).toBeCloseTo(bare.ap * 2, 6);
    expect(requiredPieces(Items.get(P1).sets![0]!)).toBe(2);
  });

  it("countDuplicates false (the default) refuses two copies of one piece", () => {
    cover("item-set-count-duplicates");
    const world = new SimWorld(SKELETON_ARENA, 29);
    const bare = apHolding(world, []);
    // the TRIO set is default (distinct): A + A + A is still one piece
    expect(apHolding(world, [A, A, A]).ap).toBeCloseTo(bare.ap, 6);
    // the `dup` set opted in: D1 + D1 clears its requiredPieces 2
    expect(apHolding(world, [D1, D1]).ap).toBeCloseTo(bare.ap * 2, 6);
  });

  it("enabled:false keeps the doc but stops the payout", () => {
    cover("item-set-enabled");
    const world = new SimWorld(SKELETON_ARENA, 31);
    const bare = apHolding(world, []);
    const held = apHolding(world, [OFF1, OFF2]);
    expect(held.ap).toBeCloseTo(bare.ap, 6);
    expect(setSources(world, held.id)).toEqual([]);
    // …and the declaration is still there to switch back on
    expect(Items.get(OFF1).sets![0]!.pieces).toEqual([OFF1, OFF2]);
  });

  it("the piece-count ceiling equals the inventory size", () => {
    cover("item-set-bounds");
    // Restated rather than imported by shop.ts (that direction is a cycle), so
    // this is the guard that keeps the two numbers from drifting: widening the
    // backpack without widening the set ceiling would make a full-inventory set
    // unauthorable.
    expect(ITEM_SET_MAX_PIECES).toBe(INVENTORY_SLOTS);
    expect(ITEM_SET_MIN_PIECES).toBe(2);
  });

  it("an item whose ONLY payload is a set clause is not 'no-effect'", () => {
    cover("item-set-has-effect");
    // `itemHasEffect` takes a STRUCTURAL shape (it serves both ItemDoc and
    // ItemDef), so only the payload keys are passed.
    expect(itemHasEffect({ sets: [bonus({ id: "s", pieces: [A, B] })] })).toBe(true);
    expect(itemHasEffect({})).toBe(false);
    expect(itemHasEffect({ sets: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. THE AUDIT
// ---------------------------------------------------------------------------

describe("auditItemSets 真的抓得到壞掉的宣告", () => {
  const good = bonus({ id: "s", pieces: ["a" as ItemId, "b" as ItemId] });

  it("passes a well-formed pair", () => {
    cover("item-set-audit-clean");
    expect(auditItemSets([{ id: "a", sets: [good] }, { id: "b", sets: [good] }])).toEqual([]);
  });

  it("flags a piece that does not repeat the declaration", () => {
    const found = auditItemSets([{ id: "a", sets: [good] }, { id: "b" }]);
    expect(found.map((f) => f.itemId)).toContain("b");
  });

  it("flags a piece id with no document", () => {
    const orphan = bonus({ id: "s", pieces: ["a" as ItemId, "ghost" as ItemId] });
    const found = auditItemSets([{ id: "a", sets: [orphan] }]);
    expect(found.some((f) => f.message.includes("ghost"))).toBe(true);
  });

  it("flags a declaration whose terms differ between pieces", () => {
    const drifted: ItemSetBonus = { ...good, modifiers: [{ stat: Stat.AbilityPower, op: ModOp.PercentAdd, value: 0.5 }] };
    const found = auditItemSets([{ id: "a", sets: [good] }, { id: "b", sets: [drifted] }]);
    expect(found.some((f) => f.message.includes("DIFFERENT terms"))).toBe(true);
  });

  it("flags a document that is not a piece of the set it declares", () => {
    const found = auditItemSets([
      { id: "a", sets: [good] },
      { id: "b", sets: [good] },
      { id: "c", sets: [good] },
    ]);
    expect(found.some((f) => f.itemId === "c" && f.message.includes("not listed"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DETERMINISM — activeItemSets is order-stable
// ---------------------------------------------------------------------------

describe("順序穩定", () => {
  it("returns sets sorted by id regardless of which slot declared them", () => {
    cover("item-set-order");
    const forward = activeItemSets([A, B, C, P1, P2, null]).map((a) => a.setId);
    const reversed = activeItemSets([P2, P1, C, B, A, null]).map((a) => a.setId);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual([...forward].sort());
    expect(forward).toEqual(["partial", TRIO]);
  });
});

// ---------------------------------------------------------------------------
// THE SCHEMA BOUNDS — 「欄位要有上界，不是只有下界」
// ---------------------------------------------------------------------------

describe("item@1.sets 的上下界真的擋得住誤植", () => {
  const ok = {
    id: "s",
    pieces: ["a", "b", "c"],
    modifiers: [{ stat: "ap", op: "pctAdd", value: 1 }],
  };
  const parses = (over: Record<string, unknown>): boolean =>
    zItemSetBonus.safeParse({ ...ok, ...over }).success;

  it("accepts the shipped shape", () => {
    cover("item-set-schema-ok");
    expect(parses({})).toBe(true);
  });

  it("rejects a set larger than the backpack, and a 1-piece 'set'", () => {
    // 7 pieces can NEVER complete — the clause would be a permanent lie with
    // nothing at runtime to say so.
    expect(parses({ pieces: ["a", "b", "c", "d", "e", "f", "g"] })).toBe(false);
    expect(parses({ pieces: ["a"] })).toBe(false);
    expect(parses({ pieces: ["a", "b", "c", "d", "e", "f"] })).toBe(true);
  });

  it("rejects requiredPieces above the piece count (the 3 → 30 typo)", () => {
    expect(parses({ requiredPieces: 30 })).toBe(false);
    expect(parses({ requiredPieces: 4 })).toBe(false); // > pieces.length (3)
    expect(parses({ requiredPieces: 2 })).toBe(true);
    expect(parses({ requiredPieces: 2.5 })).toBe(false); // not an integer
  });

  it("rejects a duplicate piece id and an empty reward", () => {
    expect(parses({ pieces: ["a", "a", "b"] })).toBe(false);
    expect(parses({ modifiers: [] })).toBe(false);
  });

  it("rejects an unknown key (.strict) and an out-of-band modifier", () => {
    expect(parses({ requiresItems: ["a"] })).toBe(false);
    // ITEM_PERCENT_LIMIT is 3 — a 100 typed for 1.0 must not load
    expect(parses({ modifiers: [{ stat: "ap", op: "pctAdd", value: 100 }] })).toBe(false);
  });
});
