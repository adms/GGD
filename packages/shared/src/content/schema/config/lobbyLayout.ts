import { z } from "zod";
import { zId } from "../common";

/**
 * config.lobby-layout@1 — 大廳左欄的上下分割政策（GH#255）。
 *
 * owner:「原本排行榜移到朋友列表下半部，各佔左邊排的上下各半」。
 *
 * ⚠️ 值的**唯一真相**是 `apps/client/src/ui/platform/lobbyLayout.ts` 的
 * `DEFAULT_LOBBY_LAYOUT` —— 那一份是螢幕真的在用的。這裡這一份是內容層的鏡像,
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,所以它們不可能各走各的。
 *
 * ⚠️ **這份文件目前沒有執行期消費端**（`LobbyScreen.tsx` 直接吃常數）。它在
 * `configDocCoverage.ts` 上以 DEFERRED 掛帳,到期條件是機器數出來的呼叫端數量。
 * 不要在別的地方再抄一份預設值。
 */
export const zConfigLobbyLayoutDoc = z
  .object({
    id: zId,
    schema: z.literal("config.lobby-layout@1"),
    note: z.string().optional(),
    /**
     * 左欄在寬螢幕上的固定寬度（px）。上界 480 是「左欄吃掉半個 1024 平板」;
     * 下界 180 之下,朋友名字與排名列都會被截斷成看不懂。
     */
    leftColumnWidthPx: z.number().int().min(180).max(480),
    /**
     * 分割模式下,**朋友列表**佔左欄高度的比例（0..1）。
     *
     * ⚠️ 語意在 2026-08-03 變了,舊註解「`0.5` 就是 owner 的『各半』」已經是謊話:
     * owner 說「大廳 FRIEND 跟排位榜 **中間**,多出一個區域顯示所有大廳正在線上的
     * 玩家列表」—— 左欄從**兩塊**變成**三塊**,所以「各半」不存在了,出貨值是
     * 40 / 30 / 30。上下界從 0.2/0.8 收成 0.15/0.7,抄的是
     * `apps/client/src/ui/platform/lobbyLayout.ts` 的 `LOBBY_LAYOUT_BOUNDS`
     * （那份是渲染端自己的判準:低於 0.15 一塊面板就只剩標題沒有列）。
     *
     * ⚠️ 三段加起來必須是 1。flexbox **不會**檢查這件事（grow 是相對的）,所以
     * 0.5/0.5/0.5 會排得好好的而文件宣稱 50%/50%/50% —— 那就是一個「40%」欄位
     * 不再是百分比的瞬間。檢查在 `lobbyLayoutProblems()`,不是靠渲染器隱含。
     */
    friendsShare: z.number().min(0.15).max(0.7),
    /** 分割模式下,**線上玩家**佔左欄高度的比例（0..1）。各段相加必須是 1。 */
    onlineShare: z.number().min(0.15).max(0.7),
    /** 分割模式下,**宿敵榜**佔左欄高度的比例（0..1）。各段相加必須是 1。 */
    nemesisShare: z.number().min(0.15).max(0.7),
    /** 分割模式下,**排位榜**佔左欄高度的比例（0..1）。各段相加必須是 1。 */
    leaderboardShare: z.number().min(0.15).max(0.7),
    /**
     * 宿敵榜的排序（GH#454）。owner 沒有指定,三種都成立,所以它是一格欄位:
     * `played` 交手次數（最中性,出貨值）/ `rivalry` 恩怨值（五五開的排前面）/
     * `bane` 苦主剋星（對你贏最多的排前面）。
     * ⭐ 每一列都同時帶著三者需要的數字,所以換排序只換順序,不換任何資料。
     */
    nemesisSort: z.enum(["played", "rivalry", "bane"]),
    /**
     * 朋友列表的排序（GH#537）。owner 2026-08-22:「朋友清單,**有上線的應該會
     * 特別排到最上面顯示吧**？」⇒ `online-first` 是他指定的出貨值,
     * ⛔ 不是我挑的;`name` 是純字母序（給「我要找某個人」而不是「誰在線上」）。
     * ⚠️ 排序做在**客戶端**:面板畫的狀態是 REST 快照 + WS 推播疊起來的,
     * 而 REST 十秒才重抓一次 —— 排在伺服器等於用最舊的那一半排。
     */
    friendSort: z.enum(["online-first", "name"]),
    /**
     * 分割模式（桌機）下面板由上到下的順序。
     * ⚠️ 它是欄位而不是常數,因為**兩塊**面板都被 owner 指名要放在「朋友列表跟
     * 排位榜中間」（2026-08-03 線上玩家、2026-08-19 宿敵榜）—— 兩句話不論誰排前面
     * 都成立,那就是一個決策點。
     */
    splitOrder: z.array(z.enum(["friends", "online", "nemesis", "leaderboard"])).length(4),
    /**
     * 線上玩家列表遇到**已經是朋友**的人怎麼顯示 —— 這是決策點不是數值。
     * `greyed-button` 那一列留著,按鈕變成不能按的「已加入」;
     * `hide-row` 直接把那一列拿掉。
     */
    alreadyFriendMode: z.enum(["greyed-button", "hide-row"]),
    /** 堆疊模式（手機）下面板由上到下的順序。 */
    stackOrder: z.array(z.enum(["friends", "online", "nemesis", "leaderboard"])).length(4),
    /** 堆疊模式下,每一塊面板保證拿到的高度（px）。 */
    minSlotHeightPx: z.number().int().min(80).max(600),
    /** 左欄矮於這個高度（px）就不分割、改成整欄一起捲。 */
    splitMinHeightPx: z.number().int().min(320).max(1200),
    /**
     * 視窗窄於這個寬度（px）時左欄已經是整頁寬的一條,再按高度切一半沒有意義。
     * 出貨值刻意等於 `ui/platform/ranking.css` 的 `@media (max-width: 720px)`。
     */
    stackBelowWidthPx: z.number().int().min(320).max(1600),
  })
  .strict();

