/**
 * ⭐⭐ `config.one-shot-clamp@1` —— **一擊必殺的夾限**（GH#928）。
 *
 * owner 2026-09-02（逐字）：
 * > 「我們來檢討傷害排行榜上的技能傷害」（他貼了線上榜單前 100）
 *
 * ⛔⛔ 量到的（榜單前 100，⛔ 不是估計）：**12 列**打掉單一英雄超過
 * **100% 最大生命**，最高 **401%**（48-04 騎英之疆繩）· 301%（39-03 蛟龍）·
 * 187%（44-04 心臟麻痺）；**17/100** 標著「☠ 一擊」。
 *
 * ⭐⭐ **根因：五級距只管加法項。**
 *
 *     傷害 = 小級距(500) + 0.8 × AP
 *             ↑ 五級距管這裡    ↑ ⛔ 完全在級距之外
 *
 * ⭐ 而五級距是從「**純基礎**血量 ÷ `KILL_CASTS_REF` 發」反推的
 * —— ⭐ **那個空間裡 AP ＝ 0**，⛔ 而榜上 100 列沒有一列在那個空間裡。
 * ⇒ ⭐ 級距回答的是「零裝備時要打幾發」，而玩家從商店開門起就不在那個世界。
 *
 * ⚠️ ⭐ **這一格 ⛔ 不改公式、⛔ 不夾 AP、⛔ 不改任何技能的數值**（#928 的 Non-goals）——
 * 它只是在**最後一步**把單次對英雄的傷害夾住，讓「一擊必殺」從
 * 「只有玩家會發現」變成「一個看得到、關得掉的東西」。
 *
 * ⭐⭐ **出貨預設是開的**（`enabled: true`，GH#1017）—— owner 2026-09-06 逐字：
 * > 「先做 A 但我想深入了解 B」（A ＝ 翻開這一格；B ＝ 級距反推空間）
 * ⚠️ B **目前沒有在做**（2026-09-15 更正；⚠️ 這是 Claude 依下列原話的**推論**，⛔ owner 沒有逐字說過「B 不做」）：
 *    同一晚 Claude 交了 B 的深入了解，owner 回「系統倍率是我人工旋鈕 不參與公式 不信你查證」
 *    （09-06 01:36；`docs/_daily/2026-09-06.md:28`）、Claude 回「所以 B 不用做了」owner 未反對。
 *    同一天血量倍率走旋鈕：owner「好吧 先開票 血量倍率4x, M=15 K=1000」（09-06 12:28；`docs/_daily/2026-09-06.md:52`）——
 *    ⛔⛔ **這句的後半「M=15 K=1000」同日稍晚已被取代**（GH#1029 整份改寫；取代註記在
 *    `content/config/owner-knobs.json` 的 note，GH#1093）⇒ ⛔ 不要拿它當 AP 曲線的值，出貨曲線住
 *    `content/config/ap-damage-scaling.json`（⛔ 這裡不抄數字，第〇·四守則）。仍然成立的只有前半「血量倍率4x」。
 *    之後 owner 2026-09-15 對「幾發打死」逐字：「我們已經固定 不需要再乘 頂多是後台試算後顯示 但不干涉也不警示」。
 * ⚠️ 2026-09-15 第二次更正（#1260 審查）：commit `f9519be05` 的版本把上面那句整句寫成「當天定案」，
 *    ⛔ 沒標出後半已被取代，出處也寫成 `:27,52`（:27 是 01:30 那則）；後台 `@note` 還直接寫「B ⛔ 不動」、沒標是推論。
 * ⚠️ 2026-09-06 之前這裡寫「出貨關著 ⋯ owner 還沒裁決要不要夾」—— 他現在裁決了。
 * 開著會改變每一場比賽的結果；翻回 `false` ＝ 一鍵 rollback（後台一格下拉選單）。
 * ⛔ `maxFractionOfMaxHp` / `alsoClampMinions` 沒有動（#1017 的 Non-goals）。
 */
import { z } from "zod";
import { zId } from "../common";

export const zConfigOneShotClampDoc = z
  .object({
    id: zId,
    schema: z.literal("config.one-shot-clamp@1"),
    note: z.string().optional(),
    /**
     * ⭐ 總開關。⭐ **出貨開著**（owner 2026-09-06「先做 A」，GH#1017）—— 它改變每一場比賽的結果；翻回 false ＝ rollback。
     * ⚠️ 關著時整條夾限逐位元 no-op（⛔ 不是「夾到 100%」）。
     */
    enabled: z.boolean().describe(
      "@zh 夾限總開關\n" +
      "@note ⭐ **出貨開著**（owner 2026-09-06 逐字：「先做 A 但我想深入了解 B」—— A ＝ 翻開這一格，GH#1017；B ＝ 級距反推空間）。⚠️ B 目前沒有在做 —— 那是 Claude 依 owner 同晚「系統倍率是我人工旋鈕 不參與公式 不信你查證」做的**推論**，⛔ owner 沒有逐字說過「B 不做」。⚠️ 開著會改變**每一場**比賽的結果 —— 翻回關閉 ＝ 一鍵 rollback。⭐ 關著時整條夾限逐位元 no-op（⛔ 不是「夾到 100%」）。",
    ),
    /**
     * ⭐ 單次對**英雄**的傷害上限，以**目標最大生命的倍數**表示。
     * `1.0` ＝ 一發最多打掉他滿血；`0.5` ＝ 最多半條。
     * ⚠️ 上界 10：再高就等於沒有夾（榜上最高是 4.01）。
     * ⚠️ 下界 0.05：低於這個值會讓每一場比賽都打不死人。
     */
    maxFractionOfMaxHp: z.number().min(0.05).max(10).describe(
      "@zh 單次上限 — 目標最大生命的倍數\n" +
      "@note ⭐ `1.0` ＝ 一發最多打掉他滿血；`0.5` ＝ 最多半條（出貨值 {{出貨值}}）。⚠️ 上界 10：再高就等於沒有夾（榜上最高是 **4.01**）。⚠️ 下界 0.05：低於這個值會讓每一場比賽都打不死人。",
    ),
    /**
     * ⭐ 夾不夾**小怪**。⛔ 預設不夾 —— 榜單量到的 B 類
     * （總傷害大但單體佔比低）打的正是小怪，而那**不是缺陷**。
     */
    alsoClampMinions: z.boolean().describe(
      "@zh 小怪也夾\n" +
      "@note ⛔ 預設**不夾** —— 榜單量到的 B 類（總傷害大但**單體佔比低**）打的正是小怪，⭐ 而那**不是缺陷**（59-04 用 `damageLine` 掃 22 列、80-02 用 `damageArea`）。",
    ),
  })
  .strict();
export type ConfigOneShotClampDoc = z.infer<typeof zConfigOneShotClampDoc>;

/**
 * ⭐ 出貨值 —— ⛔ 不抄字面量：它與 `content/config/one-shot-clamp.json`
 * 的每一格必須逐位元相同，而 drift 測試在守。
 */
export const SHIPPED_ONE_SHOT_CLAMP: ConfigOneShotClampDoc = {
  id: "one-shot-clamp",
  schema: "config.one-shot-clamp@1",
  enabled: true,
  maxFractionOfMaxHp: 1.0,
  alsoClampMinions: false,
};
