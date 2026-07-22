/**
 * Arena-rules sim primitives (arena-02, arena-04): free-item ("legendary
 * weapon") 3-choose-1 offers, the ult rank-gate override, and direct level
 * grants — the building blocks the MatchController's round rules drive.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "./../ids";
import { offerItems, applyItemPick, ITEM_OFFER_TIER } from "./economy/draft";
import { grantLevels } from "./economy/progression";
import { rankUpAbility } from "./abilities/abilitySystem";
import { Stat } from "./stats/statTypes";

beforeAll(() => registerSkeletonContent());

function world(seed = 9): { w: SimWorld; id: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  const id = spawnChampion(w, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: 0 },
    zone: 0,
  });
  return { w, id };
}

describe("item offers (arena-02)", () => {
  it("offers 3 distinct choices from a loot table; pick grants the item FREE", () => {
    cover("arena-weapon-offer");
    const { w, id } = world();
    const champ = w.champion.get(id)!;
    champ.gold = 123;

    const offer = offerItems(w, id, "round-reward");
    expect(offer.tier).toBe(ITEM_OFFER_TIER);
    expect(offer.choices).toHaveLength(3);
    expect(new Set(offer.choices).size).toBe(3); // distinct
    const apBefore = w.stats.get(id)!.final[Stat.AbilityPower];

    const pick = offer.choices[0]!;
    expect(applyItemPick(w, offer, pick)).toBe(true);
    expect(champ.items).toContain(pick); // granted into inventory
    expect(champ.gold).toBe(123); // FREE — no gold spent
    expect(applyItemPick(w, offer, pick)).toBe(false); // consumed

    // modifiers actually attached (stat pipeline recomputes on next step)
    w.step(new Map());
    if (pick === "ember-rod") {
      expect(w.stats.get(id)!.final[Stat.AbilityPower]).toBeGreaterThan(apBefore);
    }
    // picking something outside the offer is rejected
    const offer2 = offerItems(w, id, "round-reward");
    expect(applyItemPick(w, offer2, "not-an-item" as never)).toBe(false);
  });

  it("offer rolls are seeded + reproducible and skip owned items", () => {
    cover("arena-weapon-offer");
    const roll = (seed: number): string[] => {
      const { w, id } = world(seed);
      return offerItems(w, id, "round-reward").choices;
    };
    expect(roll(5)).toEqual(roll(5));
    expect([roll(5), roll(6), roll(7), roll(8)].map((c) => JSON.stringify(c))).not.toEqual(
      Array(4).fill(JSON.stringify(roll(5))),
    );

    // owned items are excluded from the pool
    const { w, id } = world(5);
    const champ = w.champion.get(id)!;
    champ.items[0] = "ember-rod" as never;
    const offer = offerItems(w, id, "round-reward");
    expect(offer.choices).not.toContain("ember-rod");
  });
});

describe("ult gate override (arena-04)", () => {
  it("default keeps 6/11/16; ultGateOverride lets R rank at any level", () => {
    cover("arena-ult-override");
    const { w, id } = world();
    const ab = w.abilities.get(id)!;
    ab.unspentPoints = 3;

    // default gate: level 1 < 6 -> rejected
    expect(w.champion.get(id)!.level).toBe(1);
    expect(rankUpAbility(w, id, "R")).toBe(false);

    // arena override: learnable immediately
    w.ultGateOverride = true;
    expect(rankUpAbility(w, id, "R")).toBe(true);
    expect(ab.slots.R.rank).toBe(1);
    // maxRank still enforced under the override
    ab.slots.R.rank = 3; // sela R maxRank is 3
    expect(rankUpAbility(w, id, "R")).toBe(false);

    // flipping the override back restores the level gate
    ab.slots.R.rank = 1;
    w.ultGateOverride = false;
    expect(rankUpAbility(w, id, "R")).toBe(false); // level 1 < 11 for rank 2
  });

  it("grantLevels adds exactly N levels and N ability points", () => {
    cover("arena-ult-override");
    const { w, id } = world();
    const champ = w.champion.get(id)!;
    const ab = w.abilities.get(id)!;
    const pointsBefore = ab.unspentPoints;
    grantLevels(w, id, 2);
    expect(champ.level).toBe(3);
    expect(ab.unspentPoints).toBe(pointsBefore + 2);
    // partial xp on the bar is topped off, not double-counted
    champ.xp = 10;
    grantLevels(w, id, 1);
    expect(champ.level).toBe(4);
    expect(champ.xp).toBe(0);
  });
});
