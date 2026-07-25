/**
 * voxelSkin/paint — THE 貼圖. A pure function from a recipe to the 64×64 RGBA
 * bytes of a champion's skin atlas.
 *
 * PURE ON PURPOSE: no Babylon, no canvas, no DOM. It writes into a
 * `Uint8ClampedArray`, which means
 *   • it is unit-testable headless (and IS tested pixel-by-pixel),
 *   • the admin contact sheet renders the EXACT SHIPPED PIXELS rather than an
 *     approximation of them,
 *   • the client can hand the buffer straight to `RawTexture.CreateRGBATexture`
 *     with no OffscreenCanvas — which is also why the render tests, which run
 *     on a NullEngine with no 2D context anywhere, do not need a canvas stub.
 *
 * 1 TEXEL = 1 VOXEL-PIXEL. Every rect in ATLAS_FACES matches the box face it
 * paints (head 8×8, torso 8×12, limbs 4×12), so nothing is ever resampled and
 * NEAREST filtering keeps the blocks hard-edged.
 *
 * EVERYTHING HERE IS AUTHORED IN-HOUSE. The glyphs are 3×3 bit patterns typed
 * into this file; the tones are the ladders in types.ts; no image, palette or
 * UV convention is taken from Mojang/Minecraft or from any copyrighted
 * character art. The layout is this project's own (see types.ts).
 */
import { dither } from "./hash";
import { fromHex, type Rgb } from "./palette";
import { textureSeed } from "./generate";
import {
  ATLAS_H,
  ATLAS_W,
  ATLAS_FACES,
  MOTIF_CELLS,
  type AtlasRect,
  type BoxFace,
  type VoxelSkinRecipe,
} from "./types";

/** RGBA bytes of one atlas: 64 × 64 × 4. */
export const ATLAS_BYTES = ATLAS_W * ATLAS_H * 4;

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Multiply a colour toward black (shade) or white (tint) — 3×3 glyph shading. */
function shade(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}
function lift(c: Rgb, k: number): Rgb {
  return [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
}

/**
 * 3×3 in-house glyph vocabulary for the chest emblem — shapes, not logos. Each
 * entry is three rows of three bits, MSB = leftmost column. All sixteen are
 * distinct as bit triples (asserted in paint.test.ts) so no two champions can
 * accidentally wear the same chest mark.
 */
const GLYPHS: Readonly<Record<string, readonly [number, number, number]>> = Object.freeze({
  cross: [0b010, 0b111, 0b010],
  chevron: [0b100, 0b010, 0b001],
  star: [0b101, 0b010, 0b101],
  ring: [0b111, 0b101, 0b111],
  bolt: [0b011, 0b010, 0b110],
  skull: [0b111, 0b101, 0b010],
  leaf: [0b011, 0b111, 0b110],
  gear: [0b101, 0b111, 0b101],
  drop: [0b010, 0b111, 0b111],
  flame: [0b010, 0b011, 0b111],
  crescent: [0b110, 0b100, 0b110],
  eye: [0b000, 0b111, 0b010],
  spiral: [0b111, 0b001, 0b111],
  grid: [0b101, 0b000, 0b101],
  arrow: [0b010, 0b010, 0b111],
  bone: [0b110, 0b010, 0b011],
});

/** Mutable painting surface over the RGBA buffer. */
class Sheet {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly seed: number,
  ) {}

  /** One texel, with the deterministic ±1.5/255-scale grain applied. */
  px(x: number, y: number, c: Rgb, grain = 6): void {
    if (x < 0 || y < 0 || x >= ATLAS_W || y >= ATLAS_H) return;
    const d = dither(this.seed, x, y) * grain;
    const i = (y * ATLAS_W + x) * 4;
    this.data[i] = clampByte(c[0] * 255 + d);
    this.data[i + 1] = clampByte(c[1] * 255 + d);
    this.data[i + 2] = clampByte(c[2] * 255 + d);
    this.data[i + 3] = 255;
  }

  /** Fill a sub-rect of `r`, in the rect's own local coordinates. */
  fill(r: AtlasRect, x0: number, y0: number, w: number, h: number, c: Rgb, grain = 6): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
        this.px(r.x + x, r.y + y, c, grain);
      }
    }
  }

  /** Fill the whole rect. */
  all(r: AtlasRect, c: Rgb, grain = 6): void {
    this.fill(r, 0, 0, r.w, r.h, c, grain);
  }

  /** One texel in a rect's local coordinates. */
  set(r: AtlasRect, x: number, y: number, c: Rgb, grain = 6): void {
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
    this.px(r.x + x, r.y + y, c, grain);
  }
}

