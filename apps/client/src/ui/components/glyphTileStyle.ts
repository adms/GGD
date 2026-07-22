/**
 * glyphTileStyle — the PROCEDURAL FALLBACK for an entry that has no icon.
 *
 * Most of the content tree has no picture and will not have one for a while:
 * 113 of 881 docs carry art, the rest were Blizzard stock references we cannot
 * ship (see tools/icon-gen). A good fallback is therefore worth more than a
 * rushed generated icon, and it has to keep being good after task #72 lands —
 * some entries are deliberately never getting art at all.
 *
 * WHAT WAS WRONG WITH THE OLD ONE. Four screens had each grown their own
 * near-identical letter tile — flat `#232a3a`, dim grey glyph — so EVERY
 * icon-less entry rendered as the same grey box. A shop list of thirty items
 * was thirty identical squares: the tile carried no information at all, and
 * two adjacent rows were indistinguishable at a glance. The shop's inventory
 * slots had no fallback whatsoever (IconImg renders null), so a bought item
 * with no art left a ragged hole where the tile should be.
 *
 * WHAT THIS DOES INSTEAD. The tile is derived from the entry's ID, so it is
 * stable for that entry forever and DIFFERENT from its neighbours: a hashed
 * hue picks one of twelve well-separated colours, and the tile is drawn as a
 * dark radial pool of that hue with a matching rim.
 *
 * It deliberately mirrors the art direction of the generated icons themselves
 * (tools/icon-gen/src/prompt.py: near-black void, single saturated accent, soft
 * radial glow behind the subject), so a screen that is half real art and half
 * fallback still reads as one set instead of looking broken.
 *
 * Pure and node-testable: no React, no DOM, no theme import.
 *
 * NAMED `glyphTileStyle`, NOT `glyphTile`: the component next door is
 * `GlyphTile.tsx`, and macOS's case-insensitive filesystem resolves an import
 * of "./GlyphTile" to a file called "glyphTile.ts" — the component's own
 * imports silently landed on this module instead, and every call site failed
 * with "has no exported member 'GlyphTile'". Do not rename it back.
 */

/** Twelve hues, evenly spaced and hand-nudged off the muddy yellow-greens. */
const HUES = [4, 18, 34, 48, 96, 140, 168, 190, 212, 254, 286, 322] as const;

/**
 * FNV-1a over the id. Chosen for the same reason the platform's placeholder
 * PNG uses it: tiny, dependency-free, and stable across runtimes — the tile a
 * player sees must not depend on which JS engine hashed the string.
 */
export function seedHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface GlyphTileColors {
  /** hue in degrees, 0-359 */
  readonly hue: number;
  /** CSS background (radial pool of the hue over near-black) */
  readonly background: string;
  /** CSS border colour */
  readonly border: string;
  /** glyph colour — light enough to hold contrast on the pool */
  readonly color: string;
}

/**
 * Deterministic colours for one entry. `accent` overrides the hashed hue when
 * the caller already has a meaningful colour (an ability slot, a team, a
 * rarity) — information beats decoration.
 */
export function glyphTileColors(seed: string, accentHue?: number): GlyphTileColors {
  const hue = accentHue ?? (HUES[seedHash(seed) % HUES.length] as number);
  return {
    hue,
    // 60%/40% off-centre highlight: the same upper-left key light the generated
    // icons are painted with, so the two sit together.
    background:
      `radial-gradient(115% 115% at 32% 26%, hsl(${hue} 42% 26%) 0%, ` +
      `hsl(${hue} 38% 15%) 46%, #0b0e16 100%)`,
    border: `hsl(${hue} 45% 42%)`,
    color: `hsl(${hue} 62% 82%)`,
  };
}

/**
 * The character to draw. CJK names read perfectly as one glyph; Latin names
 * are upper-cased so "swift boots" and "Swift Boots" render identically.
 *
 * `[...s]` iterates CODE POINTS — `s[0]` would split a surrogate pair and emit
 * half an emoji, which is exactly what a content tree full of author-supplied
 * names will eventually contain.
 */
export function glyphFor(label: string | null | undefined, fallback = "?"): string {
  const first = [...(label ?? "").trim()][0];
  if (!first) return fallback;
  return first.toUpperCase();
}
