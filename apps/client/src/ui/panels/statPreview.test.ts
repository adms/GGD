/**
 * The blunt acceptance test for #106's preview: PREDICT the delta, BUY the item
 * in a real SimWorld, READ the actual stat, confirm they are equal — for a flat
 * item, a percentage item, an item that trips a clamp, an item bought on top of
 * others, under a non-neutral combat-env, and the slot-full refusal. Plus the
 * reconstruction-parity test: a champion built up with ranks + items + augment +
 * capstone reconstructs, from its SeatView-shaped fields alone, to the exact
 * stat block the sim holds. If the preview and the sim ever drift, one of these
 * fails.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { registerChampion, Champions, Items } from "@ggd/shared/sim/content/registry";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { syncAbilityPassives } from "@ggd/shared/sim/abilities/abilityPassives";
import { recomputeStats } from "@ggd/shared/sim/stats/statPipeline";
import { buyItem } from "@ggd/shared/sim/economy/shop";
import { applyAugmentPick } from "@ggd/shared/sim/economy/draft";
import { grantCapstone } from "@ggd/shared/sim/economy/statPath";
import { ALL_STATS, Stat, type StatBlock } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { AbilityDef, ChampionDef, ItemDef } from "@ggd/shared/sim/content/defs";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type AugmentId,
  type ChampionId,
  type EntityId,
  type ItemId,
} from "@ggd/shared/ids";
import {
  computeStatBlock,
  previewItem,
  previewExactness,
  type ChampionStatContext,
} from "./statPreview";

// Purpose-built catalogue items with known modifiers (cost>0 + effect so the
// real buyItem path accepts them).
const TEST_ITEMS: ItemDef[] = [
  { id: "tp-flat-ad" as ItemId, name: "TP Flat AD", cost: 300, tier: 1, modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 40 }], tags: [] },
  { id: "tp-pct-as" as ItemId, name: "TP Pct AS", cost: 300, tier: 1, modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 0.5 }], tags: [] },
  { id: "tp-pct-ad" as ItemId, name: "TP Pct AD", cost: 300, tier: 1, modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.5 }], tags: [] },
  { id: "tp-ms-huge" as ItemId, name: "TP MS Huge", cost: 300, tier: 1, modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.Flat, value: 100 }], tags: [] },
  { id: "tp-as-huge" as ItemId, name: "TP AS Huge", cost: 300, tier: 1, modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 10 }], tags: [] },
  { id: "tp-hp" as ItemId, name: "TP HP", cost: 300, tier: 1, modifiers: [{ stat: Stat.MaxHealth, op: ModOp.Flat, value: 300 }], tags: [] },
];

/** A custom hero whose W ability carries a rank-indexed stat passive. */
const CUSTOM_HERO_ID = "tp-hero" as ChampionId;

beforeAll(() => {
  registerSkeletonContent();
  for (const it of TEST_ITEMS) Items.register(it.id, it);

  const base = Champions.get("thorne" as ChampionId);
  const withPassive = (a: AbilityDef, id: string, passive?: AbilityDef["passive"]): AbilityDef => ({
    ...a,
    id: id as AbilityId,
    ...(passive ? { passive } : {}),
  });
  const custom: ChampionDef = {
    ...base,
    id: CUSTOM_HERO_ID,
    name: "TP Hero",
    abilities: {
      Q: withPassive(base.abilities.Q, "tp-hero.q"),
      W: withPassive(base.abilities.W, "tp-hero.w", {
        name: "TP Passive",
        ranks: [
          { modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 10 }] },
          { modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 22 }] },
        ],
      }),
      E: withPassive(base.abilities.E, "tp-hero.e"),
      R: withPassive(base.abilities.R, "tp-hero.r"),
    },
  };
  registerChampion(custom);
});

const CENTER = SKELETON_ARENA.zones[0]!.center;

function spawnHero(world: SimWorld, championId = "thorne", level = 6): EntityId {
  const id = spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: CENTER.x, z: CENTER.z },
    zone: 0,
    level,
  });
  world.champion.get(id)!.gold = 100_000;
  return id;
}

