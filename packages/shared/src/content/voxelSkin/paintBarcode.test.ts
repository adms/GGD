/**
 * paint × barcode — 規格 §8's acceptance, at the atlas.
 *
 * ONLY PIXELS COUNT HERE. The spec is blunt about it and so is this file: an
 * assertion that `bands` has eleven keys, that the painter was called, or that
 * the atlas is 64×64 proves nothing about what a player sees. Every test below
 * reads TEXELS out of the buffer `paintVoxelAtlas` returns — the same buffer
 * `RawTexture.CreateRGBATexture` uploads and the same buffer `voxel:build`
 * encodes into the shipped PNG.
 *
 * ── THE EXPECTATION COMES FROM THE SPEC DATA, NOT FROM THE CODE ─────────────
 * Load-bearing, and the first draft of this file got it wrong. Deriving the
 * expected colours from `barcodeRowsByPart` (i.e. from `bandRows`) makes the
 * assertion move with the implementation: hard-code every row to the first
 * band's colour and the test recomputes the same wrong answer and stays green.
 * So the expectations below are built from `_voxel-barcodes.json`'s own
 * `bands` — the authored hexes in anatomical order — and the atlas is read back
 * as RUNS of equal colour down a column. What is asserted is the thing the
 * owner actually asked for: the character's top-to-bottom colour sequence.
 *
 * THE EXACTNESS IS DELIBERATE, NOT LUCKY. `toBe("#e8112d")` with no tolerance
 * is only honest because the barcode path writes 0..255 bytes straight into the
 * buffer (`Sheet.pxExact`): no dither grain, no hex → float → ×255 round-trip.
 * A band "within 6/255 of the authored hex" is not the authored hex.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateVoxelSkin } from "./generate";
import {
  ATLAS_W,
  ATLAS_FACES,
  BARCODE_PARTS,
  BARCODE_SLOTS,
  BARCODE_SLOT_PART,
  type AtlasRect,
  type BarcodePart,
  type BoxFace,
  type VoxelBarcode,
  type VoxelBarcodesFile,
} from "./types";
import { barcodeToParts, sleeveColors } from "./barcode";
import {
  BARCODE_OVERLAY_RECTS,
  HEAD_DECAL_RECT,
  TORSO_DECAL_RECT,
  paintVoxelAtlas,
} from "./paint";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const FILE = JSON.parse(
  readFileSync(join(CONTENT, "models", "_voxel-barcodes.json"), "utf8"),
) as VoxelBarcodesFile;

const SANJI = FILE.barcodes["placeholder.sanji"]!;
const LUFFY = FILE.barcodes["godie-u00n"]!;
const ZORO = FILE.barcodes["godie-udre"]!;
const SEEDS: [string, VoxelBarcode][] = [
  ["香吉士", SANJI],
  ["魯夫", LUFFY],
  ["索隆", ZORO],
];

const FACES: readonly BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];
const SIDES: readonly BoxFace[] = ["front", "back", "right", "left"];

/** The recipe a champion would get from the L3 floor — the layer under the barcode. */
const recipeFor = (id: string) => generateVoxelSkin({ id });

/** `#rrggbb` of one atlas texel, lower-case. */
function texel(atlas: Uint8ClampedArray, x: number, y: number): string {
  const i = (y * ATLAS_W + x) * 4;
  const h = (v: number | undefined): string => (v ?? 0).toString(16).padStart(2, "0");
  return `#${h(atlas[i])}${h(atlas[i + 1])}${h(atlas[i + 2])}`;
}

