/**
 * `config.ranking@1` —— 排名獎勵（owner 2026-08-17：「**MMR 倍率跟賽季積分也是類似的
 * 規則**，獎勵大家多打真人賽，並且**真實記錄 vs 特定玩家的幾勝幾敗**來影響 MMR &
 * 賽季積分」）。
 *
 * ── ⚠️ 這一份的**消費端是 Go**，不是 TypeScript ────────────────────────────────
 * 讀它的是 `apps/platform/internal/ranking/standingsoverride.go` 的
 * `StandingsRulesNow()`，**每一場結算都重讀**一次覆蓋層。所以這個檔案在整條路上
 * 的角色只有兩個，兩個都不是「執行」：
 *   ① 讓 `content/config/ranking.json` 進得了內容 bundle（union 漏掉 = 整份內容
 *      驗證失敗 → 客戶端退回 2 隻骨架英雄，2026-08-02 事故的形狀）；
 *   ② 讓後台那一頁**長得出來**（通用引擎的結構全部從這份 Zod 走出來），
 *      而且**兩端都有界** —— Go 端超界會整份退回出貨值並吼一聲，這裡的界是為了
 *      讓操作者在**打錯的當下**就被擋住，而不是存完之後在別的機器上靜靜失效。
 *
 * ⚠️ 所以這裡的每一格上下界都是 `apps/platform/internal/ranking/standings.go` 的
 * `Standings*Min/Max` 的**鏡射**（跨語言，沒辦法 import）。
 * `rankingShipped.test.ts` 真的去讀那個 .go 檔逐格比對 —— 兩邊分歧就紅。
 *
 * ── 為什麼真人倍率有**兩份**（這裡一份、水晶一份）────────────────────────────
 * 藍水晶（經濟）與 MMR／賽季積分（排名）刻意是**兩組獨立的欄位**，出貨值一致但可以
 * 各自調：operator 想加碼經濟獎勵而不動排名，或反過來，都不該被迫連動。
 * ⛔ 但那條**算式**只有一份（`wallet.CrystalMultiplier`），這裡只提供參數。
 */
import { z } from "zod";

/** 文件 id（與檔名 `content/config/ranking.json` 對齊）。 */
export const RANKING_DOC_ID = "ranking";

/**
 * 上下界 —— **逐格鏡射 Go 端**的 `ranking.Standings*Min/Max` / `SharePct*` /
 * `RatingMaxPct*` / `Rivalry*`。⛔ 不要在這裡自己挑一個「看起來合理」的數字：
 * 兩邊不一致的後果是後台收得下、Go 端整份退回出貨值，而畫面上完全看不出來。
 */
export const RANKING_BOUNDS = {
  minHumans: { min: 1, max: 12 },
  offset: { min: 0, max: 12 },
  maxMultiplier: { min: 1, max: 50 },
  sharePct: { min: 0, max: 100 },
  ratingMaxPct: { min: 100, max: 1000 },
  rivalryPct: { min: 0, max: 500 },
  rivalryHalfLife: { min: 1, max: 1000 },
} as const;

const int = (b: { min: number; max: number }) => z.number().int().min(b.min).max(b.max);

/**
 * 真人倍率的三格。倍率 = 整場真人數 N ≥ `minHumans` 時 `min(N + offset, maxMultiplier)`，
 * 否則 **1**（＝ 全 bot 局一毛加成都沒有）。
 * owner 2026-08-17：「只要有兩真人參加，**不論哪個陣營**，所有玩家都 (N+1) 倍，最大 13 倍」。
 */
