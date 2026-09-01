import { z } from "zod";
import { zId } from "../common";
// 手把自動瞄準的小怪讓路幅度（GH#315）—— 同一條規矩：上下界定在 sim，schema 只搬上 Zod。
import { AIM_ASSIST_MOB_PENALTY_MAX, AIM_ASSIST_MOB_PENALTY_MIN } from "../../../sim/combatFeel";

/**
 * config.combat-feel@1 — 戰鬥手感 (`config/combat-feel.json`, GH#193):
 * 擊退法則的三個參數 + 打就站定的開關與門檻。語意與出貨預設見 sim/combatFeel.ts。
 *
 * ⚠️ 為什麼又是一份自己的文件(現在 config 底下已經有四份「調參」文件):
 *   · combat-env  每格是**倍率**(1.0 = 不變)
 *   · base-bonus  每格是**加數**(0 = 沒有贈禮)
 *   · stat-caps   每格是一對**天花板**
 *   · combat-feel 每格是一條**規則的參數**(比例門檻 / 身位數 / 布林開關)
 * 混在一起的話,操作者沒有任何線索分辨他填的 0.05 是「打五折」「+0.05 點」
 * 「上限 0.05」還是「5% 的門檻」。
 *
 * **缺文件 = 出貨預設**(擊退 0.05/10/1.0、站定全開),不是空表。
 */