const inRect = (r: AtlasRect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** True when any texel of this column of `r` may be over-painted by a decal. */
function columnIsClean(r: AtlasRect, x: number): boolean {
  for (const d of BARCODE_OVERLAY_RECTS) {
    for (let y = 0; y < r.h; y++) if (inRect(d, r.x + x, r.y + y)) return false;
  }
  return true;
}

/** THE AUTHORED bands of a part, straight out of the JSON, in anatomical order. */
function authored(barcode: VoxelBarcode, part: BarcodePart): { hex: string; frac: number }[] {
  const out: { hex: string; frac: number }[] = [];
  for (const slot of BARCODE_SLOTS) {
    const band = barcode.bands[slot];
    if (band && BARCODE_SLOT_PART[slot] === part) out.push({ hex: band.hex.toLowerCase(), frac: band.frac });
  }
  return out;
}

/** Runs of equal colour down column `x` of a face rect, top to bottom. */
function runs(
  atlas: Uint8ClampedArray,
  r: AtlasRect,
  x: number,
): { hex: string; y0: number; y1: number }[] {
  const out: { hex: string; y0: number; y1: number }[] = [];
  for (let y = 0; y < r.h; y++) {
    const hex = texel(atlas, r.x + x, r.y + y);
    const last = out[out.length - 1];
    if (last && last.hex === hex) last.y1 = y + 1;
    else out.push({ hex, y0: y, y1: y + 1 });
  }
  return out;
}

/** Paint with the barcode laid over the champion's own generated recipe. */
function paint(barcode: VoxelBarcode): Uint8ClampedArray {
  return paintVoxelAtlas(recipeFor(barcode.championId), barcode);
}

// ---------------------------------------------------------------------------

describe("條碼底帶 — 規格 §8 的像素驗收", () => {
  it.each(SEEDS)(
    "%s: the painted colour sequence IS the authored barcode, band for band",
    (_name, barcode) => {
      const atlas = paint(barcode);
      let columns = 0;
      for (const part of BARCODE_PARTS) {
        const want = authored(barcode, part);
        expect(want.length, `${part} has no authored band`).toBeGreaterThan(0);
        const total = want.reduce((n, b) => n + b.frac, 0);
        const F = ATLAS_FACES[part];
        for (const face of SIDES) {
          const r = F[face];
          for (let x = 0; x < r.w; x++) {
            if (!columnIsClean(r, x)) continue;
            const got = runs(atlas, r, x);
            // ① every authored band is present, in order, none merged away
            expect(got.map((g) => g.hex), `${part}.${face} col ${x}`).toEqual(
              want.map((b) => b.hex),
            );
            for (let i = 0; i < want.length; i++) {
              const run = got[i]!;
              // ② the band's CENTRE texel is exactly the authored hex (規格 §8)
              const cy = run.y0 + Math.floor((run.y1 - run.y0 - 1) / 2);
              expect(texel(atlas, r.x + x, r.y + cy)).toBe(want[i]!.hex);
              // ③ the band is as tall as its frac says, ±1 texel of rounding —
              //    and never zero, however fine the band (規格 §2.1)
              const ideal = (want[i]!.frac / total) * r.h;
              expect(run.y1 - run.y0).toBeGreaterThanOrEqual(1);
              expect(Math.abs(run.y1 - run.y0 - ideal)).toBeLessThanOrEqual(1.5);
            }
            columns++;
          }
        }
      }
      // A version of this test that skipped every column would pass silently.
      expect(columns).toBeGreaterThanOrEqual(40);
    },
  );

  it.each(SEEDS)("%s: the horizontal faces carry the end bands whole", (_name, barcode) => {
    // A top face is a section at one height, so it is entirely the topmost
    // band's colour (the legs' bottom face is the sole, i.e. the shoe).
    const atlas = paint(barcode);
    for (const part of BARCODE_PARTS) {
      const want = authored(barcode, part);
      for (const [face, hex] of [
        ["top", want[0]!.hex],
        ["bottom", want[want.length - 1]!.hex],
      ] as const) {
        const r = ATLAS_FACES[part][face];
        for (let y = 0; y < r.h; y++) {
          for (let x = 0; x < r.w; x++) {
            expect(texel(atlas, r.x + x, r.y + y), `${part}.${face} (${x},${y})`).toBe(hex);
          }
        }
      }
    }
  });

  it.each(SEEDS)("%s: no texel of a part is left un-banded", (_name, barcode) => {
    // The "drawn off-screen / never painted" shape: every texel of all 18 part
    // faces must be one of the authored colours, decal windows excepted.
    const atlas = paint(barcode);
    const stray: string[] = [];
    for (const part of BARCODE_PARTS) {
      const palette = new Set(authored(barcode, part).map((b) => b.hex));
      for (const face of FACES) {
        const r = ATLAS_FACES[part][face];
        for (let y = 0; y < r.h; y++) {
          for (let x = 0; x < r.w; x++) {
            if (BARCODE_OVERLAY_RECTS.some((d) => inRect(d, r.x + x, r.y + y))) continue;
            const hex = texel(atlas, r.x + x, r.y + y);
            if (!palette.has(hex)) stray.push(`${part}.${face} (${x},${y}) = ${hex}`);
          }
        }
      }
    }
    expect(stray.slice(0, 10)).toEqual([]);
  });

  it("魯夫's 紅帽帶 survives as a full stripe on all four side faces", () => {
    // 規格 §2.1: strip the fine band and Luffy is just "a brown hat". The band
    // is 4 % of the figure and the head rect is eight texels tall — exactly
    // where an independent-rounding allocator eats it.
    const atlas = paint(LUFFY);
    for (const face of SIDES) {
      const r = ATLAS_FACES.head[face];
      for (let x = 0; x < r.w; x++) {
        if (!columnIsClean(r, x)) continue;
        const seq = runs(atlas, r, x);
        expect(seq.map((s) => s.hex), `head.${face} col ${x}`).toEqual([
          "#c9a96a", // 草帽褐
          "#e8112d", // 紅帽帶
          "#111111", // 黑帽緣
          "#f5cba0", // 膚
        ]);
        expect(seq[1]!.y1 - seq[1]!.y0).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("索隆's 黑腹卷 sits at the BOTTOM of the torso, under the white shirt", () => {
    const atlas = paint(ZORO);
    const r = ATLAS_FACES.torso.right;
    const seq = runs(atlas, r, 0);
    expect(seq.map((s) => s.hex)).toEqual(["#efefef", "#111111"]);
    expect(seq[1]!.y1).toBe(r.h); // it reaches the hip
    expect(seq[1]!.y1 - seq[1]!.y0).toBeGreaterThanOrEqual(1);
  });

  it("魯夫's 膚色小腿 is a real band between the shorts and the sandals", () => {
    const atlas = paint(LUFFY);
    const r = ATLAS_FACES.legs.back;
    expect(runs(atlas, r, 1).map((s) => s.hex)).toEqual([
      "#0b5394", // 藍短褲
      "#f5cba0", // 膚色小腿
      "#8a6a3a", // 褐涼鞋
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("袖子規則 — 規格 §2.4", () => {
  it("魯夫 (sleeve: none): the whole arm is skin, not the red vest", () => {
    expect(LUFFY.sleeve).toBe("none");
    const atlas = paint(LUFFY);
    for (const which of ["armL", "armR"] as const) {
      for (const face of FACES) {
        const r = ATLAS_FACES[which][face];
        for (let y = 0; y < r.h; y++) {
          expect(texel(atlas, r.x + 1, r.y + y), `${which}.${face} row ${y}`).toBe("#f5cba0");
        }
      }
    }
  });

  it("索隆 (sleeve: long): the whole arm is the shirt, not skin", () => {
    expect(ZORO.sleeve).toBe("long");
    const atlas = paint(ZORO);
    for (const which of ["armL", "armR"] as const) {
      for (const face of FACES) {
        const r = ATLAS_FACES[which][face];
        for (let y = 0; y < r.h; y++) {
          expect(texel(atlas, r.x + 1, r.y + y), `${which}.${face} row ${y}`).toBe("#efefef");
        }
      }
    }
  });

  it("short: the upper half is the top and the lower half is skin", () => {
    // No seeded character wears one yet, so the rule is exercised directly —
    // an unexercised branch is a branch that is wrong the day it is used.
    const short: VoxelBarcode = { ...ZORO, sleeve: "short" };
    expect(sleeveColors(short)).toEqual({ upper: "#EFEFEF", lower: "#F5CBA0" });
    const atlas = paintVoxelAtlas(recipeFor("godie-udre"), short);
    const r = ATLAS_FACES.armL.front;
    const mid = Math.floor(r.h / 2);
    for (let y = 0; y < mid; y++) expect(texel(atlas, r.x + 1, r.y + y)).toBe("#efefef");
    for (let y = mid; y < r.h; y++) expect(texel(atlas, r.x + 1, r.y + y)).toBe("#f5cba0");
    // shoulder cap and palm follow the same rule
    expect(texel(atlas, ATLAS_FACES.armL.top.x, ATLAS_FACES.armL.top.y)).toBe("#efefef");
    expect(texel(atlas, ATLAS_FACES.armL.bottom.x, ATLAS_FACES.armL.bottom.y)).toBe("#f5cba0");
  });

  it("the three sleeve kinds paint three different arms", () => {
    const at = (sleeve: VoxelBarcode["sleeve"], y: number): string => {
      const atlas = paintVoxelAtlas(recipeFor("godie-udre"), { ...ZORO, sleeve });
      const r = ATLAS_FACES.armR.front;
      return texel(atlas, r.x + 1, r.y + y);
    };
    // forearm tells long from the other two…
    expect(at("long", 11)).toBe("#efefef");
    expect(at("short", 11)).toBe("#f5cba0");
    expect(at("none", 11)).toBe("#f5cba0");
    // …and the shoulder tells short from none
    expect(at("short", 0)).toBe("#efefef");
    expect(at("none", 0)).toBe("#f5cba0");
  });
});

// ---------------------------------------------------------------------------

describe("髖關節 — top 與 pants 同色仍是兩個槽", () => {
  it("香吉士's suit is one hex but two independent slots", () => {
    expect(SANJI.bands.top!.hex).toBe(SANJI.bands.pants!.hex);
    expect(SANJI.bands.top).not.toBe(SANJI.bands.pants); // two objects, never one
    const parts = barcodeToParts(SANJI);
    expect(parts.torso.map((b) => b.slot)).toEqual(["top"]);
    expect(parts.legs.map((b) => b.slot)).toEqual(["pants", "shoe"]);
  });

  it("recolouring the trousers moves the LEGS and leaves the TORSO untouched", () => {
    // The behavioural form of 「色帶是外觀，分節是結構」. If a "same colour ⇒
    // merge the bands" simplification ever lands, the merged band would either
    // drag the torso with it or stop driving the legs — and both show up right
    // here, in texels, without the test needing to know how the merge was
    // written.
    const atlas = paint(SANJI);
    const recoloured = paintVoxelAtlas(recipeFor(SANJI.championId), {
      ...SANJI,
      bands: { ...SANJI.bands, pants: { hex: "#1166FF", frac: SANJI.bands.pants!.frac } },
    });

    const readRect = (r: AtlasRect, src: Uint8ClampedArray): string[] => {
      const out: string[] = [];
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) out.push(texel(src, r.x + x, r.y + y));
      return out;
    };
    for (const face of FACES) {
      const r = ATLAS_FACES.torso[face];
      expect(readRect(r, atlas), `torso.${face} must not follow the trousers`).toEqual(
        readRect(r, recoloured),
      );
    }
    const legsFront = ATLAS_FACES.legs.front;
    expect(readRect(legsFront, atlas)).not.toEqual(readRect(legsFront, recoloured));
    expect(texel(recoloured, legsFront.x, legsFront.y)).toBe("#1166ff");
  });

  it("the hip seam is a real colour change when the two slots differ", () => {
    // Same fixture from the other side: give 香吉士 blue trousers and the last
    // torso row and the first legs row must disagree. A merged pair cannot.
    const recoloured = paintVoxelAtlas(recipeFor(SANJI.championId), {
      ...SANJI,
      bands: { ...SANJI.bands, pants: { hex: "#1166FF", frac: SANJI.bands.pants!.frac } },
    });
    const t = ATLAS_FACES.torso.back;
    const l = ATLAS_FACES.legs.back;
    expect(texel(recoloured, t.x + 1, t.y + t.h - 1)).toBe("#0d0d0d");
    expect(texel(recoloured, l.x + 1, l.y)).toBe("#1166ff");
  });
});

// ---------------------------------------------------------------------------

describe("面層 — 既有 style 繪製留在上層", () => {
  it("the decals still run: texels inside the face window differ from the band", () => {
    // 「既有的 style 繪製留在上層，不要刪」 as a check. Deleting the overlay
    // makes this red; the window pins below make over-painting red.
    const atlas = paint(LUFFY);
    const headBands = new Set(authored(LUFFY, "head").map((b) => b.hex));
    let overpainted = 0;
    for (let y = HEAD_DECAL_RECT.y; y < HEAD_DECAL_RECT.y + HEAD_DECAL_RECT.h; y++) {
      for (let x = HEAD_DECAL_RECT.x; x < HEAD_DECAL_RECT.x + HEAD_DECAL_RECT.w; x++) {
        if (!headBands.has(texel(atlas, x, y))) overpainted++;
      }
    }
    expect(overpainted).toBeGreaterThan(0);
  });

  it("the decal windows are pinned to the two front faces", () => {
    // The acceptance test EXCLUDES these rects, so widening one silently
    // shrinks what is checked. Pinning them makes that a code review, not an
    // accident.
    expect(HEAD_DECAL_RECT).toEqual({ x: 0, y: 2, w: 8, h: 6 });
    expect(TORSO_DECAL_RECT).toEqual({ x: 2, y: 10, w: 3, h: 3 });
    for (const r of BARCODE_OVERLAY_RECTS) {
      const onFront =
        inRect(ATLAS_FACES.head.front, r.x, r.y) || inRect(ATLAS_FACES.torso.front, r.x, r.y);
      expect(onFront, `${r.x},${r.y} must sit on a front face`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------

describe("沒有條碼的英雄完全不受影響", () => {
  it("the L3 generator's atlas is byte-identical with and without the new argument", () => {
    const recipe = recipeFor("godie-u00n");
    expect([...paintVoxelAtlas(recipe)]).toEqual([...paintVoxelAtlas(recipe, null)]);
  });

  it("a barcode CHANGES the atlas — the argument is not decorative", () => {
    const recipe = recipeFor("godie-u00n");
    expect([...paintVoxelAtlas(recipe)]).not.toEqual([...paintVoxelAtlas(recipe, LUFFY)]);
  });
});
