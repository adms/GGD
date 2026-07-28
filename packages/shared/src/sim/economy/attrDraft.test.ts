/**
 * attrDraft — 能力屬性強化 三選一 (#260).
 *
 * owner: 「購買能力屬性加成也是三選一 力/敏/智 隨機加點 0.1-2 顯示在卡片上面，
 * 所以有可能你想要的屬性但加很少」.
 *
 * Four claims, each with a guard that fails on the corresponding mutation:
 *   ① the card is 力/敏/智 — all three, always, in a fixed order
 *   ② the magnitude is uniform over 0.1 … 2.0, both ends reachable
 *   ③ the magnitude the CARD carries is the magnitude the PICK applies
 *   ④ every draw comes off the seeded rng (determinism), never a clock
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { ATTR_KEYS, ATTR_LABEL } from "../stats/attributes";
import {
  ATTR_CHOICE_PREFIX,
  ATTR_ROLL_MAX_TENTHS,
  ATTR_ROLL_MIN_TENTHS,
  ATTR_ROLL_STEPS,
  applyAttrPick,
  encodeAttrChoice,
  formatAttrValue,
  parseAttrChoice,
  rollAttrChoices,
} from "./attrDraft";

beforeAll(() => registerSkeletonContent());

function makeWorld(seed = 3): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  return { world, id };
}

describe("① the card is 力 / 敏 / 智 — all three, always", () => {
  it("offers exactly one card per attribute, in ATTR_KEYS order, on every seed", () => {
    cover("attr-card-one-per-attribute");
    for (let seed = 1; seed <= 50; seed++) {
      const { world } = makeWorld(seed);
      const choices = rollAttrChoices(world);
      expect(choices).toHaveLength(3);
      expect(choices.map((c) => parseAttrChoice(c)!.attr)).toEqual([...ATTR_KEYS]);
    }
  });

  it("labels each card with its 繁中 name and the rolled number", () => {
    cover("attr-card-label");
    // 「顯示在卡片上面」 — the number is part of the card's own label, which is
    // also what the a11y name speaks (ui/panels/resolveChoice).
    const parsed = parseAttrChoice(encodeAttrChoice("agi", 14))!;
    expect(parsed.label).toBe(`${ATTR_LABEL.agi} +1.4`);
    // one decimal ALWAYS, so a +2 reads "+2.0" and a +0.1 is never rounded away
    expect(formatAttrValue(20)).toBe("2.0");
    expect(formatAttrValue(1)).toBe("0.1");
  });
});

describe("② the magnitude is uniform over 0.1 … 2.0", () => {
  it("never leaves the range, and REACHES both ends", () => {
    cover("attr-roll-range");
    const seen = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) {
      const { world } = makeWorld(seed);
      for (const c of rollAttrChoices(world)) {
        const p = parseAttrChoice(c)!;
        expect(p.tenths).toBeGreaterThanOrEqual(ATTR_ROLL_MIN_TENTHS);
        expect(p.tenths).toBeLessThanOrEqual(ATTR_ROLL_MAX_TENTHS);
        seen.add(p.tenths);
      }
    }
    // every one of the 20 steps is reachable — an off-by-one in the draw would
    // silently amputate 0.1 (or 2.0), which is exactly the 「加很少」 end the
    // owner asked for.
    expect(seen.size).toBe(ATTR_ROLL_STEPS);
    expect(seen.has(ATTR_ROLL_MIN_TENTHS)).toBe(true);
    expect(seen.has(ATTR_ROLL_MAX_TENTHS)).toBe(true);
  });
});

describe("③ the card's number IS the number applied", () => {
  it("a pick grants exactly the magnitude the card printed", () => {
    cover("attr-card-truthful");
    const { world, id } = makeWorld(17);
    const choices = rollAttrChoices(world);
    const card = choices[2]!; // 智慧
    const shown = parseAttrChoice(card)!;
    expect(applyAttrPick(world, id, card)).toBe(true);
    expect(world.champion.get(id)!.attrBonus.int).toBeCloseTo(Number(shown.label.split("+")[1]), 10);
  });

  it("round-trips through the id without a float artefact", () => {
    cover("attr-id-roundtrip");
    for (let t = ATTR_ROLL_MIN_TENTHS; t <= ATTR_ROLL_MAX_TENTHS; t++) {
      for (const attr of ATTR_KEYS) {
        const id = encodeAttrChoice(attr, t);
        expect(id.startsWith(ATTR_CHOICE_PREFIX)).toBe(true);
        const back = parseAttrChoice(id)!;
        expect(back.attr).toBe(attr);
        expect(back.tenths).toBe(t);
        expect(back.label).toContain(formatAttrValue(t));
      }
    }
  });

  it("rejects everything that is not a well-formed in-range card", () => {
    cover("attr-id-reject");
    for (const bad of [
      "attr:str:0", // below the floor
      "attr:str:21", // above the ceiling
      "attr:str:1.5", // non-integer tenths
      "attr:str", // missing magnitude
      "attr:str:1:2", // extra field
      "attr:luck:5", // not an attribute
      "godie-i001", // a plain item id
      "", // nothing at all
    ]) {
      expect(parseAttrChoice(bad), `${bad} was accepted`).toBeNull();
    }
  });
});

describe("④ determinism — the rolls come off the seeded rng", () => {
  it("same seed ⇒ same cards; different seed ⇒ different cards", () => {
    cover("attr-deterministic");
    const roll = (seed: number): string[] => {
      const { world } = makeWorld(seed);
      return [...rollAttrChoices(world), ...rollAttrChoices(world)];
    };
    expect(roll(42)).toEqual(roll(42));
    expect(roll(42)).not.toEqual(roll(43));
  });

  it("consumes exactly one rng draw per card, in card order", () => {
    cover("attr-rng-budget");
    // If the roll ever spent a different number of draws, every LATER sim roll
    // in the same match (augment offers, crits, evasion) would shift — the
    // classic silent desync. Pin it against the raw stream.
    const { world } = makeWorld(9);
    const expected = [0, 1, 2].map(() => world.rng.int(ATTR_ROLL_STEPS));
    const fresh = makeWorld(9);
    const choices = rollAttrChoices(fresh.world);
    expect(choices.map((c) => parseAttrChoice(c)!.tenths - ATTR_ROLL_MIN_TENTHS)).toEqual(expected);
    // …and the stream is left in the same place afterwards
    expect(fresh.world.rng.int(1000)).toBe(world.rng.int(1000));
  });
});
