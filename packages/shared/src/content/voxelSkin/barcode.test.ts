/**
 * barcode — 特徵生成 batch one, the contract layer.
 *
 * WHAT THESE TESTS REFUSE TO DO. This repo's number-one failure mode is
 * "shipped it but the player never gets it", and two of its seven known shapes
 * are exactly what a pure-function suite falls into by default:
 *
 *   ⑥ source scanning — `expect(src).toMatch(/barcodeToParts/)` proves a line
 *      was typed into a file, not that it ran;
 *   ④ assertions pointed away from the defect — `expect(bands).toHaveProperty
 *      ("hair")` is green for every wrong stacking, every wrong part, every
 *      wrong normalisation.
 *
 * So every assertion below is about the RESULT of a dispatch: which colour owns
 * which slice of which part. "#E8112D covers 44.4%..55.6% down Luffy's head" is
 * a claim about the picture; break the part table, the slot order, the
 * per-part re-normalisation or the span accumulation and it goes red.
 *
 * The mutation list this was built against is in the task write-up; each test
 * below names the edit that turns it red.
 */
import { describe, it, expect } from "vitest";
import {
  BARCODE_MIN_BANDS,
  BARCODE_MUD_COLUMN_DELTA_E,
  BARCODE_PARTS,
  BARCODE_SLOTS,
  BARCODE_SLOT_PART,
  isPlaceholderBarcodeId,
  type BarcodeBands,
  type BarcodeSlot,
  type VoxelBarcode,
} from "./types";
import {
  bandAtDepth,
  barcodeErrors,
  barcodeToParts,
  deltaE76,
  hexToLab,
  isBarcodeHex,
  maxPairwiseDeltaE,
  normalizeBarcode,
  presentBands,
  sleeveColors,
  totalFrac,
  validateBarcode,
} from "./barcode";

// ---------------------------------------------------------------------------
// fixtures — built here, not read from disk, so a data edit can never quietly
// change what a behavioural test means. The seed FILE is checked separately.
// ---------------------------------------------------------------------------

function bandsOf(spec: Partial<Record<BarcodeSlot, [string, number]>>): BarcodeBands {
  const out = {} as Record<BarcodeSlot, { hex: string; frac: number } | null>;
  for (const slot of BARCODE_SLOTS) {
    const v = spec[slot];
    out[slot] = v ? { hex: v[0], frac: v[1] } : null;
  }
  return out;
}

const face = { eye: "#1A1A1A", nose: null, mouth: "#B5705C" };

/** 香吉士 — the same-hex top/pants case. */
const SANJI: VoxelBarcode = {
  v: 1,
  championId: "placeholder.sanji",
  bands: bandsOf({
    hair: ["#F2E205", 0.2],
    face: ["#F5CBA0", 0.14],
    top: ["#0D0D0D", 0.26],
    pants: ["#0D0D0D", 0.32],
    shoe: ["#000000", 0.08],
  }),
  sleeve: "long",
  faceColors: face,
  source: "manual",
};

/** 魯夫 — the fine-band case (red hat band) and the bare-shin case. */
const LUFFY: VoxelBarcode = {
  v: 1,
  championId: "godie-u00n",
  bands: bandsOf({
    hair: ["#C9A96A", 0.16],
    hatBand: ["#E8112D", 0.04],
    hatBrim: ["#111111", 0.03],
    face: ["#F5CBA0", 0.13],
    top: ["#E8112D", 0.22],
    pants: ["#0B5394", 0.22],
    shin: ["#F5CBA0", 0.12],
    shoe: ["#8A6A3A", 0.08],
  }),
  sleeve: "none",
  faceColors: face,
  source: "manual",
};

/** 索隆 — the 腹卷 case: a fine band inside the torso. */
const ZORO: VoxelBarcode = {
  v: 1,
  championId: "godie-udre",
  bands: bandsOf({
    hair: ["#1E9E3E", 0.18],
    face: ["#F5CBA0", 0.13],
    top: ["#EFEFEF", 0.25],
    waist: ["#111111", 0.08],
    pants: ["#16301A", 0.28],
    shoe: ["#111111", 0.08],
  }),
  sleeve: "long",
  faceColors: face,
  source: "manual",
};

