import { z } from "zod";
import { zId } from "../common";
// 吟唱規則（owner 2026-08-13 的三句：0.06~4.00、倍率可調、上下限可調）——
// 同一條規矩：數字與語意住在 sim/castTimeRules.ts，schema 只是把它搬上 Zod。
import { CAST_CAP_MAX, CAST_CAP_MIN, CAST_FLOOR_MAX, CAST_FLOOR_MIN, CAST_MULTIPLIER_MAX, CAST_MULTIPLIER_MIN, CAST_TIME_MAX_SEC_MAX, CAST_TIME_MAX_SEC_MIN, CAST_TIME_RULES_DOC_ID, DEFAULT_CAST_TIME_RULES } from "../../../sim/castTimeRules";

/**
 * config.cast-time@1 — 吟唱規則（owner 2026-08-13）。
 *
 * owner 的三句話 = 這三格：
 *   ①「請你照我的 **0.06~4.00 秒**來設定吟唱時間」→ `floorSec` / `capSec`
 *   ②「**吟唱時間倍率** 也可以在系統後台設定」    → `multiplier`
 *   ③「吟唱時間**上下限**也可以一起設定」        → 上面那兩格變成欄位而非常數
 *
 * ⭐ 三格住同一份文件，因為它們是同一條算式的三個位置 ——
 * 拆到兩頁會讓「調了倍率卻被上限吃掉」看起來像 bug。
 * 語意、夾兩次的理由、以及「為什麼下限不能是 0」寫在 `sim/castTimeRules.ts`。
 */
export const zConfigCastTimeDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cast-time@1"),
    note: z.string().optional(),
    /** 止血閥。false = 三格全部不作用（⚠️ 連地板一起關掉）。 */
    enabled: z.boolean().describe(
      "@zh 吟唱規則總開關\n" +
      "@note 關掉之後三格全部不作用，吟唱照技能自己算出來的秒數走。⚠️ **它也關掉下限** —— 於是低於一個 tick 的技能會退回「客戶端畫得出來、sim 當它瞬發」那個狀態。這一格是給排查用的（「是不是這三格害的？」），⛔ 不是拿來常關的。",
    ),
    /** 全域吟唱倍率。1.0 = 照算出來的值出貨；0.5 = 全技能吟唱減半。 */
    multiplier: z.number().min(CAST_MULTIPLIER_MIN).max(CAST_MULTIPLIER_MAX).describe(
      "@zh 全域吟唱倍率\n" +
      "@note 所有技能的吟唱一起快慢。1.0 ＝ 照算出來的值；0.5 ＝ 全部減半（更靈活、更難閃）；2.0 ＝ 全部加倍（更笨重、預告更好躲）。⚠️ 它在**夾完之後**才乘、然後**再夾一次**，所以開到 5 也不會有任何技能超過下面的上限。",
    ),
    /**
     * 吟唱**最短**幾秒。出貨 0.06 = 2 個 sim tick。
     *
     * ⛔ 下界是**一個 tick**（≈0.034）而不是 0：比一個 tick 更短時
     * `Math.round(sec / dt)` 會算出 0 tick ⇒ sim 當它瞬發，而客戶端**照樣**
     * 畫得出吟唱條與預告光束。兩邊都不報錯，只有玩家看得出來。
     */
    floorSec: z.number().min(CAST_FLOOR_MIN).max(CAST_FLOOR_MAX).describe(
      "@zh 吟唱下限（秒）\n" +
      "@note 有吟唱的技能最短幾秒。出貨 **{{出貨值}}**（owner 指定 ＝ 2 個 sim tick）。⛔ 下界是 **0.034（一個 tick）不是 0** —— 理由見上面第三段。⚠️ 它**不會**把瞬發技（吟唱 0）變成 0.06：那一格管的是「有吟唱的技能最短多長」，把每支瞬發技都推到 0.06 會讓全部技能一起變鈍。",
    ),
    /** 吟唱**最長**幾秒。出貨 4.00 —— 作者寫「吟唱 10 秒」時被夾住的地方。 */
    capSec: z.number().min(CAST_CAP_MIN).max(CAST_CAP_MAX).describe(
      "@zh 吟唱上限（秒）\n" +
      "@note 任何技能最長幾秒。出貨 **4.00**（owner 指定）。這是「一支技能最多能讓玩家站著不動多久」的硬上界，也是作者在說明裡寫「吟唱 10 秒」時被夾住的地方。⚠️ 填得比下限還低時**下限贏** —— 否則夾出來的區間是空的，下限會被無聲違反。",
    ),
    /**
     * ⏳ owner 夾（#787）。owner 2026-08-27：「把所有詠唱超過一秒的都調整至一秒
     * 但是在後台留下記錄」。規格值進算式前先 min 到這一格；出貨 1.0。
     * 止血閥：拉到 8（≥ capSec）＝一支都夾不到。
     *
     * ⚠️ `.optional()` 是刻意的：線上的耐久覆蓋層（data/）可能已經存過一份
     * **沒有這一格**的文件 —— 缺格時 `castTimeRulesFromDoc` 回出貨值 1.0，
     * ⛔ 不是讓整份 config 驗證失敗（2026-08-02 事故的形狀）。
     */
    castTimeMaxSec: z.number().min(CAST_TIME_MAX_SEC_MIN).max(CAST_TIME_MAX_SEC_MAX).optional().describe(
      "@zh ⏳ 詠唱調整上限（秒）\n" +
      "@note owner 2026-08-27（逐字）：「**把所有詠唱超過一秒的都調整至一秒 但是在後台留下記錄**」（#787）。技能的規格詠唱在**進算式之前**先被 min 到這一格 —— 等於 95 份文件在載入時被改成 1 秒，⛔ 但一份技能 JSON 都不動（改這一格＝改全部，不用重生成）。出貨 **1.0**。與上面「吟唱上限」的分工：那一格擋**作者打錯**（寫 10 秒），這一格是 **owner 的平衡裁決**。「留下記錄」在「📜 詠唱>1秒清單」頁：原值／夾後／差三欄。**止血閥：拉到 8**（≥ 吟唱上限）＝一支都夾不到＝回 2026-08-27 之前的行為。⚠️ 缺這一格的舊存檔會用出貨值 1.0（裁決是全域的）。",
    ),
  })
  .strict();

export const DEFAULT_CAST_TIME_DOC = {
  id: CAST_TIME_RULES_DOC_ID,
  schema: "config.cast-time@1",
  enabled: DEFAULT_CAST_TIME_RULES.enabled,
  multiplier: DEFAULT_CAST_TIME_RULES.multiplier,
  floorSec: DEFAULT_CAST_TIME_RULES.floorSec,
  capSec: DEFAULT_CAST_TIME_RULES.capSec,
  castTimeMaxSec: DEFAULT_CAST_TIME_RULES.castTimeMaxSec,
} as const;
