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
}

/**
 * 出貨值。owner 2026-08-10 指定 0.1 秒。
 *
 * ⚠️ 這裡的 0.1 與 `content/config/cooldown-rules.json` 必須一致，
 * `configDrift.test.ts` 那一族在守（第一守則的三個住處）。
 */
export const DEFAULT_COOLDOWN_RULES: CooldownRules = Object.freeze({
  enabled: true,
  minSeconds: 0.1,
});

/** 秒數地板的上下界。`schema/config.ts` 與後台欄位共用這一組。 */
export const COOLDOWN_MIN_SECONDS_MIN = 0;
export const COOLDOWN_MIN_SECONDS_MAX = 10;

function clampMin(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_COOLDOWN_RULES.minSeconds;
  return Math.min(Math.max(v, COOLDOWN_MIN_SECONDS_MIN), COOLDOWN_MIN_SECONDS_MAX);
}

/** 把一份 `config.cooldown-rules@1` 文件正規化成規則物件。認不得 → 出貨值。 */
export function cooldownRulesFromDoc(doc: unknown): CooldownRules {
  const d = doc as { schema?: string; enabled?: unknown; minSeconds?: unknown } | undefined;
  if (!d || d.schema !== "config.cooldown-rules@1") return DEFAULT_COOLDOWN_RULES;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_COOLDOWN_RULES.enabled,
    minSeconds: clampMin(d.minSeconds),
  };
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
