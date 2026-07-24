/**
 * draft.test.ts — the augment card must never stop being a CHOICE.
 *
 * `offerAugments` draws WITHOUT replacement and excludes what the champion
 * already owns, so every pick permanently shrinks that champion's pool of that
 * tier. Under the team-health model a match runs 10-13 rounds and `arena-rules`
 * schedules PRISMATIC from round 5 onwards, so one champion draws 7-9 prismatic
 * cards in a single match. The old body filtered hard on `tier` and looped
 * `while (choices.length < count && working.length > 0)`, which meant it
 * silently emitted a 2-wide card, then a 1-wide card ("choose 1 of 1" is not a
 * choice), then a 0-wide one — task #47's ghost card, with nothing logged.
 *
 * Measured on 30 real bot matches before the fix: 339 of 1941 prismatic offers
 * came out under-filled, 132 of them with a single card.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { Augments } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import type { AugmentDef } from "../content/defs";
import { asSeatId, asTeamId, type AugmentId, type ChampionId, type EntityId } from "../../ids";
import { offerAugments, applyAugmentPick } from "./draft";

const aug = (id: string, tier: AugmentDef["tier"]): AugmentDef => ({
  id: id as AugmentId,
  name: id,
  description: id,
  tier,
  weight: 10,
  tags: [],
});

/** A deliberately THIN prismatic tier — 4 cards — so exhaustion arrives fast. */
function registerThinPool(): void {
  registerSkeletonContent(); // champions/items the spawner needs
  Augments.clear(); // …then REPLACE the augment tier with a controlled one
  for (const d of [
    ...["p1", "p2", "p3", "p4"].map((i) => aug(i, "prismatic")),
    ...["g1", "g2", "g3", "g4", "g5"].map((i) => aug(i, "gold")),
    ...["s1", "s2", "s3"].map((i) => aug(i, "silver")),
  ]) {
    Augments.register(d.id, d);
  }
}

function makeChampion(world: SimWorld): EntityId {
  const c = SKELETON_ARENA.zones[0]!.center;
  return spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
}

describe("augment offers never under-fill (draft-no-underfill)", () => {
  beforeEach(() => registerThinPool());

  it("keeps handing out 3 real choices after the requested tier is exhausted", () => {
    cover("draft-no-underfill");
    const world = new SimWorld(SKELETON_ARENA, 12345);
    const e = makeChampion(world);

    // Draw prismatic repeatedly. The tier only has 4 cards, so from the second
    // offer on it CANNOT fill 3 on its own — the old code returned 3, 3, 2, 1, 0.
    const widths: number[] = [];
    for (let i = 0; i < 6; i++) {
      const offer = offerAugments(world, e, "prismatic", 3);
      widths.push(offer.choices.length);
      expect(new Set(offer.choices).size).toBe(offer.choices.length); // all distinct
      if (offer.choices[0]) applyAugmentPick(world, offer, offer.choices[0]);
    }
    expect(widths).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("prefers the requested tier: the headline card is the tier the round promised", () => {
    cover("draft-tier-preference");
    const world = new SimWorld(SKELETON_ARENA, 999);
    const e = makeChampion(world);
    const byId = new Map(Augments.all().map((a) => [a.id, a]));
    // While the tier can serve at all, choices[0] must come from it — a player
    // told "prismatic round" must not open the card onto a silver headline.
    for (let i = 0; i < 4; i++) {
      const offer = offerAugments(world, e, "prismatic", 3);
      expect(byId.get(offer.choices[0]!)!.tier).toBe("prismatic");
      applyAugmentPick(world, offer, offer.choices[0]!);
    }
  });

  it("still degrades gracefully when EVERYTHING is owned, and never emits a phantom card", () => {
    cover("draft-exhausted-pool");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const e = makeChampion(world);
    // Take every augment in the registry.
    for (let i = 0; i < 40; i++) {
      const offer = offerAugments(world, e, "prismatic", 3);
      if (offer.choices.length === 0) break;
      applyAugmentPick(world, offer, offer.choices[0]!);
    }
    const owned = world.champion.get(e)!.augments;
    expect(owned.length).toBe(Augments.all().length); // drained the whole registry
    // …and the offer that follows is EMPTY, not a card with a dead slot in it.
    // An empty offer is the honest signal (the MatchController drops it rather
    // than showing a card that grants nothing).
    const last = offerAugments(world, e, "prismatic", 3);
    expect(last.choices).toEqual([]);
  });

  it("silver has nowhere to fall back to, and says so by returning what it has", () => {
    cover("draft-silver-floor");
    const world = new SimWorld(SKELETON_ARENA, 21);
    const e = makeChampion(world);
    // 3 silver cards, so the first offer is exactly 3 and the second is empty
    // once they are owned. Silver is the bottom of the ladder: there is no
    // lower tier to borrow from, and inventing one would be worse than honest.
    const first = offerAugments(world, e, "silver", 3);
    expect(first.choices).toHaveLength(3);
    for (const c of first.choices) applyAugmentPick(world, { ...first, picked: null }, c);
    expect(offerAugments(world, e, "silver", 3).choices).toEqual([]);
  });
});
