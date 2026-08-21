/**
 * padModalScope — ONE 住處 for「這個 modal 的 pad 焦點範圍叫什麼、排第幾」(GH#504).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要它
 * ─────────────────────────────────────────────────────────────────────────────
 * `ui/PadFocusNav.tsx` 的 `topScope()` 只認 `[data-pad-scope]`，找不到就把 root
 * 退回 `document.body`。而 `isVisible()` **不做遮擋判定** —— 於是一個沒有宣告
 * scope 的 modal 開著的時候，方向鍵照樣把焦點移到遮罩**底下**仍然可見的按鈕上，
 * 而 pad 的 A 走的是 `el.click()`，完全不經過 `pointer-events`，所以 scrim 擋得住
 * 滑鼠、擋不住手把。#504 量到 **28 個缺口**全部是這同一個根因。
 *
 * ⛔ 這裡刻意不是「每個 modal 各自手打兩個字面值」：priority 是一條**梯子**，
 * 只有把整條梯子放在一起才看得出「誰蓋在誰上面」。散在 12 個檔案裡的 12 個數字
 * 沒有辦法回答「announcement 跟 change-password 誰贏」這個問題。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 梯子（數字越大越贏；平手時 document order 靠後的贏，見 topScope）
 * ─────────────────────────────────────────────────────────────────────────────
 * 這張表 **不含** #504 之前就宣告好的六個 scope（它們住在別的 lane 的檔案裡）：
 *
 *     augment-draft 40 (panels/AugmentDraftPanel) · settings 45 (ui/SettingsScreen)
 *     create-room   45 (platform/RoomListPanel)   · purchase 45 (platform/StoreScreen)
 *     pause         50 (ui/PauseMenu)             · leave-confirm 60 (ui/LeaveConfirmDialog)
 *
 * 下面每一格都要跟它們對得起來，所以那六個數字寫在這裡當**參照**，
 * ⛔ 不是第二份定義 —— 守衛 `padModalScope.test.ts` 讀的是渲染出來的 DOM。
 */

/**
 * 每一個由 #504 補上的 modal scope → 它的 priority。
 *
 * · `champ-select` 20 — 它是一整個**相位面板**，不是覆蓋層；briefing(40) 與
 *   augment-draft(40) 都必須贏過它。
 * · `shop` 30 — 三選一(40) 開著的時候要贏過商店（issue #504 的裁決）。
 * · `briefing` 40 — 蓋在 champ-select 上的開場十秒。
 * · `champion-picker` 42 — 排行榜內的英雄選擇覆蓋層；公告(45)蓋得過它。
 * · `announcement` 45 / `change-password` 46 — 跟著它們的 z-index(90 / 100)走：
 *   玩家**自己開的**對話框永遠不會被公告關住。
 * · `device-login` 50 — 登入頁上的 QR modal。
 * · `match-end` 55 · `credits` 56 — 結算卡 / 版權頁，蓋過 pause(50)。
 * · `device-link` 60 · `leave-settlement` 60 · `rally-confirm` 60 —
 *   與 leave-confirm 同級的終局選擇。三者**不可能同時在場**（一個是獨立路由、
 *   一個在戰鬥中、一個在大廳），所以平手不會變成一場比誰在後面的競賽。
 */
export const PAD_MODAL_SCOPES = {
  "champ-select": 20,
  shop: 30,
  briefing: 40,
  "champion-picker": 42,
  announcement: 45,
  "change-password": 46,
  "device-login": 50,
  "match-end": 55,
  credits: 56,
  "device-link": 60,
  "leave-settlement": 60,
  "rally-confirm": 60,
} as const;

export type PadModalScopeName = keyof typeof PAD_MODAL_SCOPES;

/**
 * Spread this onto the modal's OUTERMOST rendered element:
 *
 *     <div {...padModalScope("rally-confirm")}> … </div>
 *
 * ⚠️ 回傳型別刻意是 `Record<string, string>` —— JSX 對帶橫線的屬性不做欄位檢查，
 * 但**展開**一個具名型別會被檢查（同 `LeaveConfirmDialog` 的 `{...{ [ATTR]: "" }}`）。
 */
export function padModalScope(name: PadModalScopeName): Record<string, string> {
  return {
    "data-pad-scope": name,
    "data-pad-scope-priority": String(PAD_MODAL_SCOPES[name]),
  };
}

/**
 * Spread this onto the modal's cancel / close control so B is a **contract**
 * instead of `backControlIndex`'s label heuristic (the exact mechanism GH#271
 * was filed about: with no scope, B clicked the first 「關閉/取消/dismiss」 it
 * found anywhere in the document).
 */
export const PAD_BACK: Record<string, string> = { "data-pad-back": "" };
