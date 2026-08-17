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
  /**
   * 蓋滿父容器,而不是畫一個 `size` 見方的固定方塊 —— 與 `IconImg` 的 `fill`
   * 是**同一個契約**:父層必須已經是 `position:relative` + `overflow:hidden`,
   * tile 自己 `position:absolute; inset:0` 貼滿它。
   *
   * 它存在的理由(#338):商店裝備格是 `repeat(6,1fr)` 的**流動寬度**格子,
   * 而 `size` 是一個 px 常數。兩者對不上時圖示就只佔格子的一小塊 ——
   * owner 2026-08-17「圖示比例過小 沒有符合空格」看到的正是這個。
   * fill 之後「多大」由格子決定,`size` 在這個模式下不再代表寬度
   * (字級改由容器查詢算,見下面那個 `<span>`)。
   */
  fill?: boolean;
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
  fill = false,
  style,
}: GlyphTileProps): React.JSX.Element {
  const colors = glyphTileColors(seed, accentHue);
  const url = src !== undefined ? src : iconSrc(icon);
  const glyph = glyphFor(label);
  return (
    <div
      aria-hidden
      style={{
        position: fill ? "absolute" : "relative",
        // fill:幾何整個交給格子。⛔ 這一支模式下不可以留 width/height ——
        // 「格子是流動寬度、圖示是寫死的 px」正是 #338 那個缺陷本人。
        inset: fill ? 0 : undefined,
        width: fill ? undefined : size,
        height: fill ? undefined : size,
        flexShrink: 0,
        borderRadius: fill
          ? (radius ?? "inherit") // 沒指定就跟著格子的圓角,不必兩邊各寫一個數字
          : (radius ?? Math.max(4, Math.round(size * 0.18))),
        overflow: "hidden",
        background: colors.background,
        // fill 的呼叫端那一格通常自己就有一條 1px 邊框,再畫一條會疊成兩層線
        // (看起來像做壞了)。只有真的給了 accent —— 那是一個有意義的顏色 ——
        // 才畫自己的框。
        border: fill && !accent ? undefined : `1px solid ${accent ? `${accent}88` : colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: accent ?? colors.color,
        // fill 模式的字級改用容器查詢(下面那個 <span> 的 46cqw):`size` 已經
        // 不是寬度了,而多數道具沒有圖、會退回畫這個字 —— 照 px 算的字級在一格
        // 大格子裡會小到看不出來,那等於只修好了「有圖」的那一半。
        containerType: fill ? "inline-size" : undefined,
        fontSize: fill ? undefined : Math.round(size * 0.46),
        fontWeight: 800,
        lineHeight: 1,
        userSelect: "none",
        ...style,
      }}
    >
      {fill ? <span style={{ fontSize: "46cqw" }}>{glyph}</span> : glyph}
      <IconImg src={url} fill alt={label} />
    </div>
  );
}
