/**
 * Runtime DynamicTexture builders for the login scene. These wrap the pure
 * painters in ./paint onto a Babylon `DynamicTexture` — the ONLY bridge between
 * "procedural canvas" and "GPU texture". No asset files are ever fetched.
 *
 * `getContext()` can be absent on some headless canvases; every builder guards
 * for it and still returns a valid (blank) texture so the scene never throws.
 */
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";
import { drawSoftDot, drawCloud, paintVerticalGradient, SKY_STOPS, type Ctx2DLike } from "./paint";

/** A soft additive light-dot sprite for motes / petals / cloud billboards. */
export function makeSoftDotTexture(scene: Scene, size = 64): DynamicTexture {
  const dt = new DynamicTexture(`login-softdot-${size}`, { width: size, height: size }, scene, false);
  dt.hasAlpha = true;
  const ctx = dt.getContext() as unknown as Ctx2DLike | null;
  if (ctx) drawSoftDot(ctx, size);
  dt.update(false);
  return dt;
}

/** A fluffy cloud sprite (overlapping soft blobs, transparent background). */
export function makeCloudTexture(scene: Scene, size = 256): DynamicTexture {
  const dt = new DynamicTexture(`login-cloud-${size}`, { width: size, height: size }, scene, false);
  dt.hasAlpha = true;
  const ctx = dt.getContext() as unknown as Ctx2DLike | null;
  if (ctx) drawCloud(ctx, size);
  dt.update(false);
  return dt;
}

/**
 * The dawn/sunset sky gradient, painted tall (thin & tall so the vertical band
 * has resolution to spare) and wrapped onto the sky dome interior.
 */
export function makeSkyTexture(scene: Scene, height = 512): DynamicTexture {
  const width = 4; // gradient is purely vertical — a sliver is plenty
  const dt = new DynamicTexture("login-sky", { width, height }, scene, false);
  const ctx = dt.getContext() as unknown as Ctx2DLike | null;
  if (ctx) paintVerticalGradient(ctx, width, height, SKY_STOPS);
  dt.update(false);
  return dt;
}
