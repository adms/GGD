import { z } from "zod";
import { zId } from "../common";

/**
 * `config.ugc@1` —— ⭐⭐ **玩家自製內容（UGC）的提交閘**（GH#991）。
 *
 * > owner 2026-09-05（逐字）：「開放讓玩家自己設計 英雄、技能、特效，
 * >  **不是靠 AI 無止境的逼近太沒效率**」
 *
 * ⭐ 這一份**只管「那條路開不開、開多大」**，⛔ 不管內容長什麼樣 ——
 * 提交格式沿用既有的 `ggd-ai-authoring-operation@1`（票文 Scope 3 逐字
 * 「⛔ 不設計第二種格式」），機器閘沿用 `content:build` 的嚴格 Zod 與
 * `noOpModifierClaims` / `vfxDocsBirthVisibility` 那一族。
 *
 * ── ⭐ 六格全部是 owner **沒有裁決**的決策點 ────────────────────────────────
 * owner 2026-08-23 常設指令逐字：「**沒做完以前別問我了自己判斷 但是留後台開關
 * 可以簡易 rollback**」⇒ ⭐ 我挑了預設，⛔ 而每一個選擇都是一格下拉選單。
 *
 * | 題 | 我挑的 | 為什麼 |
 * |---|---|---|
 * | 這條路現在開不開 | ⭐ **關** | ⛔ 流水線只做完第一段（見下一段） |
 * | 匿名送得進來嗎 | ⭐ **不行** | 配額是按玩家算的 —— 沒有身分就沒有配額主體 |
 * | 一個玩家可以積幾份待審 | ⭐ **5** | 人審是漏斗最窄的一段（owner 一個人） |
 * | 一天送幾份 | ⭐ **20** | 待審深度擋不住「送了退、退了再送」 |
 * | 一份最大幾 byte | ⭐ **256 KiB** | ⭐ 量到的：出貨最大的一份 ability JSON 是 **57,748 byte**（champion 25,688）⇒ 4.5 倍餘裕 |
 * | 過了機器閘就上架嗎 | ⭐ **不** | 票文 Scope 1 逐字「上架一律過 HITL」 |
 *
 * ── ⭐⭐ `enabled` 出貨是 **true**（2026-09-09 起）—— ⛔ 而它是被**條件**打開的 ────
 *
 * owner 2026-09-09 逐字：
 *
 * > 「ugc.enabled: false → true（UGC ＝ 玩家自製內容）=> **開**，
 * >  我們總共新增兩批 **37+37=74** 個新英雄喔」
 *
 * ⚠️⚠️ ⭐ **這一段在 2026-09-09 之前逐字寫著「為什麼 `enabled` 出貨是 false」** ——
 * ⛔ 而那句話在開關被翻開的那一刻就變成假話，⭐ 且**沒有任何東西會紅**
 * （第三守則的形狀，發生在「大家先讀的那一格」上）。
 * ⇒ ⭐ 這裡記下**當時那個 false 的理由**，因為它同時是**關回去的條件**：
 *
 * | 當年不開的理由 | 2026-09-09 的狀態 |
 * |---|---|
 * | 身分檢查沒有 | ✅ `requireAuth: true` |
 * | 配額計數沒有 | ✅ `quotaPerPlayerPerDay: 20` · `maxPendingPerPlayer: 5` |
 * | 大小上限沒有 | ✅ `maxBytes: 262144` |
 * | 嚴格 Zod | ✅ 提交格式沿用 `ggd-ai-authoring-operation@1` |
 * | ⭐ **前提閘從紅轉綠** | ✅ `internal/server/ugcgate_routes_test.go` 的 <br> `TestUgcEnabledGatesEveryRegisteredSubmissionWrite` **PASS** |
 *
 * ⚠️ ⭐ **那支閘的名字換過**（GH#1103）：在此之前這裡寫的是 `ugcGateIsArmed.test.ts`，
 * ⛔ 而那條掃的是 `ugc/(proposals|submissions)` 這個**路徑形狀**、對真入口
 * （`POST /api/v1/submissions`）**零命中就直接 return** ⇒ ⭐ 它永遠不會從紅轉綠，
 * 那個條件寫著等於沒寫（失敗形態⑥＋⑨）。⇒ ⭐ **現在的前提是從 `chi.Walk` 推導真入口的那一支。**
 *
 * ⭐ 而「關回去」的語意仍然是**停收件**，⛔ 不是停發布 ——
 * `promote` 是**所有**審核通過內容的出貨路徑（⛔ 不只 UGC），掛上這一格會連編輯器投稿一起擋死。
 */