const near = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);

// ---------------------------------------------------------------------------

describe("slot table", () => {
  it("is the anatomical order, head to sole — not alphabetical, not grouped", () => {
    // The order IS the data: index 0 paints the top of the figure. An editor
    // that sorted these keys would move Luffy's red hat band onto his chin.
    expect([...BARCODE_SLOTS]).toEqual([
      "hair",
      "hatBand",
      "hatBrim",
      "face",
      "collar",
      "chestTrim",
      "top",
      "waist",
      "pants",
      "shin",
      "shoe",
    ]);
  });

  it("dispatches 1–4 to head, 5–8 to torso, 9–11 to legs (規格 §7)", () => {
    expect(BARCODE_SLOTS.map((s) => BARCODE_SLOT_PART[s])).toEqual([
      "head",
      "head",
      "head",
      "head",
      "torso",
      "torso",
      "torso",
      "torso",
      "legs",
      "legs",
      "legs",
    ]);
  });
});

describe("normalizeBarcode", () => {
  it("scales present bands to sum exactly 1.0 while preserving their ratios", () => {
    // Deliberately un-normalised: every band doubled. A normaliser that just
    // returned its input, or clamped instead of scaling, fails here.
    const doubled: VoxelBarcode = {
      ...ZORO,
      bands: bandsOf({
        hair: ["#1E9E3E", 0.36],
        face: ["#F5CBA0", 0.26],
        top: ["#EFEFEF", 0.5],
        waist: ["#111111", 0.16],
        pants: ["#16301A", 0.56],
        shoe: ["#111111", 0.16],
      }),
    };
    expect(totalFrac(doubled.bands)).toBeCloseTo(2, 10);

    const n = normalizeBarcode(doubled);
    near(totalFrac(n.bands), 1);
    // ratios intact, not merely the sum
    near(n.bands.hair!.frac, 0.18);
    near(n.bands.waist!.frac, 0.08);
    near(n.bands.pants!.frac, 0.28);
    // MUTATION: drop the `/ total` in normalizeBarcode → totalFrac stays 2 → red.
  });

  it("keeps all eleven keys and every absent slot explicitly null", () => {
    const n = normalizeBarcode(SANJI);
    expect(Object.keys(n.bands)).toEqual([...BARCODE_SLOTS]);
    expect(n.bands.hatBand).toBeNull();
    expect(n.bands.shin).toBeNull();
    // MUTATION: build the output by filtering out nulls → key list shrinks → red.
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(SANJI.bands);
    normalizeBarcode(SANJI);
    expect(JSON.stringify(SANJI.bands)).toBe(before);
  });

  it("throws rather than shipping a zero-height stack", () => {
    const dead: VoxelBarcode = {
      ...SANJI,
      bands: bandsOf({ hair: ["#F2E205", 0], top: ["#0D0D0D", 0], pants: ["#0D0D0D", 0] }),
    };
    expect(() => normalizeBarcode(dead)).toThrow(/cannot normalise/);
  });
});

