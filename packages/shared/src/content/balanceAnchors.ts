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
 * ⚠️ 這一組數字是**量到的**，⛔ 不是挑的
 *
 * 量法（2026-08-20，唯讀，全部走**出貨那條管線**，⛔ 沒有自己重算公式）：
 *
 *   `ContentLoader.load()` + `registerAll()`
 *     → `sim/stats/attributes.ts::championStatBase(def, stat, level, env, NO_ATTR_BONUS)`
 *     → `sim/baseBonus.ts::finalizeStat(...)`（env 鏈 → baseBonus → perLevelBonus → clamp）
 *     → `sim/combat/penetration.ts::mitigationMult(魔抗, ceiling)`
 *   有效血量 = `HP ÷ mitigationMult`，母體 = 註冊表裡的 **71 隻**英雄，**裸裝**
 *  （無道具、無三選一三圍、無增益卡）。
 *
 * ⭐ **自我驗證**：同一支腳本在 Lv18 重現了 v0.22.3 的每一個參考數字
 *（HP 8093、有效血量 9048、魔力池 1746、回魔 36.6/s、滿魔 47.7s）——
 * 所以下面這三個數字與那一組**是同一把尺**。
 *
 * ⚠️ 取的是**魔法**側的有效血量（與 v0.22.3 的 9048 同一欄）。物理側因為
 * `magicResistMult = 0.2` 而**更高**，而且差距隨等級擴大
 *（LV30 1.17× → LV50 1.29× → LV99 1.51×）—— 換欄會平移下面每一個推導。
 *
 * ⚠️ 有裝備／三選一／增益卡之後的真值**量不到**（那是玩家在那一場的選擇，
 * 不是出貨資料）。這三個數字的角色是**錨**，⛔ 不是一條上線後會被讀的規則。
 */

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
 * 量到的**中位有效血量**（魔法側，裸裝，71 隻）。見檔頭的量法。
 *
 * ⚠️ 重量之後要改的是**這一格**，⛔ 不是下游那些推導出來的數字 ——
 * 級距表、`DAMAGE_TIER_MAX`、後台說明、魔力稽核的門檻全部從這裡長出來。
 */
export const MEDIAN_EFFECTIVE_HP: Readonly<Record<BalanceAnchorLevel, number>> = Object.freeze({
  30: 13927,
  50: 22437,
  99: 47008,
});
