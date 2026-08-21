# 🧾 v0.23.0..HEAD 票務結案清單

> 產出時間 2026-08-21 19:38 · 範圍 `git log v0.23.0..HEAD` = **27 個 commit**
> ⚠️ **19:44 更新**：盤點期間又有 **3 個 commit 落地**（`8be1fc6d` · `b3d13396` · `3c83170f`）
> ⇒ 現在是 **30 個**。三個都已補進 §1 的表。八條 lane 併行時「commit 數」是一個會動的量。
> ⛔ 唯讀盤點。⛔ 沒有 push / deploy / gh 寫入 / content:build / skills:sync。
> ⭐ 每一張「可關」都**讀了出貨檔或跑了守衛**，⛔ 沒有一張是只看 commit message 就判的。

---

## 0. 一句話結論

| | 數 |
|---|---:|
| commit 總數 | **27** |
| 帶著**正確**票號的 commit | **13** |
| ⛔ **完全沒有票**的實作 commit | **3**（785a585c · bedfcfc5 · 7bfd74bb） |
| ⚠️ 有票但 commit **沒帶號**（GitHub 不會 cross-link） | **6**（f0779b70→#486 · 5ea04900→#487 · 00935377→#488 · 373b3065/1438c1d7→#484 · 50cf594a→#492） |
| ⚠️ 票號**誤植到不相干的票** | **2**（ec5196d0 的 `#244` `#248`） |
| 純票務 / 帳本 docs commit（本來就不需要票） | **6** |
| ✅ **已落地但還開著、建議這一輪關掉** | **10 張**（#491 #492 #493 #494 #495 #496 #497 #498 #469 #447） |
| ⏸ 落地但建議**先不關** | **3 張**（#414 #484 #446） |
| ❌ 開了票但**這一版完全沒做** | **1 張**（#499） |

**最重要的一個發現**：`ec5196d0` 的 subject 掛了 `(#244)(#248)` —— 那兩個是
**2026-07 時期 `docs/todo/attributes.md` 的舊 task 編號**（`championAttributes.test.ts:2`
逐字寫著「task #248」），⛔ **不是 GitHub issue**。而今天 GH#244 是「JASS 技能模板計畫」、
GH#248 是「每回合硬上限 5 分鐘出火圈」—— **兩張完全不相干、而且都還開著的票**。
GitHub 已經把那個 commit cross-link 上去了。⛔ **這兩張絕對不可以關**，
而且下一版起舊 task 編號要寫成 `task#248` 之類不會被 GitHub 解析的形式。

---

## 1. ⭐ 每個 commit ↔ 票號

| # | hash | 主旨（節錄） | 票 | 判定 |
|--:|---|---|---|---|
| 0a | `3c83170f` | feat(lobby): 集合令反轉成 **opt-out** | **#492** | ✅ 正確（19:4x 落地，見 §2 #492） |
| 0b | `b3d13396` | docs(deploy): 部署協定第 2 步的 owner 勾選表 | —（守則） | 不需要票 |
| 0c | `8be1fc6d` | docs(rules): ⚡ 平行工作流的四條加速規則 | —（守則） | 不需要票 |
| 1 | `1438c1d7` | docs: 逐則對票裸票號正規化 | **#484**（⚠️ 未帶號） | 帳本工具硬化 |
| 2 | `50cf594a` | docs: context 快照(96%) + 集合令 waitSeconds 10→5 | **#492**（⚠️ 未帶號，⛔ **內含出貨值改動**） | 見 §2 #492 |
| 3 | `3c4ce3a0` | docs(contract): codex 契約補 AP 最後一乘 + 出身決定成長 | **#447** **#414** | ✅ 正確 |
| 4 | `375660ac` | feat(admin): Quick Approval 收攏常用批核 | **#495** | ✅ 正確 |
| 5 | `cd348023` | fix(admin): 回放連結不再指向 localhost · 錄影預設不刪 | **#496** **#498** | ✅ 正確 |
| 6 | `98902435` | feat(admin): 兩張英雄名單印名字 + 變身態標註 | **#497** | ✅ 正確 |
| 7 | `274945b0` | feat(vfx): 殭屍掉小金幣 → 貝茲吸回 + 連段音階 | **#494** | ✅ 正確 |
| 8 | `15877dff` | feat(lobby): 大廳集合令 | **#492** | ✅ 正確 |
| 9 | `37ce22b9` | docs: #494 #495 開票 + 逐則對票 + 作戰板 | —（票務） | 不需要票 |
| 10 | `4f70d015` | fix(admin): 4634px 左欄把右欄推出畫面 | **#493** | ✅ 正確 |
| 11 | `dfa09b66` | fix(lobby): 拿掉房間裡那個「一堆 id」的下拉 | **#491** | ✅ 正確 |
| 12 | `ec5196d0` | feat(balance): 屬性額外傷害全換 AP% + 攻速交回出身表 | **#447** **#414** ⚠️ + `#244` `#248` **誤植** | 見 §0 |
| 13 | `2cf8db04` | docs: 逐則對票 46/46 + 作戰板 260 列 | —（票務） | 不需要票 |
| 14 | `373b3065` | docs+fix: 票務整理 + 逐則對票閘補洞 + intToAbilityPower 定案 4 | **#484**（⚠️ 未帶號） | 帳本閘修 bug |
| 15 | `785a585c` | feat(balance): 技能傷害 ×(1 + AP×0.5%) | ⛔ **`#ap-damage-scaling` 不是票號** | **沒有票** |
| 16 | `fcd51d7c` | feat(roster): 隱藏英雄名單四位落地 | **#469** | ✅ 正確 |
| 17 | `7bfd74bb` | fix(balance): 三圍成長歸 0 補完 20 個變身態 | ⛔ **無** | **沒有票** |
| 18 | `095e27fe` | fix(guards): 11 條紅的守衛收乾淨 | **#485** **#490** | ✅ 正確（兩張已關） |
| 19 | `af5e3f94` | docs: #489 #490 關票 + Excel + 作戰板 | —（票務） | 不需要票 |
| 20 | `3c066f2b` | feat(skill): 59-01 吞噬改被動 | **#489** | ✅（已關） |
| 21 | `fd7026ec` | docs: 逐則對票補到 15:33 | —（票務） | 不需要票 |
| 22 | `efdf4bce` | feat(sim): 飛行是穿牆判定的合法例外 | **#490** | ✅（已關） |
| 23 | `948c8f29` | docs: 逐則對票補到 04:5x | —（票務） | 不需要票 |
| 24 | `00935377` | fix(admin): 鑄技工坊預覽讀死 TS 常數 | **#488**（⚠️ 未帶號） | 票已關，link 缺 |
| 25 | `bedfcfc5` | feat(balance): 移速／攻速每級成長五級距 | ⛔ **`#speed-growth` 不是票號** | **沒有票** |
| 26 | `5ea04900` | fix(sim): 位移終點必須落在牆的這一邊 | **#487**（⚠️ 未帶號） | 票已關，link 缺 |
| 27 | `f0779b70` | feat(curation): 一鍵清理變身態 | **#486**（⚠️ 未帶號） | 票已關，link 缺 |

