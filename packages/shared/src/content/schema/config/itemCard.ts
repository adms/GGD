import { z } from "zod";
import { zId } from "../common";
import { zColorHex } from "./_shared";

/**
 * config.item-card@1 — 道具卡片的**排版與配色**（`config/item-card.json`）。
 *
 * owner 2026-08-02, verbatim:
 *   「卡片道具的排版連在一起不好閱讀，關於效果及數值的部分應該要特殊顏色表示」
 *   「先做傳說武器道具開放的49個的部分就好」
 *   「別漏掉 [隱形]、[焚身] ...之類」
 *
 * ── 為什麼是一份 config 文件，不是元件裡的 if-else ──────────────────────────
 * owner 手寫的 49 支傳說文案把機制關鍵字寫成 `[標記]`（`[焚身]`、`[緩慢]`…），
 * 而那些字**不准被改**（`legendary49OwnerText.test.ts` 逐位元組比對）。所以卡片
 * 只能在**渲染時**解析：把 `[xx]` 認成 chip、把數值認成 token。那就需要一張
 * 「標記 → 分類」對照表，而這張表**一定會長**：owner 每寫一支新道具就可能發明
 * 一個新標記。表寫在元件裡 = 每新增一個標記就是一次 rebuild + 重啟容器；表寫在
 * `content/` = 存檔就生效（第一守則的那個理由，這裡是第 N 次）。
 *
 * ── 四個分類是 owner 核准的語意，不是這裡發明的 ─────────────────────────────
 *   `stat`    屬性加成（純數值，不需要任何事件）
 *   `active`  主動效果（需觸發：普攻、施法、擊殺、受擊…）
 *   `passive` 被動效果（常駐，沒有觸發事件）
 *   `debuff`  負面/控場（作用在敵人身上）
 *
 * ⚠️ 分類線最模糊的一條是 active↔passive。這裡採用的判準是「**有沒有一個離散的
 * 觸發事件**」：`[擴散]`（普攻濺射）算 active，`[流星]`（每秒自動）算 passive。
 * 這是判斷，不是真理 —— 所以它是一格資料。覺得 On-Hit 該算常駐，改這份 JSON 的
 * 一列即可，不要回來改程式。
 *
 * ── 未知標記不可以讓卡片壞掉 ────────────────────────────────────────────────
 * `unknownCategory` 是表上查不到的標記落到哪一類。它存在的理由是失敗形態：
 * owner 明天寫一支新道具用了新標記，卡片必須照常畫出來（chip 有顏色、有分行），
 * 只是分類是預設的那一類。
 */
export const zItemCardCategory = z.enum(["stat", "active", "passive", "debuff"]);

/** 一個分類的畫面樣子：中文標籤 + 它的專用色。 */
const zItemCardCategoryStyle = z
  .object({
    /** chip 旁邊那個分類名（玩家看得到）。 */
    label: z.string().min(1).max(12),
    /** 這一類 chip 的文字/邊框色。卡片專用配色，刻意不沿用戰鬥飄字那五個色。 */
    color: zColorHex,
  })
  .strict();

