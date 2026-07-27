/**
 * voxel:build — 規格 §8 的驗收，在 PRODUCT 上量。
 *
 * 「產出的 PNG，在每一帶的中心點取像素，必須等於規格 hex。貼圖是產物，只有像素
 * 能作證。」 So this file does not assert that `buildAll` was called, that the
 * atlas is 64×64, or that a barcode object has eleven keys. It:
 *
 *   1. reads the .png that is ON DISK, inflates the IDAT itself, and holds each
 *      band-centre texel to the hex in `_voxel-barcodes.json`;
 *   2. cracks the .glb, pulls the PNG out of its buffer view, and does it AGAIN
 *      — because a correct sidecar PNG next to a model that embeds a different
 *      image is the exact "did it but the player can't get it" shape;
 *   3. follows the model's OWN UVs from the head box to the texels they address
 *      and reads the barcode back off them, so "the texture reaches the mesh" is
 *      measured rather than assumed;
 *   4. checks the vertical orientation, because an upside-down barcode passes
 *      every "it has a texture" check and is a different character.
 *
 * Nothing here greps source. Nothing here reads a data attribute.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { BOXES, FACE_NAME_BY_NORMAL } from "@ggd/shared/voxel";
import {
  ATLAS_H,
  ATLAS_W,
  ATLAS_FACES,
  BARCODE_SLOTS,
  BARCODE_SLOT_PART,
  type BarcodePart,
  type VoxelBarcode,
} from "@ggd/shared/content/voxelSkin";
import { OUT_DIR, approvalReasons, buildAll, readBarcodes } from "./build";
import { barcodeFileNames } from "@ggd/shared/voxel";

const { rows, skipped } = buildAll();
const FILE = readBarcodes();

// ---------------------------------------------------------------------------
// decoders — deliberately hand-rolled, so the test does not depend on the
// writer it is checking
// ---------------------------------------------------------------------------

interface Image {
  w: number;
  h: number;
  /** `#rrggbb` at (x, y) */
  at(x: number, y: number): string;
}

function decodePng(bytes: Uint8Array): Image {
  const buf = Buffer.from(bytes);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let i = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colourType = -1;
  const idat: Buffer[] = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("ascii");
    const body = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      bitDepth = body[8]!;
      colourType = body[9]!;
    } else if (type === "IDAT") idat.push(Buffer.from(body));
    i += 12 + len;
  }
  expect(bitDepth).toBe(8);
  expect(colourType).toBe(6); // RGBA
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = 1 + w * 4;
  expect(raw.length).toBe(h * stride);
  for (let y = 0; y < h; y++) expect(raw[y * stride], `scanline ${y} filter`).toBe(0);
  return {
    w,
    h,
    at(x, y) {
      const o = y * stride + 1 + x * 4;
      const hex = (v: number): string => v.toString(16).padStart(2, "0");
      return `#${hex(raw[o]!)}${hex(raw[o + 1]!)}${hex(raw[o + 2]!)}`;
    },
  };
}

interface Glb {
  json: Record<string, any>;
  bin: Buffer;
}

function parseGlb(bytes: Uint8Array): Glb {
  const buf = Buffer.from(bytes);
  expect(buf.subarray(0, 4).toString("ascii")).toBe("glTF");
  expect(buf.readUInt32LE(4)).toBe(2);
  expect(buf.readUInt32LE(8)).toBe(buf.length);
  let off = 12;
  let json: Record<string, any> | null = null;
  let bin: Buffer | null = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8")) as Record<string, any>;
    else if (type === 0x004e4942) bin = Buffer.from(body);
    off += 8 + len;
  }
  expect(json, "glb has a JSON chunk").not.toBeNull();
  expect(bin, "glb has a BIN chunk").not.toBeNull();
  return { json: json!, bin: bin! };
}

/** The bytes of `bufferView` i. */
function view(glb: Glb, i: number): Buffer {
  const v = glb.json.bufferViews[i];
  const start = v.byteOffset ?? 0;
  return glb.bin.subarray(start, start + v.byteLength);
}

/** The PNG the model actually carries. */
function embeddedPng(glb: Glb): Uint8Array {
  expect(glb.json.images).toHaveLength(1);
  return new Uint8Array(view(glb, glb.json.images[0].bufferView));
}