### ⛔ 三個「做了但沒有記錄」

| commit | 是什麼 | 為什麼一定要補票 |
|---|---|---|
| `785a585c` | **全域技能傷害公式 `×(1+AP×rate)`**，出貨 rate 0.005 / scope ability / apRatioMode stack；新 config doc `config.ap-damage-scaling@1`、新後台頁、`apdmg:build/check` 兩支閘 | 這是**這一版最大的單一平衡機制改動**，而 GitHub 上一個字都查不到。owner 的原話（「技能傷害都套用公式 (1+AP\*1%)…=> 預設 0.5%」）只活在 commit body 裡 |
| `bedfcfc5` | **移速／攻速每級成長五級距**（新 `config.speed-growth-tiers@1`、23 格後台、`speedtiers:build/check`）＋ 一個 🔴 **owner 內部矛盾的裁決**（「49 位全部給中」vs「零平衡改動」，我照第〇·六守則①選了後者，B 案做成 `ladder` 下拉） | 那個 🔴 矛盾**需要 owner 事後看一眼**，而現在它沒有任何一個他會打開的地方 |
| `7bfd74bb` | 三圍成長歸 0 **補完 20 個變身態**（前一批只做 49 位可選本體，owner 說的是「所有角色」）；sela/thorne 刻意不動 | 它是 `095e27fe` 自己列的「順手發現、沒有自己修的三件」第 2 項 —— 修了卻沒有回填任何紀錄 |

**建議（⛔ 我沒有寫入，gh 唯讀）** —— 主 session 補三張票再用同一個號 `git notes` 或寫進 release note：

```bash
gh issue create -t "技能傷害全域公式 ×(1+AP×0.5%) —— 落地紀錄（commit 785a585c）" -b "..."
gh issue create -t "移速／攻速每級成長五級距 —— 落地紀錄 + owner「49 位全給中」vs「零平衡改動」待裁（commit bedfcfc5）" -b "..."
gh issue create -t "三圍成長歸 0 補完 20 個變身態（commit 7bfd74bb）" -b "..."
```
⭐ 三張都是**開了就可以立刻關**的落地紀錄票（第二張要留著等 owner 對那個 🔴 表態）。

---

## 2. ⭐ 已落地但還開著 —— 逐張實測驗證

> **驗證方法**：讀出貨檔的位元組 + 讀接線點 + 跑那一條守衛。
> 13 支守衛全部跑過：**admin 4 檔 19 條 / client 3 檔 17 條 / game-server 2 檔 7 條 /
> shared 4 檔 10 條 = 53 條全綠**，四個 EXIT 全 0。

---

### ✅ #491 創建房間頁那個「一堆 id」的選單 → **可關**

| 驗什麼 | 結果 |
|---|---|
| `apps/client/src/ui/platform/RoomView.tsx` 還有沒有 `<select>` | **0 個**（`grep -c "<select"` = 2，⭐ 兩個都在檔頭的 GH#491 說明註解裡，不是 JSX） |
| `setPick` / `myPick` / `catalog.champions` | RoomView 內**全部消失**（僅存的 `myPick` 在 `ChampSelectPanel.tsx`，那是場內選角，不同東西） |
| 伺服器那半有沒有被誤刪 | ✅ 刻意留著（檔頭註解說明是對偽造客戶端的防守） |
| 守衛 `roomNoChampionIdMenu.test.ts` | **1 passed** |

**關票留言草稿**
```
✅ 已落地並實測 —— commit dfa09b66

那個下拉是 RoomView 的英雄預選 <select>（catalog.champions 整份倒出來，label 印原始 id，
實測 71 筆）。逐段量過它是死的：選擇寫進 redis room:<id>:champions，而全平台唯一的讀者
是 room.Service.Start 的持有權閘，且該 <select> 對沒買的英雄下 disabled ⇒ 那道閘永遠
觸發不了；gamelink.Seat.Champion 從來沒有被賦值過 ⇒ 選擇從沒送到遊戲伺服器。

已移除：RoomView 的 <select> + myPick/setPick/catalog 三個 selector、store 的 myPick 狀態、
api.setReady 的第三個參數。⛔ 伺服器那半刻意留著（對偽造客戶端的防守，有 Go 測試在守）。

驗證（2026-08-21 19:36）：RoomView.tsx 內 <select> 剩 0 個（僅存兩處在檔頭註解）；
守衛 apps/client/src/ui/platform/roomNoChampionIdMenu.test.ts 掛真的 RoomView 斷言頁面
textContent 不含目錄裡任何一個英雄 id —— 1 passed。
```

---

### ✅ #492 大廳集合令 → **可關**（owner 四項要求逐項對到出貨檔）

