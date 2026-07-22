/**
 * TierBadge — the ranked-tier crest (task #37). Renders a self-contained inline
 * SVG shield (no external art) tinted with the tier's LoL-like palette, plus the
 * EXACT Chinese label and — for the six non-apex tiers — the roman division.
 * Master/Grandmaster/Challenger are apex and show a star instead of a division.
 *
 * All tier→label/color/division logic lives in ./tier (pure, unit-tested); this
 * file is only the JSX shell. `tier` / `division` accept whatever the backend
 * sends (english key, Chinese label, or index; division as 1..4 or "I".."IV").
 */
import { normalizeDivision, divisionRoman, tierVisual } from "./tier";

export type TierBadgeSize = "sm" | "lg";

export interface TierBadgeProps {
  tier: unknown;
  division?: unknown;
  size?: TierBadgeSize;
  /** show the Chinese label beside the crest (default true) */
  showLabel?: boolean;
  style?: React.CSSProperties;
  title?: string;
}

const DIMS: Record<TierBadgeSize, { crest: number; label: number; roman: number; gap: number }> = {
  sm: { crest: 22, label: 12, roman: 10, gap: 5 },
  lg: { crest: 44, label: 17, roman: 13, gap: 9 },
};

/** The shield crest alone (used inline; label handled by the wrapper). */
function Crest(props: { tier: unknown; division?: unknown; px: number }): React.JSX.Element {
  const v = tierVisual(props.tier);
  const d = v.apex ? null : normalizeDivision(props.division);
  // stable-ish gradient id so multiple badges don't collide
  const gid = `tg-${v.key}-${d ?? "x"}`;
  const c = v.colors;
  const px = props.px;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 40 44"
      role="img"
      aria-label={v.english}
      style={{ display: "block", flexShrink: 0, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.from} />
          <stop offset="1" stopColor={c.to} />
        </linearGradient>
      </defs>
      {/* shield outline */}
      <path
        d="M20 1 L37 7 V22 C37 33 29 40 20 43 C11 40 3 33 3 22 V7 Z"
        fill={`url(#${gid})`}
        stroke={c.edge}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* inner bevel */}
      <path
        d="M20 6 L32 10 V22 C32 30 26 36 20 38 C14 36 8 30 8 22 V10 Z"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.4"
      />
      {v.apex ? (
        // apex: a star instead of a roman division
        <path
          d="M20 14 l2.9 6 6.6 .6 -5 4.3 1.5 6.4 -6-3.4 -6 3.4 1.5-6.4 -5-4.3 6.6-.6 Z"
          fill={c.text}
          stroke={c.edge}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ) : d ? (
        <text
          x="20"
          y="27"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          fill={c.text}
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {divisionRoman(d)}
        </text>
      ) : null}
    </svg>
  );
}

export function TierBadge({
  tier,
  division,
  size = "sm",
  showLabel = true,
  style,
  title,
}: TierBadgeProps): React.JSX.Element {
  const v = tierVisual(tier);
  const dims = DIMS[size];
  const d = v.apex ? null : normalizeDivision(division);
  const roman = d ? divisionRoman(d) : "";
  const label = title ?? (roman ? `${v.english} ${roman}` : v.english);
  return (
    <span
      title={label}
      style={{ display: "inline-flex", alignItems: "center", gap: dims.gap, lineHeight: 1, ...style }}
    >
      <Crest tier={tier} division={division} px={dims.crest} />
      {showLabel && (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: dims.label, fontWeight: 700, color: v.colors.text }}>{v.label}</span>
          {!v.apex && roman && (
            <span style={{ fontSize: dims.roman, fontWeight: 700, color: v.colors.text, opacity: 0.85 }}>{roman}</span>
          )}
        </span>
      )}
    </span>
  );
}
