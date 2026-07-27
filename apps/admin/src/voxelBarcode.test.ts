/**
 * 體素條碼 — the pure half (../voxelBarcode), held to 規格 §2 / §6 / §8.
 *
 * WHAT THIS FILE IS NOT ALLOWED TO DO. §8 lists the assertions that prove
 * nothing, and two of them are exactly what an editor's unit test drifts into:
 * counting keys (`bands` has 11) and counting controls (the form has 11 inputs).
 * So every test below is about a VALUE that survives a round trip, a STRUCTURE
 * that would break a character if it collapsed, or a NUMBER the preview draws
 * with. The eleven-key check appears once, and only as part of "an absent slot
 * is written as an explicit null", which is a claim about what gets STORED.
 *
 * The interactive half — what the page actually sends, and what the preview
 * actually paints — lives in voxelBarcodeSave.test.ts, which mounts the page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BARCODE_COLLECTION,
  BARCODE_DOC_ID,
  BARCODE_SLOTS,
  championChoices,
  docToForm,
  extractBarcodes,
  forgetBarcode,
  formToDoc,
  formValid,
  isDirty,
  maxPairwiseDeltaEOf,
  normalizeForm,
  patchBarcodeDoc,
  presentSlots,
  previewStack,
  resolveBarcode,
  setBand,
  sleevePreview,
  totalFracOf,
  validateForm,
  type BarcodeForm,
  type VoxelBarcode,
} from "./voxelBarcode";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The SHIPPED seed, read from disk — the same bytes the page fetches. */
const SEED = extractBarcodes(
  JSON.parse(
    readFileSync(join(REPO, "content/models/_voxel-barcodes.json"), "utf8"),
  ) as unknown,
);

const SANJI = SEED["placeholder.sanji"]!;
const LUFFY = SEED["godie-u00n"]!;
const ZORO = SEED["godie-udre"]!;

describe("the seed the editor opens on is the owner's three characters", () => {
  it("香吉士 / 魯夫 / 索隆 are all readable as barcodes", () => {
    cover("admin-voxel-barcode");
    expect(SANJI?.bands.hair?.hex).toBe("#F2E205"); // 黃髮
    expect(LUFFY?.bands.hatBand?.hex).toBe("#E8112D"); // 紅帽帶
    expect(ZORO?.bands.waist?.hex).toBe("#111111"); // 黑腹卷
  });
});

// ---------------------------------------------------------------- round trip

describe("docToForm → formToDoc is lossless for an authored barcode", () => {
  it.each([
    ["香吉士", "placeholder.sanji"],
    ["魯夫", "godie-u00n"],
    ["索隆", "godie-udre"],
  ])("%s survives the editor untouched", (_zh, id) => {
    cover("admin-voxel-barcode");
    const original = SEED[id]!;
    const back = formToDoc(docToForm(original, id));
    // `note` is authoring prose the editor keeps; everything that DRAWS must
    // come back identical, band for band.
    expect(back.bands).toEqual(original.bands);
    expect(back.sleeve).toBe(original.sleeve);
    expect(back.faceColors).toEqual(original.faceColors);
    expect(back.championId).toBe(id);
    expect(back.source).toBe("manual");
  });

  it("an absent slot is stored as an explicit null, never omitted", () => {
    cover("admin-voxel-barcode");
    // 香吉士 has no hat band, no brim, no collar, no chest trim, no waist and
    // NO BARE SHIN — that last one is the thing that distinguishes him from
    // 魯夫 below the belt, and a truncated record could not say it.
    const doc = formToDoc(docToForm(SANJI, "placeholder.sanji"));
    expect(Object.keys(doc.bands)).toEqual([...BARCODE_SLOTS]);
    expect(doc.bands.shin).toBeNull();
    expect(doc.bands.hatBand).toBeNull();
    expect(doc.bands.waist).toBeNull();
    // …and the ones he HAS are not null
    expect(doc.bands.hair).not.toBeNull();
    expect(doc.bands.shoe).not.toBeNull();
  });

  it("a champion with no barcode anywhere opens on a paintable starting point", () => {
    cover("admin-voxel-barcode");
    const form = docToForm(null, "godie-newbie");
    // not eleven empty boxes — an editor that opens blank invites saving a
    // figure with no legs, which validateForm would then have to refuse
    expect(formValid(form)).toBe(true);
    expect(presentSlots(form).length).toBeGreaterThanOrEqual(4);
    expect(Math.abs(totalFracOf(form) - 1)).toBeLessThan(1e-3);
  });
});

