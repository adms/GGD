import { z } from "zod";

/**
 * ⭐【`config.lobby-rally@1`】—— **大廳集合令**（GH#492）。
 *
 * owner 2026-08-21 逐字：
 *
 * > 「**創建房間最重要的就是拉人進來**，請你將**所有線上在大廳的人都跳出確認視窗**
 * >  是否進入房間一起開始，同意後就一起進入開始遊戲，**最多等 10 秒**，
 * >  **包含 vs bot**，若有其他玩家一起進入房間遊戲，也請出現**明顯提示姓名與積分、
 * >  所選英雄**，**每回合結算也都要特別再提示一次**，因為**有可能斷線離開或連線
 * >  回來房間繼續遊戲**」
 *
 * ⭐ **2026-08-21 owner 反轉了語意**（逐字）：
 *
 * > 「你說的是對的，**預設是加入，五秒是讓人按否定的**」
 *
 * ⇒ 倒數結束 = **加入**，⛔ 不是「放棄」。視窗的主要按鈕是「**不要**」，
 * 沒有互動就進房。⭐ 這是 owner **獨立的**裁決（「預設是加入」），
 * ⛔ 與窗口長短無關 —— 窗口 2026-08-21 晚上已從 5 秒改回 **10 秒**，而 opt-out 不變，
 * 而 owner 的原話是「**創建房間最重要的就是拉人進來**」。
 * `joinMode` 是那個反轉的一鍵 rollback（`opt-in` = 2026-08-21 早上那一版）。
 *
 * ⭐ 「**最多等 10 秒**」是這一族唯一被 owner 說死的數字（後來他自己改成 5），
 * 其餘每一格都是**決策點**（第一守則：「心裡出現要選 A 還是 B」的那些），
 * 所以它們是欄位而不是常數 —— 而且 `enabled` 那一格就是第〇·六守則要的
 * **一鍵 rollback**：關掉它，一鍵開打回到 2026-08-21 之前那條「立刻開，不等人」的路。
 *
 * ⚠️ 這一份**真的有執行期消費端**（⛔ 不像 `lobby-layout` 那一份）：
 * `apps/client/src/ui/platform/lobbyRally.ts` 的 `activeLobbyRally()` 讀
 * `Configs.tryGet(LOBBY_RALLY_DOC_ID)`，和 `CameraRig` 讀 `config.camera@1`
 * 同一條路。⇒ 後台存檔 → 下一次載入內容就生效，⛔ 不必重建映像。
 *
 * ⚠️ 伺服器那一端**刻意只有柵欄，沒有政策**：`waitSeconds` 由客戶端送上去，
 * `internal/room/rally.go` 只把它夾進 [1, 120] 的傳輸界。理由和
 * `room.MatchSettings` 一模一樣 —— 界線抄第二份，drift 的那一份會安靜地拒絕
 * 主揪有權設定的值，而且看起來完全正常。
 */
/**
 * ⭐【`config.admin-friend@1`】—— **管理員預設好友**（GH#499）。
 *
 * owner 2026-08-21 逐字（三則）：
 *
 * > 「**所有人預設都會加管理員帳號為好友**」
 * > 「`adminAccountId` => **yes, 如果只有一個就預設那一個**」
 * > 「**管理員是強制雙向 不必請求 每個人創號自動預設有管理員好友**」
 *
 * ⭐ **強制雙向,⛔ 不是送出好友請求。** 平台走
 * `friend.Service.ForceFriend`（`apps/platform/internal/friend/friend.go`）
 * 在同一個兩邊一起寫的交易裡寫入雙方的 `friends` 邊,⛔ 不走 `Request()` ——
 * 那一條是「送出請求等對方接受」,對既有的 198 個帳號跑一次就會變成 **198 個
 * 沒有人會按的待處理請求**:功能上線、看起來做完了、而實際效果是零。
 *
 * ⚠️ **這一份的消費端是 Go 平台,⛔ 不是客戶端**（和這個檔案裡絕大多數文件不同）。
 * `friend.LoadAdminPolicy(CONTENT_DIR)` 在開機時讀出貨值,而後台存檔寫的是
 * **耐久覆蓋層**（`data/content-overlay/overlay.json`),所以 `AutoAdmin.Policy()`
 * **每一次決策都重讀一次覆蓋層**再疊上去 —— 少了那一步,這一頁就會變成 task #241
 * 那個形狀:操作者存了值、頁面顯示「✓ 已寫入」、重整還讀得回自己填的數字,而平台
 * 一輩子用出貨值（家用主機的 `content/` 是唯讀 bind-mount,連重啟都救不回來）。
 */
export const ADMIN_FRIEND_DOC_ID = "admin-friend";

