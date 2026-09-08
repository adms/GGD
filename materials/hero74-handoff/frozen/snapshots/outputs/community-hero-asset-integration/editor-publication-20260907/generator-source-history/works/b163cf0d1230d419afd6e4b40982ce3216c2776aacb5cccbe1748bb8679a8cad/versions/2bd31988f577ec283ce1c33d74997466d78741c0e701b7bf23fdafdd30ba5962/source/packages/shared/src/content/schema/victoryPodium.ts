/**
 * config.victory-podium@1 —— 回合勝利頒獎台的決策點 (GH#257 / GH#256).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼這些是欄位而不是常數
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE.md 第一守則:「如果我在寫程式時心裡出現『這裡要選 A 還是 B』,
 * 那就是一個決策點,它應該變成編輯器的一個開關。」下面每一格都是那個形狀,
 * 而且每一格的錯誤成本都是「一次完整部署」:
 *
 * | 欄位 | 心裡那個 A/B | 寫死的代價 |
 * |---|---|---|
 * | `podiumSize` | 三位?五位?只有第一名? | owner 明說三位,但 `CAPSTONE_ROUND_GATE = 6` 的前例就是「明說的數字被寫死之後再也改不到」 |
 * | `podiumScope` | 只排勝方三人,還是這一回合上場的所有人? | 3v3 裡兩者常常同解,一旦有人斷線就分岔 |
 * | `podiumFill` | 湊不滿三位時縮短,還是補敗方? | 把戰敗的敵人擺上勝利頒獎台是設計偏好,不是資料問題 |
 * | `roundWinLine` | 嘲諷台詞?名言宣言?兩個都放? | GH#256 問的就是這一題。現行出貨行為是**兩個都放**(名言 t=0 由 `ui/RoundEndVoice`、嘲諷 t=2200ms 由 `render/RoundWinnerStage`),寫死等於把其中一半永久關掉 |
 * | `podiumLayout` | 由左到右照名次排,還是把金冠放正中? | v0.9.27 就是寫死成「照 index 排」,於是三個人時**畫面正中央是第二名**(而第二名依定義已經倒下)—— owner 回報「回合勝利出現的 3d model 是勝利角色 但現在不是」的一半 |
 * | `winnerScale` | 金卡要不要比銀銅大? | 寫死成 1.0 的時候三張卡同尺寸、同 z-order,誰贏了只能靠冠的顏色分辨 |
 * | `clipGold/Silver/Bronze` | 站上台要播哪一個動作? | v0.9.27 三個人一律播 `idle`(`StorePreview` 裡一個硬字串),所以「勝利」看起來和「在商店發呆」一模一樣 |
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 三個落點的現況(2026-08-03 覆核 —— 舊版註解在這裡說過謊)
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一段以前寫著「三個落點一個都還沒接」,其中兩句已經是假的(第三守則):
 *   1. `content/config/victory-podium.json`            ← **存在,而且已進版控**
 *   2. `packages/shared/src/content/schema/config.ts`  ← **`:33` 有 import、
 *      `zConfigDoc` 的 union 裡也有它**
 *   3. `apps/admin/src/configForms.ts` + `store.ts`    ← 仍然**沒有** `victoryPodium` 頁
 *
 * 還缺的只有第 3 項。欄位順序/標籤/分組/說明見最下面的 `VICTORY_PODIUM_FIELDS`;
 * admin 那邊照 `VICTORY_FX_SPEC`(`apps/admin/src/configForms.ts`)複製一份即可。
 *
 * ⚠️ **執行期消費端在 2026-08-03 接上了。** `apps/client/src/render/RoundWinnerStage.ts`
 * 的 `victoryPodiumPolicy()` 去 `Configs` 登錄表讀這份文件並跑 `resolveVictoryPodium`,
 * `planRoundWinnerShow` 的 `cfg` 預設值就是它 —— 也就是說改這份 JSON **現在真的會改變
 * 畫面**。在此之前 `resolveVictoryPodium` 是全 repo 零呼叫端的(失敗形態 ②)。
 */
import { z } from "zod";