// ----------------------------------------------------------------- structure

describe("色帶是外觀，分節是結構 —— the hip joint survives colour equality", () => {
  it("香吉士's suit is ONE hex and TWO slots, and they are not the same object", () => {
    cover("admin-voxel-barcode");
    const doc = formToDoc(docToForm(SANJI, "placeholder.sanji"));
    expect(doc.bands.top!.hex).toBe(doc.bands.pants!.hex); // the same black
    expect(doc.bands.top).not.toBe(doc.bands.pants); // …but not the same band
    // and both still reach the preview as separate stripes
    const rows = previewStack(docToForm(SANJI, "placeholder.sanji"));
    expect(rows.filter((r) => r.hex === "#0D0D0D").map((r) => r.slot)).toEqual([
      "top",
      "pants",
    ]);
  });

  it("editing 上衣 does not drag 下身 with it", () => {
    cover("admin-voxel-barcode");
    const edited = setBand(docToForm(SANJI, "placeholder.sanji"), "top", { hex: "#123456" });
    const doc = formToDoc(edited);
    expect(doc.bands.top!.hex).toBe("#123456");
    expect(doc.bands.pants!.hex).toBe("#0D0D0D");
  });

  it("the eleven slots keep their ANATOMICAL order through the preview", () => {
    cover("admin-voxel-barcode");
    // Luffy top-to-bottom: 草帽褐 / 紅帽帶 / 黑帽緣 / 膚 / 紅背心 / 藍短褲 /
    // 膚色小腿 / 褐涼鞋. Re-ordering the slot list would re-stack the character
    // (the red band would migrate down onto his face), so ORDER IS THE DATA.
    expect(previewStack(docToForm(LUFFY, "godie-u00n")).map((r) => r.slot)).toEqual([
      "hair",
      "hatBand",
      "hatBrim",
      "face",
      "top",
      "pants",
      "shin",
      "shoe",
    ]);
  });
});

// ------------------------------------------------------------------- preview

describe("previewStack is the picture, in percent of the figure", () => {
  it("每一帶的高度就是它的佔比", () => {
    cover("admin-voxel-barcode");
    const rows = previewStack(docToForm(LUFFY, "godie-u00n"));
    const bySlot = new Map(rows.map((r) => [r.slot, r]));
    expect(bySlot.get("hair")!.heightPct).toBeCloseTo(16, 6);
    // 紅帽帶: 4% of the figure. Small, and it is HALF of why Luffy is Luffy.
    expect(bySlot.get("hatBand")!.heightPct).toBeCloseTo(4, 6);
    expect(bySlot.get("hatBand")!.hex).toBe("#E8112D");
    expect(bySlot.get("shin")!.heightPct).toBeCloseTo(12, 6);
    // the whole figure is covered — no transparent strip anywhere
    expect(rows.reduce((n, r) => n + r.heightPct, 0)).toBeCloseTo(100, 6);
  });

  it("an un-normalised barcode still previews at full height", () => {
    cover("admin-voxel-barcode");
    // halve every frac: the RATIOS are the picture, the sum is bookkeeping
    let form = docToForm(ZORO, "godie-udre");
    for (const slot of presentSlots(form)) {
      form = setBand(form, slot, { frac: String(Number(form.bands[slot].frac) / 2) });
    }
    const rows = previewStack(form);
    expect(rows.reduce((n, r) => n + r.heightPct, 0)).toBeCloseTo(100, 6);
    expect(rows.find((r) => r.slot === "waist")!.heightPct).toBeCloseTo(8, 6);
  });

  it("a band switched to 無 leaves the stack and the others re-fill the figure", () => {
    cover("admin-voxel-barcode");
    const form = setBand(docToForm(LUFFY, "godie-u00n"), "hatBand", { present: false });
    const rows = previewStack(form);
    expect(rows.map((r) => r.slot)).not.toContain("hatBand");
    expect(rows.reduce((n, r) => n + r.heightPct, 0)).toBeCloseTo(100, 6);
    // …and 草帽褐 grew, because the 4% had to go somewhere
    expect(rows.find((r) => r.slot === "hair")!.heightPct).toBeGreaterThan(16);
  });

  it("nothing present ⇒ an empty stack, never a filler band", () => {
    cover("admin-voxel-barcode");
    let form = docToForm(LUFFY, "godie-u00n");
    for (const slot of BARCODE_SLOTS) form = setBand(form, slot, { present: false });
    expect(previewStack(form)).toEqual([]);
  });
});