| owner 的字 | 出貨在哪 | 驗到 |
|---|---|---|
| 「所有線上在大廳的人都跳出確認視窗」 | `apps/platform/internal/room/rally.go` + `handlers.go:50 rr.Post("/rally", h.rally)` | ✅ 路由與檔案都在 |
| 「最多等 10 秒」→ owner 同日改口「**五秒是讓人按否定的**」 | `content/config/lobby-rally.json` `waitSeconds: 5` · `joinMode: "opt-out"` | ✅（`50cf594a` 把 10→5，⚠️ 那個 commit 沒帶票號；opt-out 那一半在 `3c83170f`）。⚠️ **披露**：我 19:36 讀這份 JSON 時 opt-out 那一半還在另一條 lane 的**工作樹**裡（19:4x 才 commit）—— 現在已落地，結論不變 |
| 「包含 vs bot」 | `includeBotMatch: true` | ✅ |
| 「明顯提示姓名與積分、**所選英雄**」 | `HumanRosterPanel.tsx:50` `championDisplayFor(row.championId).name`（無選角顯示「未選角」）· `:82` `row.rating` | ✅ 三樣齊 |
| 「每回合結算也都要特別再提示一次」 | `showRosterInSettlement: true` · `showRosterInChampSelect: true` | ✅ |
| 「因為有可能斷線離開或連線回來」 | `SeatState.human`（`schema.ts:360`）+ `rating uint16`（`:343`）APPEND-ONLY；面板三格一起讀，斷線列有自己的顏色 | ✅ |
| rollback | `enabled=false` → 回到 `POST /rooms/solo` 那條「立刻開」 | ✅ |
| 守衛 | `lobbyRally.test.ts` **5 passed**；`internal/room/rally_test.go` 存在（端到端，⚠️ 本輪沒跑 Go，需 redis） | ✅ |

⚠️ **關票時要一起講的部署約束**：`SeatState` 新增兩格 append-only ⇒
**這一版不可以 `--content-only` 部署**，煙霧測試一律開全新分頁。

**關票留言草稿**
```
✅ 已落地並實測 —— commit 15877dff（+ 50cf594a 把 waitSeconds 10→5）

owner 四項逐項對到出貨檔（2026-08-21 19:36 實測）：
· 廣播：apps/platform/internal/room/rally.go + handlers.go 的 POST /rooms/{id}/rally，
  每人一枚 crypto/rand 單次 token（沿用 invite.go，⛔ 不是第二套邀請系統）；
  presence.in-match 一律排除、房內成員排除，名單與 GET /lobby/online 共用 livePlayable()。
· 秒數：owner 同日改口「預設是加入，五秒是讓人按否定的」⇒ 出貨 waitSeconds=5 +
  joinMode="opt-out"，並補 idleExcludeSeconds=120（掛機／背景分頁不自動加入）。
· 含 vs bot：includeBotMatch=true（⛔ 練習模式仍走 /rooms/solo）。
· 姓名／積分／所選英雄／每回合結算再提示：HumanRosterPanel.tsx:50 championDisplayFor(...)、
  :82 rating；showRosterInChampSelect + showRosterInSettlement 兩格都是 true。
· 斷線可見：SeatState 新增 human（schema.ts:360）與 rating（:343），APPEND-ONLY。
  ⛔ 不是 driver !== "ai" —— onLeave 在斷線當下就把 driver 換成 AI，那一版會在他最需要
  被看見的那一刻把他整列刪掉。

守衛：apps/client/src/ui/platform/lobbyRally.test.ts 5 passed；
apps/platform/internal/room/rally_test.go（端到端：建房→廣播→接受→開始，
並釘住「比賽中的人收不到」）。

⚠️ 部署：SeatState 兩格 append-only ⇒ 這一版必須完整重建映像，⛔ 不可 --content-only；
煙霧測試開全新分頁。
rollback：後台「大廳集合令」總開關關掉。
```

---

### ✅ #493 後台右側被吃掉 / 切頁沒回到頂端 → **可關**

| 驗什麼 | 結果 |
|---|---|
| `apps/admin/src/ui/shellLayout.ts` 存在且 tracked | ✅（`shellScrollLayout` :48 · `resetContentScroll` :98） |
| 真的接進出貨的殼 | ✅ `App.tsx:6` import · `:931` 呼叫 reset · `:936` 用 layout · `:1026` 註解 |
| 守衛 `shellScroll.test.ts` | **4 passed**（含 `renderToString(<Console/>)` 讀**出貨渲染樹**的 `<main style>`，避開失敗形態⑤） |

**關票留言草稿**
```
✅ 已落地並實測 —— commit 4f70d015

根因不是 CSS 截斷：左欄導覽 105 列展開後自己就 4634px 高，它與右欄是同一個 grid `auto`
列的兩個項目 ⇒ 文件被撐成 4634px，而 <main> 被 maxHeight:100vh 釘成 800px 貼在文件最上面。
視窗右邊那條捲軸捲的是導覽列，一捲 <main> 就整個滑出螢幕上緣。⛔ 全 repo 沒有任何一行
overflow:hidden —— 兩個症狀是同一個根因。

修法：ui/shellLayout.ts 讓兩欄各自捲、文件本身不捲（外框 height:100vh +
gridTemplateRows: minmax(0,1fr)；⚠️ 只寫 height 不夠，auto 列照樣被撐開）；
resetContentScroll() 桌機捲 <main>、手機捲 document，兩個都重設。手機版刻意不套。

量到的 before/after（1280×800）：document.scrollHeight 4634 → 800；
模型預算頁（13,038px）從「一捲就離開畫面」變成捲到底最後一列 bottom=780 可見；
切頁 main.scrollTop 873 → 0。

驗證（19:35）：App.tsx:6/931/936 真的接上；守衛 apps/admin/src/shellScroll.test.ts 4 passed
（其中一條讀出貨渲染樹的 <main style>，⛔ 不是純函式自證）。
```

---

### ✅ #494 殭屍掉小金幣 → 貝茲吸回 + 連段音階 → **可關**

