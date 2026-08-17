import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_GROUND_STYLE,
  GROUND_STYLE_IDS,
} from "@ggd/shared/content/schema/groundStyle";
import {
  GROUND_TEXTURE_BASE,
  TILE_WORLD_SIZE,
  detailUvScale,
  groundTextureSet,
  groundTextureUrls,
} from "./groundMaterials";
import {
  GROUND_STYLES,
  TILE_WORLD_SIZE as GENERATOR_TILE_WORLD_SIZE,
} from "../../scripts/texgen/styles";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "content");

describe("ground material manifest (task #80, GH#342)", () => {
  it("the painters and the schema's style ids are the SAME SET, both directions", () => {
    // ⛔ Drift here is silent in BOTH directions: an id with no painter renders
    // flat colour that just looks "a bit off", a painter with no id writes
    // ~700 KB of PNGs nothing ever fetches. Neither throws anywhere.
    expect([...GROUND_STYLES.map((s) => s.id)].sort()).toEqual([...GROUND_STYLE_IDS].sort());
  });

  it("resolves every style to its own set, and only unknowns to the default", () => {
    for (const id of GROUND_STYLE_IDS) expect(groundTextureSet(id), id).toBe(id);
    expect(groundTextureSet("lava")).toBe(DEFAULT_GROUND_STYLE);
    expect(groundTextureSet(undefined)).toBe(DEFAULT_GROUND_STYLE);
  });

  it("keeps the tile world size in step with the generator", () => {
    // the manifest and texgen/styles.ts each declare this; if they drift, the
    // floor is textured at the wrong scale with no error anywhere
    expect(TILE_WORLD_SIZE).toBe(GENERATOR_TILE_WORLD_SIZE);
  });

  it("repeats the detail maps once per TILE_WORLD_SIZE units", () => {
    expect(detailUvScale(TILE_WORLD_SIZE / 2)).toBe(1);
    expect(detailUvScale(TILE_WORLD_SIZE * 6)).toBe(12);
  });

  it("points at files that actually exist on disk", () => {
    // guards against adding a style without re-running
    // `pnpm tsx apps/client/scripts/gen-ground.ts`
    for (const set of GROUND_STYLE_IDS) {
      for (const url of Object.values(groundTextureUrls(set))) {
        expect(url.startsWith(GROUND_TEXTURE_BASE), url).toBe(true);
        const file = join(CONTENT, url.replace("/content/", ""));
        expect(existsSync(file), file).toBe(true);
      }
    }
  });
});