/**
 * 頒獎台要排誰。
 *
 *   `winnerTeam` 只排**勝方隊伍**的座位 —— 現行 `roundWinnerTeamChampions` 的
 *                語意,也是「回合勝利畫面」這個名字的字面意思。預設。
 *   `allFought`  排這一回合**上場過的所有座位**(含敗方)。owner 那句
 *                「最後活下來順序的三位」字面上是這個;但一場 3v3 的最後三名
 *                存活者幾乎必然就是勝方三人,所以兩者在正常對局裡同解,
 *                只有勝方有人斷線時才分岔。
 */
export const VICTORY_PODIUM_SCOPES = ["winnerTeam", "allFought"] as const;
export type VictoryPodiumScope = (typeof VICTORY_PODIUM_SCOPES)[number];

/**
 * 排得出來的人數 < `podiumSize` 時怎麼辦。
 *
 *   `shrink`    有幾個就站幾個。預設 —— 一個空的台階讀起來像 bug,
 *               而少一個人的畫面仍然是正確的(#143 的 team 版就是這樣處理的)。
 *   `opponents` 用敗方(或其餘上場座位)裡活最久的補滿。
 */
export const VICTORY_PODIUM_FILLS = ["shrink", "opponents"] as const;
export type VictoryPodiumFill = (typeof VICTORY_PODIUM_FILLS)[number];

/**
 * 回合勝利時第一名要說什麼(GH#256 的另一半)。
 *
 *   `taunt` 只放 #93 既有的嘲諷台詞(`audio/victoryTaunt`)。
 *   `quote` 只放該英雄自己的名言宣言(`audio/nameVoice.playQuote`)。
 *           該英雄沒有名言剪輯時**退回 taunt**,不會變成一片安靜。
 *   `both`  兩個都放:名言在 t=0、嘲諷在 t=2200ms(`ROUND_TAUNT_DELAY_MS`)。
 *           **預設,而且這是現行出貨行為。**
 *
 * ⚠️ 交辦單上寫「名言內容實測 0/119 不存在,預設先維持現行的 taunt」——
 * **那兩句都是假的**(CLAUDE.md 第三守則:註解會說謊,去驗證)。實測:
 *   · `content/assets/audio/voices/quotes/` 有 **114 個 mp3**,
 *     `quotes.json` 有 **114 筆**;
 *   · `apps/client/src/ui/RoundEndVoice.tsx` 早就在 `resolution` 的相位邊緣
 *     呼叫 `playChampionQuote(champ)`,而 `victoryPresentation.test.ts` 的
 *     「sequences the two VO clips」還把 t=0 名言 / t=2200 嘲諷這個順序釘住了。
 * 也就是**現行行為就是 `both`**。把預設設成 `taunt` 不是「維持現狀」,
 * 是把已經在出貨的名言關掉 —— 一個沒有人要求的迴歸。
 */
export const VICTORY_ROUND_WIN_LINES = ["taunt", "quote", "both"] as const;
export type VictoryRoundWinLine = (typeof VICTORY_ROUND_WIN_LINES)[number];

/**
 * `podiumSize` 的上下界。
 *
 * ⚠️ **上界不是裝飾。** `validateField` 在 2026-07-29 之前只檢查 `min`,所以
 * 3 打成 30 會過後台、然後在畫面上開三十個 Babylon engine —— 每一個都是一個
 * WebGL context,而瀏覽器的上限大約是 16 個。8 是「一個 3v3v3v3 的兩隊」,
 * 已經比任何合理用法寬。
 */
export const VICTORY_PODIUM_SIZE_MIN = 1;
export const VICTORY_PODIUM_SIZE_MAX = 8;

/**
 * 三張卡怎麼排在畫面上。
 *
 *   `rank`        由左到右照名次(金在最左)。v0.9.27 寫死的那一種。
 *   `centreFirst` **金冠站正中央、銀在左、銅在右。出貨值。**
 *                 理由是量到的:`rank` 之下三張卡的位置只是 index 的函式,
 *                 所以三個人時螢幕正中央是**第二名** —— 而第二名依定義是
 *                 這一回合倒下的人。玩家的眼睛先看中間,於是「誰贏了」
 *                 讀起來是錯的。
 *   `soloWinner`  只站金冠一位(#143 原始的單人特寫)。最不會誤讀,
 *                 代價是 owner 2026-07-27 明說的「勝利的時候應該秀隊伍三人的模組」
 *                 就沒了 —— 所以它是選項,不是預設。
 */
