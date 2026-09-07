/**
 * 設定文件的**標籤資料**（大廳集合令・管理員好友・走過去放技能・畫面提示）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  // 走過去放技能（GH#557）—— owner「超過施法距離人物不會走過去放技能（做成後台開關）」。
  zConfigCastApproachDoc,
  zConfigUiCuesDoc,
  // 大廳集合令（GH#492，owner 2026-08-21）—— 走 barrel，同上面那一族。
  // 管理員預設好友（GH#499，owner 2026-08-21）—— 走 barrel，同上面那一族。
  zConfigAdminFriendDoc,
  zConfigLobbyRallyDoc,
} from "@ggd/shared/content";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
// ─────────────────────────────────── 大廳集合令 (config/lobby-rally) ─

export const LOBBY_RALLY_SPEC: ConfigDocSpec<"lobbyRally"> = {
  page: "lobbyRally",
  collection: "config",
  docId: "lobby-rally",
  schemaTag: "config.lobby-rally@1",
  zod: zConfigLobbyRallyDoc,
  title: "大廳集合令",
  intro: [
    "⭐ owner 2026-08-21：「**創建房間最重要的就是拉人進來**，請你將**所有線上在大廳的人都跳出確認視窗**是否進入房間一起開始，同意後就一起進入開始遊戲，**最多等 10 秒**，**包含 vs bot**，若有其他玩家一起進入房間遊戲，也請出現**明顯提示姓名與積分、所選英雄**，**每回合結算也都要特別再提示一次**」。這一頁是那句話的全部參數。",
    "⭐ **同日 owner 反轉了語意**：「**你說的是對的，預設是加入，五秒是讓人按否定的**」⇒ 出貨的行為是 **opt-out**：視窗跳出來，**沒按「不要」就進房**。上面那句「同意後就一起進入」現在由「不反對就一起進入」取代。⭐ 窗口長度是**另一格**（「倒數幾秒後開打」）的事，⛔ opt-out 不隨它變 —— 那是獨立的裁決。",
    "⛔ **比賽中（含選角）與已經坐在任何一間房裡的人永遠不會被打擾。** 收件人由伺服器決定（`internal/room/rally.go`：presence 是「在大廳」而且不在任何一間開著的房裡），⛔ 這裡沒有那一格 —— 一個能把確認視窗丟到別人比賽上的開關，只會被按錯一次。⚠️ 預設加入之後這條更重要：那不再只是一個多餘的視窗，而是「一個人被拉走」。",
    "⚠️ **練習模式永遠不走集合令**：練習房是測試碼的鑰匙，一間有旁人的練習房就是作弊房。所以不管「一鍵開打也走集合令」開著還是關著，練習模式都是不列房的單人沙盒。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/lobby-rally.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/platform/lobbyRally.ts 的 activeLobbyRally()（讀 Configs 登錄表），由 store.beginRally / startRallyNow / acceptRally、RallyConfirmDialog 的自動加入（rallyAutoJoin）與 panels/HumanRosterPanel 消費",
  effect:
    "**下一次客戶端載入內容就生效**（和 鏡頭 同一個形態）—— 玩家重整一次分頁即可，⛔ 不必重建映像，也⛔ 不必重啟 shard。",
  fields: derivedFields(zConfigLobbyRallyDoc, []),
  preserved: [],
};

// ──────────────────────────────────────── 管理員預設好友 (config/admin-friend) ─

/**
 * ⭐ 管理員預設好友（GH#499）。⚠️ 這一頁和這個檔案裡其他每一頁都不同的地方：
 * **它的消費端是 Go 平台，不是客戶端也不是 game-server** —— 所以「後台存了、
 * 平台讀不到」不會有任何 TypeScript 測試看得見，和 `RANKING_SPEC` 同一個處境。
 * 對得起來的那一半住在 `apps/platform/internal/friend/adminfriend_test.go`
 * （它讀真的 `content/config/admin-friend.json`，逐格比對 Go 的出貨預設）。
 */
