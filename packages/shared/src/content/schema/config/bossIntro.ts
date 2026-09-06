import { z } from "zod";
import { zId } from "../common";

/* ══════════════════════════════════════════════════════════════════════════
 * config.boss-intro@1 —— 殭屍王出場演出 (owner 2026-08-02)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-02：「殭屍王出場 會音效+大字講該英雄的名言，然後跳出該英雄的
 * 描述及攻略注意要點及弱點等提示，五秒後提示淡出消失」
 *
 * ── 「該英雄」是誰：**每次召喚都不一定是同一個人** ─────────────────────────
 * `mobWaves.boss.championSource` 的出貨值是 `"random"`（owner 2026-07-29
 * 「特殊殭屍 殭屍王 預設是隨機」），所以王借的是**當回合抽到的那位英雄**的臉、
 * 數值與模型 —— 不是固定的喪標麥可。抽籤發生在 arm time
 * （`sim/mobs.mobRulesFromConfig` 的 `mobKindChampion`），結果現在被寫進
 * `MobBossRules.championId` 並隨 `mobBossSpawn` 過線，所以這一頁的內容是
 * 「**這一隻**王穿的是誰」查出來的，不是猜的。
 *
 * ⚠️ 這就是為什麼**逐英雄的文案不能寫死在程式裡**：可能出場的是 120 位裡的
 * 任何一位。缺資料是常態而不是例外，所以 `bossIntroContent` 的契約是
 * 「只吐存在的段落」，不是「缺一段就整個不畫」。
 *
 * ── 名言：**今天沒有這份資料，而且我們沒有編造它** ────────────────────────
 * 每位英雄的名言是 GH#139 / #142，兩張都還是 pending：`champion@1` 沒有
 * `quote` 欄位，`config/victory-taunts.json` 裡的是**嘲弄台詞**（對輸家講的
 * 原創挖苦），不是那個角色的名言，拿來當名言用是張冠李戴。
 * 所以 {@link zBossIntroChampionEntry} 有 `quote` 這一格、出貨值**全部留空**，
 * 由 owner（或 #139）填。空的時候大字整段不畫 —— 不是畫一個空框，也不是塞一句
 * 我們自己寫的台詞。
 *
 * ── 為什麼逐英雄文案在 config 而不在 champion doc ───────────────────────
 * 和 `config/victory-taunts.json` 同一個形狀（那份也是 `championId -> 文案`）：
 * 演出文案是**演出**的資料，不是英雄的定義；放在這裡，一份文件就能看完整場
 * 演出要講什麼，也不用為了一句提示去動 120 份 champion doc。
 */
export const zBossIntroChampionEntry = z
  .object({
    /**
     * 大字名言。**出貨一律空字串**（見上）。空 = 大字那一段整段不畫。
     * ⚠️ 這一格不是「隨便寫一句氣勢的話」；它是那個角色**原作裡的名言**，
     * 沒有考據來源就留空。
     */
    quote: z.string().max(80).optional(),
    /** 攻略注意要點 —— 「打這隻的時候要記得做什麼」。 */
    tips: z.array(z.string().min(1).max(60)).max(6).optional(),
    /** 弱點 —— 「牠哪裡可以被吃」。 */
    weaknesses: z.array(z.string().min(1).max(60)).max(6).optional(),
    /** 這幾行是怎麼推導出來的（給下一個編輯的人看，不上畫面）。 */
    authoringNote: z.string().max(600).optional(),
  })
  .strict();

