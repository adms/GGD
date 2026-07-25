/**
 * texture — the 16×16 palette image a generated figure samples.
 *
 * The mesh has ONE material and ONE texture; every box face's four UVs sit on
 * the texel CENTRE of its palette slot (`boxman.slotUv`). So the "texture" is
 * not art, it is a lookup table, and generating it from the look's hex colours
 * is what makes a palette edit in the studio a real re-skin rather than a
 * preview-only tint.
 *
 * WHY EVERY COLUMN IS FILLED TOP TO BOTTOM. A sampler set to linear filtering,
 * or a mip level the engine picks on its own, can average neighbouring texels.
 * Filling the whole column with its slot colour (and repeating the 8 slots into
 * columns 8–15) means every possible average of neighbours within a column is
 * that same colour, so a filtering mode nobody chose deliberately cannot smear
 * two body parts into each other. It costs 1 KB.
 *
 * `Uint8Array`, not `Buffer`: this module has to run in the admin's browser
 * bundle as well as in the node bake. `tools/voxel-gen/png.ts` wraps the result
 * (`Buffer.from(rgba)`) rather than owning the pixel decision — that keeps the
 * bake and the studio looking at literally the same bytes, and gives task #231
 * (體素角色貼圖自動生成) exactly one place to plug into.
 */
import { TEX_EDGE, type SlotName, SLOT } from "./boxman";
import type { VoxelLook } from "./look";

export interface PaletteImage {
  readonly width: number;
  readonly height: number;
  /** RGBA8, row-major, top row first — the layout a PNG IDAT wants */
  readonly rgba: Uint8Array;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** The palette image for a look. Pure, deterministic, allocation-only. */
export function paletteRgba(look: VoxelLook): PaletteImage {
  const w = TEX_EDGE;
  const h = TEX_EDGE;
  const rgba = new Uint8Array(w * h * 4);
  const slots = look.palette.map(parseHex);
  for (let x = 0; x < w; x++) {
    const c = slots[x % slots.length] ?? [255, 0, 255];
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

/** `#rrggbb` for a slot, for the studio's swatch row. */
export function slotColor(look: VoxelLook, slot: SlotName): string {
  return look.palette[SLOT[slot]] ?? "#ffffff";
}
