# 離開對戰 — TODO (#271)

Owner (#271):
> 戰鬥中不應該讓手把按鍵一鍵退出，應該要移動過去甚至按 [確認/取消] 的確認後才能退回大廳

## 這條真正的病灶

**不是按鍵綁定。** `apps/client/src/ui/PadFocusNav.tsx` 的 B 鍵處理是一條啟發式：
掃描目前 scope 內每一個可聚焦元素的 `aria-label + title + textContent`，用
`/取消|關閉|返回|離開|leave|back|close|cancel|✕|×|╳/i` 比對，第一個命中就 `.click()`。
對戰中沒有任何 modal 時，scope 就是 `document.body`；右上角的 Leave 晶片
（`title="leave the match"`、文字 `Leave`）**同時命中 `leave` 兩次**，而且是全文件第一個命中。

⇒ **在 champSelect 與每一次 intermission，按一下 B 就直接離場。**不需要先聚焦、不需要按 A、沒有確認。
（戰鬥中焦點層會讓位給角色，所以危險的是戰鬥「外」的那幾個階段。）
商店開著時更貼近真實誤觸：第一下 B 關商店，第二下 B —— 手把玩家最自然的「再退一層」反射 —— 就命中 Leave。

而 `findBackControl` 位在只有瀏覽器跑得到的 `.tsx` 裡，client 的 vitest env 是 `node`，
**這段程式在此之前一個測試都沒有**。

## 這次做了什麼

1. **純化 + 收緊 B 鍵**：`input/padFocusNav.ts` 新增純函式 `backControlIndex(labels)`，
   allow-list 只留「關閉/取消」語意，另加一條**否決表** `BACK_VETO_RE`
   （離開/退出/返回大廳/leave/exit/quit/…）壓過 allow-list。B 永遠不能觸發毀滅性控制項。
   `data-pad-back` 仍是最優先的明示契約。
2. **一個確認閘，所有路徑共用**：`ui/leaveFlow.ts` 是晶片／暫停選單／手把／觸控唯一的共用回呼，
   確認就加在那裡（**不是** `returnToLobby`——它還被「線上 Restart 無主機權限」與「查看戰績變化」自動呼叫）。
3. **`ui/LeaveConfirmDialog.tsx`**：`data-pad-scope="leave-confirm"` priority 60（>暫停選單的 50）、
   取消排最左最前（`initialFocusIndex` 取最上最左）、取消掛 `data-pad-back`、
   `role="dialog"` + `aria-modal` + `aria-labelledby/describedby` + 兩顆按鈕都有 `aria-label`。
4. **不會把人關在裡面**：`connecting`（卡住的客戶端就是停在這）與 `matchEnd` 直接離開不問；
   斷線／被踢／房間關閉根本不經過 `useRequestLeave`；比賽在對話框開著時結束 → 對話框自己消失。
5. **#193 不重覆問**：本隊已淘汰且有結算資料時，走既有的結算卡（它自己就有 返回大廳／繼續觀戰），
   不再多加一層確認 —— 一個決定只問一次。

## 文案的依據（每一句都對得上程式碼）

| 顯示的話 | 依據 |
| --- | --- |
| 英雄立刻交給 AI 接手 | `apps/game-server/src/rooms/MatchRoom.ts:649` `seat.setDriver(new AIDriver())` |
| 60 秒重連寬限只給斷線 | `MatchRoom.ts:654` `if (consented) return;` 在 `allowReconnection` 之前；`net/RoomConnection.ts:333` 送 `room.leave(true)` |
| 藍水晶／排名整場結束才結算 | `MatchRoom.ts:685+` `finishMatch()` 是 `settleToPlatform()` 的唯一入口 |
| 離線＝這場直接結束 | 沒有其他客戶端撐住房間，`onDispose`（`MatchRoom.ts:668`）不經過 `finishMatch` |

**刻意不寫**「你拿不到水晶」：座位保留 `accountId`、`spec.isBot` 仍是 false
（`MatchController.ts:1356`），別人把這場打完時離開者的座位仍在結算 payload 裡。誇大比照實更糟。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| leave-01 | B 鍵永遠不會按到毀滅性控制項：Leave 晶片（`leave the match Leave`）、`返回大廳`、`⏻ Leave to menu 返回大廳` 一律不取；否決的元素會被跳過、改取它後面真正的關閉鈕 | pad-back-no-destructive | regression | done |
| leave-02 | B 鍵仍然關得掉一般覆蓋層（`關閉商店 ✕` / `Close settings` / `取消` / `✕`），沒有可退出的東西時回 -1 | pad-back-closes | unit | done |
| leave-03 | 需要確認的範圍：`match` 螢幕的 champSelect／intermission／combat／resolution 全部要確認；不在 match 螢幕一律不問 | leave-confirm-gate | unit | done |
| leave-04 | 不可以把玩家關在裡面：`matchEnd`、`connecting` 直接離開；離開 match 螢幕（斷線／被踢／房間關閉）不問；對話框開著時比賽結束 → 對話框自己消失 | leave-confirm-no-trap | unit | done |
| leave-05 | 預設在「取消」：取消排在 DOM 最前（＝同一列最左，`initialFocusIndex` 取最上最左），且 `data-pad-back` 掛在取消而不是確認離開 | leave-confirm-default-cancel | unit | done |
| leave-06 | 手把可操作 + 有名字：`data-pad-scope="leave-confirm"` 且 priority > 暫停選單的 50；`role="dialog"` / `aria-modal` / `aria-labelledby` / `aria-describedby` 齊全；兩顆按鈕都有 `aria-label`；沒人要求離開時什麼都不畫 | leave-confirm-a11y | unit | done |
| leave-07 | 文案照實寫代價：線上版說 AI 接手／60 秒寬限不適用／藍水晶整場結束才發；離線版說單機這場直接結束，且不會拿「隊友」嚇人 | leave-confirm-copy | unit | done |
| leave-08 | 只有一個閘：ask 不會離開，只有 confirm 會跑 commit，cancel 會丟掉它；confirm 連按兩次也只離開一次 | leave-confirm-one-gate | unit | done |
| leave-09 | `beforeunload`：瀏覽器上一頁／關分頁仍是 1 個動作、無確認、無 teardown（全專案沒有 `beforeunload` 監聽）。要不要補需 owner 拍板（會影響 F5 與開發流程） | leave-beforeunload | integration | deferred |
| leave-10 | `panels/LeaveSettlementOverlay` 沒有 `data-pad-scope` / `data-pad-back`：`combat`/`resolution` 期間它彈出時手把完全操作不到它。本次未修（`ui/panels/**` 屬 #265 的工作面） | leave-settlement-pad-scope | regression | pending |
| leave-11 | 暫停選單的「↻ Restart match」線上模式會直接 `returnToLobby()`，同樣零確認，且就緊鄰 Leave 上方。要不要一併納入確認閘需 owner 拍板 | leave-restart-confirm | regression | pending |