describe("barcodeToParts — the dispatch, asserted as spans of the picture", () => {
  it("puts Luffy's four head bands at the exact percentages down his head", () => {
    const parts = barcodeToParts(LUFFY);
    const head = parts.head;
    // head bands total 0.16+0.04+0.03+0.13 = 0.36 of the FIGURE; within the
    // head box they re-normalise to these shares:
    expect(head.map((b) => b.slot)).toEqual(["hair", "hatBand", "hatBrim", "face"]);
    near(head[0]!.frac, 0.16 / 0.36);
    near(head[1]!.frac, 0.04 / 0.36);
    near(head[2]!.frac, 0.03 / 0.36);
    near(head[3]!.frac, 0.13 / 0.36);

    // straw crown 0 → 44.44%, RED HAT BAND 44.44 → 55.56%, black brim
    // 55.56 → 63.89%, skin 63.89 → 100%.
    near(head[0]!.from, 0);
    near(head[0]!.to, 0.4444444444444444);
    near(head[1]!.from, 0.4444444444444444);
    near(head[1]!.to, 0.5555555555555556);
    near(head[2]!.to, 0.6388888888888888);
    expect(head[3]!.to).toBe(1);
    // MUTATION: re-normalise across the whole figure instead of per part
    // (drop the `/ total` inside barcodeToParts) → every span shrinks → red.
  });

  it("answers 'what colour is N% down the head' with the right hex", () => {
    const parts = barcodeToParts(LUFFY);
    // This is the assertion the whole barcode exists for: the red hat band is
    // 4% of the figure and it MUST still be its own visible stripe.
    expect(bandAtDepth(parts, "head", 0.2)?.hex).toBe("#C9A96A"); // straw
    expect(bandAtDepth(parts, "head", 0.5)?.hex).toBe("#E8112D"); // 紅帽帶
    expect(bandAtDepth(parts, "head", 0.6)?.hex).toBe("#111111"); // 黑帽緣
    expect(bandAtDepth(parts, "head", 0.8)?.hex).toBe("#F5CBA0"); // 膚
    expect(bandAtDepth(parts, "head", 1)?.slot).toBe("face");
    // MUTATION: drop hatBand from the barcode (the "small bands are noise"
    // simplification the spec forbids) → 0.5 returns straw → red.
  });

  it("keeps Luffy's bare shins between his shorts and his sandals", () => {
    const parts = barcodeToParts(LUFFY);
    expect(parts.legs.map((b) => b.slot)).toEqual(["pants", "shin", "shoe"]);
    expect(bandAtDepth(parts, "legs", 0.3)?.hex).toBe("#0B5394"); // 藍短褲
    expect(bandAtDepth(parts, "legs", 0.6)?.hex).toBe("#F5CBA0"); // 膚色小腿
    expect(bandAtDepth(parts, "legs", 0.9)?.hex).toBe("#8A6A3A"); // 涼鞋
    // legs total 0.22+0.12+0.08 = 0.42
    near(parts.legs[1]!.from, 0.22 / 0.42);
    near(parts.legs[1]!.to, 0.34 / 0.42);
    // MUTATION: map `shin` to torso in BARCODE_SLOT_PART → 0.6 returns the
    // sandal brown → red.
  });

  it("keeps Zoro's 黑腹卷 as the bottom quarter of his torso", () => {
    const parts = barcodeToParts(ZORO);
    expect(parts.torso.map((b) => b.slot)).toEqual(["top", "waist"]);
    expect(bandAtDepth(parts, "torso", 0.3)?.hex).toBe("#EFEFEF"); // 白襯衫
    expect(bandAtDepth(parts, "torso", 0.9)?.hex).toBe("#111111"); // 黑腹卷
    near(parts.torso[1]!.from, 0.25 / 0.33);
    // MUTATION: sort a part's bands by frac (largest first) → 0.9 returns
    // white → red.
  });

  it("makes every part's bands sum to 1 and tile it with no gap", () => {
    for (const barcode of [SANJI, LUFFY, ZORO]) {
      const parts = barcodeToParts(barcode);
      for (const part of BARCODE_PARTS) {
        const rows = parts[part];
        expect(rows.length, `${barcode.championId} ${part}`).toBeGreaterThan(0);
        near(
          rows.reduce((n, r) => n + r.frac, 0),
          1,
        );
        expect(rows[0]!.from).toBe(0);
        expect(rows[rows.length - 1]!.to).toBe(1);
        for (let i = 1; i < rows.length; i++) expect(rows[i]!.from).toBe(rows[i - 1]!.to);
      }
    }
  });

  it("reports an empty list, not a filler colour, for a part with no bands", () => {
    const headOnly: VoxelBarcode = {
      ...SANJI,
      bands: bandsOf({ hair: ["#F2E205", 0.6], face: ["#F5CBA0", 0.4] }),
    };
    const parts = barcodeToParts(headOnly);
    expect(parts.head.length).toBe(2);
    expect(parts.torso).toEqual([]);
    expect(parts.legs).toEqual([]);
    expect(bandAtDepth(parts, "legs", 0.5)).toBeNull();
  });

  it("accepts an un-normalised barcode — per-part shares do not depend on the total", () => {
    const half = normalizeBarcode({
      ...LUFFY,
      bands: bandsOf({
        hair: ["#C9A96A", 8],
        hatBand: ["#E8112D", 2],
        hatBrim: ["#111111", 1.5],
        face: ["#F5CBA0", 6.5],
        top: ["#E8112D", 11],
        pants: ["#0B5394", 11],
        shin: ["#F5CBA0", 6],
        shoe: ["#8A6A3A", 4],
      }),
    });
    expect(barcodeToParts(half).head.map((b) => b.to)).toEqual(
      barcodeToParts(LUFFY).head.map((b) => b.to),
    );
  });
});

