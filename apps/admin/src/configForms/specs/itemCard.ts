/**
 * 設定文件的**標籤資料**（道具卡排版）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigItemCardDoc,
} from "@ggd/shared/content";
import { HEX6, HEX6_ERROR } from "./_shared";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
// ────────────────────────────────── 道具卡片排版 (config/item-card) ────────

/**
 * 分類標籤的長度上界（#277 在字串上的形狀）。
 *
 * ⚠️ 它不是潔癖，是**兩個**真實後果：schema 是 `.min(1).max(12)`，所以 13 個字
 * 的標籤在 PUT 那一關會被平台退回；而就算繞過 PUT（覆蓋層寫入路徑今天不跑 Zod，
 * #283），客戶端 `itemCardTheme.acceptLabel` 對 `length > 12` 的值會**靜默退回
 * 出貨標籤** —— 操作者存了、頁面顯示已儲存、卡片上還是舊字。
 */
const ITEM_CARD_LABEL = /^[\s\S]{1,12}$/;
const ITEM_CARD_LABEL_ERROR =
  "分類標籤要 1～12 個字：超過 12 個字客戶端會靜默退回出貨標籤，畫面上看不出來被拒絕了";

/** 四個分類的中文，這一份表要和 `zItemCardCategory` 一模一樣（測試在比）。 */
const ITEM_CARD_CATEGORY_OPTIONS = [
  { value: "stat", zh: "stat 屬性加成（純數字，沒有觸發事件）" },
  { value: "active", zh: "active 主動效果（有一個離散的觸發事件）" },
  { value: "passive", zh: "passive 被動效果（常駐／每秒自動）" },
  { value: "debuff", zh: "debuff 負面控場（作用在敵人身上）" },
] as const;

