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
 * > 「先做 A 但我想深入了解 B」（A ＝ 翻開這一格；B ＝ 級距反推空間，另案）
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
      "@note ⭐ **出貨開著**（owner 2026-09-06 逐字：「先做 A 但我想深入了解 B」—— A ＝ 翻開這一格，GH#1017；B ＝ 級距反推空間，另案）。⚠️ 開著會改變**每一場**比賽的結果 —— 翻回關閉 ＝ 一鍵 rollback。⭐ 關著時整條夾限逐位元 no-op（⛔ 不是「夾到 100%」）。",
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
