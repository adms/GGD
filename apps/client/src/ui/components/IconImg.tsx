/**
 * IconImg — lazy <img> for w3x-imported doc icons (task #33). Renders NOTHING
 * (null) when the URL is absent or the image 404s, so every caller keeps its
 * existing pre-icon rendering: heroes/abilities/items without extracted art
 * (Blizzard stock icons) look exactly as before. Two usage shapes:
 *   - inline tile (default): fixed square, rounded, before a text label
 *   - fill overlay (`fill`): absolutely covers the parent tile; overlays that
 *     come AFTER it in the DOM (cooldown sweep, cast fill) stack on top.
 */
import { useState } from "react";

export interface IconImgProps {
  /** resolved URL (from ui/icons.ts helpers) or null → render nothing */
  src: string | null;
  /** square edge in px (inline mode; ignored when `fill`) */
  size?: number;
  /** cover the parent (which must be position:relative + overflow:hidden) */
  fill?: boolean;
  alt?: string;
  style?: React.CSSProperties;
}

export function IconImg({ src, size = 24, fill = false, alt = "", style }: IconImgProps): React.JSX.Element | null {
  // remember WHICH url failed, so swapping to a different icon retries
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null; // graceful fallback: caller's own rendering
  const base: React.CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : { width: size, height: size, borderRadius: 4, flexShrink: 0 };
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => setFailedSrc(src)}
      style={{ objectFit: "cover", display: "block", ...base, ...style }}
    />
  );
}
