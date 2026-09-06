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
    pctEnabled: z.boolean().describe(
      "@zh 百分比回血\n" +
      "@note 關掉＝英雄卡上填的百分比回血全部當作沒填，所有人只吃固定回血（＝這個機制出現之前）。⚠️ 出貨內容**目前沒有任何一位英雄**填百分比回血（2026-08-02 之前是 Berserker，那一格已經翻成扣血了），所以這一格現在開或關，場上都不會有任何差別 —— 它是留給下一位要用這個機制的英雄的。",
    ),
    /**
     * **決策點**:百分比是**取代**英雄卡那條固定回血,還是**疊加**在上面。
     * `replace` = 出貨值 = owner 的「沒有保底」——「疊加」等於給了一條與最大
     * 生命無關的地板,那正是 owner 要移除的東西。
     */
    pctMode: z.enum(["replace", "add"]).describe(
      "@zh 百分比和固定回血的關係\n" +
      "@note replace＝有填百分比的英雄不再計算固定回血，每秒就是「最大生命 × 百分比」。這就是 owner 說的「沒有保底」：add 模式下那條固定值是一條**與最大生命無關的地板**，血量被打到很低的時候它反而是主力，那正是要移除的東西。\n" +
      "@opt replace replace 百分比取代固定回血（出貨值＝owner 的「沒有保底」）\n" +
      "@opt add add 百分比疊在固定回血上（＝等於保留一條地板）",
    ),
    /**
     * **決策點**:保底,每秒至少回這麼多點。**出貨 0 = 沒有保底**(owner 裁決)。
     * 上界 1000 是誤植守衛:Berserker 一級最大生命約 7.5k,1% 是 75/秒,
     * 所以 1000 已經是「這條地板自己就能撐住一場」。
     */
    floorPerSec: z.number().min(0).max(1000).describe(
      "@zh 保底：每秒至少回幾點\n" +
      "@note 0＝沒有保底（出貨值，owner 的裁決）。它獨立於上面那格：沒填百分比的英雄也吃得到這條地板，所以它是「全場最低回血」而不是「百分比的下限」。上界 1000 是誤植守衛 —— Berserker 一級最大生命約 7,500，1% 是 75/秒，1000 已經是這條地板自己就能撐住一整場。",
    ),
    /** **決策點**:百分比那一項要不要吃 戰鬥系統 的 `healthRegen` 全域倍率。 */
    applyEnvMultiplier: z.boolean().describe(
      "@zh 百分比要不要吃 戰鬥系統 的回血倍率\n" +
      "@note 開（出貨值）＝ 戰鬥系統 那一格的 healthRegen 仍然是「全遊戲回血快慢」的總閥，百分比也跟著動。關＝百分比變成一個不受全域調節影響的角色設定，只有固定回血那條吃倍率。",
    ),
    /**
     * **決策點**:百分比只給英雄(出貨 true)。關掉之後,一隻臉是 Berserker 的
     * 隨機英雄殭屍王也會每秒回 1% 最大生命。
     */
    championsOnly: z.boolean().describe(
      "@zh 百分比回血只給英雄\n" +
      "@note 開（出貨值）＝小怪、殭屍王與召喚物不吃百分比回血。關掉之後，一隻臉是某位有填百分比回血的英雄的殭屍王也會每秒回同樣比例的最大生命 —— 王的血量是英雄的好幾倍，那等於一堵打不動的牆。",
    ),
    /** 百分比**扣血**的總開關(出貨 true)。關 = 英雄卡上的自傷全部當作沒填。 */
    drainEnabled: z.boolean().describe(
      "@zh 百分比扣血（自傷）\n" +
      "@note 關掉＝英雄卡上填的自傷全部當作沒填，海克力斯 - Berserker 從此不再每秒掉血（＝ owner 2026-08-02 那句話出現之前）。線上發現扣血把某位英雄玩壞時，這一格是止血閥，不用改程式也不用重建映像。",
    ),
    /**
     * **決策點**:扣血停在「最大生命的」這個比例。出貨 `0.01` = owner 2026-08-02
     * 的「直到生命不足 1%」。上界 0.5 是誤植守衛 —— 地板高過半條命的話,扣血在
     * 絕大多數局面裡一點事都不會發生。
     * ⚠️ 填 0 也扣不死人:扣血不走傷害管線,沒有人會設 `alive`,所以實作把有效
     * 地板夾在 1 點之上(`regenRules.ts` 的 `MIN_ALIVE_HP`)。
     */
    drainFloorPctOfMax: z.number().min(0).max(0.5).describe(
      "@zh 扣血停在最大生命的幾成\n" +
      "@note 0.01＝出貨值＝ owner 的「直到生命不足 1%」。它是**比例不是點數**：90,000 血的身體停在 900，100 血的身體停在 1。調高＝自傷更早收手（角色更耐打），調低＝可以被自己壓得更低。⚠️ 填 0 也不會扣死人 —— 扣血不走傷害管線，沒有人會判定死亡，停在 0 只會生出一個「0 血還活著」的單位，所以實作把有效地板夾在 1 點之上。",
    ),
    /**
     * **決策點**:打到地板那一刻停手還是夾住 —— 兩者在「同時被敵人打」時完全不同。
     * `stop`(出貨)= 扣血自己不再往下,但也不把血條往上拉,敵人照樣殺得死他
     * (自傷不是無敵,這是 owner 的裁決)。`clamp` = 每 tick 夾在地板 = 免疫致死。
     */
    drainFloorMode: z.enum(["stop", "clamp"]).describe(
      "@zh 碰到地板那一刻做什麼\n" +
      "@note 這兩個只有在「同時被敵人打」的時候看得出差別，而那正是它是一格選單而不是註解的原因。stop（出貨值）＝自傷自己收手，但**不會把血條往上拉**，敵人照樣一刀送他走 —— 這是自傷，不是無敵。clamp＝每 tick 把血條夾在地板上，被打到地板以下的人會被拉回來＝**免疫致死**，一隻殺不死的試煉怪。\n" +
      "@opt stop stop 停手，但敵人照樣殺得死他（出貨值＝owner 的裁決）\n" +
      "@opt clamp clamp 夾在地板上＝免疫致死",
    ),
    /** **決策點**:扣血只給英雄(出貨 true)。關掉之後殭屍王也會自己掉血。 */
    drainChampionsOnly: z.boolean().describe(
      "@zh 扣血只給英雄\n" +
      "@note 開（出貨值）＝小怪、殭屍王與召喚物不吃自傷。關掉之後，一隻臉是 Berserker 的隨機英雄殭屍王會自己每秒掉 1% 最大生命 —— 那等於一堵會自己倒的牆，玩家站著看就贏了。",
    ),
  })
  .strict();
export type ConfigRegenDoc = z.infer<typeof zConfigRegenDoc>;
