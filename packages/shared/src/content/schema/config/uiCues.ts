/**
 * `config.ui-cues@1` —— **「畫面有沒有回話」**那一族的旋鈕（owner 2026-08-23）。
 *
 * 三則逐字裁決落在同一份文件裡，因為它們是**同一個病**的三個部位：
 * 一件事在遊戲裡真的發生了，而畫面上沒有任何東西說出來。
 *
 * > 「**[優先] 施法範圍預覽可以參考 w3x 的白色魔法陣**，今天有出現在我上傳依文世界
 * >  終結的擷圖前幾張還沒施展生效的時候」
 *
 * > 「**[優先] 被動技 觸發作用的時候 還是要閃一下圖示**
 * >  （例如初號機暴走都看不出來有沒有生效冷卻剩多少）」
 *
 * > 「**[優先] 邀請朋友的部分 除了可以等 10 秒、不等了以外，還可以選多等 1 分鐘**」
 *
 * ── ⛔ 為什麼是一份新文件而不是塞進既有的三份 ────────────────────────────────
 * 這三格的**消費端**分別是 `vfx/Telegraph`、`ui/passiveProc`、`ui/platform/store`，
 * 三份既有文件（`range-guide` / `lobby-rally`）各自只涵蓋其中一塊，而把一格塞進
 * 一份語意不含它的文件，下一輪讀的人找不到它 —— 那正是第〇·四守則說的「第二個住處」
 * 的反面：**沒有住處**。⭐ 它們共用的那句話是「**剛剛發生了什麼，畫面要說出來**」。
 *
 * ⚠️ 出貨值選的是 owner 明說的那一邊（第〇·六守則：優先權大的更新**預設啟動**）。
 * 每一格的「關掉」那一條路是 rollback，⛔ 不是觀望 —— 所以測試只做預設那一邊。
 */
import { z } from "zod";

export const UI_CUES_DOC_ID = "ui-cues";