function copyBlock(b: StatBlock): StatBlock {
  const out = {} as StatBlock;
  for (const s of ALL_STATS) out[s] = b[s];
  return out;
}

/** Reconstruct the SeatView-shaped context straight off the sim world. */
function ctxFromWorld(world: SimWorld, id: EntityId, env?: CombatEnvMultipliers): ChampionStatContext {
  const champ = world.champion.get(id)!;
  const ab = world.abilities.get(id)!;
  return {
    championId: champ.championId,
    level: champ.level,
    abilityRanks: [ab.slots.Q.rank, ab.slots.W.rank, ab.slots.E.rank, ab.slots.R.rank],
    exAbilityId: ab.exSlot?.abilityId ?? "",
    exRank: ab.exSlot?.rank ?? 0,
    items: champ.items.map((i) => i ?? ""),
    augments: [...champ.augments],
    statCapstonePct: champ.statCapstonePct,
    env,
  };
}

/** Predict via the preview, then actually buy — return both, plus the baseline. */
function predictThenBuy(world: SimWorld, id: EntityId, itemId: string, env?: CombatEnvMultipliers) {
  const before = copyBlock(world.stats.get(id)!.final);
  const preview = previewItem(ctxFromWorld(world, id, env), itemId)!;
  const result = buyItem(world, id, itemId as ItemId);
  recomputeStats(world, id);
  const after = copyBlock(world.stats.get(id)!.final);
  return { before, preview, result, after };
}

/** Assert the predicted block equals the sim block for every stat. */
function expectBlocksEqual(predicted: StatBlock, actual: StatBlock): void {
  for (const s of ALL_STATS) expect(predicted[s]).toBeCloseTo(actual[s], 6);
}

describe("statPreview — predict, buy, confirm equal", () => {
  it("a FLAT item: delta is the flat value, and after matches the sim (sp-01)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    const { before, preview, result, after } = predictThenBuy(world, id, "tp-flat-ad");

    expect(result).toBe("ok");
    expectBlocksEqual(preview.after, after);
    expect(preview.deltas[Stat.AttackDamage]).toBeCloseTo(40, 6);
    expect(after[Stat.AttackDamage] - before[Stat.AttackDamage]).toBeCloseTo(40, 6);
  });

  it("a PERCENTAGE item: delta scales off the champion's base, not the raw value (sp-02)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    const { before, preview, after } = predictThenBuy(world, id, "tp-pct-as");

    // +50% AS on a champ with base AS ~0.5 is +~0.25, NOT +0.5 (the raw modifier)
    const expectedDelta = before[Stat.AttackSpeed] * 0.5;
    expect(preview.deltas[Stat.AttackSpeed]).toBeCloseTo(expectedDelta, 6);
    expect(preview.deltas[Stat.AttackSpeed]).not.toBeCloseTo(0.5, 3);
    expectBlocksEqual(preview.after, after);
  });

  it("an item that TRIPS A CLAMP: after is the clamp, not base+raw (sp-03)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    const ms = predictThenBuy(world, id, "tp-ms-huge");
    expect(ms.after[Stat.MoveSpeed]).toBeCloseTo(14, 6); // MS clamp [2,14]
    expect(ms.preview.after[Stat.MoveSpeed]).toBeCloseTo(14, 6);
    // the honest delta is far below the raw +100
    expect(ms.preview.deltas[Stat.MoveSpeed]!).toBeLessThan(14);

    const world2 = new SimWorld(SKELETON_ARENA, 1);
    const id2 = spawnHero(world2);
    const as = predictThenBuy(world2, id2, "tp-as-huge");
    expect(as.after[Stat.AttackSpeed]).toBeCloseTo(2.5, 6); // AS clamp [0.2,2.5]
    expectBlocksEqual(as.preview.after, as.after);
  });

  it("an item bought ON TOP of existing items: the pct scales the owned build (sp-04)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    // own a flat-AD item first
    buyItem(world, id, "tp-flat-ad" as ItemId);
    recomputeStats(world, id);
    const adWithItem = world.stats.get(id)!.final[Stat.AttackDamage];

    const { preview, after } = predictThenBuy(world, id, "tp-pct-ad");
    // +50% AD must scale the CURRENT ad (base+40), so delta ≈ 0.5 * adWithItem
    expect(preview.deltas[Stat.AttackDamage]).toBeCloseTo(0.5 * adWithItem, 6);
    expectBlocksEqual(preview.after, after);
  });

  it("honours a non-neutral combat-env (sp-05)", () => {
    cover("shop-stat-preview");
    const env = normalizeCombatEnv({ attackDamage: 1.5 });
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatEnv = env;
    const id = spawnHero(world);
    const { preview, after } = predictThenBuy(world, id, "tp-flat-ad", env);
    // +40 AD under a ×1.5 env is +60 to the final, and the preview knows it
    expect(preview.deltas[Stat.AttackDamage]).toBeCloseTo(60, 6);
    expectBlocksEqual(preview.after, after);
  });

  it("refuses when the inventory is full — same as the sim (sp-06)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    for (let i = 0; i < 6; i++) {
      expect(buyItem(world, id, "tp-hp" as ItemId)).toBe("ok");
    }
    recomputeStats(world, id);
    const preview = previewItem(ctxFromWorld(world, id), "tp-flat-ad")!;
    expect(preview.buyable).toBe(false);
    expect(preview.reason).toBe("slot-full");
    expect(buyItem(world, id, "tp-flat-ad" as ItemId)).toBe("no-slot");
  });
});

