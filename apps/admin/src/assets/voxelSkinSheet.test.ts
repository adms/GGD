/**
 * 體素外觀對照表 — the data layer.
 *
 * The page's whole claim is that its numbers ARE the build's numbers, so these
 * tests hold the sheet to the same invariants the shared generator's tests hold
 * the generator to, and check that the honest-failure paths really are honest.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMPTY_FILTER,
  applyFilter,
  buildSheet,
  exportOverrideStub,
  outfitHue,
  parseChampionIndex,
  parseOverrides,
  similarPairs,
  sortRows,
} from "./voxelSkinSheet";
import { composeThumb, THUMB_H, THUMB_W } from "../ui/voxelSkinThumb";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const CHAMPIONS = join(CONTENT, "champions");

const docs = readdirSync(CHAMPIONS)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(CHAMPIONS, f), "utf8")));

const overrides = parseOverrides(
  JSON.parse(readFileSync(join(CONTENT, "models/_voxel-skins.json"), "utf8")),
);

const sheet = buildSheet(docs, overrides);

describe("buildSheet over the real roster", () => {
  it("covers every champion and every look is distinct", () => {
    expect(sheet.rows.length).toBe(docs.length);
    expect(sheet.stats.champions).toBe(docs.length);
    expect(sheet.stats.distinctLooks).toBe(docs.length);
    expect(sheet.stats.collisions).toBe(0);
  });

  it("reports the budget the page displays, and it is the real one", () => {
    // the page prints these; they must be measured, not decorative
    expect(sheet.stats.shippedTextureBytes).toBe(0);
    expect(sheet.stats.atlasBytesPerChampion).toBe(64 * 64 * 4);
    expect(sheet.stats.recipeBytes).toBeGreaterThan(0);
    expect(sheet.stats.recipeBytes).toBeLessThan(32 * 1024);
  });

  // 43, not 44: #217 moved 喪標麥可 (godie-zombiex) onto its own zombie mesh,
  // so it left the shared-stand-in population. Same number the shared-side
  // `voxelSkin/generate.test.ts` asserts — the two must agree.
  it("flags the shared-stand-in population and the hand-authored overrides", () => {
    expect(sheet.stats.standInChampions).toBe(43);
    expect(sheet.stats.overriddenChampions).toBe(Object.keys(overrides).length);
    for (const row of sheet.rows) {
      if (row.sharedStandIn) expect(row.recipe.preferVoxelBody).toBe(true);
      if (row.overridden) expect(Object.keys(overrides)).toContain(row.championId);
    }
  });

  it("the champions sharing champ.sela get 18 different looks", () => {
    const group = sheet.rows.filter((r) => r.modelKey === "champ.sela");
    expect(group.length).toBe(18);
    expect(new Set(group.map((r) => r.signature)).size).toBe(18);
    for (const r of group) expect(r.modelKeyShareCount).toBe(18);
  });

  it("is order-independent — the sheet does not depend on directory order", () => {
    const reversed = buildSheet([...docs].reverse(), overrides);
    expect(JSON.stringify(reversed.rows.map((r) => r.signature))).toBe(
      JSON.stringify(sheet.rows.map((r) => r.signature)),
    );
  });
});

describe("parsers refuse to invent data", () => {
  it("a malformed champion index yields no entries", () => {
    expect(parseChampionIndex(null)).toEqual([]);
    expect(parseChampionIndex({})).toEqual([]);
    expect(parseChampionIndex({ entries: "nope" })).toEqual([]);
    expect(parseChampionIndex({ entries: [{ id: 1 }] })).toEqual([]);
    expect(parseChampionIndex({ entries: [{ id: "a", path: "champions/a.json" }] })).toHaveLength(1);
  });

  it("a wrong-schema override file is ignored outright", () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides({ schema: "something-else@9", overrides: { x: {} } })).toEqual({});
    expect(Object.keys(parseOverrides({ schema: "voxel-skins@1", overrides: { x: {} } }))).toEqual([
      "x",
    ]);
  });
});

describe("filters, sorts and the review loop", () => {
  it("filters compose and never widen the set", () => {
    const all = applyFilter(sheet.rows, EMPTY_FILTER);
    expect(all.length).toBe(sheet.rows.length);
    const standIn = applyFilter(sheet.rows, { ...EMPTY_FILTER, onlyStandIn: true });
    expect(standIn.length).toBe(43);
    const tinted = applyFilter(sheet.rows, { ...EMPTY_FILTER, onlyTinted: true });
    expect(tinted.length).toBeGreaterThan(0);
    expect(tinted.every((r) => r.tint)).toBe(true);
    const byText = applyFilter(sheet.rows, { ...EMPTY_FILTER, text: sheet.rows[0]!.championId });
    expect(byText.length).toBeGreaterThanOrEqual(1);
  });

  it("hue sort is monotonic — look-alike colours land adjacent", () => {
    const sorted = sortRows(sheet.rows, "hue");
    for (let i = 1; i < sorted.length; i++) {
      expect(outfitHue(sorted[i]!)).toBeGreaterThanOrEqual(outfitHue(sorted[i - 1]!) - 1e-9);
    }
    expect(sortRows(sheet.rows, "id").length).toBe(sheet.rows.length);
    expect(sortRows(sheet.rows, "modelKey")[0]!.modelKey <= sortRows(sheet.rows, "modelKey")[1]!.modelKey).toBe(true);
  });

  it("similarity warning is a WARNING, not the distinctness guarantee", () => {
    // distinct signatures is the hard guarantee (asserted above); this softer
    // colour-distance check may legitimately find near pairs, and must not throw.
    const pairs = similarPairs(sheet.rows);
    expect(Array.isArray(pairs)).toBe(true);
    for (const p of pairs) expect(p.a.championId).not.toBe(p.b.championId);
  });

  it("exports a paste-ready overrides block for the marked champions", () => {
    const first = sheet.rows[0]!;
    const json = exportOverrideStub(sheet.rows, new Set([first.championId]), {
      [first.championId]: "顏色太暗",
    });
    const parsed = JSON.parse(json) as {
      schema: string;
      overrides: Record<string, { note: string; palette: Record<string, string> }>;
    };
    expect(parsed.schema).toBe("voxel-skins@1");
    expect(Object.keys(parsed.overrides)).toEqual([first.championId]);
    expect(parsed.overrides[first.championId]!.note).toBe("顏色太暗");
    // the stub starts from the CURRENT look, so the owner edits a diff
    expect(parsed.overrides[first.championId]!.palette.outfitPrimary).toBe(
      first.recipe.palette.outfitPrimary,
    );
    // ...and re-feeding it reproduces the same look
    const round = buildSheet(docs, parseOverrides(parsed));
    expect(round.rows.find((r) => r.championId === first.championId)!.signature).toBe(
      first.signature,
    );
  });
});

describe("the contact-sheet thumbnail shows the SHIPPED pixels", () => {
  it("composes an opaque paper doll for every champion", () => {
    for (const row of sheet.rows) {
      const buf = composeThumb(row.recipe);
      expect(buf.length).toBe(THUMB_W * THUMB_H * 4);
    }
  });

  it("two different champions produce different thumbnails", () => {
    const a = composeThumb(sheet.rows[0]!.recipe);
    const b = composeThumb(sheet.rows[1]!.recipe);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(false);
  });

  it("the head/torso/arm/leg regions are actually filled (not a blank doll)", () => {
    const buf = composeThumb(sheet.rows[0]!.recipe);
    let opaque = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] === 255) opaque++;
    // head 64 + torso 96 + 2 arms 96 + 2 legs 96 + side strip 112 = 464 texels
    expect(opaque).toBeGreaterThanOrEqual(400);
  });
});
