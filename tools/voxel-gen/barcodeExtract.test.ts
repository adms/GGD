/**
 * The six guards of 規格 §4.2, one synthetic image each, plus the control.
 *
 * WHAT MAKES THESE NOT THE SEVEN KNOWN FAKE-GREENS:
 *
 * ⑥ 源碼掃描 — nothing here reads a source file or matches an identifier. Every
 *    assertion is on the VALUE the pipeline returned for real decoded pixels.
 * ⑦ 屬性掃描 — the subject is the extracted hex/verdict, not a label about it.
 * ⑤ 測的主體不是真的那個東西 — each fixture is encoded to PNG bytes and pushed
 *    through `decodePng`, so the decoder is on the path, not stubbed.
 * ④ 斷言方向與缺陷方向無關 — each guard test asserts the guard's OWN verdict and
 *    also pins the metric it keys on, and the fixtures are built so that only
 *    the named guard can fire (`mudColumn` has 4 bands so it cannot be the
 *    band-count guard; `twoBandFigure`'s bands are 142 ΔE apart so it cannot be
 *    the mud guard; `shortFigure` is wide enough to clear the foreground floor).
 * ③ 從渲染樹刪掉還是綠 — `cleanFiveBand` asserts PASS, so a guard that fired
 *    unconditionally would turn it red.
 *
 * Mutation results are recorded in the batch report; every guard below was
 * checked by breaking its threshold and watching this file go red.
 */
import { describe, it, expect } from "vitest";
import { BARCODE_MUD_COLUMN_DELTA_E, presentBands } from "@ggd/shared/content/voxelSkin";
import {
  adjudicate,
  assignSlots,
  barcodeFingerprint,
  coarseBucket,
  extractBarcode,
  modeColor,
  packedToHex,
  worstVerdict,
  MIN_BBOX_HEIGHT_RATIO,
  MIN_FOREGROUND_RATIO,
  type ExtractDraft,
} from "./barcodeExtract";
import { decodePng } from "./pngRead";
import {
  AA_FRINGE_HEXES,
  CLEAN_FIVE,
  CLEAN_THREE,
  FRAME_HEX,
  SPLIT_MAJOR,
  SPLIT_MEANS,
  antialiasedFigure,
  backgroundBleed,
  cleanFiveBand,
  cleanThreeBand,
  duplicatePair,
  framedFigure,
  mudColumn,
  shortFigure,
  splitColumn,
  toPng,
  twoBandFigure,
  type Canvas,
} from "./testImages";

/** Run a fixture through the WHOLE local path: encode → decode → extract. */
function run(name: string, make: () => Canvas): ExtractDraft {
  return extractBarcode(name, `${name}.png`, decodePng(toPng(make())));
}

function hexes(d: ExtractDraft): string[] {
  return d.barcode ? presentBands(d.barcode.bands).map((b) => b.hex) : [];
}

function slots(d: ExtractDraft): string[] {
  return d.barcode ? presentBands(d.barcode.bands).map((b) => b.slot) : [];
}

// ---------------------------------------------------------------------------
// the control — 驗收: "抽出來的三個 hex 就是畫進去的那三個"
// ---------------------------------------------------------------------------

