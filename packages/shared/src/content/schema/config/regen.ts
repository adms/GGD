import { z } from "zod";
import { zId } from "../common";

/**
 * config.regen@1 — 百分比回血 **與百分比扣血** 規則 (GH#253).
 *
 * 每一格的語意寫在 `packages/shared/src/sim/regenRules.ts`。
 *
 * ⚠️ 兩族欄位都是「英雄卡有填才啟動」:
 *   · 回血族(`pctEnabled` / `pctMode` / `floorPerSec` …)看英雄卡的
 *     `healthRegenPctOfMax` —— **出貨內容目前沒有任何一位填它**,所以這一族
 *     現在對每一場比賽都是 no-op;
 *   · 扣血族(`drain*`)看 `healthDrainPctOfMax` —— 出貨只有海克力斯 - Berserker
 *     (`godie-hapm`,0.01)填了,而 `drainFloorPctOfMax: 0.01` 就是 owner
 *     2026-08-02 的「直到生命不足 1%」。
 *
 * ⚠️ **缺文件 = `DEFAULT_REGEN_RULES`(出貨值)**,不是空表:一個 undefined 的
 * `pctMode` 會讓 `healthRegenPerSec` 兩條分支都不走 = 全場沒有人回血。
 */
export const zConfigRegenDoc = z
  .object({
    id: zId,
    schema: z.literal("config.regen@1"),
    note: z.string().optional(),
    /** 百分比回血的總開關。false = 英雄卡上的百分比全部當作沒填。 */
    pctEnabled: z.boolean(),
    /**
     * **決策點**:百分比是**取代**英雄卡那條固定回血,還是**疊加**在上面。
     * `replace` = 出貨值 = owner 的「沒有保底」——「疊加」等於給了一條與最大
     * 生命無關的地板,那正是 owner 要移除的東西。
     */
    pctMode: z.enum(["replace", "add"]),
    /**
     * **決策點**:保底,每秒至少回這麼多點。**出貨 0 = 沒有保底**(owner 裁決)。
     * 上界 1000 是誤植守衛:Berserker 一級最大生命約 7.5k,1% 是 75/秒,
     * 所以 1000 已經是「這條地板自己就能撐住一場」。
     */
    floorPerSec: z.number().min(0).max(1000),
    /** **決策點**:百分比那一項要不要吃 戰鬥系統 的 `healthRegen` 全域倍率。 */
    applyEnvMultiplier: z.boolean(),
    /**
     * **決策點**:百分比只給英雄(出貨 true)。關掉之後,一隻臉是 Berserker 的
     * 隨機英雄殭屍王也會每秒回 1% 最大生命。
     */
    championsOnly: z.boolean(),
    /** 百分比**扣血**的總開關(出貨 true)。關 = 英雄卡上的自傷全部當作沒填。 */
    drainEnabled: z.boolean(),
    /**
     * **決策點**:扣血停在「最大生命的」這個比例。出貨 `0.01` = owner 2026-08-02
     * 的「直到生命不足 1%」。上界 0.5 是誤植守衛 —— 地板高過半條命的話,扣血在
     * 絕大多數局面裡一點事都不會發生。
     * ⚠️ 填 0 也扣不死人:扣血不走傷害管線,沒有人會設 `alive`,所以實作把有效
     * 地板夾在 1 點之上(`regenRules.ts` 的 `MIN_ALIVE_HP`)。
     */
    drainFloorPctOfMax: z.number().min(0).max(0.5),
    /**
     * **決策點**:打到地板那一刻停手還是夾住 —— 兩者在「同時被敵人打」時完全不同。
     * `stop`(出貨)= 扣血自己不再往下,但也不把血條往上拉,敵人照樣殺得死他
     * (自傷不是無敵,這是 owner 的裁決)。`clamp` = 每 tick 夾在地板 = 免疫致死。
     */
    drainFloorMode: z.enum(["stop", "clamp"]),
    /** **決策點**:扣血只給英雄(出貨 true)。關掉之後殭屍王也會自己掉血。 */
    drainChampionsOnly: z.boolean(),
  })
  .strict();
export type ConfigRegenDoc = z.infer<typeof zConfigRegenDoc>;