export const ADMIN_FRIEND_SPEC: ConfigDocSpec<"adminFriend"> = {
  page: "adminFriend",
  collection: "config",
  docId: "admin-friend",
  schemaTag: "config.admin-friend@1",
  zod: zConfigAdminFriendDoc,
  title: "管理員預設好友",
  intro: [
    "⭐ owner 2026-08-21 逐字：「**所有人預設都會加管理員帳號為好友**」「**管理員是強制雙向 不必請求 每個人創號自動預設有管理員好友**」。這一頁是那兩句話的全部參數。",
    "⭐ **強制雙向，⛔ 不是送出好友請求。** 平台直接寫入雙方的好友邊（`ForceFriend`），⛔ 不走「送出請求等對方接受」那條路 —— 對既有的 198 個帳號跑一次，那條路會產生 **198 個沒有人會按的待處理請求**，功能看起來做完了而實際效果是零。",
    "⚠️⚠️ **這一頁的隱私後果要先看懂再存檔**：被指名的那個管理員會出現在**每一個玩家**的好友名單上，而好友名單會即時顯示**在線狀態**（在線／在大廳／比賽中）。⇒ 這等於**讓那個帳號看得到全站每一個人現在在不在、正在幹嘛**，也讓每一個人看得到他。⛔ 不要填一個不是站方的人。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/admin-friend.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/platform/internal/friend/adminfriend.go 的 AutoAdmin.Policy() → ResolveAdminID()，由 account.Repo.Create 的 post-create hook（新帳號當下）與 Server.Boot 的 BackfillAdminFriendsInBackground（既有帳號）消費",
  effect:
    "**平台每一次決策都重讀一次**（和 商店經濟 💎 同一個形態）—— 存檔之後下一個註冊的帳號就吃到新設定，⛔ 不必重建映像。⚠️ 但**既有帳號的回填是開機時跑的**，所以打開「開機回填既有帳號」之後要等平台重啟一次，或去 Quick Approval 的「加入」區手動按一次。",
  fields: derivedFields(zConfigAdminFriendDoc, []),
  preserved: [],
};

// ──────────────────────────── 走過去放技能 (config/cast-approach) ─

export const CAST_APPROACH_SPEC: ConfigDocSpec<"castApproach"> = {
  page: "castApproach",
  collection: "config",
  docId: "cast-approach",
  schemaTag: "config.cast-approach@1",
  zod: zConfigCastApproachDoc,
  title: "走過去放技能",
  intro: [
    "按下一支**放不到**的指定型技能時，角色該站著不動、還是自己走進射程再放？owner 2026-08-22：「超過施法距離人物不會走過去放技能（做成後台開關）」—— 出貨是走過去。",
    "⚠️ 只管**指定目標**的技能。地面指定（在地上點一個落點）本來就不會拒絕 —— 它把落點夾回射程邊緣，94 支技能靠著那個行為，這一頁不動它。",
  ],
  consumer:
    "packages/shared/src/sim/abilities/abilitySystem.ts 的 castAbility() → CastApproachRules；接近指令由 MovementSystem 執行，走進射程的那一 tick 自動施放",
  effect: "**下一場**開始生效（規則在開場載入內容時解析一次）。已經在打的那一場不會中途換行為。",
  fields: derivedFields(zConfigCastApproachDoc, []),
  preserved: [],
};

// ──────────────────────────────────────────────── 畫面提示 (config/ui-cues) ─

/**
 * 💬 畫面提示（GH#576 / GH#573，owner 2026-08-23 的三則 [優先]）。
 *
 * 三格看起來不相干，⭐ 但它們回答的是**同一個**問題：一件事在遊戲裡真的發生了，
 * 畫面上有沒有東西說出來。分成三頁的話，「哪一種提示已經有了、哪一種還沒有」
 * 沒有任何一頁答得出來。
 */
export const UI_CUES_SPEC: ConfigDocSpec<"uiCues"> = {
  page: "uiCues",
  collection: "config",
  docId: "ui-cues",
  schemaTag: "config.ui-cues@1",
  zod: zConfigUiCuesDoc,
  title: "畫面提示",
  intro: [
    "owner 2026-08-23（三則 [優先]）：「**施法範圍預覽可以參考 w3x 的白色魔法陣**」「**被動技 觸發作用的時候 還是要閃一下圖示**（例如初號機暴走都看不出來有沒有生效冷卻剩多少）」「**邀請朋友的部分 除了可以等 10 秒、不等了以外，還可以選多等 1 分鐘**」。這一頁就是那三句話的旋鈕。",
    "⚠️ **白色魔法陣只換掉「填滿」那一層，外圈永遠是通道色。** 敵／友／自己一眼分得出來（#228 的第 4 條）不可以被它吃掉 —— 滿地都是白圈的時候，「打向我的 AoE」和「我自己剛剛瞄的那一發」會長得一模一樣。三條通道的顏色在**範圍指引與預告**那一頁。",
    "⚠️ **被動的閃爍節流是承重的，不是體感微調。** `onDamageTaken` 這一族被動一秒可以觸發十次；沒有節流的圖示會變成閃爍燈，而那比完全不閃更難讀。",
    "⚠️ **被動的冷卻讀數是估計值，不是權威值。** 觸發器的內部冷卻記帳住在 sim 裡、從來沒有上過線，所以客戶端從「剛剛看到它觸發」那一刻自己推算。技能主動重置觸發器時它會偏長，而下一次觸發就重新對時。看不順眼就把它整格關掉。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ui-cues.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/uiCuesConfig.ts 的 uiCues()（懶讀 Configs，⛔ 沒有第二個必須記得的接線點）→ vfx/Telegraph.ts 的建構子讀白色魔法陣那兩格、ui/castFeedback.ts 的 sampleCastFlash() 與 ui/passiveProc.ts 讀被動那三格、ui/platform/RoomView.tsx 的 RallyCountdownStrip 讀「再等一下」那一張表、ui/coinThrow.ts 的 coinThrowGreysWhenPoor() 讀陣亡投幣那一格（消費端是 ui/HudRoot.tsx 的觀戰橫幅按鈕與 ui/TouchControls.tsx 的中央大鈕）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時把文件放進登錄表）。已經畫在地上的預告圈不會中途換色 —— 樣式是在起手那一刻決定的。",
  fields: derivedFields(zConfigUiCuesDoc, []),
  preserved: [
    {
      path: "commsWheel.entries",
      why: "⭐ 輪盤上有哪幾格、每一格叫什麼、播哪一類語音 —— **整份是資料**（`content/config/ui-cues.json`）。要加第六格就在那裡加一個 `{id, zh, voiceCategory}`，⛔ 不必改任何程式。⚠️ 今天在後台編不到，理由與 `rallyExtendSeconds` 同型：通用引擎畫得動的是固定形狀的純量葉，而這是一份會長大的清單。⚠️ ⭐ `voiceCategory` 打錯字**不會報錯，它只是靜靜不播**（`playContextualVoice` 回 false）—— 那正是 GH#734 踩過的形狀。",
    },
    {
      path: "rallyExtendSeconds",
      why: "主揪倒數條上「再等一下」的那幾顆按鈕（owner:「還可以選多等 1 分鐘」）。⭐ **「有幾個選項」本身就是這個陣列** —— 要再加一個 5 秒的按鈕就在 `content/config/ui-cues.json` 裡加一個 `5`，按鈕上的字由秒數推導（⛔ 沒有第二欄可以打錯）。⚠️ 今天在後台編不到，理由與 `arena-pool` 同型：通用引擎畫得動的是固定形狀的純量葉，而這是一份會長大的清單。通用引擎長出陣列型欄位的那一天這一列該退場。上界 120 = 伺服器的 `rallyWaitMaxSec`，再長會被夾掉而畫面上的秒數就變成謊話。",
    },
  ],
};