export const VICTORY_PODIUM_LAYOUTS = ["rank", "centreFirst", "soloWinner"] as const;
export type VictoryPodiumLayout = (typeof VICTORY_PODIUM_LAYOUTS)[number];

/**
 * 站上台的那一刻播哪一個動作剪輯。
 *
 *   `celebrate` 慶祝。`ClipAnimator` 的 `celebrate` 狀態,模糊比對
 *               `celebrate` / `cheer` / `victory` / `dance` —— 體素/方塊人身上
 *               那一支 `cheer`,以及 w3x 匯入模型的 `Stand Victory`。
 *               **沒有這種剪輯的模型會退回 idle 並在 console 警告一次**
 *               (`ClipAnimator.start` 的 warn-once),不是靜默退回。
 *   `idle`      站著。v0.9.27 三個人都播這個 —— 所以勝利看起來和逛商店一樣。
 *   `death`     倒下。給「敗方也上台」(`podiumFill: "opponents"`)那種玩法用的。
 */
export const VICTORY_PODIUM_CLIPS = ["celebrate", "idle", "death"] as const;
export type VictoryPodiumClip = (typeof VICTORY_PODIUM_CLIPS)[number];

/**
 * 頒獎台演**哪一個競技場**的勝方 (GH#265, owner 2026-08-03:
 * 「為什麼我最後活著 勝利的還是顯示別的隊伍」)。
 *
 *   `localSeat`  **出貨值。** 永遠演**你自己英雄站的那一區** —— 即使你按了
 *                #269 的「前往觀戰」跑去看別區,上台的仍然是你打的那一場的勝方。
 *                這是 owner 那句話要的答案。
 *   `spectated`  演**你鏡頭當下正在看的那一區**。觀戰別人時比較不會錯亂
 *                （畫面上在打的和台上領獎的是同一批人），代價是你自己那一場
 *                的結果就不會被演出來。
 *
 * ⚠️ 這是一個**真的二選一**,不是一個數字:一回合有兩個競技場、兩個勝方,而
 * 伺服器逐區都記了勝負(`MatchState.duels[].winner`)。#269 的「前往觀戰」按鈕
 * 讓「你在看別區」是真的會發生的狀態,所以兩個答案都說得通。
 *
 * ⚠️ 它**不改變任何人的實際勝負或分數** —— 只改變你死後 / 觀戰時看到誰在領獎。
 * 純函式 `authoritativeRoundWinner` 一行都沒有被它動到;它決定的是餵給那支函式
 * 的 `zone` 從哪裡來（`RoundWinnerStage` 的 `GameApp` 呼叫端）。
 */
export const VICTORY_PODIUM_ZONE_SOURCES = ["localSeat", "spectated"] as const;
export type VictoryPodiumZoneSource = (typeof VICTORY_PODIUM_ZONE_SOURCES)[number];

/**
 * `winnerScale` 的上下界。
 *
 * ⚠️ 上界不是裝飾(同 `podiumSize`):金卡的寬高是**乘**上去的,1.25 打成 12.5
 * 會讓那張卡撐爆整個視窗、把銀銅完全蓋掉。3.0 已經比任何合理用法寬。
 * 下界 0.5 允許「金卡反而比較小」這種刻意的反差,但不允許 0(整張卡消失)。
 */
export const VICTORY_WINNER_SCALE_MIN = 0.5;
export const VICTORY_WINNER_SCALE_MAX = 3.0;

/**
 * 頒獎台佔著螢幕的秒數上下界。
 *
 * ⚠️ 上界不是裝飾：這一格結束前**進不了商店**，所以把它調到 60 秒就是每一個回合
 * 之間多罰玩家一分鐘，而畫面上只有三個站著不動的模型。15 秒已經比最長的嘲諷剪輯
 * （實測 60 支，最長 6.4 秒）加上開口延遲寬一倍。
 * 下界 0.5 允許「幾乎不停」，但不允許 0 —— 0 會讓頒獎台在同一幀開又關，
 * 三個 WebGL context 建起來就丟掉。
 */
