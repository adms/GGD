# 陣亡投幣被拒**完全沒有回饋** —— lane E 完整報告

日期 2026-08-23 · lane E · 分支 `main`

---

## 1. 複驗（第三守則：註解會說謊，我自己量過）

| 宣稱 | 複驗結果 | 證據 |
|---|---|---|
| `HudRoot.tsx` 的 `canThrow` 不看金幣 | ✅ 屬實 | `apps/client/src/ui/HudRoot.tsx:79`（改動前）`const canThrow = phase === "combat" && coinsLeft > 0;` |
| 出貨經濟保證撞得到 | ✅ 屬實 | `content/config/arena-rules.json` → `goldDrop.coinValue = 100` × `coinsPerRound = 10` ⇒ 1000 金；`content/config/config.match.json:53` → `startingGold = 600`。**一毛不花也只供得起 10 顆裡的 6 顆** |
| `coinDropRejected` 客戶端零消費端 | ✅ 屬實，而且**伺服器自己寫著** | `apps/game-server/src/net/eventFanout.ts:768`（改動前）逐字：「⚠️ STATED, NOT HIDDEN: this event currently has NO client consumer — `audio/combatSfx` returns null for it on purpose and no HUD reads it, so today it is inert on all 12 sockets.」 |
| `InputCapture` 的註解是承重的謊 | ✅ 屬實 | `input/InputCapture.ts:56-60` 拿「the SIM … answers every refused press with a `coinDropRejected` reason」當作 **G 不設閘的理由**，而那個 answer 沒有人在聽 |
| 音效側也在說謊 | ⚠️ **額外發現，屬實** | `audio/combatSfxSpatial.ts:167` 寫 `coinDropRejected: "voiced as silence — ui/castFeedback owns the refusal cue"` —— 而 `castFeedback` 從來沒有擁有過它 |

### ⭐ 而且不是一個介面，是**兩個**

`apps/client/src/ui/TouchControls.tsx:231`（改動前）有**完全同型**的缺陷：
`coinMode = phase === "combat" && !localAlive && localMaxHp > 0 && seat.coinsLeft > 0` —— 一樣不看金幣。
手機玩家按的是螢幕正中央最大的那顆按鈕，症狀一模一樣。

### ⭐ 第三個發現：兩份文案都是**第二住處**（第〇·四守則）

`HudRoot.tsx` 與 `TouchControls.tsx` **各自**寫著 `const COINS_PER_ROUND = 10;`
（註解都寫「mirrored from `config.arena-rules@1 goldDrop.coinsPerRound`」= 承認自己是鏡子）
外加字面值 `丟 100金`。⇒ owner 一調 `goldDrop.coinValue`，**兩份文案同時變成謊話**，
而沒有任何守衛會紅。

---

## 2. 我挑的預設：**(a) 照拒並提示**

> owner 2026-08-23（常設）：「**沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback**」

⇒ 沒有列表拿去問，自己挑了 (a)，並把 (b) 做成一格可以一鍵回頭的後台欄位。

**理由**（我的判斷，⛔ 不是 owner 的話）：客戶端的 `seat.gold` 是快照投影（有延遲、會被下一份快照覆寫），
拿它擋按鈕會在邊界產生「明明有錢卻按不下去」，而那比「按了被拒」更難查 ——
一個被客戶端擋掉的按鍵**連事件都不會發生**，所以它沒有任何可以查的痕跡。
權威側說了算的那條路，每一次拒絕都留下一顆帶著原因的事件。

### 後台那一格

| | |
|---|---|
| **文件** | `config.ui-cues@1`（`content/config/ui-cues.json`） |
| **欄位** | `coinThrowButtonMode` |
| **值** | `"always-enabled"`（⭐ 出貨＝我挑的 (a)） / `"grey-when-poor"`（rollback＝(b)） |
| **後台頁** | 設定 → **畫面提示** → 「陣亡投幣：金幣不足時那顆按鈕的樣子」 |
| **三個住處** | ① `content/config/ui-cues.json` ② `schema/config/uiCues.ts` 的 `DEFAULT_UI_CUES` + `resolveUiCues` ③ `apps/admin/src/configForms.ts` 的 `UI_CUES_SPEC.fields` + `optionLabels` |

⭐ **為什麼住 `config.ui-cues@1` 而不是新開一份文件**：那一份的檔頭自己寫著三格共用的那句話是
「**剛剛發生了什麼，畫面要說出來**」—— 這一格逐字就是那件事。
⚠️ 而且它是 **2026-08-23 才出生**的文件 ⇒ 線上**還沒有耐久覆蓋層**，所以新欄位可以是**必填**的。
如果塞進 `arena-rules.goldDrop`（另一個語意上說得通的家），線上**已經有**覆蓋層，
一個必填的新欄位會讓那份覆蓋層驗證失敗 ⇒ 內容整份載入失敗 ⇒ 退回 2 隻骨架英雄
（＝ 2026-08-02 那次生產故障的形狀）。