describe("statPreview — reconstruction parity", () => {
  it("rebuilds the exact sim block from SeatView fields: ranks + items + augment + capstone (sp-07)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world, CUSTOM_HERO_ID, 8);

    // rank the W passive to 2 (ad +22), as the sim does on rank-up
    const ab = world.abilities.get(id)!;
    ab.slots.W.rank = 2;
    ab.slots.E.rank = 3;
    syncAbilityPassives(world, id);

    // buy a couple of items
    buyItem(world, id, "tp-flat-ad" as ItemId);
    buyItem(world, id, "tp-pct-as" as ItemId);
    // pick an augment with pctAdd + flat (bloodlust: +15% ad, +8% lifesteal)
    applyAugmentPick(
      world,
      { entity: id, tier: "silver", choices: ["bloodlust" as AugmentId], picked: null },
      "bloodlust" as AugmentId,
    );
    // grant the capstone (rolls a magnitude off world.rng)
    grantCapstone(world, id);
    recomputeStats(world, id);

    const real = world.stats.get(id)!.final;
    const reconstructed = computeStatBlock(ctxFromWorld(world, id))!;
    expectBlocksEqual(reconstructed, real);
    // and the W passive rank actually landed (ad+22 vs rank-1's +10)
    expect(reconstructed[Stat.AttackDamage]).toBeGreaterThan(real[Stat.AttackDamage] - 1e-6);
  });

  it("returns null for a champion that is not in the registry (sp-08)", () => {
    cover("shop-stat-preview");
    expect(computeStatBlock({ championId: "nope", level: 1, abilityRanks: [1, 0, 0, 0], items: [], augments: [], statCapstonePct: 0 })).toBeNull();
  });
});

