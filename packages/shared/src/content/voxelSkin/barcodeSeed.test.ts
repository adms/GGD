/**
 * The seed barcodes — `content/models/_voxel-barcodes.json`, held to the same
 * rules the code enforces.
 *
 * SEPARATE FROM barcode.test.ts ON PURPOSE. That file builds its fixtures in
 * TypeScript so a data edit can never quietly change what a behavioural test
 * means. This one reads the SHIPPED FILE, so a data edit is exactly what it is
 * supposed to catch. Both are needed: green code over broken data is one of the
 * ways "did it but the player can't get it" happens.
 *
 * The census here is 規格 §8's: every authored barcode is paintable, no barcode
 * is a mud column, and every non-placeholder id names a champion that actually
 * exists on disk.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BARCODE_MUD_COLUMN_DELTA_E,
  BARCODE_SLOTS,
  VOXEL_BARCODES_SCHEMA,
  isPlaceholderBarcodeId,
  type VoxelBarcode,
  type VoxelBarcodesFile,
} from "./types";
import { bandAtDepth, barcodeErrors, barcodeToParts, maxPairwiseDeltaE, totalFrac } from "./barcode";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

const file = JSON.parse(
  readFileSync(join(CONTENT, "models", "_voxel-barcodes.json"), "utf8"),
) as VoxelBarcodesFile;

const entries = Object.entries(file.barcodes) as [string, VoxelBarcode][];

/** Champion ids as they exist on disk. Read as FILENAMES — never by parsing and
 *  re-serialising a champion doc, which is mirrored storage (see CLAUDE.md). */
const championIds = new Set(
  readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length)),
);

describe("_voxel-barcodes.json", () => {
  it("declares the schema and the anatomical slot order", () => {
    expect(file.schema).toBe(VOXEL_BARCODES_SCHEMA);
    // The file's own copy of the order, so a formatter that alphabetised the
    // keys shows up here instead of silently re-stacking every character.
    expect(file.slotOrder).toEqual([...BARCODE_SLOTS]);
  });

  it("seeds the three named characters the owner asked for", () => {
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(file.barcodes)).toEqual(
      expect.arrayContaining(["placeholder.sanji", "godie-u00n", "godie-udre"]),
    );
  });

  it.each(entries)("%s is paintable, normalised and audited", (key, barcode) => {
    expect(barcode.v).toBe(1);
    expect(barcode.championId).toBe(key);
    // source is MANDATORY — without it nobody can tell an owner decision from
    // an extractor bug three months from now, and the two remedies are opposite.
    expect(barcode.source).toBe("manual");
    expect(barcode.extraction).toBeUndefined();

    // every one of the eleven keys present, in order, absent ones null
    expect(Object.keys(barcode.bands)).toEqual([...BARCODE_SLOTS]);

    expect(Math.abs(totalFrac(barcode.bands) - 1)).toBeLessThan(1e-9);
    expect(barcodeErrors(barcode).map((i) => i.message)).toEqual([]);
  });

  it.each(entries)("%s is not a mud column (§8 普查)", (_key, barcode) => {
    // The census the spec calls for by name: not one authored champion may
    // come out as a single smear.
    expect(maxPairwiseDeltaE(barcode)).toBeGreaterThanOrEqual(BARCODE_MUD_COLUMN_DELTA_E);
  });

  it.each(entries)("%s paints all three parts", (_key, barcode) => {
    const parts = barcodeToParts(barcode);
    expect(parts.head.length).toBeGreaterThan(0);
    expect(parts.torso.length).toBeGreaterThan(0);
    expect(parts.legs.length).toBeGreaterThan(0);
  });

  it("names real champions — every non-placeholder id resolves on disk", () => {
    const unresolved = entries
      .map(([id]) => id)
      .filter((id) => !isPlaceholderBarcodeId(id) && !championIds.has(id));
    expect(unresolved, "barcode ids with no champion doc").toEqual([]);
    // sanity: the set we are checking against is real, not empty
    expect(championIds.size).toBeGreaterThan(100);
  });

  it("has exactly one placeholder — 香吉士, who is not on the roster", () => {
    // Recorded as a fact, not hidden: a search of the whole repo for
    // 香吉士 / サンジ / Sanji returns nothing, so the barcode is parked in the
    // `placeholder.` namespace until the champion exists.
    const placeholders = entries.map(([id]) => id).filter(isPlaceholderBarcodeId);
    expect(placeholders).toEqual(["placeholder.sanji"]);
    expect(championIds.has("godie-u00n")).toBe(true); // 魯夫
    expect(championIds.has("godie-udre")).toBe(true); // 索隆
  });

  it("keeps 香吉士's suit as two slots even though the hex is identical", () => {
    const sanji = file.barcodes["placeholder.sanji"]!;
    expect(sanji.bands.top!.hex).toBe(sanji.bands.pants!.hex);
    const parts = barcodeToParts(sanji);
    expect(parts.torso.map((b) => b.slot)).toEqual(["top"]);
    expect(parts.legs.map((b) => b.slot)).toEqual(["pants", "shoe"]);
  });

  it("keeps 魯夫's red hat band visible in the shipped data", () => {
    // The spec's own warning: strip the fine band and Luffy is just "a brown
    // hat". This asserts the SHIPPED numbers still give it its own stripe.
    const parts = barcodeToParts(file.barcodes["godie-u00n"]!);
    expect(bandAtDepth(parts, "head", 0.5)?.slot).toBe("hatBand");
    expect(bandAtDepth(parts, "head", 0.5)?.hex).toBe("#E8112D");
    expect(bandAtDepth(parts, "legs", 0.6)?.slot).toBe("shin"); // 膚色小腿
  });

  it("keeps 索隆's 黑腹卷 visible in the shipped data", () => {
    const parts = barcodeToParts(file.barcodes["godie-udre"]!);
    expect(bandAtDepth(parts, "torso", 0.9)?.slot).toBe("waist");
    expect(bandAtDepth(parts, "torso", 0.9)?.hex).toBe("#111111");
  });
});
