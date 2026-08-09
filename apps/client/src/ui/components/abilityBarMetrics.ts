/**
 * abilityBarMetrics — 技能列（AbilityBar）的**尺寸模型**。
 *
 * owner 2026-08-10：「技能圖標跟對手角色的資訊包含**整體圖案框架與字體**可以依照
 * 使用者自行設定」。所以縮的不是字而已 —— 框、邊、內距、圓角、間距、字級**一起**縮，
 * 不然放大之後字會爆出框外（那正是 owner 特地把「圖案框架」寫進需求的原因）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼要有這一個檔（＝為什麼不是在 JSX 裡到處乘）
 * ─────────────────────────────────────────────────────────────────────────────
 * 技能列的尺寸有**兩個消費者**，而它們必須永遠一致：
 *
 *   ① `AbilityBar.tsx` —— 真的畫出來的那些 inline px；
 *   ② `hud/hudBottomCluster.ts` —— 這一列**保留**多大的矩形（`ABILITY_ROW_H` /
 *      `ABILITY_ROW_MAX_W`），底部欄的置中、讓開角落、以及「不能施放」提示的
 *      高度全部從它算。
 *
 * ⚠️ 只縮①不縮② = 放大之後技能列實際變寬，但保留框還是 364 → 它會撞進小地圖，
 * **而 `hudBottomCluster.test.ts` 是綠的**（保留矩形沒變，守衛看不到）——
 * CLAUDE.md 的失敗形態⑤「被測的不是出貨的那個」。
 * 所以②不是另外抄一份數字，而是**從這裡的同一組基準尺寸推導**
 * （{@link abilityRowHeight} / {@link abilityRowMaxWidth}）。
 *
 * ⛔ 這裡不做任何「× 倍率」的算術 —— 倍率、四捨五入、觸控下限全部住在
 * `ui/hudScale.ts` 那**一個算子**裡（第零守則⑨）。這個檔只負責把它綁定成
 * 「技能列的一組尺寸」。
 */
import { hudScale, hudScaleTappable, hudScaleTier, type HudScaleTier } from "../hudScale";

/**
 * 基準尺寸 = 今天寫死在 `AbilityBar.tsx` 裡的那幾個 px（＝「中」檔位）。
 *
 * ⚠️ 只有**同時被兩個消費者需要**的尺寸列在這裡。純畫面的字級/圓角之類仍然寫在
 * JSX 的呼叫點上（`m.s(18)`），因為那樣改一個字級只要改一處，而且 diff 讀得出來
 * 「這一格本來是 18」。
 */
export const ABILITY_BAR_BASE = {
  /** 技能圖示 tile 的邊長（可點擊 → 走觸控下限）。 */
  tile: 52,
  /** tile 之間的 flex gap。 */
  gap: 6,
  /** 容器左右內距。 */
  padX: 10,
  /** 容器上下內距。 */
  padY: 8,
  /** 容器外框寬（`theme.PANEL_BORDER` 是 1px）。 */
  border: 1,
  /**
   * tile 底下那一行（快捷鍵字 / 等級點點 / 說明）連同它的 `marginTop` 佔的高度。
   *
   * 18 不是憑空來的，是 2026-07-30 量到的整列高度 88 的**餘數**：
   * `88 − 8×2(padY) − 1×2(border) − 52(tile) = 18`。之所以用餘數而不是重新量，
   * 是為了讓「中」檔位算出來的 {@link abilityRowHeight} 逐位元等於今天出貨的
   * `ABILITY_ROW_H`（守衛 `abilityBarScale.test.ts` 釘住這一點）。
   */
  captionRowH: 18,
  /** 最寬的情況：天生技│Q│W│E│R│EX 六格（#192 的出貨順序）。 */
  maxTiles: 6,
} as const;

/** 一個檔位下，技能列的尺寸。 */
export interface AbilityBarMetrics {
  readonly tier: HudScaleTier;
  /** 一般尺寸：框、邊、內距、圓角、間距、字級。 */
  readonly s: (px: number) => number;
  /** 可點擊元素的邊長 —— 套用觸控下限（見 `hudScale.HudScalePolicy`）。 */
  readonly tap: (px: number) => number;
  readonly tile: number;
  readonly gap: number;
  readonly padX: number;
  readonly padY: number;
  readonly border: number;
  readonly captionRowH: number;
}

/**
 * 目前（或指定）檔位下的技能列尺寸。
 *
 * 省略 `tier` 就讀 runtime seam（`hudScaleTier()`）—— 元件不必自己拿設定。
 * 測試要固定檔位就傳第二個參數。
 */
export function abilityBarMetrics(tier: HudScaleTier = hudScaleTier()): AbilityBarMetrics {
  const s = (px: number): number => hudScale(px, tier);
  const tap = (px: number): number => hudScaleTappable(px, tier);
  return {
    tier,
    s,
    tap,
    // ⛔ tile 走 tappable：它是玩家真的會按的東西，10% 檔位下 5.2px 不是「小」，
    //    是「壞了」。下限是資料不是 if，住在 hudScale.HudScalePolicy。
    tile: tap(ABILITY_BAR_BASE.tile),
    gap: s(ABILITY_BAR_BASE.gap),
    padX: s(ABILITY_BAR_BASE.padX),
    padY: s(ABILITY_BAR_BASE.padY),
    border: s(ABILITY_BAR_BASE.border),
    captionRowH: s(ABILITY_BAR_BASE.captionRowH),
  };
}

/**
 * 這一列**保留**的高度。`hudBottomCluster` 用它，⛔ 不要另外抄一個 88。
 * 它不隨技能格數變（只有寬度會），所以底部欄的算術是精確的而不是近似的。
 */
export function abilityRowHeight(tier?: HudScaleTier): number {
  const m = abilityBarMetrics(tier);
  return m.padY * 2 + m.border * 2 + m.tile + m.captionRowH;
}

/** 這一列**保留**的最大寬度（六格）。 */
export function abilityRowMaxWidth(tier?: HudScaleTier): number {
  const m = abilityBarMetrics(tier);
  const n = ABILITY_BAR_BASE.maxTiles;
  return m.padX * 2 + m.border * 2 + n * m.tile + (n - 1) * m.gap;
}

/**
 * 把 `"1px solid rgba(…)"` 這種 shorthand 的**寬度**換成縮放後的值。
 * 顏色是主題的事，寬度才是縮放的事 —— 所以只動第一段。
 */
export function scaleBorderWidth(css: string, px: number): string {
  return css.replace(/^\s*[\d.]+px/, `${px}px`);
}
