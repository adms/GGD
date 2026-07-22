/**
 * GlyphTile — ONE tile that renders an entry's icon when it has one and a
 * deterministic procedural glyph when it does not.
 *
 * This replaces four separately-grown copies of "if (url) <IconImg/> else a
 * grey letter box" (codex, leaderboard, settlement, shop) with a single
 * component, and gives the shop a fallback it never had. See glyphTile.ts for
 * why the tile is derived from the id rather than being one flat colour.
 *
 * The <img> is layered OVER the glyph rather than swapped for it, exactly as
 * <IconImg fill> was already used in the codex and the ability bar: IconImg
 * renders null on an absent or 404 src, so the glyph beneath simply stays
 * visible. Nothing has to know in advance whether the file exists.
 */
import { IconImg } from "./IconImg";
import { iconSrc } from "../icons";
import { glyphFor, glyphTileColors } from "./glyphTileStyle";

export interface GlyphTileProps {
  /**
   * Stable identity for the hue — the doc id. NOT the name: names get edited
   * and translated, and the tile must not change colour when they do.
   */
  seed: string;
  /** content-relative icon path from the doc (`assets/icons/…`), or null */
  icon?: string | null;
  /** already-resolved URL, when the caller has one (championIconUrl etc.) */
  src?: string | null;
  /** glyph source — the first code point is drawn */
  label: string;
  size?: number;
  /** override the hashed hue when the caller has a meaningful one */
  accentHue?: number;
  /**
   * A CSS colour that overrides the rim and glyph (an ability slot colour, a
   * rarity, a team). The hashed BACKGROUND pool is kept underneath, so an
   * accent still leaves neighbouring tiles distinguishable from each other —
   * which is the whole point of seeding the tile in the first place.
   */
  accent?: string;
  /** square vs slightly-rounded; matches whatever the surrounding rows use */
  radius?: number;
  style?: React.CSSProperties;
}

export function GlyphTile({
  seed,
  icon,
  src,
  label,
  size = 30,
  accentHue,
  accent,
  radius,
  style,
}: GlyphTileProps): React.JSX.Element {
  const colors = glyphTileColors(seed, accentHue);
  const url = src !== undefined ? src : iconSrc(icon);
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius ?? Math.max(4, Math.round(size * 0.18)),
        overflow: "hidden",
        background: colors.background,
        border: `1px solid ${accent ? `${accent}88` : colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: accent ?? colors.color,
        fontSize: Math.round(size * 0.46),
        fontWeight: 800,
        lineHeight: 1,
        userSelect: "none",
        ...style,
      }}
    >
      {glyphFor(label)}
      <IconImg src={url} fill alt={label} />
    </div>
  );
}
