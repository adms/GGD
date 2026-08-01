/**
 * 死之王套裝 — THE SHIPPED DOCS, driven through the real sim.
 *
 * owner authored the SAME clause on three legendaries, and the prose IS the spec:
 *
 *   「額外 [死之王套裝] 同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%」
 *      死之王的長槍 godie-i01d · 死之王的意志 godie-i060 · 死之王的神盾 godie-i061
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `economy/itemSets.test.ts`. That one
 * proves the MECHANISM on synthetic content. This one proves the SHIPPED
 * DOCUMENTS use it — CLAUDE.md 失敗形態 ⑤ 「被測的不是出貨的那個」, which in this
 * repo has already shipped once as a test that hand-wrote flags the real
 * snapshot never sets. Every assertion below reads
 * `content/items/godie-i0*.json` through the same registry the game reads.
 *
 * WHAT IS ASSERTED, AND AGAINST WHICH CONSUMER — never a property:
 *   the threshold  → `stats.final[ap]` on a REAL champion, folded by
 *                    `recomputeStats`, after the pieces are acquired through the
 *                    real `grantItemFree` (the 三選一 path these 0-gold
 *                    legendaries are actually handed out on).
 *   「只加一次」    → the same number, compared against ×2 AND against ×4, so the
 *                    naive per-piece implementation is named by the failure.
 *   the whole tree → `auditItemSets` over EVERY shipped item doc, so a fourth
 *                    piece added to only two of the three files is red.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Items } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { grantItemFree, sellItem, undoShopAction } from "./economy/shop";
import { recomputeStats } from "./stats/statPipeline";
import { auditItemSets, itemSetSourceId, requiredPieces } from "./economy/itemSets";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import type { ItemDef } from "./content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

/** The three pieces, and the set id they all declare. */
const SPEAR = "godie-i01d" as ItemId;
const WILL = "godie-i060" as ItemId;
const AEGIS = "godie-i061" as ItemId;
const PIECES = [SPEAR, WILL, AEGIS] as const;
const SET_ID = "godie-set-lichking";
/** 「總 AP 額外 + 100%」 — the number owner wrote, restated so a doc edit is visible. */
const SET_AP_PCT = 1.0;

/**
 * 惡夢魔王碎片 — a DIFFERENT legendary carrying its own 「總 AP 額外 + 100%」 as a
 * plain modifier. It is here because the two stack additively and somebody will
 * eventually ask what the total is; the assertion reads BOTH numbers off the
 * shipped docs rather than hard-coding 200 %, so a re-tune of either side stays
 * green while an accidental MULTIPLICATIVE stack goes red.
 */
const NIGHTMARE = "godie-i067" as ItemId;

/** 黑魔導士 - 莉娜因巴斯: the highest-INT hero on the roster, so AP is large. */
const MAGE = "godie-h020" as ChampionId;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "items"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