export const VICTORY_ROUND_PRESENT_SEC_MIN = 0.5;
export const VICTORY_ROUND_PRESENT_SEC_MAX = 15;

/**
 * ⭐ 三張卡橫向間距的**倍率**上下界 (GH#545)。
 *
 * 語意：`1` ＝ 三張卡把整個視窗寬度均分（2026-08-22 之前逐字的行為，也就是
 * 「回到舊畫面」的那一格）；`0.5` ＝ 只用一半的節距，三個人往中間靠。
 * 算式住 `RoundWinnerStage.podiumSlotCentrePct`：`pitch = (100 / n) * spacing`。
 *
 * ⚠️ **上界不是裝飾**（同 `podiumSize` / `winnerScale`，#277）：節距是
 * 百分比的乘數，`1.5` 已經讓兩側那兩張卡各自跑到視窗外緣；再大就是「頒獎台上
 * 只看得到中間那一位」，而畫面上不會有任何錯誤訊息。
 * ⚠️ **下界也不是裝飾**：`0` 會讓三張卡**逐像素疊成一張**，於是「三個人站上台」
 * 這件事在螢幕上看起來像「只有一個人贏了」—— 而那正是這一格要修的相反面。
 *
 * ⚠️ 這兩個常數在 `apps/client/src/render/RoundWinnerStage.ts` 有一份同值的
 * `PODIUM_SPACING_MIN/MAX`，那一份是**夾**（clamp），這一份是**拒**（Zod reject）。
 * 兩層都要（CLAUDE.md 第一守則）——⛔ 但它不該是兩份手抄的字面值，
 * 接手的人請讓客戶端那兩個常數改成 `import` 這裡（見 GH#545 的報告）。
 */
export const VICTORY_PODIUM_SPACING_MIN = 0.2;
export const VICTORY_PODIUM_SPACING_MAX = 1.5;

