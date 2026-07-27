/**
 * texture — the 分帶 row allocator.
 *
 * The reason this has its own file: `bandRows` is the ONE step where a
 * reasonable-looking implementation destroys a character silently. Rounding
 * each band boundary independently is the obvious way to write it, it passes
 * any "the rows tile the rect" check, and it deletes 魯夫's red hat band. So the
 * tests below are written against the FAILURE, not against the happy path.
 */
import { describe, it, expect } from "vitest";
import { bandCenterRow, bandRowAt, bandRows } from "./texture";

/** 魯夫's head, as `barcodeToParts` normalises it: 4 bands into an 8-texel rect. */
const LUFFY_HEAD = [
  { hex: "#C9A96A", frac: 0.16 / 0.36 }, // 草帽褐
  { hex: "#E8112D", frac: 0.04 / 0.36 }, // 紅帽帶 — 11.1 %, the one that vanishes
  { hex: "#111111", frac: 0.03 / 0.36 }, // 黑帽緣 — 8.3 %
  { hex: "#F5CBA0", frac: 0.13 / 0.36 }, // 膚
];

describe("bandRows", () => {
  it("tiles the rect exactly: no gap, no overlap, last row ends at the height", () => {
    const rows = bandRows(LUFFY_HEAD, 8);
    expect(rows[0]!.y0).toBe(0);
    expect(rows[rows.length - 1]!.y1).toBe(8);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.y0).toBe(rows[i - 1]!.y1);
  });

  it("keeps 魯夫's 紅帽帶 — an 11 % band in an 8-texel rect gets a row", () => {
    // Independent boundary rounding gives cuts at 0, 4, 4, 5, 8: the hat band
    // spans ZERO rows and the character becomes "a brown hat" (規格 §2.1).
    const rows = bandRows(LUFFY_HEAD, 8);
    const band = rows.find((r) => r.hex === "#E8112D");
    expect(band).toBeDefined();
    expect(band!.y1 - band!.y0).toBeGreaterThanOrEqual(1);
  });

  it("gives EVERY band at least one row, however thin", () => {
    const rows = bandRows(
      [
        { hex: "#111111", frac: 0.001 },
        { hex: "#222222", frac: 0.001 },
        { hex: "#333333", frac: 0.998 },
      ],
      12,
    );
    expect(rows.map((r) => r.y1 - r.y0)).toEqual([1, 1, 10]);
  });

  it("is proportional once the floor is paid", () => {
    const rows = bandRows(
      [
        { hex: "#aa0000", frac: 0.5 },
        { hex: "#00aa00", frac: 0.25 },
        { hex: "#0000aa", frac: 0.25 },
      ],
      12,
    );
    expect(rows.map((r) => r.y1 - r.y0)).toEqual([6, 3, 3]);
  });

  it("preserves band ORDER and COLOUR — row i is band i", () => {
    const rows = bandRows(LUFFY_HEAD, 8);
    expect(rows.map((r) => r.hex)).toEqual(LUFFY_HEAD.map((b) => b.hex));
  });

  it("THROWS rather than dropping bands that do not fit", () => {
    // Silently painting 3 of a character's 4 bands is the exact shape of
    // "did it but the player can't get it". Loud is the only correct answer.
    expect(() => bandRows(LUFFY_HEAD, 3)).toThrow(/do not fit/);
  });

  it("is a pure function of its input — same in, byte-identical out", () => {
    expect(bandRows(LUFFY_HEAD, 8)).toEqual(bandRows(LUFFY_HEAD, 8));
  });

  it("splits evenly when no band carries a usable frac", () => {
    const rows = bandRows(
      [
        { hex: "#111111", frac: 0 },
        { hex: "#222222", frac: Number.NaN },
      ],
      8,
    );
    expect(rows.map((r) => r.y1 - r.y0)).toEqual([4, 4]);
  });

  it("returns nothing for no bands", () => {
    expect(bandRows([], 12)).toEqual([]);
  });
});

describe("bandCenterRow", () => {
  it("lands inside its own band for every band of 魯夫's head", () => {
    for (const row of bandRows(LUFFY_HEAD, 8)) {
      const c = bandCenterRow(row);
      expect(c).toBeGreaterThanOrEqual(row.y0);
      expect(c).toBeLessThan(row.y1);
    }
  });

  it("is the upper middle row of an even-height band", () => {
    expect(bandCenterRow({ hex: "#000000", y0: 0, y1: 4 })).toBe(1);
    expect(bandCenterRow({ hex: "#000000", y0: 4, y1: 5 })).toBe(4);
    expect(bandCenterRow({ hex: "#000000", y0: 2, y1: 7 })).toBe(4);
  });
});

describe("bandRowAt", () => {
  it("maps every row of the rect to exactly one band", () => {
    const rows = bandRows(LUFFY_HEAD, 8);
    for (let y = 0; y < 8; y++) expect(bandRowAt(rows, y)).not.toBeNull();
    expect(bandRowAt(rows, 8)).toBeNull();
    expect(bandRowAt(rows, -1)).toBeNull();
  });
});
