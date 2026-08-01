/**
 * 職業限定閘 ON A STATIC ITEM MODIFIER — 貫雷槍's 「[伸長] 近戰攻擊距離+4；
 * 遠戰攻擊距離+2」, i.e. ONE weapon whose STAT BLOCK depends on the body holding
 * it. The mechanism (this file) is tested on synthetic content; the SHIPPED doc
 * gets its own file (`sim/lanceGodieI01g.test.ts`) so neither can pass by
 * accident of the other.
 *
 * Every assertion here reads the FINISHED number the sim fights with —
 * `stats.final[range]` folded by `recomputeStats`, and `reachTo()`, the function
 * `BasicAttackSystem` and `OrderSystem` actually call — never the presence of a
 * modifier in an array. A gate that resolved into a source the pipeline ignores
 * would pass a source-shaped assertion and change nothing a player can feel
 * (CLAUDE.md 失敗形態 ②).
 *
 * THE FOUR THINGS THAT CAN SILENTLY BREAK, one describe() each:
 *
 *   1. THE GATE ITSELF — melee gets +4 and NOT +2; ranged gets +2 and NOT +4.
 *      Break `resolveGatedModifiers` → melee reads +6, which is a number no
 *      champion in the game is ever supposed to have.
 *   2. ALL THREE ATTACH SITES — buy / undo-of-a-sell / free grant. `shop.ts`'s
 *      own comment says a missed site 「is a bug that only shows up on the 三選一
 *      path」, and that path is `grantItemFree`, the one nothing else covers.
 *      The three are driven END TO END and compared to each other, so reverting
 *      ANY ONE of them to a hand-built `modifiers: def.modifiers` literal is red.
 *   3. 變身 — three shipped transform pairs cross the melee/ranged line, so an
 *      equip-time gate that is never re-resolved is wrong for the whole form.
 *   4. `onMismatch: "reduced"` — the scale really lands on the four magnitude
 *      ops, and really does NOT touch `override`/`capRaise` (documented, not
 *      accidental).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { Stat } from "../stats/statTypes";
import { ModOp, type StatModifier } from "../stats/modifiers";
import type { ChampionDef, ItemDef, ItemStatModifier } from "../content/defs";
import { Champions, Items, registerChampion } from "../content/registry";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { recomputeStats } from "../stats/statPipeline";
import { reachTo } from "../systems/BasicAttackSystem";
import { buyItem, grantItemFree, sellItem, undoShopAction } from "./shop";
import { itemSourceId, syncItemSources } from "./itemSource";
import { resolveGatedModifiers, scaleModifiers } from "../content/requirement";
import { applyChampionForm } from "../systems/ChampionFormSystem";

const Z0 = SKELETON_ARENA.zones[0]!;

const MELEE_ID = "gate-melee" as ChampionId;
const RANGED_ID = "gate-ranged" as ChampionId;
/** A melee body whose transform counterpart is a RANGED body (三對真的長這樣). */
const SHIFTER_ID = "gate-shifter" as ChampionId;

/** The two authored rows of 貫雷槍's [伸長], as content writes them. */
const LANCE_MELEE = 4;
const LANCE_RANGED = 2;
const BASE_RANGE = 1.6;

const LANCE_ID = "gate-lance" as ItemId;
/** Same weapon, no gate — the control that proves the harness sees +N at all. */
const PLAIN_ID = "gate-plain" as ItemId;

function champ(id: ChampionId, attackType: "melee" | "ranged", counterpart?: ChampionId): ChampionDef {
  return {
    ...THORNE,
    id,
    name: `gate ${id}`,
    attackType,
    baseStats: { ...THORNE.baseStats, [Stat.AttackRange]: BASE_RANGE },
    ...(counterpart !== undefined
      ? {
          transform: {
            role: "base" as const,
            counterpartId: counterpart,
            normalUnitRawcode: "H00X",
            alternateUnitRawcode: "H00Y",
            triggerAbility: { rawcode: "A000", name: "99-01 測試變身" },
          },
        }
      : {}),
  };
}

const gated = (value: number, attackType: "melee" | "ranged"): ItemStatModifier => ({
  stat: Stat.AttackRange,
  op: ModOp.Flat,
  value,
  requires: { attackType },
});

function item(id: ItemId, modifiers: ItemStatModifier[]): ItemDef {
  return { id, name: `gate item ${id}`, cost: 0, tier: 1, tags: [], modifiers };
}