export const zConfigAdminFriendDoc = z
  .object({
    id: z.literal(ADMIN_FRIEND_DOC_ID),
    schema: z.literal("config.admin-friend@1"),
    note: z.string().optional(),
    /**
     * 總開關。⭐ 預設 **on** —— owner 的原話是「所有人**預設**都會加管理員帳號
     * 為好友」,而第〇·六守則說「優先權大的更新後都是預設啟動」:開關存在是為了
     * **回頭**,不是為了觀望。
     *
     * ⛔ 關掉不會拆掉任何已經建立的好友關係（那是**移除**動作,而這一格是
     * 「以後還要不要繼續加」）。要拆得由玩家自己在好友名單移除。
     */
    enabled: z.boolean(),
    /**
     * ⭐ 大家會被加成好友的那一個管理員帳號 id。
     *
     * ⭐ **出貨值是字串 `"auto"`,⛔ 不是留空 —— 而 `"auto"` ≠ 關掉。**
     * owner 2026-08-21:「`adminAccountId` => **yes, 如果只有一個就預設那一個**」
     * ⇒ `"auto"` 是一條**會執行的規則**:
     *
     * ⚠️ **為什麼是 `"auto"` 而不是空字串**:後台通用表單的文字格拒絕空值
     * （`parseFieldInput`:「不可以是空的」）⇒ 出貨成 `""` 的話,操作者填了一次 id
     * 之後**再也回不到自動**,而那是一個只轉得動一邊的旋鈕（第一·五守則的形狀）。
     * 平台仍然把 `""` 當成 `"auto"` 的同義字（手改過的檔案讀得回來）,⛔ 但不出貨它。
     *
     * | 系統裡的 `RoleAdmin` 帳號數 | `"auto"` 時的行為 |
     * |---:|---|
     * | 1 | ⭐ 就是那一個（⛔ 不必填,也⛔ 不必每次換人時來改這一格） |
     * | 0 | 什麼都不做（新站的第一個帳號就是這個情況,開機回填會補上） |
     * | ≥2 | 什麼都不做,只記一行 log ——⛔ 平台**不替 owner 挑人**（見下面的隱私後果） |
     *
     * 填了 id 的時候是 **fail closed**:那個帳號讀不到、或它其實不是管理員,
     * 平台**不會**退回「自動挑一個」,而是什麼都不做並吼一聲 —— 一個打錯的 id
     * 靜靜地把全站好友加到別人身上,比不加更糟。
     *
     * ⚠️⚠️ **隱私後果（這一格真正的代價,⛔ 不是「多一個好友」）**：
     * 被指名的那個帳號會出現在**每一個玩家**的好友名單上,而好友名單會即時顯示
     * **在線狀態**（`online` / `in-lobby` / `in-match`）。⇒ 這一格等於
     * **讓這個帳號看得到全站每一個人現在在不在線上、正在大廳還是正在打**。
     * 它也讓那個帳號可以被每一個人看到同樣的資訊。⛔ 不要填一個不是站方的人。
     */
    adminAccountId: z.string().min(1).max(128),
    /**
     * ⭐ 開機時把**既有帳號**補一次。
     *
     * ⭐ 這是 owner 那句「**所有人**」的另一半:只接新帳號 = 今天以後註冊的人才有,
     * 而站上已經有 198 個帳號 —— 也就是**絕大多數人沒有**。
     *
     * 冪等:已經是好友的帳號一次寫入都不會發生,所以它可以每次開機跑。
     * 關掉它 = 只有新帳號會被接上;既有帳號改由後台 Quick Approval 的「加入」區
     * 手動觸發（`POST /api/v1/friends/admin-backfill`,只有管理員按得動）。
     */
    backfillExisting: z.boolean(),
    /**
     * 玩家**封鎖**了管理員（或反之）時,還要不要強制把好友加回去。
     *
     * ⭐ 出貨 **off**,這是 owner 沒有裁決到的那一格:「強制雙向」講的是
     * 「⛔ 不必請求」,而封鎖是一個玩家**明確按下去**的動作。打開它等於
     * 「封鎖對管理員無效」,那是一個站方應該自己決定、而不是被預設值決定的事。
     *
     * 打開時會連封鎖一起清掉（否則會留下一個「是好友、但也在封鎖名單上」的狀態,
     * 那是兩個互相矛盾的真相）。
     */
    overrideBlocked: z.boolean(),
  })
  .strict();

export type ConfigAdminFriendDoc = z.infer<typeof zConfigAdminFriendDoc>;

/** 去掉 id/schema/note 的殼之後,平台真正讀的那一份。 */
export type AdminFriendPolicyDoc = Omit<ConfigAdminFriendDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⚠️ 它必須和 `friend.DefaultAdminPolicy()`（Go）一字不差 —— 那一份才是平台在
 * 內容讀不到的時候真的會用的值。⭐ 兩邊都選 **on**:一份讀不到的內容文件如果
 * 靜靜地把功能關掉,「內容全毀」就會長得跟「owner 昨天關掉了這個功能」一模一樣,
 * 而兩個都不會有人看見（2026-08-01 骨架事故的形狀）。
 */
export const DEFAULT_ADMIN_FRIEND_POLICY: AdminFriendPolicyDoc = {
  enabled: true,
  adminAccountId: "auto",
  backfillExisting: true,
  overrideBlocked: false,
};

/** 文件 → 政策。缺席／壞掉一律回退到出貨預設。 */
export function resolveAdminFriend(
  doc: ConfigAdminFriendDoc | null | undefined,
): AdminFriendPolicyDoc {
  if (!doc) return DEFAULT_ADMIN_FRIEND_POLICY;
  return {
    enabled: doc.enabled,
    adminAccountId: doc.adminAccountId,
    backfillExisting: doc.backfillExisting,
    overrideBlocked: doc.overrideBlocked,
  };
}
