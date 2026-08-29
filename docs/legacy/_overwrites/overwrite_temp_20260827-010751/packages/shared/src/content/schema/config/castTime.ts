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
    enabled: z.boolean(),
    /** 全域吟唱倍率。1.0 = 照算出來的值出貨；0.5 = 全技能吟唱減半。 */
    multiplier: z.number().min(CAST_MULTIPLIER_MIN).max(CAST_MULTIPLIER_MAX),
    /**
     * 吟唱**最短**幾秒。出貨 0.06 = 2 個 sim tick。
     *
     * ⛔ 下界是**一個 tick**（≈0.034）而不是 0：比一個 tick 更短時
     * `Math.round(sec / dt)` 會算出 0 tick ⇒ sim 當它瞬發，而客戶端**照樣**
     * 畫得出吟唱條與預告光束。兩邊都不報錯，只有玩家看得出來。
     */
    floorSec: z.number().min(CAST_FLOOR_MIN).max(CAST_FLOOR_MAX),
    /** 吟唱**最長**幾秒。出貨 4.00 —— 作者寫「吟唱 10 秒」時被夾住的地方。 */
    capSec: z.number().min(CAST_CAP_MIN).max(CAST_CAP_MAX),
    /**
     * ⏳ owner 夾（#787）。owner 2026-08-27：「把所有詠唱超過一秒的都調整至一秒
     * 但是在後台留下記錄」。規格值進算式前先 min 到這一格；出貨 1.0。
     * 止血閥：拉到 8（≥ capSec）＝一支都夾不到。
     *
     * ⚠️ `.optional()` 是刻意的：線上的耐久覆蓋層（data/）可能已經存過一份
     * **沒有這一格**的文件 —— 缺格時 `castTimeRulesFromDoc` 回出貨值 1.0，
     * ⛔ 不是讓整份 config 驗證失敗（2026-08-02 事故的形狀）。
     */
    castTimeMaxSec: z.number().min(CAST_TIME_MAX_SEC_MIN).max(CAST_TIME_MAX_SEC_MAX).optional(),
  })
  .strict();

export const DEFAULT_CAST_TIME_DOC = {
  id: CAST_TIME_RULES_DOC_ID,
  schema: "config.cast-time@1",
  enabled: DEFAULT_CAST_TIME_RULES.enabled,
  multiplier: DEFAULT_CAST_TIME_RULES.multiplier,
  floorSec: DEFAULT_CAST_TIME_RULES.floorSec,
  capSec: DEFAULT_CAST_TIME_RULES.capSec,
} as const;
