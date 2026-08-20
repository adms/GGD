/**
 * 魔力經濟（`config.mana-economy@1`，GH#446）—— 回魔的**建議滿魔時間**。
 *
 * ⛔ ⭐ **2026-08-20：它從「硬地板」降級成「建議原則」。** owner 逐字：
 * > 「refillSeconds:15 => **時間是建議原則 不是死程式邏輯**，
 * >  你要**量給我以後給我例外清單判斷**，一樣錨點」
 *
 * ⇒ 三件事變了，⛔ 三件都不是可以只做一半的：
 *
 * | | 之前 | 現在 |
 * |---|---|---|
 * | `refillSeconds` 的語意 | **保證**（程式硬拉到這個速度） | **建議目標**（一個要被稽核的原則） |
 * | 超標時 | 靜默 `Math.max` 拉上去 | ⭐ **預設什麼都不做**（`enforceFloor: false`） |
 * | 誰知道有幾隻超標 | 沒有人 | `pnpm mana:audit` → `docs/魔力回復例外清單.md` |
 *
 * ⚠️ **出貨預設 `enforceFloor: false` 是刻意的**，理由是 owner 的話本身：
 * 一個「建議原則」如果程式照樣硬拉，那它就是死程式邏輯，只是換了個名字。
 * 開關存在是為了**能回頭**（第〇·六守則），⛔ 不是為了觀望 ——
 * 而這一次高優先權的裁決（建議 > 硬地板）落在 **off** 這一邊。
 *
 * ⚠️ ⇒ 出貨行為 = **沒有任何英雄被地板拉**。⭐ **2026-08-20 改的是回魔本身**
 * （owner：「智慧影響回魔可以增加更多、初始回魔也增加少許，同時 20 秒的限制
 * 可以調高到 30 秒」）—— `combatEnv.intToManaRegen` 0.07 → **0.21**、
 * `base-bonus.manaRegen` 0 → **10**、`REFILL_SECONDS_MAX` 20 → **30**。
 *
 * 量到的（三個錨點，71 隻，裸裝，走出貨管線）：
 *
 * | | 中位滿魔 LV30 / LV50 / LV99 | 超過 30 秒 |
 * |---|---|---|
 * | 調前 | 42.1 / 38.0 / 34.5 秒 | **68 / 66 / 62 隻** |
 * | 調後 | **15.8 / 14.1 / 13.2 秒** | **1 / 1 / 1 隻** |
 *
 * ⭐ owner 的新門檻（30 秒）三個錨點都只剩 1 隻超標；**建議值 15 秒**在 LV50/LV99
 * 達成，LV30 是 15.8 秒（超 5%）—— ⛔ 沒有為了那 5% 再加碼係數。
 * ⚠️ 剩下那一隻是 `godie-h02k` 熊貓，**結構性**的：INT 2、intGrowth 0 ⇒
 * 智慧那根軸碰不到他，只有扁平的 `base-bonus` 動得了他。
 * ⭐ 那張逐隻的表就是 owner 要的「例外清單」，⛔ 不要在這裡替他決定要不要拉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 以下是這條規則**原本**的來歷（`enforceFloor: true` 時仍然逐字適用）：
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
 * | ④ | 最糟 ≤30 秒（owner 2026-08-20 從 20 調高）| ✅ 調後三個錨點各只剩 **1 隻**超標（熊貓，見上） |
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
   * 從空到滿的**建議**秒數（owner 2026-08-20：「時間是**建議原則**不是死程式邏輯」）。
   * 出貨 **15**（owner：「平均回魔不超過 15 秒就可以滿魔再一輪」）。
   *
   * ⚠️ 它**只有兩個讀者**：① `enforceFloor` 開著時的地板算式（`魔力池 ÷ 這個數`）
   * ② `pnpm mana:audit` 的超標門檻。⛔ 預設之下**它不改變任何一場比賽**。
   */
  refillSeconds: number;
  /**
   * ⭐ **超標時要不要真的把回魔拉上去。** 出貨 **false**。
   *
   * `false`（出貨）= `refillSeconds` 純粹是一條**被稽核的建議**，
   * 回魔逐位元等於屬性管線算出來的 `Stat.ManaRegen`。
   * `true` = 回到 2026-08-19 的硬地板（`Math.max(回魔, 池 ÷ refillSeconds)`）。
   *
   * ⚠️ ⛔ 這一格與 `enabled` **不是**同一件事：`enabled: false` 連稽核的語意都關掉；
   * 這一格只決定「知道超標之後動不動手」。
   */
  enforceFloor: boolean;
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
  // ⭐ owner 2026-08-20：「時間是**建議原則** 不是死程式邏輯」⇒ 預設**不拉**。
  enforceFloor: false,
  championsOnly: true,
});

/**
 * `refillSeconds` 的上下界。
 * 下界 **1 秒**：一秒回滿等於魔力不存在，那不是平衡而是拆掉一整個資源軸。
 * 上界 **30 秒** —— ⭐ 這個數字是 owner 自己給的（2026-08-19「最糟的情形也不超過
 * 20 秒」，2026-08-20「20 秒的限制可以調高到 30 秒」），⛔ 不是一個防手滑的柵欄。
 */
export const REFILL_SECONDS_MIN = 1;
/**
 * ⭐ **2026-08-20：20 → 30**（owner 逐字）：
 * > 「那我覺得智慧影響回魔可以增加更多、初始回魔也增加少許，
 * >  同時**20 秒的限制可以調高到 30 秒**」
 *
 * ⚠️ 它有**兩個讀者**，兩個都跟著這一行走，⛔ 沒有第二個 20 住在別處：
 * ① `refillSeconds` 的 Zod 上界 ② `pnpm mana:audit` 的「最糟」門檻。
 * ⛔ 它仍然不是防手滑的柵欄 —— 它是 owner 自己給的那個數字。
 */
export const REFILL_SECONDS_MAX = 30;

/** 把一份 `config.mana-economy@1` 文件正規化。認不得 → 出貨值。 */
export function manaEconomyFromDoc(doc: unknown): ManaEconomy {
  const d = doc as
    | {
        schema?: string;
        enabled?: unknown;
        refillSeconds?: unknown;
        enforceFloor?: unknown;
        championsOnly?: unknown;
      }
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
    enforceFloor:
      typeof d.enforceFloor === "boolean"
        ? d.enforceFloor
        : DEFAULT_MANA_ECONOMY.enforceFloor,
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
 * ⛔ 關掉／**沒開 `enforceFloor`（＝出貨預設）**／不是英雄／魔力池是 0
 * → 原樣返回 `flatPerSec`，一個 byte 都不動屬性管線算出來的回魔。
 */
export function manaRegenPerSec(inp: ManaRegenInput, rules: ManaEconomy): number {
  if (!rules.enabled) return inp.flatPerSec;
  // ⭐ owner 2026-08-20：`refillSeconds` 是**建議原則**。⛔ 沒有這一行，
  //    「建議」就會變回死程式邏輯 —— 而且完全看不出來。
  if (!rules.enforceFloor) return inp.flatPerSec;
  if (rules.championsOnly && !inp.isChampion) return inp.flatPerSec;
  if (!(inp.maxMana > 0) || !(rules.refillSeconds > 0)) return inp.flatPerSec;
  return Math.max(inp.flatPerSec, inp.maxMana / rules.refillSeconds);
}