export const zConfigUiCuesDoc = z
  .object({
    id: z.literal(UI_CUES_DOC_ID),
    schema: z.literal("config.ui-cues@1"),
    note: z.string().optional(),
    /**
     * ⭐ **預告圈的填滿畫成「白色魔法陣」**（owner 2026-08-23）。
     *
     * 關掉 = 回到 #228 的通道色填滿（橘／藍／紅跟著外圈走）。
     *
     * ⚠️ **只有填滿那一層變白，外圈永遠是通道色** —— #228 的第 4 條
     * （敵／友／自己一眼分得出來）不可以被這一格吃掉：一個滿地都是白圈的畫面，
     * 「來襲的 AoE」和「我自己剛剛瞄的那一發」會長得一模一樣。
     */
    telegraphRune: z.boolean().describe(
      "@zh 預告圈的填滿畫成白色魔法陣\n" +
      "@note owner 2026-08-23 要的那個 w3x look：吟唱期間腳下那一圈的**填滿**改成白色的魔法陣貼圖。關掉＝回到 #228 的通道色填滿（橘／藍／紅跟著外圈走）。⚠️ 不論開關，**外圈永遠是通道色** —— 這一格動不到「這一發是誰放的」那個資訊。",
    ),
    /**
     * ⭐ **一支 `castType: "ground"` 的技能帶著 `damageLine` 時，地上畫哪一個形狀。**
     *
     * ⚠️ 這一格不是外觀，是**戰鬥正確性**。`ground` 的圓盤
     *（`groundAoeTargets` 的 `def.radius ?? 1`）只**挑人**：它決定 `ctx.targets`，
     * 而 `ctx.targets` 只被 `damageLine` 拿去決定「這條線往哪指」。真正決定
     * 誰挨打的是 `sim/effects/damageLine.ts` 的**膠囊**
     *（`capsule(start, end, width / 2)`）。⇒ 畫圓盤等於告訴玩家「往旁邊跑」
     * 是躲不掉的，而那正好是**唯一躲得掉**的方向（owner 的原始設計逐字：
     * 「一個以受害者為心的圓也會打到站在他**背後**的人，於是『站在他背後』
     * 就不再是答案」）。
     *
     * · `"line"`（出貨）—— 有 `damageLine` 就畫那條膠囊，長寬**逐格取自那個節點**。
     *   沒有 `damageLine` 的 `ground` 技能照舊畫圓盤，⛔ 這一格動不到它們。
     * · `"circle"` —— 一律畫圓盤（#228 落地時的行為）。**這是 rollback**，
     *   ⛔ 不是一個對等的選項：它會畫回一個和判定不一致的形狀。
     */
    telegraphGroundShape: z.enum(["line", "circle"]).describe(
      "@zh 地面技能帶「直線傷害」時，預告畫哪個形狀\n" +
      "@note ⚠️ **這一格不是外觀，是玩家會不會往錯的方向閃。** 7 支地面指定技能（重生之炎、鬼神烈戟、天下無雙…）的傷害判定是一條**膠囊**（`damageLine`），而它們的圓圈只負責**挑人**、決定那條線往哪指 —— 真正挨打的是線上那一條帶。⇒ 畫圓圈等於告訴玩家「往旁邊跑沒有用」，而往旁邊跑正好是唯一躲得掉的方向。`line`（出貨）＝畫真的會打到人的那條膠囊，長寬逐格取自技能自己的資料；`circle`＝一律畫圓圈（#228 落地時的行為）。⭐ `circle` 是 **rollback**，⛔ 不是一個對等的選項：它會畫回一個和判定不一致的形狀。⚠️ 沒有 `damageLine` 的地面技能不受這一格影響，照舊畫圓圈。\n" +
      "@opt line line 膠囊（畫真的會打到人的那條線）\n" +
      "@opt circle circle 圓圈（#228 的舊行為，rollback）",
    ),
    /**
     * 白色魔法陣那一層的不透明度上限。
     *
     * 太低 = 白圈在亮色地板上看不見（等於這一格沒開）；太高 = 它蓋掉腳下的模型，
     * 而玩家真正要判斷的是「我在不在圈裡」。上界 1 是物理上限。
     */
    telegraphRuneAlpha: z.number().min(0).max(1).describe(
      "@zh 白色魔法陣的濃度上限\n" +
      "@note 調低＝白圈在亮色地板上看不見（等於這一格沒開）；調到 1＝它會蓋掉站在圈裡的模型，而玩家真正要判斷的是「我在不在圈裡」。上面那一格關掉時這裡不生效。",
    ),
    /**
     * ⭐ **被動觸發時圖示閃多久**（毫秒）。
     *
     * 下界 80 是「一眼看得到」的下限（低於一個 60fps 的五格）；上界 3000 之後
     * 它就不再是「剛剛發生了」而是一個常駐狀態 —— 那是 #546 的三環在管的事。
     */
    passiveFlashMs: z.number().min(80).max(3000).describe(
      "@zh 被動觸發時圖示閃多久（毫秒）\n" +
      "@note 被動作用的那一下，技能格亮一圈紫框然後淡掉。調太短＝眼睛在看角色的時候會整個錯過；調太長＝它不再讀作「剛剛發生了」而變成一個常駐狀態（那是開關型技能三環在管的事）。",
    ),
    /**
     * ⭐ **同一格最快多久可以再閃一次**（毫秒）。
     *
     * ⚠️ 這一格是承重的，⛔ 不是體感微調：`onDamageTaken` / `onAttack` 這一族
     * 被動一秒可以觸發十次，沒有節流的話圖示會變成閃爍燈，而那比完全不閃更難讀。
     * `0` = 關掉節流（每一次觸發都閃）。
     */
    passiveFlashThrottleMs: z.number().min(0).max(10000).describe(
      "@zh 同一格最快多久可以再閃一次（毫秒）\n" +
      "@note ⚠️ **不要設 0，除非你在除錯。** 挨打時觸發的被動一秒可以發十次，沒有節流的圖示會變成閃爍燈，而一個一直在閃的圖示比完全不閃更難讀 —— 玩家看不出「這一下」。⭐ 被節流吃掉的那一次仍然會更新下面那條冷卻讀數的起點。",
    ),
    /**
     * ⭐ **被動的內部冷卻要畫在圖示上**（owner：「都看不出來有沒有生效**冷卻剩多少**」）。
     *
     * ⚠️ 誠實聲明：這條讀數是**客戶端從觸發那一刻推算**的（`hook.internalCooldown`
     * 是 sim 的記帳，⛔ 從來沒有上過線）。所以它會在 sim 主動重置觸發器
     * （`modifyCooldown{mode:"reset"}`）的那種情況下偏長 —— 與 `ui/cooldownView`
     * 對 CDR 的殘差是同一種、也同樣自我修正（下一次觸發就重新對時）。
     * 關掉 = 只閃不畫冷卻。
     */
    passiveIcdReadout: z.boolean().describe(
      "@zh 在圖示上畫被動的內部冷卻\n" +
      "@note owner 的「冷卻剩多少」那一半：技能格底部一條紫色底條 + 剩餘秒數。⚠️ 它是**客戶端推算的估計值**（見上面的說明），刻意畫得和伺服器送來的冷卻掃描不一樣，免得一個估計值冒充權威值。關掉＝只閃不畫冷卻。",
    ),
    /**
     * ⭐⭐ **三選一面板上顯示「本場已選」**（GH#893）—— owner 2026-09-01 逐字：
     * > 「固有能力三選一**看不到過去選了哪些**」
     *
     * ⭐ 資料本來就在（`SeatState.augments` → `SeatView.augments`）——
     * ⛔ 缺的只是把它畫出來。
     * ⚠️ ⭐ 而它**必須讀伺服器狀態**：客戶端自己記的那一份**重連之後就消失**
     * （失敗形態②：算出來但從沒送到客戶端）。
     * ⭐ 出貨 `true`；關掉 ＝ 回到 2026-09-03 之前。
     */
    draftShowPicked: z.boolean().describe(
      "@zh 三選一面板顯示「本場已選」\n" +
      "@note ⭐ **這是 GH#893 的 rollback 開關**。owner 2026-09-01 逐字：「固有能力三選一**看不到過去選了哪些**」。開著（出貨）＝三選一面板下方列出這一場已經選過的固有能力名稱。⚠️ 它讀的是**伺服器狀態**（`SeatState.augments`），所以**重連之後還在** —— 客戶端自己記的那一份會消失，而重連正是最需要它的時候。關掉＝回到 GH#893 之前，⛔ 只印名字不印圖示與說明（一排卡片會把注意力從「現在要選哪一張」帶走）。",
    ),
    /**
     * ⭐⭐ **三選一面板上顯示「連續屬性強化 N / 20」與歸零警告**（GH#972）——
     * owner 2026-09-02 逐字：
     * > 「隨機能力三選一那邊 **似乎沒有足夠提示 連續20次會有特殊加成**」
     *
     * ⭐ 資料本來就在（`SeatState.statStacks` → `SeatView.statStacks`）——
     * ⛔ 缺的只是把它畫出來，⚠️ 而在此之前三選一那一頁**一個字都沒有**
     * （商店那一行則只活在 `title=` 的滑鼠提示裡，手把／觸控讀不到）。
     *
     * ⭐ 那一段印的每一個數字都從 `config.match@1` 的 `economy` 解析
     * （`statTickTarget` / `capstoneRoundGate`），⛔ 文案裡沒有寫死的 20 或 6。
     *
     * ⭐ 出貨 `true`；關掉 ＝ 回到 2026-09-03 之前（⛔ 機制不變，關的是畫不畫）。
     * ⚠️ **optional 是刻意的**（同 `mouseTwoStageCast`）：舊的後台 override
     * 少這一格⛔不該讓整份被 strict Zod 拒掉。缺席 ＝ **開著**。
     */
    draftShowStatPath: z.boolean().optional().describe(
      "@zh 三選一／商店顯示「連續屬性強化 N / 20」與歸零警告\n" +
      "@note ⭐ **這是 GH#972 的 rollback 開關**。owner 2026-09-02 逐字：「隨機能力三選一那邊 **似乎沒有足夠提示 連續20次會有特殊加成**」。開著（出貨）＝三選一面板下方多一行「連續屬性強化 N / 20 次 · 還差 M 次 · 第 6 回合起才會發放」，而**已經累積了次數**的時候商店多一條紅框警告「買任何一般道具會把已累積的 N 次歸零」。⚠️ 那條警告在此之前只活在屬性面板的**滑鼠提示**裡 —— **手把與觸控沒有 hover**，所以對它們等於不存在，⛔ 而按下購買是不可逆的。⭐ 上面那幾個數字**全部從『對戰設定』的 `economy.statTickTarget` / `economy.capstoneRoundGate` 解析**：改那兩格，畫面上的字跟著變（⛔ 文案裡沒有寫死的 20 或 6）。關掉＝回到 2026-09-03 之前，⛔ 機制本身一個位元都不變（關的是畫不畫）。",
    ),
    /**
     * ⭐ **主揪的「再等一下」有哪幾個選項** —— owner 2026-08-23 說的「多等 1 分鐘」。
     *
     * ⭐ **「有幾個選項」本身就是這一格**：下次要「再加一個 5 秒」＝在這個陣列裡
     * 加一個 `5`，⛔ 不是改程式。標籤**從秒數推導**（`60 → 「多等 1 分鐘」`，
     * `5 → 「多等 5 秒」`），所以這裡⛔ 沒有第二欄 —— 一個算得出來的字串不可以有
     * 第二個住處（第〇·四守則）。
     *
     * 上界 120 = 伺服器的 `rallyWaitMaxSec`（`internal/room/rally.go`）：再長的等待
     * 會被伺服器夾掉，而畫面上寫的秒數就變成謊話。最多 4 列是版面上限
     * （倒數條那一行放得下的按鈕數）。空陣列 = 只剩「不等了」。
     */
    rallyExtendSeconds: z.array(z.number().int().min(1).max(120)).max(4),
    /**
     * ⭐ **陣亡投幣：金幣不足的時候，那顆按鈕長什麼樣。**
     *
     * ⚠️ 這一格**不管「有沒有回饋」** —— 被拒的每一次都會說出原因（`ui/coinThrow`），
     * 那是第一·五守則，⛔ 不是一個選項。這一格只管**要不要先把按鈕變灰**。
     *
     * 為什麼它是一個決策點：出貨經濟保證每個玩家每一場都會撞到 ——
     * `goldDrop.coinValue × goldDrop.coinsPerRound` 遠大於 `config@1 match.startingGold`，
     * 所以一毛不花也只供得起其中一部分投幣次數。
     *
     * · `"always-enabled"`（出貨）—— 按鈕照亮、照可點，⭐ **權威側說了算**：
     *   丟出去、伺服器拒絕、畫面說出「金幣不足」。⭐ 選它的理由是客戶端的
     *   `seat.gold` 是快照投影（有延遲），拿它擋按鈕會在邊界產生
     *   「明明有錢卻按不下去」，而那比「按了會被拒」更難查。
     * · `"grey-when-poor"` —— 客戶端預測金幣不足就把按鈕變灰、不可按。
     *   ⚠️ 鍵盤 **G** 與觸控那顆**仍然送得出去**（sim 才是權威），所以那條路
     *   照樣會拿到那句話 —— 變灰只是提早講。
     */
    coinThrowButtonMode: z.enum(["always-enabled", "grey-when-poor"]).describe(
      "@zh 陣亡投幣：金幣不足時那顆按鈕的樣子\n" +
      "@note ⚠️ **這一格管不到「有沒有回饋」** —— 被拒的每一次都會在畫面上說出原因（金幣不足／次數用完／還活著…），那是修好，⛔ 不是選項。這一格只管**要不要先把按鈕變灰**。`always-enabled`（出貨）＝照亮、照可點，丟出去讓伺服器裁決，被拒時畫面說明原因 —— 選它的理由是客戶端手上的金幣是快照投影（有延遲），拿它擋按鈕會在邊界產生「明明有錢卻按不下去」，而那比「按了被拒」更難查。`grey-when-poor`＝客戶端預測金幣不足就直接變灰、按不下去（rollback 用）。⚠️ 不論選哪一個，鍵盤 **G** 與觸控那顆仍然送得出去（sim 才是權威），所以那條路照樣會拿到那句話 —— 變灰只是提早講。\n" +
      "@opt always-enabled always-enabled 照亮照可點，被拒時說明原因（出貨）\n" +
      "@opt grey-when-poor grey-when-poor 客戶端預測不足就變灰（rollback）",
    ),
    /**
     * GH#639 純滑鼠二段施放的總開關：點技能格＝進瞄準、點場景＝施放、
     * 再點同格/右鍵＝取消。false ＝ 一鍵回到 #639 之前（技能格按下只亮範圍圈，
     * 滑鼠不能從格子直接施放；鍵盤/觸控/手把不受這一格影響）。
     * ⚠️ **optional 是刻意的**：舊的後台 override 少這一格不該整份被 strict Zod 拒。
     */
    mouseTwoStageCast: z.boolean().optional().describe(
      "@zh 純滑鼠二段施放\n" +
      "@note GH#639 owner「純滑鼠操作直接按技能按鈕應該要能二段選擇後施放才對」。開（出貨）＝點技能格進瞄準（地板圈釘住）、點場景施放、再點同格或右鍵取消。關＝一鍵回到 #639 之前：技能格按下只亮範圍圈，滑鼠不能從格子直接施放。⚠️ 只管滑鼠 —— 鍵盤快捷、觸控、手把的施放路完全不受這一格影響。",
    ),
    /**
     * ⭐⭐ GH#731 —— 通訊／表情輪盤。
     *
     * ⚠️ ⭐ **一個機制解 5 格死語音**：`retreat` / `watch` / `love` / `puzzled`
     * 在 `spatialPolicy` 裡全部標著 `dormant: "no-signal"`，⭐ 而它們的理由
     * **是同一句** ——「沒有隊友指令／表情輪」。⇒ 逐格接線是 5 次，做一個輪盤是 1 次
     * （第〇·五守則：⛔ 不要為每一格寫一個 if）。
     *
     * ⭐ **每一格都是資料**（id / 中文 / 語音類別）——
     * ⛔ 沒有一格需要改程式才碰得到。⇒ 想加第六格、換一句語音、改按鍵，全在這裡。
     *
     * ⚠️ **optional 是刻意的**：舊的後台 override 少這一格不該整份被 strict Zod 拒。
     */
    /**
     * ⭐⭐ GH#896 —— 大廳上方那顆 **Store**（模組商店）要不要出現。
     *
     * owner 2026-09-01（逐字）：
     * > 「關閉模組商店(大廳上面可選到的 store)，**這個根本還沒做好不開放**」
     *
     * ⛔ **不刪程式碼** —— 它之後要做完再打開。⇒ 一格開關，⛔ 不是一次刪除。
     *
     * ⚠️ ⭐ 票文自己點出了陷阱：「『關掉入口』與『關掉功能』是兩件事 ——
     * 只藏按鈕而路由還在，知道網址的人照樣進得去」⇒ **兩邊都讀這一格**：
     * 按鈕不畫，⭐ 而且 `lobbyView === "store"` 的那一支也退回大廳
     * （⛔ 否則一份存著 `lobbyView:"store"` 的舊瀏覽器狀態就繞過去了）。
     *
     * ⚠️ **optional 是刻意的**（同下面 `commsWheel`）：舊的後台 override 少這一格
     * ⛔ 不該讓整份被 strict Zod 拒掉。缺席 ＝ 用 `DEFAULT_UI_CUES` 的值。
     */
    lobbyStore: z
      .object({
        /**
         * ⛔ **舊欄位（legacy）**，⚠️ 保留只為了**已經存過的後台 override**。
         *
         * #896 把它做成**整頁**的總開關，而 owner 2026-09-01 指出那是錯的：
         * > 「商店買角色的部分好像被關掉了 **我只要關掉買模組特效的部分**」
         *
         * ⇒ ⭐ 那一頁裝著**兩種商品、兩種貨幣**：英雄用**藍水晶**（靠遊玩賺）、
         * 造型用 **M 幣**（後台發放）。一格開關把兩半一起關掉。
         *
         * ⚠️ 讀的時候一律走 `lobbyStoreOpen()`，⛔ 不要直接讀這一格 ——
         * 它今天的語意是「`false` ⇒ **整頁**關掉（兩半都關）」，
         * ⭐ 而 `true`／缺席 ⇒ 由底下兩格各自決定。
         */
        enabled: z.boolean().optional().describe(
          "@zh 大廳商店：**整頁**總開關（⛔ 舊欄位）\n" +
          "@note ⛔ **不要動這一格** —— 它是 GH#896 的舊形狀，保留只為了**已經存過的 override**（那時候整頁只有一格開關）。⭐ 語意：設成**關** ⇒ 兩半都關（尊重那一次「整頁關掉」的裁決）；**開**或留空 ⇒ 由底下兩格各自決定（⛔ 它不會偷偷把造型打開）。⇒ 要調請用底下那兩格。",
        ),
        /** ⭐ **英雄**那一半（藍水晶）。出貨 **true** —— owner 只要關造型。 */
        champions: z.boolean().optional().describe(
          "@zh 大廳商店：買**英雄**（藍水晶）\n" +
          "@note ⭐ **出貨開著**。owner 2026-09-01 逐字：「商店買角色的部分好像被關掉了 **我只要關掉買模組特效的部分**」——⚠️ #896 那一格是**整頁**的總開關，而那一頁裝著**兩種商品、兩種貨幣**：英雄用**藍水晶**（⭐ 靠遊玩賺得到）、造型用 **M 幣**（後台發放）。⇒ 拆成兩格之後，這一格管的是英雄那一半。⛔ 兩格都關 ＝ 大廳那顆 **Store** 按鈕不畫，⭐ 而且一份存著 `lobbyView:store` 的舊瀏覽器狀態也會退回大廳。",
        ),
        /** ⛔ **造型／模組**那一半（M 幣）。出貨 **false** ——「這個根本還沒做好不開放」。 */
        skins: z.boolean().optional().describe(
          "@zh 大廳商店：買**造型／模組**（M 幣）\n" +
          "@note ⛔ **出貨關著** —— owner：「這個根本還沒做好不開放」。⭐ 關掉＝商店裡每一位英雄底下的造型清單**不畫**，⛔ 而英雄本身照樣買得到。⭐ 這是 GH#911 的 rollback 開關：做完了把它打開，⛔ 程式碼一行都沒刪（資料照樣載，關的是畫不畫）。",
        ),
      })
      .strict()
      .optional(),
    /**
     * ⭐⭐ GH#908 —— **玩家投稿與發現**（大目標的最後一段）。
     *
     * owner 的大目標逐字：「**開放讓玩家自己設計 英雄、技能、特效**」。
     * ⇒ ⭐ 編輯器做得出內容之後，⛔ 而它今天沒有出口。
     *
     * ⚠️ ⭐ **兩格都預設關** —— 這是這個專案第一個**對外開放**的東西：
     * 玩家投稿是**第一個不可信的內容來源**（出貨內容都是我們自己寫的）
     * ⇒ ⛔ 對外開放的東西**不預設開**。
     *
     * ⭐ 兩格分開的理由：`submit` 開而 `discover` 關 ＝ **收得到但還沒公開** ——
     * ⛔ 那正是第一批投稿進來時要的狀態（先累積、先審，⛔ 不是一開就上線）。
     */
    playerContent: z
      .object({
        /** 玩家送得出投稿嗎。⛔ 出貨 false。 */
        submit: z.boolean().describe(
          "@zh 玩家送得出投稿\n" +
          "@note ⭐ **這是 GH#908 的第一格**（大目標的最後一段：讓玩家做完的東西**送得出來**）。⛔ 出貨 **關**——⚠️ 玩家投稿是這個專案**第一個不可信的內容來源**（出貨內容都是我們自己寫的），⭐ 而對外開放的東西⛔不預設開。⭐ 打開＝玩家送得出一份編輯器產出的內容包，而它會先過格式驗證（多餘欄位**說得出名字**）再進審核佇列。",
        ),
        /** 大廳看得到**已核准**的玩家內容嗎。⛔ 出貨 false。 */
        discover: z.boolean().describe(
          "@zh 大廳看得到已核准的玩家內容\n" +
          "@note ⭐ **這是 GH#908 的第二格**。⛔ 出貨 **關**。⭐ 它與上一格**刻意分開**：`送得出來`開而`看得到`關 ＝ **收得到但還沒公開** —— ⛔ 那正是第一批投稿進來時要的狀態（先累積、先審，⛔ 不是一開就上線）。⚠️ ⭐ 而「看得到」的判準有**兩個條件**：核准過、**而且核准當時的內容指紋還等於現在的** —— ⛔ 少了後半句，一個「先送乾淨的、核准後再換掉內容」的投稿就繞過了整條審核，⭐ 而畫面上完全看不出來。",
        ),
      })
      .strict()
      .optional(),
    commsWheel: z
      .object({
        /** 總開關。⛔ 關掉＝一鍵 rollback（輪盤打不開，那 5 格回到啞的）。 */
        enabled: z.boolean().describe(
          "@zh 通訊輪盤（按住叫出、放開送出）\n" +
          "@note ⭐ **這是 GH#731 的 rollback 開關**。開著＝按住一顆鍵叫出一圈訊號，放開就喊出去。⛔ 關掉＝輪盤打不開，而 `retreat`／`watch`／`love`／`puzzled` 那四類語音**回到啞的** —— ⚠️ 它們在此之前從來沒有任何觸發點（`spatialPolicy` 標著 `no-signal`），⭐ 而四格的理由是同一句「沒有表情輪」⇒ 一個輪盤解四格。",
        ),
        /**
         * 按住哪一顆鍵叫出輪盤（`KeyboardEvent.code`）。
         * ⚠️ ⭐ 用 `code` ⛔ 不是 `key`：`key` 會被輸入法與鍵盤配置改寫。
         */
        holdKey: z.string().min(1).max(24).describe(
          "@zh 叫出輪盤的按鍵（KeyboardEvent.code）\n" +
          "@note ⚠️ ⭐ 填的是 `code` ⛔ 不是 `key`：`KeyV` / `KeyZ` / `Backquote` 這種。⭐ 用 `code` 的理由是 `key` 會被輸入法與鍵盤配置改寫（注音下按 V 拿到的 `key` 不是 v）。⛔ 填一個不存在的 code 不會報錯，它只是永遠打不開。",
        ),
        /**
         * 輪盤上的格子。⭐ 順序就是畫在圓上的順序（12 點鐘起、順時針）。
         * ⚠️ 上限 8 格：再多就分不清指向誰（⛔ 這是可用性上界，不是技術上界）。
         */
        entries: z
          .array(
            z
              .object({
                id: z.string().min(1).max(32),
                /** 畫在格子上的字。 */
                zh: z.string().min(1).max(12),
                /**
                 * 播哪一類語音。⚠️ ⭐ 必須是 `contextualVoice` 認得的類別 ——
                 * ⛔ 打錯字會**靜靜地什麼都不播**（`playContextualVoice` 回 false），
                 * 而那正是 GH#734 踩過的形狀。守衛在對這份清單。
                 */
                voiceCategory: z.string().min(1).max(32),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ConfigUiCuesDoc = z.infer<typeof zConfigUiCuesDoc>;

/** 去掉 id/schema/note 的殼之後，程式真正讀的那一份。 */
export type UiCuesDoc = Omit<ConfigUiCuesDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⚠️ 每一格都必須和 `content/config/ui-cues.json` 一字不差，
 * `apps/admin/src/laneConfigDocs.test.ts` 那一族的 drift 守衛在比對。
 */
export const DEFAULT_UI_CUES: UiCuesDoc = {
  // ⭐ GH#896 —— owner：「這個根本還沒做好不開放」。⛔ 預設關。
  // ⭐ GH#911 —— 拆成兩半：英雄**開**（藍水晶靠遊玩賺，owner 要保留）、造型**關**。
  lobbyStore: { champions: true, skins: false },
  // ⭐ GH#908 —— 對外開放的東西⛔不預設開。
  playerContent: { submit: false, discover: false },
  telegraphRune: true,
  // ⭐ 預設就是「畫真的會打到人的那個形狀」（第〇·六守則：優先權大的更新預設啟動）。
  telegraphGroundShape: "line",
  telegraphRuneAlpha: 0.85,
  passiveFlashMs: 420,
  passiveFlashThrottleMs: 800,
  passiveIcdReadout: true,
  // ⭐ GH#893 —— 出貨開著（owner 要的就是「看得到」）。
  draftShowPicked: true,
  // ⭐ GH#972 —— 同一個理由：owner 抱怨的正是「沒有足夠提示」。出貨開著。
  draftShowStatPath: true,
  rallyExtendSeconds: [60],
  // ⭐ 權威側說了算（第〇·六守則：優先權大的更新預設啟動）。變灰那一條是 rollback。
  coinThrowButtonMode: "always-enabled",
  // GH#639 純滑鼠二段施放（第〇·六守則：優先權大的更新預設啟動）。false = rollback。
  mouseTwoStageCast: true,
  // ⭐ GH#731 通訊輪盤 —— 5 格死語音的唯一出口（第〇·六守則：預設啟動）。
  commsWheel: {
    enabled: true,
    holdKey: "KeyV",
    entries: [
      { id: "retreat", zh: "撤退！", voiceCategory: "retreat" },
      { id: "watch", zh: "小心！", voiceCategory: "watch" },
      { id: "love", zh: "幹得好", voiceCategory: "love" },
      { id: "puzzled", zh: "？？？", voiceCategory: "puzzled" },
      { id: "hum", zh: "哼歌", voiceCategory: "hum" },
    ],
  },
};

/**
 * 文件 → 值。缺席／壞掉一律回退到出貨預設。
 *
 * ⛔ 這裡**沒有**「載不到就把提示關掉」那個選項：一份載不到的內容文件是
 * 2026-08-01 骨架事故那一條路，而在那條路上把提示靜靜關掉，會讓「內容全毀」
 * 長得跟「owner 昨天關掉了提示」一模一樣 —— 兩個都不會有人看見。
 */
export function resolveUiCues(doc: ConfigUiCuesDoc | null | undefined): UiCuesDoc {
  if (!doc) return DEFAULT_UI_CUES;
  return {
    telegraphRune: doc.telegraphRune,
    telegraphGroundShape: doc.telegraphGroundShape,
    telegraphRuneAlpha: doc.telegraphRuneAlpha,
    passiveFlashMs: doc.passiveFlashMs,
    passiveFlashThrottleMs: doc.passiveFlashThrottleMs,
    passiveIcdReadout: doc.passiveIcdReadout,
    draftShowPicked: doc.draftShowPicked,
    // ⭐ 缺席 ＝ **開著**（GH#972）——⛔ 一份還沒重新 build 的舊 bundle
    //   不該把 owner 剛要的提示靜靜關掉（那與「還沒做」長得一模一樣）。
    draftShowStatPath: doc.draftShowStatPath ?? true,
    rallyExtendSeconds: [...doc.rallyExtendSeconds],
    coinThrowButtonMode: doc.coinThrowButtonMode,
    mouseTwoStageCast: doc.mouseTwoStageCast ?? true,
    // ⭐ GH#1052 —— 在此之前這三個區塊**沒有被抄進回傳值**：`uiCues().commsWheel` 永遠 undefined
    //   ⇒ 輪盤落到 `commsWheelRunner` 的 FALLBACK `enabled:false`，V 鍵永遠沒反應；
    //   `lobbyStore`（owner 關商店的 override）與 `playerContent` 同形（失敗形態②：算出來了但從沒送到）。
    //   缺席 ＝ 出貨預設（同 `mouseTwoStageCast`：舊 override 少這一格⛔不該把功能靜靜關掉）。
    //   守衛 `uiCues.test.ts`：`DEFAULT_UI_CUES` 有的鍵一個都不准掉，⛔ 不寫死這三個名字。
    lobbyStore: doc.lobbyStore ?? DEFAULT_UI_CUES.lobbyStore,
    playerContent: doc.playerContent ?? DEFAULT_UI_CUES.playerContent,
    commsWheel: doc.commsWheel ?? DEFAULT_UI_CUES.commsWheel,
  };
}

/**
 * 秒數 → 主揪按鈕上的那一句話。⭐ **推導，⛔ 不是第二欄。**
 *
 * 60 的倍數講「分鐘」，其餘講「秒」—— owner 說的正是「多等 **1 分鐘**」，
 * 而一個寫著「多等 60 秒」的按鈕已經是在用另一種說法回答他。
 */
export function rallyExtendLabel(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `多等 ${seconds / 60} 分鐘`;
  return `多等 ${seconds} 秒`;
}

/**
 * ⭐⭐ 大廳商店的**兩半**各自開不開（GH#911）—— ⛔ 這是唯一的讀法。
 *
 * ── ⚠️ 為什麼一定要走同一支函式 ────────────────────────────────────────────
 * #896 刻意做了**兩個讀端**（大廳的按鈕 ＋ `lobbyView === "store"` 的 body）——
 * ⛔ 少擋一邊就會留下「按鈕在但點進去是空的」或「按鈕沒了但舊瀏覽器狀態進得去」。
 * ⇒ ⭐ 兩個讀端問同一支函式，⛔ 不是各自寫一次條件（那是第〇·四守則的第二個住處）。
 *
 * ── ⭐ legacy `enabled` 的語意 ─────────────────────────────────────────────
 * 已經存過的後台 override 只有 `{ enabled: false }`（#896 的形狀）。
 * ⇒ `enabled === false` **兩半都關**（尊重那一次的裁決：整頁關掉）。
 * ⛔ 而 `enabled === true` 不強制打開造型 —— 它只表示「整頁沒有被關」，
 *   兩半仍然各自看自己那一格（⭐ 否則一份舊的 `{enabled:true}` 會把造型偷偷打開）。
 */
export function lobbyStoreOpen(doc: Pick<UiCuesDoc, "lobbyStore">): {
  champions: boolean;
  skins: boolean;
  /** ⭐ 按鈕與路由用這一格：任一半開著，那一頁就進得去。 */
  page: boolean;
} {
  const s = doc.lobbyStore;
  if (s?.enabled === false) return { champions: false, skins: false, page: false };
  const champions = s?.champions ?? DEFAULT_UI_CUES.lobbyStore?.champions ?? false;
  const skins = s?.skins ?? DEFAULT_UI_CUES.lobbyStore?.skins ?? false;
  return { champions, skins, page: champions || skins };
}
