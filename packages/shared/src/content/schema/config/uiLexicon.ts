import { z } from "zod";
import { zId } from "../common";

/**
 * config.ui-lexicon@1 —— **玩家端看得到的每一個 Fate 用語，全部可以在後台改**。
 *
 * owner 2026-08-16：「記得這些替換的介面提示等用語，應該是一個 JSON 檔，
 * 可以在後台替換設定」。
 *
 * ⚠️ 這一份是 CLAUDE.md 第一守則最典型的形狀：文案是 owner 每週都會想改的東西，
 * 而寫死一個字串 = 改一次要 rebuild + 重啟容器；一個後台欄位 = 存檔就生效
 *（`content/` 是 live bind-mount）。
 *
 * ⛔ **它只管「叫什麼」，不管「做什麼」。** 後台與 `augment@1` 的
 * `silver / gold / prismatic` 一個字都沒動（規則 §3 明說「後台仍可保留」）——
 * 改這裡不會動到任何一份內容文件，也不會動到任何機制。
 *
 * ⭐ owner 2026-08-16 的第二條：**常用機制詞不 Fate 化**。
 * 迴避／格擋／彈反／反彈／招架／淨化／控制／回復／復活這一族**不在這份表裡**，
 * 它們住在規則 §5 的「正式機制詞」——理由是規則自己寫的：
 * 「⛔ 不能為了 Fate 味犧牲可讀性」。
 */
export const zUiLexiconGrail = z
  .object({
    /** 抽卡畫面的系統名。出貨「聖杯顯現」（規則 §2）。 */
    systemName: z.string().min(1).max(24).describe(
      "@zh 聖杯願望・系統名\n" +
      "@note 每回合抽增益卡時，面板正中央那四個字。⛔ 玩家端只看得到這個，「三選一」是內部說法。填空字串存不進去（schema 下限 1 字）。",
    ),
    /** 面板那一行說明。⚠️ 它要同時講「這是什麼」與「選完會怎樣」。 */
    prompt: z.string().min(1).max(120).describe(
      "@zh 聖杯願望・面板提示\n" +
      "@note 系統名下面那一行。⚠️ 它要同時講「這是什麼」與「選完會怎樣」—— 只寫世界觀的話，第一次玩的人不知道選完才能繼續逛商店。",
    ),
    /** 選取的動詞。出貨「刻入靈基」（規則 §18）——玩家不是「獲得一張卡」。 */
    inscribeVerb: z.string().min(1).max(12).describe(
      "@zh 聖杯願望・選取動詞\n" +
      "@note 「已○○○○」那一句的動詞（出貨「刻入靈基」）。玩家不是「獲得一張卡」。⚠️ 目前只有選完的提示句在用它。",
    ),
    /** 已選願望的列表標題。出貨「靈基刻印」（規則 §18）。 */
    inscriptionsTitle: z.string().min(1).max(12).describe(
      "@zh 聖杯願望・已選列表標題\n" +
      "@note 列出這一場已經刻進去的願望時的標題（出貨「靈基刻印」）。⚠️ 那個面板還沒做，改這一格現在畫面上看不到變化。",
    ),
    /**
     * 後台階級 → 玩家端 Fate Rank（規則 §3）。
     * ⚠️ 鍵一定是 `silver` / `gold` / `prismatic`，⛔ 不可以改鍵，只改值。
     * 少一個鍵 = 那一階在畫面上退回英文 tier，⭐ 那是刻意的醜（看得見的漏）。
     */
    ranks: z.record(z.string().min(1).max(16)),
  })
  .strict();

/**
 * 寶具側（owner 2026-08-16：「傳說武器這些字眼也都要變得 FATE 味，
 * 不要講傳說武器道具這種字眼」）。
 *
 * ⚠️ 這一則**推翻**了前一版的判斷：`fateLexicon.ts` 原本刻意把武器留在
 * 「三選一」，理由是規則 §1 把武器劃給「裝備」層。owner 的新說明是第 1 層
 *（第〇·六守則），所以武器**也要 Fate 化**，只是走**另一套詞**：
 * 願望用「C／A／EX 級願望」，武器用「寶具」＋**種別**。
 *
 * ⭐ **種別不是強弱，是規模。** owner 給的對照表逐字寫著對人寶具
 * 「不是代表弱，而是效果集中」。⛔ 所以它不可以拿來排序，也不可以拿來當抽卡權重。
 */
export const zUiLexiconNoblePhantasm = z
  .object({
    /** 武器抽卡畫面的系統名。出貨「寶具顯現」。 */
    systemName: z.string().min(1).max(24).describe(
      "@zh 寶具・系統名\n" +
      "@note 抽傳說武器時面板標頭的後綴（出貨「寶具顯現」）。⛔ 不要填成聖杯那一組的字 —— 武器是裝備層，混在一起會讓玩家以為武器也在改遊戲規則。",
    ),
    /**
     * 沒有逐把指定時的 Rank。出貨 **EX** ——
     * owner 2026-08-16：「照我們目前武器道具開放都是 EX 等級才對」。
     */
    defaultRank: z.string().min(1).max(4).describe(
      "@zh 寶具・預設 Rank\n" +
      "@note 每張武器卡左邊那兩個字（出貨 EX，因為目前開放的武器都是 EX 等級）。四個字以內，太長會把卡片撐開。",
    ),
    /** 沒有逐把指定時的種別。出貨「對人」（最保守：效果集中，不宣稱規模）。 */
    defaultClass: z.string().min(1).max(6).describe(
      "@zh 寶具・預設種別\n" +
      "@note 沒有在逐把對照表裡指定的武器算哪一種（出貨「對人」＝效果集中，最保守）。⚠️ 種別是**規模**不是強弱 —— 對人寶具不代表弱。",
    ),
    /**
     * 種別 → 玩家端全名（「對軍」→「對軍寶具」）。
     * 鍵是短碼，值是畫面上那幾個字。
     */
    classNames: z.record(z.string().min(1).max(12)),
    /**
     * 逐把武器的種別覆寫：`{ "<itemId>": "對軍" }`。
     * ⛔ 沒列到的走 {@link defaultClass} —— 不是「沒有種別」。
     */
    itemClass: z.record(z.string().min(1).max(6)),
  })
  .strict();

export const zConfigUiLexiconDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ui-lexicon@1"),
    note: z.string().optional(),
    grail: zUiLexiconGrail,
    noblePhantasm: zUiLexiconNoblePhantasm,
    /**
     * 商店回絕訊息裡被 Fate 化的那幾條。
     * ⛔ 其餘 12 條（金幣不足、道具欄已滿…）**刻意不進來**：它們是機制訊息，
     * 不是世界觀文案，搬進來只會讓這份表變成第二個 `REJECT_TEXT`。
     */
    shopLines: z.record(z.string().min(1).max(80)),
  })
  .strict();
export type ConfigUiLexiconDoc = z.infer<typeof zConfigUiLexiconDoc>;