/** Rows of hair on each side face, per style: `[front, back, side, topFull]`. */
const HAIRLINE: Readonly<Record<string, readonly [number, number, number, boolean]>> =
  Object.freeze({
    bowl: [3, 3, 3, true],
    spiky: [2, 3, 3, true],
    "long-back": [2, 8, 6, true],
    topknot: [2, 3, 2, true],
    bald: [0, 0, 0, false],
    "shaved-band": [1, 1, 2, true],
    braid: [3, 8, 4, true],
    tufts: [1, 3, 2, true],
  });

// ---------------------------------------------------------------------------

function paintHead(s: Sheet, r: VoxelSkinRecipe, p: Readonly<Record<string, Rgb>>): void {
  const F = ATLAS_FACES.head;
  const faces: BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];
  for (const f of faces) s.all(F[f], p.skin as Rgb);
  // the bottom of the head is the neck: always in shadow, never hair
  s.all(F.bottom, shade(p.skin as Rgb, 0.62));

  const [fRows, bRows, sRows, topFull] =
    HAIRLINE[r.hair.style] ?? (HAIRLINE.bowl as readonly [number, number, number, boolean]);
  const hair = p.hair as Rgb;
  if (topFull) s.all(F.top, hair);
  s.fill(F.front, 0, 0, 8, fRows, hair);
  s.fill(F.back, 0, 0, 8, bRows, hair);
  s.fill(F.right, 0, 0, 8, sRows, hair);
  s.fill(F.left, 0, 0, 8, sRows, hair);
  // style flourishes that change the SILHOUETTE read on the front face
  if (r.hair.style === "spiky") {
    for (let x = 0; x < 8; x += 2) s.set(F.front, x, fRows, hair);
  } else if (r.hair.style === "topknot") {
    s.fill(F.top, 3, 3, 2, 2, shade(hair, 0.8));
    s.fill(F.back, 3, bRows, 2, 2, hair);
  } else if (r.hair.style === "shaved-band") {
    s.fill(F.right, 0, 2, 8, 1, shade(hair, 0.55));
    s.fill(F.left, 0, 2, 8, 1, shade(hair, 0.55));
  } else if (r.hair.style === "braid") {
    s.fill(F.back, 3, 0, 2, 8, shade(hair, 0.82));
  } else if (r.hair.style === "tufts") {
    s.set(F.front, 1, 1, hair);
    s.set(F.front, 6, 1, hair);
  }

  // ---- eyes: the cheapest identity read on an 8×8 face ----
  const eye = p.eye as Rgb;
  const white = lift(p.skin as Rgb, 0.85);
  const dark = shade(p.skin as Rgb, 0.25);
  const L = F.front;
  switch (r.face.eye) {
    case "dot":
      s.set(L, 2, 4, eye);
      s.set(L, 5, 4, eye);
      break;
    case "slash":
      s.fill(L, 1, 4, 2, 1, eye);
      s.fill(L, 5, 4, 2, 1, eye);
      break;
    case "closed":
      s.fill(L, 1, 5, 2, 1, dark);
      s.fill(L, 5, 5, 2, 1, dark);
      break;
    case "visor-bar":
      s.fill(L, 0, 4, 8, 1, shade(p.metal as Rgb, 0.7));
      s.fill(L, 1, 4, 2, 1, eye);
      s.fill(L, 5, 4, 2, 1, eye);
      break;
    case "wide":
      s.fill(L, 1, 3, 2, 2, white);
      s.fill(L, 5, 3, 2, 2, white);
      s.set(L, 2, 4, eye);
      s.set(L, 5, 4, eye);
      break;
    case "single-eyepatch":
      s.fill(L, 1, 4, 2, 1, eye);
      s.fill(L, 4, 3, 4, 3, shade(p.metal as Rgb, 0.35)); // the patch
      s.fill(L, 0, 3, 8, 1, shade(p.metal as Rgb, 0.5)); // the strap
      s.fill(L, 1, 4, 2, 1, eye); // keep the good eye above the strap
      break;
  }

  // ---- mouth ----
  switch (r.face.mouth) {
    case "neutral":
      s.fill(L, 3, 6, 2, 1, dark);
      break;
    case "fang":
      s.fill(L, 3, 6, 2, 1, dark);
      s.set(L, 4, 6, lift(p.metal as Rgb, 0.6));
      break;
    case "grin":
      s.fill(L, 2, 6, 4, 1, dark);
      s.fill(L, 3, 6, 2, 1, lift(p.metal as Rgb, 0.7));
      break;
    case "mask-band":
      s.fill(L, 0, 5, 8, 3, p.outfitSecondary as Rgb);
      s.fill(L, 0, 5, 8, 1, shade(p.outfitSecondary as Rgb, 0.7));
      break;
    case "stitch":
      s.set(L, 2, 6, dark);
      s.set(L, 4, 6, dark);
      s.set(L, 6, 6, dark);
      break;
  }

  // ---- optional mark ----
  const acc = p.accent as Rgb;
  switch (r.face.mark) {
    case "scar":
      s.set(L, 6, 2, acc);
      s.set(L, 6, 3, acc);
      s.set(L, 5, 4, acc);
      break;
    case "forehead-gem":
      s.set(L, 3, 2, acc);
      s.set(L, 4, 2, lift(acc, 0.4));
      break;
    case "warpaint":
      s.fill(L, 0, 3, 1, 2, acc);
      s.fill(L, 7, 3, 1, 2, acc);
      break;
    case "tribal-band":
      s.fill(L, 0, 2, 8, 1, acc);
      break;
    case "tear-line":
      s.set(L, 2, 5, acc);
      s.set(L, 5, 5, acc);
      break;
    case "none":
      break;
  }
}