export const zRankingHumanMultiplier = z
  .object({
    minHumans: int(RANKING_BOUNDS.minHumans).describe(
      "@zh 真人門檻（幾人才算真人賽）\n" +
      "@note **整場**至少要有幾個真人，這一場才拿得到倍率；沒到門檻倍率就是 1，賽季積分與 MMR 都照原本的量走。⚠️ 數的是整場**不分陣營**（owner:「不論哪個陣營」），⛔ 不是自己這一隊 —— 所以一個人帶一個朋友進來就開得起加成。調到 1＝連單人 bot 局都算真人賽，那會讓刷 bot 局變成最有效率的爬分路線。\n" +
      "**整場**至少要有幾個真人，這個 lobby 才算「真人賽」。沒到門檻 → 倍率 1，賽季積分與 MMR 都照原本的量走。⚠️ 數的是整場（不分陣營），⛔ 不是自己這一隊 —— 所以一個人帶朋友進來就開得起加成，⛔ 不必湊滿兩隊。調高＝更難觸發加成，調到 1＝連單人 bot 局都算真人賽（那會讓刷 bot 局變成最有效率的爬分手段）。"
    ),
    offset: int(RANKING_BOUNDS.offset).describe(
      "@zh 倍率加成（真人數 + 這一格）\n" +
      "@note 倍率 = 真人數 **+ 這一格**。2 個真人 × 出貨 {{出貨值}} ⇒ 3 倍，12 人滿房 ⇒ 13 倍（owner 的原話）。調到 0＝倍率就等於真人數本身（2 人只有 2 倍）。⚠️ 它把**每一級**都往上推，動的是整條曲線的高度不是只有起點。\n" +
      "倍率 = 真人數 **+ 這一格**。出貨 {{出貨值}} ⇒ 2 個真人 = 3 倍、12 個真人 = 13 倍（owner 的原話）。調到 0＝倍率就等於真人數本身（2 人只有 2 倍）。⚠️ 它同時把**每一級**都往上推，所以它動的是整條曲線的高度，不是只有起點。"
    ),
    maxMultiplier: int(RANKING_BOUNDS.maxMultiplier).describe(
      "@zh 倍率上限\n" +
      "@note 倍率的天花板（出貨 {{出貨值}} = 12 人滿房 +1）。⚠️ 它是**保險絲**：房間人數上限哪天變大時，沒有這一格就會讓一場的產出跟著人數無限長。調低＝滿房與半房的差別被抹平，多找人一起打的誘因跟著消失。\n" +
      "倍率的天花板。出貨 {{出貨值}} ＝ 12 人滿房 +1（owner 的「最大 13 倍」）。⚠️ 它是**保險絲**不是平衡旋鈕：房間人數上限變大時，沒有這一格就會讓一場的產出跟著人數無限長。調低＝滿房與半房的差別被抹平。"
    ),
  })
  .strict();

/**
 * 兩種東西**各吃多少**倍率。
 *
 * ⭐ 賽季積分吃滿、MMR 只吃一小部分，這是**設計判斷**不是做一半：
 * Elo 是一個**收斂到真實實力的估計值**，它的數學前提是「每場移動一個與 K 成比例的
 * 小量、長期收斂」。把一場真人賽的變動直接乘 13，排名會劇烈震盪，而且**打一場 bot 局
 * 就把它拉回去**（bot 局倍率是 1，同一個實力估計被兩種尺度輪流拉扯，估得更差）。
 */