export const zConfigBossIntroDoc = z
  .object({
    id: zId,
    schema: z.literal("config.boss-intro@1"),
    note: z.string().optional(),
    /**
     * **決策點**：整段出場演出要不要存在。關掉 = 只剩既有的 4.6 秒降臨橫幅與
     * 恐怖音效，名言／描述／要點／弱點一格都不畫。止血閥：這一段吃掉螢幕中央
     * 走廊好幾秒，線上覺得礙眼時要能在不重新部署的情況下關掉。
     */
    enabled: z.boolean().describe(
      "@zh 出場演出總開關\n" +
      "@note 關掉＝只剩既有的「殭屍王降臨」橫幅與 4.4 秒恐怖音效，名言／描述／攻略要點／弱點一格都不畫。這是止血閥：這一面提示會吃掉螢幕中央走廊好幾秒，線上覺得礙眼時要能在不重新部署的情況下整個關掉。",
    ),
    /**
     * 提示停留幾秒才開始淡出（owner 明說五秒）。
     * ⚠️ 這一格是欄位不是常數，因為 owner 對時長一向會調（火圈、商店倒數、
     * 死亡淡出都被改過）。上界 30 是誤植守衛：5 打成 50 會讓提示蓋著整場前半。
     */
    introHoldSec: z.number().min(0).max(30).describe(
      "@zh 提示停留幾秒才開始淡出\n" +
      "@note owner 明說五秒，所以出貨 {{出貨值}}。⚠️ 這是**時間**不是節奏：它從王出場的那一刻起算，和恐怖音效（4.4 秒）平行跑，不是接在它後面。調小到 0 ＝ 出現的瞬間就開始淡出（等於只看得到淡出那段）。上界 30 是誤植守衛 —— 5 打成 50 會讓提示蓋著整場的前半。",
    ),
    /** 淡出花幾秒。0 = 直接消失（不建議：瞬間消失讀起來像掉幀）。 */
    fadeSec: z.number().min(0).max(5).describe(
      "@zh 淡出花幾秒\n" +
      "@note 停留結束之後,面板從全不透明線性掉到透明所花的時間。0 ＝ 直接消失,讀起來像掉幀而不像結束,所以出貨 {{出貨值}}。這一格加上上面那格就是提示在畫面上的總時間。",
    ),
    /**
     * **決策點**：描述最多顯示幾個字，超過截斷加省略號。
     * champion doc 的 `description` 是完整故事（喪標麥可那一份 400 字以上），
     * 整段搬上戰鬥畫面就是一面牆。0 = 不顯示描述那一段。
     */
    descriptionMaxChars: z.number().int().min(0).max(400).describe(
      "@zh 描述最多顯示幾個字\n" +
      "@note 英雄文件裡的描述是完整的身世故事（喪標麥可那一份 400 字以上），整段搬到戰鬥畫面上就是一面牆。這一頁把描述的**非空行接成一段**再截到這個字數，超過的部分用刪節號收尾。⚠️ 刻意**不是**「只取第一段」——出貨的英雄文件幾乎都以一行標籤開頭（`故事：`換行才是本文），取第一段的話畫面上只會出現「故事：」三個字。**0 ＝ 不顯示描述那一段**（名言、攻略要點、弱點照常）。",
    ),
    /** 最多列幾條攻略要點（超過的不畫）。0 = 不顯示這一段。 */
    maxTips: z.number().int().min(0).max(6).describe(
      "@zh 最多列幾條攻略要點\n" +
      "@note 文件裡那位英雄寫了幾條就有幾條，這一格是上限。**0 ＝ 不顯示攻略要點那一段**。⚠️ 條數直接換算成面板高度：中央走廊在矮螢幕（橫向平板）只有八十幾 px，填太多的結果不是擠在一起，是整段被丟掉（丟棄順序：描述 → 攻略要點 → 弱點）。",
    ),
    /** 最多列幾條弱點（超過的不畫）。0 = 不顯示這一段。 */
    maxWeaknesses: z.number().int().min(0).max(6).describe(
      "@zh 最多列幾條弱點\n" +
      "@note 同上，但弱點是**最後才被丟掉**的那一段 —— 它是「現在要怎麼打」的答案，描述只是身世。**0 ＝ 不顯示弱點那一段**。",
    ),
    /**
     * #291 —— **版面高度**。owner 2026-08-03:「殭屍王出場的描述框 不夠大
     * 描述還有很多沒顯示完」。
     *
     * ⚠️ 這一組以前是 `ui/hud/bossIntroModel.ts` 裡六個寫死的常數，而
     * `descriptionMaxChars` 是唯一可調的那一格 —— 於是**把字數調大完全看不出
     * 差別**：版面永遠只算 34px（約兩行）給描述，多出來的字被外框的
     * `overflow: hidden` 吃掉。三層各自獨立在吃字，只改一層等於沒改。
     *
     * ⚠️ 這幾格是**和 `BossIntroOverlay.tsx` 的 CSS 對齊的量**，不是隨便填的
     * 美感值：`descLineH` 要等於描述那一行的 `fontSize × lineHeight`
     * （出貨 12 × 1.35 ≈ 16.2 → 17），`descCharsPerLine` 是 460px 寬的面板扣掉
     * 24px 左右留白之後，12px 中文字大約塞得下的字數。填錯的代價是版面算出來的
     * 高度和畫出來的高度不一樣 —— 算太少會截字（就是這次的缺陷），算太多會在
     * 底下留一塊空白。
     */
    layout: z
      .object({
        /** 大字名言那一行的高度 */
        quoteH: z.number().min(0).max(200).describe(
          "@zh 大字名言那一行的高度（px）\n" +
          "@note 名言那一段在版面計算裡佔多高。⚠️ 出貨的名言**全部是空的**（資料是 GH#139／#142），而空的時候這一段整段不畫也不佔高度 —— 所以今天改這一格在畫面上看不到任何變化，要等名言真的填進去才有意義。填 0 等於名言有資料時也不替它留位置，字會和英雄名疊在一起。",
        ),
        /** 英雄名那一行的高度（這一行永遠在） */
        nameH: z.number().min(0).max(200).describe(
          "@zh 英雄名那一行的高度（px）\n" +
          "@note 英雄名是**唯一一定會出現**的那一行（描述／要點／弱點都可能被丟掉，它不會），所以這一格加上下面的外框留白就是這面提示的最低高度 —— 中央走廊比它還矮的時候，整面提示會直接不畫。填太小會讓名字和底下的描述黏在一起。",
        ),
        /** 描述**一行**多高 */
        descLineH: z.number().min(1).max(80).describe(
          "@zh 描述一行多高（px）\n" +
          "@note ⚠️ 這是**和面板 CSS 對齊的量**，不是美感值：它要等於描述那一行的字級 × 行高（出貨 12 × 1.35 ≈ 16.2，取 17）。填太小 → 算出來的高度比畫出來的矮，字會被外框截掉（就是 #291 那個缺陷）；填太大 → 描述底下留一塊沒有人用的空白，而且提早擠掉弱點。改字級的時候要一起改這一格。",
        ),
        /** 描述最多佔幾行 —— 這一格才是「描述框有多大」 */
        // [spec] ── #291 版面高度那一組 ────────────────────────────────────────────────
        // [spec] owner 2026-08-03：「殭屍王出場的描述框 不夠大 描述還有很多沒顯示完」。
        // [spec] ⚠️ 這一組在後台缺席時，上面的 描述最多顯示幾個字 是**調了看不出差別**的：
        // [spec] 字數放大了，但版面仍然只算得出兩行的高度，多出來的字被外框的
        // [spec] `overflow: hidden` 吃掉。兩層各自在吃字，只開放其中一層等於沒開放。
        descMaxLines: z.number().int().min(1).max(24).describe(
          "@zh 描述最多佔幾行\n" +
          "@note 這一格才是「描述框有多大」。上面的 描述最多顯示幾個字 決定截幾個字，這一格決定**畫得下幾行** —— 兩格取小的那一個才是玩家真正看得到的量，所以只調其中一格會出現「字數調大了但畫面一個字都沒多」。調大會往下擠掉攻略要點與弱點（丟棄順序見下面那張表），矮螢幕上更容易只剩名字。",
        ),
        /** 描述一行大約幾個字（換算行數用） */
        descCharsPerLine: z.number().int().min(1).max(200).describe(
          "@zh 描述一行大約幾個字\n" +
          "@note 把字數換算成行數用的除數（字數 ÷ 這一格 = 需要幾行），不會改變畫面上真正的換行位置 —— 真正的換行是瀏覽器做的。它只影響**版面替描述保留多少高度**：估太少會保留過多高度、白白擠掉弱點；估太多會保留不足、描述又被截掉。出貨 {{出貨值}} 是 460px 寬的面板扣掉左右留白之後 12px 中文字塞得下的量。",
        ),
        /** 一個段落標題（「攻略要點」／「弱點」）多高 */
        headH: z.number().min(0).max(120).describe(
          "@zh 段落標題的高度（px）\n" +
          "@note 「攻略要點」「弱點」這兩個小標題各佔多高。只有那一段真的有內容時才會算進去，所以它和下面那一格一起決定「多列一條要點要多付多少高度」。填太小會讓標題和第一條列點擠在一起，看起來像列點多了一條。",
        ),
        /** 一條列點多高 */
        rowH: z.number().min(0).max(120).describe(
          "@zh 一條列點的高度（px）\n" +
          "@note 攻略要點與弱點裡**每一條**佔多高，所以它會被條數乘起來：要點與弱點各 3 條時，這一格多 4px 就是版面多要 24px。走廊高度不夠時付不出這個高度的段落會被整段丟掉（不是擠成一團），所以調大它等於讓矮螢幕更早只剩名字。",
        ),
        /** 外框上下留白合計 */
        padH: z.number().min(0).max(120).describe(
          "@zh 外框上下留白合計（px）\n" +
          "@note 面板外框上下加起來的內距，一律先算進去（不管有幾段內容）。它直接吃掉可以給描述與列點的高度，所以在橫向平板那種八十幾 px 的走廊裡，調大這一格最先犧牲掉的是弱點那一段。",
        ),
      })
      .strict()
      .optional(),
    /**
     * #291 **決策點** —— 走廊高度不夠時**先丟哪一段**。
     * SHIPS `["description", "tips", "weaknesses"]`（＝這一格出現之前寫死的順序）。
     *
     * 為什麼它現在必須是一格：把描述框加高的代價是**矮螢幕上更容易連攻略要點都
     * 保不住**。原本的理由是「描述是身世故事，戰鬥中最不影響下一秒的動作；弱點是
     * 『現在要怎麼打』的答案，最後才丟」—— 那是一個判斷，不是一條定律，而它的
     * 後果會隨著描述變大而變重。填 `["tips","weaknesses","description"]` 就是
     * 「我寧可先保住描述」。列表裡沒提到的段落＝**最後才丟**。
     * 名言不在選項裡：它是 owner 指名的主角，而且只有真的有資料時才存在。
     */
    dropOrder: z.array(z.enum(["description", "tips", "weaknesses"])).max(3).optional(),
    /** championId -> 這一隻王穿上那張臉時要講什麼。沒有的 key = 那位沒有文案。 */
    champions: z.record(zBossIntroChampionEntry),
  })
  .strict();
