/**
 * 擴散 (damageArea) 的硬上界 —— 一份表，兩個消費端 (#210).
 *
 * ---------------------------------------------------------------------------
 * 這張表是幹嘛的
 * ---------------------------------------------------------------------------
 * `damageArea` 的三個旋鈕 (`radius` / `falloff` / `maxTargets`) 是**內容欄位**,
 * 出貨值寫在 `content/items/*.json` 裡, owner 在 後台「內容管理」改一件武器的
 * 擴散半徑不用重新 build —— 那才是第一守則要的可調。這張表只負責**上界**:
 * 一個 500 的半徑一定不是設計, 是有人把 WC3 的原始長度直接貼進來了
 * (WC3 的 300 ≈ GGD 的 5.5), 而 24 就已經是整個決鬥區的 `boundaryRadius`。
 *
 * 精神完全比照 `content/schema/effect.ts` 的 `zAuraDef.radius.max(40)` 與
 * `content/schema/common.ts` 的 `ITEM_MODIFIER_LIMITS`: **MIS-PARSE 護欄, 不是
 * 平衡政策**。CLAUDE.md 「欄位要有上界, 不是只有下界」講的就是這件事 ——
 * `validateField` 只檢查 `min` 的那段日子, 50 打成 500 會過後台, 然後在下游被
 * 靜默夾掉 (#277)。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 為什麼 sim 端也要夾一次 (schema 已經擋了)
 * ---------------------------------------------------------------------------
 * 因為 schema 不是唯一入口。後台的 overlay 寫入路徑到今天為止**沒有跑 Zod**
 * (#283 —— 而且那裡的註解宣稱有, 是假的), 所以一份 `radius: 500` 的 item 文件
 * 真的可以進到 registry。schema 擋的是「檔案進不來」, sim 夾的是「就算進來了,
 * 一發普攻也不會掃掉整個場地」。兩層都要。
 *
 * ---------------------------------------------------------------------------
 * 數字從哪來
 * ---------------------------------------------------------------------------
 * `MAX_RADIUS = 12` —— 決鬥區 `boundaryRadius` 是 24 (arena@1), 半徑 12 的圓
 *   已經蓋掉整個區域的一半直徑; 再大就不是「擴散」而是「全場」。同時它也大於
 *   任何一個 w3x 原生 cleave 的換算值 (Ocl1 的 200 wc3 ≈ 3.7 GGD)。
 * `MIN_FALLOFF = 0` / `MAX_FALLOFF = 1` —— `falloff` 是**邊緣倍率**, 1 = 不衰減
 *   (平均分配), 0 = 邊緣歸零。超過 1 會變成「越遠打越痛」, 那不是衰減。
 * `MAX_TARGETS = 20` —— 一場 3v3 加上小怪波上限 30 隻; 20 是「一發普攻不該
 *   清掉整波殭屍」的界線, 而不是任何一件現行武器碰得到的數字 (最大是 6)。
 *
 * 三個都是**硬上界**, 不是預設值。缺欄位時的預設寫在 `DEFAULT_*` 底下, 語意是
 * 「作者沒指定 → 最保守的那個」而不是「最大的那個」。
 */

/** 擴散半徑的硬上界 (GGD 單位)。見檔頭：MIS-PARSE 護欄, 不是平衡數字。 */
export const SPREAD_MAX_RADIUS = 12;

/** 邊緣倍率的下界/上界。1 = 不衰減, 0 = 邊緣歸零。 */
export const SPREAD_MIN_FALLOFF = 0;
export const SPREAD_MAX_FALLOFF = 1;

/** 一次擴散最多能濺到幾個人 (不含震央本人)。 */
export const SPREAD_MAX_TARGETS = 20;

/**
 * 作者沒寫 `falloff` 時的預設 —— **1, 也就是不衰減**。
 *
 * 選 1 而不是 0.5 的理由是可讀性: 沒寫衰減就不衰減, 是唯一不會讓「我沒設定的
 * 東西偷偷改了我的傷害」的預設。要衰減的武器 (月牙魔杖「距離越遠流星傷害越低」)
 * 自己寫。
 */
export const DEFAULT_SPREAD_FALLOFF = 1;

/** 作者沒寫 `maxTargets` 時的預設 —— 上界本身 (只受半徑限制)。 */
export const DEFAULT_SPREAD_MAX_TARGETS = SPREAD_MAX_TARGETS;

/** 夾一個半徑。負數/NaN → 0 (什麼都打不到), 超界 → `SPREAD_MAX_RADIUS`。 */
export function clampSpreadRadius(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return radius > SPREAD_MAX_RADIUS ? SPREAD_MAX_RADIUS : radius;
}

/** 夾一個邊緣倍率。缺/NaN → `DEFAULT_SPREAD_FALLOFF`。 */
export function clampSpreadFalloff(falloff: number | undefined): number {
  if (falloff === undefined || !Number.isFinite(falloff)) return DEFAULT_SPREAD_FALLOFF;
  if (falloff < SPREAD_MIN_FALLOFF) return SPREAD_MIN_FALLOFF;
  return falloff > SPREAD_MAX_FALLOFF ? SPREAD_MAX_FALLOFF : falloff;
}

/**
 * 夾一個目標上限。缺/NaN → `DEFAULT_SPREAD_MAX_TARGETS`; 0 或負 → 0 (不擴散,
 * 這是合法的「暫時關掉」寫法); 非整數無條件捨去。
 */
export function clampSpreadTargets(maxTargets: number | undefined): number {
  if (maxTargets === undefined || !Number.isFinite(maxTargets)) {
    return DEFAULT_SPREAD_MAX_TARGETS;
  }
  const n = Math.floor(maxTargets);
  if (n <= 0) return 0;
  return n > SPREAD_MAX_TARGETS ? SPREAD_MAX_TARGETS : n;
}