### ⛔ 這一格**管不到**「有沒有回饋」

回饋是**修好**，⛔ 不是選項（第一·五守則）。兩種模式底下，**送得出去的每一次**都會拿到那句話 ——
`grey-when-poor` 只是把「金幣不足」這一種提早講，而鍵盤 **G** 與觸控那顆在兩種模式下都照樣送得出去
（sim 才是權威）。

---

## 3. 逐檔改了什麼

| 檔 | 改動 |
|---|---|
| **`apps/client/src/ui/coinThrow.ts`**（新） | 全部的新邏輯：`coinThrowRules()`（從 `arena-rules.goldDrop` 讀 coinValue / coinsPerRound）· `coinThrowGreysWhenPoor()` · `coinThrowAffordable()` · `COIN_REJECT_TEXT` 六句話 + `COIN_REJECT_GENERIC` · `coinRejectionFromEvent()`（純）· `recordCoinEvent()`（排水口的入口） |
| `apps/client/src/GameApp.ts` | **1 個 import + 1 行呼叫**（`recordCoinEvent(ev)`，緊接在 `recordCastEvent` 之後）。⚠️ 這是 4,077 行撞車熱點，改動刻意壓到最小 |
| `apps/client/src/ui/castFeedback.ts` | `CastNotice.slot` 放寬成 `ChampionAbilitySlot \| null`（投幣不坐在任何一格技能上），`noteCastDenied()` 對 `null` 無事發生。⭐ 判空收在 `noteCastDenied` 裡面，⛔ 不是叫每個呼叫端記得 |
| `apps/client/src/ui/HudRoot.tsx` | `SpectatorHint`：刪掉 `COINS_PER_ROUND = 10`、文案改成 `丟 {rules.coinValue}金 (G) {coinsLeft}/{rules.coinsPerRound}`、`grey-when-poor` 時 `disabled` + 變灰 + `cursor: not-allowed`、加 `data-coin-throw` |
| `apps/client/src/ui/TouchControls.tsx` | 同上，套在中央那顆大鈕（`data-touch-coin-poor`、`onTouchStart` 在變灰時是 `undefined`） |
| `apps/client/src/input/InputCapture.ts` | ⭐ **那句承重的謊改掉了**（見下節逐字） |
| `packages/shared/src/content/schema/config/uiCues.ts` | Zod 欄位 + `DEFAULT_UI_CUES` + `resolveUiCues` |
| `content/config/ui-cues.json` | 出貨值 + `note` 的第 ⑤ 段 |
| `apps/admin/src/configForms.ts` | `UI_CUES_SPEC.fields` 一列（含 `optionLabels` 兩條）+ `consumer` 字串補上新的消費端 |
| `apps/client/src/ui/coinThrow.test.ts`（新） | 守衛，**75 行**（體驗層上限 80） |

### `InputCapture` 那句謊改成什麼（逐字）

改動前（承重的理由）：

> the SIM owns the "only the dead may throw" rule and **answers every refused press with a `coinDropRejected` reason**, so gating the key too would just produce a second, silent refusal path that could disagree with the server.

改動後 —— **理由留著**（它本身是對的），但**加上它曾經是空的**這件事：

> ⚠️ **這段話在 2026-08-23 之前是一句承重的謊**（CLAUDE.md 第三守則）。它拿「sim 會回答每一次被拒的按鍵」當作**不設閘的理由**，而那個回答在客戶端**一個消費端都沒有** —— `game-server/src/net/eventFanout.ts` 自己的註解逐字寫著「this event currently has NO client consumer」。於是每一次 G、每一次觀戰橫幅上那顆按鈕，都是**純粹的靜默**：沒有 toast、沒有嗶聲、沒有抖動。⛔ 而它不是邊角 —— 出貨經濟保證每個玩家每一場都撞得到。
>
> ⭐ 現在真的有消費端了：`ui/coinThrow.recordCoinEvent()`，掛在 `GameApp` 的事件排水口上。⇒ 這一段的理由重新成立，而 `ui/coinThrow.test.ts` 是讓它**不能再默默失效**的那條線。

---

## 4. ⛔ 我**沒有**做的事，以及為什麼

| 沒做 | 為什麼 |
|---|---|
| **拒絕音效** | `notice.sfx` 在整個客戶端**沒有任何消費端**（唯一的訂閱者 `CastNoticeLine` 只畫 `notice.text`）。填一個 key 進去＝我自己造一句「說了但不會發生」的話（第一·五守則）⇒ 我填的是 **`sfx: null`** 並在原地寫下理由。⚠️ **連帶的既有謊言**：`audio/combatSfxSpatial.ts:167` 的「ui/castFeedback owns the refusal cue」**今天仍然不成立**。那份檔在音效 lane 的柵欄裡，⛔ 我沒有動它 —— 這是一筆該開票的順手缺陷（第零守則⑧） |
| `pnpm content:build` | ⛔ 全域鎖（我改了 `content/config/ui-cues.json`）。⚠️ **主 session 必須跑一次**，否則 `shippedBundleIsCurrent.test.ts` 會紅、線上拿到的 `bundle.json` 不含這一格 |
| 改 `sim/coins.ts` / `CommandSystem.ts` | 權威側**本來就是對的**（每一個 reject 都 emit）。缺的一直只有客戶端那一端 ⇒ 動它是純成本（第零守則） |
| 對抗輪 | 體驗層（UI 接線），第二守則明文：**不開對抗輪** |