| owner 的字 | 出貨值 | 驗到 |
|---|---|---|
| 「停留 1 秒」 | `feel-fx.json` `goldPickup.hoverSeconds: 1` | ✅ |
| 「貝茲曲線**加速**」 | `flightSeconds 0.42` · `easePower 3` · `arcHeight 1.9`（⭐ 緩動與彎度**兩格**，因為 owner 分別點名） | ✅ |
| 「輕音效」 | `sfxVolume 0.32` · `sfxThrottleMs 55` | ✅ |
| 「candy crush 連段音階升高」 | `comboPitch` `semitonesPerStep 1` / `maxSteps 12`（＝一個八度封頂）/ `resetAfterSeconds 5` | ✅ |
| 「施法粒子存活時間砍半」 | `castMotes.lifetimeMinSec 0.175` / `lifetimeMaxSec 0.35`（原 0.35–0.7）+ `gravityY 3`（原 7.5）+ `drag 0.7`（原 0.86） | ✅ ⭐ 只砍壽命是錯的修法（粒子會在還往上衝時被剪掉） |
| ⛔ 一塊錢都沒被動到 | `feel-fx.json` note 逐字寫明；守衛拿 gold=20 / gold=999,999 兩個事件跑完整軌跡斷言**逐格相同** | ✅ |
| 守衛 `feelFx.test.ts` | **11 passed** | ✅ |

**關票留言草稿**
```
✅ 已落地並實測 —— commit 274945b0

五段全部出貨，三個住處齊全（content/config/feel-fx.json + Zod DEFAULT_FEEL_FX +
後台「🪙 爽度特效」16 格）：
① 掉落在**屍體**位置（mobSlain 沒有 x/z 且殭屍在事件到達時通常已離開快照 ⇒
   VfxSystem.syncGroundEntities 每幀記一次 lastBody，有界 512）
② hoverSeconds=1 原地自轉
③ flightSeconds=0.42 / easePower=3 / arcHeight=1.9 —— 二次貝茲 × t^easePower，
   終點抬到胸口；⭐ 緩動與彎度是兩格，因為 owner 分別點名了「貝茲曲線」與「加速」
④ sfxVolume=0.32、自己的 gateKey（⛔ 不跟 #191 陣亡投幣搶 gate 額度）
⑤ comboPitch 每段 +1 半音、12 段封頂（一個八度）、5 秒歸零；連擊數在**掉落那一刻定格**
   ⛔ 不是落袋時才讀（否則音階跟畫面上那一枚金幣對不起來）
＋ 施法粒子 castMotes 壽命 0.35–0.7 → 0.175–0.35（owner 的「砍半」），
   並同時 gravityY 7.5→3 / drag 0.86→0.7 讓上升在壽命結束前自己收斂。

⭐ 硬條件：⛔ 一塊錢都沒有被動到。這一版沒有動 packages/shared/src/sim/ 的任何一個位元組；
守衛不是註解 —— GoldPickupFx.spawn 收下 gold 而一行都不讀，測試拿 gold=20 與 999,999
兩個事件跑完整軌跡斷言逐格相同（哪天有人寫 count = gold/10 就會紅）。

驗證（19:36）：apps/client/src/vfx/feelFx.test.ts 11 passed。
rollback：goldPickup.enabled=false ⇒ 逐位元回到這一版之前。
```

---

### ✅ #495 Quick Approval 收攏常用批核 → **可關**（四項全到）

| owner 點名的 | 出貨在哪 | 驗到 |
|---|---|---|
| 清理變身態 | `QuickCleanupSection.tsx` 第②區三張卡之一（#486 搬進來，⛔ 不是重做一顆） | ✅ `QuickApprovalPage.tsx:677` 掛上 |
| 通過邀請碼審查 | 已收攏（帳號審核） | ✅（`quickApproval.ts` 盤點 9 項，收攏 2 指路 7） |
| 上下架**角色** | 加入區 `champion-open` + 移除區「下架未經名單審查的英雄」 | ✅ |
| 上下架**道具** | `quickApproval.ts:803` `out.push({ kind: "items", enable: [...plan.items], disable: [] })` ⭐ **在此之前 starter.go 的 items 半邊整個沒有被讀**（英雄開了商店還是空的） | ✅ |
| ⛔ 移除不准混進「只加不減」 | 開第②區兩段式：預覽 → 確認 → ↩ 一鍵還原；`disableChampionRequest()` 已刪除（只剩 `quickApproval.ts:812` 一行說明為什麼刪的註解） | ✅ |
| 守衛 `quickCleanup.test.ts` | **2 passed**（77 行 ≤ 80 體驗層上限） | ✅ |

**關票留言草稿**
```
✅ 已落地並實測 —— commit 375660ac

⭐ 那條刻意的護欄（「只會加入，永遠不會替你移除任何已啟用的內容」）是對的，
所以 ⛔ 沒有放寬它 —— 而是開第②區，兩段式。

① 加入（只加不減，一鍵）
   · 新增**上架道具** —— 在此之前 starter.go 的 items 半邊整個沒有被讀，英雄開了商店
     還是空的，而頁面上沒有任何一列說得出來。一列聚合（⛔ 不是 40 張卡）。
   · champion-open 的 why 原本寫死「現在已經有 49 名」，改成從 liveChampions 推導。
② 清理／移除（新）：預覽 → 確認 → 一鍵還原，一張卡片模板 × 3 個參數集
   （清理變身態 / 下架未經名單審查的英雄 / 下架未經名單審查的道具）。
   ⭐ 預覽就是 payload：cleanupWriteRequest() / undoRequest() 只吃 CleanupPreview，
   ⛔ 沒有第二條路生出 id ⇒ 螢幕上那張清單與請求裡那張清單不可能不一樣（失敗形態⑤）。
   ⭐ 變身態從「未審查英雄」那一批扣掉（同一個英雄掛兩顆按鈕，兩張預覽遲早會打架）。
③ 其他只有你能按的：盤點 9 項，已收攏 2（帳號審核 · 內容白名單），指路 7
   （邀請碼產生/撤銷 · 玩家停權/MCoin/MMR · 回到原廠/還原快照 · 內容覆蓋層 ·
     MCoin 發放 · 公告 · 資料搬遷）。理由一致：逐人／逐份的決定（沒有批次語意），
     或沒有還原點。
⛔ 拿掉了 D2 列上的「停用這名英雄」—— 它是一次沒有清單、沒有還原點的移除。

驗證（19:35）：QuickApprovalPage.tsx:677 真的掛上；quickApproval.ts:803 的 items 那一列
在 plan 裡；disableChampionRequest 已不存在（只剩說明註解）。
守衛 apps/admin/src/quickCleanup.test.ts 2 passed（headless React 驅動真的那張卡）。
```

