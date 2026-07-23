/**
 * ELEMENT PALETTE (task #79 support).
 *
 * The colour/blend identity for each damage element the 48-champion roster
 * uses. A binding is `(element, primitive)`: the primitive supplies the SHAPE,
 * the element supplies the COLOUR — so `nova` + `ice` is a frost nova and
 * `nova` + `holy` is a divine nova, from one primitive (task #50, "one
 * primitive serves many abilities"). Colours are art-directed, not imported —
 * the 依文 (ice) spells that had NO ice now read cold and blue.
 */
import type { VfxBlendMode } from "@ggd/shared/content";
import type { Rgb } from "./primitives";

export type Element =
  | "fire"
  | "ice"
  | "lightning"
  | "wind"
  | "earth"
  | "holy"
  | "void"
  | "physical"
  | "nature"
  | "arcane"
  | "blood"
  | "ki"
  | "sound";

export interface ElementStyle {
  /** base rgb 0..1 — the tint stop of the primitive's ramp */
  color: Rgb;
  /** default blend for this element (dust/earth read better on alpha) */
  blend: VfxBlendMode;
}

export const ELEMENTS: Record<Element, ElementStyle> = {
  fire: { color: [1.0, 0.5, 0.15], blend: "additive" },
  ice: { color: [0.62, 0.85, 1.0], blend: "additive" },
  lightning: { color: [0.7, 0.82, 1.0], blend: "additive" },
  wind: { color: [0.74, 0.96, 0.82], blend: "additive" },
  earth: { color: [0.72, 0.52, 0.32], blend: "alpha" },
  holy: { color: [1.0, 0.94, 0.62], blend: "additive" },
  void: { color: [0.6, 0.32, 0.82], blend: "additive" },
  physical: { color: [0.92, 0.94, 1.0], blend: "additive" },
  nature: { color: [0.5, 0.9, 0.4], blend: "additive" },
  arcane: { color: [0.74, 0.45, 1.0], blend: "additive" },
  blood: { color: [0.78, 0.1, 0.1], blend: "additive" },
  ki: { color: [1.0, 0.86, 0.42], blend: "additive" },
  sound: { color: [0.3, 0.85, 0.82], blend: "additive" },
};

export const ELEMENT_NAMES = Object.keys(ELEMENTS) as Element[];

/** Style for an element (throws on a typo — the binding table is code). */
export function elementStyle(el: Element): ElementStyle {
  const s = ELEMENTS[el];
  if (!s) throw new Error(`unknown vfx element: ${el}`);
  return s;
}

/** The prefix `vfxKeyFor` (bindings.ts) stamps on every curated primitive doc. */
export const PRIM_VFX_PREFIX = "fx.prim.";

/**
 * Read the ELEMENT back out of a curated vfxKey.
 *
 * `vfxKeyFor` builds `fx.prim.<element>.<primitive>[-size]`, so the element an
 * ability was bound to in task #79 is recoverable at runtime from nothing but
 * its `vfxKey` — no second lookup table to drift out of sync with the first.
 * Anything else (an imported WC3 doc id, `fx.ember-bolt-cast`, undefined)
 * returns null and the caller falls back to the doc's own colour.
 */
export function elementFromVfxKey(key: string | undefined): Element | null {
  if (!key || !key.startsWith(PRIM_VFX_PREFIX)) return null;
  const rest = key.slice(PRIM_VFX_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  const name = rest.slice(0, dot);
  return name in ELEMENTS ? (name as Element) : null;
}
