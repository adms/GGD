import { describe, expect, it } from "vitest";
import { resolveAppearance } from "@ggd/shared/content/import/resolvedAppearance";
import { reviewAppearances } from "./appearanceReview";

const model = {
  id: "imported.hero",
  glbPath: "assets/models/imported/hero.glb",
  scale: 1,
  collisionRadius: 0.5,
};

describe("VFX Forge resolved appearance review gate", () => {
  it("accepts two resolved real models and records reproducible receipts", () => {
    const caster = resolveAppearance("hero.a", { id: "hero.a", modelKey: "imported.hero" }, model);
    const target = resolveAppearance("hero.b", { id: "hero.b", modelKey: "imported.hero" }, model);
    const review = reviewAppearances(caster, target);
    expect(review.allowed).toBe(true);
    expect(review.issues).toEqual([]);
    expect(review.receipts).toHaveLength(2);
    expect(review.receipts[0]).toMatch(/^resolved-appearance:施法者:hero\.a:imported\.hero:/);
  });

  it("keeps mechanics preview possible but rejects stand-ins as approval evidence", () => {
    const standIn = resolveAppearance(
      "godie-e00r",
      { id: "godie-e00r", modelKey: "champ.skin.rogue" },
      { ...model, id: "champ.skin.rogue" },
    );
    const real = resolveAppearance("hero.b", { id: "hero.b", modelKey: "imported.hero" }, model);
    const review = reviewAppearances(standIn, real);
    expect(review.allowed).toBe(false);
    expect(review.issues).toEqual(["施法者 godie-e00r 使用共用替身 champ.skin.rogue"]);
  });

  it("fails closed while either actor or its model document is missing", () => {
    const failed = resolveAppearance("hero.a", { id: "hero.a", modelKey: "missing" }, undefined);
    const review = reviewAppearances(failed, null);
    expect(review.allowed).toBe(false);
    expect(review.issues).toEqual([
      "施法者外觀解析失敗：no-model-doc",
      "目標外觀尚未解析",
    ]);
  });
});
