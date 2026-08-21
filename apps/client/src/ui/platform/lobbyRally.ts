/**
 * lobbyRally — 大廳集合令 (GH#492) 的**政策 + 純決策層**。
 *
 * owner 2026-08-21 逐字：
 *
 * > 「**創建房間最重要的就是拉人進來**，請你將**所有線上在大廳的人都跳出確認視窗**
 * >  是否進入房間一起開始，同意後就一起進入開始遊戲，**最多等 10 秒**，
 * >  **包含 vs bot**，若有其他玩家一起進入房間遊戲，也請出現**明顯提示姓名與積分、
 * >  所選英雄**，**每回合結算也都要特別再提示一次**，因為**有可能斷線離開或連線回來
 * >  房間繼續遊戲**」
 *
 * ---- 這個檔案為什麼是「純函式 + 一個 resolve」而不是散在 JSX 裡 -------------
 * 集合令的每一個會出錯的地方都是一個**決定**，而不是一段畫面：
 *
 *  · `rallyCountdown()` —— 現在該顯示幾秒、還能不能按「加入」。⚠️ 它從**伺服器蓋的
 *    `expiresAt`** 算，⛔ 不從自己收到訊息的那一刻起算：sockets 送達時間不同，
 *    各自起算會讓比賽開始了而某個人的視窗還寫著「4 秒」。
 *  · `rosterRows()` —— 名冊上要出現誰、每一列的狀態字是什麼。⭐ 這是 owner 說的
 *    「有可能斷線離開或連線回來」那一半：一個位子現在是**本人**還是**bot 接手**，
 *    只有 `connected` × `driver` 兩格一起讀才答得出來。
 *  · `rosterShows()` —— 這一刻該不該畫它。
 *
 * 全部是 node 可測的純函式，⛔ 沒有 React、沒有 store、沒有 DOM。
 *
 * ---- 執行期真的讀得到後台的值 -----------------------------------------------
 * ⭐ `activeLobbyRally()` 讀 `Configs.tryGet(LOBBY_RALLY_DOC_ID)` —— 和
 * `CameraRig` 讀 `config.camera@1` 同一條路。⇒ 後台存檔、下一次載入內容就生效，
 * ⛔ 不是「存了看起來有效但畫面一格都不會動」的那種鏡像
 * （`lobby-layout` 至今仍是那個狀態，記在 `configDocCoverage.ts` 上）。
 */
import {
  Configs,
  DEFAULT_LOBBY_RALLY_POLICY,
  LOBBY_RALLY_DOC_ID,
  resolveLobbyRally,
  type ConfigLobbyRallyDoc,
  type LobbyRallyPolicyDoc,
} from "@ggd/shared/content";

export type LobbyRallyPolicy = LobbyRallyPolicyDoc;

/**
 * 出貨預設 —— **畫面真的在用的那一份**。
 *
 * ⚠️ 它必須和 `content/config/lobby-rally.json` 以及 shared 的
 * `DEFAULT_LOBBY_RALLY_POLICY` 一字不差；`apps/admin/src/laneConfigDocs.test.ts`
 * 逐格比對三份，差一格就紅。
 */
export const DEFAULT_LOBBY_RALLY: LobbyRallyPolicy = { ...DEFAULT_LOBBY_RALLY_POLICY };

/**
 * 生效中的集合令政策 —— 後台 overlay ?? `content/config/lobby-rally.json` ??
 * 出貨預設。內容還沒載完（大廳可能比內容早畫出來）時回退到出貨值，而出貨值就是
 * owner 說的那一組，所以那個回退**不改變任何行為**。
 */
export function activeLobbyRally(): LobbyRallyPolicy {
  return resolveLobbyRally(Configs.tryGet(LOBBY_RALLY_DOC_ID) as ConfigLobbyRallyDoc | undefined);
}

// ─────────────────────────────── 倒數 ───────────────────────────────────────

export interface RallyCountdown {
  /** 還剩幾秒（無條件進位到整數，0 = 到期）。 */
  secondsLeft: number;
  /** 進度 0..1，1 = 剛開始。進度條用。 */
  fraction: number;
  /** 到期了嗎 —— 視窗要自己關掉、主揪要按下開始。 */
  expired: boolean;
}

