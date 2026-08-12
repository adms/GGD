/**
 * 吟唱規則（`config.cast-time@1`）—— 吟唱**能有多短、多長、整體快幾倍**。
 *
 * owner 2026-08-13：
 *   ①「請你照我的 **0.06~4.00 秒**來設定吟唱時間
 *      （所有的技能都有最低吟唱技能時間 0.06 秒，讓 tick 一定可以處理）」
 *   ②「**吟唱時間倍率** 也可以在系統後台設定」
 *   ③「吟唱時間**上下限**也可以一起設定」
 *
 * ⇒ 三格：`multiplier` · `floorSec` · `capSec`。三格住在同一份文件，因為它們
 * 是同一條算式的三個位置，⛔ 拆到兩頁會讓「調了倍率但被上限吃掉」看起來像 bug。
 *
 * ── 算式（唯一的一條，`castTimeFormula.ts` 呼叫）─────────────────────────
 *
 *     秒數 = clamp(規格值或公式值, floorSec, capSec) × multiplier
 *            然後再 clamp 一次到 [floorSec, capSec]，最後對齊整數 tick
 *
 * ⚠️ **夾兩次是刻意的**，不是贅字：先夾是為了讓一支寫了「吟唱 10 秒」的技能
 * 落回 4.0（作者打錯），後夾是為了讓 `multiplier = 3` 不會把 2 秒推到 6 秒 ——
 * 上限的意思是「畫面上不會出現比這更長的定身」，倍率不該有豁免權。
 *
 * ── ⭐ 為什麼**下限**不能只是「填 0 就好」───────────────────────────────
 * sim 是 30 Hz，一個 tick = 1/30 ≈ 0.0333 秒。`abilitySystem.ts` 用
 * `Math.round(castTimeSec / world.dt)` 換算成 tick 數 ——
 *
 *   · 0.06 秒 → **2 tick**（owner 指定的地板，穩穩地能被處理）
 *   · 0.02 秒 → `Math.round(0.6)` = **1 tick**
 *   · 0.01 秒 → `Math.round(0.3)` = **0 tick** ⇒ sim 當它是瞬發
 *
 * ⛔ 而客戶端**照樣畫得出**那一段吟唱條與向天光束預告（#233）——
 * 於是玩家看到吟唱、sim 沒有吟唱，**兩邊都不會報錯**。這就是地板存在的理由，
 * 也是為什麼 `floorSec` 的下界不是 0 而是**一個 tick 的長度**。
 *
 * ── 與冷卻的關係 ─────────────────────────────────────────────────────────
 * ⛔ 吟唱**不要**用 `combatEnv.cooldown` 一起調：冷卻決定「多久能再按一次」，
 * 吟唱決定「按下去到生效之間站著不動多久」。用同一個旋鈕會把
 * 「吟唱 ≤ 冷卻/8」那條不變式的分子分母一起動，等於什麼都沒調。
 *
 * ⚠️ 而那條不變式（`CD_CEILING_FRACTION`）現在**不再夾規格值**——
 * owner 2026-08-13 明說規格寫幾秒就是幾秒。它只剩下夾**公式推導**出來的值。
 */

/** `content/config/cast-time.json` 的文件 id。 */
export const CAST_TIME_RULES_DOC_ID = "cast-time";

export interface CastTimeRules {
  /**
   * 止血閥。false = 三格全部不作用（吟唱照 `castTimeFormula` 的原始輸出走）。
   *
   * ⚠️ 關掉它**也關掉地板** —— 於是 0.01 秒的技能會退回「畫得出來但 sim 沒有」
   * 的那個狀態。留這一格是為了排查（「是不是這三格害的？」），⛔ 不是為了常關。
   */
  enabled: boolean;
  /**
   * 全域吟唱倍率。1.0 = 照算出來的值出貨；0.5 = 全部技能吟唱減半。
   *
   * ⚠️ 它**在夾完之後**才乘，然後**再夾一次**（見檔頭算式）——
   * 所以把它開到 3 不會讓任何技能超過 `capSec`。
   */
  multiplier: number;
  /**
   * 吟唱**最短**幾秒。出貨 0.06（owner 2026-08-13）＝ 2 個 sim tick。
   *
   * ⛔ 下界是**一個 tick**（1/30 ≈ 0.034），不是 0 —— 理由見檔頭。
   */
  floorSec: number;
  /**
   * 吟唱**最長**幾秒。出貨 4.00（owner 2026-08-13）。
   *
   * 這是「一支技能最多能讓玩家站著不動多久」的硬上界。作者在說明裡寫
   * 「吟唱 10 秒」時，它是那個打錯的字被夾住的地方。
   */
  capSec: number;
}