export const zConfigVictoryPodiumDoc = z
  .object({
    id: z.string().min(1),
    schema: z.literal("config.victory-podium@1"),
    note: z.string().optional(),
    /** 站上頒獎台的人數。owner 明說三位。 */
    podiumSize: z
      .number()
      .int()
      .min(VICTORY_PODIUM_SIZE_MIN)
      .max(VICTORY_PODIUM_SIZE_MAX),
    /** 排勝方隊伍,還是這一回合上場過的所有人。 */
    podiumScope: z.enum(VICTORY_PODIUM_SCOPES),
    /** 人數湊不滿 `podiumSize` 時縮短,還是補其餘座位。 */
    podiumFill: z.enum(VICTORY_PODIUM_FILLS),
    /** 第一名說什麼:嘲諷 / 名言 / 兩個都說。 */
    roundWinLine: z.enum(VICTORY_ROUND_WIN_LINES),
    /** 三張卡在畫面上的排法。出貨 `centreFirst`(金在正中)。 */
    podiumLayout: z.enum(VICTORY_PODIUM_LAYOUTS),
    /** 金卡相對其他卡的尺寸倍率。1.0 = 一樣大。 */
    winnerScale: z.number().min(VICTORY_WINNER_SCALE_MIN).max(VICTORY_WINNER_SCALE_MAX),
    /** 金冠那位播哪一個剪輯。 */
    clipGold: z.enum(VICTORY_PODIUM_CLIPS),
    /** 銀冠那位播哪一個剪輯。 */
    clipSilver: z.enum(VICTORY_PODIUM_CLIPS),
    /** 銅冠那位播哪一個剪輯。 */
    clipBronze: z.enum(VICTORY_PODIUM_CLIPS),
    /**
     * 頒獎台看哪一區的勝負 (GH#265)。⚠️ `.optional()` 是刻意的:這份文件已經有
     * 耐久覆蓋層在線上,一份存於這一格之前的 override 少了必填欄會被 Zod 整份
     * 退回 → 內容載入失敗 → fail-open 退回骨架(2026-08-02 事故的形狀)。
     * 缺席 ⇒ `DEFAULT_VICTORY_PODIUM.podiumZoneSource`。
     */
    podiumZoneSource: z.enum(VICTORY_PODIUM_ZONE_SOURCES).optional(),
    /**
     * ⭐ 回合頒獎台「佔著螢幕」幾秒（owner 2026-08-14：「回合勝利 語音還沒播完
     * 就會進商店 語音也被截斷」）。
     *
     * ⚠️ 在這一格出現之前它是 `render/victoryPresentation.ts` 的**寫死常數**
     * `ROUND_PRESENT_MS = 3600`，而嘲諷在 **2200ms** 才開口
     * ⇒ 只有 **1.4 秒**的空檔。實測 60 支剪輯中位 **3.29 秒**
     * ⇒ **59/60（98%）被切在一半**。
     *
     * 缺席 ⇒ `DEFAULT_VICTORY_PODIUM.roundPresentSec`。
     */
    roundPresentSec: z
      .number()
      .min(VICTORY_ROUND_PRESENT_SEC_MIN)
      .max(VICTORY_ROUND_PRESENT_SEC_MAX)
      .optional(),
    /**
     * ⭐ 回合結算成績卡(`ui/panels/RoundVictoryPanel`)一開始是**收合**還是展開
     * (owner 2026-08-22:「回合結算的成績會檔到右邊勝利第三人的3d model
     * 最好做成可以摺疊展開」, GH#528)。
     *
     * ⚠️ 這是一個**決策點**不是一個數字:那張卡停在右上角欄的內側、340 寬,
     * 而頒獎台的**銅牌那一位**(`podiumLayout: "centreFirst"` ⇒ 銀左金中銅右)
     * 的卡片正好站在畫面右側 —— 兩者在 `resolution` 這一個相位同時在畫面上。
     * 出貨值是 `true`(收合),因為那是「不擋到模型」的那一邊;玩家按一下卡頭的
     * 摺疊鈕就展開,而展開狀態每一回合重置回這一格。
     *
     * 缺席 ⇒ `DEFAULT_VICTORY_PODIUM.roundCardCollapsed`(理由同上面兩格:
     * 線上已經有耐久覆蓋層,少了必填欄會讓整份內容被 Zod 退回)。
     */
    roundCardCollapsed: z.boolean().optional(),
    /**
     * ⭐ 三張卡的橫向間距倍率 (GH#545，owner 2026-08-22：頒獎台三個人在寬螢幕上
     * 「散得太開」)。
     *
     * ⚠️ 這一格在落進來之前住 `RoundWinnerStage.PODIUM_SPACING_FALLBACK` ——
     * 一個**客戶端常數**，也就是「改一次間距 = 一次完整部署」（第一守則）。
     * 那個常數現在只剩「內容載不到」那條 fail-open 路會用到。
     *
     * `.optional()` 的理由和上面三格一模一樣：線上已經有存過的耐久覆蓋層，
     * 而那些覆蓋層沒有這個 key —— 設成必填會讓它們整份 `safeParse` 失敗 →
     * 內容載入整棵退回骨架（2026-08-02 事故的形狀）。
     * 缺席 ⇒ `DEFAULT_VICTORY_PODIUM.podiumSpacing`。
     */
    podiumSpacing: z
      .number()
      .min(VICTORY_PODIUM_SPACING_MIN)
      .max(VICTORY_PODIUM_SPACING_MAX)
      .optional(),
  })
  .strict();

export type ConfigVictoryPodiumDoc = z.infer<typeof zConfigVictoryPodiumDoc>;