export const zConfigItemCardDoc = z
  .object({
    id: zId,
    schema: z.literal("config.item-card@1"),
    note: z.string().optional(),
    /** 四個分類各自的標籤與顏色。 */
    categories: z
      .object({
        stat: zItemCardCategoryStyle,
        active: zItemCardCategoryStyle,
        passive: zItemCardCategoryStyle,
        debuff: zItemCardCategoryStyle,
      })
      .strict(),
    /** 數值 token（`+87`、`30%`、`0.6秒`…）的顏色 —— owner 要的「數值特殊顏色」。 */
    numberColor: zColorHex.describe(
      "@zh 數值的顏色\n" +
      "@note **owner 那句話裡的「數值」就是這一格**：`+87`、`30%`、`*1.2`、`0.6秒`、`10-1000` 這些會被自動抓出來塗成這個顏色，不必在原文裡標任何東西。出貨 #FFE9A3 淡金對卡片底 15.15:1，是整張卡片上最亮的東西 —— 那是刻意的，玩家掃一張卡片時先找的就是數字。"
    ),
    /** 解說/歷史那一段的顏色（刻意比效果暗，讓效果先被讀到）。 */
    loreColor: zColorHex.describe(
      "@zh 解說／歷史的顏色\n" +
      "@note `解說`／`歷史` 標題以下那一段散文的顏色，出貨 #8B93A6 灰。**它刻意比效果暗**（5.93:1，是六個顏色裡最低的一個）：那一段是身世不是規格，壓暗它玩家才會先讀到效果。調到和效果一樣亮，卡片就會退回 owner 抱怨的那個「連在一起」的狀態。"
    ),
    /** 表上查不到的標記落到哪一類 —— 新標記絕不可以讓卡片壞掉。 */
    unknownCategory: zItemCardCategory,
    /**
     * 標記 → 分類。key 是**方括號裡的原字**，一字不差（`On-Hit` 與 `OnHit` 是
     * 兩列，因為 owner 的原稿兩種都寫過，而原稿不准改）。
     */
    markers: z.record(z.string().min(1), zItemCardCategory),
    /**
     * 方括號裡其實是**內嵌數值**而不是關鍵字的那些字串，照數值上色、不畫成 chip。
     *
     * 這一格不是為了通用性發明的：49 支裡真的有一個 ——
     * 虛哭神去（godie-i007）的 `[自身已損失的生命百分比數值(0~100)]`。owner 用
     * 方括號當「這裡填一個值」的佔位符，不是當關鍵字。把它畫成 chip 會出現一個
     * 20 字寬的分類標籤，那就是排版壞掉。
     */
    inlineValueMarkers: z.array(z.string().min(1)),
    /**
     * 哪些整行的字是**段落標題**而不是內容（`效能`、`解說`、`歷史`…）。
     * 比對時會先去掉結尾的全形/半形冒號 —— 狂暴軒轅劍寫的是 `效能：`。
     */
    efficacyHeadings: z.array(z.string().min(1)),
    /** 同上，但這些標題以下的內容是**解說**（暗色、不解析數值）。 */
    loreHeadings: z.array(z.string().min(1)),
    /**
     * 道具**圖示**佔一格的百分比（見 {@link DEFAULT_ITEM_ICON_FILL_PCT}）。
     *
     * ⚠️ **必須 `.optional()`**，理由和 `vfx-cleanup` 那六格逐字相同：
     * `config.item-card@1` 線上已經有耐久覆蓋層，一份存於這個欄位出現之前的
     * override 少了必填欄就會整份被 Zod 退回 → 內容載入失敗 → 退回骨架英雄。
     */
    iconFillPct: z
      .number()
      .min(50)
      .max(100)
      .optional()
      .describe(
        "@zh 道具圖示佔一格的百分比\n" +
        "@note 裝備欄／商店那一格方框裡，圖示自己佔掉幾成邊長。100＝填滿整格（出貨值）。⚠️ 這一格是為了修一個看得見的落差：商店裝備格是流動寬度（實測約 84px）而圖示的邊長寫死 38px，也就是只佔了 45%，於是格子裡有一大圈空白、圖案本身小到看不出是哪一件。調小＝圖示縮回格子中央、四周留白變多（想讓格線與數字更明顯時用）；調到 100＝圖示貼齊格子邊。⛔ 它不改格子本身的大小，也不改任何一件道具的效果。\n" +
        "道具圖示佔格子的百分比。100 = 填滿整格。⚠️ 商店裝備格今天是流動寬度（約 84px）而圖示寫死 38px（邊長 45%），這一格是那個比例的後台旋鈕。"
      ),
  })
  .strict();

/**
 * 缺 `iconFillPct` 時圖示佔格子幾成 —— **出貨 100（填滿整格）**。
 *
 * 三個住處都有它（第一守則）：這個常數 · {@link DEFAULT_ITEM_CARD} ·
 * `content/config/item-card.json`。⚠️ 中間那個**引用**這個常數而不是重打 100 ——
 * `itemCardShipped.test.ts` 把 `DEFAULT_ITEM_CARD` 逐鍵釘死等於出貨 JSON
 * （去掉 `note` 之後 `toEqual`），所以那兩份會互相守；但它守不到「這個常數」，
 * 重打一份就會是一個沒有守衛的第四個住處。
 *
 * 這個常數本身仍然是**缺席時的退路** —— 線上已存的耐久 override 是舊文件、
 * 沒有這一格，消費端一律寫 `doc.iconFillPct ?? DEFAULT_ITEM_ICON_FILL_PCT`。
 */
