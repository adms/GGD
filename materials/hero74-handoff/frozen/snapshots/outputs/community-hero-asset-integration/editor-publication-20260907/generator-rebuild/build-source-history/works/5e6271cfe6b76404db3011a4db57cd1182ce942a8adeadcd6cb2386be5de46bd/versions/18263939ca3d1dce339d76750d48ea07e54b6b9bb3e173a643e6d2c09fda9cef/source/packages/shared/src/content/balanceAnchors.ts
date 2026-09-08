/**
 * 三個**平衡錨點**（owner 2026-08-20）—— 級距表與魔力稽核共用的那把尺。
 *
 * owner 2026-08-20（逐字，對 #447 的更正）：
 * > 「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，
 * >  能 **50 比較好(soft limit)**, **99 是極限**」
 *
 * ⭐ 為什麼它獨立成一個檔而不是抄在兩處：#447（傷害級距）與 #446（魔力例外清單）
 * 用的是**同一組**等級與**同一份**量測。抄兩份 = 第零守則⑨的反面標記
 *（「到處改改改」），而且下一次重量的時候一定會有一半沒跟上。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-20：**魔抗那一層整層退場**，而且量測搬進了產生器
 *
 * owner 2026-08-20（逐字）：
 * > 「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」
 *
 * 在此之前這裡住著**一個**手寫的 `MEDIAN_EFFECTIVE_HP`，而它把三層混在一起
 *（成長曲線 × 系統倍率 × 魔抗減傷）。代價是量到的：`3,442` 被當成「基礎空間」
 * 回乘之後差 **+16.5%**，因為它其實是**混合量** —— 而整條級距推導鏈都用它。
 *
 * ⇒ 現在是**兩個乾淨的空間**，而且都由 `pnpm anchors:build` 量出來寫進
 * `balanceAnchorsDerived.ts`（⛔ 不是手寫的常數）：
 *
 *   | 空間 | 是什麼 | 誰在用 |
 *   |---|---|---|
 *   | **純基礎** `MEDIAN_BASE_HP` | 英雄卡的成長曲線本身 | ⭐ owner 判斷用 |
 *   | **引擎最終** `medianFinalHp()` | 純基礎 × env 鏈 ＋ 初始加成 | 引擎真的在打的血條 |
 *
 * ⚠️ **初始加成不參與倍率**（owner #273）⇒ `base × mult + bonus`，
 * ⛔ **不是** `(base + bonus) × mult`。這一行就是上面那個 +16.5% 的來源。
 *
 * ⚠️ 有裝備／三選一／增益卡之後的真值**量不到**（那是玩家在那一場的選擇，
 * 不是出貨資料）。這幾個數字的角色是**錨**，⛔ 不是一條上線後會被讀的規則。
 */
import {
  HP_BASE_BONUS,
  HP_ENV_MULT,
  MANA_BASE_BONUS,
  MANA_ENV_MULT,
  MEDIAN_BASE_HP,
  MEDIAN_BASE_MANA,
} from "./balanceAnchorsDerived";

/** 三個錨點的等級。⭐ owner 給的，⛔ 不是我挑的。 */
export const BALANCE_ANCHOR_LEVELS = [30, 50, 99] as const;
export type BalanceAnchorLevel = (typeof BALANCE_ANCHOR_LEVELS)[number];

/** **一定要滿足**的那一個。 */
export const HARD_ANCHOR_LEVEL: BalanceAnchorLevel = 30;
/** **能滿足比較好**的那一個。 */
export const SOFT_ANCHOR_LEVEL: BalanceAnchorLevel = 50;
/** **不要求滿足**，但要算出來讓 owner 看到差多少。 */
export const LIMIT_ANCHOR_LEVEL: BalanceAnchorLevel = 99;

/** 三個錨點各自的身分 —— 報告與 config note 的標籤從這裡來，⛔ 不各自手寫。 */
export const ANCHOR_ROLE: Readonly<Record<BalanceAnchorLevel, string>> = Object.freeze({
  30: "hard limit（一定要滿足）",
  50: "soft limit（能滿足比較好）",
  99: "極限（不要求）",
});

/**
 * ⭐ 兩個空間的中位數 —— **量到的**，住在 `balanceAnchorsDerived.ts`
 *（`pnpm anchors:build` 寫，`anchors:check` 逐位元組守）。
 *
 * ⚠️ 重量之後不用改任何一行程式：級距表、`DAMAGE_TIER_MAX`、後台說明、
 * 魔力稽核的門檻全部從這兩支函式長出來。
 */
export { MEDIAN_BASE_HP, MEDIAN_BASE_MANA, HP_ENV_MULT, HP_BASE_BONUS };

/**
 * **純基礎**空間的中位血量 —— ⛔ 無系統倍率、⛔ 無初始加成、⛔ 無魔抗。
 * ⭐ owner 判斷用的就是這一欄（2026-08-20：「不要計算⋯會讓我誤判」）。
 */
export function medianBaseHp(level: BalanceAnchorLevel): number {
  return MEDIAN_BASE_HP[level] ?? 0;
}

/** 同上，魔力那一條。 */
export function medianBaseMana(level: BalanceAnchorLevel): number {
  return MEDIAN_BASE_MANA[level] ?? 0;
}

/**
 * **引擎最終**空間的中位血量 —— 引擎真的在打的那條血條。
 *
 * ⚠️ 初始加成**在倍率之外**（owner #273「初始HP⋯不參與倍率計算」）：
 * `base × mult + bonus`，⛔ 不是 `(base + bonus) × mult`。
 * ⛔ 魔抗減傷**不在裡面** —— 它只對魔法傷害成立（owner 2026-08-20）。
 */
export function medianFinalHp(level: BalanceAnchorLevel): number {
  return (MEDIAN_BASE_HP[level] ?? 0) * HP_ENV_MULT + HP_BASE_BONUS;
}

/** 同上，魔力池那一條 —— 耗魔級距的唯一輸入。 */
export function medianFinalMana(level: BalanceAnchorLevel): number {
  return (MEDIAN_BASE_MANA[level] ?? 0) * MANA_ENV_MULT + MANA_BASE_BONUS;
}
