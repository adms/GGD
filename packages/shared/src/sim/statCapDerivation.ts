/**
 * 屬性上限的**推導規則** —— 這個檔案是「那 7 條硬上限是怎麼算出來的」的唯一住處。
 *
 * ⛔ 它**不含任何一個算出來的數字**。數字住在 `statCapsDerived.ts`（產生的），
 * 由 `tools/stat-caps/gen_stat_caps.ts` 從這裡的規則 + 出貨內容量出來。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 2026-08-20 —— owner 抓到的那個迴圈，以及它真正的形狀
 * ---------------------------------------------------------------------------
 * owner 2026-08-20（逐字）：
 * > 「**3. use LV30/50/99 rules**, but I think you **echo and loop back the
 * >  formula**, so **HP going crazy 163萬**」
 *
 * 他是對的，但**回授的不是系統倍率**（量過了：`combat-env` 的 ×factor 在
 * `finalizeStat` 裡**只被乘一次**，`championStatBase` 一次都沒乘）。
 * 量出來的迴圈是**兩個**，兩個都真的在：
 *
 * ① **單位錯配** —— 柵欄在**基礎空間**被算出來（`championStatBase`，⛔ 不含
 *    `combat-env` 的 ×factor），卻在**最終空間**被執行（`finalizeStat` 的 clamp
 *    坐在 env 鏈**之後**）。誤差因子正好是那條鏈，逐條量到：
 *      maxHealth ×4.35 · maxMana ×1.52 · healthRegen ×1.00 · manaRegen ×8.88 ·
 *      ad ×0.60 · armor ×1.00 · mr ×0.20
 *    ⇒ 宣稱的「200×」在**這 7 條裡一條都不成立**：實際落在
 *      manaRegen **9.2×**（所以莉娜真的被夾到了）到 mr **1,585×** 之間。
 *
 * ② **等級因子被數了兩次** —— 那個 200 是這樣被驗證的（見 statCaps.ts 的 AP 註解）：
 *    「最強 AP 組合 8,937.8（**等級 99**、滿裝）÷ **L18** 卡面中位 47.2 = 189×」。
 *    ⇒ 200 裡面**已經含了 L18→L99 的成長**（量到 maxHealth 中位 1,848.8 → 8,149.2
 *      ＝ **4.41×**）。把中位數改成在 L99 量、再乘同一個 200，就是把那 4.41 再乘一次：
 *      375,960 × 4.34 = **1,629,840** ＝ owner 看到的 **163 萬**。
 *
 * ---------------------------------------------------------------------------
 * 修法：**一個空間、一次倍率、一個錨點**
 * ---------------------------------------------------------------------------
 * · 柵欄一律在**基礎空間**算（`championStatBase`，⛔ 不含任何 ×factor），
 *   引擎讀取時才乘 env 鏈，而且**只乘一次**（`sim/statCaps.ts::capCeiling`）。
 *   ⇒ owner 哪天把 `maxHealth` 4.0 改成 3.0，柵欄自己跟著走，⛔ 不會脫節。
 * · 錨點來自 `BALANCE_ANCHOR_LEVELS`，⛔ 不是一個打在原始碼裡的 18。
 * · 倍率仍然是 owner 的 200，而且它現在**只被乘一次**（在那一個錨點上）。
 *
 * ⚠️ **這張表混了兩個空間，而在 2026-08-20 之前沒有任何一行字說**。
 * `as` 4.0（每秒攻擊次數）、`ms` 18、`range` 16、`cdr` 0.99、`lifesteal` 0.8
 * 全部是 owner 直接給的**最終值**；下面這 7 條是推導出來的**基礎值**。
 * `capSpaceFor()` 把這件事變成一個程式回答得出來的問題，⛔ 不是一段散文。
 * ⛔ 這也是為什麼不能對整張表一律乘 env 鏈：`ms` 會被 `moveSpeedByAttackType`
 * （0.8 / 0.6）乘成 14.4 / 10.8，`range` 會被 `attackRange`（0.6）乘成 9.6 ——
 * 兩條 owner 明確給過的上限會被靜默改掉。
 */
import { HARD_ANCHOR_LEVEL, type BalanceAnchorLevel } from "../content/balanceAnchors";
import { Stat } from "./stats/statTypes";

/**
 * ⭐ owner 2026-08-12（逐字）：
 * > 「至於**硬上限 場中最終值（卡片 × 道具 × buff × 增幅）的天花板則是 200x**」
 *
 * ⛔ 它涵蓋的是**內容堆疊**（道具 × buff × 增幅），⚠️ **不含等級成長** ——
 * 等級成長由錨點提供。兩者都算進去就是上面的迴圈②。
 *
 * ⚠️ 這是 owner 給的數字，所以它有**一個**住處，就是這一行。
 */
export const STAT_CAP_MULTIPLE = 200;

/**
 * 那 7 條硬上限被算出來時用的等級。
 *
 * ⛔ **它不是一個字面值** —— 它是 owner 的 hard limit 錨點
 *（`content/balanceAnchors.ts`，LV 30/50/99 的第一個）。
 *
 * ⭐ 為什麼是 **30（hard limit）而不是 99（極限）**，兩個都是量出來的理由：
 * ① **50 / 99 塞不進既有的保險絲**。`STAT_CAP_MAX` 是「這一格能填多大」的
 *    防打錯保險絲，而在 L50 armor 推出 12,679 > 10,000、在 L99 maxHealth 推出
 *    1,629,840 > 1,000,000 —— ⛔ 為了塞進一個更大的柵欄去放寬一個防打錯保險絲，
 *    等於同時廢掉兩者。
 * ② **L30 已經夾不到任何合法內容**：柵欄（最終空間）比**裸裝 L99 最強的那一位**
 *    還高 **42×**（maxHealth 2,246,880 vs 52,631）到 **86×**（mr）。
 *    「取最寬鬆能容納合法內容的那一個」在 L30 就已經滿足，再往上買不到東西。
 */
export const STAT_CAP_ANCHOR_LEVEL: BalanceAnchorLevel = HARD_ANCHOR_LEVEL;

/**
 * ⭐ 哪幾條上限是**推導**出來的（`中位 × STAT_CAP_MULTIPLE`），因此
 * ⛔ 不可以手打、⛔ 而且是**基礎空間**的數字。
 *
 * 其餘 6 條（as / ap / lifesteal / cdr / range / ms）各自有 owner 的裁決，
 * 是**最終空間**的數字 —— 見 `statCaps.ts`。
 *
 * ⚠️ 這份清單同時回答兩個問題（所以它只需要存在一次）：
 * 「重算要動哪幾格」與「哪幾格要在讀取時乘 env 鏈」。
 */
export const DERIVED_CAP_STATS: readonly Stat[] = Object.freeze([
  Stat.MaxHealth,
  Stat.MaxMana,
  Stat.HealthRegen,
  Stat.ManaRegen,
  Stat.AttackDamage,
  Stat.Armor,
  Stat.MagicResist,
]);

const DERIVED_SET: ReadonlySet<Stat> = new Set(DERIVED_CAP_STATS);

/** 一格天花板寫的是哪個空間的數字。 */
export type CapSpace = "base" | "final";

/**
 * 這一條屬性的天花板是**基礎空間**（要在讀取時乘一次 env 鏈）還是**最終空間**
 *（owner 直接給的數字，⛔ 一個字都不要動）。
 */
export function capSpaceFor(stat: Stat): CapSpace {
  return DERIVED_SET.has(stat) ? "base" : "final";
}
