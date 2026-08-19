/**
 * 魔力經濟（`config.mana-economy@1`，GH#446）—— **回魔**的地板。
 *
 * owner 2026-08-19（逐字）：
 * > 「應該是去**調整回魔**，找到一個平衡，原則上極端情形是
 * >  **連續四個大範圍技能施展完後一定要等回魔**，或是**可以連續八次範圍技能施展完等回魔**，
 * >  **平均回魔不超過 15 秒就可以滿魔再一輪，最糟的情形也不超過 20 秒**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 調的是**回魔**，⛔ 不是耗魔 —— 這是 owner 親自轉的向
 *
 * 上一輪量到「耗魔對玩家完全不構成取捨」，我提議把耗魔拉到 2.7 倍。
 * **owner 否決了那個方向。** 他的做法更好：拉高耗魔會讓**每一支技能的卡面數字**
 * 都變（342 個住處），調回魔只動**一個全域規則**，而玩家感受到的是同一件事
 *（「放完要等」）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 機制：回魔有一條**與魔力池成正比**的地板，⛔ 不是一個新的倍率
 *
 * 量到的現況（Lv18 中位，GH#446）：魔力池 **1,746** · 回魔 **36.6/s**
 * ⇒ 滿魔要 **47.7 秒**，是 owner 要的 15 秒的 **3.2 倍**。
 *
 * 「乘一個 3.2 倍」解不了這題，因為它**對每一位英雄乘出不同的滿魔時間** ——
 * 高智力英雄本來就快，乘完更快；低智力英雄乘完還是慢。而 owner 給的是
 * 一個**時間**上的保證（「不超過 15 秒」），所以規則也要寫在時間上：
 *
 *     每秒回魔 ≥ 魔力池 ÷ refillSeconds
 *
 * ⇒ 每一位英雄從空到滿都**至多** `refillSeconds` 秒，⛔ 與他的智力無關。
 * 出貨 15 秒 ⇒ 中位英雄的地板是 `1746 ÷ 15 = 116/s`（今天 36.6/s）。
 *
 * ⚠️ 它是**地板不是取代**：本來就回得比地板快的英雄一格都不會被動到
 *（`Math.max`）—— 那是刻意的，否則這條規則會**削弱**高智力英雄，
 * 而 owner 要的是「最慢的也不要太慢」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ owner 那三條約束，這一格解掉哪幾條（⛔ 不要宣稱解掉全部）
 *
 * | # | owner 的話 | 出貨 15 秒之下 |
 * |---|---|---|
 * | ① | 單體 Q（卡面 6 秒 ＝ **1.2 實際秒**）永遠不耗光 | ✅ 每 1.2 秒回 140 點，而單體耗魔中位是 **120** |
 * | ③ | 平均 ≤15 秒滿魔 | ✅ **定義上成立**（地板就是這麼寫的） |
 * | ④ | 最糟 ≤20 秒 | ✅ `refillSeconds` 的 Zod 上界就是 **20**，填不進更慢的值 |
 * | ② | 範圍技連續 **8 次**才需要等 | ⚠️ **這一格解不了** —— 那是**耗魔**側的約束（`8 × m_area ≈ 池`），今天中位耗魔 120 ⇒ 放得了 14.5 次 |
 * | ⑤ | 連續四個**大**範圍技能後一定要等 | ⚠️ 同上，要 `m_area(大) ≈ 池 ÷ 4 = 437` |
 *
 * ⇒ ②⑤ 要動的是**每一支技能的 `manaCost`**，而那正是 owner 這一則否決掉的方向。
 * ⛔ 不在這裡偷偷補一個「耗魔倍率」—— 那會讓卡面上的數字與實際扣的魔力不一致。
 *
 * PURITY: 純資料 + 純函式。沒有 `Math.random` / `Date.now` / 三角函式 / `**`，
 * 沒有 Map/Set 迭代。
 */

/** `content/config/mana-economy.json` 的文件 id。 */
export const MANA_ECONOMY_DOC_ID = "mana-economy";

export interface ManaEconomy {
  /**
   * 總開關兼**一鍵 rollback**。false = 回魔完全回到今天的樣子
   *（只有 `Stat.ManaRegen`，滿魔 47.7 秒）。
   */
  enabled: boolean;
  /**
   * 從空到滿**最多**幾秒。地板 = `魔力池 ÷ 這個數`。
   * 出貨 **15**（owner：「平均回魔不超過 15 秒就可以滿魔再一輪」）。
   */
  refillSeconds: number;
  /**
   * 只套在英雄身上。⚠️ 出貨 **true**：殭屍與守衛塔的回魔不該被一條為英雄
   * 節奏設計的地板拉高 —— 那會讓帶魔力的怪物變成另一種東西，而沒有人要求過。
   */
  championsOnly: boolean;
}

/**
 * 出貨值。三個住處：`content/config/mana-economy.json` · 這裡 ·
 * `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_MANA_ECONOMY: ManaEconomy = Object.freeze({
  enabled: true,
  refillSeconds: 15,
  championsOnly: true,
});

/**
 * `refillSeconds` 的上下界。
 * 下界 **1 秒**：一秒回滿等於魔力不存在，那不是平衡而是拆掉一整個資源軸。
 * 上界 **20 秒** —— ⭐ 這個數字是 owner 自己給的（「最糟的情形也不超過 20 秒」），
 * ⛔ 不是一個防手滑的柵欄。填 47.7（今天的值）會被 schema 直接擋下來。
 */
export const REFILL_SECONDS_MIN = 1;
export const REFILL_SECONDS_MAX = 20;

/** 把一份 `config.mana-economy@1` 文件正規化。認不得 → 出貨值。 */
export function manaEconomyFromDoc(doc: unknown): ManaEconomy {
  const d = doc as
    | { schema?: string; enabled?: unknown; refillSeconds?: unknown; championsOnly?: unknown }
    | undefined;
  if (!d || d.schema !== "config.mana-economy@1") return DEFAULT_MANA_ECONOMY;
  const s = d.refillSeconds;
  const refillSeconds =
    typeof s === "number" && Number.isFinite(s)
      ? Math.min(Math.max(s, REFILL_SECONDS_MIN), REFILL_SECONDS_MAX)
      : DEFAULT_MANA_ECONOMY.refillSeconds;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_MANA_ECONOMY.enabled,
    refillSeconds,
    championsOnly:
      typeof d.championsOnly === "boolean"
        ? d.championsOnly
        : DEFAULT_MANA_ECONOMY.championsOnly,
  };
}

/** {@link manaRegenPerSec} 的輸入。⛔ 不傳 world —— 這一支要留在純函式那一側。 */
export interface ManaRegenInput {
  /** `Stat.ManaRegen` 走完屬性管線之後的每秒點數（含 `combatEnv.manaRegen`）。 */
  readonly flatPerSec: number;
  readonly maxMana: number;
  readonly isChampion: boolean;
}

/**
 * 這一 tick 該用的每秒回魔。**地板，不是取代**（見檔頭）。
 *
 * ⛔ 關掉／不是英雄／魔力池是 0 → 原樣返回 `flatPerSec`，
 * 一個 byte 都不動今天的行為。
 */
export function manaRegenPerSec(inp: ManaRegenInput, rules: ManaEconomy): number {
  if (!rules.enabled) return inp.flatPerSec;
  if (rules.championsOnly && !inp.isChampion) return inp.flatPerSec;
  if (!(inp.maxMana > 0) || !(rules.refillSeconds > 0)) return inp.flatPerSec;
  return Math.max(inp.flatPerSec, inp.maxMana / rules.refillSeconds);
}