---

### ✅ #496 後台「戰鬥回放」給的是 localhost → **可關**

| 驗什麼 | 結果 |
|---|---|
| 根因修掉 | `apps/admin/src/config.ts:183 resolveReplayClientBase(env, isProd, adminHref)` → `:184 resolveHubLinks(env, isProd ? "prod" : "dev")` ✅（舊版 `ReplaysPage.tsx:23` 呼叫 `resolveHubLinks(env)` 少第二個參數 ⇒ 永遠拿 dev preset 的 `http://localhost:39527`） |
| 呼叫端改對 | `ReplaysPage.tsx:22` import · `:48` `return resolveReplayClientBase(strings, isProd, href)` ✅ |
| fail-loud | 命中時在「觀看」按鈕上方畫一條紅色 `role="alert"`，說出兩邊主機名與會開啟的網址 ⛔ 不是 `console.warn` ✅ |
| 守衛 `config.test.ts` | **7 passed** | ✅ |

**關票留言草稿**
```
✅ 已落地並實測 —— commit cd348023

根因不是「hub link 沒設定」：ReplaysPage.tsx:23 呼叫 resolveHubLinks(env) **少了第二個
參數**，而它的預設是 "dev"，於是那一頁在正式站上也拿 DEV_DEFAULTS 的
http://localhost:39527。其餘三個呼叫端（ConsoleHub / AudioAuditionPage / App）
每一個都寫了 raw.PROD ? "prod" : "dev"，只有這一頁漏了。
⛔ 舊的 `?? "http://localhost:39527"` 是死碼（resolveHubLinks 永遠回傳 client 卡片），
它看起來像 fallback，所以它把真正的 bug 藏了起來。

fail-loud：resolveReplayClientBase() 判斷的是**兩個名詞的關係** ——「client 指向本機」
單獨看不是錯的（開發機上那才是對的），錯的是「後台自己不在本機、連結卻指向本機」。
命中就在「觀看」按鈕上方畫一條紅色 role="alert"。

驗證（19:35）：config.ts:184 已帶 mode 參數；守衛 apps/admin/src/config.test.ts 7 passed
（突變：把 isProd ? "prod":"dev" 改回不傳 → 紅，訊息正是 owner 看到的那個
「回放連結在正式站上指向本機」）。
```

---

### ✅ #497 兩張英雄名單只印 id → **可關**

| 驗什麼 | 結果 |
|---|---|
| 名字清單接上兩頁 | `RosterPage.tsx:13/89/196`（下架＋隱藏兩格）· `StoreEconomyPage.tsx:28/134/424`（免費名單） ✅ |
| 變身態標註是**推導**的 | `championLabels.ts` 走 `transform.role === "alternate"`，重用 #486 的 `isTransformedBodyRow()`，⛔ commit 裡一個英雄 id 都沒有 ✅ |
| `_legacy` 那 6 個 id 也答得出名字 | `loadLegacyChampionRows()` 按 id 直接取 `_legacy/champions/<id>.json`，標 `[已移入 _legacy · 不在出貨集合裡]`；取不到就顯示「內容樹裡沒有這個 doc」⛔ 不編名字 ✅ |
| 守衛 `championLabels.test.ts` | **6 passed**（77 行，⛔ 沒有一個字面 id / 數字） | ✅ |

**關票留言草稿**
```
✅ 已落地並實測 —— commit 98902435

⭐ 為什麼「只加名字」不夠：內容樹裡有 **15 組** base/alternate 的 name 逐字相同
（索隆 · 飛影 · 草泥馬 · 莉娜因巴斯 · 天地志狼 · 櫻綻剎那 · 勇者小呆 · 妖狐藏馬 ·
Saber · 龍宮禮奈 · 白木卡迪那 · 依文潔琳 · 臭作 · 魯夫 · 傑富力士）。在下架名單上印出
兩列一模一樣的「三刀流劍士 - 索隆」比只印 id **更危險** —— 操作者會以為看到重複列而
挑掉錯的那一張，而兩張卡的意義正好相反。⇒ 一列 = id + 名字 + 形態標註。

⛔ 判定是推導的（transform.role === "alternate"，重用 #486 的同一個謂詞），
這個 commit 裡一個英雄 id 都沒有。

⚠️ 順手量到：出貨下架名單 7 個 id 有 6 個在 content/champions/ 裡沒有 doc
（安云 / 藤井八雲 / 賈修貝爾 / 麻倉葉 / 十六夜Sakuya / 黑化張飛，住在 _legacy/）
⇒ 只讀 live 樹的話那一頁多數列答不出名字，正是你抱怨的東西。已加 loadLegacyChampionRows()
按 id 直接取，撈到的列標 [已移入 _legacy · 不在出貨集合裡]，取不到就明說「內容樹裡沒有
這個 doc」⛔ 不編一個名字出來。

🎛 決策點（第一守則）：本體那一列**也**標 [本體 → …]，預設 on。
rollback = CHAMPION_LABEL_DEFAULTS.baseHint 改成 false，一行。

驗證（19:35）：RosterPage.tsx:196 / StoreEconomyPage.tsx:424 都掛上；
守衛 apps/admin/src/championLabels.test.ts 6 passed。
```

---

### ✅ #498 錄影保留天數：出貨在刪，要預設不刪 → **可關**

