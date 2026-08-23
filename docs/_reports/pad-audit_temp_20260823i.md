# GH#634 逐頁手把可操作性審計（J2 · 唯讀 · 2026-08-23）

掃描範圍：`apps/client/src/ui/**` 全部玩家會遇到的畫面。
機制基準：`ui/PadFocusNav.tsx` —— 焦點集合 = `FOCUSABLE_SELECTOR`
（`a[href] · button · input · select · textarea · [tabindex]≠-1 · [data-pad-focusable]`），
scope = 最上層可見的 `[data-pad-scope]`（否則整個 body），B = `data-pad-back` 契約
→ 否則 `backControlIndex` 標籤啟發式。鍵盤 Tab 騎同一套 native focusable，
所以「焦點層看不見」＝「Tab 也到不了」，兩欄一起判。

⚠️ `isVisible()` 只驗 computed style + rect，**沒有遮擋測試** —— 一個蓋滿全螢幕
的覆蓋層若不宣告 scope，被壓在底下的控件仍然全部在焦點集合裡。這是斷因 A 的機理。

---

## 一、按「斷的原因」分組（修一個機制解一群）

### 斷因 A ⛔ 全螢幕覆蓋層沒宣告 `data-pad-scope` —— 焦點漏到被遮住的頁面（1 個檔，兩個場合，最嚴重）

| 頁 | 檔 | 實際後果 |
|---|---|---|
| 圖鑑 Codex（大廳開） | `ui/codex/CodexPage.tsx:420`（fixed inset:0，無 scope） | scope 退回 `document.body` ⇒ 焦點集合 = 圖鑑 + **被遮住的大廳整排按鈕**（isVisible 不測遮擋）⇒ 十字鍵會走到看不見的「登出／商城／設定」上，A 按下去就觸發 |
| 圖鑑 Codex（比賽中從暫停選單開，`PauseMenu.tsx:175`） | 同上 | **更糟**：PauseMenu 的 scope（priority 50）仍可見 ⇒ `topScope()` 回傳 pause ⇒ 手把整支在**圖鑑底下的暫停選單**上導航，A = 按到看不見的 繼續/重新開始/離開 |

配套缺口：圖鑑的關閉鈕（`CodexPage.tsx:778`，title「關閉圖鑑 (Esc)」）沒有
`data-pad-back`，只靠標籤啟發式；scope 不對時 B 掃的是整個 body。
**修法一格**：外層 `{...padModalScope("codex")}`（priority 需 > pause 的 50）＋
關閉鈕 `padBack` —— 兩個場合同時解。
（同型已修的前例：CreditsRoute GH#504、AssetConsole 是 dev 工具不列。）

### 斷因 B ⛔ 可點擊的裸 `<div onClick>` —— 焦點層與 Tab 都看不見（僅剩 1 處玩家面）

| 頁 | 檔 | 實際後果 |
|---|---|---|
| 中場商店 目錄列展開 | `ui/panels/MerchantShop.tsx:1401`（collapsed track `onClick={onToggle}`） | 每列的**買**是真 SfxButton（:1488）可聚焦可買；但**展開列**（效果全文/數值差額/說明 = ExpandedRow）只掛在裸 div 上 ⇒ 手把/鍵盤玩家買得到但**永遠讀不到內容**。游標模式（L3）是唯一退路 |

已修不再列（掃描確認）：ErrorToast GH#513（真按鈕+pad-back）、
商城 skin 列 #516（`data-pad-focusable`+tabIndex）。
其餘掃到的 `<div onClick>` 全是 backdrop「點外面關閉」（PauseMenu/Settings/
ChangePwd/Credits），內部都有真按鈕答 B —— 不是缺口。

### 斷因 C ⚠️ Tooltip 錨點沒有可聚焦子元素 —— 資訊只有 hover 拿得到（戰鬥 HUD，游標模式在戰鬥中刻意停用 ⇒ 無任何退路）

`components/Tooltip.tsx` 本身**有** `onFocus={show}`（focusin 會冒泡）——
只要錨點裡有任何 focusable，焦點即可觸發。缺的是錨點那一側：

| 頁 | 檔 | 實際後果 |
|---|---|---|
| 戰鬥 HUD 技能列 | `components/AbilityBar.tsx:444`（天生技）、`:615`（QWER；錨點是 `<div data-slot-key>`） | HUD 焦點模式（#508）開了也走不到 ⇒ 手把玩家整場讀不到技能說明（hold-to-read 也是指標手勢） |
| 戰鬥 HUD 裝備欄 | `hud/EquipmentBar.tsx:104–154`（錨點是純 div+GlyphTile） | 已購道具的名字/說明/唯一標記 hover-only |
| 記分板/其他 HUD Tooltip 錨點 | 同型 | 同型 |

**修法同一個機制**：StatsHoverPanel 已示範正解 ——
`hud/StatsHoverPanel.tsx:737-742` 在 HUD 焦點模式長出 `data-pad-stats-toggle`
可聚焦節點（`padTrigger:"focus"` 後台欄位）。把技能格/裝備格納入同一 pattern
（tile 加 `data-pad-focusable`，Tooltip 靠既有 onFocus 免改）即整群解。

### 斷因 D ⚠️ B 鍵靠標籤啟發式、不是 `data-pad-back` 契約（今天綠、改文案就斷）

GH#504 的原話：「That is a coincidence, not a contract」。現況 `padBack`/
`data-pad-back` 已覆蓋 15 檔；仍靠啟發式的：

