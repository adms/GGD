import { describe, expect, it } from "vitest";
import { resolveAppearance } from "@ggd/shared/content/import/resolvedAppearance";
import { readShippedModelDocs } from "@ggd/shared/testkit/shippedModelDocs";
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
    expect(review.renderAllowed).toBe(true);
  });

  it("keeps mechanics preview possible but rejects stand-ins as approval evidence", () => {
    // ⭐ GH#1250（1bf3cd6b7）：替身判準只有一條 —— 看**模型文件的 glb 住在哪**
    //   （`standInBody.isStandInModel`）。⛔ 這裡以前自造 `{ ...model, id: "champ.skin.rogue" }`，
    //   glb 卻指向 `assets/models/imported/` ⇒ 在唯一的規則下它根本不是替身（被測的不是出貨的那個）。
    //   ⇒ 用**出貨的**替身文件。
    const rogueDoc = readShippedModelDocs().get("champ.skin.rogue");
    expect(rogueDoc, "出貨的共用替身 champ.skin.rogue 不見了 —— 換一顆 glb 在通用身體包底下的替身").toBeDefined();
    const standIn = resolveAppearance(
      "godie-e00r",
      { id: "godie-e00r", modelKey: "champ.skin.rogue" },
      rogueDoc,
    );
    const real = resolveAppearance("hero.b", { id: "hero.b", modelKey: "imported.hero" }, model);
    const review = reviewAppearances(standIn, real);
    expect(review.renderAllowed).toBe(true);
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
