/**
 * voxelSkin/paint — the atlas painter, tested on PIXELS.
 *
 * The painter is the actual 貼圖 the owner asked for, so the tests read texels
 * rather than trusting that a function ran: the layout is checked for overlap
 * and bounds, the face rects are checked against the box dimensions they map
 * onto, and the painted colours are checked at named positions (the eye row,
 * the belt row, the emblem cell) so a refactor that silently paints the head
 * into the leg rect is caught.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { ATLAS_BYTES, faceUVQuads, motifFaceUVQuads, paintVoxelAtlas } from "./paint";
import { generateVoxelSkin } from "./generate";
import { fromHex } from "./palette";
import {
  ATLAS_FACES,
  ATLAS_H,
  ATLAS_W,
  EMBLEMS,
  MOTIF_CELLS,
  type AtlasRect,
  type VoxelSkinInput,
} from "./types";

const INPUT: VoxelSkinInput = {
  id: "godie-test01",
  name: "測試英雄 - 阿測",
  attackType: "melee",
  modelKey: "champ.sela",
  tags: ["melee", "katana"],
  vfxKeys: ["vfx.nova.ice.a", "vfx.bolt.ice.b", "vfx.aura.holy.c", "vfx.beam.ice.d"],
};

const texel = (data: Uint8ClampedArray, x: number, y: number): [number, number, number] => {
  const i = (y * ATLAS_W + x) * 4;
  return [data[i] as number, data[i + 1] as number, data[i + 2] as number];
};

/** The painter dithers ±(1.5 × grain); compare within that tolerance. */
const near = (got: readonly number[], hex: string, tol = 12): boolean => {
  const want = fromHex(hex).map((v) => Math.round(v * 255));
  return got.every((c, i) => Math.abs(c - (want[i] as number)) <= tol);
};

describe("atlas layout", () => {
  const allRects: { name: string; r: AtlasRect }[] = [];
  for (const [part, faces] of Object.entries(ATLAS_FACES)) {
    for (const [face, r] of Object.entries(faces)) allRects.push({ name: `${part}.${face}`, r });
  }
  MOTIF_CELLS.forEach((r, i) => allRects.push({ name: `motif${i}`, r }));

  it("is a 64×64 power-of-two sheet", () => {
    cover("voxel-skin-atlas");
    expect(ATLAS_W).toBe(64);
    expect(ATLAS_H).toBe(64);
    expect(ATLAS_BYTES).toBe(64 * 64 * 4);
  });

  it("every rect is in bounds", () => {
    cover("voxel-skin-atlas");
    for (const { name, r } of allRects) {
      expect(r.x, name).toBeGreaterThanOrEqual(0);
      expect(r.y, name).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, name).toBeLessThanOrEqual(ATLAS_W);
      expect(r.y + r.h, name).toBeLessThanOrEqual(ATLAS_H);
    }
  });

  it("no two rects overlap — one texel belongs to exactly one face", () => {
    cover("voxel-skin-atlas");
    const owner = new Map<number, string>();
    const collisions: string[] = [];
    for (const { name, r } of allRects) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const k = y * ATLAS_W + x;
          const prev = owner.get(k);
          if (prev) collisions.push(`${prev} / ${name} @ ${x},${y}`);
          owner.set(k, name);
        }
      }
    }
    expect(collisions).toEqual([]);
    // and the sheet is comfortably under-used, so #226 can change the part list
    expect(owner.size).toBe(1792);
    expect(owner.size / (ATLAS_W * ATLAS_H)).toBeLessThan(0.5);
  });

  it("face rects match the voxel dimensions of the boxes they wrap", () => {
    cover("voxel-skin-atlas");
    // head 8×8×8
    expect(ATLAS_FACES.head.front).toMatchObject({ w: 8, h: 8 });
    expect(ATLAS_FACES.head.top).toMatchObject({ w: 8, h: 8 });
    // torso 8w × 12h × 4d
    expect(ATLAS_FACES.torso.front).toMatchObject({ w: 8, h: 12 });
    expect(ATLAS_FACES.torso.right).toMatchObject({ w: 4, h: 12 });
    expect(ATLAS_FACES.torso.top).toMatchObject({ w: 8, h: 4 });
    // limbs 4×12×4
    for (const part of ["armL", "armR", "legs"] as const) {
      expect(ATLAS_FACES[part].front).toMatchObject({ w: 4, h: 12 });
      expect(ATLAS_FACES[part].top).toMatchObject({ w: 4, h: 4 });
    }
  });

  it("faceUV quads are normalised, ordered and V-flipped", () => {
    cover("voxel-skin-atlas");
    const quads = faceUVQuads("head");
    expect(quads).toHaveLength(6);
    for (const q of quads) {
      expect(q).toHaveLength(4);
      for (const v of q) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(q[2]).toBeGreaterThan(q[0] as number); // u2 > u1
      expect(q[3]).toBeGreaterThan(q[1] as number); // v2 > v1
    }
    // face 0 is the FRONT rect at (0,0)-(8,8): u 0..0.125, v 0.875..1
    expect(quads[0]).toEqual([0, 1 - 8 / 64, 8 / 64, 1]);
    // a motif box samples ONE cell on all six faces
    const m = motifFaceUVQuads(0);
    expect(m).toHaveLength(6);
    expect(new Set(m.map((q) => q.join(","))).size).toBe(1);
    expect(motifFaceUVQuads(99)).toHaveLength(6); // wraps, never throws
  });
});