| 頁 | 檔 | 現在為什麼剛好會過 |
|---|---|---|
| 設定 SettingsScreen | `SettingsScreen.tsx:370` ✕（scope 有、back 無） | ✕ 命中 `BACK_ALLOW_RE` |
| 建房 create-room | `platform/RoomListPanel.tsx:326` Cancel | "Cancel" 命中 allow |
| 結算 進度圖表 | `panels/ProgressChartPanel.tsx:260` close | 同上 |

低風險（allow/veto 表擋掉了危險字），但一行 `padBack` 就變契約。

### 斷因 E（記錄，非缺口）指標專屬 canvas 熱區

小地圖 `hud/Minimap.tsx:545`（peek/拖曳/右鍵移動）純指標；戰鬥中游標模式**刻意**
停用（`input/padCursor` 的規則）。手把玩家的等價操作是直接操角色 —— 設計如此，
列出來供 owner 判斷是否要例外開游標。

---

## 二、逐頁清單（J1 收尾當驗收表：✅ = 四項全過）

| 畫面 | 控件 | 焦點抓手 | Tab | hover 死角 | 判定 |
|---|---|---|---|---|---|
| 登入/註冊 AuthScreen | tab 切換/送出/手機登入 全真 button；文字欄→PadKeyboard #503 | ✅ | ✅ | onMouseEnter 只放音效 | ✅ |
| 手機登入 DeviceLoginPanel / LinkRoute | Btn；scope #504；padBack | ✅ | ✅ | 無 | ✅ |
| 大廳 LobbyScreen | 全 Btn；ErrorToast #513 真按鈕+back | ✅ | ✅ | 無 | ✅ |
| 排行/好友/線上/宿敵/英靈殿 | 全 Btn；champion-picker scope+padBack；英靈殿輪播暫停有焦點對等 #507 | ✅ | ✅ | 無 | ✅ |
| 商城 StoreScreen | 買鈕+skin 列 `data-pad-focusable` #516；purchase scope；padBack | ✅ | ✅ | 無 | ✅ |
| 建房/房列 RoomListPanel | Btn；create-room scope | ✅ | ✅ | 無 | ⚠️ D（Cancel 無 padBack） |
| 房間/準備室 RoomView | 10 顆全 Btn（ready/開始/延長/離開） | ✅ | ✅ | 無 | ✅ |
| 選人 ChampSelectPanel | scope；英雄格/🎲/鎖定 = SfxButton；搜尋欄→PadKeyboard；tab 內文靠捲動 #506；簡報 scope+back | ✅ | ✅ | 無 | ✅ |
| 中場商店 MerchantShop | scope+back；買/賣/復原 SfxButton | ⛔ 列展開是裸 div | ⛔ 同 | 無 | ⛔ B |
| 三選一 AugmentDraftPanel | scope；卡片 = SfxButton | ✅ | ✅ | 無 | ✅ |
| 記分板 Scoreboard | 開關 SfxButton；抽屜唯讀 | ✅（戰鬥中經 #508） | ✅ | 無 | ✅ |
| 設定 SettingsScreen | scope；select/slider 原地編輯 #505 | ✅ | ✅ | 無 | ⚠️ D（✕ 無 padBack） |
| 陣亡投幣/前往觀戰 | 真 button（HudRoot:112）/SfxButton；經 HUD 焦點模式 #508 | ✅ | ✅ | 無 | ✅ |
| 結算 MatchEnd/RoundVictory/LeaveSettlement | scope 或 data-pad-back 齊；返回大廳被 veto 表正確擋掉 B 誤觸 | ✅ | ✅ | 無 | ✅（圖表關閉 ⚠️ D） |
| 暫停選單 PauseMenu | scope 50；Resume=back | ✅ | ✅ | 無 | ✅ |
| 圖鑑 CodexPage | 列/區塊全 button，但**無 scope 無 back** | ⛔ 焦點漏到底下頁面 | ⛔ 同 | hover 只是變色 | ⛔ A |
| 戰鬥 HUD Tooltip（技能列/裝備欄） | tile 是裸 div 錨點 | ⛔ 焦點到不了 | ⛔ | ⛔ hover-only | ⛔ C |
| 屬性面板 StatsHoverPanel | `padTrigger:"focus"` 後台欄位 + 可聚焦 toggle | ✅ | ✅ | 已解 | ✅（C 的修法範本） |
| 小地圖 Minimap | canvas 指標熱區 | —（設計） | — | — | E 記錄 |
| 回放頁 ReplayApp | GlobalChrome（含 PadFocusNav）有掛；13 顆按鈕 | ✅ | ✅ | 無 | ✅ |
| 操作說明 ✕ / 音效 / 版本徽章 | SfxButton / 真 button | ✅ | ✅ | 無 | ✅ |

排除：CheatConsole、PracticePanel（藏在 CheatConsole）、AssetConsole、
ValhallaSandbox、GamepadDiagnostics（零控件，純顯示）—— dev 面或唯讀。

## 三、修理順位建議（按「一個機制解幾頁」）

1. **A：Codex 補 `padModalScope("codex")`（priority>50）+ 關閉鈕 padBack** —— 一行 spread 解兩個場合，且是唯一「A 會按到看不見的東西」級別的缺口。
2. **C：HUD tile 加 `data-pad-focusable`** —— Tooltip 的 onFocus 已在，一個屬性解技能列+裝備欄整群（比照 StatsHoverPanel）。
3. **B：MerchantShop 列展開改真按鈕**（或 track 加 tabIndex+key handler）。
4. **D：三顆關閉鈕補 padBack** —— 把巧合變契約，各一行。
