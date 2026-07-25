/**
 * model-facing-convention: the .glb yaw-facing convention is defined in exactly
 * ONE place (glbFacing) and routes each model family to the right offset. A
 * single global offset cannot serve both families — KayKit bakes forward +Z,
 * w3x-imported bakes forward -X (90° apart) — so the imported family carries an
 * extra +90° to line up with the visually-verified KayKit render.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  glbYawOffset,
  isImportedGlb,
  NATIVE_GLB_YAW_OFFSET,
  IMPORTED_GLB_YAW_OFFSET,
  IMPORTED_FLIPPED_GLB_YAW_OFFSET,
  FLIPPED_IMPORTED_MODEL_KEYS,
} from "./glbFacing";

describe("glb facing convention (model-facing-convention)", () => {
  it("defines the three offsets with the expected values", () => {
    cover("model-facing-convention");
    // offsets carry a +180° correction so models face their movement direction
    expect(NATIVE_GLB_YAW_OFFSET).toBe(0);
    expect(IMPORTED_GLB_YAW_OFFSET).toBe(Math.PI / 2);
    expect(IMPORTED_FLIPPED_GLB_YAW_OFFSET).toBe(Math.PI + Math.PI / 2);
    // the imported family is EXACTLY 90° past the native family (measured)
    expect(IMPORTED_GLB_YAW_OFFSET - NATIVE_GLB_YAW_OFFSET).toBeCloseTo(Math.PI / 2, 12);
    // a flipped imported model is 180° from its own family
    const delta = IMPORTED_FLIPPED_GLB_YAW_OFFSET - IMPORTED_GLB_YAW_OFFSET;
    expect(Math.abs(((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI)).toBeCloseTo(0, 12);
  });

  it("routes native (KayKit/hex/props) glbs to the native offset", () => {
    cover("model-facing-convention");
    for (const p of [
      "assets/models/champions/blocky-mage.glb",
      "assets/models/champions/blocky-knight.glb",
      "assets/models/hex/waterlily.glb",
      "assets/models/props/pillar.glb",
    ]) {
      expect(isImportedGlb(p)).toBe(false);
      expect(glbYawOffset(p)).toBe(NATIVE_GLB_YAW_OFFSET);
      expect(glbYawOffset(p, "champ.sela")).toBe(NATIVE_GLB_YAW_OFFSET);
    }
  });

  it("routes w3x-imported glbs to the imported offset (+90° over native)", () => {
    cover("model-facing-convention");
    for (const [p, k] of [
      ["assets/models/imported/bulbasaur.glb", "imported.bulbasaur"],
      ["assets/models/imported/herosaber.glb", "imported.herosaber"],
      ["assets/models/imported/heropikachu.glb", "imported.heropikachu"],
    ] as const) {
      expect(isImportedGlb(p)).toBe(true);
      expect(glbYawOffset(p, k)).toBe(IMPORTED_GLB_YAW_OFFSET);
    }
  });

  it("treats heropika as a normal imported model (its hand labels are swapped, body faces -X)", () => {
    cover("model-facing-convention");
    expect(FLIPPED_IMPORTED_MODEL_KEYS.has("imported.heropika")).toBe(false);
    expect(glbYawOffset("assets/models/imported/heropika.glb", "imported.heropika")).toBe(
      IMPORTED_GLB_YAW_OFFSET,
    );
  });

  it("applies the 180°-flip offset only to the genuinely flipped imported models", () => {
    cover("model-facing-convention");
    expect(FLIPPED_IMPORTED_MODEL_KEYS.has("imported.heroryuk")).toBe(true);
    expect(glbYawOffset("assets/models/imported/heroryuk.glb", "imported.heroryuk")).toBe(
      IMPORTED_FLIPPED_GLB_YAW_OFFSET,
    );
    // the flip only applies to imported paths, never native
    expect(glbYawOffset("assets/models/champions/blocky-mage.glb", "imported.heroryuk")).toBe(
      NATIVE_GLB_YAW_OFFSET,
    );
  });
});