| 驗什麼 | 結果 |
|---|---|
| `content/config/replay.json` | `retainMaxFiles: 0` · `retainMaxAgeDays: 0`（0 = 不限／不刪）✅ |
| ⭐ 為什麼兩格一起改 | note 逐字：「只改天數的話第 201 場照樣會刪掉第 1 場」✅ |
| 磁碟煞車 | `store.ts` 的 `replayStorage()` 掛在 `GET /_internal/replays`，後台頁首印 佔用 · 份數 · 生效中的保留規則 · **整顆碟的剩餘空間**，<10% 整行轉紅 ✅ |
| 守衛 `replayRetention.test.ts` | **5 passed**（讀出貨檔位元組、把假錄影 mtime 推到一年前、跑真的 `pruneReplays()`，⛔ 出貨數值不住在測試裡） | ✅ |

**關票留言草稿**
```
✅ 已落地並實測 —— commit cd348023

出貨原本在刪：retainMaxFiles 200 / retainMaxAgeDays 30。現在兩格都是 0
（0 = 不限／不刪，RETAIN_UNLIMITED + retainIsUnlimited()）。

⭐ 兩格一起改是刻意的：它們是**兩條獨立的刪除規則**。你說的是天數，但只把天數設成
不刪的話，第 201 場照樣會把第 1 場刪掉 —— 而你會看到「我明明設了不刪」卻還是不見了。

磁碟（這個預設值唯一的煞車）：後台「對戰錄影」頁首現在印 佔用 · 份數 · 生效中的保留規則 ·
**整顆碟的剩餘空間**，剩餘 <10% 整行轉紅。⚠️ 量整顆碟不是量目錄是刻意的 ——
正式機 docker data-root 和 data/replays 在同一顆碟（2026-08-16 那次 build cache 塞爆 → 502）。
只印「錄影佔 40MB」是一個只驗名詞的儀表，它在碟快滿的那一天仍然是綠的。

ROLLBACK：後台填回 200 / 30，重啟 game shard。

驗證（19:36）：content/config/replay.json 兩格都是 0；守衛
apps/game-server/src/replay/replayRetention.test.ts 5 passed
（突變：出貨檔 retainMaxAgeDays 改回 30 → 紅，兩份假錄影都被刪掉）。
```

---

### ✅ #469 隱藏英雄名單是空的 → **可關**（⚠️ 帶一句 owner 待補）

| 驗什麼 | 結果 |
|---|---|
| `content/config/roster.json` `hiddenChampions` | `["godie-ogld","godie-u00k","godie-udea","godie-zombiex"]` —— **4 位**，不再是 `[]` ✅ |
| 守衛 `hiddenChampionsShipped.test.ts` | **2 passed** —— ①名單非空 + 每 id 指得到出貨英雄 + 有模型 + 沒被下架 + 不是變身態 + 還在 starterChampions ②真實白名單種子下 `randomChampionPool()` 含每一位而 `selectChampion()` 拒絕每一位 | ✅ |
| ⏸ 第 5 位 | 黑化Saber **刻意留空**（owner 自己標「待補」；內容樹兩份 Saber 文件都叫「亞瑟王 - Saber」，`godie-e00l` 還是 `godie-e002` 的變身態 ⇒ 要填哪一個 id 只有他答得出來）。理由已寫進 `roster.json` 的 note | ⏸ |

**建議**：**關**。票的主張（「出貨名單是空的 ⇒ 彩蛋玩家永遠遇不到」）已經不成立；
第 5 位是一個獨立的 owner 待答，留言裡點名即可，⛔ 不要為它把整張票掛著。

**關票留言草稿**
```
✅ 已落地並實測 —— commit fcd51d7c

content/config/roster.json 的 hiddenChampions 從 [] 變成四位（owner 2026-08-20 逐字
「預設是死之王、飛鼠先生、喪標麥可、黑人牙膏、黑化Saber(待補)」）：
  godie-ogld    美白大法師 - 黑人牙膏   #72
  godie-u00k    邪惡意念集合體 - 死之王 #71
  godie-udea    至尊學長 - 飛鼠先生     #65
  godie-zombiex 聖杯黑泥醬 - 喪標麥可   #100

⏸ 黑化Saber 刻意留空：你自己標「待補」，而內容樹裡兩份 Saber 文件都叫「亞瑟王 - Saber」
（godie-e002 / godie-e00l），e00l 還是 e002 的變身態（isTransformedBody 永遠不可選）
⇒ 要填哪一個 id 只有你答得出來，⛔ 我不替你挑。理由已寫進 roster.json 的 note，
下一輪不會再把它當缺陷查一次。要補的時候後台「英雄上下架」那一頁一格就好。

⚠️ 一併記下：「隱藏」與「上架」不互斥而且互為前提 —— 隨機池是
MatchController.randomChampionPool() = 有模型 ∩ 白名單，所以一位隱藏英雄**必須留在
白名單上**才抽得到。四位在 starter.go 都在。

守衛（新）apps/game-server/src/curation/hiddenChampionsShipped.test.ts —— 既有的
hiddenChampions.test.ts 用合成 id 驗機制，它對一份**空的**出貨名單全綠（這就是 #469
為什麼沒有任何東西會紅）。新這一支驗**出貨的那一張**，兩個方向。
驗證（19:36）：2 passed。
```

---

### ✅ #447 傷害級距要拉高：AP 弱勢的量化 → **可關**

| 這一版做了什麼 | 證據 |
|---|---|
| **全域最後一乘** `技能傷害 ×(1 + AP × 0.005)` | `content/config/ap-damage-scaling.json`（tracked）· `packages/shared/src/sim/combat/apDamageScaling.test.ts` **3 passed** |
| 58 支技能 / 74 條「屬性額外傷害」→ AP 百分比 | `tools/ap-conversion/`（`apconv:build` / `apconv:check` 已在 `skills:sync` **與** `skills:check` 兩個聚合閘裡，見 `package.json:91-95`） |
| `intToAbilityPower` 定案 **4** | `373b3065`（沿革 1→4→6.5→10→**4**） |
| Codex 契約補上這一乘 | `3c4ce3a0` 新增 §一之二 `contract-ap-damage`（⛔ 在它之前契約一個字都沒提，外部編輯器算出來的傷害在出貨設定下差到 2 倍） |