/** A float accessor as a flat array. */
function floats(glb: Glb, accessorIndex: number): number[] {
  const a = glb.json.accessors[accessorIndex];
  expect(a.componentType, "float accessor").toBe(5126);
  const per = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as string]!;
  const v = glb.json.bufferViews[a.bufferView];
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out: number[] = [];
  for (let i = 0; i < a.count * per; i++) out.push(glb.bin.readFloatLE(base + i * 4));
  return out;
}

// ---------------------------------------------------------------------------
// the fixtures
// ---------------------------------------------------------------------------

/** THE AUTHORED bands of a part, straight from the JSON, in anatomical order. */
function authored(barcode: VoxelBarcode, part: BarcodePart): { hex: string; frac: number }[] {
  const out: { hex: string; frac: number }[] = [];
  for (const slot of BARCODE_SLOTS) {
    const band = barcode.bands[slot];
    if (band && BARCODE_SLOT_PART[slot] === part) {
      out.push({ hex: band.hex.toLowerCase(), frac: band.frac });
    }
  }
  return out;
}

/** Runs of equal colour down a column of an image, between two rows. */
function runs(img: Image, x: number, y0: number, y1: number): { hex: string; y0: number; y1: number }[] {
  const out: { hex: string; y0: number; y1: number }[] = [];
  for (let y = y0; y < y1; y++) {
    const hex = img.at(x, y);
    const last = out[out.length - 1];
    if (last && last.hex === hex) last.y1 = y + 1;
    else out.push({ hex, y0: y, y1: y + 1 });
  }
  return out;
}

const PARTS: readonly BarcodePart[] = ["head", "torso", "legs"];
/** Faces with no decal window over them — see `paint.BARCODE_OVERLAY_RECTS`. */
const CLEAN_FACES = ["back", "right", "left"] as const;

const CASES = rows.map((r) => [r.championId, r] as const);

// ---------------------------------------------------------------------------

describe("voxel:build — what it produced", () => {
  it("built every approved barcode and skipped nothing silently", () => {
    expect(rows.map((r) => r.championId).sort()).toEqual(
      Object.keys(FILE.barcodes).sort(),
    );
    expect(skipped).toEqual([]);
  });

  it("wrote a .png and a .glb per champion into content/assets", () => {
    for (const row of rows) {
      const names = barcodeFileNames(row.championId);
      expect(fs.existsSync(path.join(OUT_DIR, names.png)), names.png).toBe(true);
      expect(fs.existsSync(path.join(OUT_DIR, names.glb)), names.glb).toBe(true);
    }
  });

  it("refuses a barcode that is not 已核准", () => {
    // §5.2's 「讀已核准條碼」. A FAIL-graded extraction reaching content/assets
    // would make the whole §4.2 guard table decorative.
    const good = FILE.barcodes["godie-u00n"]!;
    expect(approvalReasons(good)).toEqual([]);
    const failed: VoxelBarcode = {
      ...good,
      source: "extracted",
      extraction: {
        refImage: "icons/x.png",
        verdict: "FAIL",
        reasons: ["泥巴柱"],
        maxPairwiseDeltaE: 3,
        foregroundRatio: 0.9,
      },
    };
    expect(approvalReasons(failed)).toContain("extraction verdict FAIL ≠ PASS");
    const muddy: VoxelBarcode = {
      ...good,
      bands: {
        ...good.bands,
        top: { hex: "#c9a96a", frac: 0.22 },
        pants: { hex: "#c9a96a", frac: 0.22 },
        hatBand: { hex: "#c9a96a", frac: 0.04 },
        hatBrim: { hex: "#c9a96a", frac: 0.03 },
        face: { hex: "#c9a96a", frac: 0.13 },
        shin: { hex: "#c9a96a", frac: 0.12 },
        shoe: { hex: "#c9a96a", frac: 0.08 },
      },
    };
    expect(approvalReasons(muddy).join(" ")).toMatch(/泥巴柱/);
  });
});