export const zConfigUgcDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ugc@1"),
    note: z.string().optional(),
    heroModelUploadsEnabled: z.boolean().optional().describe("@zh 開放英雄模型與動作庫上傳\n@note 留空或開啟時，允許登入作者保存私人 GLB 原檔並投稿上傳模型；關閉會停止新模型上傳及新投稿，已保存原檔與既有發布版仍可讀取。"),
    heroModelMaxBytes: z.number().int().min(4096).max(64 * 1024 * 1024).optional().describe("@zh 含上傳模型的完整英雄 ZIP 上限\n@note 僅用於含上傳 GLB 的完整英雄；最大 64 MiB，GLB 單檔仍最多 32 MiB。留空時沿用一般投稿大小，不改變單份技能或素材的上限。"),
    /**
     * ⭐⭐ **總開關 ＝ 一鍵 rollback。** 關掉之後，任何玩家提交會被**明確拒絕**
     * （`UGC_DISABLED`，HTTP 403）—— ⛔ 不是靜靜地收下再丟掉。
     *
     * ⚠️ 關掉它**不會**動到任何已經上架的 UGC 內容（那要清白名單，是另一個動作）。
     * ⇒ 這一格答的是「**還收不收新的**」，⛔ 不是「**已經在的還算不算數**」。
     */
    enabled: z.boolean().describe(
      "@zh 收不收玩家提交（總開關）\n" +
      "@note ⭐⭐ **這一格就是整個 UGC 的一鍵 rollback。** 出貨 **{{出貨值}}**。關掉時，玩家提交會被**明確拒絕**（診斷碼 `UGC_DISABLED`，HTTP 403）——⭐ 而不是靜靜地收下再丟掉，⚠️ 因為「靜靜丟掉」會讓玩家以為自己的作品在排隊。⛔⛔ **打開它之前先看下面三格**：票文的風險段逐字寫著「配額 ＋ 位元組上限 ＋ 嚴格 Zod 是最低配，**缺一個就不要打開**」—— 提交端點是一個**對外的寫入面**，而它今天連身分都還沒有。⚠️ 關掉它**不會**下架任何已經上線的玩家作品（那要去清白名單）。",
    ),
    /**
     * ⭐ 提交要不要帶玩家身分。**出貨 on ＝ fail-closed。**
     *
     * ⛔ 關掉它的後果比「少一個登入」嚴重得多：配額（下面兩格）是**按玩家**算的，
     * 沒有身分就沒有配額主體 ⇒ ⭐ 三格限制**一起失效**，
     * 而畫面上看起來只是「不用登入比較方便」。
     *
     * ⚠️ 它也是「退回原因」寄得回去的唯一理由 —— 匿名提交被退，沒有人收得到。
     */
    requireAuth: z.boolean().describe(
      "@zh 提交必須帶玩家身分\n" +
      "@note 出貨 **{{出貨值}}**（fail-closed）。⛔⛔ 關掉它的後果比「少一道登入」嚴重得多：下面兩格配額是**按玩家**算的，沒有身分就沒有配額主體 ⇒ ⭐ **三格限制一起失效**，⚠️ 而畫面上看起來只是「不用登入比較方便」。⭐ 它也是「退回原因」寄得回去的唯一理由 —— 匿名提交被退，沒有人收得到那句話。",
    ),
    /**
     * 一個玩家同時可以有幾份**待審**。
     *
     * ⭐ 這一格擋的是**人審佇列**（漏斗最窄的一段：owner 一個人在按）。
     * ⚠️ 上界 200：再高就等於沒有擋 —— 一個人塞滿 200 份，批次審查頁那一天
     * 就只有他的東西。
     */
    maxPendingPerPlayer: z.number().int().min(1).max(200).describe(
      "@zh 一個玩家同時可以有幾份待審\n" +
      "@note 出貨 **{{出貨值}}** 份。⭐ 這一格擋的是**人審佇列** —— 漏斗最窄的一段是「有人一份一份看」，⛔ 不是機器。⚠️ 上界 200：再高就等於沒有擋 —— 一個人塞滿 200 份，那一天的批次審查頁就只有他的東西，其他玩家的作品**看起來像沒送到**。⚠️ 它只數**待審**的：被退回或被上架之後那個名額就還回去了。",
    ),
    /**
     * 一個玩家**一天**送得出幾份（不論後來被退還是被收）。
     *
     * ⚠️ ⭐ 它與上面那格**不是同一件事**：待審深度擋得住「一次塞爆佇列」，
     * ⛔ 擋不住「送一份、被退、立刻再送一份」那種**磨佇列**的節奏。
     * ⇒ 兩格分別回答「同時多少」與「多快」。
     */
    powerUserQuotaPerDay: z.number().int().min(1).max(500).optional().describe(
      "@zh 認證 Power User 每日英雄投稿額度\n" +
      "@note 僅管理員認證的 power-user 帳號適用；撤銷認證後即恢復一般額度。未設定時沿用一般額度，待審數與人工審查照常。",
    ),
    quotaPerPlayerPerDay: z.number().int().min(1).max(500).describe(
      "@zh 一個玩家一天送得出幾份\n" +
      "@note 出貨 **{{出貨值}}** 份／天（不論後來被退還是被收）。⚠️ ⭐ 它與上面那格**不是同一件事**：待審深度擋得住「一次塞爆佇列」，⛔ 擋不住「送一份、被退、立刻再送一份」那種**磨佇列**的節奏 ——後者的待審深度永遠是 1，而它可以整天佔著審查者的注意力。⇒ 兩格分別回答「**同時**多少」與「**多快**」。",
    ),
    /**
     * 一份提交的位元組上限。
     *
     * ⭐ 出貨值從**量到的**東西挑：出貨最大的一份 ability JSON 是 57,748 byte、
     * champion 25,688 byte ⇒ 256 KiB 給 4.5 倍餘裕。
     * ⚠️ 下界 4 KiB（比最小的出貨文件還大 —— 填得比那更低等於整條路關掉，
     * ⛔ 而那應該用 `enabled` 表達，不是用一個看起來像設定的數字）。
     * ⚠️ 上界 4 MiB：⭐ 這一格擋的是**記憶體**，⛔ 不是磁碟 —— 提交要整份
     * parse 成 JSON 才驗得動，而 JSON.parse 的峰值是位元組數的好幾倍。
     */
    maxBytes: z.number().int().min(4096).max(4194304).describe(
      "@zh 一份提交最大幾 byte\n" +
      "@note 出貨 **{{出貨值}}**（256 KiB）。⭐ 這個數字是**量出來的**：出貨最大的一份技能 JSON 是 57,748 byte、英雄 25,688 byte ⇒ 4.5 倍餘裕。⚠️ ⭐ 它擋的是**記憶體**，⛔ 不是磁碟 —— 提交要整份 parse 成 JSON 才驗得動，而 JSON.parse 的峰值是位元組數的好幾倍。上界 4 MiB。⚠️ 下界 4 KiB（比最小的出貨文件還大）是刻意的：填得比那更低等於整條路關掉，⛔ 而那應該用**總開關**表達，不是用一個看起來像調整的數字。",
    ),
    /**
     * 過了機器閘之後**直接上架**，⛔ 不進人審佇列。
     *
     * ⭐ 出貨 **off** —— 票文 Scope 1 逐字「上架一律過 HITL」。
     * ⛔⛔ 打開它的後果要看清楚：機器閘答得出「這份 JSON 合不合法」，
     * ⚠️ 答不出「這支技能像不像那個名字」「這個特效在戰鬥中讀不讀得出來」——
     * ⭐ 那正是 owner 2026-08-24 定義的 Tier2 語意題，而 Tier2 只有人做得到。
     */
    autoPromote: z.boolean().describe(
      "@zh 過了機器閘就直接上架\n" +
      "@note 出貨 **{{出貨值}}**。⭐ 關著＝**一律過人審**（票文逐字「上架一律過 HITL」）。⛔⛔ 打開它的後果要看清楚：機器閘答得出「這份 JSON 合不合法」、「這條效果會不會什麼都不做」、「這個特效是不是出生就全透明」，⚠️ 答不出「這支技能**像不像**它的名字」「這個特效在戰鬥中**讀不讀得出來**」——⭐ 那是 owner 2026-08-24 分層漏斗裡的 Tier2 語意題，而 Tier2 只有人做得到。⇒ 打開它等於把 Tier2 整層拿掉，而**沒有任何東西會紅**。",
    ),
    /**
     * ⭐⭐ GH#1025 —— **發布之後多久到玩家眼前**。
     *
     * ── ⛔ 在此之前這一題**沒有答案** ──────────────────────────────────────
     * 覆蓋層改動的熱生效那條路逐字寫著 `run: async () => ({ ok: false })` ＋
     * 「這一台 shard **到重啟為止都不會用**」⇒ ⭐ 按下發布之後
     * 「什麼時候生效」取決於**哪一台 shard 什麼時候重啟** —— ⛔ 那不是「慢」，
     * 是**量不到**。
     *
     * ── ⭐ 兩條路，⛔ 而兩條都只影響「下一次開房」 ─────────────────────────
     * | 值 | 什麼時候把新文件註冊進登錄表 |
     * |---|---|
     * | ⭐ `immediate`（出貨） | 平台一公告就套用 ⇒ **幾秒後**開的房就有它 |
     * | `next-match` | 延到**下一次開房**那一刻才套用（最嚴格的邊界） |
     *
     * ⚠️ ⭐ **兩條路都不會動到進行中的對局**：白名單與內容都是在 `onCreate`
     * 取快照的（`MatchRoom.buildMatch`），⛔ 而熱套用**只加新文件**——
     * 已經註冊過的 id 一律**原封退回開機時那一份**（連物件參照都一樣）。
     * ⇒ 一份「改掉既有技能」的覆蓋**不會**被熱套用，它會被**指名列出來**
     *   並且仍然要重啟（⭐ 那是誠實，⛔ 不是偷懶：改掉一支正在被使用的技能
     *   就是 CLAUDE.md 記過的「對局中途換版」）。
     *
     * ⭐ 我挑 `immediate` 當預設（owner 2026-08-23 常設指令：「沒做完以前別問我了
     * 自己判斷 但是留後台開關可以簡易 rollback」）——理由是驗收案例逐字要求
     * 「按下通過之後，那隻英雄在**下一場**社群房裡選得到」，而 `next-match`
     * 在一台**沒有人開房**的 shard 上會讓那句話變成「永遠不會」。
     */
    publishMode: z.enum(["immediate", "next-match"]).describe(
      "@zh 發布之後多久到玩家眼前\n" +
      "@note 出貨 **{{出貨值}}**（GH#1025）。⭐ `immediate` ＝ 平台一公告，這一台 shard 就把**新增的**內容文件註冊進登錄表 ⇒ **幾秒後**開的房就選得到；`next-match` ＝ 延到**下一次開房**那一刻才套用。⚠️ ⭐ **兩條路都不會動到進行中的對局** —— 白名單與內容都在開房那一刻取快照，而熱套用**只加新文件**：已經註冊過的 id 一律原封退回開機時那一份。⛔ 所以一份「**改掉**既有技能／設定」的覆蓋**不會**被熱套用 —— 它會被指名列在 `/healthz` 上並且仍然需要重啟（⭐ 那是誠實：改掉一支正在被使用的技能就是「對局中途換版」）。⚠️ 在這一格出現之前，答案是「**到重啟為止都不會用**」，而畫面上沒有任何地方說得出來。\n" +
      "@opt immediate 立刻（預設・公告當下就套，下一次開房選得到）\n" +
      "@opt next-match 下一場（延到下一次開房那一刻才套）",
    ),
    /**
     * ⭐⭐ GH#1025 Scope C —— **社群內容只進社群房**。
     *
     * ── ⭐ 它到底在開關什麼 ─────────────────────────────────────────────────
     * on（出貨）⇒ 一間 `contentPool: "official"` 的房（＝房主沒選時的預設）
     * 在**開房那一刻**把「社群來的 id」從白名單裡**減掉**：
     * 選角、隨機池、bot、商店、掉落、EX 全部跟著收窄 —— ⭐ 因為它們**全部**
     * 走同一個 `Whitelist` seam，⛔ 而不是六個各自的 if。
     *
     * off ⇒ ⭐ **「社群內容」這個分類整個不生效**：每一間房都看得到玩家做的
     * 東西。⚠️ 這正是這一格存在的理由 —— 它是**一鍵 rollback**
     * （owner 2026-08-23 常設指令：「自己判斷 但是留後台開關可以簡易 rollback」）。
     *
     * ── ⚠️ 它**不是**「要不要收社群投稿」 ───────────────────────────────────
     * 那是 `enabled`。這一格答的是「**已經上架的**社群內容，官方房看不看得到」。
     * ⛔ 關掉它不會下架任何東西，也不會多收任何東西。
     *
     * ── ⭐ 我挑 on 的理由 ───────────────────────────────────────────────────
     * 票文驗收逐字：「社群內容**預設只在社群房**出現；官方房**選不到**」。
     * ⇒ 第〇·六守則「優先權大的更新後都是預設啟動」。
     *
     * ⚠️ ⭐ **fail-open 的方向**：shard 抓不到社群清單時**不減**（官方房會看到
     * 社群內容），⛔ 不是「把整份白名單清空」——後者會讓一次平台抖動變成
     * 「這一場沒有英雄可以選」。⭐ 而它**不是靜默的**：那一次抓取失敗上
     * `/healthz` 的 degradation（`community-content-*`）。
     */
    communityRoomOnly: z.boolean().describe(
      "@zh 社群內容只進社群房\n" +
      "@note 出貨 **{{出貨值}}**（GH#1025）。⭐ 開著時，一間**官方房**（房主沒選內容池時的預設）在**開房那一刻**把「玩家投稿發布的」id 從白名單裡減掉 —— 選角、隨機英雄、bot、商店、掉落、EX **一起**收窄（它們全部走同一個白名單 seam）。房主開房時選 `community` 就看得到全部。⛔⛔ 關掉它等於**「社群內容」這個分類整個不生效**：玩家做的英雄會出現在**每一間房**。⭐ 它是這條線的一鍵 rollback，⛔ 不是「要不要收投稿」（那是最上面那一格），也不會下架任何已經上架的東西。⚠️ 「哪些 id 是社群來的」是在**發布那一刻**記進耐久覆蓋層的，⛔ 不是 shard 猜的 ⇒ **重啟前後同一個答案**。⚠️ 平台抓不到那份清單時**不減**（官方房會看到社群內容）——⛔ 刻意不選「整份清空」，因為那會讓一次抖動變成「沒有英雄可以選」；而那一次失敗會上 `/healthz`。",
    ),
    /**
     * ⭐⭐ GH#1022 —— 投稿的 `packageDigest` 由**伺服器重算**並與客戶端宣稱的比對。
     *
     * ── ⛔ 關掉之前先看它擋的是什麼 ──────────────────────────────────────
     * 2026-09-06 之前 `submissions.go` 只檢查 digest **非空** ⇒ ⭐ 「核准的是不是同一份」
     * 比對的是**兩個客戶端自稱的字串** —— 一份改了內容卻沿用舊 digest 的投稿，
     * 舊核准會**繼續有效**（審核被繞過，而畫面上完全看不出來）。
     *
     * ── ⭐ on（出貨）＝ platform 在 Submit 時呼叫 content-api 的
     *    `POST /content-import/digest`（TS 側**唯一**那份 `packageDigest()`，
     *    ⛔ Go 不手寫第二份 JCS）：
     *    · 對不上 ⇒ **400** 並指名是哪一份文件（`ENTRY_HASH_MISMATCH` 的 path）
     *    · content-api 沒設定／連不上 ⇒ **503**（fail-loud，⛔ 不退回「當成通過」）
     * ── ⛔ off ＝ 回到 2026-09-06 之前的行為（只驗非空）。它存在是為了**一鍵回頭**
     *    （例：content-api 掛了而投稿必須開著），⛔ 不是為了觀望。
     *
     * ⚠️ 讀不到這份設定 ⇒ Go 側視為 **on**（fail-closed）。
     */
    digestRecompute: z.boolean().describe(
      "@zh 投稿的內容指紋由伺服器重算比對\n" +
      "@note 出貨 **{{出貨值}}**（GH#1022）。⭐ 開著時，每一份投稿的 `packageDigest` 由 **platform 送去 content-api 重算**（TS 側唯一那份 `packageDigest()`），與客戶端宣稱的比對：對不上 ⇒ **400** 並指名是哪一份文件對不上；content-api 沒設定（`GGD_CONTENT_API_URL`）或連不上 ⇒ **503**（⛔ 不會退回「當成通過」）。⛔⛔ 關掉它等於回到「digest 是客戶端自己說的」—— 一份改了內容卻沿用舊 digest 的投稿，**舊核准會繼續有效**（審核被繞過，而畫面上完全看不出來）。⭐ 這一格存在是為了一鍵回頭（例：content-api 暫時掛了而投稿必須開著），⛔ 不是為了觀望。⚠️ 後台存檔**當下**生效（platform 每一次投稿都重讀），⛔ 不必重啟。"
    ),
  })
  .strict();