/** 程式讀的那一份(去掉 id/schema/note 的殼)。 */
export interface VictoryPodiumPolicy {
  podiumSize: number;
  podiumScope: VictoryPodiumScope;
  podiumFill: VictoryPodiumFill;
  roundWinLine: VictoryRoundWinLine;
  podiumLayout: VictoryPodiumLayout;
  winnerScale: number;
  clipGold: VictoryPodiumClip;
  clipSilver: VictoryPodiumClip;
  clipBronze: VictoryPodiumClip;
  podiumZoneSource: VictoryPodiumZoneSource;
  /** 回合頒獎台佔著螢幕幾秒。⚠️ 它**不再**決定嘲諷語音何時被切掉（見下）。 */
  roundPresentSec: number;
  /** 回合結算成績卡一開始收合(true,出貨)還是展開。收合＝不擋到銅牌那位的模型。 */
  roundCardCollapsed: boolean;
  /** 三張卡的橫向間距倍率。1 ＝ 均分整個視窗寬度(舊行為)，越小越靠中間。 */
  podiumSpacing: number;
}

/**
 * 出貨預設。
 *
 * · `podiumSize: 3` —— owner 原話「最後活下來順序的三位」。
 * · `podiumScope: "winnerTeam"` —— 保留 #143 既有語意,不在同一個 PR 裡偷改。
 * · `podiumFill: "shrink"` —— 空台階看起來像 bug;把敗方擺上勝利台是新設計。
 * · `roundWinLine: "both"` —— **現行出貨行為**(名言 t=0 + 嘲諷 t=2200ms)。
 *   GH#256 要的「該角色自己的語音宣言」已經在放了;這一格是把它變成可關的,
 *   不是把它加進去。設成 `taunt` 才是改變行為。
 * · `podiumLayout: "centreFirst"` —— owner 2026-08-03「回合勝利出現的 3d model
 *   是勝利角色 但現在不是」。`rank` 之下正中央是第二名,而玩家先看中間。
 * · `winnerScale: 1.25` —— 金卡明顯大一號 + 疊在上層,誰贏了不必去讀冠的顏色。
 * · `clipGold: "celebrate"` / `clipSilver`、`clipBronze: "idle"` —— 只有第一名
 *   在慶祝。三個人一起慶祝就沒有「誰是第一」這個訊息了。
 */
export const DEFAULT_VICTORY_PODIUM: VictoryPodiumPolicy = {
  podiumSize: 3,
  podiumScope: "winnerTeam",
  podiumFill: "shrink",
  roundWinLine: "both",
  podiumLayout: "centreFirst",
  winnerScale: 1.25,
  clipGold: "celebrate",
  clipSilver: "idle",
  clipBronze: "idle",
  podiumZoneSource: "localSeat",
  // ⚠️ 5.5 而不是原本寫死的 3.6：嘲諷在 2.2 秒開口、剪輯中位 3.29 秒
  // ⇒ 2.2 + 3.29 ≈ 5.5 才蓋得住一半以上的剪輯。
  // ⛔ 但這一格**不是**語音的保命符 —— 語音現在會播完它自己（見
  // `RoundWinnerStage.clear` 的 `cancelVoice`）。這裡只決定畫面停多久。
  roundPresentSec: 5.5,
  // ⭐ 收合(GH#528)。owner 2026-08-22:「回合結算的成績會檔到右邊勝利第三人的
  // 3d model」—— 340 寬的成績卡停在右上角欄內側,銅牌那位的模型卡就站在右邊,
  // 兩者在 `resolution` 同時在畫面上。預設選「不擋到模型」的那一邊
  // (第〇·六守則:優先權大的更新後都是預設啟動)。
  roundCardCollapsed: true,
  // ⭐ GH#545。1 ＝ 三張卡均分整個視窗寬度，也就是 owner 在 16:9 桌機上看到的
  // 「相隔約 3.1 個卡片寬」。0.5 把節距對折，三個人讀起來是**一組**而不是三個
  // 各自站在畫面角落的人。⛔ 這個值以前是 `RoundWinnerStage` 的客戶端常數。
  podiumSpacing: 0.5,
};

/**
 * `content/config/victory-podium.json` 的內容,一字不差。
 * drift 測試(`apps/admin/src/laneConfigDocs.test.ts`)比對的就是它和
 * `DEFAULT_VICTORY_PODIUM`。
 */