describe("THE PNG ON DISK — 每一帶的中心點像素 === 規格 hex", () => {
  it.each(CASES)("%s", (championId, row) => {
    const names = barcodeFileNames(championId);
    const img = decodePng(fs.readFileSync(path.join(OUT_DIR, names.png)));
    expect([img.w, img.h]).toEqual([ATLAS_W, ATLAS_H]);

    let checked = 0;
    for (const part of PARTS) {
      const want = authored(row.barcode, part);
      for (const face of CLEAN_FACES) {
        const r = ATLAS_FACES[part][face];
        for (let x = 0; x < r.w; x++) {
          const seq = runs(img, r.x + x, r.y, r.y + r.h);
          // the character's colour sequence, top to bottom, off the shipped file
          expect(seq.map((s) => s.hex), `${part}.${face} col ${x}`).toEqual(
            want.map((b) => b.hex),
          );
          for (let i = 0; i < want.length; i++) {
            const run = seq[i]!;
            const cy = run.y0 + Math.floor((run.y1 - run.y0 - 1) / 2);
            expect(img.at(r.x + x, cy), `${part}.${face} band ${i} centre`).toBe(want[i]!.hex);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it.each(CASES)("%s: the arms follow the sleeve rule in the shipped file", (championId, row) => {
    // The arms are a third of the figure and are NOT bands (規格 §2.4), so they
    // need their own pixel check or a sleeve bug ships invisibly to every test
    // that only walks head / torso / legs.
    const img = decodePng(fs.readFileSync(path.join(OUT_DIR, barcodeFileNames(championId).png)));
    const top = row.barcode.bands.top!.hex.toLowerCase();
    const skin = row.barcode.bands.face!.hex.toLowerCase();
    const want = (half: "upper" | "lower"): string =>
      row.barcode.sleeve === "long"
        ? top
        : row.barcode.sleeve === "none"
          ? skin
          : half === "upper"
            ? top
            : skin;
    for (const which of ["armL", "armR"] as const) {
      for (const face of ["front", "back", "right", "left"] as const) {
        const r = ATLAS_FACES[which][face];
        const mid = Math.floor(r.h / 2);
        for (let y = 0; y < r.h; y++) {
          expect(img.at(r.x + 1, r.y + y), `${which}.${face} row ${y}`).toBe(
            want(y < mid ? "upper" : "lower"),
          );
        }
      }
      expect(img.at(ATLAS_FACES[which].top.x, ATLAS_FACES[which].top.y)).toBe(want("upper"));
      expect(img.at(ATLAS_FACES[which].bottom.x, ATLAS_FACES[which].bottom.y)).toBe(want("lower"));
    }
  });
});

describe("THE PNG INSIDE THE .glb — the model carries the same pixels", () => {
  it.each(CASES)("%s", (championId, row) => {
    const glb = parseGlb(fs.readFileSync(path.join(OUT_DIR, barcodeFileNames(championId).glb)));
    const inside = embeddedPng(glb);
    const beside = fs.readFileSync(path.join(OUT_DIR, barcodeFileNames(championId).png));
    // A correct sidecar next to a model embedding something else is the whole
    // "did it but the player can't get it" family in one file pair.
    expect(Buffer.from(inside).equals(beside)).toBe(true);

    const img = decodePng(inside);
    for (const part of PARTS) {
      const want = authored(row.barcode, part);
      const r = ATLAS_FACES[part].right;
      expect(runs(img, r.x, r.y, r.y + r.h).map((s) => s.hex), part).toEqual(
        want.map((b) => b.hex),
      );
    }
  });
});

describe("THE MESH READS IT — following the model's own UVs", () => {
  it.each(CASES)("%s: the head box samples the head's bands, right way up", (championId, row) => {
    const glb = parseGlb(fs.readFileSync(path.join(OUT_DIR, barcodeFileNames(championId).glb)));
    const prim = glb.json.meshes[0].primitives[0];
    const pos = floats(glb, prim.attributes.POSITION);
    const uv = floats(glb, prim.attributes.TEXCOORD_0);
    const img = decodePng(embeddedPng(glb));

    const headIndex = BOXES.findIndex((b) => b.name === "head");
    expect(headIndex).toBeGreaterThanOrEqual(0);
    const backFace = FACE_NAME_BY_NORMAL.indexOf("back");
    const base = (headIndex * 6 + backFace) * 4; // 6 faces × 4 verts per box

    // ① the face's UVs really are the head's `back` rect
    const rect = ATLAS_FACES.head.back;
    const us = [0, 1, 2, 3].map((i) => uv[(base + i) * 2]!);
    const vs = [0, 1, 2, 3].map((i) => uv[(base + i) * 2 + 1]!);
    expect(Math.min(...us) * ATLAS_W).toBeCloseTo(rect.x, 6);
    expect(Math.max(...us) * ATLAS_W).toBeCloseTo(rect.x + rect.w, 6);
    expect(Math.min(...vs) * ATLAS_H).toBeCloseTo(rect.y, 6);
    expect(Math.max(...vs) * ATLAS_H).toBeCloseTo(rect.y + rect.h, 6);

    // ② NOT UPSIDE DOWN. glTF's v grows downward and the atlas is authored
    //    top-down, so the vertex higher in the world must have the SMALLER v.
    //    A flipped figure wears its hair on its chin and passes every
    //    "has a texture" check ever written.
    const ys = [0, 1, 2, 3].map((i) => pos[(base + i) * 3 + 1]!);
    const highest = ys.indexOf(Math.max(...ys));
    const lowest = ys.indexOf(Math.min(...ys));
    expect(vs[highest]!).toBeLessThan(vs[lowest]!);

    // ③ walk the rect the mesh points at and read the character back out
    const want = authored(row.barcode, "head").map((b) => b.hex);
    const uMid = Math.round((Math.min(...us) + Math.max(...us)) * 0.5 * ATLAS_W - 0.5);
    const seq = runs(img, uMid, Math.round(Math.min(...vs) * ATLAS_H), Math.round(Math.max(...vs) * ATLAS_H));
    expect(seq.map((s) => s.hex)).toEqual(want);
  });

  it.each(CASES)("%s: every box's UVs stay inside the atlas", (championId) => {
    const glb = parseGlb(fs.readFileSync(path.join(OUT_DIR, barcodeFileNames(championId).glb)));
    const uv = floats(glb, glb.json.meshes[0].primitives[0].attributes.TEXCOORD_0);
    expect(uv.length).toBe(BOXES.length * 24 * 2);
    for (const v of uv) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // and none of them is the 16×16 palette LUT's texel centre, which is what
    // a bake that forgot to switch emitters would produce
    expect(uv.every((v) => Math.abs(v - 0.5 / 16) < 1e-9)).toBe(false);
  });

  it("the .glb is still one mesh, one material, one draw call", () => {
    const glb = parseGlb(fs.readFileSync(path.join(OUT_DIR, barcodeFileNames("godie-u00n").glb)));
    expect(glb.json.meshes).toHaveLength(1);
    expect(glb.json.materials).toHaveLength(1);
    expect(glb.json.meshes[0].primitives).toHaveLength(1);
    expect(glb.json.animations.length).toBeGreaterThan(0);
    // NEAREST, or one texel bleeds into its neighbour and the fine bands blur
    expect(glb.json.samplers[0].magFilter).toBe(9728);
  });
});

describe("--check is a real ratchet", () => {
  it("the files on disk are what the generator emits right now", () => {
    // The same contract `voxel:check` has for the five archetypes: a rebuild
    // that changed a byte without the artefacts being regenerated is a red
    // test, not a surprise in someone's next diff.
    for (const row of rows) {
      const names = barcodeFileNames(row.championId);
      expect(
        Buffer.from(row.png).equals(fs.readFileSync(path.join(OUT_DIR, names.png))),
        names.png,
      ).toBe(true);
      expect(
        Buffer.from(row.glb).equals(fs.readFileSync(path.join(OUT_DIR, names.glb))),
        names.glb,
      ).toBe(true);
    }
  });

  it("is deterministic — two builds emit the same bytes", () => {
    const again = buildAll();
    for (let i = 0; i < rows.length; i++) {
      expect(Buffer.from(again.rows[i]!.png).equals(Buffer.from(rows[i]!.png))).toBe(true);
      expect(Buffer.from(again.rows[i]!.glb).equals(Buffer.from(rows[i]!.glb))).toBe(true);
    }
  });
});