⚠️ **⛔ 這張票的實作 commit（`785a585c`）沒有帶票號** —— 關票留言裡要把它點名，
否則 GitHub 上這張票看不到最重要的那一個 commit。

**關票留言草稿**
```
✅ 已落地並實測 —— commits 785a585c（⚠️ 該 commit 的 subject 誤用了 #ap-damage-scaling
這個非票號 slug）· ec5196d0 · 373b3065 · 3c4ce3a0

① 全域最後一乘（785a585c）
   技能傷害 ×(1 + 施法者法強 × rate)，位置在 combat/damage.ts 傷害佇列排空迴圈、
   緊貼 combatEnv.damageDealt（同一層：出手多重，減傷之前）。技能／技能投射物／
   技能 DoT／代放全部排進同一條佇列 ⇒ 一行就是全部。
   出貨 rate 0.005 / scope "ability" / apRatioMode "stack"。
   ⭐ stack 是量出來的：content/abilities 236 個技能傷害 Scaling 節點裡 137 個帶
   ratios:{stat:"ap"}，而那 137 個全部（100%）在拿掉係數之後就完全沒有屬性相依；
   係數分佈 0.1〜7.0（中位 0.6）⇒ "replace" 會把 ×7.0 的大招與 ×0.1 的小招壓成同一支。
   ⛔ 反彈不吃（共用既有的 skipGlobalDamageMult，⛔ 沒有開第二個旗標）。

② 58 支技能 / 74 條「屬性額外傷害」→ AP 百分比（ec5196d0）
   AP% = max(10, halfUp(屬性乘數 × 25 / 10) × 10)。卡面「力量*3」→「80% [AP]」，
   JSON ratios 同步換成 {stat:"ap"}。⚠️ 只有第 1 條（base）進係數，16 條互斥的條件加成
   ⛔ 沒有加總（加起來會讓 07-03「列、在、前」從 50% 變 430%）。
   ⭐ 產生器會吃掉自己的輸入，所以有凍結表 tools/ap-conversion/claims.json，
   每次 build 先倒回換算前再重算 ⇒ build 冪等、--check 真的在比對、
   enabled:false 就是一個指令回到 2026-08-21 之前。

③ intToAbilityPower 定案 4（373b3065）—— 你當天講了兩次，17:19 那則推翻 16:51 那則。
   ⭐ 反過來的原因就是①：AP 從加法項變成乘法項。

④ Codex 契約補上這一乘（3c4ce3a0 §一之二 contract-ap-damage）
   ⛔ 在它之前這份對外契約一個字都沒提 —— 一個只讀 §一 amount/scaling 的外部編輯器
   算出來的傷害在出貨設定下差到 2 倍（法強 200 ⇒ ×2），而 JSON 完全合法、
   載入不報錯、卡片照樣印那個數字（失敗形態②）。

三個住處 + script 齊全；apdmg:build / apdmg:check 已接進 skills:sync / skills:check。
守衛：packages/shared/src/sim/combat/apDamageScaling.test.ts 3 passed（19:36）。
rollback：rate=0 ⇒ 逐位元等於今天（那是 3,372 條測試量到的，不是我打的字）。
```

---

## 3. ⏸ 落地但建議**先不關**（各帶理由）

| 票 | 為什麼不關 |
|---|---|
| **#414** 施法距離／傷害／耗魔沒有級距表 | 四軸的**表**其實在 v0.23.0 **之前**就補齊了（`range-tiers.json`←`bc695daa` · `damage-tiers.json`+`cooldown-tiers.json`←`e60778c9` · `mana-tiers.json`←`7bd78fa3`），這一版只補契約文件（`3c4ce3a0`）。⇒ 它其實**早就可以關**，但它同時是 #438／#460／#445／#446 的傘票，關掉會讓那一族失去共同的入口。**建議：貼一則「四軸表已全部出貨」的進度留言，關不關由 owner 一句話。** |
| **#484** 逐則對票自動化 | 實作在 v0.23.0 **之前**（`1956db25`），這一版只有兩次硬化（`373b3065` 閘補洞、`1438c1d7` 裸票號正規化）。⚠️ **現在 `pnpm msgledger:check` 是 EXIT=1**（19:28 / 19:31 / 19:34 三則 owner 訊息還沒對票）—— 那是閘**正在正常運作**，不是缺陷，但**在它綠之前關這張票會很難看**。**建議：主 session 把帳本補綠之後再關。** |
| **#446** 魔力：耗魔正規化 + 回魔平衡 | 耗魔那一半 ✅（`mana-tiers.json` 極小 72 / 小 144 / 中 288 / 大 576 / 極大 1152，本輪 `095e27fe` 才修好它「與自己的推導矛盾」的 bug）。**回魔那一半（滿魔 47.7 秒 → ≤15 秒）本輪沒有驗**。⇒ 半張，不關。 |

⭐ **#445（冷卻五級距）順手驗到，可以關** —— 出貨 `cooldown-tiers.json` 逐位元等於
owner 給的數字：`單體 6/15/30/45/60` · `範圍 30/45/60/90/120`（`變身` 跟隨範圍）。
⚠️ 但它的實作 commit 在 v0.23.0 之前（`e60778c9`），不屬於這一輪，
**列在這裡供主 session 順手處理**。

---

## 4. ⏳ 開了票、**沒有任何 commit**，但**正在飛**

### #499 所有帳號預設與管理員成為好友

⚠️ **這一節我第一次寫錯了，已更正** —— 19:36 我 grep 的是
`autoFriendAdmin|adminAccountId|autoFriend`（票的 body 裡建議的欄位名），**零命中**，
於是我下了「這一版完全沒做」的結論。**那個結論是錯的**：實作用的識別字是 `autoAdmin`，
而它此刻正躺在**另一條 lane 的工作樹裡**（19:42 實測，未 commit）：

