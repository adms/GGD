/**
 * Pure procedural canvas painters for the login scene's runtime textures. NO
 * image files anywhere in this feature — every sprite/sky is drawn here onto a
 * Babylon DynamicTexture's 2D context (see ./sprites). The functions take a
 * minimal context interface (not the DOM `CanvasRenderingContext2D`) so they
 * unit-test against a recording mock with no real canvas.
 */

/** The slice of a 2D canvas context these painters actually touch. */
export interface Ctx2DLike {
  fillStyle: string | GradientLike;
  globalAlpha: number;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): GradientLike;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

/** A vertical [offset, cssColor] gradient stop. */
export type ColorStop = readonly [number, string];

/**
 * Dark-epic isekai BOSS-BATTLE sky, top → bottom: near-black void zenith,
 * deep navy, a bruised violet mid-band, and a smouldering ember horizon where
 * the arenas burn. Deliberately DARK so the emissive arenas / dragons / beams
 * POP against it through the bloom pass. Painted into a tall gradient and
 * wrapped onto the inside of the sky dome.
 */
export const SKY_STOPS: readonly ColorStop[] = [
  [0.0, "#03040a"], // zenith — near-black void
  [0.34, "#0a1024"], // deep navy
  [0.62, "#161238"], // bruised indigo/violet
  [0.84, "#2a1630"], // dark plum toward the horizon
  [1.0, "#4a1c1e"], // smouldering ember horizon glow
] as const;

/**
 * Paint a soft radial "light dot": opaque warm-white core fading to fully
 * transparent at the rim. Used as the additive sprite for motes, petals and
 * cloud puffs — the bloom pass turns it into a glow.
 */
export function drawSoftDot(ctx: Ctx2DLike, size: number): void {
  const r = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,250,235,0.85)");
  g.addColorStop(0.7, "rgba(255,240,220,0.28)");
  g.addColorStop(1.0, "rgba(255,235,210,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** Positions (unit square) of the soft blobs that make a fluffy cloud puff. */
const CLOUD_BLOBS: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.55, 0.42],
  [0.32, 0.62, 0.3],
  [0.68, 0.6, 0.32],
  [0.44, 0.44, 0.28],
  [0.6, 0.46, 0.26],
] as const;

/**
 * Paint a soft cloud: several overlapping translucent radial blobs so the
 * silhouette reads as fluffy rather than a single disc. Transparent
 * background; billboarded onto a plane in the scene.
 */
export function drawCloud(ctx: Ctx2DLike, size: number): void {
  ctx.clearRect(0, 0, size, size);
  for (const [cx, cy, rad] of CLOUD_BLOBS) {
    const x = cx * size;
    const y = cy * size;
    const r = rad * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0.0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.55, "rgba(255,252,255,0.5)");
    g.addColorStop(1.0, "rgba(255,250,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}

/**
 * Paint a vertical gradient (top→bottom) from a stop table. Used for the sky
 * dome texture; `stops` defaults to {@link SKY_STOPS}.
 */
export function paintVerticalGradient(
  ctx: Ctx2DLike,
  width: number,
  height: number,
  stops: readonly ColorStop[] = SKY_STOPS,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}