describe("the arms are derived from sleeve, not authored", () => {
  it("索隆 長袖 = 整支上衣色; 魯夫 無袖 = 整支膚色", () => {
    cover("admin-voxel-barcode");
    expect(sleevePreview(docToForm(ZORO, "godie-udre"))).toEqual({
      upper: "#EFEFEF",
      lower: "#EFEFEF",
    });
    expect(sleevePreview(docToForm(LUFFY, "godie-u00n"))).toEqual({
      upper: "#F5CBA0",
      lower: "#F5CBA0",
    });
  });

  it("短袖 splits the arm between 上衣 and 膚", () => {
    cover("admin-voxel-barcode");
    const form = { ...docToForm(ZORO, "godie-udre"), sleeve: "short" as const };
    expect(sleevePreview(form)).toEqual({ upper: "#EFEFEF", lower: "#F5CBA0" });
  });

  it("returns null rather than inventing a colour the rule needs", () => {
    cover("admin-voxel-barcode");
    const noSkin = setBand(docToForm(LUFFY, "godie-u00n"), "face", { present: false });
    expect(sleevePreview(noSkin)).toBeNull();
  });
});

// ---------------------------------------------------------------- validation

describe("validateForm refuses the four things that ship a broken character", () => {
  it("a 泥巴柱 is refused — the whole point is that the bands DIFFER", () => {
    cover("admin-voxel-barcode");
    let form = docToForm(ZORO, "godie-udre");
    for (const slot of presentSlots(form)) form = setBand(form, slot, { hex: "#404244" });
    expect(maxPairwiseDeltaEOf(form)).toBeLessThan(25);
    expect(validateForm(form).general.join("|")).toContain("泥巴柱");
    expect(formValid(form)).toBe(false);
  });

  it("a part with no band is refused — that box would go unpainted", () => {
    cover("admin-voxel-barcode");
    let form = docToForm(ZORO, "godie-udre");
    form = setBand(form, "pants", { present: false });
    form = setBand(form, "shoe", { present: false });
    form = setBand(form, "shin", { present: false });
    expect(validateForm(form).general.join("|")).toContain("legs");
    expect(formValid(form)).toBe(false);
  });

  it("a frac sum that is not 1.0 is refused, and 正規化 fixes it", () => {
    cover("admin-voxel-barcode");
    const off = setBand(docToForm(ZORO, "godie-udre"), "top", { frac: "0.9" });
    expect(formValid(off)).toBe(false);
    const fixed = normalizeForm(off);
    expect(Math.abs(totalFracOf(fixed) - 1)).toBeLessThan(1e-9);
    expect(formValid(fixed)).toBe(true);
    // …and normalising PRESERVED the ratios rather than flattening them.
    // Bounded rather than exact: the boxes hold four decimals and the rounding
    // residue is parked on the largest band, so 上衣:腹卷 lands within ~0.05%
    // of 0.9:0.08 instead of on it. A flattening bug would land at 1.0.
    const rows = previewStack(fixed);
    const top = rows.find((r) => r.slot === "top")!.heightPct;
    const waist = rows.find((r) => r.slot === "waist")!.heightPct;
    expect(top / waist).toBeGreaterThan(11.2);
    expect(top / waist).toBeLessThan(11.3);
  });

  it("a malformed hex is refused on the slot that carries it", () => {
    cover("admin-voxel-barcode");
    const bad = setBand(docToForm(ZORO, "godie-udre"), "hair", { hex: "#1E9" });
    expect(validateForm(bad).bands["hair.hex"]).toBeTruthy();
    expect(validateForm(bad).bands["top.hex"]).toBeUndefined();
    expect(formValid(bad)).toBe(false);
  });

  it("§2.2's typical range is a WARNING, never an error — 香吉士 proves it must be", () => {
    cover("admin-voxel-barcode");
    // his pants are 0.32 against a [0.18, 0.28] prior. A five-slot character's
    // maxima total 0.96, so normalising to 1.0 MUST push someone out of range;
    // treating the table as hard would reject a correct barcode.
    const form = docToForm(SANJI, "placeholder.sanji");
    expect(formValid(form)).toBe(true);
    expect(validateForm(form).warnings.join("|")).toContain("典型區間");
  });

  it("every shipped seed barcode passes the editor's own validator", () => {
    cover("admin-voxel-barcode");
    for (const [id, barcode] of Object.entries(SEED)) {
      const errs = validateForm(docToForm(barcode, id));
      expect(errs.general, `${id} 過不了後台的驗證`).toEqual([]);
      expect(errs.bands, `${id} 有壞掉的色帶`).toEqual({});
    }
  });
});