---

## 5. 測試

**體驗層預算：測試 75 行 ≤ 實作行數，且 ≤ 80 行 ✅ · 接線類突變做一次 ✅ · 不開對抗輪 ✅**

⭐ 驗的是**機制**（「被拒的時候有東西進了回饋管線」），⛔ 一個 `coinValue` / `startingGold` 的數字都沒有寫進斷言。

⭐ **跑的是 `GameApp` 真的那條排水口**（`Object.create(GameApp.prototype)` + 惰性協作者，
沿用 `ui/hud/killCombo.test.ts` 已經證明過的 seam）—— ⛔ 不是直接呼叫純函式，
因為這一包的失敗形態正是③「可以從樹上刪掉而測試全綠」，而直接測純函式對
「有接線」和「沒接線」會同樣通過。

### 突變驗證（一批一條，挑最承重的那一行）

```
apps/client/src/GameApp.ts
-    recordCoinEvent(ev);
+    if (String(ev.type) === "__never_fires__") recordCoinEvent(ev);
```

⇒ `apps/client/src/ui/coinThrow.test.ts` **3 條裡紅 2 條**（EXIT=1）。
還原用 `Edit` 把那一行改回來（⛔ 不是 `git checkout <檔>`）。

### 離開碼

| 指令 | EXIT |
|---|---:|
| `npx vitest run`（第 1 次：coinThrow + castFeedback + castAnnounce + configForms + laneConfigDocs + killCombo） | **1** —— ⛔ 全部是**別條 lane** 的 in-flight `world-cues`（`tintG` 說明太短）＋我自己的 enum 缺 `optionLabels`（當場修掉） |
| `npx vitest run`（第 2 次：configForms + navSections + hudSurfaces + padHudFocus + controlLegendModel + rallyExtend + passiveProc + coinThrow） | **1** —— **318 passed / 2 failed，兩條都是別條 lane 的 `world-cues`**（`line.damageLine.tintR` 說明太短、NAV 多了 `worldCues` 但 `BASELINE_PAGES` 沒更新）。⛔ 我這一批**零紅** |
| `npx vitest run apps/client/src/ui/coinThrow.test.ts`（第 3 次：突變） | **1**（預期紅）；還原後不重跑（改壞之前已經綠過） |
| `pnpm typecheck` | **0** |

---

## 6. ⚠️ 併行事故：我的三個檔被**別條 lane 送上車了**

我準備 commit 的時候發現 `packages/shared/src/content/schema/config/uiCues.ts` ·
`content/config/ui-cues.json` · `apps/admin/src/configForms.ts` 三個檔
**既沒有 diff、也不在 `git status` 裡** —— 它們已經在 HEAD 裡了。

```
5c83b292 fix(vfx): 施法指示器教錯閃避方向 —— 畫圓盤,而 sim 判膠囊
```

那條 lane 的 commit 把我那三個檔一起送上去了。⭐ 這正是 CLAUDE.md 記著的那一句：

> pathspec 規則只擋得住我把別人的東西送上車，⛔ 擋不住別人把我的送上車。

**照 owner 的裁決：⛔ 不回捲。** 程式碼在 HEAD 裡、內容是對的、typecheck 綠 ——
遺失的只有票號與突變紀錄，而它們現在寫在這裡與我自己那個 commit 的訊息裡。

⚠️ **副作用一件**：`apps/admin/src/configForms.ts` 當時同時帶著**那條 lane 自己還沒修好的**
`world-cues` 欄位（說明太短 → `configForms.test.ts` 紅）。那不是我造成的，也不是我能分開的
（同一個檔），⇒ 那條紅**歸他們**，我這一批不含它。

---

## 7. 交給主 session 的三件事

1. ⭐ **`pnpm content:build`** —— `content/config/ui-cues.json`（我）與 `content/config/world-cues.json`（別條 lane）都動了，`bundle.json` 現在是過期的。
2. ⭐ **開一張票**：`audio/combatSfxSpatial.ts:167` 的「ui/castFeedback owns the refusal cue」是第三守則形狀的謊 —— `notice.sfx` 全客戶端零消費端，所以**任何**拒絕（技能／投幣）今天都是無聲的。修法在音效 lane 的柵欄裡。
3. ⚠️ 別條 lane 的 `world-cues` 目前讓 `configForms.test.ts` 與 `navSections.test.ts` 紅著（`BASELINE_PAGES` 少一列 `worldCues`）。