describe("同色相鄰帶不可合併 — the hip joint", () => {
  it("keeps Sanji's identically-coloured suit as two slots on two parts", () => {
    // The picture: one black rectangle with a hairline across it. The
    // structure: torso and legs, two boxes that rotate independently.
    expect(SANJI.bands.top!.hex).toBe(SANJI.bands.pants!.hex);
    // distinct objects, so no downstream identity check can weld them
    expect(SANJI.bands.top).not.toBe(SANJI.bands.pants);

    const parts = barcodeToParts(SANJI);
    expect(parts.torso.map((b) => b.slot)).toEqual(["top"]);
    expect(parts.legs.map((b) => b.slot)).toEqual(["pants", "shoe"]);
    expect(parts.torso[0]!.hex).toBe("#0D0D0D");
    expect(parts.legs[0]!.hex).toBe("#0D0D0D");
    // and the black is a FULL torso plus 80% of the legs — not one merged run
    expect(parts.torso[0]!.frac).toBe(1);
    near(parts.legs[0]!.frac, 0.32 / 0.4);
    // MUTATION: add a "merge runs whose hex matches" pass to barcodeToParts →
    // torso keeps `top`, legs loses `pants`, or the two collapse into one
    // cross-part run → red on the slot lists.
  });

  it("survives normalisation as two separate band objects", () => {
    const n = normalizeBarcode(SANJI);
    expect(n.bands.top!.hex).toBe(n.bands.pants!.hex);
    expect(n.bands.top).not.toBe(n.bands.pants);
    // MUTATION: memoise band objects by hex inside rebuildBands → red.
  });

  it("keeps two same-hex neighbours INSIDE one part as two spans", () => {
    // The cross-part case above is caught by the slot lists alone, so a merge
    // pass that runs after the dispatch would slip past it. This is the same
    // rule applied WITHIN a part — a black shirt over a black waist sash —
    // where merging would be invisible except that the waist stops being
    // separately addressable and the admin can no longer recolour it alone.
    const blackOnBlack: VoxelBarcode = {
      ...ZORO,
      championId: "placeholder.black-on-black",
      bands: bandsOf({
        hair: ["#1E9E3E", 0.18],
        face: ["#F5CBA0", 0.13],
        top: ["#0D0D0D", 0.25],
        waist: ["#0D0D0D", 0.08],
        pants: ["#16301A", 0.28],
        shoe: ["#111111", 0.08],
      }),
    };
    const torso = barcodeToParts(blackOnBlack).torso;
    expect(torso.map((b) => b.slot)).toEqual(["top", "waist"]);
    expect(torso.map((b) => b.hex)).toEqual(["#0D0D0D", "#0D0D0D"]);
    near(torso[0]!.to, 0.25 / 0.33);
    near(torso[1]!.from, 0.25 / 0.33);
    expect(torso[1]!.to).toBe(1);
    // MUTATION: a "merge runs whose hex matches" pass anywhere in
    // barcodeToParts → torso collapses to one span → red.
  });

  it("never collapses the band count: present slots in = bands out", () => {
    for (const barcode of [SANJI, LUFFY, ZORO]) {
      const n = presentBands(barcode.bands).length;
      const parts = barcodeToParts(barcode);
      const out = BARCODE_PARTS.reduce((sum, p) => sum + parts[p].length, 0);
      expect(out, `${barcode.championId} band count`).toBe(n);
    }
  });
});