export const ITEM_CARD_SPEC: ConfigDocSpec<"itemCard"> = {
  page: "itemCard",
  collection: "config",
  docId: "item-card",
  schemaTag: "config.item-card@1",
  zod: zConfigItemCardDoc,
  title: "道具卡片排版",
  intro: [
    "owner 2026-08-02：「卡片道具的排版連在一起不好閱讀，關於效果及數值的部分應該要特殊顏色表示」。這一頁就是那份排版表：四個分類各自的名稱與顏色、數值與解說的顏色，以及下面三張決定「方括號裡的字算哪一類」的對照表。",
    "⚠️ **道具的 description 一個字都不會被這一頁改到。** owner 手寫的那 49 份原文是規格（`legendary49OwnerText.test.ts` 逐位元組比對），所以排版是在**畫的那一刻**解析出來的：`[焚身]` 這種方括號標記查下面的對照表決定顏色，`+87`／`30%`／`0.6秒` 這種數值自動抓出來上色。改這一頁＝改「同一段原文怎麼被畫出來」。",
    "⚠️ 四個渲染點（商店 / 三選一卡 / 裝備欄 hover / 圖鑑）讀的是**同一份**設定，所以同一個 `[焚身]` 不可能在四個畫面上是四個顏色。",
    "⚠️ 顏色是對卡片底色 `#12151d` 量過的：出貨六個顏色的對比度 5.93～15.15 全部過 4.5:1，四個分類彼此的 CIE76 ΔE 最小 57.7。換色之前請記得這兩件事 —— **太暗會讀不到**（低於 4.5:1），**兩個分類太接近就等於沒有分類**（ΔE 低於 ~25 就開始混淆）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/item-card.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/components/itemCardTheme.ts 的 applyItemCardDoc()（由 ContentDb.load() 呼叫）→ getItemCardConfig() 餵給 packages/shared/src/content/itemCardText.ts 的 parseItemCard()／tokenizeCardLine()，四個渲染點（MerchantShop / AugmentDraftPanel / EquipmentBar / CodexDetail）畫的是它吐出來的 token",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。不需要重開 game-server —— 這整段排版活在客戶端。",
  fields: derivedFields(zConfigItemCardDoc, [
    {
      path: "categories.stat.label",
      zh: "屬性加成的分類名",
      note: "`[神速]`／`[閃避]` 這一族的分類名。⚠️ 這個字**不會印在卡片上** —— 玩家看到的是標記自己的原字（例如 `[神速]` 四個字本身），這一格只出現在滑鼠停在那個 chip 上時的**原生 tooltip**。它不影響哪些標記算這一類 —— 那是下面「標記 → 分類」那張表。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.stat.color",
      zh: "屬性加成的顏色",
      note: "這一類 chip 的文字與邊框色，出貨 #6FD3C4 青綠。它是四個分類裡最「安靜」的一個，因為屬性加成在卡片上出現得最頻繁 —— 換成高彩度的顏色會讓整張卡片被最不重要的那一類佔滿。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "categories.active.label",
      zh: "主動效果的分類名",
      note: "`[On-Hit]`／`[暴擊]`／`[衝刺]` 這一族的分類名（同上，只出現在 chip 的 tooltip）。判準是「有沒有一個離散的觸發事件」，不是「玩家要不要按鍵」—— 這四個分類全部都是自動發生的。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.active.color",
      zh: "主動效果的顏色",
      note: "出貨 #FFC24D 琥珀。⚠️ 它離數值色 #FFE9A3 的 ΔE 只有 32.7（四對裡最近的一對），再往淡黃調就會和那些 `+87`／`30%` 混成同一種顏色，而那正是 owner 要求「數值特殊顏色」時要分開的兩件事。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "categories.passive.label",
      zh: "被動效果的分類名",
      note: "`[無視]`／`[流星]`／`[格擋]` 這一族的分類名（同上，只出現在 chip 的 tooltip）。⚠️ 這一類同時是「查不到的標記落到哪一類」的出貨值 —— 所以**新標記**第一次出現時會借用它的顏色，但畫面上印的仍然是新標記自己的原字。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.passive.color",
      zh: "被動效果的顏色",
      note: "出貨 #A9B6FF 藍紫。它同時是所有**沒被登記過**的新標記的顏色（見最下面那一格），所以換色的影響範圍比另外三類大一點。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "categories.debuff.label",
      zh: "負面控場的分類名",
      note: "`[暈眩]`／`[緩慢]`／`[腐蝕]` 這一族的分類名（同上，只出現在 chip 的 tooltip）。它是唯一一類**作用在敵人身上**的效果，所以它的**顏色**比這個名字重要得多。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.debuff.color",
      zh: "負面控場的顏色",
      note: "出貨 #FF7BA6 粉紅。⚠️ 不要換成純紅：卡片上的紅在這個專案裡已經被「傷害／扣血」佔走了（傷害飄字 #FF5900、身體閃光 #FF2626），操作者會把控場讀成傷害。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    { path: "numberColor", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "loreColor", pattern: HEX6, patternError: HEX6_ERROR },
    {
      path: "unknownCategory",
      zh: "沒登記過的標記算哪一類",
      note: "下面那張表查不到的方括號標記落到這一類。它存在的理由是**新道具不可以讓卡片壞掉**：owner 明天寫一支用了新標記的道具，卡片照樣要畫得出 chip、有顏色、有分行，只是分類是這一格。⚠️ 這不是「錯誤處理」而是預設值，所以選一個最不會誤導人的：出貨選 passive（被動效果），因為把未知的東西說成「主動」或「負面」都是在講一件可能不是真的事。",
      optionLabels: Object.fromEntries(ITEM_CARD_CATEGORY_OPTIONS.map((o) => [o.value, o.zh])),
    },
  ]),
  tables: [
    {
      path: "markers",
      shape: "recordEnum",
      title: "標記 → 分類（32 列）",
      intro: [
        "**這張表就是 owner 想改「`[On-Hit]` 算主動還是被動」時要改的地方。** 左邊是方括號裡的**原字**，右邊是它畫成哪一類的顏色。改一列存檔，四個畫面上同一個標記一起換色。",
        "⚠️ 左邊是**逐字比對**，一個字都不能差。`On-Hit` 與 `OnHit` 是兩列而不是一列，因為 owner 的原稿兩種都寫過，而原稿不准改 —— 表要去遷就原文，不是反過來。",
        "⚠️ 這張表**整批取代**，不和出貨值合併。刪掉一列＝那個標記從此落到「沒登記過的標記算哪一類」，不是「回到出貨分類」。（合併的話操作者刪掉的那一列會從預設值復活，變成一個查不出來的鬼。）",
        "⚠️ active↔passive 那條線是**判斷不是真理**：出貨用的判準是「有沒有一個離散的觸發事件」，所以 `[擴散]`（普攻濺射）算 active、`[流星]`（每秒自動）算 passive。不同意就改這張表，不要回去改程式。",
      ],
      key: {
        zh: "方括號裡的原字",
        note: "不含方括號本身。道具原文寫 `[焚身]`，這裡就填 `焚身`。前後不可以有空白 —— 比對是逐字的，多一個空格這一列就永遠不會命中，而畫面上只會看到那個標記變成「沒登記過」的顏色。",
        maxLen: 16,
      },
      value: {
        zh: "畫成哪一類",
        note: "決定這個標記的 chip 用哪一個分類的**顏色**（以及滑鼠停上去時 tooltip 顯示的分類名）。四個選項就是上面那四格顏色。",
        options: ITEM_CARD_CATEGORY_OPTIONS,
      },
      minRows: 1,
      maxRows: 300,
    },
    {
      path: "inlineValueMarkers",
      shape: "stringList",
      title: "方括號裡其實是「填一個值」的那幾個",
      intro: [
        "這張表上的字**不畫成 chip，改用數值色畫**。owner 有時候用方括號當「這裡填一個數字」的佔位符而不是關鍵字，而那種字塞進 chip 會變成一個二十字寬的分類標籤 —— 那就是排版壞掉。",
        "出貨只有一列，而且是實際存在的那一個：虛哭神去（godie-i007）的 `自身已損失的生命百分比數值(0~100)`。這不是為了通用性發明的欄位。",
        "⚠️ 這張表**先於**上面那張被查：同一個字兩邊都有的話，它會被畫成數值而不是 chip。",
      ],
      key: {
        zh: "方括號裡的原字",
        note: "同樣不含方括號、同樣逐字比對。判準很簡單：這個方括號裡的東西是一個**要被填進去的值**（所以裡面通常有數字或範圍），還是一個**關鍵字**（所以它該有分類顏色）。",
        maxLen: 40,
      },
      minRows: 0,
      maxRows: 50,
    },
    {
      path: "efficacyHeadings",
      shape: "stringList",
      title: "哪些整行的字是「效果區」的標題",
      intro: [
        "道具原文裡自成一行的 `效能` 這種字是**段落標題**而不是內容。它們不會被畫進卡片，只用來決定「這一行以下是效果還是解說」。",
        "⚠️ 比對前會先去掉結尾的全形／半形冒號，所以 `效能` 這一列同時認得 `效能：`（狂暴軒轅劍 godie-i02e 寫的就是後者），不必兩列都填。",
        "⚠️ 這張表**漏一個字的後果是看不見的**：一個沒被登記的標題會被當成一般內容畫進效果區，變成卡片上多出來的一行怪字，而不會有任何錯誤。",
      ],
      key: {
        zh: "標題原字",
        note: "整行完全等於這幾個字（去掉結尾冒號之後）才算標題。不要填半句話 —— 比對的是整行，不是「開頭包含」。",
        maxLen: 12,
      },
      minRows: 0,
      maxRows: 20,
    },
    {
      path: "loreHeadings",
      shape: "stringList",
      title: "哪些整行的字是「解說區」的標題",
      intro: [
        "同上，但這些標題**以下**的內容會用解說色畫（暗色），而且**不解析數值** —— 那一段是散文不是規格，把裡面的年份塗成數值色只會誤導人。",
        "出貨兩列：`解說` 與 `歷史`（狂暴軒轅劍拿 `歷史` 當解說標題，兩個都真的存在於原稿）。",
        "⚠️ 這一格**只決定「從哪一行開始變暗」**。`ItemCard.loreHeading`（記下命中的是哪一個字）在客戶端目前**零消費端** —— 標題字本身從來沒有被畫出來過。所以這裡的順序與拼字都只影響「暗色從哪裡開始」，不影響畫面上出現什麼字。",
      ],
      key: {
        zh: "標題原字",
        note: "同上，整行相等才算。⚠️ 把一個常用詞（例如 `效果`）加進來要小心：從那一行以下的所有內容都會變成暗色散文，而且數值不再上色 —— 這是這一頁最容易一次弄壞一整張卡片的地方。",
        maxLen: 12,
      },
      minRows: 0,
      maxRows: 20,
    },
  ],
  preserved: [],
};


