import { z } from "zod";
import { zId } from "../common";
// 魔力經濟（GH#446）—— 回魔的地板。⚠️ 它住 `sim/`（每 tick 都跑的純函式）。
import { DEFAULT_MANA_ECONOMY, MANA_ECONOMY_DOC_ID, REFILL_SECONDS_MAX, REFILL_SECONDS_MIN } from "../../../sim/manaEconomy";

/**
 * config.mana-economy@1 — 回魔的**地板**（GH#446）。
 *
 * owner 2026-08-19：「應該是去**調整回魔**⋯**平均回魔不超過 15 秒就可以滿魔再一輪，
 * 最糟的情形也不超過 20 秒**」。
 *
 * ⭐ **owner 2026-08-20 把它降級了**：「refillSeconds:15 => **時間是建議原則
 * 不是死程式邏輯**，你要**量給我以後給我例外清單判斷**，一樣錨點」
 * ⇒ `refillSeconds` 現在是**建議目標**，要不要真的拉住 `enforceFloor`（出貨 **false**）。
 * 例外清單 = `pnpm mana:audit` → `docs/魔力回復例外清單.md`（LV30/50/99 三個錨點）。
 *
 * ⚠️ 上界 30 秒是**他自己給的數字**（2026-08-19「最糟也不超過 20 秒」→
 * 2026-08-20「**20 秒的限制可以調高到 30 秒**」），
 * ⛔ 不是防手滑的柵欄。語意與量到的後果寫在 `sim/manaEconomy.ts`。
 */
export const zConfigManaEconomyDoc = z
  .object({
    id: zId,
    schema: z.literal("config.mana-economy@1"),
    note: z.string().optional(),
    /** 總開關兼一鍵 rollback。false = 回魔完全回到今天的樣子。 */
    enabled: z
      .boolean()
      .describe("關掉之後這一整條規則不存在（連稽核的語意都沒有）——一鍵 rollback。"),
    /** 從空到滿的**建議**秒數。⚠️ 出貨之下它不改變任何一場比賽（見 enforceFloor）。 */
    refillSeconds: z
      .number()
      .min(REFILL_SECONDS_MIN)
      .max(REFILL_SECONDS_MAX)
      .describe(
        "從空到滿的**建議**秒數（owner 2026-08-20:「時間是建議原則 不是死程式邏輯」）。" +
          "只有兩個讀者:enforceFloor 開著時的地板算式(池 ÷ 這個數),以及 `pnpm mana:audit` 的超標門檻。" +
          `上界 ${REFILL_SECONDS_MAX} 是 owner 自己給的（2026-08-20：「20 秒的限制可以調高到 30 秒」）。`,
      ),
    /** ⭐ 超標時要不要真的拉。出貨 **false**（建議原則，⛔ 不是死程式邏輯）。 */
    enforceFloor: z
      .boolean()
      .describe(
        "超標時要不要**真的**把回魔拉到建議值。出貨 **false** ——" +
          "owner 說那是建議原則,所以預設什麼都不做,只把超標的列進例外清單。" +
          "打開 = 回到 2026-08-19 的硬地板 Math.max(回魔, 池 ÷ 建議秒數)。" +
          "量到的現況(71 隻,裸裝,2026-08-20 調完回魔之後):中位滿魔 LV30 15.8s / LV50 14.1s / LV99 13.2s,\n" +
          "三個錨點各只剩 1 隻超過 30 秒(godie-h02k 熊貓,INT 2/成長 0 ⇒ 智慧軸碰不到他)。",
      ),
    /** 只套在英雄身上（出貨 true）。 */
    championsOnly: z
      .boolean()
      .describe("地板只套在英雄身上。關掉之後帶魔力的殭屍與守衛塔也吃這條——沒有人要求過。"),
  })
  .strict();

export const DEFAULT_MANA_ECONOMY_DOC = {
  id: MANA_ECONOMY_DOC_ID,
  schema: "config.mana-economy@1",
  enabled: DEFAULT_MANA_ECONOMY.enabled,
  refillSeconds: DEFAULT_MANA_ECONOMY.refillSeconds,
  enforceFloor: DEFAULT_MANA_ECONOMY.enforceFloor,
  championsOnly: DEFAULT_MANA_ECONOMY.championsOnly,
} as const;
