import { z } from "zod";

export const LOBBY_RALLY_DOC_ID = "lobby-rally";

export const zConfigLobbyRallyDoc = z
  .object({
    id: z.literal(LOBBY_RALLY_DOC_ID),
    schema: z.literal("config.lobby-rally@1"),
    note: z.string().optional(),
    /**
     * 總開關。⛔ 關掉 = 建房不再廣播、一鍵開打回到「立刻開」。
     *
     * ⭐ 預設 **on**，因為第〇·六守則說「優先權大的更新後都是預設啟動」——
     * 開關存在是為了**回頭**，不是為了觀望。
     */
    enabled: z.boolean(),
    /**
     * 集合令的倒數秒數。⭐ owner 明說 **10**。
     *
     * 上界 120 是傳輸柵欄（伺服器同界）：再長的等待不是「拉人」，是把主揪關在
     * 一個他自己按不掉的畫面裡。下界 3 是「來得及看清楚視窗上寫什麼」。
     */
    waitSeconds: z.number().min(3).max(120),
    /**
     * ⭐ owner 明說的「**包含 vs bot**」：一鍵開打也走同一條集合令
     * （建 listed 房 → 廣播 → 等 → bot 補位開始），⛔ 不是兩條流程。
     *
     * 關掉 = 一鍵開打退回 `POST /rooms/solo`（不列房、不等人、立刻開）。
     * ⚠️ **練習模式永遠走 solo 那條路**，跟這一格無關：練習房是測試碼的鑰匙，
     * 一間有旁人的練習房＝作弊房（見 `room.Create()` 的檔頭）。
     */
    includeBotMatch: z.boolean(),
    /**
     * 倒數到期時，⛔ 不管有沒有人按過「準備」就開始。
     *
     * 決策點：集合令是**期限**不是共識。關掉它的話，一個從房間列表走進來、
     * 從不按準備的路人就能讓主揪的倒數永遠開不了場，而畫面上只會顯示
     * 「按了開始，什麼都沒發生」。
     */
    startIgnoresReady: z.boolean(),
    /**
     * ⭐ **集合令是「預設加入」還是「預設不加入」** —— owner 2026-08-21 逐字：
     * 「**預設是加入，五秒是讓人按否定的**」。
     *
     * | 值 | 倒數結束時 | 視窗的主要按鈕 |
     * |---|---|---|
     * | `opt-out`（出貨） | **自動加入** | 「不要」 |
     * | `opt-in` | 什麼都不做（視窗關掉） | 「加入」 |
     *
     * ⛔ 這不是措辭差異：opt-in 要人**主動點同意** ——
     * opt-in 幾乎等於沒有人會加入，而這張票的目的是「拉人進來」。
     * ⇒ `opt-in` 存在只為了**回頭**（第〇·六守則），⛔ 不是為了觀望。
     */
    joinMode: z.enum(["opt-out", "opt-in"]),
    /**
     * opt-out 的**提前量**：倒數在截止前這麼多秒就自動加入，⛔ 不是掐在同一刻。
     *
     * ⚠️ 這一格是承重的，不是裝飾：主揪的客戶端在 `expiresAt` 那一刻按下開始，
     * 一間**已經開打**的房會把同一刻送出的加入請求拒掉（409/404）——
     * 於是「預設加入」會變成「預設加入失敗」，而畫面上什麼都不會說。
     * 提前量就是那趟 click→request→SADD 的來回餘裕。
     *
     * ⚠️ 上界 10 大於 `waitSeconds` 的下界 3，所以「提前量吃掉整個窗口」是**設定得出來**的
     * ⇒ `autoJoinAt()` 另外夾住「提前量不得超過窗口的一半」，⛔ 讓「不要」永遠按得到。
     */
    autoJoinLeadSeconds: z.number().min(0.2).max(10),
    /**
     * ⭐ **掛機的人不要被拉進去**：這麼多秒沒有任何輸入（或分頁在背景）的人，
     * 集合令**不會**替他自動加入 —— 視窗留著，他回來仍然可以自己按「加入」。
     * `0` = 關掉這道閘（誰都會被自動拉進去）。
     *
     * ⚠️ 為什麼判斷在**瀏覽器**而不是伺服器：平台的 presence 只有「連線活著」
     * （`lobby/ws.go` 的 heartbeat 是**計時器**送的，⛔ 不是使用者動作），
     * 所以伺服器分不出「盯著大廳的人」和「開著分頁去睡覺的人」。真正的輸入事件
     * 只有收件人自己的分頁看得到 —— 而自動加入本來就是他那一台發出的請求。
     * ⛔ 不要為了這一格在伺服器上造第二套 presence。
     */
    idleExcludeSeconds: z.number().int().min(0).max(3600),
    /**
     * 加入房間（**自動或手動都算**）＝同時標記準備好（同一個 request）。
     *
     * 決策點：關掉的話玩家要在倒數剩不到幾秒時再按一次準備，而那一趟來回
     * 正好是開場會把他丟下的那個窗口。
     * ⚠️ 2026-08-21 從 `readyOnAccept` 改名：opt-out 之下**沒有人按過「同意」**，
     * 舊名字描述的動作不存在了（第一守則：語意改了，舊文案就是謊話）。
     */
    readyOnJoin: z.boolean(),
    /**
     * 場上要有幾個**真人**才顯示玩家名冊。⭐ owner 的條件句是
     * 「**若有其他玩家**一起進入房間遊戲」—— 2 就是那句話的直譯。
     *
     * 填 1 = 連單機 vs bot 也永遠顯示（除錯時有用）。
     */
    rosterMinHumans: z.number().int().min(1).max(12),
    /**
     * ⭐ owner 明說的「**每回合結算也都要特別再提示一次**」。
     * 他自己給了理由：「因為**有可能斷線離開或連線回來房間繼續遊戲**」——
     * ⛔ 這不是裝飾，是斷線重連之後「我現在跟誰在打」的唯一資訊來源。
     */
    showRosterInSettlement: z.boolean(),
    /** 選角階段（＝一起進場的那一刻）也顯示一次名冊。 */
    showRosterInChampSelect: z.boolean(),
  })
  .strict();

