/**
 * ⭐⭐ **吟唱五級距**（GH#943）—— owner 2026-09-02 逐字：
 * > 「吟唱⋯其實這個也可以五級距 **0, 0.1, 0.3, 0.5, 1** 建議也改成這個」
 *
 * ⛔ 那五格是**他給的**，⛔ 不要自己挑（第一守則：出貨數值要引用得到原話）。
 *
 * ## ⭐ 與 `config.cast-time@1` 的關係（⛔ 不是第二個住處）
 *
 * | 誰 | 管什麼 |
 * |---|---|
 * | `castTimeTier`（這一支） | ⭐ 作者**寫**什麼（五格下拉，⛔ 不是空白數字框） |
 * | `applyCastTimeRules`（`sim/castTimeRules.ts`） | ⭐ 引擎**夾**成什麼（floor / cap / 倍率 / tick 對齊） |
 *
 * ⇒ ⭐ 級距是**輸入**，夾是**輸出** —— ⛔ 兩者不重疊。
 * ⚠️ 而上界 **1.0** 與 `castTimeMaxSec`（#787 owner 夾「把所有詠唱超過一秒的都調整至一秒」）
 * 刻意同一個數字：⭐ **級距寫得出來的最大值，就是引擎夾得住的最大值**
 * ⇒ ⛔ 作者不可能寫出一個「會被靜靜夾掉」的值。
 *
 * ## ⭐ 為什麼這一格值得存在（⛔ 不是為了整齊）
 *
 * 契約 4,983 格裡有 14 種 `*Tier` 會渲染成**下拉選單**，
 * ⛔ 而吟唱今天是一個**空白數字框** ⇒ 玩家在編輯器裡沒有東西告訴他
 * 0.1 秒與 1.0 秒差 10 倍、而 1.0 已經是天花板。
 */
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

export interface CastTimeTiers {
  readonly enabled: boolean;
  readonly seconds: Readonly<Record<SkillTierName, number>>;
}

/** ⭐ 出貨值 —— owner 逐字給的五格。⛔ 改它要引用得到他的一句原話。 */
export const DEFAULT_CAST_TIME_TIERS: CastTimeTiers = Object.freeze({
  enabled: true,
  seconds: Object.freeze({ 極小: 0, 小: 0.1, 中: 0.3, 大: 0.5, 極大: 1.0 }),
});

/**
 * ⭐ 把級距翻成秒。⛔ 關掉時回 `null`（＝「這一格不作用」），
 * ⛔ 不是回 0 —— 0 是一個**有意義的吟唱時間**（瞬發）。
 */
export function resolveCastTimeTier(
  tier: string | undefined,
  tiers: CastTimeTiers = DEFAULT_CAST_TIME_TIERS,
): number | null {
  if (!tiers.enabled) return null;
  if (typeof tier !== "string") return null;
  if (!(SKILL_TIER_NAMES as readonly string[]).includes(tier)) return null;
  const v = tiers.seconds[tier as SkillTierName];
  return typeof v === "number" ? v : null;
}

/**
 * ⭐ 反向：一個秒數落在哪一格。⛔ 用**最近的**格，而不是「小於等於」——
 * ⚠️ 0.4 秒離「大 0.5」比離「中 0.3」近，而「小於等於」會把它判成中。
 */
export function castTimeTierOf(
  seconds: number,
  tiers: CastTimeTiers = DEFAULT_CAST_TIME_TIERS,
): SkillTierName {
  let best: SkillTierName = SKILL_TIER_NAMES[0];
  let bestD = Infinity;
  for (const name of SKILL_TIER_NAMES) {
    const d = Math.abs(tiers.seconds[name] - seconds);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/**
 * ⭐⭐ **載入時把 `castTimeTier` 翻成 `castTimeSec`**（GH#943）。
 *
 * ⛔⛔ 少了這一支，`castTimeTier` 就是「有欄位、有表、⛔ 而沒有人翻譯它」——
 * ⭐ 那正是 CLAUDE.md 的失敗形態⑧：schema 收得下、後台存得起來、
 * 卡面上印著，⛔ 而遊戲裡什麼都不發生。
 * ⚠️ 而 `gen_contract_numbers.py` 逐字擋下來了：
 * 「`resolveCastTimeTier` 不在 registries.ts 的解析接縫上 —— 沒有人翻譯它」。
 *
 * ## ⭐ 級距贏（第〇·四守則）
 *
 * 兩格都填 ⇒ **級距贏**（同 `resolveCooldownTier` 的「級別贏」規則）——
 * ⛔ 否則 `castTimeSec` 就是第二個住處，而級距表一改它就靜靜分岔。
 */
export function resolveCastTimeTierOnDoc<T extends Record<string, unknown>>(
  def: T,
  tiers: CastTimeTiers = DEFAULT_CAST_TIME_TIERS,
): T {
  if (!tiers.enabled) return def;
  const secs = resolveCastTimeTier(def["castTimeTier"] as string | undefined, tiers);
  if (secs === null) return def;
  return { ...def, castTimeSec: secs };
}