export type BossIntroChampionEntry = z.infer<typeof zBossIntroChampionEntry>;
export type ConfigBossIntroDoc = z.infer<typeof zConfigBossIntroDoc>;

/**
 * 出貨預設 —— `content/config/boss-intro.json` 讀不到（舊部署、內容載入失敗、
 * 或 overlay 存了一份壞的）時，出場演出退回到的那一份。
 *
 * ⚠️ **`champions` 是空的，而那是刻意的。** 這是程式裡的保險絲，不是文案的第二
 * 份副本：兩份逐英雄文案就是兩份會 drift 的東西，而它們的分歧會以「線上看到的
 * 弱點跟後台填的不一樣」的形態出現。缺文件 = 只剩既有的降臨橫幅 + 那個英雄的
 * 描述（描述來自 champion doc，不需要這份文件）。
 *
 * 純量那幾格必須和 `content/config/boss-intro.json` 一字不差 ——
 * `apps/client/src/ui/hud/bossIntro.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_BOSS_INTRO: ConfigBossIntroDoc = {
  id: "boss-intro",
  schema: "config.boss-intro@1",
  enabled: true,
  introHoldSec: 5,
  fadeSec: 0.6,
  // #291 owner 2026-08-03「描述還有很多沒顯示完」—— 120 → 300。
  // ⚠️ 單獨調大這一格**看不出任何差別**（那正是缺陷的一半）：版面必須同時給得出
  // 高度，也就是下面 `layout.descMaxLines`。300 字 ÷ 36 字/行 ≈ 9 行 × 17px
  // ≈ 146px，1280×800 的中央走廊有 424px，連攻略要點與弱點一起放得下。
  descriptionMaxChars: 300,
  maxTips: 3,
  maxWeaknesses: 3,
  // #291 —— 和 `content/config/boss-intro.json` 一字不差；出貨值等於這一格出現
  // 之前 `bossIntroModel.ts` 那六個常數（DESC 那一格從「34px 固定」換成
  // 「一行 17px × 最多 10 行」，因為固定值就是缺陷本身）。
  layout: {
    quoteH: 42,
    nameH: 20,
    descLineH: 17,
    descMaxLines: 10,
    descCharsPerLine: 36,
    headH: 16,
    rowH: 17,
    padH: 14,
  },
  dropOrder: ["description", "tips", "weaknesses"],
  champions: {},
};

/**
 * 讀一份 `config.boss-intro@1`。文件不在／schema 不對／型別不合 →
 * {@link DEFAULT_BOSS_INTRO}。
 *
 * ⚠️ 一格一格檢查型別，不是 `doc as ConfigBossIntroDoc`。這份文件會被後台
 * overlay 覆蓋（`data/` 耐久層），而 overlay 的寫入路徑在 GH#283 被查出**沒有**
 * Zod 驗證 —— 也就是說一個 `introHoldSec: "5"` 真的有辦法躺在正式站上。到了
 * 這裡再一次把它擋掉，代價是幾行 typeof，換到的是「壞資料不會變成一個永遠不消失
 * 的全螢幕提示」。
 */
export function bossIntroFromDoc(doc: unknown): ConfigBossIntroDoc {
  const parsed = zConfigBossIntroDoc.safeParse(doc);
  return parsed.success ? parsed.data : DEFAULT_BOSS_INTRO;
}