let seat = 0;
function spawn(world: SimWorld): EntityId {
  const s = seat++;
  return spawnChampion(world, {
    championId: MAGE,
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

function holding(world: SimWorld, ids: readonly ItemId[]): { id: EntityId; ap: number } {
  const id = spawn(world);
  for (const itemId of ids) expect(grantItemFree(world, id, itemId)).toBeGreaterThanOrEqual(0);
  return { id, ap: apOf(world, id) };
}

const setSources = (world: SimWorld, id: EntityId): string[] =>
  world.stats
    .get(id)!
    .sources.map((s) => s.id)
    .filter((s) => s.startsWith("item-set:"));

// ---------------------------------------------------------------------------
// THE DOCUMENTS
// ---------------------------------------------------------------------------

describe("死之王套裝 — the three shipped docs", () => {
  it("all three declare the SAME set, listing all three pieces, worth ap pctAdd 1.0", () => {
    // Names the files to edit. The behaviour assertions below are the real
    // guards — this one exists so a failure says WHERE, not just WHAT.
    cover("lichking-set-doc");
    for (const id of PIECES) {
      const def: ItemDef = Items.get(id);
      const sets = def.sets ?? [];
      expect(sets.length, `${id} declares no set`).toBe(1);
      const s = sets[0]!;
      expect(s.id).toBe(SET_ID);
      expect([...s.pieces].sort()).toEqual([...PIECES].sort());
      // absent requiredPieces = ALL of them, which is what 「同時裝備」 says
      expect(requiredPieces(s)).toBe(3);
      expect(s.modifiers).toEqual([
        { stat: Stat.AbilityPower, op: ModOp.PercentAdd, value: SET_AP_PCT },
      ]);
    }
  });

  it("every clause the prose promises is still IN the prose (nobody edited the card)", () => {
    // The description is owner's authored text and `legendary49OwnerText.test.ts`
    // pins it byte-for-byte. This assertion is the narrower one that belongs
    // here: the DATA below is only correct if the CARD still says it.
    // ⚠️ Read off the RAW DOC, not `Items.get()`: the runtime `ItemDef` drops
    // `description` (it is display metadata the sim never consumes), so a
    // registry read here would be `undefined ?? ""` — an assertion that passes
    // on an empty string, i.e. a guard that guards nothing.
    const byId = new Map(docs("items").map((d) => [d.id as string, d]));
    for (const id of PIECES) {
      const text = (byId.get(id)?.description ?? "") as string;
      expect(text, id).toContain("[死之王套裝]");
      expect(text, id).toContain("總 AP 額外 + 100%");
    }
  });
});

// ---------------------------------------------------------------------------
// THE BEHAVIOUR, ON A REAL CHAMPION
// ---------------------------------------------------------------------------

describe("死之王套裝 — 同時裝備三件才給，而且只給一次", () => {
  it("2 pieces = nothing, 3 pieces = +100 % of the champion's real AP", () => {
    cover("lichking-set-threshold");
    const world = new SimWorld(SKELETON_ARENA, 41);
    const bare = holding(world, []);
    // the whole test is vacuous if this hero has no AP to double
    expect(bare.ap).toBeGreaterThan(1);

    const two = holding(world, [SPEAR, WILL]);
    expect(two.ap).toBeCloseTo(bare.ap, 6);
    expect(setSources(world, two.id)).toEqual([]);

    const three = holding(world, [SPEAR, WILL, AEGIS]);
    expect(three.ap).toBeCloseTo(bare.ap * (1 + SET_AP_PCT), 6);
    expect(setSources(world, three.id)).toEqual([itemSetSourceId(SET_ID)]);
  });

  it("pays ONCE, not once per piece (+100 %, never +300 %)", () => {
    cover("lichking-set-single-payout");
    const world = new SimWorld(SKELETON_ARENA, 43);
    const bare = holding(world, []);
    const full = holding(world, PIECES);
    expect(full.ap).toBeCloseTo(bare.ap * 2, 6);
    expect(full.ap).not.toBeCloseTo(bare.ap * 4, 6);
    expect(setSources(world, full.id).length).toBe(1);
  });

  it("selling any one piece revokes it; undoing the sell brings it back", () => {
    cover("lichking-set-revoke");
    const world = new SimWorld(SKELETON_ARENA, 47);
    const bare = holding(world, []);
    for (let slot = 0; slot < PIECES.length; slot++) {
      const { id } = holding(world, PIECES);
      const armed = apOf(world, id);
      expect(armed).toBeCloseTo(bare.ap * 2, 6);

      expect(sellItem(world, id, slot)).toBe(true);
      expect(apOf(world, id), `selling slot ${slot} must revoke`).toBeCloseTo(bare.ap, 6);

      expect(undoShopAction(world, id)).toBe("ok");
      expect(apOf(world, id), `undoing slot ${slot} must restore`).toBeCloseTo(armed, 6);
    }
  });

  it("stacks ADDITIVELY with 惡夢魔王碎片's own 「總 AP 額外 + 100%」", () => {
    cover("lichking-set-stack");
    const world = new SimWorld(SKELETON_ARENA, 53);
    const bare = holding(world, []);
    // read the sibling's number off the shipped doc rather than assuming 1.0
    const nightmareAp = (Items.get(NIGHTMARE).modifiers ?? [])
      .filter((m) => m.stat === Stat.AbilityPower && m.op === ModOp.PercentAdd)
      .reduce((s, m) => s + m.value, 0);
    expect(nightmareAp).toBeGreaterThan(0);

    const both = holding(world, [...PIECES, NIGHTMARE]);
    // pctAdd is ONE summed bracket: final = base · (1 + Σ pctAdd)
    expect(both.ap).toBeCloseTo(bare.ap * (1 + SET_AP_PCT + nightmareAp), 6);
    // and NOT the multiplicative reading, which is the drift that would matter
    expect(both.ap).not.toBeCloseTo(bare.ap * (1 + SET_AP_PCT) * (1 + nightmareAp), 6);
  });
});

// ---------------------------------------------------------------------------
// THE WHOLE TREE
// ---------------------------------------------------------------------------

describe("每一份出貨道具文件的套裝宣告都自洽", () => {
  it("auditItemSets finds nothing wrong across all shipped items", () => {
    cover("lichking-set-audit");
    const all = Items.all();
    expect(all.length).toBeGreaterThan(200); // the walk really saw the tree
    expect(auditItemSets(all)).toEqual([]);
    // …and the audit is looking at a tree that really contains a set
    expect(all.filter((d) => (d.sets?.length ?? 0) > 0).map((d) => d.id).sort()).toEqual(
      [...PIECES].sort(),
    );
  });
});