// ─────────────────────── 大廳版面 / 英靈殿沙盒（2026-08-02 收尾）──────────

export type ConfigLobbyLayoutDoc = z.infer<typeof zConfigLobbyLayoutDoc>;

/** 去掉 id/schema/note 的殼之後,程式真正讀的那一份。 */
export type LobbyLayoutPolicyDoc = Omit<ConfigLobbyLayoutDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⚠️ 每一格都必須和 `apps/client/src/ui/platform/lobbyLayout.ts` 的
 * `DEFAULT_LOBBY_LAYOUT` 一字不差 —— 那一份才是螢幕真的在用的。
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,差一格就紅。
 */
export const DEFAULT_LOBBY_LAYOUT_POLICY: LobbyLayoutPolicyDoc = {
  leftColumnWidthPx: 280,
  // 25 / 15 / 20 / 40 —— GH#454 把宿敵榜插進來之後的四段。前身是 owner 2026-08-04
  // 的「3:2:5」(三段)，這一版保留他的**相對順序**（排位榜最大、線上玩家最小），
  // 只把新的一塊從四塊裡按比例讓出來。
  // 各段相加必須是 1 —— flexbox 不會替你檢查，`lobbyLayoutProblems()` 會。
  friendsShare: 0.25,
  onlineShare: 0.15,
  nemesisShare: 0.2,
  leaderboardShare: 0.4,
  nemesisSort: "played",
  friendSort: "online-first",
  splitOrder: ["friends", "online", "nemesis", "leaderboard"],
  alreadyFriendMode: "greyed-button",
  stackOrder: ["friends", "online", "nemesis", "leaderboard"],
  minSlotHeightPx: 168,
  splitMinHeightPx: 560,
  stackBelowWidthPx: 720,
};

/**
 * 文件 → 政策。缺席／壞掉一律回退到出貨預設,理由和 `resolveVictoryFx` 同源:
 * 內容載不到是 2026-08-01 骨架事故那一條路,而在那條路上把左欄高度變成 0
 * 會讓「內容全毀」看起來像「朋友列表不見了」。
 */
export function resolveLobbyLayout(
  doc: ConfigLobbyLayoutDoc | null | undefined,
): LobbyLayoutPolicyDoc {
  if (!doc) return DEFAULT_LOBBY_LAYOUT_POLICY;
  return {
    leftColumnWidthPx: doc.leftColumnWidthPx,
    friendsShare: doc.friendsShare,
    onlineShare: doc.onlineShare,
    nemesisShare: doc.nemesisShare,
    leaderboardShare: doc.leaderboardShare,
    nemesisSort: doc.nemesisSort,
    friendSort: doc.friendSort,
    splitOrder: doc.splitOrder,
    alreadyFriendMode: doc.alreadyFriendMode,
    stackOrder: doc.stackOrder,
    minSlotHeightPx: doc.minSlotHeightPx,
    splitMinHeightPx: doc.splitMinHeightPx,
    stackBelowWidthPx: doc.stackBelowWidthPx,
  };
}
