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
    enabled: z.boolean(),
    /**
     * 提示停留幾秒才開始淡出（owner 明說五秒）。
     * ⚠️ 這一格是欄位不是常數，因為 owner 對時長一向會調（火圈、商店倒數、
     * 死亡淡出都被改過）。上界 30 是誤植守衛：5 打成 50 會讓提示蓋著整場前半。
     */
    introHoldSec: z.number().min(0).max(30),
    /** 淡出花幾秒。0 = 直接消失（不建議：瞬間消失讀起來像掉幀）。 */
    fadeSec: z.number().min(0).max(5),
    /**
     * **決策點**：描述最多顯示幾個字，超過截斷加省略號。
     * champion doc 的 `description` 是完整故事（喪標麥可那一份 400 字以上），
     * 整段搬上戰鬥畫面就是一面牆。0 = 不顯示描述那一段。
     */
    descriptionMaxChars: z.number().int().min(0).max(400),
    /** 最多列幾條攻略要點（超過的不畫）。0 = 不顯示這一段。 */
    maxTips: z.number().int().min(0).max(6),
    /** 最多列幾條弱點（超過的不畫）。0 = 不顯示這一段。 */
    maxWeaknesses: z.number().int().min(0).max(6),
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
        quoteH: z.number().min(0).max(200),
        /** 英雄名那一行的高度（這一行永遠在） */
        nameH: z.number().min(0).max(200),
        /** 描述**一行**多高 */
        descLineH: z.number().min(1).max(80),
        /** 描述最多佔幾行 —— 這一格才是「描述框有多大」 */
        descMaxLines: z.number().int().min(1).max(24),
        /** 描述一行大約幾個字（換算行數用） */
        descCharsPerLine: z.number().int().min(1).max(200),
        /** 一個段落標題（「攻略要點」／「弱點」）多高 */
        headH: z.number().min(0).max(120),
        /** 一條列點多高 */
        rowH: z.number().min(0).max(120),
        /** 外框上下留白合計 */
        padH: z.number().min(0).max(120),
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
 * `apps/client/src/ui/hud/bossIntroShipped.test.ts` 的 drift 斷言在守。
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