export const DEFAULT_ITEM_ICON_FILL_PCT = 100;
// 練習模式（GH#343）的型別**刻意不在這裡再匯出一次** —— 它跟 audioMixDoc 走同一條
// 路：由 `schema/index.ts` 的 `export * from "./practiceDoc"` 出去。兩條 star export
// 匯出同一個名字會互相遮蔽（那一行的註解就是為此而寫的）。
/** 道具卡片的四個語意分類（owner 2026-08-02 核准）。 */
export type ItemCardCategory = z.infer<typeof zItemCardCategory>;
export type ConfigItemCardDoc = z.infer<typeof zConfigItemCardDoc>;

/**
 * 出貨預設 —— `content/config/item-card.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyItemCardDoc` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/item-card.json` 一字不差 ——
 * `packages/shared/src/content/itemCardShipped.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(owner 會改),這份是**程式的保險絲**。
 *
 * ── `markers` 這 32 列是掃出來的,不是想出來的 ───────────────────────────────
 * 來源是 `content/loot-tables/legendary-weapons.json` 那 49 支的 description,
 * 逐字掃 `[...]`:31 個關鍵字標記 + 1 個內嵌數值(見 `inlineValueMarkers`)。
 * owner 點名的 `[焚身]` 在(死之王的神盾 godie-i061);他寫的 `[隱形]` **不在** ——
 * 49 支裡的那一個是 `[隱身]`(至尊魔戒 godie-i004)。`[隱形]` 這三個字在這批裡
 * 只出現在 `[看穿]` 的說明文字裡(「看穿隱形」),不是一個標記。表上兩個都收:
 * `隱身` 是實際存在的那一個,`隱形` 是 owner 講的那個名字,先在表上等它出現 ——
 * 一個查得到的空位比一個 fallback 好,因為 fallback 不會告訴你它猜過。
 *
 * ⚠️ 2026-08-10 之前這裡是 `On-Hit` 與 `OnHit` **兩列**:雅典娜的驚嘆號
 * (godie-i006)寫 `[OnHit]`、其餘 16 支寫 `[On-Hit]`,而「原稿不准改」讓對照表
 * 必須同時認得兩種拼法。**owner 當天親自解除了那個限制**:「On-hit 說明應該
 * 跟技能統一 tag []」—— 整批(17 件的 description + authoringNote)改成
 * `[普通攻擊時]`,兩列併成一列,同一行裡重複的尾綴 `(On-Hit)` 一併拿掉。
 * ⭐ 留著這段是因為它記錄了**為什麼曾經有兩列**:那不是疏忽,是一條刻意的
 * 「不為了程式好寫去動文案」的紀律。解除它的是文案作者本人,不是我。
 *
 * ── 顏色是量出來的 ──────────────────────────────────────────────────────────
 * 對卡片底色 `#12151d` 的對比度:stat 10.25 / active 11.36 / passive 9.40 /
 * debuff 7.50 / number 15.15 / lore 5.93 —— 全部過 4.5:1。
 * 四個分類彼此的 CIE76 ΔE 最小 57.7(stat↔passive),數值色離最近的分類色 32.7
 * (active),都在 ~25 的可混淆線之上。
 * 而且**刻意不沿用戰鬥飄字那五個色**(owner 2026-08-02 裁定「卡片專用一套新的」):
 * 離 `config/damage-colors.json` 五個 hue 最近的一格是 stat↔魔力青 ΔE 29.5,
 * 仍在線上 —— 卡片是靜態閱讀介面,不必扛戰場地面對比,判準是「別讀成傷害屬性」。
 */
