/**
 * 冷卻規則（`config.cooldown-rules@1`）—— 冷卻**縮到最短能有多短**。
 *
 * owner 2026-08-10：「cdr 天花板可以是 0.99（99%減免），但要卡最低秒數 0.1 秒，
 * 這些都可以在後台設定」。
 *
 * ── 為什麼是**兩個**旋鈕而不是一個 ────────────────────────────────────────
 * 冷卻的算式是（`abilities/abilitySystem.ts`）：
 *
 *     實際秒數 = 技能基礎冷卻[等級] × (1 − cdr) × combatEnv.cooldown × 暴走倍率
 *                然後 clamp 到 ≥ minSeconds
 *
 * `cdr` 是**比率**，它的天花板住在 `config.stat-caps@1`（跟攻速上限同一張表）。
 * 這裡的 `minSeconds` 是**秒數地板**，它管的是完全不同的一件事：
 *
 *   · 只有比率上限（舊做法）→ 一支 1 秒的技能在 99% 減免下變成 0.01 秒，
 *     也就是每個 tick 都放得出來。天花板再怎麼調都擋不住**短冷卻**的技能。
 *   · 只有秒數地板 → 一支 120 秒的 EX 永遠碰不到地板，地板對它是死的。
 *
 * ⭐ 兩個一起才蓋得住整個值域：比率管長技能，地板管短技能。這正是 owner 那一句
 * 話裡的兩半 —— 「天花板 0.99」與「最低 0.1 秒」不是同一個旋鈕的兩種說法。
 *
 * ── ⚠️ 地板是**最後**一步 ─────────────────────────────────────────────────
 * 它夾的是乘完 `combatEnv.cooldown` 與暴走倍率之後的最終秒數。放在中間會讓
 * 「全域冷卻 ×2」變成可以把已經觸底的技能再推回地板之上 —— 那讀起來像 bug。
 *
 * ⛔ 地板**不是** 0 的替代品。填 0 = 沒有地板（合法，而且是「我知道我在做什麼」
 * 的寫法）；出貨 0.1 是 owner 指定的值。
 */

/** `content/config/cooldown-rules.json` 的文件 id。 */
export const COOLDOWN_RULES_DOC_ID = "cooldown-rules";

export interface CooldownRules {
  /**
   * 止血閥。false = 地板不作用（但看得見它是關的）。
   *
   * ⚠️ 關掉它**不會**關掉冷卻縮減本身 —— cdr 是一格屬性，它的天花板在
   * `config.stat-caps@1`。這一格只管「秒數不准低於多少」。
   */
  enabled: boolean;
  /**
   * 一支技能的實際冷卻**最短**能有多少秒。出貨 0.1（owner 2026-08-10）。
   *
   * 0 = 沒有地板。上界 10 —— 再高就會把大多數技能的冷卻**拉長**而不是設地板，
   * 那是打錯數字的樣子（一個 3 秒 CD 的技能配一個 30 秒的「地板」）。
   */
  minSeconds: number;
  /**
   * ⭐ GH#489 —— **一條觸發器（hook）的內部冷卻最短幾實際秒**。出貨 **0 = 沒有地板**。
   *
   * ── 為什麼它需要自己一格，而不是沿用上面那個 `minSeconds` ────────────────
   * 兩個欄位量的是**兩種秒**，而它們長得一模一樣（GH#489 的 5 倍陷阱）：
   *
   *   | 欄位 | 單位 | 誰乘 `combatEnv.cooldown`（出貨 0.2）|
   *   |---|---|---|
   *   | `ability.cooldown[]`    | **卡面秒** | 引擎（⇒ 60 卡面秒 = 12 實際秒）|
   *   | `hook.internalCooldown` | **實際秒** | ⛔ 沒有人（`effects/hookIcd.ts`）|
   *
   * 用同一格夾兩種秒，等於用同一把尺量兩個空間 —— 那正是這個 issue 的起因。
   *
   * ── ⚠️ 為什麼出貨值是 0 而不是 1.2（＝最便宜的那一格冷卻）──────────────────
   * **量到的**（2026-08-21，掃 `content/{abilities,items,augments,champions}`）：
   * 有填內部冷卻的觸發器裡 **52 條低於 1.2 秒**（0.5 / 0.6 / 1.0），另有 279 條
   * 刻意不填（03-00 相轉移裝甲的常駐魔免**就是**要每 tick 續期）。
   * ⇒ 把地板預設拉到 1.2 會**無聲改掉 52 張卡的手感**，而那是 owner 的平衡排序，
   *   ⛔ 不是我的（第零守則⑧）。所以出貨 0 = 逐位元等於今天。
   *
   * ⭐ 它存在的理由是**一鍵**：owner 想一次壓住所有被動的觸發頻率時，填一個數字
   * 就好，⛔ 不必逐支去改幾百份 JSON。1.2 是那個「他大概會想填的」值 ——
   * owner 自己的冷卻表最便宜的一格（單體·極小 6 卡面秒 × 0.2）。
   *
   * ⚠️ 它**只夾有填內部冷卻的那些**。沒填 = 作者明說「每一次事件都算」，
   * 而把那 279 條一起夾住會讓一堆常駐效果變成閃爍的 —— 那是另一個功能，不是地板。
   *
   * ⚠️ 受 `enabled` 管（同 `minSeconds`）：那一格是這頁的總止血閥。
   */
  hookMinSeconds: number;
}