export type ConfigUgcDoc = z.infer<typeof zConfigUgcDoc>;

/** 出貨文件的 id。⭐ 消費端一律用它，⛔ 不要重打字串。 */
export const UGC_DOC_ID = "ugc";

/**
 * ⭐ 出貨值。`content/config/ugc.json` 與後台那一頁都要與它一致
 * （三個住處 + drift 測試，第一守則）。
 */
export const DEFAULT_UGC: ConfigUgcDoc = Object.freeze({
  id: UGC_DOC_ID,
  schema: "config.ugc@1",
  // ⭐⭐ owner 2026-09-09 逐字裁決：「**開**，我們總共新增兩批 37+37=74 個新英雄喔」
  //   ⇒ 前置條件（檔頭那段）**已經滿足**：`ugcGateIsArmed.test.ts` 5/5 綠（含 calibrate）。
  //   ⚠️ ⭐ 而 `communityRoomOnly` 也是 **false** —— owner 2026-09-09 逐字：
  //     「⛔ **不會分什麼社群房複雜化**」⇒ 社群英雄與官方英雄**同一個池**。
  enabled: true,
  requireAuth: true,
  maxPendingPerPlayer: 50,
  quotaPerPlayerPerDay: 100,
  powerUserQuotaPerDay: 200,
  maxBytes: 262144,
  autoPromote: false,
  // ⭐ GH#1025 —— 出貨 **immediate**（第〇·六守則：優先權大的更新後預設啟動）。
  publishMode: "immediate",
  // ⭐ GH#1025 Scope C —— 出貨 **on**（票文驗收：社群內容預設只進社群房）。
  // ⭐⭐ owner 2026-09-09 逐字：「社群內容只出現在社群房 => 我之前也說過了
  //   **不會分什麼社群房複雜化**，你又沒記錄下來了 對話開票超級重要！」
  //   ⇒ ⛔ 不分房。⚠️ 這已經是他**第二次**講同一件事（第一次我沒記）。
  communityRoomOnly: false,
  // ⭐ GH#1022 —— 出貨 **on**（第〇·六守則：優先權大的更新後預設啟動）。
  digestRecompute: true,
  heroModelUploadsEnabled: true,
  heroModelMaxBytes: 64 * 1024 * 1024,
});