function paintTorso(s: Sheet, r: VoxelSkinRecipe, p: Readonly<Record<string, Rgb>>): void {
  const F = ATLAS_FACES.torso;
  const prim = p.outfitPrimary as Rgb;
  const sec = p.outfitSecondary as Rgb;
  const metal = p.metal as Rgb;
  const skin = p.skin as Rgb;
  const faces: BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];
  for (const f of faces) s.all(F[f], prim);
  s.all(F.bottom, shade(prim, 0.6));

  switch (r.outfit.top) {
    case "tunic":
      s.fill(F.front, 0, 0, 8, 1, sec);
      s.fill(F.back, 0, 0, 8, 1, sec);
      break;
    case "plate":
      s.fill(F.front, 0, 0, 8, 8, metal);
      s.fill(F.back, 0, 0, 8, 8, shade(metal, 0.85));
      s.fill(F.right, 0, 0, 4, 8, shade(metal, 0.9));
      s.fill(F.left, 0, 0, 4, 8, shade(metal, 0.9));
      s.all(F.top, shade(metal, 1.05));
      break;
    case "robe":
      s.fill(F.front, 0, 5, 8, 7, sec);
      s.fill(F.back, 0, 5, 8, 7, sec);
      s.fill(F.right, 0, 5, 4, 7, shade(sec, 0.88));
      s.fill(F.left, 0, 5, 4, 7, shade(sec, 0.88));
      break;
    case "jacket":
      s.fill(F.front, 3, 0, 2, 12, sec);
      s.fill(F.front, 0, 0, 8, 1, shade(sec, 0.8));
      break;
    case "bare-chest":
      for (const f of ["front", "back", "right", "left", "top"] as BoxFace[]) s.all(F[f], skin);
      s.fill(F.front, 0, 9, 8, 3, prim);
      s.fill(F.back, 0, 9, 8, 3, prim);
      s.fill(F.right, 0, 9, 4, 3, prim);
      s.fill(F.left, 0, 9, 4, 3, prim);
      break;
    case "vest":
      s.fill(F.front, 0, 0, 2, 12, sec);
      s.fill(F.front, 6, 0, 2, 12, sec);
      s.fill(F.back, 0, 0, 8, 12, sec);
      break;
    case "kimono": {
      // V-lapel: a widening wedge of the secondary colour down the chest
      for (let y = 0; y < 7; y++) {
        const halfW = Math.max(1, Math.round((7 - y) / 1.5));
        s.fill(F.front, 4 - halfW, y, halfW * 2, 1, sec);
      }
      s.fill(F.back, 0, 0, 8, 2, sec);
      break;
    }
    case "coat":
      s.fill(F.right, 0, 0, 1, 12, sec);
      s.fill(F.left, 3, 0, 1, 12, sec);
      s.fill(F.front, 0, 8, 8, 4, shade(prim, 0.78));
      s.fill(F.back, 0, 8, 8, 4, shade(prim, 0.78));
      break;
  }

  // ---- chest emblem (in-house 3×3 glyph) ----
  const glyph = GLYPHS[r.outfit.emblem] ?? GLYPHS.cross;
  if (glyph) {
    const acc = p.accent as Rgb;
    for (let gy = 0; gy < 3; gy++) {
      const row = glyph[gy] as number;
      for (let gx = 0; gx < 3; gx++) {
        if ((row >> (2 - gx)) & 1) s.set(F.front, 2 + gx, 2 + gy, acc, 3);
      }
    }
  }

  // ---- belt (always last, so it sits over the garment) ----
  s.fill(F.front, 0, 9, 8, 1, metal);
  s.fill(F.back, 0, 9, 8, 1, shade(metal, 0.85));
  s.fill(F.right, 0, 9, 4, 1, shade(metal, 0.9));
  s.fill(F.left, 0, 9, 4, 1, shade(metal, 0.9));
  s.fill(F.front, 3, 9, 2, 1, p.accent as Rgb, 3); // buckle
}