/**
 * 出貨值。owner 2026-08-10 指定 0.1 秒。
 *
 * ⚠️ 這裡的 0.1 與 `content/config/cooldown-rules.json` 必須一致，
 * `cooldownFloor.test.ts` 在守（第一守則的三個住處）。
 */
export const DEFAULT_COOLDOWN_RULES: CooldownRules = Object.freeze({
  enabled: true,
  minSeconds: 0.1,
  // ⭐ 0 = 沒有地板 = 逐位元等於這一格出現之前。理由寫在 `hookMinSeconds` 上。
  hookMinSeconds: 0,
});

/** 秒數地板的上下界。`schema/config.ts` 與後台欄位共用這一組。 */
export const COOLDOWN_MIN_SECONDS_MIN = 0;
export const COOLDOWN_MIN_SECONDS_MAX = 10;

function clampMin(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_COOLDOWN_RULES.minSeconds;
  return Math.min(Math.max(v, COOLDOWN_MIN_SECONDS_MIN), COOLDOWN_MIN_SECONDS_MAX);
}

function clampHookMin(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_COOLDOWN_RULES.hookMinSeconds;
  return Math.min(Math.max(v, COOLDOWN_MIN_SECONDS_MIN), COOLDOWN_MIN_SECONDS_MAX);
}

/** 把一份 `config.cooldown-rules@1` 文件正規化成規則物件。認不得 → 出貨值。 */
export function cooldownRulesFromDoc(doc: unknown): CooldownRules {
  const d = doc as
    | { schema?: string; enabled?: unknown; minSeconds?: unknown; hookMinSeconds?: unknown }
    | undefined;
  if (!d || d.schema !== "config.cooldown-rules@1") return DEFAULT_COOLDOWN_RULES;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_COOLDOWN_RULES.enabled,
    minSeconds: clampMin(d.minSeconds),
    // ⚠️ 缺席 → 出貨值，⛔ 不是 NaN。線上**已經存過**一份沒有這一格的耐久覆蓋層
    //    （`data/`），而那一份會蓋掉 `content/config/`：把缺席讀成壞值會讓整份
    //    config 退回預設，也就是 2026-08-02 那次事故的形狀。
    hookMinSeconds: clampHookMin(d.hookMinSeconds),
  };
}

/**
 * 把觸發器地板套到一條 hook 的內部冷卻上（**實際秒**進、**實際秒**出）。
 *
 * ⭐ 與 {@link applyCooldownFloor} 分成兩支是刻意的：兩者夾的是**兩種秒**
 * （見 {@link CooldownRules.hookMinSeconds} 的那張表）。共用一支函式會讓
 * 「這個數字是卡面還是實際」變成呼叫端各自記得的事 —— 而這個 repo 已經為
 * 那件事付過一次代價（GH#489）。
 *
 * ⚠️ `seconds <= 0` 直接回傳：那是「這條 hook 沒有內部冷卻」，⛔ 不是
 * 「內部冷卻是 0 秒所以要被夾到地板」。把它一起夾住會讓 279 條刻意每 tick
 * 續期的常駐效果（03-00 相轉移裝甲的魔免）變成閃爍的。
 */
export function applyHookCooldownFloor(rules: CooldownRules, seconds: number): number {
  if (!rules.enabled || !(seconds > 0)) return seconds;
  return Math.max(seconds, rules.hookMinSeconds);
}

/**
 * 把地板套到一個算好的冷卻秒數上。
 *
 * ⭐ 這是**唯一**知道地板怎麼作用的地方 —— `abilitySystem` 與任何未來的
 * 冷卻路徑都呼叫它，而不是各自寫一次 `Math.max`。兩份 `Math.max` 就是
 * 「有一半的技能忘記套用」的標準劇本（同 `combatEnv.cooldown` 那個 seam）。
 */
export function applyCooldownFloor(rules: CooldownRules, seconds: number): number {
  if (!rules.enabled) return seconds;
  return Math.max(seconds, rules.minSeconds);
}
