/**
 * MerchantHeadIcon — the 旅行商人's 頭圖 (task #146).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS DRAWN AND NOT A PNG
 * ---------------------------------------------------------------------------
 * The user asked for the merchant to have a head icon 「像英雄一樣」. `layout.ts`
 * reserved a champion-convention path for one —
 * `assets/icons/shop/traveling-merchant.png` — with a TO-GENERATE note, and it
 * was never generated: `content/assets/icons/shop/` does not exist, no file of
 * that name exists anywhere in the repo, and so the tip box has been rendering
 * GlyphTile's letter fallback (a 「旅」 tile) ever since. A reserved path that
 * 404s is not an icon; the feature has been shipped-but-absent.
 *
 * So the icon is DRAWN, in vector, right here. That is not a downgrade:
 *   · it can never 404, so the merchant has a face on a fresh clone, on the
 *     family host, and on a phone with a cold cache;
 *   · it costs zero bytes of asset budget (task #99) and zero requests;
 *   · it is crisp at 22 px in the shop header and at 46 px in the tip box,
 *     which a 128×128 raster is not;
 *   · it is composed from the SAME palette as the market it stands in
 *     (ACCENT #f2a13c, the warm dusk browns of LIGHT_RIG), so it reads as this
 *     merchant rather than as generic stock art.
 *
 * THE RASTER STILL WINS IF IT EVER ARRIVES. `MERCHANT_PORTRAIT` is layered
 * OVER the drawing as an <IconImg fill>, exactly the "img over fallback"
 * contract GlyphTile uses: IconImg renders null on an absent or 404 src, so
 * today the drawing shows, and the day the icon pipeline (task #72/#178) drops
 * a real bust at that path it simply covers it. Nothing here has to change, and
 * nothing has to know in advance which of the two exists.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DRAWN
 * ---------------------------------------------------------------------------
 * A hooded dusk-market trader matching `merchant.glb` (the Quaternius "Hooded
 * Adventurer" rig the scene actually loads, sword hidden — see
 * MERCHANT_HIDDEN_MESH_PREFIX): deep hood, shadowed face, warm beard, and one
 * gold coin held up at the shoulder — the single detail that says MERCHANT and
 * not ROGUE at a glance, which is the same distinction the 3D scene makes by
 * hiding the sword.
 */
import { IconImg } from "./IconImg";
import { iconSrc } from "../icons";
import { MERCHANT_PORTRAIT } from "../../render/intermission/layout";

export interface MerchantHeadIconProps {
  /** square edge in px */
  size?: number;
  /** corner rounding; defaults to the same ~18 % GlyphTile uses */
  radius?: number;
  /** rim + coin colour; defaults to the market's ACCENT amber */
  accent?: string;
  style?: React.CSSProperties;
}

/** The market's amber — the same value MerchantShop/MerchantTipBox use. */
const ACCENT = "#f2a13c";

export function MerchantHeadIcon({
  size = 32,
  radius,
  accent = ACCENT,
  style,
}: MerchantHeadIconProps): React.JSX.Element {
  const r = radius ?? Math.max(4, Math.round(size * 0.18));
  return (
    <div
      aria-hidden
      title="旅行商人"
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: r,
        overflow: "hidden",
        border: `1px solid ${accent}88`,
        ...style,
      }}
    >
      {/* viewBox is a fixed 48-unit square, so every size is the same drawing */}
      <svg viewBox="0 0 48 48" width="100%" height="100%" style={{ display: "block" }}>
        <defs>
          {/* dusk sky behind him: the intermission's own indigo→warm gradient */}
          <linearGradient id="ggd-mh-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a2340" />
            <stop offset="100%" stopColor="#4a3524" />
          </linearGradient>
          {/* the hood: lit from the upper left, like the scene's low warm sun */}
          <linearGradient id="ggd-mh-hood" x1="0.15" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#8a5f34" />
            <stop offset="55%" stopColor="#5f3f22" />
            <stop offset="100%" stopColor="#3a2717" />
          </linearGradient>
          {/* the hood's INTERIOR — darker than the face, which is what makes a
              hood read as a hood rather than as a hat */}
          <radialGradient id="ggd-mh-shade" cx="0.5" cy="0.42" r="0.6">
            <stop offset="0%" stopColor="#f0c89a" />
            <stop offset="72%" stopColor="#b9834f" />
            <stop offset="100%" stopColor="#5a3a20" />
          </radialGradient>
        </defs>

        <rect width="48" height="48" fill="url(#ggd-mh-bg)" />

        {/* shoulders / cloak — a wide base so the bust does not float */}
        <path d="M4 48 C6 37 14 32 24 32 C34 32 42 37 44 48 Z" fill="url(#ggd-mh-hood)" />
        {/* cloak seam, so the shoulders are not one flat shape */}
        <path d="M24 33 L24 48" stroke="#2e1f12" strokeWidth="1.1" opacity="0.65" />

        {/* the hood itself: a deep cowl over the head, peaked slightly forward */}
        <path
          d="M24 6 C33 6 39 13 39 22 C39 29 35 34 30 36 L18 36 C13 34 9 29 9 22 C9 13 15 6 24 6 Z"
          fill="url(#ggd-mh-hood)"
        />
        {/* face opening — the shaded oval inside the cowl */}
        <ellipse cx="24" cy="22.5" rx="9" ry="10.5" fill="url(#ggd-mh-shade)" />
        {/* the cowl's front rim casts over the brow: the shadow line that sells depth */}
        <path
          d="M24 6 C33 6 39 13 39 22 C39 24 38.6 25.8 38 27.4 C35.6 21 30.4 17 24 17 C17.6 17 12.4 21 10 27.4 C9.4 25.8 9 24 9 22 C9 13 15 6 24 6 Z"
          fill="#33220f"
          opacity="0.92"
        />

        {/* eyes — two warm points under the brow shadow */}
        <ellipse cx="20.4" cy="22.4" rx="1.5" ry="1.7" fill="#2a1a0d" />
        <ellipse cx="27.6" cy="22.4" rx="1.5" ry="1.7" fill="#2a1a0d" />
        <circle cx="20.8" cy="21.9" r="0.5" fill={accent} opacity="0.9" />
        <circle cx="28" cy="21.9" r="0.5" fill={accent} opacity="0.9" />

        {/* beard — a trader old enough to drive a hard bargain */}
        <path
          d="M16.5 25.5 C17.5 31.5 20 34.5 24 34.5 C28 34.5 30.5 31.5 31.5 25.5 C29 28 26.6 29 24 29 C21.4 29 19 28 16.5 25.5 Z"
          fill="#d8cbb6"
          opacity="0.92"
        />

        {/* THE COIN — the one detail that says MERCHANT, held up at the shoulder */}
        <circle cx="37.5" cy="38.5" r="5.2" fill={accent} />
        <circle cx="37.5" cy="38.5" r="5.2" fill="none" stroke="#7a4a12" strokeWidth="0.9" />
        <circle cx="37.5" cy="38.5" r="2.6" fill="none" stroke="#7a4a12" strokeWidth="0.9" />
        {/* specular glint, upper-left, matching the hood's light direction */}
        <circle cx="35.8" cy="36.8" r="1.1" fill="#ffe9bf" opacity="0.85" />
      </svg>
      {/*
        The generated raster, if it ever lands at MERCHANT_PORTRAIT, covers the
        drawing. IconImg renders null while the file is absent or 404s, so this
        line is inert today and needs no flag.
      */}
      <IconImg src={iconSrc(MERCHANT_PORTRAIT)} fill alt="旅行商人" />
    </div>
  );
}