describe("乾淨的三段條碼圖", () => {
  it("returns exactly the three hexes that were painted, in top-to-bottom order", () => {
    const d = run("clean3", cleanThreeBand);
    expect(hexes(d)).toEqual([...CLEAN_THREE]);
  });

  it("places them on head / torso / legs so all three boxes get a colour", () => {
    const d = run("clean3", cleanThreeBand);
    expect(slots(d)).toEqual(["hair", "top", "pants"]);
  });

  it("normalises the shares to 1.0", () => {
    const d = run("clean3", cleanThreeBand);
    const total = presentBands(d.barcode!.bands).reduce((n, b) => n + b.frac, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("records itself as extracted evidence, never as a manual decision", () => {
    const d = run("clean3", cleanThreeBand);
    expect(d.barcode!.source).toBe("extracted");
    expect(d.barcode!.extraction!.refImage).toBe("clean3.png");
    expect(d.barcode!.extraction!.verdict).toBe(d.verdict);
  });

  it("passes clean with five well-separated bands — the guards are not always-on", () => {
    const d = run("clean5", cleanFiveBand);
    expect(d.verdict).toBe("PASS");
    expect(hexes(d)).toEqual([...CLEAN_FIVE]);
  });
});

// ---------------------------------------------------------------------------
// §4.1-3 — MODE, never MEAN
// ---------------------------------------------------------------------------

describe("每列取眾數色，不是平均", () => {
  it("reports the majority colour of a split row and never the blend", () => {
    const d = run("split", splitColumn);
    expect(hexes(d)).toEqual([...SPLIT_MAJOR]);
    for (const mean of SPLIT_MEANS) expect(hexes(d)).not.toContain(mean);
  });

  it("groups near-identical shades before counting, so a dithered flat colour still wins", () => {
    // 80 pixels of ONE flat green, dithered across four shades that differ only
    // in the red channel's low bits, versus 50 pixels of a single solid red.
    // No individual green out-counts the red — only the CLUSTER does, which is
    // the whole reason stage one buckets before stage two counts.
    const counts = new Map<number, number>([
      [0x20a060, 20],
      [0x21a060, 20],
      [0x22a060, 20],
      [0x23a060, 20],
      [0xd02020, 50],
    ]);
    const got = modeColor(counts)!;
    expect(packedToHex(got)).toBe("#20a060");
    // the four greens share a bucket; the red does not
    expect(new Set([0x20a060, 0x21a060, 0x22a060, 0x23a060].map(coarseBucket)).size).toBe(1);
    expect(coarseBucket(0xd02020)).not.toBe(coarseBucket(0x20a060));
  });

  it("gives each channel its own nibble — green cannot be invisible to the bucket", () => {
    // two colours that differ ONLY in green must not share a bucket
    expect(coarseBucket(0x30f030)).not.toBe(coarseBucket(0x300030));
  });

  it("every reported hex is a colour that exists in the source image", () => {
    const img = decodePng(toPng(splitColumn()));
    const present = new Set<string>();
    for (let i = 0; i < img.width * img.height; i++) {
      present.add(
        packedToHex((img.rgba[i * 4]! << 16) | (img.rgba[i * 4 + 1]! << 8) | img.rgba[i * 4 + 2]!),
      );
    }
    const d = extractBarcode("split", "split.png", img);
    for (const hex of hexes(d)) expect(present.has(hex)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 六個守衛
// ---------------------------------------------------------------------------

describe("守衛 1 · 外框 → 自動修", () => {
  it("drops the first and last bands when they match the frame colour", () => {
    const d = run("framed", framedFigure);
    expect(d.metrics.framesDropped).toBe(2);
    expect(hexes(d)).not.toContain(FRAME_HEX);
  });

  it("keeps the real bands intact and still passes", () => {
    const d = run("framed", framedFigure);
    expect(hexes(d)).toEqual([...CLEAN_FIVE]);
    expect(d.verdict).toBe("PASS");
  });

  it("does not invent a frame on an unframed figure", () => {
    expect(run("clean5", cleanFiveBand).metrics.framesDropped).toBe(0);
  });
});

describe("守衛 2 · 背景非單色（前景 < 40%）→ FAIL", () => {
  it("fails when background removal leaves too little character", () => {
    const d = run("bleed", backgroundBleed);
    expect(d.verdict).toBe("FAIL");
    expect(d.metrics.foregroundRatio).toBeLessThan(MIN_FOREGROUND_RATIO);
    expect(d.reasons.some((r) => r.includes("前景"))).toBe(true);
  });

  it("a solid background leaves the figure alone", () => {
    expect(run("clean5", cleanFiveBand).metrics.foregroundRatio).toBeGreaterThan(
      MIN_FOREGROUND_RATIO,
    );
  });
});

describe("守衛 3 · 反鋸齒 → 自動修", () => {
  it("keeps the flat band colours and reports none of the blended fringes", () => {
    const d = run("aa", antialiasedFigure);
    expect(hexes(d)).toEqual([...CLEAN_FIVE]);
    for (const fringe of AA_FRINGE_HEXES) expect(hexes(d)).not.toContain(fringe);
  });

  it("the fringe colours really are in the image — the fixture is not a no-op", () => {
    const d = run("aa", antialiasedFigure);
    expect(d.metrics.distinctColors).toBe(CLEAN_FIVE.length + AA_FRINGE_HEXES.length);
    expect(d.verdict).toBe("PASS");
  });
});

describe("守衛 4 · 沒填滿畫框（bbox 高 < 60%）→ SUSPECT", () => {
  it("flags a figure that does not fill the canvas", () => {
    const d = run("short", shortFigure);
    expect(d.verdict).toBe("SUSPECT");
    expect(d.metrics.bboxHeightRatio).toBeLessThan(MIN_BBOX_HEIGHT_RATIO);
    expect(d.reasons.some((r) => r.includes("bbox"))).toBe(true);
  });

  it("is SUSPECT for the bbox and nothing else — it clears every other guard", () => {
    const d = run("short", shortFigure);
    expect(d.metrics.foregroundRatio).toBeGreaterThan(MIN_FOREGROUND_RATIO);
    expect(d.metrics.bandCount).toBe(CLEAN_FIVE.length);
    expect(d.metrics.maxPairwiseDeltaE).toBeGreaterThan(BARCODE_MUD_COLUMN_DELTA_E);
  });

  it("a full-height figure is not flagged", () => {
    expect(run("clean5", cleanFiveBand).metrics.bboxHeightRatio).toBeGreaterThan(
      MIN_BBOX_HEIGHT_RATIO,
    );
  });
});

describe("守衛 5 · 泥巴柱（帶間最大 ΔE < 25）→ FAIL", () => {
  it("fails a column whose bands are all nearly the same colour", () => {
    const d = run("mud", mudColumn);
    expect(d.verdict).toBe("FAIL");
    expect(d.metrics.maxPairwiseDeltaE).toBeLessThan(BARCODE_MUD_COLUMN_DELTA_E);
    expect(d.reasons.some((r) => r.includes("泥巴柱"))).toBe(true);
  });

  it("fails on the COLOUR SPREAD, not on the band count", () => {
    // four bands survive, so 帶數過少 cannot be what fired
    const d = run("mud", mudColumn);
    expect(d.metrics.bandCount).toBe(4);
    expect(d.reasons.some((r) => r.includes("有效帶"))).toBe(false);
  });

  it("a well-separated figure clears the floor by a wide margin", () => {
    expect(run("clean5", cleanFiveBand).metrics.maxPairwiseDeltaE).toBeGreaterThan(
      BARCODE_MUD_COLUMN_DELTA_E,
    );
  });
});

describe("守衛 6 · 帶數過少（有效帶 < 4）→ SUSPECT", () => {
  it("flags a two-band read", () => {
    const d = run("two", twoBandFigure);
    expect(d.verdict).toBe("SUSPECT");
    expect(d.metrics.bandCount).toBe(2);
    expect(d.reasons.some((r) => r.includes("有效帶"))).toBe(true);
  });

  it("is not the mud guard in disguise — the two bands are far apart", () => {
    expect(run("two", twoBandFigure).metrics.maxPairwiseDeltaE).toBeGreaterThan(
      BARCODE_MUD_COLUMN_DELTA_E,
    );
  });
});

describe("守衛 7 · 圖示重複 → DUPLICATE", () => {
  it("marks the second of two identical images and names the first", () => {
    const [a, b] = duplicatePair();
    const rows = adjudicate([
      extractBarcode("twinA", "a.png", decodePng(toPng(a))),
      extractBarcode("twinB", "b.png", decodePng(toPng(b))),
    ]);
    expect(rows[0]!.verdict).toBe("PASS");
    expect(rows[0]!.duplicateOf).toBeNull();
    expect(rows[1]!.verdict).toBe("DUPLICATE");
    expect(rows[1]!.duplicateOf).toBe("twinA");
    expect(rows[0]!.hash).toBe(rows[1]!.hash);
  });

  it("the verdict is carried into the stored evidence, not only the report row", () => {
    const [a, b] = duplicatePair();
    const rows = adjudicate([
      extractBarcode("twinA", "a.png", decodePng(toPng(a))),
      extractBarcode("twinB", "b.png", decodePng(toPng(b))),
    ]);
    expect(rows[1]!.barcode!.extraction!.verdict).toBe("DUPLICATE");
    expect(rows[1]!.barcode!.extraction!.reasons.some((r) => r.includes("twinA"))).toBe(true);
  });

  it("does NOT flag two genuinely different characters", () => {
    const rows = adjudicate([
      extractBarcode("five", "five.png", decodePng(toPng(cleanFiveBand()))),
      extractBarcode("split", "split.png", decodePng(toPng(splitColumn()))),
    ]);
    expect(rows.map((r) => r.verdict)).toEqual(["PASS", "PASS"]);
    expect(rows[0]!.hash).not.toBe(rows[1]!.hash);
  });
});

// ---------------------------------------------------------------------------
// the pieces the guards stand on
// ---------------------------------------------------------------------------

describe("裁決優先序", () => {
  it("FAIL outranks DUPLICATE outranks SUSPECT outranks PASS", () => {
    expect(worstVerdict("PASS", "SUSPECT")).toBe("SUSPECT");
    expect(worstVerdict("SUSPECT", "DUPLICATE")).toBe("DUPLICATE");
    expect(worstVerdict("DUPLICATE", "FAIL")).toBe("FAIL");
    expect(worstVerdict("FAIL", "PASS")).toBe("FAIL");
  });
});

describe("槽位指派", () => {
  it("never lets a lower band take a higher slot", () => {
    const cases: number[][] = [
      [0.33, 0.34, 0.33],
      [0.2, 0.2, 0.2, 0.2, 0.2],
      [0.02, 0.16, 0.03, 0.11, 0.2, 0.24, 0.06, 0.05, 0.13],
      [0.5, 0.5],
      [1],
    ];
    const ORDER = [
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
    ];
    for (const fracs of cases) {
      const got = assignSlots(fracs);
      expect(got).toHaveLength(fracs.length);
      const idx = got.map((s) => ORDER.indexOf(s));
      for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
    }
  });

  it("refuses more bands than there are slots rather than dropping one silently", () => {
    expect(assignSlots(new Array(12).fill(1 / 12))).toEqual([]);
  });
});

describe("決定性", () => {
  it("the same image extracts to the same barcode, hash and verdict every time", () => {
    const a = run("clean5", cleanFiveBand);
    const b = run("clean5", cleanFiveBand);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.hash).toBe(b.hash);
  });

  it("the fingerprint follows the bands, not the champion id", () => {
    const a = run("nameOne", cleanFiveBand);
    const b = run("nameTwo", cleanFiveBand);
    expect(a.hash).toBe(b.hash);
    expect(barcodeFingerprint(a.barcode!)).toBe(a.hash);
  });
});