describe("deltaE76 / maxPairwiseDeltaE", () => {
  it("puts pure black at (0,0,0) and pure white at exactly (100,0,0)", () => {
    expect([...hexToLab("#000000")]).toEqual([0, 0, 0]);
    // exact, not approximate — the white point is derived from the matrix
    expect([...hexToLab("#FFFFFF")]).toEqual([100, 0, 0]);
  });

  it("gives exactly 100 between black and white, and 0 for a colour with itself", () => {
    // An anchor no implementation detail can fudge: if the Lab conversion or
    // the distance formula is wrong, this number is not 100.
    expect(deltaE76("#000000", "#FFFFFF")).toBe(100);
    expect(deltaE76("#0D0D0D", "#0D0D0D")).toBe(0);
    expect(deltaE76("#0d0d0d", "#0D0D0D")).toBe(0); // case-insensitive
  });

  it("reads a real character as far above the mud-column floor", () => {
    // Sanji's yellow hair against his black suit is the extreme pair.
    expect(maxPairwiseDeltaE(SANJI)).toBeGreaterThan(90);
    expect(maxPairwiseDeltaE(LUFFY)).toBeGreaterThan(BARCODE_MUD_COLUMN_DELTA_E);
    expect(maxPairwiseDeltaE(ZORO)).toBeGreaterThan(BARCODE_MUD_COLUMN_DELTA_E);
  });

  it("reads a mud column as below the floor", () => {
    const mud: VoxelBarcode = {
      ...SANJI,
      championId: "placeholder.mud",
      bands: bandsOf({
        hair: ["#7E7E82", 0.2],
        face: ["#84848A", 0.15],
        top: ["#787880", 0.25],
        pants: ["#828288", 0.3],
        shoe: ["#7C7C84", 0.1],
      }),
    };
    expect(maxPairwiseDeltaE(mud)).toBeLessThan(BARCODE_MUD_COLUMN_DELTA_E);
    // MUTATION: make maxPairwiseDeltaE return 999 (the spec's own listed
    // mutation #4) → this and the mud-column validator test both go red.
  });

  it("is 0 for a single-band figure — one colour IS a mud column", () => {
    const solid: VoxelBarcode = { ...SANJI, bands: bandsOf({ top: ["#0D0D0D", 1] }) };
    expect(maxPairwiseDeltaE(solid)).toBe(0);
  });
});