/**
 * 從**伺服器蓋的**截止時間算出這一刻的倒數。
 *
 * `waitSec` 只用來畫進度條（要知道跨距，不是只有終點）。⚠️ 它可能缺席（舊的
 * push、或私人邀請被誤傳進來），那時進度條退化成滿格 —— ⛔ 不是除以零。
 */
export function rallyCountdown(expiresAt: number, waitSec: number, now: number): RallyCountdown {
  const remainMs = expiresAt - now;
  if (remainMs <= 0) return { secondsLeft: 0, fraction: 0, expired: true };
  const span = waitSec > 0 ? waitSec * 1000 : remainMs;
  return {
    secondsLeft: Math.ceil(remainMs / 1000),
    fraction: Math.max(0, Math.min(1, remainMs / span)),
    expired: false,
  };
}

// ────────────────────── ⭐ 預設加入（opt-out）的那個決定 ─────────────────────
//
// owner 2026-08-21 逐字（**推翻**了同一天早上做出來的 opt-in 版本）：
//
// > 「你說的是對的，**預設是加入，五秒是讓人按否定的**」
//
// ⇒ 倒數結束 = **加入**。⛔ 不是「放棄」。這一節就是那句話的全部邏輯，寫成純函式，
//   因為它有四個會出錯的地方，而每一個都是**決定**不是畫面：
//
//  ① **什麼時候**自動加入 —— ⛔ 不是 `expiresAt` 那一刻。主揪的客戶端在那一刻按下
//     開始，一間已經開打的房會把同一刻送出的加入請求拒掉 ⇒「預設加入」變成
//     「預設加入失敗」，而畫面上什麼都不會說。`autoJoinAt()` 是那趟來回的餘裕。
//  ② **誰**不該被自動加入 —— 掛機的人（見 `rallyAutoJoin` 的 `idle`）。opt-in 之下
//     「沒反應 = 不加入」是安全的；opt-out 之下「沒反應 = 被拉進一場比賽」，而一個
//     整場不動的隊友對其他人來說**比少一個人更糟**。
//  ③ **我已經在別的房間裡**的時候不該被拉走（伺服器也擋一次，見 rally.go）。
//  ④ **已經過期**的推播（分頁在背景睡了一分鐘才醒）⛔ 不可以「補加入」。

/** 這一刻該對這則集合令做什麼。 */
export type AutoJoinVerdict =
  /** 自動加入（時間到了，而且沒有任何一條擋下來）。 */
  | "join"
  /** 還在倒數，什麼都不做。 */
  | "waiting"
  /** 後台切成 opt-in：⛔ 永遠不自動加入，要人按「加入」。 */
  | "opt-in"
  /** ⚠️ 人不在螢幕前 —— 視窗留著，⛔ 但不替他進房。 */
  | "idle"
  /** 我已經在一間房裡了。 */
  | "in-room"
  /** 這則集合令已經過期（主揪早就開場了）。 */
  | "expired";

export interface AutoJoinCtx {
  /** **伺服器蓋的**截止時間（主揪按下開始的那一刻）。 */
  expiresAt: number;
  /** 倒數跨距（秒）—— 提前量的夾制要它。 */
  waitSec: number;
  now: number;
  /** 最後一次**真的使用者輸入**（ms epoch）。0 = 這個分頁從來沒有被碰過。 */
  lastInputAt: number;
  /** 分頁在背景（`document.hidden`）—— 他根本沒看到這個視窗。 */
  hidden: boolean;
  /** 我已經在某一間房裡（含正在等開場的那一間）。 */
  inRoom: boolean;
}

/**
 * 自動加入的**那一刻** = 伺服器截止時間 − 提前量。
 *
 * ⚠️ 提前量被夾在窗口的一半以內：`autoJoinLeadSeconds` 的上界（10）大於
 * `waitSeconds` 的下界（3），所以「提前量吃掉整個窗口」是後台設定得出來的，
 * 而那會讓「不要」按不到 —— ⛔ 一個按不到的否定按鈕就是沒有否定按鈕。
 */
