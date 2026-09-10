/**
 * ⭐ **靈基適性條件的詞彙表** —— 兩個封閉列舉 + 一個介面，**零 import**。
 *
 * ⛔ 這支刻意什麼都不 import。詞彙同時要被兩邊讀：
 *   · `content/schema/augment.ts`（Zod 的 `z.enum`，載入時擋錯字）
 *   · `sim/economy/augmentEligibility.ts`（真的跑推導）
 * 而後者要 import `SimWorld` 與整張登錄表。schema 直接 import 它就會拉出
 * `schema → sim/economy → sim/SimWorld → … → schema` 這一圈，而
 * `effectRegistry.ts` 的檔頭已經記錄過這種圈的代價：**它不是編譯錯誤**，
 * 是某個打包順序下一個執行期 `undefined`，也就是整張效果表在某一份 build 裡
 * 靜默消失。把詞彙抽成葉子是唯一不用讓任何一邊將就的解。
 *
 * 完整的設計推導（為什麼是封閉列舉而不是自由字串）住在
 * `sim/economy/augmentEligibility.ts` 的檔頭，⛔ 這裡不抄第二份。
 */

/** 一張願望可以要求／排除的機制。⛔ 每一個都必須在 `MECHANIC_PROBES` 有一條推導。 */
export const GRAIL_MECHANICS = [
  "evasion",
  "reflect",
  "burn",
  "shield",
  "flight",
  "abilityDamage",
] as const;
export type GrailMechanic = (typeof GRAIL_MECHANICS)[number];

/** 一張願望可以要求的模式特徵 —— 問的是「這一場有沒有」，不是「這位英雄有沒有」。 */
export const GRAIL_MODE_FEATURES = [
  "team",
  "mobs",
  "boss",
  "fireRing",
  "revive",
  "neutralObjects",
] as const;
export type GrailModeFeature = (typeof GRAIL_MODE_FEATURES)[number];

/** §16 顯現位置偏好。 */
export const AUGMENT_SELECTION_SLOTS = ["synergy", "generic", "pivot"] as const;
export type AugmentSelectionSlot = (typeof AUGMENT_SELECTION_SLOTS)[number];

/**
 * ⭐ **聖杯顯現的四個後台旋鈕**（第一守則：決策點要可調，不是寫死）。
 *
 * 四格都是**決策**不是數值 —— 每一格我在寫的時候都出現過「這裡要選 A 還是 B」，
 * 而那正是判準說要開欄位的訊號。三個住處：`content/config/arena-rules.json` ·
 * 這裡的 `DEFAULT_GRAIL_DRAFT` · `apps/admin` 的 `SHIPPED_*`。
 */
export interface GrailDraftRules {
  /** §15 靈基適性條件的總開關。關掉 = 每一張願望都進每一位英雄的卡池。 */
  eligibilityEnabled: boolean;
  /** §16「三張要有差異」的總開關。關掉 = 純照權重抽。 */
  slotDiversityEnabled: boolean;
  /** `prefersSelfMechanic` 命中時的權重倍率（1 = 這一格等於關掉）。 */
  preferenceBonus: number;
  /**
   * 舊的 31 張增益卡要不要一起進卡池。
   *
   * ⚠️ **預設 `exclude` 是照第〇·六守則的階梯選的，不是我的意見**：設計規則 §8
   * 「⛔ 禁止所有純屬性增益」是第 1 層（owner 的設計說明），而量到舊池 31 張裡
   * **16 張是純 `modifiers`**（其中「破限超頻」正好就是 §8 最後一條點名禁止的
   * 「攻速上限 4→10」，而它今天是 prismatic）。高層級贏 ⇒ 預設走新池。
   * ⛔ 舊的 31 份 JSON **一份都沒有刪** —— 這一格轉成 `include` 就整批回來。
   */
  legacyPool: "exclude" | "include";
}

/** 出貨值。⚠️ 改這裡要同時改 `content/config/arena-rules.json` 與 admin 的 `SHIPPED_*`。 */
export const DEFAULT_GRAIL_DRAFT: GrailDraftRules = {
  eligibilityEnabled: true,
  slotDiversityEnabled: true,
  preferenceBonus: 1.5,
  legacyPool: "exclude",
};

/**
 * 「這張卡是聖杯願望嗎」——**從內容自己身上讀**，⛔ 不是比對 id 前綴。
 *
 * 60 張新願望全部帶 `grail-wish`，舊的 31 張一張都沒有。用 tag 而不是 `id`
 * 開頭的理由是 owner 之後改 id 命名不會讓這條閘靜默失效。
 */
export const GRAIL_WISH_TAG = "grail-wish";

/**
 * 一張願望的適性條件。全部 optional，整格缺席 = 無條件。
 *
 * ⚠️ 語意刻意不一致，因為要問的問題本來就不同 ——
 * `requires*Mechanic` 是 **any-of**（「有迴避**或**反彈其中之一」），
 * `requiresAbilitySlots` / `requiresModeFeature` 是 **all-of**（「Q W E 都要在」）。
 * 每一格的 Zod `.describe()` 逐字寫了是哪一種，⛔ 不要靠欄位名猜。
 */
export interface GrailEligibility {
  /** any-of：這位英雄身上要有其中至少一個機制。 */
  requiresSelfMechanic?: readonly GrailMechanic[];
  /** any-of：**敵方**至少一位身上要有其中至少一個機制。 */
  requiresEnemyMechanic?: readonly GrailMechanic[];
  /** none-of：這位英雄身上一個都不能有。 */
  excludeSelfMechanic?: readonly GrailMechanic[];
  /** any-of，**軟的** —— 不擋，只把權重乘上 `preferenceBonus`。 */
  prefersSelfMechanic?: readonly GrailMechanic[];
  /** 這位英雄要用魔力（`maxMana > 0`）。 */
  requiresMana?: boolean;
  /** all-of：這幾格技能都要存在。 */
  requiresAbilitySlots?: readonly ("Q" | "W" | "E" | "R")[];
  /** any-of：這幾格裡至少一格。 */
  requiresAnyAbilitySlot?: readonly ("Q" | "W" | "E" | "R")[];
  /** all-of：這一場要有這些模式特徵。 */
  requiresModeFeature?: readonly GrailModeFeature[];
  /** 只發給這種攻擊型態的英雄。 */
  onlyAttackType?: "melee" | "ranged";
}