| 位置 | 內容 |
|---|---|
| `apps/platform/internal/friend/friend.go:51` | `// autoAdmin is 管理員預設好友 (GH#499). nil = not wired…` |
| `apps/platform/internal/friend/friend.go:149` | `// (GH#499). owner 2026-08-21:「**管理員是強制雙向 不必請求**」` |
| `apps/platform/internal/account/account.go:238` | `// ---- WHY IT RETURNS NOTHING (GH#499) ----` |
| `apps/platform/internal/server/server.go:222` | `// 管理員預設好友 (GH#499…「每個人創號自動預設有管理員好友」)` |
| `apps/platform/internal/server/server.go:775` | `// 管理員預設好友 的回填 (GH#499)` ⭐ 回填那一半也在做 |

⭐ **教訓（值得寫進守則）**：用**票的 body 裡建議的欄位名**去 grep，量到的是
「有沒有人照我的建議命名」，⛔ **不是**「這件事有沒有被做」。正確的查法是
`grep -rn "#499"` —— 票號是**唯一**跨 lane 不會被改寫的 join key。

⛔ **不要關**（它一個 commit 都還沒有）。它的 body 裡已經有 owner 2026-08-21 的**完整裁決**
（`ruling.sh` 前置到 body 最上面）：

> ①「做成後台一格 adminAccountId => **yes, 如果只有一個就預設那一個**」
> ②「**管理員是強制雙向 不必請求 每個人創號自動預設有管理員好友**」

⇒ 三件事已經沒有任何未知數（而那條 lane 看起來三件都在做）：
1. `account.Repo.Create` **之後**建立雙向好友（⛔ 不走 `friend.Service.Request()` —— 那是送請求等對方接受）
2. `adminAccountId` 做成後台一格，⭐ **只有一個 `RoleAdmin` 帳號時預設就是那一個**（⛔ 不是留空要 owner 填）
3. 既有 **198 個帳號**回填 —— 掛 **Quick Approval 的「加入」區**（#495 這一版已經把那一區做好了）

**建議**：等那條 lane 的 commit 落地後再驗一次（三件事逐件），驗過才關。

---

## 5. ⚠️ 三個「票務衛生」缺陷（不是程式缺陷，但下一版會再犯）

| # | 現象 | 建議的閘（⛔ 不是「要記得」） |
|---|---|---|
| 1 | `ec5196d0` 把 **2026-07 的舊 task 編號** `#244` `#248` 寫成 GitHub 認得的 `#NNN` ⇒ cross-link 到兩張不相干的開著的票 | commit-msg hook：`#\d{2,4}` 逐個丟 `gh issue view` 比對標題關鍵字，對不上就擋（或要求寫成 `task#248`） |
| 2 | `#ap-damage-scaling` / `#speed-growth` 這種**假票號 slug** 通過了所有閘 | 同一支 hook：`(#...)` 括號裡不是純數字就擋 |
| 3 | 6 個 commit 修好了某張票卻**沒帶號**（`f0779b70`→#486 · `5ea04900`→#487 · `00935377`→#488 · `373b3065`/`1438c1d7`→#484 · `50cf594a`→#492，⚠️ 最後這個還夾帶了 `waitSeconds 10→5` 這個**出貨值改動**藏在 `docs:` 前綴底下） | `msgledger` 已經在對「owner 的話 ↔ 票」；缺的是對「**commit ↔ 票**」的同一張表。同一支 hook 的第三條：`feat`/`fix` 前綴的 commit 必須至少帶一個真票號 |

⭐ 三條是**同一支 hook**，實作成本 < 40 行，而它擋的正是這一版量到的 11 次違規。

### ⛔ 第 4 次 lane 互掃 —— **就發生在寫這份報告的時候（我自己）**

19:41 我要 commit 這份報告，做了 `git add <我的檔>` 然後 `git commit -m …`
—— ⛔ **`git add` 有 pathspec，`git commit` 沒有**。於是索引裡另一條 lane
**已經 staged 的 15 個檔**（rally opt-out 那一批）被一起送進 `a8479a45`。

我用 `git reset --soft HEAD~1` 還原（⛔ 不是 `--hard`、⛔ 不是 `checkout`：
soft 只退 HEAD，索引與工作樹一個位元組都沒動，那條 lane 的 staging 原樣還在），
而在我重打指令之前，**那條 lane 自己 commit 了 `3c83170f`** ——
於是這份報告反過來被掃進**他們的** commit 裡。內容安全、路徑正確，只是掛在錯的 commit 上。
⛔ **沒有再去改寫歷史**（改寫另一條 lane 的 commit 比錯掛更糟）。

⭐ **今天的規矩要再收緊一格**：`git add <path>` **不夠** ——
`git commit` 自己也必須帶 pathspec：

```bash
git commit -m "…" -- <逐檔列名>      # ✅ 繞過索引,只送這幾個檔
git add <path> && git commit -m "…"  # ⛔ 索引裡別人的 staged 檔會一起走
```

這是**判準換成閘**的又一個位置：pre-commit hook 可以在「索引裡有本 lane 路徑柵欄
以外的檔」時直接擋。

---

## 6. 離開碼

| 指令 | EXIT |
|---|---:|
| `npx vitest run --root apps/admin`（quickCleanup · championLabels · shellScroll · config） | **0**（4 檔 19 條） |
| `npx vitest run --root apps/client`（feelFx · lobbyRally · roomNoChampionIdMenu） | **0**（3 檔 17 條） |
| `npx vitest run --root apps/game-server`（replayRetention · hiddenChampionsShipped） | **0**（2 檔 7 條） |
| `npx vitest run --root packages/shared`（apDamageScaling · wallBlockDisplacement · speedGrowthTiers · devourPassiveIcd） | **0**（4 檔 10 條） |
| `pnpm msgledger:check` | **1** ⚠️（19:28 / 19:31 / 19:34 三則未對票 —— 主 session 的帳本工作，⛔ 不是缺陷） |

⛔ 本輪**沒有**跑 `pnpm skills:sync`（主 session 統一跑）、⛔ 沒有跑 `content:build`、
⛔ 沒有 ssh / curl 到 ggd.adms.ai、⛔ 沒有 gh 寫入、⛔ 沒有改任何出貨檔。