describe("#248 attr-06 — the preview tells the truth about 三圍-derived stats", () => {
  // The preview reconstructs a champion from a SeatView-shaped context, so it
  // recomputes the stat card from `championId` + `level`. Since #248 the card's
  // eight attribute rows are NOT `def.baseStats` any more — they are
  // `baseStats + attr(level)·coefficient + growth·(level−1)`. A preview that
  // reconstructed from `baseStats` alone would under-report health by hundreds
  // of points AND would report a level-INDEPENDENT number. #106's rule is that
  // the panel must not lie; these pin it against the sim.
  const ATTR_STATS = [
    Stat.MaxHealth,
    Stat.HealthRegen,
    Stat.AttackDamage,
    Stat.Armor,
    Stat.AttackSpeed,
    Stat.MaxMana,
    Stat.ManaRegen,
    Stat.AbilityPower,
  ];

  it("matches the sim exactly at every level, with no items (sp-12)", () => {
    cover("shop-stat-preview");
    cover("attr-248-shop-preview-truthful");
    for (const championId of ["thorne", "sela"]) {
      for (const level of [1, 2, 6, 12, 18]) {
        const world = new SimWorld(SKELETON_ARENA, 1);
        const id = spawnHero(world, championId, level);
        expectBlocksEqual(computeStatBlock(ctxFromWorld(world, id))!, world.stats.get(id)!.final);
      }
    }
  });

  it("the attribute-derived rows actually move with level (sp-12)", () => {
    cover("attr-248-shop-preview-truthful");
    // Guards against a preview that agrees with the sim only because BOTH read
    // a level-independent constant.
    const w1 = new SimWorld(SKELETON_ARENA, 1);
    const w18 = new SimWorld(SKELETON_ARENA, 1);
    const at1 = computeStatBlock(ctxFromWorld(w1, spawnHero(w1, "thorne", 1)))!;
    const at18 = computeStatBlock(ctxFromWorld(w18, spawnHero(w18, "thorne", 18)))!;
    for (const s of ATTR_STATS) expect(`${s}:${at18[s] > at1[s]}`).toBe(`${s}:true`);
    // ap is the row #248 brought to life: 0 for the whole roster before, now
    // INT-sourced. A preview still showing 0 here means it lost the attributes.
    expect(at1[Stat.AbilityPower]).toBeGreaterThan(0);
    // …and the shown level-1 health really is above the raw card.
    expect(at1[Stat.MaxHealth]).toBeGreaterThan(
      Champions.get("thorne" as ChampionId).baseStats[Stat.MaxHealth] ?? 0,
    );
  });

  it("stays truthful after buying an item on top of the attribute base (sp-12)", () => {
    cover("attr-248-shop-preview-truthful");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world, "thorne", 12);
    const { preview, result, after, before } = predictThenBuy(world, id, "tp-hp");
    expect(result).toBe("ok");
    expectBlocksEqual(preview.after, after);
    // A FLAT hp item adds its value on top of the attribute-inflated base.
    expect(after[Stat.MaxHealth] - before[Stat.MaxHealth]).toBeCloseTo(300, 6);
  });

  it("follows a non-neutral 三圍 coefficient (sp-12)", () => {
    cover("attr-248-shop-preview-truthful");
    // An operator can retune str→hp live from the admin 戰鬥系統 page, exactly
    // like the other combat-env entries. The preview reads the env it is handed
    // and must move with it — the same way the sim does.
    const env = normalizeCombatEnv({ strToMaxHealth: 50 });
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatEnv = env;
    const id = spawnHero(world, "thorne", 6);
    recomputeStats(world, id);
    const predicted = computeStatBlock(ctxFromWorld(world, id, env))!;
    expectBlocksEqual(predicted, world.stats.get(id)!.final);

    const neutral = new SimWorld(SKELETON_ARENA, 1);
    const nId = spawnHero(neutral, "thorne", 6);
    expect(predicted[Stat.MaxHealth]).toBeGreaterThan(neutral.stats.get(nId)!.final[Stat.MaxHealth]);
  });
});

describe("previewExactness — the anti-lie tell", () => {
  it("is exact with no stat ticks and an agreeing authoritative HP (sp-09)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    const block = world.stats.get(id)!.final;
    const ex = previewExactness(block, {
      statStacks: 0,
      authMaxHp: Math.round(block[Stat.MaxHealth]),
      authMaxMana: Math.round(block[Stat.MaxMana]),
    });
    expect(ex.exact).toBe(true);
  });

  it("is NOT exact while a stat-tick streak is live (sp-10)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    const block = world.stats.get(id)!.final;
    expect(previewExactness(block, { statStacks: 3 }).exact).toBe(false);
  });

  it("is NOT exact when reconstructed HP disagrees with the wire (hidden post-reset ticks) (sp-11)", () => {
    cover("shop-stat-preview");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = spawnHero(world);
    const block = world.stats.get(id)!.final;
    const ex = previewExactness(block, {
      statStacks: 0,
      authMaxHp: Math.round(block[Stat.MaxHealth]) + 264, // server has 4 hidden hp rolls
    });
    expect(ex.exact).toBe(false);
    expect(ex.reason).toBe("hidden-stat-ticks");
  });
});