// -------------------------------------------------------------------- doc IO

describe("patchBarcodeDoc splices ONE champion and carries the rest", () => {
  const OTHERS: Record<string, unknown> = {
    id: BARCODE_DOC_ID,
    schema: "config.voxel-barcodes@1",
    barcodes: {
      "godie-u00n": LUFFY,
      "godie-udre": ZORO,
    },
  };

  it("the other champions' barcodes are byte-identical afterwards", () => {
    cover("admin-voxel-barcode");
    const edited = formToDoc(
      setBand(docToForm(SANJI, "placeholder.sanji"), "hair", { hex: "#ABCDEF" }),
    );
    const next = patchBarcodeDoc(OTHERS, edited);
    const out = extractBarcodes(next);
    // the overlay stores WHOLE documents — a save that rebuilt `barcodes` from
    // the one champion on screen would delete every other authored barcode
    expect(out["godie-u00n"]).toEqual(LUFFY);
    expect(out["godie-udre"]).toEqual(ZORO);
    expect(out["placeholder.sanji"]!.bands.hair!.hex).toBe("#ABCDEF");
  });

  it("writes the doc's own identity so the merged tree still validates", () => {
    cover("admin-voxel-barcode");
    const next = patchBarcodeDoc(null, formToDoc(docToForm(ZORO, "godie-udre")));
    expect(next["id"]).toBe(BARCODE_DOC_ID);
    expect(next["schema"]).toBe("config.voxel-barcodes@1");
    // the slot order travels with the file, so a formatter that alphabetised
    // the keys shows up as a diff instead of re-stacking every character
    expect(next["slotOrder"]).toEqual([...BARCODE_SLOTS]);
  });

  it("forgetBarcode drops exactly one champion", () => {
    cover("admin-voxel-barcode");
    const out = extractBarcodes(forgetBarcode(OTHERS, "godie-u00n"));
    expect(out["godie-u00n"]).toBeUndefined();
    expect(out["godie-udre"]).toEqual(ZORO);
  });

  it("a corrupt overlay leaves the page usable instead of throwing", () => {
    cover("admin-voxel-barcode");
    expect(extractBarcodes(null)).toEqual({});
    expect(extractBarcodes({ barcodes: "nope" })).toEqual({});
    expect(extractBarcodes({ barcodes: { x: 7, y: { bands: {} } } })).toEqual({
      y: { bands: {} },
    });
  });

  it("the write target is the durable overlay key, not the sidecar", () => {
    cover("admin-voxel-barcode");
    // The seed lives at models/_voxel-barcodes.json and CANNOT be the target:
    // the platform's overlay id regex forbids a leading underscore, so
    // `models/_voxel-barcodes` is a 400 with no alternative spelling.
    expect(BARCODE_COLLECTION).toBe("config");
    expect(BARCODE_DOC_ID).toBe("voxel-barcodes");
    expect(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(BARCODE_DOC_ID)).toBe(true);
    expect(/^[a-z][a-z0-9-]{0,31}$/.test(BARCODE_COLLECTION)).toBe(true);
  });
});