/** 解析後的政策（去掉 id/schema/note 的殼）。 */
export interface UgcPolicyResolved {
  readonly enabled: boolean;
  readonly requireAuth: boolean;
  readonly maxPendingPerPlayer: number;
  readonly quotaPerPlayerPerDay: number;
  readonly maxBytes: number;
  readonly autoPromote: boolean;
  /** ⭐ GH#1025 —— 發布之後多久到玩家眼前（`immediate` / `next-match`）。 */
  readonly publishMode: "immediate" | "next-match";
  /** ⭐ GH#1025 Scope C —— 官方房要不要把社群內容減掉。 */
  readonly communityRoomOnly: boolean;
  readonly digestRecompute: boolean;
}

/**
 * ⭐ 讀不到文件（或它壞了）⇒ 回出貨預設，⛔ 不是丟例外。
 *
 * ⚠️ ⭐ **而這一族的 fail-open 方向是刻意選過的**：出貨預設是「**關**」，
 * 所以一份讀不到的設定會讓 UGC **關著**，⛔ 不是敞開。
 * （fail-open 沒錯，靜默才是缺陷 —— 「退回預設了」由呼叫端的診斷說出來。）
 */
export function resolveUgc(doc: unknown): UgcPolicyResolved {
  const parsed = zConfigUgcDoc.safeParse(doc);
  const d = parsed.success ? parsed.data : DEFAULT_UGC;
  return Object.freeze({
    enabled: d.enabled,
    requireAuth: d.requireAuth,
    maxPendingPerPlayer: d.maxPendingPerPlayer,
    quotaPerPlayerPerDay: d.quotaPerPlayerPerDay,
    maxBytes: d.maxBytes,
    autoPromote: d.autoPromote,
    publishMode: d.publishMode,
    communityRoomOnly: d.communityRoomOnly,
    digestRecompute: d.digestRecompute,
  });
}