export const SHIPPED_VICTORY_PODIUM_JSON: ConfigVictoryPodiumDoc = {
  id: "victory-podium",
  schema: "config.victory-podium@1",
  note:
    "GH#257 回合勝利頒獎台。podiumSize=3 是 owner 原話「最後活下來順序的三位」;" +
    "roundWinLine 預設 both —— 金冠那位先說自己的名言(t=0)、再嘲諷敗方(t=2200ms)," +
    "這就是現行出貨行為。切到 quote 時若該英雄沒有名言語音會自動退回 taunt,不會變成一片安靜。" +
    "podiumLayout=centreFirst 把金冠擺正中央(rank 那種由左到右排法會讓螢幕正中央是第二名);" +
    "winnerScale=1.25 讓金卡大一號並疊在上層;clipGold=celebrate 只有第一名在慶祝。",
  ...DEFAULT_VICTORY_PODIUM,
};

/**
 * 文件 → 政策。缺席 / 壞掉一律回退到出貨預設,理由和 `resolveVictoryFx` 同源:
 * 內容載不到是 2026-08-01 骨架事故那一條路,而在那條路上把頒獎台變成 0 個人
 * 會讓「內容全毀」看起來像「這一回合沒人贏」。
 */
export function resolveVictoryPodium(
  doc: ConfigVictoryPodiumDoc | null | undefined,
): VictoryPodiumPolicy {
  if (!doc) return DEFAULT_VICTORY_PODIUM;
  return {
    podiumSize: doc.podiumSize,
    podiumScope: doc.podiumScope,
    podiumFill: doc.podiumFill,
    roundWinLine: doc.roundWinLine,
    podiumLayout: doc.podiumLayout,
    winnerScale: doc.winnerScale,
    clipGold: doc.clipGold,
    clipSilver: doc.clipSilver,
    clipBronze: doc.clipBronze,
    podiumZoneSource: doc.podiumZoneSource ?? DEFAULT_VICTORY_PODIUM.podiumZoneSource,
    roundPresentSec: doc.roundPresentSec ?? DEFAULT_VICTORY_PODIUM.roundPresentSec,
    roundCardCollapsed: doc.roundCardCollapsed ?? DEFAULT_VICTORY_PODIUM.roundCardCollapsed,
    podiumSpacing: doc.podiumSpacing ?? DEFAULT_VICTORY_PODIUM.podiumSpacing,
  };
}

/**
 * 後台欄位定義 —— 順序 / 標籤 / 分組 / 說明。
 *
 * 說明文字寫「**它影響什麼**」而不是複述欄位名(CLAUDE.md)。
 * integrator 把這個陣列翻成 `apps/admin/src/configForms.ts` 的 `ConfigDocSpec`
 * 就完成第三個落點。
 */
