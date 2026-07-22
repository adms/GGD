/**
 * cursor/cursorTheme — the PURE description of the JRPG cursor set: which
 * variants exist, the PNG size ladder, where each asset lives and where its
 * hotspot sits. No DOM, no storage, no React — so it unit-tests in the client's
 * `node` vitest env and is safe to import from any layer.
 *
 * THE ONE SOURCE OF TRUTH. `scripts/gen-cursors.ts` imports this module to
 * decide which files to emit and under which names; `applyCursor.ts` imports it
 * to build the CSS `cursor:` values; `cursor.test.ts` walks it to assert every
 * (variant × size) pair resolves to a file that actually exists on disk with an
 * in-bounds hotspot. Add a size here and the generator, the CSS and the gate all
 * follow — nothing else hard-codes a pixel number or a filename.
 *
 * WHY A LADDER OF RASTERS AND NOT ONE SVG: Safari does not support SVG in
 * `cursor: url(...)`, and every engine caps cursor images (~128px in Chrome/
 * Safari) and refuses to scale them — a cursor image renders at its intrinsic
 * size. "Bigger cursor" therefore means "a bigger PNG", which is exactly what
 * the size setting selects.
 */

/** The three cursor states the game actually needs. */
export type CursorVariant = "default" | "pointer" | "attack";

/** Size steps offered to the player (S/M/L/XL). */
export type CursorSize = "s" | "m" | "l" | "xl";

export const CURSOR_VARIANTS: readonly CursorVariant[] = ["default", "pointer", "attack"];

export const CURSOR_SIZES: readonly CursorSize[] = ["s", "m", "l", "xl"];

/**
 * Rasterised edge length per step, in CSS px. 96 is the top of the ladder on
 * purpose: Chrome/Safari ignore cursor images larger than 128px (and Firefox
 * gets unreliable well before that), so XL stays comfortably inside the cap.
 */
export const CURSOR_SIZE_PX: Record<CursorSize, number> = { s: 32, m: 48, l: 64, xl: 96 };

/** Short label for a size picker (the audio-cluster control renders these). */
export const CURSOR_SIZE_LABEL: Record<CursorSize, string> = {
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
};

/**
 * Default = M (48px). Deliberately LARGER than the ~32px OS arrow: the request
 * that produced this feature was "畫面中太多物件" — the cursor gets lost in a
 * busy arena — so the out-of-the-box cursor has to be the conspicuous one.
 */
export const DEFAULT_CURSOR_SIZE: CursorSize = "m";

/** Edge length of the design space every shape and hotspot is authored in. */
export const CURSOR_DESIGN_UNITS = 64;

/** Public (vite `public/`) directory the rasters are served from. */
export const CURSOR_ASSET_DIR = "/cursors";

/**
 * Hotspot per variant, in DESIGN units (0..64) — the actual click point:
 *   • default / pointer — the blade tip at the top-left, a hair inside the
 *     apex so the hotspot lands on opaque pixels rather than on the
 *     anti-aliased corner;
 *   • attack — the dead centre of the reticle.
 * Per-size integer hotspots are derived from these by `cursorHotspot()`, so a
 * size can never ship with a stale, hand-copied coordinate.
 */
export const CURSOR_HOTSPOT_DESIGN: Record<CursorVariant, { x: number; y: number }> = {
  default: { x: 2.4, y: 2.4 },
  pointer: { x: 2.4, y: 2.4 },
  attack: { x: 32, y: 32 },
};

/** `true` for a value that is one of the four size steps. */
export function isCursorSize(v: unknown): v is CursorSize {
  return typeof v === "string" && (CURSOR_SIZES as readonly string[]).includes(v);
}

/** Bare filename of a raster, e.g. `ggd-cursor-pointer-48.png`. */
export function cursorAssetFile(variant: CursorVariant, size: CursorSize): string {
  return `ggd-cursor-${variant}-${CURSOR_SIZE_PX[size]}.png`;
}

/** Absolute URL of a raster (absolute so it is independent of the caller). */
export function cursorAssetUrl(variant: CursorVariant, size: CursorSize): string {
  return `${CURSOR_ASSET_DIR}/${cursorAssetFile(variant, size)}`;
}

/** Bare filename of the vector master for a variant (design reference only). */
export function cursorSvgFile(variant: CursorVariant): string {
  return `ggd-cursor-${variant}.svg`;
}

/**
 * Integer hotspot for one raster, scaled from the design coordinate and clamped
 * into the image. Every pair on the current ladder lands well inside its raster,
 * so the clamp is a guard for future edits: an out-of-range hotspot is not a
 * cosmetic slip — engines reject the whole `cursor` declaration and the player
 * silently gets the OS arrow back. `cursor.test.ts` asserts the bound holds.
 */
export function cursorHotspot(
  variant: CursorVariant,
  size: CursorSize,
): { x: number; y: number } {
  const px = CURSOR_SIZE_PX[size];
  const scale = px / CURSOR_DESIGN_UNITS;
  const d = CURSOR_HOTSPOT_DESIGN[variant];
  const clamp = (v: number): number => Math.min(px - 1, Math.max(0, Math.round(v * scale)));
  return { x: clamp(d.x), y: clamp(d.y) };
}

/**
 * The full CSS `cursor` image value for one variant at one size —
 * `url("/cursors/….png") 1 1`. Callers append their own keyword fallback
 * (`, auto` / `, pointer`), which every `cursor` list is required to end with.
 */
export function cursorCssValue(variant: CursorVariant, size: CursorSize): string {
  const { x, y } = cursorHotspot(variant, size);
  return `url("${cursorAssetUrl(variant, size)}") ${x} ${y}`;
}

/** CSS custom property that carries a variant's image value. */
export function cursorCssVar(variant: CursorVariant): string {
  return `--ggd-cursor-${variant}`;
}

export interface CursorSizeOption {
  value: CursorSize;
  /** short label for a segmented control ("S" / "M" / "L" / "XL") */
  label: string;
  /** rasterised edge length in CSS px (for a tooltip / aria-label) */
  px: number;
}

/**
 * The option list a size picker renders. Exported as data (not JSX) so the
 * control that consumes it — the size picker in the top audio cluster — owns
 * zero knowledge of the ladder.
 */
export const CURSOR_SIZE_OPTIONS: readonly CursorSizeOption[] = CURSOR_SIZES.map((value) => ({
  value,
  label: CURSOR_SIZE_LABEL[value],
  px: CURSOR_SIZE_PX[value],
}));