describe("validateBarcode", () => {
  const codes = (b: VoxelBarcode): string[] => validateBarcode(b).map((i) => i.code);

  it("passes the three named characters with zero errors", () => {
    for (const barcode of [SANJI, LUFFY, ZORO]) {
      expect(barcodeErrors(barcode), `${barcode.championId}`).toEqual([]);
    }
  });

  it("warns — but does not error — on §2.2 range overflow", () => {
    // Sanji's pants are 0.32 against a typical max of 0.28. That is FORCED:
    // his five slots cap out at 0.96, so normalising to 1.0 must overflow
    // something. A hard range check would reject a correct barcode.
    const issues = validateBarcode(SANJI);
    const range = issues.filter((i) => i.code === "frac-out-of-range");
    expect(range.map((i) => i.slot)).toEqual(["pants"]);
    expect(range[0]!.severity).toBe("warn");
  });

  it("errors on 缺帶: a part with nothing to paint it", () => {
    const legless: VoxelBarcode = {
      ...SANJI,
      bands: bandsOf({ hair: ["#F2E205", 0.3], face: ["#F5CBA0", 0.2], top: ["#0D0D0D", 0.5] }),
    };
    const missing = validateBarcode(legless).filter((i) => i.code === "missing-band");
    expect(missing.map((i) => i.part)).toEqual(["legs"]);
    expect(missing[0]!.severity).toBe("error");
  });

  it("errors on 泥巴柱 and names the ΔE it measured", () => {
    const mud: VoxelBarcode = {
      ...SANJI,
      bands: bandsOf({
        hair: ["#7E7E82", 0.2],
        face: ["#84848A", 0.15],
        top: ["#787880", 0.25],
        pants: ["#828288", 0.3],
        shoe: ["#7C7C84", 0.1],
      }),
    };
    const issue = validateBarcode(mud).find((i) => i.code === "mud-column");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("泥巴柱");
    // MUTATION: raise/remove the BARCODE_MUD_COLUMN_DELTA_E comparison → red.
  });

  it("errors on an un-normalised total and stays silent once normalised", () => {
    const raw: VoxelBarcode = {
      ...ZORO,
      bands: bandsOf({
        hair: ["#1E9E3E", 0.36],
        face: ["#F5CBA0", 0.26],
        top: ["#EFEFEF", 0.5],
        waist: ["#111111", 0.16],
        pants: ["#16301A", 0.56],
        shoe: ["#111111", 0.16],
      }),
    };
    expect(codes(raw)).toContain("not-normalized");
    expect(codes(normalizeBarcode(raw))).not.toContain("not-normalized");
  });

  it("errors on a malformed hex and on a non-positive frac", () => {
    const bad: VoxelBarcode = {
      ...ZORO,
      bands: bandsOf({
        hair: ["#1E9E3E", 0.4],
        face: ["1E9E3E", 0.2], // no '#'
        top: ["#EFEFEF", 0.2],
        pants: ["#16301A", 0.2],
        shoe: ["#111111", 0], // present but zero-height
      }),
    };
    const issues = validateBarcode(bad);
    expect(issues.find((i) => i.code === "bad-hex")?.slot).toBe("face");
    expect(issues.find((i) => i.code === "bad-frac")?.slot).toBe("shoe");
  });

  it("warns when there are fewer than four bands (§4.2 SUSPECT)", () => {
    const thin: VoxelBarcode = {
      ...SANJI,
      bands: bandsOf({
        hair: ["#F2E205", 0.3],
        top: ["#0D0D0D", 0.4],
        pants: ["#0B5394", 0.3],
      }),
    };
    const few = validateBarcode(thin).find((i) => i.code === "too-few-bands");
    expect(few?.severity).toBe("warn");
    expect(few?.message).toContain(String(BARCODE_MIN_BANDS));
  });

  it("errors when source says 'extracted' but no evidence is attached", () => {
    const orphan: VoxelBarcode = { ...LUFFY, source: "extracted" };
    const issue = validateBarcode(orphan).find((i) => i.code === "source-evidence-mismatch");
    expect(issue?.severity).toBe("error");
    // and the same barcode WITH evidence is clean again
    expect(
      barcodeErrors({
        ...orphan,
        extraction: {
          refImage: "icons/luffy.png",
          verdict: "PASS",
          reasons: [],
          maxPairwiseDeltaE: 71,
          foregroundRatio: 0.62,
        },
      }),
    ).toEqual([]);
  });
});

describe("sleeve (規格 §2.4)", () => {
  it("paints a long sleeve in the top colour and a bare arm in skin", () => {
    expect(sleeveColors(ZORO)).toEqual({ upper: "#EFEFEF", lower: "#EFEFEF" });
    expect(sleeveColors(LUFFY)).toEqual({ upper: "#F5CBA0", lower: "#F5CBA0" });
    expect(sleeveColors({ ...ZORO, sleeve: "short" })).toEqual({
      upper: "#EFEFEF",
      lower: "#F5CBA0",
    });
  });

  it("returns null rather than inventing a colour it does not have", () => {
    const noTop: VoxelBarcode = {
      ...ZORO,
      bands: bandsOf({ hair: ["#1E9E3E", 0.5], pants: ["#16301A", 0.5] }),
    };
    expect(sleeveColors(noTop)).toBeNull();
    expect(sleeveColors({ ...noTop, sleeve: "none" })).toBeNull();
  });
});

describe("hex + placeholder helpers", () => {
  it("accepts only #rrggbb", () => {
    expect(isBarcodeHex("#0D0D0D")).toBe(true);
    expect(isBarcodeHex("#0d0")).toBe(false); // shorthand rejected on purpose
    expect(isBarcodeHex("0D0D0D")).toBe(false);
    expect(isBarcodeHex("#0D0D0DFF")).toBe(false);
    expect(isBarcodeHex(null)).toBe(false);
  });

  it("marks only the placeholder namespace", () => {
    expect(isPlaceholderBarcodeId("placeholder.sanji")).toBe(true);
    expect(isPlaceholderBarcodeId("godie-u00n")).toBe(false);
  });
});