function paintArm(
  s: Sheet,
  r: VoxelSkinRecipe,
  p: Readonly<Record<string, Rgb>>,
  which: "armL" | "armR",
): void {
  const F = ATLAS_FACES[which];
  const prim = p.outfitPrimary as Rgb;
  const skin = p.skin as Rgb;
  const metal = p.metal as Rgb;
  const faces: BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];
  for (const f of faces) s.all(F[f], prim);
  s.all(F.top, shade(prim, 1.06));
  s.all(F.bottom, shade(skin, 0.7)); // the palm

  // Full sleeve for the covered silhouettes, bare forearm for the rest — read
  // off the recipe itself so the painter stays pure over one input.
  const fullSleeve = r.outfit.top === "robe" || r.outfit.top === "coat" || r.outfit.top === "plate";
  const sleeveEnd = fullSleeve ? 10 : 6;
  for (const f of ["front", "back", "right", "left"] as BoxFace[]) {
    if (!fullSleeve) s.fill(F[f], 0, sleeveEnd, 4, 12 - sleeveEnd, skin);
    s.fill(F[f], 0, sleeveEnd - 1, 4, 1, metal); // cuff
    if (r.outfit.top === "bare-chest") s.fill(F[f], 0, 0, 4, sleeveEnd - 1, skin);
  }
  // shoulder cap — the top two rows read as the join at combat distance
  for (const f of ["front", "back", "right", "left"] as BoxFace[]) {
    s.fill(F[f], 0, 0, 4, 1, p.outfitSecondary as Rgb);
  }
  // ASYMMETRY: one arm carries a wrap. armL and armR have separate atlas
  // regions precisely so the figure is not mirror-symmetric.
  if (which === "armR" && r.face.mark !== "none") {
    for (const f of ["front", "back", "right", "left"] as BoxFace[]) {
      s.fill(F[f], 0, 7, 4, 2, p.accent as Rgb, 3);
    }
  }
}

function paintLegs(s: Sheet, r: VoxelSkinRecipe, p: Readonly<Record<string, Rgb>>): void {
  const F = ATLAS_FACES.legs;
  const prim = p.outfitPrimary as Rgb;
  const sec = p.outfitSecondary as Rgb;
  const skin = p.skin as Rgb;
  const boot = shade(p.metal as Rgb, 0.55);
  const faces: BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];
  for (const f of faces) s.all(F[f], sec);
  s.all(F.bottom, shade(boot, 0.7)); // sole
  const sides: BoxFace[] = ["front", "back", "right", "left"];

  switch (r.outfit.legs) {
    case "trousers":
      for (const f of sides) s.fill(F[f], 0, 9, 4, 3, boot);
      break;
    case "greaves":
      for (const f of sides) {
        s.fill(F[f], 0, 0, 4, 9, p.metal as Rgb);
        s.fill(F[f], 0, 6, 4, 1, p.accent as Rgb, 3); // knee
        s.fill(F[f], 0, 9, 4, 3, boot);
      }
      break;
    case "skirt":
      for (const f of sides) {
        s.fill(F[f], 0, 0, 4, 5, prim);
        s.fill(F[f], 0, 5, 4, 4, skin);
        s.fill(F[f], 0, 9, 4, 3, boot);
      }
      break;
    case "hakama":
      for (const f of sides) {
        s.fill(F[f], 0, 0, 4, 8, prim);
        s.fill(F[f], 0, 8, 4, 4, shade(sec, 0.7));
      }
      break;
    case "shorts":
      for (const f of sides) {
        s.fill(F[f], 0, 4, 4, 5, skin);
        s.fill(F[f], 0, 9, 4, 3, boot);
      }
      break;
    case "boots-tall":
      for (const f of sides) s.fill(F[f], 0, 5, 4, 7, boot);
      break;
  }
}

