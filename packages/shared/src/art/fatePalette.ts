/**
 * fatePalette —— GGD 的 **FATE 三色調 token**（GH#453）。⭐ 這是唯一的住處。
 *
 * owner 2026-08-19：
 *   「我們**擴充地圖物件跟生成圖片、貼圖也盡量 FATE 相關風格**」
 *
 * ── 為什麼是**一份** token，不是每支產生器各寫一組 hex ────────────────────
 * 這個 repo 一共有五支東西會憑空生出畫面上的顏色（`gen-ground` 的地面 PBR、
 * `gen-decals` 的地面痕跡、`feedbackPresets` 的痕跡顏色、`scenery-gen` 的擺設
 * 調色盤、`icon-gen` 的提示詞）。同一組 hex 抄五份 = 第零守則⑨ 說的「N 個同型
 * 項目」，而它腐爛的方式是**沒有任何東西會紅**：owner 哪天把金色調暖一點，
 * 五份裡改到三份，畫面上只是「有些東西看起來不太合」。
 *
 * ── ⭐ 已經量到的關鍵事實：FATE 的視覺語言有一半撐不過小尺寸 ───────────────
 * 解法**不是**折衷，是分清楚哪一半撐得過（這張表是 `tools/icon-gen/src/prompt.py`
 * 那一輪量出來的，這裡照抄同一組結論，⛔ 不重新推導）：
 *
 * | ✅ 撐得過                         | ⛔ 撐不過              |
 * |---|---|
 * | 三色調：金 × 靛藍 × 緋紅（＋鋼灰、暗底） | 鎏金蕾絲 / 巴洛克捲飾 |
 * | 魔力光點（藍白微塵）                | 細碎裝飾線 / 符文     |
 * | 暖金主光（左上 45°）＋ 冷藍邊光（右下） | 彩繪玻璃分割          |
 *
 * ⇒ 這個模組只提供**撐得過**的那一半：五個色相、一組打光角度，以及一支
 * **保持亮度**的分離調色（split-tone）。⛔ 這裡不提供任何「畫一條裝飾線」的東西。
 *
 * ── ⭐ `fateSplitTone()` 為什麼保持亮度 ────────────────────────────────────
 * owner 同一則說的是「**擴充的**東西要 FATE」，⛔ 不是把整個場地重新上色。
 * 地面貼圖的**手感**（對比、起伏、AO、粗糙度）全部住在亮度裡；色相不住在那。
 * 所以每一個色相向量都先被除以自己的亮度 → 乘上去只轉色相、⛔ 不動亮度，
 * 於是既有的地面「摸起來」一模一樣，只是光的顏色變了。
 * 這也是為什麼強度可以逐一 style 給：`obsidian`（本來就是黑底描金）吃得下很多，
 * `grass`（草是綠的）只能吃一點點。
 */

/** 線性光的 RGB 三元組（⛔ 不是 0..255，也⛔ 不是 sRGB）。 */
export type Rgb = readonly [number, number, number];

/**
 * ⭐ **五個色相，就是全部。** 每一個都是 sRGB hex（設計稿的語言）。
 *
 * ⚠️ 改這裡的任何一格，**下游的產物就過期了** —— 至少要重跑
 * `pnpm tsx apps/client/scripts/gen-ground.ts` 與
 * `pnpm tsx apps/client/scripts/gen-decals.ts`。
 */
export const FATE_HEX = {
  /** 金 —— 主光、寶具、英靈的貴金屬。畫面上最亮的那一個。 */
  gold: "#C9A227",
  /** 靛藍 —— 陰影、夜、魔力的底色。⭐ 陰影不是灰的，是藍的 */
  indigo: "#2A2E5A",
  /** 緋紅 —— 令咒、血、焦痕。整張畫面**只有一個**飽和重音，就是它 */
  crimson: "#8E1B2E",
  /** 鋼灰 —— 甲冑、劍身、石。撐住中間調，免得整張只有三個顏色 */
  steel: "#7C8595",
  /** 暗底 —— 近黑的虛空。圖示背景與最深的縫隙 */
  void: "#0B0E16",
} as const;

