import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GROUND_TEXTURE_BASE,
  TILE_WORLD_SIZE,
  detailUvScale,
  groundTextureSet,
  groundTextureUrls,
} from "./groundMaterials";
import { TILE_WORLD_SIZE as GENERATOR_TILE_WORLD_SIZE } from "../../scripts/texgen/styles";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "content");

describe("ground material manifest (task #80)", () => {
  it("maps every groundStyle in the arena schema enum to a set", () => {
    // the enum from packages/shared/src/content/schema/arena.ts
    for (const style of ["stone", "dirt", "wood", "grass", "sand"]) {
      expect(["stone", "dirt", "grass", "sand"], style).toContain(groundTextureSet(style));
    }
  });

  it("falls back to stone for wood, unknown styles and undefined", () => {
    // wood is in the schema enum but no shipped arena uses it, so no set is
    // generated for it — see the STYLE_TO_SET comment
    expect(groundTextureSet("wood")).toBe("stone");
    expect(groundTextureSet("lava")).toBe("stone");
    expect(groundTextureSet(undefined)).toBe("stone");
  });

  it("keeps the tile world size in step with the generator", () => {
    // the manifest and texgen/styles.ts each declare this; if they drift, the
    // floor is textured at the wrong scale with no error anywhere
    expect(TILE_WORLD_SIZE).toBe(GENERATOR_TILE_WORLD_SIZE);
  });

  it("repeats the detail maps once per TILE_WORLD_SIZE units", () => {
    // every shipped zone has boundaryRadius 24 → 48 units across → 12 repeats
    expect(detailUvScale(24)).toBe(12);
    expect(detailUvScale(TILE_WORLD_SIZE / 2)).toBe(1);
  });

  it("points at files that actually exist on disk", () => {
    // guards against adding a style to the manifest without re-running
    // `pnpm tsx apps/client/scripts/gen-ground.ts`
    for (const set of ["stone", "dirt", "grass", "sand"] as const) {
      for (const url of Object.values(groundTextureUrls(set))) {
        expect(url.startsWith(GROUND_TEXTURE_BASE), url).toBe(true);
        const file = join(CONTENT, url.replace("/content/", ""));
        expect(existsSync(file), file).toBe(true);
      }
    }
  });
});