export const VICTORY_PODIUM_FIELDS = [
  {
    key: "podiumSize",
    label: "頒獎台人數",
    group: "頒獎台",
    kind: "int" as const,
    min: VICTORY_PODIUM_SIZE_MIN,
    max: VICTORY_PODIUM_SIZE_MAX,
    help: "回合結束時中央會站幾個 3D 模型。每一個都是一個獨立的 WebGL context,調高會直接吃顯示記憶體。",
  },
  {
    key: "podiumScope",
    label: "排名範圍",
    group: "頒獎台",
    kind: "enum" as const,
    options: VICTORY_PODIUM_SCOPES,
    help: "只排勝方隊伍(winnerTeam),還是這一回合上場過的所有座位(allFought)。勝方有人斷線時兩者才會不同。",
  },
  {
    key: "podiumFill",
    label: "人數不足時",
    group: "頒獎台",
    kind: "enum" as const,
    options: VICTORY_PODIUM_FILLS,
    help: "排得出來的人少於頒獎台人數時:shrink 就少站幾個;opponents 會把敗方裡活最久的補上台。",
  },
  {
    key: "podiumLayout",
    label: "站位",
    group: "頒獎台",
    kind: "enum" as const,
    options: VICTORY_PODIUM_LAYOUTS,
    help: "金冠站哪裡:centreFirst 站正中央(銀左、銅右);rank 由左到右照名次,三個人時螢幕正中央會是第二名;soloWinner 只站第一名一個。",
  },
  {
    key: "winnerScale",
    label: "金卡放大倍率",
    group: "頒獎台",
    kind: "number" as const,
    min: VICTORY_WINNER_SCALE_MIN,
    max: VICTORY_WINNER_SCALE_MAX,
    help: "第一名那張卡相對其他卡的尺寸倍率,同時決定它疊在上層。1.0 = 三張一樣大(誰贏了只能靠皇冠顏色分辨)。",
  },
  {
    key: "clipGold",
    label: "第一名的動作",
    group: "動作",
    kind: "enum" as const,
    options: VICTORY_PODIUM_CLIPS,
    help: "金冠那位站上台時播哪一個剪輯。celebrate 會找模型自己的 cheer / Stand Victory;沒有的模型退回站姿並在 console 警告一次。",
  },
  {
    key: "clipSilver",
    label: "第二名的動作",
    group: "動作",
    kind: "enum" as const,
    options: VICTORY_PODIUM_CLIPS,
    help: "銀冠那位播哪一個剪輯。三個人都設成 celebrate 的話,「誰是第一」這個訊息就從畫面上消失了。",
  },
  {
    key: "clipBronze",
    label: "第三名的動作",
    group: "動作",
    kind: "enum" as const,
    options: VICTORY_PODIUM_CLIPS,
    help: "銅冠那位播哪一個剪輯。把敗方補上台(人數不足時＝opponents)的玩法可以設 death,讓他們倒在台上。",
  },
  {
    key: "roundWinLine",
    label: "第一名的台詞",
    group: "語音",
    kind: "enum" as const,
    options: VICTORY_ROUND_WIN_LINES,
    help: "回合勝利時金冠那位說什麼:taunt 嘲諷敗方 / quote 自己的名言宣言 / both 兩個都說。該英雄沒有名言語音時 quote 會自動退回 taunt。",
  },
  {
    key: "podiumZoneSource",
    label: "看哪一區的勝負",
    group: "頒獎台",
    kind: "enum" as const,
    options: VICTORY_PODIUM_ZONE_SOURCES,
    help: "一回合有兩個競技場、兩個勝方。localSeat = 永遠演你自己英雄站的那一區(就算你按了『前往觀戰』跑去看別區);spectated = 演你鏡頭當下正在看的那一區。改這一格不會改變任何人的勝負或分數,只改變你死後/觀戰時看到誰在領獎。",
  },
  {
    key: "roundPresentSec",
    label: "頒獎台停留秒數",
    group: "頒獎台",
    kind: "number" as const,
    min: VICTORY_ROUND_PRESENT_SEC_MIN,
    max: VICTORY_ROUND_PRESENT_SEC_MAX,
    help: "回合結束後三位模型加灰幕佔著螢幕幾秒,時間到就收掉、進商店。⚠️ 這一格已經不會切掉嘲諷語音了(畫面收掉、聲音自己講完),所以它純粹是「你想看模型看多久」;調大只是延後進商店,不會延長回合結算(那是戰鬥系統的 resolutionSec)。",
  },
  {
    key: "podiumSpacing",
    label: "三張卡的間距",
    group: "頒獎台",
    kind: "number" as const,
    min: VICTORY_PODIUM_SPACING_MIN,
    max: VICTORY_PODIUM_SPACING_MAX,
    help: "1 = 三張卡均分整個視窗寬度(這是 2026-08-22 之前的行為,寬螢幕上三個人相隔約 3.1 個卡片寬);越小越往中間靠。⚠️ 卡片寬度是由視窗高度決定的,所以同一個值在 16:9 桌機與直式手機上疏密不同 —— 調緊時手機那一側會先擠在一起。",
  },
  {
    key: "roundCardCollapsed",
    label: "成績卡預設收合",
    group: "頒獎台",
    kind: "bool" as const,
    help: "回合結算的成績卡(右上角那張評價/建議/積分)一開始只留一條卡頭,還是整張攤開。攤開的那張 340 寬,正好蓋住站在畫面右邊的銅牌那一位的 3D 模型 —— owner 2026-08-22 回報的就是這件事。收合仍然看得到等第與標題,按卡頭的摺疊鈕(手把 A/B 也可以)就展開。",
  },
] as const;