beforeAll(() => {
  registerSkeletonContent();
  registerChampion(champ(MELEE_ID, "melee"), { overrideAbilities: true });
  registerChampion(champ(RANGED_ID, "ranged"), { overrideAbilities: true });
  registerChampion(champ(SHIFTER_ID, "melee", RANGED_ID), { overrideAbilities: true });
  // The counterpart has to be reachable as an `alternate` for `destinationFor`
  // to accept it; re-registering RANGED_ID with the alternate role would break
  // the plain ranged case, so the shifter points at its own dedicated body.
  registerChampion(
    { ...champ(RANGED_ID, "ranged"), id: `${RANGED_ID}-alt` as ChampionId },
    { overrideAbilities: true },
  );
  registerChampion(
    { ...champ(SHIFTER_ID, "melee", `${RANGED_ID}-alt` as ChampionId) },
    { overrideAbilities: true },
  );
  Items.register(LANCE_ID, item(LANCE_ID, [gated(LANCE_MELEE, "melee"), gated(LANCE_RANGED, "ranged")]));
  Items.register(PLAIN_ID, item(PLAIN_ID, [{ stat: Stat.AttackRange, op: ModOp.Flat, value: LANCE_MELEE }]));
});

let seat = 0;
function spawn(world: SimWorld, championId: ChampionId): EntityId {
  const s = seat++;
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(s),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + 2 + s, z: Z0.center.z },
    zone: 0,
  });
}

const rangeOf = (world: SimWorld, id: EntityId): number => world.stats.get(id)!.final[Stat.AttackRange];

/** `range` is scaled by combatEnv.attackRange, so compare DELTAS, never raws. */
function rangeGain(championId: ChampionId, itemId: ItemId): number {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const bare = spawn(world, championId);
  const armed = spawn(world, championId);
  recomputeStats(world, bare);
  expect(grantItemFree(world, armed, itemId)).toBeGreaterThanOrEqual(0);
  recomputeStats(world, armed);
  return rangeOf(world, armed) - rangeOf(world, bare);
}

// ---------------------------------------------------------------------------
// 1. THE GATE
// ---------------------------------------------------------------------------

describe("[伸長] — one weapon, a different stat block per body", () => {
  it("a MELEE holder gets the melee row and NOT the ranged one", () => {
    cover("item-gated-modifier-melee");
    const env = new SimWorld(SKELETON_ARENA, 1).combatEnv.attackRange;
    // +4·env, not +6·env (both rows) and not +2·env (the wrong row).
    expect(rangeGain(MELEE_ID, LANCE_ID)).toBeCloseTo(LANCE_MELEE * env, 6);
  });

  it("a RANGED holder gets the ranged row and NOT the melee one", () => {
    cover("item-gated-modifier-ranged");
    const env = new SimWorld(SKELETON_ARENA, 1).combatEnv.attackRange;
    expect(rangeGain(RANGED_ID, LANCE_ID)).toBeCloseTo(LANCE_RANGED * env, 6);
  });

  it("AN UNGATED MODIFIER IS UNTOUCHED — all 218 other item docs behave identically", () => {
    const env = new SimWorld(SKELETON_ARENA, 1).combatEnv.attackRange;
    expect(rangeGain(MELEE_ID, PLAIN_ID)).toBeCloseTo(LANCE_MELEE * env, 6);
    expect(rangeGain(RANGED_ID, PLAIN_ID)).toBeCloseTo(LANCE_MELEE * env, 6);
  });

  it("MOVES THE SWING GATE, not just a number: `reachTo` differs by body", () => {
    // reachTo() is what BasicAttackSystem gates the swing on and what
    // OrderSystem stops the chase at. Asserting `final[range]` alone would be
    // 失敗形態 ⑦ (掃屬性代替掃行為) — this is the consumer.
    const world = new SimWorld(SKELETON_ARENA, 3);
    const melee = spawn(world, MELEE_ID);
    const ranged = spawn(world, RANGED_ID);
    grantItemFree(world, melee, LANCE_ID);
    grantItemFree(world, ranged, LANCE_ID);
    recomputeStats(world, melee);
    recomputeStats(world, ranged);
    // Radii small enough that body contact never dominates the max().
    const rM = reachTo(world.stats.get(melee)!, 0.4, 0.4);
    const rR = reachTo(world.stats.get(ranged)!, 0.4, 0.4);
    expect(rM).toBeGreaterThan(rR);
    const env = world.combatEnv.attackRange;
    expect(rM - rR).toBeCloseTo((LANCE_MELEE - LANCE_RANGED) * env, 6);
  });

  it("STRIPS `requires` off the resolved source — no reader sees an unevaluated gate", () => {
    // Anti-⑤: `ModifierSource.modifiers` is read by recomputeStats, the digest,
    // the shop preview and the codex. A leftover `requires` key would make all
    // four look at a conditional object none of them evaluates.
    const world = new SimWorld(SKELETON_ARENA, 5);
    const melee = spawn(world, MELEE_ID);
    grantItemFree(world, melee, LANCE_ID);
    const src = world.stats.get(melee)!.sources.find((s) => s.id === itemSourceId(LANCE_ID, 0));
    expect(src).toBeDefined();
    expect(src!.modifiers).toEqual([{ stat: Stat.AttackRange, op: ModOp.Flat, value: LANCE_MELEE }]);
    for (const m of src!.modifiers!) expect(m).not.toHaveProperty("requires");
  });
});

