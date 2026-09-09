/**
 * 範圍傷害的語意界線與出貨預設 —— damageArea / damageLine 共用 (#210).
 *
 * ---------------------------------------------------------------------------
 * 這張表是幹嘛的
 * ---------------------------------------------------------------------------
 * `damageArea` 的三個旋鈕 (`radius` / `falloff` / `maxTargets`) 是**內容欄位**,
 * 出貨值寫在 `content/items/*.json` 裡, owner 在 後台「內容管理」改一件武器的
 * 擴散半徑不用重新 build。半徑與衰減的靜態上界負責擋錯誤輸入：
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
 * `MAX_RADIUS = 24` —— 決鬥區的 `boundaryRadius` (arena@1)，也就是「整個決鬥區」。
 *
 *   ⭐ 2026-08-09（GH#299 第 1 條）從 12 抬到 24，理由是這條界**咬到了真實內容**：
 *   90 支重製技能裡有要 14 與 12.83 的（都是**已經換算過**的 GGD 值），而它們被
 *   一條寫著「MIS-PARSE 護欄, 不是平衡政策」的界擋在門外 —— 那就是護欄裝在
 *   錯的位置。真正該擋的是**沒換算的 WC3 原始值**（200/300/450/500），而 24
 *   照樣擋得住每一個：WC3 的 300 ≈ GGD 的 5.5，所以任何一個貼進來的原始值都是
 *   兩位數以上的倍數。⛔ 上界不是平衡旋鈕 —— 半徑要多大是 `content/` 的事。
 *
 *   ⚠️ 為什麼不是「無上界」：24 是**整個決鬥區**，超過它的圓沒有第二種意思
 *   （已經蓋滿全場），所以它同時是語意邊界，不只是保險絲。
 * `MIN_FALLOFF = 0` / `MAX_FALLOFF = 1` —— `falloff` 是**邊緣倍率**, 1 = 不衰減
 *   (平均分配), 0 = 邊緣歸零。超過 1 會變成「越遠打越痛」, 那不是衰減。
 * `SPREAD_MAX_TARGETS = 20` —— 保留既有匯出名稱，現在只作為出貨政策的預設。
 *   原理由「一發普攻不該清掉整波殭屍」是可調政策，不是 immutable 結構限制。
 *   實際上限住 config.damage-rules@1.spreadMaxTargetsCap：缺欄用它，明填也受它限制。
 *
 * 人數的靜態 schema 只守正 safe integer；Number.MAX_SAFE_INTEGER 是整數表示界線，
 * 不是平衡政策或一般誤植保證。出貨的實際政策上限仍是 20，後台可調。
 */

/** 擴散半徑的硬上界 (GGD 單位)。見檔頭：MIS-PARSE 護欄, 不是平衡數字。 */
export const SPREAD_MAX_RADIUS = 24;

/** 邊緣倍率的下界/上界。1 = 不衰減, 0 = 邊緣歸零。 */
export const SPREAD_MIN_FALLOFF = 0;
export const SPREAD_MAX_FALLOFF = 1;

/** 人數政策的出貨預設；實際上限讀 world.damageRules.spreadMaxTargetsCap。 */
export const SPREAD_MAX_TARGETS = 20;

/**
 * 作者沒寫 `falloff` 時的預設 —— **1, 也就是不衰減**。
 *
 * 選 1 而不是 0.5 的理由是可讀性: 沒寫衰減就不衰減, 是唯一不會讓「我沒設定的
 * 東西偷偷改了我的傷害」的預設。要衰減的武器 (月牙魔杖「距離越遠流星傷害越低」)
 * 自己寫。
 */
export const DEFAULT_SPREAD_FALLOFF = 1;

/** 缺少有效全域設定時的預設；作者省略 maxTargets 時使用當場的全域上限。 */
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
 * 夾一個目標上限。缺/NaN → 當場的全域上限；0 或負 → 0 (不擴散,
 * 這是合法的「暫時關掉」寫法); 非整數無條件捨去。
 */
export function clampSpreadTargets(maxTargets: number | undefined, operatorCap: number): number {
  const cap = Number.isSafeInteger(operatorCap) && operatorCap >= 1
    ? operatorCap : DEFAULT_SPREAD_MAX_TARGETS;
  if (maxTargets === undefined || !Number.isFinite(maxTargets)) {
    return cap;
  }
  const n = Math.floor(maxTargets);
  if (n <= 0) return 0;
  return n > cap ? cap : n;
}
