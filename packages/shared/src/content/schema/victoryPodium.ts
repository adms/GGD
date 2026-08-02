/**
 * config.victory-podium@1 —— 回合勝利頒獎台的四個決策點 (GH#257 / GH#256).
 *
 * ⚠️⚠️ 這個檔案**還沒有被接進出貨路徑**。它是刻意獨立的一支,理由寫在最下面的
 * 「整合待辦」。目前 `DEFAULT_VICTORY_PODIUM` 就是**實際生效的值** ——
 * 客戶端把它當參數傳進 `RoundWinnerStage`,所以行為是正確的、可測的,只是
 * **操作者還改不到**。接完之前不要在別的地方複製一份預設值。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼這四格是欄位而不是常數
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE.md 第一守則:「如果我在寫程式時心裡出現『這裡要選 A 還是 B』,
 * 那就是一個決策點,它應該變成編輯器的一個開關。」下面四格逐一都是那個形狀,
 * 而且四格的錯誤成本都是「一次完整部署」:
 *
 * | 欄位 | 心裡那個 A/B | 寫死的代價 |
 * |---|---|---|
 * | `podiumSize` | 三位?五位?只有第一名? | owner 明說三位,但 `CAPSTONE_ROUND_GATE = 6` 的前例就是「明說的數字被寫死之後再也改不到」 |
 * | `podiumScope` | 只排勝方三人,還是這一回合上場的所有人? | 3v3 裡兩者常常同解,一旦有人斷線就分岔 |
 * | `podiumFill` | 湊不滿三位時縮短,還是補敗方? | 把戰敗的敵人擺上勝利頒獎台是設計偏好,不是資料問題 |
 * | `roundWinLine` | 嘲諷台詞?名言宣言?兩個都放? | GH#256 問的就是這一題。現行出貨行為是**兩個都放**(名言 t=0 由 `ui/RoundEndVoice`、嘲諷 t=2200ms 由 `render/RoundWinnerStage`),寫死等於把其中一半永久關掉 |
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 整合待辦 —— 三個落點一個都還沒接
 * ═══════════════════════════════════════════════════════════════════════════
 * 一個欄位要同時落在三個地方,缺一個 drift 測試就紅:
 *
 *   1. `content/config/victory-podium.json`            ← **沒有這個檔**
 *   2. `packages/shared/src/content/schema/config.ts`  ← 沒有 import 這一支
 *   3. `apps/admin/src/configForms.ts` + `store.ts`    ← 沒有 `victoryPodium` 頁
 *
 * 三個都沒接是**刻意**的,不是漏掉:這一輪是多個 lane 平行改同一棵樹,
 * `content/schema/config.ts` 與 `content/*.json` 的產物(`bundle.json` /
 * `manifest.json` / `_index.json`)都正被別的 lane 改著。在那三個檔上動手會
 * 撞車,而 `content/config/victory-podium.json` 一旦新增就必須跑
 * `pnpm content:build`,那會把別人尚未 commit 的產物一起重寫。
 * 誠實留給 integrator 收尾比撞掉別人的樹便宜。
 *
 * integrator 收尾時要做的完全是機械動作:
 *   · 把 `zConfigVictoryPodiumDoc` re-export 進 `config.ts`,並把
 *     `DEFAULT_VICTORY_PODIUM` / `resolveVictoryPodium` 一起搬過去(或直接 import)
 *   · 用 `SHIPPED_VICTORY_PODIUM_JSON` 的內容建 `content/config/victory-podium.json`,
 *     然後跑 `pnpm content:build` 並 `git add content/`
 *   · admin 那邊照 `VICTORY_FX_SPEC`(`apps/admin/src/configForms.ts:801`)複製一份,
 *     欄位順序/標籤/分組見下面的 `VICTORY_PODIUM_FIELDS`
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
  })
  .strict();

export type ConfigVictoryPodiumDoc = z.infer<typeof zConfigVictoryPodiumDoc>;

/** 程式讀的那一份(去掉 id/schema/note 的殼)。 */
export interface VictoryPodiumPolicy {
  podiumSize: number;
  podiumScope: VictoryPodiumScope;
  podiumFill: VictoryPodiumFill;
  roundWinLine: VictoryRoundWinLine;
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
 */
export const DEFAULT_VICTORY_PODIUM: VictoryPodiumPolicy = {
  podiumSize: 3,
  podiumScope: "winnerTeam",
  podiumFill: "shrink",
  roundWinLine: "both",
};

/**
 * 未來 `content/config/victory-podium.json` 的內容,一字不差。
 * integrator 直接把它寫成檔案即可;drift 測試比對的就是它和
 * `DEFAULT_VICTORY_PODIUM`。
 */
export const SHIPPED_VICTORY_PODIUM_JSON: ConfigVictoryPodiumDoc = {
  id: "victory-podium",
  schema: "config.victory-podium@1",
  note:
    "GH#257 回合勝利頒獎台。podiumSize=3 是 owner 原話「最後活下來順序的三位」;" +
    "roundWinLine 預設 both —— 金冠那位先說自己的名言(t=0)、再嘲諷敗方(t=2200ms)," +
    "這就是現行出貨行為。切到 quote 時若該英雄沒有名言語音會自動退回 taunt,不會變成一片安靜。",
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
    key: "roundWinLine",
    label: "第一名的台詞",
    group: "語音",
    kind: "enum" as const,
    options: VICTORY_ROUND_WIN_LINES,
    help: "回合勝利時金冠那位說什麼:taunt 嘲諷敗方 / quote 自己的名言宣言 / both 兩個都說。該英雄沒有名言語音時 quote 會自動退回 taunt。",
  },
] as const;