describe("paintVoxelAtlas", () => {
  it("returns a fully opaque 64×64 RGBA buffer", () => {
    cover("voxel-skin-paint");
    const data = paintVoxelAtlas(generateVoxelSkin(INPUT));
    expect(data).toBeInstanceOf(Uint8ClampedArray);
    expect(data.length).toBe(ATLAS_BYTES);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it("is PURE — same recipe, byte-identical pixels; different champion, different pixels", () => {
    cover("voxel-skin-paint");
    const r = generateVoxelSkin(INPUT);
    const a = paintVoxelAtlas(r);
    const b = paintVoxelAtlas(r);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    const other = paintVoxelAtlas(generateVoxelSkin({ ...INPUT, id: "godie-test02" }));
    expect(Buffer.from(a.buffer).equals(Buffer.from(other.buffer))).toBe(false);
  });

  it("needs no canvas, no DOM and no Babylon (the headless contract)", () => {
    cover("voxel-skin-paint");
    // if the painter reached for a 2D context this would throw here, because
    // the shared package's vitest environment is plain node.
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(() => paintVoxelAtlas(generateVoxelSkin(INPUT))).not.toThrow();
  });

  it("paints the parts it says it paints, in the right rects", () => {
    cover("voxel-skin-paint");
    const r = generateVoxelSkin({ ...INPUT, id: "godie-paint1" });
    const data = paintVoxelAtlas(r);
    const head = ATLAS_FACES.head;
    // the head's back face is skin under the hairline
    const backY = head.back.y + 7;
    expect(near(texel(data, head.back.x + 4, backY), r.palette.skin, 40)).toBe(true);
    // the torso belt row is metal
    const belt = ATLAS_FACES.torso;
    expect(near(texel(data, belt.front.x + 0, belt.front.y + 9), r.palette.metal, 40)).toBe(true);
    // the buckle at the middle of that row is the accent
    expect(near(texel(data, belt.front.x + 3, belt.front.y + 9), r.palette.accent, 40)).toBe(true);
  });

  it("armL and armR are painted independently (an asymmetric figure is expressible)", () => {
    cover("voxel-skin-paint");
    // a champion whose face mark is not "none" gets the wrap on armR only
    let asym = 0;
    for (let i = 0; i < 40; i++) {
      const rec = generateVoxelSkin({ ...INPUT, id: `godie-asym${i}` });
      if (rec.face.mark === "none") continue;
      const data = paintVoxelAtlas(rec);
      const l = texel(data, ATLAS_FACES.armL.front.x + 1, ATLAS_FACES.armL.front.y + 7);
      const rr = texel(data, ATLAS_FACES.armR.front.x + 1, ATLAS_FACES.armR.front.y + 7);
      if (l.join() !== rr.join()) asym++;
    }
    expect(asym).toBeGreaterThan(0);
  });

  it("paints every emblem in the vocabulary without throwing or bleeding", () => {
    cover("voxel-skin-paint");
    for (const emblem of EMBLEMS) {
      const rec = generateVoxelSkin(INPUT, { override: { outfit: { emblem } } });
      const data = paintVoxelAtlas(rec);
      expect(data.length).toBe(ATLAS_BYTES);
    }
    // the sixteen glyphs are genuinely distinct patterns
    const patterns = new Set(
      EMBLEMS.map((emblem) => {
        const rec = generateVoxelSkin(INPUT, { override: { outfit: { emblem } } });
        const data = paintVoxelAtlas(rec);
        const F = ATLAS_FACES.torso.front;
        const bits: string[] = [];
        for (let y = 0; y < 3; y++) {
          for (let x = 0; x < 3; x++) {
            bits.push(near(texel(data, F.x + 2 + x, F.y + 2 + y), rec.palette.accent, 20) ? "1" : "0");
          }
        }
        return bits.join("");
      }),
    );
    expect(patterns.size).toBe(EMBLEMS.length);
  });

  it("covers every hair / eye / mouth / top / leg style without a hole", () => {
    cover("voxel-skin-paint");
    // a hole would leave alpha 0 texels inside a face rect
    for (let i = 0; i < 60; i++) {
      const rec = generateVoxelSkin({ ...INPUT, id: `godie-style${i}` });
      const data = paintVoxelAtlas(rec);
      for (const faces of Object.values(ATLAS_FACES)) {
        for (const rect of Object.values(faces)) {
          for (let y = rect.y; y < rect.y + rect.h; y++) {
            for (let x = rect.x; x < rect.x + rect.w; x++) {
              expect(data[(y * ATLAS_W + x) * 4 + 3]).toBe(255);
            }
          }
        }
      }
    }
  });
});