// ---------------------------------------------------------------- resolution

describe("後台改過的版本 vs 出貨預設值 is a fact about the data", () => {
  const EDITED: VoxelBarcode = {
    ...ZORO,
    bands: { ...ZORO.bands, hair: { hex: "#00FF00", frac: 0.18 } },
  };

  it("the overlay wins, and the origin says so", () => {
    cover("admin-voxel-barcode");
    const r = resolveBarcode("godie-udre", { "godie-udre": EDITED }, SEED);
    expect(r.origin).toBe("overlay");
    expect(r.barcode!.bands.hair!.hex).toBe("#00FF00");
  });

  it("a champion nobody edited reads from the seed", () => {
    cover("admin-voxel-barcode");
    const r = resolveBarcode("godie-udre", {}, SEED);
    expect(r.origin).toBe("seed");
    expect(r.barcode!.bands.hair!.hex).toBe("#1E9E3E");
  });

  it("a champion on neither layer is 還沒有條碼, not a fabricated one", () => {
    cover("admin-voxel-barcode");
    expect(resolveBarcode("godie-nobody", {}, SEED)).toEqual({ barcode: null, origin: "none" });
  });

  it("the two layers are never merged — a half-merged barcode is a look nobody chose", () => {
    cover("admin-voxel-barcode");
    const partial = { "godie-udre": { ...ZORO, bands: { ...ZORO.bands, waist: null } } };
    const r = resolveBarcode("godie-udre", partial, SEED);
    // the seed HAS a waist band; the overlay says there is none, and that wins
    expect(r.barcode!.bands.waist).toBeNull();
  });
});

describe("the champion picker can reach every barcode there is", () => {
  it("includes placeholder ids the roster does not contain", () => {
    cover("admin-voxel-barcode");
    // 香吉士 is parked at `placeholder.sanji` because no such champion exists.
    // A picker built only from /content/champions would ship his barcode and
    // make it uneditable.
    const roster = [{ id: "godie-udre", name: "索隆" }];
    const ids = championChoices(roster, {}, SEED).map((c) => c.id);
    expect(ids).toContain("placeholder.sanji");
    expect(ids).toContain("godie-u00n");
    expect(ids).toContain("godie-udre");
  });

  it("never lists a champion twice when it is on both the roster and a layer", () => {
    cover("admin-voxel-barcode");
    const ids = championChoices([{ id: "godie-udre", name: "索隆" }], { "godie-udre": ZORO }, SEED)
      .map((c) => c.id)
      .filter((id) => id === "godie-udre");
    expect(ids).toHaveLength(1);
  });
});

describe("未儲存 is measured against the barcode the form was seeded from", () => {
  it("an untouched form is clean; one changed digit is dirty", () => {
    cover("admin-voxel-barcode");
    const form: BarcodeForm = docToForm(ZORO, "godie-udre");
    expect(isDirty(form, ZORO)).toBe(false);
    expect(isDirty(setBand(form, "waist", { hex: "#222222" }), ZORO)).toBe(true);
    // switching a slot off is a change too — that is how a character loses a
    // feature, and it must never be silent
    expect(isDirty(setBand(form, "waist", { present: false }), ZORO)).toBe(true);
  });

  it("a champion with no barcode is dirty from the start (saving CREATES one)", () => {
    cover("admin-voxel-barcode");
    expect(isDirty(docToForm(null, "godie-newbie"), null)).toBe(true);
  });
});
