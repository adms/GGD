/**
 * CodexIcon — one codex row's icon tile.
 *
 * Thin wrapper over the shared <GlyphTile>: the codex must render a row for
 * EVERY entry, including the ones whose art was a copyright-gated Blizzard
 * stock icon and the ones task #72 deliberately never generates, so the
 * fallback is not an edge case here — it is most of the page.
 *
 * The hue is seeded on the doc ID (stable per entry, distinct from its
 * neighbours) unless the caller passes a slot/bucket accent, in which case
 * that wins: a Q/W/E/R colour carries more information than a hash does.
 */
import { GlyphTile } from "../components/GlyphTile";

export interface CodexIconProps {
  /** content-relative path from the doc (`assets/icons/…`), or null */
  icon: string | null;
  /** fallback glyph source — first character is used */
  label: string;
  /** stable hue seed; falls back to the label when a caller has no id */
  seed?: string;
  size?: number;
  /** slot / bucket colour, when the caller has one (wins over the hash) */
  accent?: string;
}

export function CodexIcon({ icon, label, seed, size = 30, accent }: CodexIconProps): React.JSX.Element {
  return <GlyphTile seed={seed ?? label} icon={icon} label={label} size={size} accent={accent} radius={6} />;
}