// ─────────────────────── 大廳集合令（GH#492）────────────────────────────

export type ConfigLobbyRallyDoc = z.infer<typeof zConfigLobbyRallyDoc>;

/** 去掉 id/schema/note 的殼之後,程式真正讀的那一份。 */
export type LobbyRallyPolicyDoc = Omit<ConfigLobbyRallyDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⭐ `waitSeconds: 10` 是 owner 明說的那一格。⚠️ 它當天改過**兩次**：
 * 原始規格「最多等 10 秒」→ 早上「改成五秒」→ **晚上改回 10**
 * （「調整戰鬥開始的拉人時間 5->10秒」）。⛔ 中間那一版已被取代，⛔ 不要再改回 5。
 * `joinMode: "opt-out"` 是他同一天說死的第二格（「**預設是加入，五秒是讓人按否定的**」）；
 * 其餘各格是決策點，預設值選的是
 * 「照 owner 的話做」的那一邊（第〇·六守則：優先權大的更新預設啟動）。
 *
 * ⚠️ 每一格都必須和 `apps/client/src/ui/platform/lobbyRally.ts` 的
 * `DEFAULT_LOBBY_RALLY` 一字不差 —— 那一份才是畫面真的在用的。
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,差一格就紅。
 */
export const DEFAULT_LOBBY_RALLY_POLICY: LobbyRallyPolicyDoc = {
  enabled: true,
  waitSeconds: 10,
  includeBotMatch: true,
  startIgnoresReady: true,
  // ⭐ owner 2026-08-21:「預設是加入，五秒是讓人按否定的」。
  // ⚠️ 那句話裡的「五秒」是當時的窗口值,同日晚上改成 10 —— ⛔ 裁決講的是**預設方向**,不是秒數。
  joinMode: "opt-out",
  autoJoinLeadSeconds: 1.5,
  idleExcludeSeconds: 120,
  readyOnJoin: true,
  rosterMinHumans: 2,
  showRosterInSettlement: true,
  showRosterInChampSelect: true,
};

/**
 * 文件 → 政策。缺席／壞掉一律回退到出貨預設。
 *
 * ⚠️ 這裡**沒有**「載不到就關掉功能」這個選項:一份載不到的內容文件是
 * 2026-08-01 骨架事故那一條路,而在那條路上把集合令靜靜關掉,會讓「內容全毀」
 * 長得跟「owner 昨天關掉了集合令」一模一樣 —— 兩個都不會有人看見。
 */
export function resolveLobbyRally(
  doc: ConfigLobbyRallyDoc | null | undefined,
): LobbyRallyPolicyDoc {
  if (!doc) return DEFAULT_LOBBY_RALLY_POLICY;
  return {
    enabled: doc.enabled,
    waitSeconds: doc.waitSeconds,
    includeBotMatch: doc.includeBotMatch,
    startIgnoresReady: doc.startIgnoresReady,
    joinMode: doc.joinMode,
    autoJoinLeadSeconds: doc.autoJoinLeadSeconds,
    idleExcludeSeconds: doc.idleExcludeSeconds,
    readyOnJoin: doc.readyOnJoin,
    rosterMinHumans: doc.rosterMinHumans,
    showRosterInSettlement: doc.showRosterInSettlement,
    showRosterInChampSelect: doc.showRosterInChampSelect,
  };
}