export const zRankingShare = z
  .object({
    seasonPointsPct: int(RANKING_BOUNDS.sharePct).describe(
      "@zh 賽季積分吃多少倍率\n" +
      "@note 賽季積分（含每位英雄的積分）吃多少真人倍率。100（出貨值）＝ 吃滿，13 倍的房就是 13 倍的名次分；50＝只吃一半的增幅；0＝賽季積分完全不理會真人數。⚠️ 只放大**正的**名次分 —— 把 −30 的懲罰乘 13 不是獎勵，而 owner 那句話是「獎勵大家多打真人賽」。\n" +
      "**賽季積分**（含每位英雄的積分）吃多少倍率。100（出貨值）＝ 吃滿，13 倍的 lobby 就是 13 倍的名次分；50＝只吃一半的增幅；0＝賽季積分完全不理會真人倍率。⚠️ 只放大**正的**名次分 —— 把 −30 的懲罰乘 13 不是獎勵。"
    ),
    ratingPct: int(RANKING_BOUNDS.sharePct).describe(
      "@zh MMR 吃多少倍率\n" +
      "@note MMR（Elo）的 K 值吃多少增幅，出貨 **{{出貨值}}** —— 13 倍的房讓 K 變成 4 倍，再由下面那格夾在 3 倍。⭐ 刻意不吃滿：Elo 是**收斂到真實實力的估計值**，把一場的變動乘 13 會讓排名劇烈震盪。真人賽該多算的那一半，主力交給下面的「bot 局 MMR 折扣」去**縮小 bot 賽**，而不是無限放大真人賽。調到 100＝ MMR 也吃滿倍率（排名會很暴力）；0＝ MMR 完全不受真人數影響，只剩宿敵加成。\n" +
      "**MMR（Elo）的 K 值**吃多少倍率。出貨 **{{出貨值}}**：13 倍的 lobby 讓 K 變成 4 倍，再由下面那格夾在 3 倍。⭐ 刻意不吃滿 —— Elo 是「收斂到真實實力的估計值」，直接乘 13 會讓排名劇烈震盪。真人賽該多算的那一半，主要交給下面的**bot 局 K 值**去縮小 bot 賽，而不是無限放大真人賽。調到 100＝ MMR 也吃滿倍率（排名變化會很暴力）；調到 0＝ MMR 完全不受真人數影響。"
    ),
    ratingMaxPct: int(RANKING_BOUNDS.ratingMaxPct).describe(
      "@zh MMR 單場變動上限\n" +
      "@note Elo 的 K 值最多變成原本的百分之幾（出貨 {{出貨值}} = 3 倍）。⚠️ **宿敵加成也算在這個天花板裡**，所以它是「一場最多能撼動排名多少」的單一保險絲。100＝完全不放大，也就是排名側的加成整個關掉。\n" +
      "MMR 的 K 值**最多**變成原本的百分之幾（出貨 {{出貨值}} ＝ 3 倍）。⚠️ 宿敵加成也算在這個天花板裡，所以它是「一場最多能撼動排名多少」的**單一保險絲**。100＝完全不放大（等於關掉排名側的加成）。"
    ),
    botKPct: int(RANKING_BOUNDS.sharePct).describe(
      "@zh bot 局 MMR 折扣\n" +
      "@note **純 bot 局**（真人數沒到「最少真人數」）的 Elo K 值只算百分之幾，出貨 **{{出貨值}}**。⭐ owner 2026-08-17：「bot AI 的行為模式太容易被克制，並沒有太高的鑑別度」——一場 bot 局**資訊量低**，本來就該少移動排名一點。⚠️ 這是 Elo 的 K 本來的語意（這一場有多值得相信），⛔ 不是懲罰。0＝ bot 局完全不動 MMR；100＝ bot 局跟真人局一樣重（這一格關掉）。⛔ 只影響 MMR，**不影響**水晶、賽季積分與英雄積分。\n" +
      "**純 bot 局**（真人數沒到「最少真人數」）的 MMR K 值只算百分之幾。出貨 **{{出貨值}}**。⭐ owner 2026-08-17：「bot AI 的行為模式太容易被克制，並沒有太高的鑑別度」——所以一場 bot 局本來就**資訊量低**，該少移動排名一點。⚠️ 這不是懲罰，是 Elo 的 K 本來的語意（這一場有多值得相信）。0＝ bot 局完全不動 MMR；100＝ bot 局跟真人局一樣重（＝這一格關掉）。⛔ 它只影響 MMR，**不影響**水晶、賽季積分與英雄積分。"
    ),
  })
  .strict();

/**
 * 宿敵加成（head-to-head）。
 * 加成 = `basePct` × `halfLife/(halfLife + 淨勝)` × `repeatHalfLife/(repeatHalfLife + 已對戰場數)`。
 *
 * ⭐ 兩個因子都**只會遞減**，而第二個是**反刷分的那一道閘**（見 `repeatHalfLife`）。
 */
