/**
 * ⭐⭐ GH#890 —— `grantXp` 的 sim 端型別。
 *
 * owner 2026-09-01（逐字）：
 * > 「把這兩招都改成**額外獲得**而非奪取就好，**原木則改為經驗值**」
 *
 * ⚠️ ⭐ `economy/progression.ts::grantXp()` **早就存在** ——
 * ⛔ 這一族缺的只是一個把它接出來的 effect kind（第〇·五守則）。
 */
export interface GrantXpVariant {
  kind: "grantXp";
  /**
   * 固定經驗值。
   * ⚠️ 上界 50,000 是**誤打守衛**（⛔ 不是平衡）：一次 500,000 會直接把一個
   * 角色從 1 級推到滿級，⭐ 那是打錯字的樣子。
   */
  flat: number;
  /**
   * 誰收：施法者（預設）或每一個解析出來的目標。
   * ⚠️ ⭐ **沒有 `"steal"`** —— owner 逐字要的是「額外獲得而非奪取」。
   */
  to?: "self" | "target";
}
