import { describe, expect, it } from "vitest";
import { effectiveHeroAppearance } from "./heroAppearance";

const champion = {
  id: "hero.test",
  modelKey: "champ.base",
  bodyScale: 1.4,
  tint: [0.4, 0.5, 0.6] as [number, number, number],
  alpha: 0.8,
};

describe("Hero/Skin preview composition", () => {
  it("uses the champion body when no skin is selected", () => {
    expect(effectiveHeroAppearance(champion)).toEqual({
      modelKey: "champ.base",
      relativeScale: 1.4,
      tint: [0.4, 0.5, 0.6],
      alpha: 0.8,
    });
  });

  it("uses runtime field-by-field skin overrides instead of dropping champion alpha", () => {
    expect(effectiveHeroAppearance(champion, {
      championId: "hero.test",
      modelKey: "champ.skin",
      tint: [1, 0.2, 0.2],
    })).toEqual({
      modelKey: "champ.skin",
      relativeScale: 1.4,
      tint: [1, 0.2, 0.2],
      alpha: 0.8,
    });
  });

  it("rejects previewing a skin on the wrong champion", () => {
    expect(() => effectiveHeroAppearance(champion, {
      championId: "hero.other",
      modelKey: "champ.skin",
    })).toThrow("skin belongs to hero.other");
  });
});