/** 出貨值。owner 2026-08-13 逐字指定 0.06 與 4.00。 */
export const DEFAULT_CAST_TIME_RULES: CastTimeRules = Object.freeze({
  enabled: true,
  multiplier: 1,
  floorSec: 0.06,
  capSec: 4,
});

/** 一個 sim tick 的長度。`floorSec` 的下界 —— ⛔ 比這更短 sim 會當它是瞬發。 */
export const CAST_TICK_SEC = 1 / 30;

/** 三格的上下界。`schema/config.ts` 與後台欄位共用這一組（第一守則：要有**上**界）。 */
export const CAST_MULTIPLIER_MIN = 0.1;
export const CAST_MULTIPLIER_MAX = 5;
export const CAST_FLOOR_MIN = CAST_TICK_SEC;
export const CAST_FLOOR_MAX = 1;
export const CAST_CAP_MIN = 0.5;
export const CAST_CAP_MAX = 10;

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, lo), hi);
}

/** 把一份 `config.cast-time@1` 文件正規化成規則物件。認不得 → 出貨值。 */
export function castTimeRulesFromDoc(doc: unknown): CastTimeRules {
  const d = doc as
    | { schema?: string; enabled?: unknown; multiplier?: unknown; floorSec?: unknown; capSec?: unknown }
    | undefined;
  if (!d || d.schema !== "config.cast-time@1") return DEFAULT_CAST_TIME_RULES;
  const floorSec = clampNum(d.floorSec, CAST_FLOOR_MIN, CAST_FLOOR_MAX, DEFAULT_CAST_TIME_RULES.floorSec);
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_CAST_TIME_RULES.enabled,
    multiplier: clampNum(
      d.multiplier,
      CAST_MULTIPLIER_MIN,
      CAST_MULTIPLIER_MAX,
      DEFAULT_CAST_TIME_RULES.multiplier,
    ),
    floorSec,
    // ⚠️ 上限**不可以低於**下限。作者把 cap 設成 0.5、floor 設成 1.0 時，
    //    夾出來的區間是空的 —— 那會讓 `Math.min(Math.max(v, 1), 0.5)` 回 0.5，
    //    ⛔ 也就是**下限被無聲地違反**。這裡讓下限贏。
    capSec: Math.max(floorSec, clampNum(d.capSec, CAST_CAP_MIN, CAST_CAP_MAX, DEFAULT_CAST_TIME_RULES.capSec)),
  };
}

/**
 * 把三格套到一個算好的吟唱秒數上，並對齊整數 tick。
 *
 * ⭐ 這是**唯一**知道三格怎麼作用的地方 —— `castTimeFormula` 與任何未來的
 * 吟唱路徑都呼叫它，⛔ 不要各自寫一次 clamp（同 `applyCooldownFloor` 的理由）。
 */
export function applyCastTimeRules(rules: CastTimeRules, seconds: number): number {
  if (!rules.enabled) return seconds;
  const clamped = Math.min(Math.max(seconds, rules.floorSec), rules.capSec);
  const scaled = Math.min(Math.max(clamped * rules.multiplier, rules.floorSec), rules.capSec);
  // 對齊整數 tick，並保證至少 `floorSec` 換算出來的那個 tick 數。
  const ticks = Math.max(Math.round(rules.floorSec / CAST_TICK_SEC), Math.round(scaled / CAST_TICK_SEC));
  return Math.round(ticks * CAST_TICK_SEC * 1000) / 1000;
}
