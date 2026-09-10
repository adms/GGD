import { z } from "zod";
import { zId } from "../common";
// The eleven barcode slots, in ANATOMICAL ORDER. Imported (not restated) so the
// stored doc's keys can never drift from the model — see zConfigVoxelBarcodesDoc.
// `voxelSkin/types` is a leaf: zero imports of its own, no zod, no sim.
import { BARCODE_SLOTS } from "../../voxelSkin/types";

/**
 * config.voxel-barcodes@1 — 特徵生成 (docs/_體素特徵生成規格.md) L0, the layer the
 * ADMIN CONSOLE writes.
 *
 * WHY THIS DOC EXISTS SEPARATELY FROM `content/models/_voxel-barcodes.json`.
 * That file is the shipped SEED: it is a sidecar (leading underscore), so the
 * indexer skips it and it is fetched by path, exactly like `_voxel-skins.json`.
 * A sidecar cannot be the console's write target, because the platform's durable
 * overlay keys are `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$` — an id may not START
 * with an underscore, so `models/_voxel-barcodes` is a 400 and there is no
 * spelling of it that is not. This doc is the overlay-writable half:
 *
 *   effective barcode(champion) = overlay(config/voxel-barcodes).barcodes[id]
 *                              ?? seed(models/_voxel-barcodes.json).barcodes[id]
 *
 * so `barcodes` here holds ONLY what an operator edited. An empty map is the
 * shipped state and means "every champion is still on the seed", which is what
 * lets the console's per-champion badge tell 「後台改過的版本」 from 「出貨預設值」
 * as a FACT about the data rather than as decoration.
 *
 * IT LIVES IN A SCHEMA-VALIDATED COLLECTION FOR THE REASON `config.icon-plan@1`
 * spells out above, plus one this doc has and that one does not: the overlay
 * merge (`OverlayContentSource.readManifest`) publishes EVERY collection the
 * overlay touches, and `ContentLoader` rejects a collection it has no schema
 * for. So an unregistered home for this doc would not fail at authoring time —
 * it would fail on the host, at boot, the first time the owner pressed 儲存.
 *
 * The band shape is restated in zod rather than derived from `BarcodeBand`:
 * `BARCODE_SLOTS` is imported so the eleven keys and their ANATOMICAL ORDER
 * cannot drift, but the value constraints (a strict `#rrggbb`, a positive frac)
 * are checks a TypeScript interface cannot make on a JSON file.
 */
const zBarcodeHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "顏色必須是 #rrggbb");

const zBarcodeBand = z
  .object({
    hex: zBarcodeHex,
    /** share of the WHOLE figure's height; present bands sum to 1.0 */
    frac: z.number().gt(0).max(1),
  })
  .strict();

/** The eleven slots, every key present, an absent slot explicitly `null`. */
const zBarcodeBands = z
  .object(
    Object.fromEntries(BARCODE_SLOTS.map((s) => [s, zBarcodeBand.nullable()])) as Record<
      (typeof BARCODE_SLOTS)[number],
      z.ZodNullable<typeof zBarcodeBand>
    >,
  )
  .strict();

const zVoxelBarcodeEntry = z
  .object({
    v: z.literal(1),
    championId: zId,
    bands: zBarcodeBands,
    sleeve: z.enum(["long", "short", "none"]),
    faceColors: z
      .object({ eye: zBarcodeHex, nose: zBarcodeHex.nullable(), mouth: zBarcodeHex })
      .strict(),
    /** MANDATORY audit field — who decided this barcode (規格 §6). */
    source: z.enum(["manual", "extracted", "keyword", "generated"]),
    extraction: z
      .object({
        refImage: z.string().min(1),
        verdict: z.enum(["PASS", "SUSPECT", "FAIL", "DUPLICATE"]),
        reasons: z.array(z.string()),
        maxPairwiseDeltaE: z.number(),
        foregroundRatio: z.number(),
      })
      .strict()
      .optional(),
    note: z.string().optional(),
  })
  .strict();

export const zConfigVoxelBarcodesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.voxel-barcodes@1"),
    note: z.string().optional(),
    /** the file's own copy of the anatomical order — a formatter that
     *  alphabetised the slot keys shows up here instead of silently re-stacking
     *  every character */
    slotOrder: z.array(z.string()).optional(),
    /** championId -> the barcode an operator authored. Empty = all seed. */
    barcodes: z.record(zId, zVoxelBarcodeEntry),
  })
  .strict();
export type ConfigVoxelBarcodesDoc = z.infer<typeof zConfigVoxelBarcodesDoc>;