export function autoJoinAt(policy: LobbyRallyPolicy, expiresAt: number, waitSec: number): number {
  const span = waitSec > 0 ? waitSec : policy.waitSeconds;
  const lead = Math.min(policy.autoJoinLeadSeconds, span / 2);
  return expiresAt - lead * 1000;
}

/**
 * 視窗上那個倒數要數到哪一刻：opt-out 數到**自動加入**、opt-in 數到期限。
 * ⛔ 兩者不可以混用 —— 寫著「3 秒」卻在第 1.5 秒就把人送進房，是同一個缺陷的另一面。
 */
export function rallyDeadline(
  policy: LobbyRallyPolicy,
  expiresAt: number,
  waitSec: number,
): number {
  return policy.joinMode === "opt-out" ? autoJoinAt(policy, expiresAt, waitSec) : expiresAt;
}

/**
 * ⭐ 人現在在不在螢幕前 —— opt-out 唯一的安全閥。
 *
 * ⚠️ 為什麼這件事**只有瀏覽器答得出來**：平台的 presence 是一把 TTL 鑰匙，而續期的
 * heartbeat 是大廳 WS 每隔幾秒**用計時器**送的（`lobby/ws.go`），⛔ 不是使用者做了
 * 什麼。⇒ 伺服器眼中「盯著大廳的人」和「開著分頁去睡覺的人」逐位元相同。
 * ⛔ 所以不要在伺服器上造第二套 presence，判斷放在收件人自己那一台 ——
 * 反正自動加入的那個 request 本來就是他發的。
 */
export function rallyIdle(policy: LobbyRallyPolicy, ctx: AutoJoinCtx): boolean {
  if (policy.idleExcludeSeconds <= 0) return false; // 閘關掉了
  if (ctx.hidden) return true; // 看不到視窗的人，不可能是「沒有按不要」
  if (ctx.lastInputAt <= 0) return true; // 這個分頁從來沒有被碰過
  return ctx.now - ctx.lastInputAt > policy.idleExcludeSeconds * 1000;
}

/** 這一刻該對這則集合令做什麼（⛔ 沒有副作用，畫面與請求都在別處）。 */
export function rallyAutoJoin(policy: LobbyRallyPolicy, ctx: AutoJoinCtx): AutoJoinVerdict {
  if (policy.joinMode !== "opt-out") return "opt-in";
  if (ctx.inRoom) return "in-room";
  // ⛔ 沒有截止時間的推播（舊版／私人邀請被誤送進來）**永遠不自動加入**：
  // 不知道什麼時候到期，就沒有「時間到」這件事，⛔ 不可以退化成「立刻加入」。
  if (ctx.expiresAt <= 0) return "waiting";
  if (ctx.expiresAt > 0 && ctx.now >= ctx.expiresAt) return "expired";
  if (ctx.now < autoJoinAt(policy, ctx.expiresAt, ctx.waitSec)) return "waiting";
  if (rallyIdle(policy, ctx)) return "idle";
  return "join";
}

// ───────────────────────────── 玩家名冊 ─────────────────────────────────────

/** 名冊要讀的那幾格 —— `net/RoomStore` 的 `SeatView` 的子集。 */
export interface RosterSeat {
  seatId: number;
  teamId: number;
  displayName: string;
  connected: boolean;
  /** "human" | "ai" */
  driver: string;
  championId: string;
  /**
   * 積分（MMR）。0／缺席 = 平台沒給（bot／dev 直連座位、舊 snapshot），
   * ⛔ 不畫成「0 分」—— 那會讓 bot 看起來像一個很弱的真人。
   */
  rating?: number;
  /**
   * 這一場開打時，平台把這個位子保留給真人嗎。⛔ 不是 `driver !== "ai"`。
   * OPTIONAL 的理由和 `SeatView.roundDeathTick` 一樣：手刻的夾具省略它，就是在
   * 斷言「這不是一個真人的位子」，而那正是缺席該有的意思。
   */
  human?: boolean;
}

