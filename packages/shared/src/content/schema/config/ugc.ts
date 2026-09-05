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
 * ── ⛔⛔ 為什麼 `enabled` 出貨是 **false**（⚠️ 這是唯一一個要辯護的預設） ────
 * 第〇·六守則說「優先權大的更新後都是**預設啟動**」—— ⭐ 而那條講的是
 * **已經裁決過的取捨**（兩條路都能跑，開關是為了回頭）。
 * ⛔ 這一格不是那個形狀：UGC 流水線今天只有**第一段**（這份開關）落地，
 * 身分檢查、逐份機器閘、配額計數**一個都還沒有**。
 * ⇒ ⭐ 出貨開著＝**一條公開的、沒有任何守衛的寫入路**，
 * ⚠️ 而票文的 Known risks 自己逐字寫著「quota ＋ maxBytes ＋ 嚴格 Zod 是最低配，
 * **缺一個就不要打開**」。⇒ 這一格是那句話的機器版本。
 *
 * ⭐ 打開它的條件不是「時間到了」，是 `ugcGateIsArmed.test.ts` 從紅轉綠 ——
 * 也就是提交端點**真的**綁齊了身分與這一格。
 */
export const zConfigUgcDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ugc@1"),
    note: z.string().optional(),
    /**
     * ⭐⭐ **總開關 ＝ 一鍵 rollback。** 關掉之後，任何玩家提交會被**明確拒絕**
     * （`UGC_DISABLED`，HTTP 403）—— ⛔ 不是靜靜地收下再丟掉。
     *
     * ⚠️ 關掉它**不會**動到任何已經上架的 UGC 內容（那要清白名單，是另一個動作）。
     * ⇒ 這一格答的是「**還收不收新的**」，⛔ 不是「**已經在的還算不算數**」。
     */
    enabled: z.boolean(),
    /**
     * ⭐ 提交要不要帶玩家身分。**出貨 on ＝ fail-closed。**
     *
     * ⛔ 關掉它的後果比「少一個登入」嚴重得多：配額（下面兩格）是**按玩家**算的，
     * 沒有身分就沒有配額主體 ⇒ ⭐ 三格限制**一起失效**，
     * 而畫面上看起來只是「不用登入比較方便」。
     *
     * ⚠️ 它也是「退回原因」寄得回去的唯一理由 —— 匿名提交被退，沒有人收得到。
     */
    requireAuth: z.boolean(),
    /**
     * 一個玩家同時可以有幾份**待審**。
     *
     * ⭐ 這一格擋的是**人審佇列**（漏斗最窄的一段：owner 一個人在按）。
     * ⚠️ 上界 200：再高就等於沒有擋 —— 一個人塞滿 200 份，批次審查頁那一天
     * 就只有他的東西。
     */
    maxPendingPerPlayer: z.number().int().min(1).max(200),
    /**
     * 一個玩家**一天**送得出幾份（不論後來被退還是被收）。
     *
     * ⚠️ ⭐ 它與上面那格**不是同一件事**：待審深度擋得住「一次塞爆佇列」，
     * ⛔ 擋不住「送一份、被退、立刻再送一份」那種**磨佇列**的節奏。
     * ⇒ 兩格分別回答「同時多少」與「多快」。
     */
    quotaPerPlayerPerDay: z.number().int().min(1).max(500),
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
    maxBytes: z.number().int().min(4096).max(4194304),
    /**
     * 過了機器閘之後**直接上架**，⛔ 不進人審佇列。
     *
     * ⭐ 出貨 **off** —— 票文 Scope 1 逐字「上架一律過 HITL」。
     * ⛔⛔ 打開它的後果要看清楚：機器閘答得出「這份 JSON 合不合法」，
     * ⚠️ 答不出「這支技能像不像那個名字」「這個特效在戰鬥中讀不讀得出來」——
     * ⭐ 那正是 owner 2026-08-24 定義的 Tier2 語意題，而 Tier2 只有人做得到。
     */
    autoPromote: z.boolean(),
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
      "@note " + "出貨 **{{出貨值}}**（GH#1022）。⭐ 開著時，每一份投稿的 `packageDigest` 由 **platform 送去 " +
        "content-api 重算**（TS 側唯一那份 `packageDigest()`），與客戶端宣稱的比對：" +
        "對不上 ⇒ **400** 並指名是哪一份文件對不上；content-api 沒設定（`GGD_CONTENT_API_URL`）" +
        "或連不上 ⇒ **503**（⛔ 不會退回「當成通過」）。" +
        "⛔⛔ 關掉它等於回到「digest 是客戶端自己說的」—— 一份改了內容卻沿用舊 digest 的投稿，" +
        "**舊核准會繼續有效**（審核被繞過，而畫面上完全看不出來）。" +
        "⭐ 這一格存在是為了一鍵回頭（例：content-api 暫時掛了而投稿必須開著），⛔ 不是為了觀望。" +
        "⚠️ 後台存檔**當下**生效（platform 每一次投稿都重讀），⛔ 不必重啟。",
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
  enabled: false,
  requireAuth: true,
  maxPendingPerPlayer: 5,
  quotaPerPlayerPerDay: 20,
  maxBytes: 262144,
  autoPromote: false,
  // ⭐ GH#1022 —— 出貨 **on**（第〇·六守則：優先權大的更新後預設啟動）。
  digestRecompute: true,
});

/** 解析後的政策（去掉 id/schema/note 的殼）。 */
export interface UgcPolicyResolved {
  readonly enabled: boolean;
  readonly requireAuth: boolean;
  readonly maxPendingPerPlayer: number;
  readonly quotaPerPlayerPerDay: number;
  readonly maxBytes: number;
  readonly autoPromote: boolean;
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
    digestRecompute: d.digestRecompute,
  });
}