export const DEFAULT_ITEM_CARD: ConfigItemCardDoc = {
  id: "item-card",
  schema: "config.item-card@1",
  // ⚠️ 值一律引用 {@link DEFAULT_ITEM_ICON_FILL_PCT}，⛔ 不重打 100 ——
  // 重打就是第四個住處，而 `itemCardShipped.test.ts` 只比得出「JSON 與這裡對不對得上」，
  // 比不出「這裡與那個常數對不對得上」。
  iconFillPct: DEFAULT_ITEM_ICON_FILL_PCT,
  categories: {
    stat: { label: "屬性加成", color: "#6FD3C4" },
    active: { label: "主動效果", color: "#FFC24D" },
    passive: { label: "被動效果", color: "#A9B6FF" },
    debuff: { label: "負面控場", color: "#FF7BA6" },
  },
  numberColor: "#FFE9A3",
  loreColor: "#8B93A6",
  unknownCategory: "passive",
  markers: {
    // ── 屬性加成:沒有任何觸發事件,就是一串數字 ──
    神速: "stat", // 攻速上限提升至 10 / 攻擊速度+200%
    伸長: "stat", // 近戰攻擊距離+4;遠戰+2
    閃避: "stat", // 閃避 +10%
    死之王套裝: "stat", // 三件套齊 → 總 AP +100%
    // ── 主動效果:有一個離散的觸發事件(普攻/施法/擊殺/受擊) ──
    普通攻擊時: "active", // owner 2026-08-10：標記統一成中文,兩種拼法併成一列
    擴散: "active", // 普攻濺射
    暴擊: "active", // 普攻機率兩倍傷害
    暴擊吸血: "active",
    // A4b(#278) —— 【淨化】。分到 active：它是一個**會發生的事件**
    // （On-Hit 機率觸發／每 N 秒觸發），不是一條常駐屬性。
    淨化: "active", // 暴擊時 100% 吸血
    疊層: "active", // 普攻命中 / 擊殺英雄時疊加
    衝刺: "active", // 施放技能時向前衝刺
    復活: "active", // 擊殺敵方英雄時復活我方
    回復: "active", // 擊殺任一敵方單位時回血
    煉金術: "active", // 受敵人攻擊時機率把敵人變成黃金
    // ── 被動效果:常駐,沒有觸發事件 ──
    隱身: "passive", // 永久隱身
    隱形: "passive", // owner 講的名字;49 支裡目前沒有,先佔位(見檔頭)
    看穿: "passive", // 常駐真視
    飛昇: "passive", // 移動轉為無視碰撞的飛行形態
    無視: "passive", // 普攻無視防禦
    // ⭐ 【穿透】—— 霸王破甲槍 2026-08-13 從「真傷」改成「100% 護甲穿透」之後
    //   啟用的新標記。⚠️ 它**不是**【無視】的同義詞：穿透照樣被格擋擋得下、
    //   照樣被物理護盾吃、照樣觸發反傷，只是把護甲當成 0。
    //   ⛔ 漏掉這一列，卡片會走 `unknownCategory` 去猜分類（猜出來剛好也是
    //   passive，所以畫面上看不出來 —— 那正是 `itemCardShipped` 要擋的形態）。
    穿透: "passive", // 普攻無視敵方 N% 護甲
    真實傷害: "passive", // 技能傷害全部轉真實
    反彈: "passive", // 反彈普通攻擊傷害
    斬殺: "passive", // 低血直接斬殺
    格擋: "passive", // 機率抵擋
    迴避: "passive", // 機率迴避物理傷害
    流星: "passive", // 每秒自動範圍傷害
    // ⭐ 2026-08-18:被動子句**帶著使用條件**的那一族。標的仍然是一個被動效果
    // (所以歸 passive),只是那一行自己先講清楚「誰吃得到」——這是 owner 當天立的
    // 「不放任何無效說明」的直接產物:不講,拿到的人就會以為它對自己有效。
    限遠程: "passive", // 只有遠程英雄吃得到的被動 (piercer-crossbow)
    限智力: "passive", // 只有智力主屬性吃得到全額 (sage-ward-amulet)
    // ── 負面/控場:作用在敵人身上 ──
    緩慢: "debuff",
    暈眩: "debuff",
    重創: "debuff", // 降低敵方吸血回復量
    嘲弄: "debuff", // 強制敵人優先攻擊自己
    焚身: "debuff", // 周圍敵人每秒燃燒
    腐蝕: "debuff", // 周圍敵方防禦 -30
    變形: "debuff", // 把敵人變成食材,無法動作
  },
  inlineValueMarkers: ["自身已損失的生命百分比數值(0~100)"],
  efficacyHeadings: ["效能"],
  loreHeadings: ["解說", "歷史"],
};
