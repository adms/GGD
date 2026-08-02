/**
 * victoryCrown — 金 / 銀 / 銅皇冠,**程序生成的 SVG**,零外部素材 (GH#257).
 *
 * owner 2026-08-02:
 * > 「並且標上 黃金 白銀 黃銅 的皇冠 圖案」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼是 SVG 而不是圖檔 / 不是 Blizzard 素材
 * ═══════════════════════════════════════════════════════════════════════════
 * 三個理由,順序就是重要性:
 *   1. **不准用 Blizzard 素材。** 這一版連暫時借用都不行(#81 的資產債就是這樣
 *      欠出來的),所以皇冠必須是我們自己畫的。
 *   2. **零載入。** 皇冠出現的那一刻,畫面上同時有三個 Babylon engine 在開,
 *      三張 glb 在載。再插三個 PNG request 進去,最可能的結果是皇冠比 3.6 秒的
 *      表演還晚到 —— 也就是玩家永遠看不到(失敗形態 ①/②)。行內 SVG 沒有 request。
 *   3. **三個階可以共用同一個形狀。** 金銀銅只差**顏色**,形狀完全一樣,所以
 *      「第二名的皇冠長得跟第一名不一樣」這種漂移在結構上不可能發生。
 *
 * ⚠️ 三個階的顏色**必須肉眼分得出來**,而且不能只靠亮度 —— 螢幕上那三頂冠是
 * 縮到 40 像素高、疊在一張灰底上的。所以三組色不是同一個黃的三個亮度:
 * 金偏暖黃、銀偏冷藍白、銅偏紅橘,色相就分開了。守衛在
 * `render/roundPodium.test.ts` 的「三個階的主色兩兩不同」那一條(實測突變:
 * 把銀與銅都改成金的 `#f2c637` → 紅;還原 → 綠)。
 * ⚠️ 這一句以前寫的是「見 victoryCrown.test.ts」,而那個檔案**不存在** ——
 * CLAUDE.md 第三守則:註解會說謊,寫的時候就要去確認那個檔真的在。
 */

/** 頒獎台的三個階。`null` = 第四名以後,沒有皇冠。 */
export type CrownMedal = "gold" | "silver" | "bronze";

/** `place`(1-based) → 皇冠階級;第四名以後沒有。 */
export function medalForPlace(place: number): CrownMedal | null {
  if (place === 1) return "gold";
  if (place === 2) return "silver";
  if (place === 3) return "bronze";
  return null;
}

export interface CrownPalette {
  /** 冠體主色 */
  body: string;
  /** 高光(冠尖與上緣) */
  light: string;
  /** 陰影(冠帶下緣),同時是描邊 */
  dark: string;
  /** 寶石 */
  gem: string;
  /** 中文階級名,給字幕與 aria-label 用 */
  label: string;
}

/**
 * 三階的顏色。**色相分開**,不是同一個黃的三個亮度(見檔頭)。
 * `Object.freeze` 是因為它會被三個 DOM 節點同時讀,任何一處寫回去都會靜默地
 * 改掉另外兩頂冠。
 */
export const CROWN_PALETTE: Readonly<Record<CrownMedal, CrownPalette>> = Object.freeze({
  gold: Object.freeze({
    body: "#f2c637",
    light: "#fff2a8",
    dark: "#8a6410",
    gem: "#ff5d5d",
    label: "黃金",
  }),
  silver: Object.freeze({
    body: "#cdd6e6",
    light: "#f6faff",
    dark: "#6d7789",
    gem: "#5ac8e8",
    label: "白銀",
  }),
  bronze: Object.freeze({
    body: "#c9803f",
    light: "#f0b57e",
    dark: "#6b3d17",
    gem: "#8ee06a",
    label: "黃銅",
  }),
});

/**
 * 一頂皇冠的 SVG 標記(可以直接塞進 `innerHTML`)。
 *
 * 形狀是五個尖角 + 一條冠帶,全部走同一條 `path`,所以三階唯一的差別是
 * `fill` / `stroke`。`viewBox` 固定 64×48,呼叫端用 CSS 決定實際大小。
 *
 * `aria-label` 直接寫在 `<svg>` 上:皇冠是這個畫面上唯一表達名次的東西,
 * 一頂沒有名字的圖形對讀螢幕的人等於沒有(#252 是同一個形狀的缺陷)。
 */
export function crownSvg(medal: CrownMedal, place: number): string {
  const p = CROWN_PALETTE[medal];
  // 五尖冠:左尖 → 谷 → 中尖 → 谷 → 右尖,再沿底收回。冠帶是下面那條 rect。
  const crown =
    "M4 40 L4 16 L16 27 L26 10 L32 27 L38 10 L48 27 L60 16 L60 40 Z";
  return [
    `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" role="img"`,
    ` aria-label="第 ${place} 名 · ${p.label}皇冠" focusable="false">`,
    `<path d="${crown}" fill="${p.body}" stroke="${p.dark}" stroke-width="2.5" stroke-linejoin="round"/>`,
    // 上緣高光 —— 讓冠尖在灰底上不會糊成一塊
    `<path d="M4 16 L16 27 L26 10 L32 27 L38 10 L48 27 L60 16"`,
    ` fill="none" stroke="${p.light}" stroke-width="2" stroke-linejoin="round"/>`,
    // 冠帶
    `<rect x="4" y="34" width="56" height="10" rx="2" fill="${p.dark}" opacity="0.55"/>`,
    // 三顆寶石
    `<circle cx="18" cy="39" r="3.2" fill="${p.gem}"/>`,
    `<circle cx="32" cy="39" r="3.8" fill="${p.gem}"/>`,
    `<circle cx="46" cy="39" r="3.2" fill="${p.gem}"/>`,
    `</svg>`,
  ].join("");
}