export const zRankingRivalry = z
  .object({
    basePct: int(RANKING_BOUNDS.rivalryPct).describe(
      "@zh 宿敵加成・基礎值\n" +
      "@note 勝負持平、而且**初次交手**時，打贏這個對手額外拿到的百分比。它是整條曲線的高度，下面兩格都是從這個數字往下折。0＝整個宿敵系統關掉，也就是這個功能出現之前的行為（一鍵 rollback）。\n" +
      "勝負持平、而且**初次交手**時，打贏這個對手額外拿到的百分比。它是整條曲線的高度：所有遞減都是從這個數字往下折。0＝整個宿敵系統關掉（一鍵 rollback）。"
    ),
    halfLife: int(RANKING_BOUNDS.rivalryHalfLife).describe(
      "@zh 宿敵加成・淨勝衰減\n" +
      "@note 對這個人的**淨勝場**每增加大約這麼多，加成砍半。出貨 {{出貨值}} ⇒ 贏一個過去把你打爆的對手加成最高，而重複輾壓同一個人時淨勝一路上升、加成一路掉。調大＝加成掉得慢，輾壓同一個人比較久還有賺頭。\n" +
      "**淨勝場**每增加大約這麼多，加成砍半。出貨 {{出貨值}} ⇒ 贏一個過去把你打爆的對手加成最高，而重複輾壓同一個人時淨勝一路上升、加成一路掉。調大＝加成掉得慢（輾壓同一個人比較久還有賺頭）。"
    ),
    repeatHalfLife: int(RANKING_BOUNDS.rivalryHalfLife).describe(
      "@zh 宿敵加成・重複對戰衰減（反刷分）\n" +
      "@note ⭐ **這一格是反刷分的閘**：這一對**打過的總場數**每增加大約這麼多，加成砍半 —— ⛔ 不管勝負怎麼分。⚠️ 少了它，兩個帳號輪流讓對方贏就能把**淨勝永遠壓在 0**，於是上一格永遠不生效、加成永遠是滿的。有了它之後，同一對帳號打得越多這條路的產出越接近零，**跟不同的人打**才拿得到加成。調大＝互餵分的窗口變寬，⛔ 調大之前先想清楚這一點。\n" +
      "⭐ **反刷分的閘**：這一對**打過的總場數**每增加大約這麼多，加成砍半 —— ⛔ 不管勝負怎麼分。⚠️ 少了這一項，兩個帳號輪流讓對方贏就能把**淨勝永遠壓在 0**，於是上面那一項永遠是滿的、加成也永遠是滿的。加上它之後，同一對帳號打得越多這條路的產出越接近零，而**跟不同的人打**才拿得到加成 —— 這正是 owner 要的「獎勵大家多打真人賽」。調大＝互餵分的窗口變寬。"
    ),
    maxPct: int(RANKING_BOUNDS.rivalryPct).describe(
      "@zh 宿敵加成・單場總上限\n" +
      "@note 一場之內**所有**被打敗的對手的宿敵加成加起來的上限（單一對手也吃這個上限）。它擋的是「一場打贏六個宿敵」把加成疊成天文數字。⚠️ MMR 那一側還要再吃一次上面的「MMR 單場變動上限」，賽季積分那一側只吃這一格。\n" +
      "一場之內**所有**被打敗的對手的宿敵加成加起來的上限（單一對手也吃這個上限）。⚠️ 它擋的是「一場打贏六個宿敵」把加成疊成天文數字；MMR 那一側還要再吃一次「K 值上限」。"
    ),
  })
  .strict();

export const zConfigRankingDoc = z
  .object({
    id: z.literal(RANKING_DOC_ID),
    schema: z.literal("config.ranking@1"),
    note: z.string().optional(),
    humanMultiplier: zRankingHumanMultiplier,
    share: zRankingShare,
    rivalry: zRankingRivalry,
  })
  .strict();

export type RankingHumanMultiplier = z.infer<typeof zRankingHumanMultiplier>;
export type RankingShare = z.infer<typeof zRankingShare>;
export type RankingRivalry = z.infer<typeof zRankingRivalry>;
export type ConfigRankingDoc = z.infer<typeof zConfigRankingDoc>;

/**
 * 出貨值 —— **逐格等於** Go 端的 `ranking.DefaultStandingsRules()`。
 *
 * ⚠️ 這一份不是「TypeScript 的預設值」：缺文件時真正生效的是 Go 那一份。
 * 它們分歧的後果最惡劣 —— 後台顯示 13、玩家那一場拿到 10，而**兩邊都沒有錯誤訊息**。
 * `rankingShipped.test.ts` 讀真的 .go 檔比對。
 */
export const DEFAULT_RANKING: ConfigRankingDoc = {
  id: RANKING_DOC_ID,
  schema: "config.ranking@1",
  humanMultiplier: { minHumans: 2, offset: 1, maxMultiplier: 13 },
  share: { seasonPointsPct: 100, ratingPct: 25, ratingMaxPct: 300, botKPct: 40 },
  rivalry: { basePct: 20, halfLife: 3, repeatHalfLife: 10, maxPct: 60 },
};