// ---------------------------------------------------------------------------
// 2. ALL THREE ATTACH SITES
// ---------------------------------------------------------------------------

describe("every attach site resolves the gate — buy / undo-sell / free grant", () => {
  /** The resolved modifier list actually sitting on the champion, per site. */
  function resolvedVia(site: "buy" | "undo-sell" | "grant"): StatModifier[] | undefined {
    const world = new SimWorld(SKELETON_ARENA, 9);
    const hero = spawn(world, RANGED_ID); // RANGED: the row a melee-first bug misses
    const champ = world.champion.get(hero)!;
    let slot = 0;
    if (site === "grant") {
      slot = grantItemFree(world, hero, LANCE_ID);
    } else {
      // buyItem refuses a 0g / non-final item on purpose, so the priced clone
      // below is what the gold path is exercised with. Same def shape.
      Items.register(`${LANCE_ID}-buy` as ItemId, {
        ...item(`${LANCE_ID}-buy` as ItemId, [
          gated(LANCE_MELEE, "melee"),
          gated(LANCE_RANGED, "ranged"),
        ]),
        cost: 100,
        craftRole: "final",
      });
      champ.gold = 1000;
      world.weaponShelfOpen = true; // #261 暫時下架 — irrelevant to the gate
      expect(buyItem(world, hero, `${LANCE_ID}-buy` as ItemId)).toBe("ok");
      slot = 0;
      if (site === "undo-sell") {
        // buy → commit → sell → undo. The undo is the SECOND attach site.
        champ.undoStack.length = 0;
        expect(sellItem(world, hero, slot)).toBe(true);
        expect(undoShopAction(world, hero)).toBe("ok");
      }
      const boughtId = `${LANCE_ID}-buy` as ItemId;
      return world.stats.get(hero)!.sources.find((s) => s.id === itemSourceId(boughtId, slot))
        ?.modifiers;
    }
    return world.stats.get(hero)!.sources.find((s) => s.id === itemSourceId(LANCE_ID, slot))
      ?.modifiers;
  }

  it("all three produce the SAME gate-resolved list for the same champion", () => {
    cover("item-gated-modifier-three-sites");
    const expected = [{ stat: Stat.AttackRange, op: ModOp.Flat, value: LANCE_RANGED }];
    // Each is asserted SEPARATELY (not just "all equal"), so a message names the
    // site that regressed rather than saying "two of three disagree".
    expect(resolvedVia("buy"), "buyItem site").toEqual(expected);
    expect(resolvedVia("undo-sell"), "undoShopAction site").toEqual(expected);
    expect(resolvedVia("grant"), "grantItemFree (三選一/gacha) site").toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// 3. 變身
// ---------------------------------------------------------------------------

describe("變身 re-resolves the gate — the weapon follows the BODY, not the purchase", () => {
  it("a melee holder who transforms into a ranged body loses the melee row", () => {
    cover("item-gated-modifier-transform");
    const world = new SimWorld(SKELETON_ARENA, 13);
    const hero = spawn(world, SHIFTER_ID);
    grantItemFree(world, hero, LANCE_ID);
    recomputeStats(world, hero);
    const srcOf = (): StatModifier[] | undefined =>
      world.stats.get(hero)!.sources.find((s) => s.id === itemSourceId(LANCE_ID, 0))?.modifiers;

    expect(srcOf()).toEqual([{ stat: Stat.AttackRange, op: ModOp.Flat, value: LANCE_MELEE }]);

    expect(
      applyChampionForm(world, hero, "alternate", undefined, { origin: "test" }),
    ).toBe(true);
    expect(Champions.get(world.champion.get(hero)!.championId).attackType).toBe("ranged");
    // THE POINT: without `syncItemSources` in `setBody` this still reads 4.
    expect(srcOf()).toEqual([{ stat: Stat.AttackRange, op: ModOp.Flat, value: LANCE_RANGED }]);

    recomputeStats(world, hero);
    expect(applyChampionForm(world, hero, "base", undefined, { origin: "test" })).toBe(true);
    expect(srcOf()).toEqual([{ stat: Stat.AttackRange, op: ModOp.Flat, value: LANCE_MELEE }]);
  });

  it("the re-sync is IN PLACE — item hook cooldown bookkeeping survives a transform", () => {
    // Detach+reattach would reset `hookLastFired`, i.e. transforming would
    // refresh every on-hit weapon's internal cooldown. That is a free double
    // proc and nothing else in the suite would notice.
    const world = new SimWorld(SKELETON_ARENA, 17);
    const hero = spawn(world, SHIFTER_ID);
    grantItemFree(world, hero, LANCE_ID);
    const src = world.stats.get(hero)!.sources.find((s) => s.id === itemSourceId(LANCE_ID, 0))!;
    src.hookLastFired = [123];
    syncItemSources(world, hero);
    const after = world.stats.get(hero)!.sources.find((s) => s.id === itemSourceId(LANCE_ID, 0))!;
    expect(after).toBe(src); // same OBJECT, not a replacement
    expect(after.hookLastFired).toEqual([123]);
  });
});

// ---------------------------------------------------------------------------
// 4. onMismatch: "reduced"
// ---------------------------------------------------------------------------

describe('onMismatch "reduced" — the penalty knob really scales, and only what it can', () => {
  const world = (): SimWorld => new SimWorld(SKELETON_ARENA, 21);

  it("halves flat / pctAdd / pctMult / percentOf for a carrier who does not qualify", () => {
    cover("item-gated-modifier-reduced");
    const w = world();
    const ranged = spawn(w, RANGED_ID);
    const mods: ItemStatModifier[] = [
      { stat: Stat.AttackRange, op: ModOp.Flat, value: 4, requires: { attackType: "melee", onMismatch: "reduced" } },
      { stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 0.4, requires: { attackType: "melee", onMismatch: "reduced" } },
      { stat: Stat.MaxHealth, op: ModOp.PercentMult, value: 0.3, requires: { attackType: "melee", onMismatch: "reduced" } },
      { stat: Stat.Armor, op: ModOp.PercentOf, value: 0.5, from: Stat.AttackDamage, requires: { attackType: "melee", onMismatch: "reduced" } },
    ];
    expect(resolveGatedModifiers(w, ranged, mods)).toEqual([
      { stat: Stat.AttackRange, op: ModOp.Flat, value: 2 },
      { stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 0.2 },
      { stat: Stat.MaxHealth, op: ModOp.PercentMult, value: 0.15 },
      { stat: Stat.Armor, op: ModOp.PercentOf, value: 0.25, from: Stat.AttackDamage },
    ]);
  });

  it("honours an authored mismatchScale, and BLOCKS by default", () => {
    const w = world();
    const ranged = spawn(w, RANGED_ID);
    expect(
      resolveGatedModifiers(w, ranged, [
        { stat: Stat.AttackRange, op: ModOp.Flat, value: 4, requires: { attackType: "melee", onMismatch: "reduced", mismatchScale: 0.25 } },
      ]),
    ).toEqual([{ stat: Stat.AttackRange, op: ModOp.Flat, value: 1 }]);
    // absent onMismatch == "block" == dropped entirely
    expect(
      resolveGatedModifiers(w, ranged, [
        { stat: Stat.AttackRange, op: ModOp.Flat, value: 4, requires: { attackType: "melee" } },
      ]),
    ).toEqual([]);
  });

  it("passes `override` and `capRaise` through UNCHANGED — documented, not accidental", () => {
    // scaleModifiers refuses these on purpose: half an override is a DIFFERENT
    // override (possibly a buff), and capRaise's value is a target ceiling, not
    // a grant. This asserts the documented consequence so nobody "fixes" it
    // silently in either direction.
    expect(
      scaleModifiers(
        [
          { stat: Stat.MoveSpeed, op: ModOp.Override, value: 6 },
          { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 10 },
        ],
        0.5,
      ),
    ).toEqual([
      { stat: Stat.MoveSpeed, op: ModOp.Override, value: 6 },
      { stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: 10 },
    ]);
  });

  it("never mutates the authored array — the doc is shared by every carrier", () => {
    const authored: StatModifier[] = [{ stat: Stat.AttackRange, op: ModOp.Flat, value: 4 }];
    scaleModifiers(authored, 0.5);
    expect(authored[0]!.value).toBe(4);
  });
});
