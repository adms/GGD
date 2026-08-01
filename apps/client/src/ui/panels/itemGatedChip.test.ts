/**
 * THE SHOP CARD MUST NOT LIE ABOUT A GATED MODIFIER (#106 「a live stat preview
 * that must not lie」).
 *
 * 貫雷槍 carries TWO rows on one stat — `range +4 (melee)` and `range +2
 * (ranged)` — and there are exactly two ways a card can be wrong about that:
 *
 *   ① MERGE THEM. `mergeItemModifiers` sums entries that share (stat, op), so
 *      before the requirement joined the key it printed 「攻擊距離 +6」 — a
 *      number no champion in the game ever receives, on a card that looks
 *      completely plausible (CLAUDE.md 失敗形態 ④).
 *   ② PRINT BOTH BARE. Two chips reading 「攻擊距離 +4」 / 「攻擊距離 +2」 with
 *      nothing to tell them apart is not a card, it is a riddle.
 *
 * And the PANEL half: `previewItem` reconstructs a real SimWorld and runs the
 * real pipeline, so it must hand a ranged hero +2 and a melee hero +4 — which it
 * only does because it builds the source through the shared
 * `attachItemSource`, not a hand-written literal.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { registerChampion, Champions, Items } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import type { ChampionDef, ItemDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId, ItemId } from "@ggd/shared/ids";
import { mergeItemModifiers, formatAuthoredBonus, buildItemRow, type RowItem } from "./itemStats";
import { previewItem, type ChampionStatContext } from "./statPreview";

const LANCE = "chip-lance" as ItemId;
const MELEE = "chip-melee" as ChampionId;
const RANGED = "chip-ranged" as ChampionId;
const MELEE_BONUS = 4;
const RANGED_BONUS = 2;

const LANCE_DEF: ItemDef = {
  id: LANCE,
  name: "貫雷槍(測試)",
  cost: 300,
  tier: 1,
  tags: [],
  craftRole: "final",
  modifiers: [
    { stat: Stat.AttackRange, op: ModOp.Flat, value: MELEE_BONUS, requires: { attackType: "melee" } },
    { stat: Stat.AttackRange, op: ModOp.Flat, value: RANGED_BONUS, requires: { attackType: "ranged" } },
  ],
};

beforeAll(() => {
  registerSkeletonContent();
  const base = Champions.get("thorne" as ChampionId);
  const champ = (id: ChampionId, attackType: "melee" | "ranged"): ChampionDef => ({
    ...base,
    id,
    name: `chip ${id}`,
    attackType,
  });
  registerChampion(champ(MELEE, "melee"), { overrideAbilities: true });
  registerChampion(champ(RANGED, "ranged"), { overrideAbilities: true });
  Items.register(LANCE, LANCE_DEF);
});

describe("gated modifiers on the shop card", () => {
  it("does NOT merge two differently-gated rows into one impossible number", () => {
    cover("item-gated-chip-no-merge");
    const merged = mergeItemModifiers(LANCE_DEF.modifiers);
    expect(merged.length).toBe(2);
    expect(merged.map((m) => m.value).sort((a, b) => a - b)).toEqual([RANGED_BONUS, MELEE_BONUS]);
    // the +6 that a (stat, op)-only key produced
    expect(merged.some((m) => m.value === MELEE_BONUS + RANGED_BONUS)).toBe(false);
  });

  it("still merges IDENTICALLY-gated rows — the #83 doubled-array fix survives", () => {
    // 13 catalogue items list a stat twice and the pipeline SUMS them. Splitting
    // those into two chips would be a regression dressed up as this feature.
    const merged = mergeItemModifiers([
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 18 },
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 10.8 },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.value).toBeCloseTo(28.8, 6);
  });

  it("names the gate ON THE CHIP, derived from the same object the sim reads", () => {
    cover("item-gated-chip-label");
    const merged = mergeItemModifiers(LANCE_DEF.modifiers);
    const texts = merged.map(formatAuthoredBonus);
    expect(texts).toContain(`攻擊距離 +${MELEE_BONUS}（近戰）`);
    expect(texts).toContain(`攻擊距離 +${RANGED_BONUS}（遠程）`);
    // ungated stays exactly as it always read — no stray empty parentheses
    expect(formatAuthoredBonus({ stat: Stat.AttackDamage, op: ModOp.Flat, value: 28.8 })).toBe(
      "攻擊力 +28.8",
    );
  });

  it("does NOT put 「限近戰」/「限遠程」 in the card's ✦ requirement line", () => {
    // A modifier gate answers 「這一條給誰」, not 「這件武器給誰」. Promoting it to
    // the card badge would print two contradictory sentences on a weapon that
    // gives everybody something.
    const row = buildItemRow(LANCE_DEF as unknown as RowItem, null);
    expect(row.requirements).toEqual([]);
  });
});

describe("the stat PREVIEW resolves the gate against the viewing champion", () => {
  const ctx = (championId: ChampionId): ChampionStatContext => ({
    championId,
    level: 1,
    abilityRanks: [1, 0, 0, 0],
    items: [],
    augments: [],
    statCapstonePct: 0,
    attrBonus: undefined,
  });

  it("shows a melee hero +4 range and a ranged hero +2 — never both", () => {
    cover("item-gated-preview");
    const melee = previewItem(ctx(MELEE), LANCE);
    const ranged = previewItem(ctx(RANGED), LANCE);
    expect(melee?.buyable).toBe(true);
    expect(ranged?.buyable).toBe(true);
    const dm = melee!.deltas[Stat.AttackRange] ?? 0;
    const dr = ranged!.deltas[Stat.AttackRange] ?? 0;
    expect(dm).toBeGreaterThan(0);
    expect(dr).toBeGreaterThan(0);
    // env-scaled, so compare the RATIO rather than restating the multiplier
    expect(dm / dr).toBeCloseTo(MELEE_BONUS / RANGED_BONUS, 6);
  });
});