export const zConfigCombatFeelDoc = z
  .object({
    id: zId,
    schema: z.literal("config.combat-feel@1"),
    knockback: z
      .object({
        /** 傷害 / 受傷單位最大生命 低於此比例 → 完全不擊退 */
        minPct: z.number().min(0).max(1),
        /** 一擊打掉 100% 生命時的擊退身位數 */
        maxBodies: z.number().min(0).max(100),
        /** 一個身位 = 多少 GGD 單位 */
        bodyUnit: z.number().min(0).max(100),
        /**
         * 決策點:技能授權的位移(擊退/擊飛/衝刺)遇上傷害驅動的擊退時誰贏。
         * ABSENT = 出貨預設 true(技能贏)。false = 傷害無條件蓋掉 —— 那是這條
         * 缺陷被修之前的行為,而它讓每一支「又打又推」的技能的擊退全滅。
         * 完整理由見 `sim/combatFeel.ts` 的 `damageShoveWins`。
         */
        authoredWins: z.boolean().optional(),
        /**
         * 決策點(只在 `authoredWins` 開著時有意義):傷害驅動的擊退推得更遠時
         * 要不要接管。ABSENT = 出貨預設 false。
         * ⚠️ true 那一側會讓拉近系(`from: "pull"`)的技能在傷害夠大時把目標
         * 往反方向推出去。
         */
        longerDamageWins: z.boolean().optional(),
        /**
         * ⭐ 擊飛四檔落點(GH#301-1)的兩段長度 + 「到底部」指哪個邊緣。
         * 語意與出貨預設(3 / 12 / true)全部寫在 `sim/combatFeel.ts` 的
         * `KnockbackRules`。ABSENT = 出貨預設。
         *
         * ⛔ 它們**不可以**是 `effects/knockback.ts` 裡的常數:四檔是列舉(作者
         * 選哪一檔),但一檔多遠是操作者每週會改的數字(第一守則)。
         */
        launchShortUnits: z.number().min(0).max(100).optional(),
        launchLongUnits: z.number().min(0).max(100).optional(),
        launchEdgeUsesFireRing: z.boolean().optional(),
      })
      .strict()
      .optional(),
    standstill: z
      .object({
        /** 總開關;false = 維持舊行為(邊走邊打) */
        enabled: z.boolean(),
        /** 「有在動」與「正在靠近」共用的速度門檻 (units/sec) */
        walkEps: z.number().min(0).max(100),
        /** 小怪(含殭屍王)是否同樣受約束 */
        applyToMobs: z.boolean(),
        /**
         * ⭐ GH#755 / GH#801 —— 語意、出處與出貨預設全部寫在 `sim/combatFeel.ts`
         * 的 `StandstillRules`（⛔ 這裡不重講一次，第〇·四守則）。
         *
         * ⚠️ 三格一律 `.optional()`：ABSENT ⇒ `DEFAULT_STANDSTILL`，⛔ 不是
         * `0` / `false`。一份這三格出現之前的舊文件應該拿到**現在出貨的行為**，
         * 而不是被靜默地退回一個沒有人選過的組合。
         *
         * ⚠️ 上界不只有下界（第一守則）：`stillEps` 到 100（＝把整條規則關掉的
         * 極端），`closingRatio` 硬性 [0,1] —— 徑向分量不可能大於速度，>1 是
         * 一個**永遠為真**的門檻，而它不會有任何錯誤訊息。
         */
        stillEps: z.number().min(0).max(100).optional(),
        closingRatio: z.number().min(0).max(1).optional(),
        legacyAbsoluteClosing: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /**
     * 玩家**自己點名**的攻擊目標，對上系統的自動索敵 (GH#266)。語意、量到的數字
     * 與出貨預設全部寫在 `sim/combatFeel.ts` 的 `ManualOrderRules`。
     *
     * ⚠️ 為什麼是欄位不是一行修正：#274 的「地面指令取代攻擊指令」在**滑鼠**上
     * 是對的（WC3 / LoL 都這樣），右鍵一次點擊只送一條指令。壞掉的是把同一條規則
     * 套到**連續轉向**上 —— 搖桿每一拍都送一條 `move`，那不是「我要取消攻擊」而是
     * 「我正在走路」，於是手選目標的壽命是 1 tick（33 ms）。sim 分不出這兩者，
     * 所以選擇權交給 owner。
     *
     * ABSENT ⇒ `DEFAULT_MANUAL_ORDER`（撐得過移動指令、不限制牽引距離）——
     * 也就是 owner 2026-08-03 明說的那一側，**不是**今天的行為。
     */
    manualOrder: z
      .object({
        /**
         * true（出貨）= 玩家點名的那一隻撐得過一條移動指令：走位照走，打的還是
         * 他指的那一個。false = #274 的原行為（右鍵地面取消攻擊指令）。
         * 只管 `kind:"move"`；A 移動（attackMove）兩側都一律取代手選目標。
         */
        survivesGroundMove: z.boolean(),
        /**
         * 手選目標的**牽引距離**（單位）；`0`（出貨）= 不限制，對應 owner 的
         * 「永遠」。競技場半徑 24，所以 24 以上實務上等同不限制；上界 200 純粹
         * 是擋「24 打成 2400」那種手滑 —— 一個荒謬的牽引距離不會有任何錯誤訊息，
         * 只會讓這一格看起來沒作用（#277 的形狀）。
         */
        leashUnits: z.number().min(0).max(200),
        /**
         * ⭐ 打帶跑 (GH#637)：玩家**點地板**之後，自動索敵冷卻幾秒（owner
         * 2026-08-24:「要有1秒冷卻不能跑去打任何目標」）。窗口內不索新目標、
         * 「誰在打我」的反擊接管不生效、已握的**自動**目標當場放下；手選目標、
         * 嘲弄、前搖中的那一刀都不受影響。⚠️ 只有**離散的點擊**會武裝它，
         * 搖桿每拍一條的流不會（否則推搖桿＝永久關掉自動攻擊，#274 的災難）。
         * `0` = 機制關閉（#637 之前的行為）；上界 10 秒：再長等於「點一下地板
         * 就把自動攻擊關掉一輩子」，一個看起來像壞掉的值。
         */
        moveOrderNoAggroSec: z.number().min(0).max(10),
        /**
         * ⭐ owner 2026-08-24（GH#637 追加，逐字）：
         * > 「如果我按了某個地板移動過去**到目的地前** 我是不會被其他東西所吸引
         * >  除非嘲諷技能等 **就算敵人打我 我也不會被拉走** 直到 我走到目的地」
         *
         * true（出貨）＝窗口**一路撐到抵達**（`nav.order` 是 move 的整段），
         * ⛔ 不是 `moveOrderNoAggroSec` 那個固定秒數。false ＝ 回到固定秒數
         * （GH#637 第一版的行為，一鍵 rollback）。
         *
         * ⚠️ **走位空轉的時候仍然放手**（`walkIsStalled`：連續 stallTicks 個 tick
         * 有指令卻沒真的走出去）—— 點在柱子中心那種永遠到不了的終點，如果不放手，
         * 自動攻擊會被關掉**整個回合**，那正是 #274 修掉的災難。
         * ⭐ 判準是**行為**（身體有沒有真的在前進），⛔ 不是又一個秒數。
         */
        moveOrderNoAggroUntilArrival: z.boolean(),
        /**
         * ⭐⭐ **指令模型**（owner 2026-08-24 逐字）：
         * > 「這個操作要請你**完整拆解 LOL 的英雄控制指令與移動、攻擊、反擊邏輯**，
         * >  現在玩 LOL 人數最多，**最容易被接受**」
         *
         * **true（出貨）＝ LoL 模型** —— 英雄的**每一次攻擊都是玩家下的**：
         *   · 右鍵地板 = 走過去，⛔ 路上不打任何人、被打也不反擊
         *   · 右鍵敵人 = 追著打他，直到他死／脫離牽引／新指令
         *   · A + 點地板（attackMove）= 走過去**並打路上遇到的**
         *   · H（hold）= 原地不動，只打射程內的
         *   · S（stop）= 停手；⭐ 站著不動**不會**自己找架打
         *
         * **false ＝ 輔助模型** —— 這一版之前的 GGD 行為：站著不動會自動索敵、被打會自動
         * 反擊、走位卡住會自動接敵（`autoEngage` 那一族）。⭐ 一鍵 rollback。
         *
         * ⚠️ **只管真人座位**（走 GH#577 的 `MobRules.humanSeats` 同一扇門）——
         * bot 靠自己的 AI 打架，把它們一起關掉等於整場沒有人動手。
         * ⚠️ 玩家**自己點名**的目標、嘲弄的強制目標、attackMove/hold 在兩個模型下
         * 逐位元相同 —— 差別只有「沒有下令的時候會不會自己出手」。
         */
        lolControlModel: z.boolean(),
        /**
         * ⭐【idle N 秒 ⇒ 恢復自動索敵】owner 2026-08-28（逐字）：
         * 「我說過如果沒有任何指令，停頓一段時間（**N秒後台可設定**）就會自動索敵攻擊」
         *
         * LoL 模型的補丁：有指令 ⇒ LoL 語意一格不動；**放著不管 N 秒**
         * （任何指令／成功施法都讓計時器歸零）⇒ 自動索敵接手，半徑用
         * `autoEngage.seekRadius`。**0 ＝ 關**（純 LoL，2026-08-28 之前的行為
         * ＝ 一鍵 rollback）。只作用在 `lolControlModel: true` 的真人座位。
         * 出貨 **1 秒**（owner 2026-08-28 指定）。
         */
        idleAutoEngageSec: z.number().min(0).max(60).optional(),
        /**
         * ⭐ **後搖取消**（GH#652 細節①，owner 2026-08-24「do it」）。
         *
         * LoL：結算**之後**的後搖任何一條新指令都砍得掉，⭐ 而那一發照樣算數；
         * ⛔ **前搖**不變（走開仍然作廢那次攻擊）。
         * ⚠️ 量到的：GGD 的**普攻本來就沒有後搖**（傷害點那一 tick 就自由），
         * 所以這一格管的是 sim 裡唯一真的存在的後搖 —— 技能**揮空**時武裝的
         * `ab.recovery`（出貨 0.6 s，擋住「再放一招／普攻」）。
         *
         * true（出貨）＝ 真人座位一下指令就結束後搖（走位＋出手同 tick 放行）。
         * false ＝ DOTA 式完整揮空懲罰（GH#652 之前的行為，一鍵 rollback）。
         * ⚠️ 它**抬高有效輸出上限**（揮空成本 0.6 s → 0），所以它是開關不是修正。
         * ⚠️ 只管真人座位（`humanSeats`）—— bot 每 tick 下指令，一起放行等於
         * 把揮空懲罰整個從 AI 身上拿掉。語意與出貨值見 `sim/combatFeel.ts`。
         */
        recoveryCancelOnOrder: z.boolean().optional(),
        /**
         * ⭐ **A 移動打離指令點最近的**（GH#652 細節②）。
         *
         * LoL 的 attack-move 打**離游標最近**的，⛔ 不是離角色最近、⛔ 也不是
         * 英雄優先。GGD 的共用排序（英雄→召喚→小怪）是替**自動索敵**寫的：
         * 玩家沒指任何地方，只好用「誰比較重要」代替「他想打誰」。A 有指令點，
         * 那個代替品就不需要了。
         *
         * true（出貨）＝ `attackMove` 只比「離指令點多遠」（嘲弄仍然贏過一切）。
         * false ＝ 回到共用排序，一鍵 rollback。
         * ⚠️ 索敵**半徑**仍然量身體到候選人（⛔ 否則 A 點在場外會索到整張地圖），
         * 換掉的只有**比較鍵**；⛔ 自動索敵／bot／小怪 aggro 一個 tick 都沒變。
         */
        attackMoveNearestToCursor: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /**
     * 手把／觸控的**自動**瞄準：一堆殭屍擋在敵方英雄前面時該鎖誰（GH#315）。
     *
     * ⚠️ 這是 2026-08-11 那個 T0 的另一半。修好「殭屍點得到」之後，同一份可點選
     * 清單也餵給 `pickNearestUnit` —— 少了這個懲罰，貼臉的殭屍會把瞄準從敵方
     * 英雄身上搶走，那是把一個缺陷換成另一個。
     *
     * ⛔ **只有自動索敵讀它。** 滑鼠直接點刻意不讀 —— 點到誰就是誰。
     * 語意與出貨預設寫在 `sim/combatFeel.ts` 的 `AimAssistRules`。
     */
    aimAssist: z
      .object({
        /**
         * 小怪被扣的「等效距離」（單位）。出貨 **6** =「殭屍要比英雄近 6 個單位
         * 以上才搶得走瞄準」。0 = 不讓路（＝GH#315 修好之前那個被殭屍海淹沒的
         * 行為）。上界 24 = 決鬥區半徑，再高等於「小怪永遠不會被自動瞄準」。
         */
        mobPenalty: z
          .number()
          .min(AIM_ASSIST_MOB_PENALTY_MIN)
          .max(AIM_ASSIST_MOB_PENALTY_MAX),
      })
      .strict()
      .optional(),
    /**
     * 面向鎖的窗口長度 (#264 / #275 / #280)。語意與出貨預設見
     * `sim/combatFeel.ts` 的 `FacingRules`。
     *
     * ⚠️ 這裡**沒有** `aimHoldTicks`,那是刻意的 —— 見 `sim/aimHold.ts` 檔頭:
     * 客戶端預測沒有任何 config 通道,把瞄準沿用窗口做成可調會讓預測與權威用
     * 不同的窗口,自己的角色面向會和伺服器長期不同意。
     */
    /**
     * ⭐ 預測影子的**扣留**旗標 (GH#370)。語意、量到的數字（影子最大領先
     * 2.14 單位 / 66 次 reconcile）與出貨預設全部寫在 `sim/predictionHold.ts`。
     *
     * ⚠️ 它修的是「放完技能之後原地小步來回」——⛔ 那**不是** sim 的問題
     * （伺服器座標 180 tick 反轉 0 次），是客戶端影子看不到施法鎖。
     * ABSENT ⇒ `DEFAULT_PREDICTION_HOLD`（六顆全開）。
     */
    predictionHold: z
      .object({
        /** 止血閥；false = 回到這條缺陷被修之前的行為。 */
        enabled: z.boolean(),
        flags: z
          .object({
            /** 施法鎖 —— 隕石擊那 26 個 tick 就是這一顆 */
            casting: z.boolean(),
            /** 引導 */
            channelling: z.boolean(),
            /** 位移中（leap / dash），路徑由伺服器算 */
            dashing: z.boolean(),
            /** 滯空（擊飛），落點由伺服器算 */
            airborne: z.boolean(),
            /** 定身：能轉身能出手但不能移動 */
            rooted: z.boolean(),
            /** 暈眩 */
            stunned: z.boolean(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * ⭐ 命中定格（hitstop）要不要連**腳步**一起按住 —— owner 2026-08-23
     * 「被普攻的時候好像會被角色黏住走不了」的那一格。
     *
     * 量到的數字（被八個人圍住、攻速 2：100 tick 裡 **39 tick 完全動不了**，
     * 而身上一筆狀態都沒有）與兩格的完整語意全部在
     * `sim/combat/hitstopHold.ts`。ABSENT ⇒ `DEFAULT_HITSTOP`
     * （挨打者不按、出手者按）。
     */
    hitstop: z
      .object({
        /** 挨打的一方在定格期間走不走得動。false = 出貨（走得動）。 */
        holdsVictimWalk: z.boolean().optional(),
        /** 出手的一方在定格期間走不走得動。true = 出貨（走不動；他本來就得站定）。 */
        holdsAttackerWalk: z.boolean().optional(),
        /**
         * ⭐ 定格**時長**倍率（GH#646）。owner：「hitstop 先設定為0 求順暢為主」
         * —— 出貨 **0**（攻守雙方都零凍結 tick，hitstun 一併歸零）；1 = #133 的
         * 完整定格節拍（一鍵 rollback 就是把這一格調回 1）。乘在衝擊推導值
         * **與內容授權的 `hitFeel.hitstopTicks` 之後**，所以 0 連授權的定格也
         * 一併關掉。ABSENT ⇒ 1（舊行為 —— 沒寫過這一格的舊文件不會突然變順）。
         * ⚠️ 夾限 0..1 與 `normalizeHitstopRules` **逐字相同**（admin 鏡射測試比對）。
         */
        scale: z.number().min(0).max(1).optional(),
        /**
         * ⭐ 黏住累積**保險絲**（owner 2026-08-23：「有一個累積值，黏超過 2秒
         * 一定可以離開之類，這些機制做成後台開關」）。語意、界線（治 hitstop
         * victim-hold + 擊倒的 root 部分，⛔ 不治 stun/施法自鎖 —— 硬控是設計）
         * 與出貨預設全部在 `sim/combat/hitstopHold.ts` 的 `StuckGuardRules`。
         *
         * ⚠️ 夾限 0..10 秒與 `normalizeStuckGuardRules` **逐字相同** ——
         * admin 的鏡射測試逐格比對兩邊的上下界。ABSENT = 出貨預設（開）。
         */
        stuckGuard: z
          .object({
            /** 總開關；false = 保險絲整個不存在。 */
            enabled: z.boolean().optional(),
            /** 累積黏住幾秒就放人（owner 的數字：2）。 */
            thresholdSec: z.number().min(0).max(10).optional(),
            /** 連續自由走滿幾秒，累積歸零重數（0 = 只認連續黏住）。 */
            windowSec: z.number().min(0).max(10).optional(),
            /** 釋放窗長度：這段期間挨打型凍結不按腳（0 = 只累積不放人）。 */
            releaseSec: z.number().min(0).max(10).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    facing: z
      .object({
        /** 出手後的收招餘韻 tick 數 (30 tick = 1 秒) */
        followThroughTicks: z.number().int().min(0).max(300),
        /** 瞬發技的最低鎖定 tick 數 */
        instantCastTicks: z.number().int().min(0).max(300),
      })
      .strict()
      .optional(),
    /**
     * 卡住就接敵 (GH#216)。語意與出貨預設見 `sim/combatFeel.ts` 的
     * `AutoEngageRules` —— 那裡有量到的數字(近戰索敵 6 / 射程 1.6 的四倍落差、
     * 右鍵點進柱子之後 |v| = 0.00 連續 2,240 tick)。
     *
     * ⚠️ `seekRadius` **不是平常的索敵半徑**。把它當成「自動攻擊範圍」調大並不會
     * 讓**走得動**的玩家自動衝過去 —— 那條路徑一格都沒有被動到(見
     * `systems/OrderSystem.ts` 的 `autoEngageActive`)。
     *
     * ⚠️ 它現在有**兩個**入口(2026-07-31):走位卡住(一直都有),以及站著不動
     * (`idleSeeks`,出貨關著)。所以「只在走位卡住時生效」這句話只在
     * `idleSeeks: false` 時才成立 —— 那是出貨值。
     */
    autoEngage: z
      .object({
        /** 總開關;false = 移動指令期間絕不接手(#274 的行為) */
        enabled: z.boolean(),
        /** 連續幾個 tick 走不動才算卡住 (30 tick = 1 秒) */
        stallTicks: z.number().int().min(1).max(600),
        /** 「走不動」的速度門檻 (units/sec),和 standstill.walkEps 同一個量 */
        stallSpeed: z.number().min(0).max(100),
        /** 卡住之後的索敵半徑(單位);bot 的 AI_ENGAGE_RANGE 是 48 */
        seekRadius: z.number().min(0).max(200),
        /**
         * **決策點**(2026-07-31 W4):站著不動的玩家要不要也吃 `seekRadius`。
         *
         * 出貨 `false` = 今天的行為。索敵半徑目前是**不對稱**的 ——「走位卡住」
         * 的人吃 `seekRadius`(48),「完全站著不動」的人只吃近戰地板 6,也就是
         * 卡住比站著更容易索到敵。實測 `autoAcquireWhileMoving.test.ts` 的
         * `[idle]` 情境:整場 2,410 tick 沒有任何敵方英雄靠到 14.95 單位以內,
         * 所以那個座位 0 次索敵、0 次揮擊。
         *
         * `true` = 站著不動的人也吃 `seekRadius`,手感等同全員預設 A 移動:
         * 什麼都不按也會自己走過去打人,代價是玩家放手時方向盤不在他手上。
         * 這是**平衡決策不是缺陷修正**,所以預設留在今天那一側,由 owner 決定。
         *
         * ⚠️ 需要總開關 `enabled` 也開著 —— `enabled: false` 承諾的是「完全回到
         * #274 的行為」,獨立生效會讓那句話變成謊話。
         */
        idleSeeks: z.boolean(),
        /**
         * true(出貨)= 玩家每送出一條新的移動指令,走位權當場還給他。
         * 搖桿/虛擬搖桿每一拍都送一條,所以推著搖桿的人永遠不會被接管;
         * 滑鼠右鍵一次只送一條,點進柱子之後才會觸發接敵。
         * 關掉會回到「上鎖之後不放手」的行為(實測 86.6% 的走位 tick 被搶走)。
         */
        respectLiveSteering: z.boolean(),
        /**
         * true(出貨)= 硬控(定身/昏迷/擊倒/施法鎖/hitstop)的 tick **不算**
         * 走位卡住,計數凍結在原地。
         *
         * 掃出貨內容量到:86 支帶 root/stun 的 `applyStatus`,其中 47 支持續
         * ≥ 1 秒,最長 4 秒 = 120 tick —— 是 `stallTicks` 的四倍。關掉這一格,
         * 一個被定身 1 秒以上的玩家會被判定成「走位卡住」,走位權被追擊搶走,
         * 解控之後角色往反方向跑。
         *
         * ⚠️ 不要用「把 stallTicks 調大到 120」代替它:那會讓真的卡在柱子上的
         * 玩家等四秒才被救。
         */
        ccPausesStall: z.boolean(),
      })
      .strict()
      .optional(),
    /**
     * ⭐ 單位互卡**脫困保險絲**（GH#677, owner 2026-08-24：「黏超過 N秒一定可以
     * 離開之類，這些機制做成後台開關，目前 **N 預設2秒**」）。
     *
     * 判準沿用 `autoEngage` 的 walk-stall 那一族（有 move 指令、還沒到站、
     * 硬控的 tick 不算），位移量的是實際座標差；脫困手段是短暫忽略**單位間**
     * 軟分離（phasing），⛔ 牆 / 柱 / 場界 / 守護者一格都不豁免。語意與出貨
     * 預設全部在 `sim/combatFeel.ts` 的 `StuckEscapeRules` 與 `sim/stuckEscape.ts`。
     *
     * ⚠️ 夾限 0..10 秒與 `normalizeStuckEscapeRules` **逐字相同** ——
     * admin 的鏡射測試逐格比對兩邊的上下界。ABSENT = 出貨預設（開、N=2）。
     */
    stuckEscape: z
      .object({
        /** 總開關；false = 保險絲整個不存在（GH#677 之前的行為）。 */
        enabled: z.boolean().optional(),
        /** 連續互卡幾秒就放行（owner 的數字：2）。 */
        thresholdSec: z.number().min(0).max(10).optional(),
        /** 放行窗長度（秒）：這段期間單位間碰撞不擋他（0 = 只累積不放人）。 */
        releaseSec: z.number().min(0).max(10).optional(),
          /**
           * ⭐⭐ GH#901 —— 「困在**原點附近**」的那個「附近」有多大（世界單位）。
           *
           * owner 2026-09-01（逐字）：
           * > 「⋯一直沒有移動**或只是抖動小移動**困在**原點附近**超過3秒⋯
           * >   目的是不要讓玩家覺得**被黏住了失去操控感**」
           *
           * ⛔ 在此之前判準是「這一 tick 對上一 tick」的位移 ⇒ ⭐ 一個原地**抖動**的
           * 單位每 tick 都動得比門檻多 ⇒ 計數每 tick 歸零 ⇒ ⛔ **它永遠脫不了困**。
           * ⇒ ⭐ 改成從**開始卡住的那一點**量：走出這個半徑才重新開始算。
           *
           * ⛔ **0 = 回到舊行為**（逐 tick 比較）⇒ 一鍵 rollback。
           */
          anchorRadius: z.number().min(0).max(20).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ConfigCombatFeelDoc = z.infer<typeof zConfigCombatFeelDoc>;