/** Which palette slot a motif is painted in — motif geometry samples one cell. */
const MOTIF_TONE: Readonly<Record<string, string>> = Object.freeze({
  hood: "outfitPrimary",
  horns: "metal",
  "beast-ears": "hair",
  "brim-hat": "outfitSecondary",
  crown: "accent",
  halo: "accent",
  mask: "metal",
  antenna: "metal",
  headband: "accent",
  pauldrons: "metal",
  spikes: "metal",
  epaulets: "accent",
  shawl: "outfitSecondary",
  cape: "outfitPrimary",
  "scarf-tail": "accent",
  tail: "hair",
  backpack: "metal",
  "wing-stubs": "outfitSecondary",
  none: "outfitSecondary",
});

function paintMotifCells(s: Sheet, r: VoxelSkinRecipe, p: Readonly<Record<string, Rgb>>): void {
  const slots = [r.motifs.head, r.motifs.shoulder, r.motifs.back];
  for (let i = 0; i < MOTIF_CELLS.length; i++) {
    const cell = MOTIF_CELLS[i] as AtlasRect;
    const slot = slots[i] ?? slots[i % 3] ?? "none";
    const base = (p[MOTIF_TONE[slot] ?? "outfitSecondary"] ?? p.outfitSecondary) as Rgb;
    s.all(cell, base);
    // a light rim so a motif box does not read as a flat blob at distance
    s.fill(cell, 0, 0, 8, 1, lift(base, 0.22));
    s.fill(cell, 0, 7, 8, 1, shade(base, 0.72));
  }
}

/**
 * PAINT ONE CHAMPION'S ATLAS. The single entry point; returns freshly allocated
 * RGBA bytes, fully opaque, ready for `RawTexture.CreateRGBATexture`.
 */
export function paintVoxelAtlas(recipe: VoxelSkinRecipe): Uint8ClampedArray {
  const data = new Uint8ClampedArray(ATLAS_BYTES);
  const s = new Sheet(data, textureSeed(recipe));
  const p: Record<string, Rgb> = {
    // (filled below; declared first so the background can use it)
    skin: fromHex(recipe.palette.skin),
    hair: fromHex(recipe.palette.hair),
    outfitPrimary: fromHex(recipe.palette.outfitPrimary),
    outfitSecondary: fromHex(recipe.palette.outfitSecondary),
    metal: fromHex(recipe.palette.metal),
    eye: fromHex(recipe.palette.eye),
    accent: fromHex(recipe.palette.accent),
  };
  // BACKGROUND FIRST. The 2,304 unused texels (the 2.3× headroom left for #226)
  // would otherwise be transparent black, and a bilinear/mip sampler could bleed
  // them into a face edge as a dark halo. Filling the sheet opaque makes the
  // atlas safe under any sampling mode, at zero cost.
  s.all({ x: 0, y: 0, w: ATLAS_W, h: ATLAS_H }, shade(p.outfitPrimary as Rgb, 0.5), 0);
  paintHead(s, recipe, p);
  paintTorso(s, recipe, p);
  paintArm(s, recipe, p, "armL");
  paintArm(s, recipe, p, "armR");
  paintLegs(s, recipe, p);
  paintMotifCells(s, recipe, p);
  return data;
}

/**
 * `faceUV` for one part, as flat `[u1,v1,u2,v2]` quadruples in Babylon's face
 * order. The renderer turns each into a `Vector4`; keeping the maths here means
 * the atlas layout and its UVs can never drift apart.
 *
 * V is flipped because the atlas is authored TOP-DOWN (natural for painting)
 * and uploaded with `invertY`, so texel row 0 is v = 1.
 */
export function faceUVQuads(part: keyof typeof ATLAS_FACES): number[][] {
  const F = ATLAS_FACES[part];
  const order: BoxFace[] = ["front", "back", "right", "left", "top", "bottom"];
  return order.map((f) => {
    const r = F[f];
    return [r.x / ATLAS_W, 1 - (r.y + r.h) / ATLAS_H, (r.x + r.w) / ATLAS_W, 1 - r.y / ATLAS_H];
  });
}

/** `faceUV` quads for a motif box sampling motif cell `i` (0..5) on all faces. */
export function motifFaceUVQuads(i: number): number[][] {
  const r = MOTIF_CELLS[Math.abs(i) % MOTIF_CELLS.length] as AtlasRect;
  const q = [r.x / ATLAS_W, 1 - (r.y + r.h) / ATLAS_H, (r.x + r.w) / ATLAS_W, 1 - r.y / ATLAS_H];
  return [q, q, q, q, q, q].map((v) => [...v]);
}