/** 一個位子現在由誰在開。 */
export type SeatPresence =
  /** 本人在線上，正常在打 */
  | "playing"
  /** ⚠️ 斷線了，位子由 bot 接手（重連回來會拿回控制權） */
  | "bot-holding"
  /** 這個位子從一開始就是 bot */
  | "bot";

export interface RosterRow extends RosterSeat {
  presence: SeatPresence;
  /** 是不是**你自己**那一列。 */
  isSelf: boolean;
  /** 是不是跟你同隊。 */
  isAlly: boolean;
}

/**
 * ⭐ 一個位子現在由誰在開 —— owner 說的「**有可能斷線離開或連線回來房間繼續遊戲**」
 * 就是這個函式。
 *
 * ⚠️ 三格缺一不可，而這正是一條 `driver === "ai"` 的判斷讀不出來的東西：
 *
 * | human | connected | driver | 是什麼 | 名冊上寫什麼 |
 * |---|---|---|---|---|
 * | true  | true  | human | 真人在打 | 遊戲中 |
 * | true  | false | ai    | **真人斷線，bot 暫時接手** | ⚠️ 斷線 · BOT 接手 |
 * | false | —     | ai    | 天生 bot | BOT |
 *
 * `MatchRoom.onLeave` 立刻把 driver 換成 AI 並把 sessionId 清成 null，重連成功
 * 之後兩格一起換回來 —— 所以 `connected × driver` 是「他現在在不在」的權威答案，
 * 而 `human` 是「這個位子**本來就**屬於他」的那一半。
 */
export function seatPresence(seat: RosterSeat): SeatPresence {
  if (!seat.human) return "bot";
  if (seat.connected && seat.driver !== "ai") return "playing";
  return "bot-holding";
}

/** 名冊上一列的狀態字（⛔ 不要在 JSX 裡再寫一份）。 */
export const PRESENCE_LABEL: Record<SeatPresence, string> = {
  playing: "遊戲中",
  "bot-holding": "斷線 · BOT 接手",
  bot: "BOT",
};

/**
 * 名冊的列 —— **只有屬於真人的位子**，你自己排第一，其餘照隊伍 / 座位。
 *
 * ⛔ 篩選條件是 `seat.human`，**不是** `driver !== "ai"`：後者會讓一個斷線的
 * 玩家從名冊上整列消失，而那正是 owner 要這份名冊回答的問題
 * （「他是走了，還是 bot 在替他打？」）。
 */
export function rosterRows(
  seats: readonly RosterSeat[],
  localSeatId: number | null,
): RosterRow[] {
  const myTeam = seats.find((s) => s.seatId === localSeatId)?.teamId ?? -1;
  const rows = seats
    .filter((s) => s.human)
    .map<RosterRow>((s) => ({
      ...s,
      presence: seatPresence(s),
      isSelf: s.seatId === localSeatId,
      isAlly: s.teamId === myTeam,
    }));
  rows.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    if (a.teamId !== b.teamId) return a.teamId - b.teamId;
    return a.seatId - b.seatId;
  });
  return rows;
}

/**
 * 這一刻該不該畫名冊。
 *
 * ⭐ owner 的條件句是「**若有其他玩家**一起進入房間遊戲」—— `rosterMinHumans`
 * 就是那句話（出貨 2）。加上他明說的兩個時機：**選角**（一起進場那一刻）與
 * **每回合結算**。
 *
 * ⚠️ `humanCount` 數的是 `human` 的位子，⛔ 不是「現在連著的人」—— 不然一個
 * 玩家斷線的瞬間名冊就會自己消失，而那正是最需要它的時候。
 */
export function rosterShows(
  policy: LobbyRallyPolicy,
  phase: string,
  humanCount: number,
): boolean {
  if (humanCount < policy.rosterMinHumans) return false;
  if (phase === "champSelect") return policy.showRosterInChampSelect;
  // 「每回合結算」= 回合結束的判定畫面 `resolution`，加上緊接著的中場商店
  // `intermission`（玩家真正停留、也真正會看的那一段）。
  if (phase === "resolution" || phase === "intermission") return policy.showRosterInSettlement;
  return false;
}