export type FateHue = keyof typeof FATE_HEX;

/**
 * 主光：**左上 45°**、暖金。邊光：右下、冷藍。
 * ⚠️ 這兩個角度是**固定的**（`icon-gen` 的提示詞把它寫死在 PREFIX 裡）——
 * 生成的圖示、生成的貼圖與場上的燈光講同一句話，畫面才會像同一個世界。
 */
export const FATE_KEY_LIGHT_DEG = 45;
/** 邊光在主光的正對面（＝ 45 + 180）。⛔ 不要各自填一個數字。 */
export const FATE_RIM_LIGHT_DEG = FATE_KEY_LIGHT_DEG + 180;

/** sRGB 0..1 → 線性光。IEC 61966-2-1 的那一條，⛔ 不是 `x**2.2` 的近似。 */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 線性光 → sRGB 0..1。`toSrgb()`（texgen/noise）的同一條曲線。 */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** `#RRGGBB` → sRGB 0..1。 */
export function hexToSrgb01(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ] as const;
}

/** `#RRGGBB` → **線性光**。貼圖產生器一律在線性光裡調色。 */
export function hexToLinear(hex: string): Rgb {
  const [r, g, b] = hexToSrgb01(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)] as const;
}

/** Rec.709 亮度（線性光）。 */
export function luma(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * 一個色相的**單位亮度向量** —— 線性光除以自己的亮度，所以 `luma() === 1`。
 * ⭐ 這就是「只轉色相、不動亮度」的機制：乘上去之後亮度不變。
 */
export function fateHueVector(hue: FateHue): Rgb {
  const c = hexToLinear(FATE_HEX[hue]);
  const l = luma(c);
  return [c[0] / l, c[1] / l, c[2] / l] as const;
}

/**
 * 一個色相**對灰的偏離**，歸一化成「最大偏離 = 1」。
 *
 * ⚠️ 這一步是必要的，⛔ 不是潔癖 —— 直接用 `fateHueVector()` 做分離調色會壞掉，
 * 而且壞得很安靜：靛藍是**又暗又藍**的顏色，除以自己那個很小的亮度之後藍通道
 * 是 **3.13**，而金的藍通道只有 **0.053**（＝偏離 −0.95）。兩邊放在同一條加權
 * 和裡，靛藍的力氣是金的 **2.3 倍**，於是「暖金 × 冷靛的分離」實際跑出來是
 * **整張變藍**：量到的第二版位移（512² 的最亮 20%）是 `stone` 亮部 `B +4.0`、
 * `obsidian` 亮部 `B +3.0` —— 亮部本來應該往金走，卻也在往藍走。
 *
 * 歸一化之後 `strength` 對暖／冷兩端是**同一把尺**，⇒ 亮部真的會往金走。
 */
function fateHueDeviation(hue: FateHue): Rgb {
  const v = fateHueVector(hue);
  const dev: [number, number, number] = [v[0] - 1, v[1] - 1, v[2] - 1];
  const m = Math.max(Math.abs(dev[0]), Math.abs(dev[1]), Math.abs(dev[2]));
  if (m <= 0) return [0, 0, 0] as const;
  return [dev[0] / m, dev[1] / m, dev[2] / m] as const;
}

/**
 * 一種痕跡／墨水的顏色：色相取自 token，`level` 是**最強那一個通道**的線性值。
 *
 * ⭐ 給 `emissiveColor` 那一類「顏色就是這個常數」的地方用
 * （`GroundDecalPool` 的材質是 `disableLighting` + `diffuseColor = 0`，
 * 所以貼圖的 RGB 一位元都不會被看到，顏色**只**來自這裡 —— 見
 * `apps/client/src/vfx/GroundDecalPool.ts:88-94` 的 `make()`）。
 *
 * ⚠️ **用峰值通道歸一化，⛔ 不是用亮度** —— 這是算過的：緋紅 `#8E1B2E` 的線性
 * 亮度只有 **0.067**，拿它當除數再乘回舊焦痕的亮度 0.127，紅通道會變成
 * **0.51** —— 一張本來是深褐色的地面焦痕會變成鮮紅的發光圓片。
 * 峰值歸一化讓 `level` 讀起來就是「這個痕跡有多深」，換色相不會換亮度。
 */
export function fateInk(hue: FateHue, level: number): Rgb {
  const c = hexToLinear(FATE_HEX[hue]);
  const peak = Math.max(c[0], c[1], c[2]);
  const k = peak > 0 ? Math.max(0, level) / peak : 0;
  return [c[0] * k, c[1] * k, c[2] * k] as const;
}

/**
 * ⭐ **分離調色**：暗部推向靛藍、亮部推向金，**亮度一位元不動**。
 *
 * @param c        線性光的來源顏色
 * @param strength 0 = 原樣（⛔ 逐位元組相同），1 = 整張換成金／靛藍的光
 * @param lo,hi    這一批畫面**自己的**亮度區間（sRGB 0..1）。⭐ 見下面那兩段
 *
 * 權重用**感知**亮度（sRGB 編碼後的 t）分暗亮兩端，⛔ 不是線性亮度 ——
 * 地面貼圖的線性亮度多半落在 0.01…0.3，用線性值分會讓幾乎整張都被判成「暗部」。
 *
 * ── ⚠️ `lo`/`hi` 為什麼是必要的（兩次都是量到的，⛔ 不是設計潔癖）───────────
 * ① 第一版把 0…1 當成亮度範圍，結果七張地面**全部只有藍色上升**、金色一格都沒
 *    出現（量到的平均 sRGB 位移：stone `+11.0B`／obsidian `+14.8B`，R、G 都是
 *    −2…0）。原因很直白：地面貼圖是暗的，`stone` 的平均 sRGB 亮度只有 0.33，
 *    於是每一顆 texel 都被判成「暗部」，暖金那一半**在型別上不可能發生**。
 * ② 第二版改成用平均值當中點，方向對了但**幅度小到看不見**（最亮 20% 的位移只有
 *    1–3 個 byte）：`stone` 的 sRGB 亮度全部擠在 0.25…0.40 這 15% 的窄帶裡，
 *    權重曲線的 0…1 只被用到中間那一小段。
 *
 * ⇒ 傳這一批自己的**區間**（`lo`/`hi`，實務上取 5%/95% 分位數），權重曲線才會
 *   被完整地用滿：這張圖自己最暗的地方 = 全靛藍，自己最亮的地方 = 全金。
 */
export function fateSplitTone(c: Rgb, strength: number, lo = 0, hi = 1): Rgb {
  const s = Math.max(0, Math.min(1, strength));
  if (s === 0) return c;
  const raw = Math.max(0, Math.min(1, linearToSrgb(Math.max(0, luma(c)))));
  const span = Math.max(1e-4, hi - lo);
  const t = Math.max(0, Math.min(1, (raw - lo) / span));
  // ^1.6：中間調幾乎不動，只有真的暗／真的亮的地方才被染色。指數 1 會把整張
  // 平均地染成一個顏色，那就變成「重新上色」了（owner 明說不要）。
  const shadow = (1 - t) ** 1.6;
  const high = t ** 1.6;
  const gold = fateHueDeviation("gold");
  const indigo = fateHueDeviation("indigo");
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const mix = 1 + s * (high * gold[i]! + shadow * indigo[i]!);
    out[i] = Math.max(0, c[i]! * mix);
  }
  // ⭐ 逐色相的乘法對**灰**才剛好保持亮度（因為色相向量的亮度是 1）；有彩度的
  // 來源會漂一點。這裡明白地把亮度**除回去** —— 註解說「不動亮度」就要真的不動
  // （第三守則：宣稱要去驗證）。守衛 `fatePalette.test.ts` 讀的就是這一條。
  const before = luma(c);
  const after = luma(out as unknown as Rgb);
  if (before > 0 && after > 0) {
    const k = before / after;
    out[0] *= k;
    out[1] *= k;
    out[2] *= k;
  }
  return out as unknown as Rgb;
}
