/**
 * model-facing-convention: the .glb yaw-facing convention is defined in exactly
 * ONE place (glbFacing) and routes each model family to the right default. A
 * single global offset cannot serve both families — the voxel-baked native
 * models bake forward +Z, w3x-imported ones bake forward +X (90° apart) — so
 * the imported family carries an extra +90°.
 *
 * ⚠️ WHAT THIS FILE IS NOT ALLOWED TO BE TRUSTED FOR.
 * These cases assert the ROUTING (which family a path lands in, and that a doc
 * override wins over its family). They deliberately do NOT assert that the
 * numbers are *correct*, because that is exactly the assertion this file was
 * historically unable to make: the earlier version of it asserted the constants
 * and their difference, and stayed fully green through the pass where BOTH
 * families rendered 180° backward — adding 180° to both keeps every equality
 * true. The correctness of each number against the real mesh is checked by
 * `modelFacing.test.ts`, which measures the shipped .glb geometry. Do not add
 * "expect(CONSTANT).toBe(literal)" cases here; they cannot fail for the right
 * reason.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  glbYawOffset,
  familyGlbYawOffset,
  isImportedGlb,
  NATIVE_GLB_YAW_OFFSET,
  IMPORTED_GLB_YAW_OFFSET,
  IMPORTED_FLIPPED_GLB_YAW_OFFSET,
} from "./glbFacing";

describe("glb facing convention (model-facing-convention)", () => {
  it("routes native (voxel-baked/hex/props) glbs to the native family", () => {
    cover("model-facing-convention");
    for (const p of [
      "assets/models/champions/blocky-mage.glb",
      "assets/models/champions/blocky-knight.glb",
      "assets/models/hex/waterlily.glb",
      "assets/models/props/pillar.glb",
    ]) {
      expect(isImportedGlb(p)).toBe(false);
      expect(glbYawOffset({ glbPath: p })).toBe(NATIVE_GLB_YAW_OFFSET);
      expect(familyGlbYawOffset(p)).toBe(NATIVE_GLB_YAW_OFFSET);
    }
  });

  it("routes w3x-imported AND Blizzard-overlay glbs to the imported family", () => {
    cover("model-facing-convention");
    // the overlay comes out of the same converter, so it must share the family
    // — and it is NOT a dev-only path: the family deploy builds the client with
    // VITE_GGD_FULL_ASSETS=1, so these are the meshes 40 champions really wear.
    for (const p of [
      "assets/models/imported/bulbasaur.glb",
      "assets/models/imported/herosaber.glb",
      "assets/blizzard-local/models/H02K.glb",
      "assets/blizzard-local/models/E00R.glb",
    ]) {
      expect(isImportedGlb(p)).toBe(true);
      expect(glbYawOffset({ glbPath: p })).toBe(IMPORTED_GLB_YAW_OFFSET);
    }
  });

  it("a doc's own yawOffsetDeg overrides its family default", () => {
    cover("model-facing-convention");
    const p = "assets/models/imported/linkstik.glb";
    expect(glbYawOffset({ glbPath: p })).toBe(IMPORTED_GLB_YAW_OFFSET);
    expect(glbYawOffset({ glbPath: p, yawOffsetDeg: 270 })).toBe(
      IMPORTED_FLIPPED_GLB_YAW_OFFSET,
    );
    // ...and the override reaches an overlay path too, which the retired
    // modelKey-keyed Set could not express at all: the 40 overlay champions
    // share stand-in modelKeys, so one entry would have rotated ~18 of them.
    expect(
      glbYawOffset({ glbPath: "assets/blizzard-local/models/H02K.glb", yawOffsetDeg: 0 }),
    ).toBe(0);
  });

  it("yawOffsetDeg: 0 is honoured, not treated as absent", () => {
    cover("model-facing-convention");
    // 0 is a meaningful correction (an imported model re-exported to +Z), so
    // the check must be `undefined`, never falsiness. A `??`/`||` slip here
    // would silently hand the model back the +90° family default.
    expect(glbYawOffset({ glbPath: "assets/models/imported/herosaber.glb", yawOffsetDeg: 0 })).toBe(
      0,
    );
    expect(
      glbYawOffset({ glbPath: "assets/models/imported/herosaber.glb", yawOffsetDeg: undefined }),
    ).toBe(IMPORTED_GLB_YAW_OFFSET);
  });

  it("degrees convert to radians (the doc field's unit is not the code's unit)", () => {
    cover("model-facing-convention");
    expect(glbYawOffset({ glbPath: "assets/models/props/x.glb", yawOffsetDeg: 180 })).toBeCloseTo(
      Math.PI,
      12,
    );
    // -90 and 270 are the same rotation; authors may write either
    expect(
      Math.cos(glbYawOffset({ glbPath: "assets/models/props/x.glb", yawOffsetDeg: -90 })),
    ).toBeCloseTo(Math.cos(IMPORTED_FLIPPED_GLB_YAW_OFFSET), 12);
    expect(
      Math.sin(glbYawOffset({ glbPath: "assets/models/props/x.glb", yawOffsetDeg: -90 })),
    ).toBeCloseTo(Math.sin(IMPORTED_FLIPPED_GLB_YAW_OFFSET), 12);
  });
});
