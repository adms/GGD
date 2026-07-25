# 歷史 · GGD 執行批次計畫存檔 · 截至 2026-07-25 — 已完成、無相依，從主作戰表移出

> 這份檔案是從 `docs/_execution-batches.md` 移出的「已完整做完、無相依/無待辦動作」內容，
> 逐字保留原始的日期分段結構，供追溯用。主作戰表 `docs/_execution-batches.md` 只保留仍在進行的任務分配。
> 移出時間戳：2026-07-25。

---

### 本場已落地並**已部署** ggd.adms.ai（v0.4.8，build `25659898`）

| 車道 | 成果 | 上線驗證 |
|---|---|---|
| 魔力大改 | 真因是**魔力池太小**（一套連招 ~1130 vs 池 304）不是回魔慢：`maxMana ×3`＋`manaRegen ×10`（combat-env 系統倍率，運行時套用，不動英雄底數） | 公網 bundle 實測 `maxMana:3 manaRegen:10` |
| 回合節奏 | `combatMaxSec 240→120`（2 分鐘）、`fireRing.startSec 180→60`（戰鬥開始 60s 點火，以經過時間計） | 公網 bundle `combatMaxSec:120 startSec:60` |
| Skeleton 場地 | 移除中央 6 根柱子（容易卡到場景物件），改開闊場 | 已隨 bundle 上線 |
| #201 解鎖閘 | 未解鎖英雄不再可被手動/隨機/**偽造請求**選到；bots fail-open 保住 #130 | 選角三面已補 |
| #200 一鍵開打 | 第一下退回大廳修好：先 `await` 內容再要座位；戰鬥音效延到入座成功才播 | — |
| 雲端生圖 | 從 UI 徹底拔線（後端保留但不可觸及），圖示走本機 SD | — |
| #128 castability | 從「只會過」改成真的會擋的 ratchet；對齊兩份帳本 | shared 全綠 |

> 部署機制已釐清並寫進記憶：主機**無 make**，用 `docker compose -f compose.yaml -f compose.family.yaml --env-file docker/.env build && up -d`；`VITE_GGD_FULL_ASSETS` 是 compose.family 的 build arg（自動帶）；`GGD_BUILD_STAMP="$(git rev-parse --short HEAD) $(date -u +%F)"`；data/ 備份要用 root 容器（檔案 uid 1000，ssh user 讀不到）。本次備份 `data-20260724-193709.tgz`（60MB，12 帳號/91 對戰/12 天梯全在）。

---

## 📋 作戰表 · 2026-07-24 重整

### 本場已落地（不得重排）

| 車道 | 成果 |
|---|---|
| w3x 特效考古 | 推翻三個前提：art 只在二進位 `war3map.w3a`（464 支帶美術）；原生 `AddSpecialEffect*` **0 次**（全走 BJ 包裝）；**真實綁定 0/662**（不是我先前說的 88%）|
| 上線部署鏈 | #48 挖到更深的第二個 bug（helm/compose 都沒設 `GGD_PLATFORM_URL`，容器裡解析成 localhost＝**對自己講話**）；#126 審核閘＋`409 last_admin`；封禁即時生效 |
| 天生技 sim 機制 | evasion（**只閃普攻**，附 WC3 `Aevd` 與 cast-telegraph §4.5(a) 兩條理由）＋ aura 無狀態調和 ＋ 第 6 可施放槽。零數值漂移，405/312 測試綠 |
| icon 補洞 | abilities 529→**646**、天生技 **108/108**、items **214/214**；撞圖群 **8→2**；augments 21/21 全異 |
| 玩家體驗 | **P1 真因**：`MatchState` 建構子預設 `phase=champSelect, ticksLeft=0`，`onCreate` 從不覆寫 → UI 收到的第一筆是「真 matchId＋0 秒」→ 鎖被 latch。每場都中。改成三態 `LockStatus`，「locked 但沒角色」在型別上不可能 |
| Redis 即時失效 | 發佈點在 `Repo.mirror()` 單一咽喉；訊息只帶指標不帶文件；刷新**合併不排隊**；`/healthz` 有 `announced` vs `applied` |
| Redis 房間狀態 | **評估後拒絕**：只有一個 `GAME_SERVER_ADDR`、helm 釘 `replicas:1`、平台早就有 `match:*` ＋ reaper。做了買不到東西 |
| 語音後台 | 糾正規格：**41 類非 42**、**2,208 clip 非 2,016**；參考音 `licence` 必填否則 422 |
| 三個小修 | 三選一 icon 按 id 推路徑 ✅ ／ `BRIEFING_NEAR_START_SEC` 55→30（**#167 之後簡報死了**）✅ ／ evasion 補進 `STAT_META`＋`missingStatMetaRows()` 守衛 ✅ |

### 舊條目（已解決，保留脈絡）

### ~~A. 三選一卡片的 icon~~ ✅ 已修
**症狀**：實機試玩時 SILVER AUGMENT 三張卡是字母格「鐵」「疾」「B」。
**已排除的錯誤解法**：不要去補 `augment` doc 的 `icon` 欄位。`augment@1` schema 是 zod **`.strict()` 且沒有 `icon` 欄位**
（`packages/shared/src/content/schema/augment.ts:20,22`），硬寫會驗證失敗；`tools/icon-gen/local/batch.py::set_icon_field`
對 augments **刻意 return False**，那個守衛是對的，不要拆。
**現況**：21 個 `.webp` **已全部生成在** `content/assets/icons/augments/<id>.webp`，而且 icon 補洞那批已把撞圖從
「8 張共用同一個青色符文」修成 **21/21 全部不同**。
**架構本來就對**：`AugmentDraftPanel` 用 `GlyphTile`，註解明寫「真圖一落地就自動讓位」（它把 `<IconImg>` 疊在字形上）。
**唯一缺口**：`resolveChoice` 沒有 icon 可回傳。
**正解**：讓 `resolveChoice`（或卡片層）**按慣例推導路徑** `assets/icons/augments/<id>.webp` —— 檔名完全由 id 決定，
21/21 都在。不動 schema、不寫 content doc、缺檔時 `GlyphTile` 本來就會優雅退回字形。
**擋在誰後面**：`apps/client/src/ui/panels` 目前歸「玩家體驗修復」車道。

### B. evasion 的兩個半套
1. ~~`statDisplay.ts` 的 `STAT_META` 缺 `evasion`~~ ✅ **已修**（並補了 `missingStatMetaRows()` 執行期守衛，
   因為 `as Record<Stat,StatMeta>` 轉型讓 TypeScript 抓不到這類遺漏）。
   ⚠️ 仍待辦：`shopGrouping.ts` 的 `STAT_SHELF` 要加 `evasion: "defense"`，否則迴避道具會掉進 `misc`。
2. ⛔ **仍待辦**：`apps/game-server/src/net/eventFanout.ts` 的 `FANNED_OUT_EVENT_TYPES` 是硬白名單，**沒有 `evade`** →
   sim 有發事件但**傳不到 client、也不進回放**，**閃避在畫面上完全看不見**。加進去後接 #92 的浮動字「MISS」。

---
# 附錄 · 已驗證完成（帶證據，**不得重排**）

> 這一節與死碼區同等重要。**重排已完成的工作是這裡第二貴的錯誤。**
> 每一條都附「怎麼驗的」，下一個讀者不必再驗一次。

| # | 證據（實跑 > 讀碼）|
|---|---|
| **#100 戰鬥收尾** | **實跑驗證**：真的 12-bot `MatchController` 跑到 `combatActive` 翻 false（1419 tick = 47.3 s，phase → resolution），快照全員 HP，再跑 **90 個模擬秒（2700 tick）**：**0 個事件、12 人中 5 人 HP 上升（回復）、0 人下降**。⚠ **並且它不是 #85 的阻擋者 —— 三張活頁都寫錯了** |
| **#89 sim 半** | `arena-rules.json` 出貨完整 guardianTower（hpBase 1450 / volleyDamageBase 108），`MatchController.ts:725-731` 每回合武裝，`roundPacing.test.ts:120-143` 證明每個活躍對決區生一座。**sim 是對的，缺的 100% 是 client** |
| **#98** | 11 個 key 逐一探測：`grep -rl 'godie-blackhole\|godie-boomnl' content/abilities content/champions` = **0**，唯一引用在 `_index.json`／`bundle.json`／預算報告。**空 glb 是孤兒，不是壞掉的綁定**（資產債仍在，排 2A-4）|
| **#123** | 註冊表探測：**94 個 `fx.prim.*` key 可達**（原本 25），覆蓋 240 個技能；`elements.ts:36` 覆蓋所有用到的元素、`primitives.ts:318-325` 匯出全部 8 種形狀。**只剩產生器漂移守門**（2C-1）|
| **#79 名冊半** | 用 repo 自己的 loader 讀**註冊表**：`bindings.ts:54` ROSTER 的 48 個英雄 **0/192 QWER 槽是火**（原本 175）。驗收案例 `godie-n003` 依文潔琳 Q→`fx.prim.ice.shockwave` / W→`fx.prim.blood.nova` / E→`fx.prim.ice.nova` / R→`fx.prim.ice.explosion-lg`。⚠ **依賴未 commit 的 `registry.ts`** |
| **#131** | `VfxSystem.ts` 有 12 個 `isFinitePos` 守衛覆蓋每條生成路徑；`topRightBurst.test.ts` 3 測全過 |
| **#142** | `quotes.json` 113 筆（real 82 / original 31），gender 男 72 / 女 28 / 中性 13，voice map 女+中性 Kyoko、男 Otoya（已安裝）；113 支 mp3 齊全、**0 筆缺檔**。三個播放點都活：`nameVoice.ts:58`、`settlementModel` → `MatchEndPanel`、`RoundEndVoice.tsx:33` ← `HudRoot.tsx:134` |
| **#173** | 端到端無斷鏈：server 寫（`snapshot.ts:51`）→ client 解碼（`RoomStore.ts:116,341`）→ **生產消費**（`settlementModel.ts:411-414` 的 `won`/`fought`）→ `RoundEndVoice.tsx:33` / `GameApp.ts:1420`。（我自己在 sweep 中途一度誤判它是死碼，是 grep 被截斷所致，已更正）|
| **#143 / #85 / #93** | #143 `RoundWinnerStage` 建於 `GameApp.ts:436`、`:1426` 帶 MVP model doc 顯示、`:1432` 清除。#93 `VictoryFireworks` 建於 `:428`、`MatchEndPanel.tsx:385,430` 消費。#85 `DeathFocusFx` 建於 `:415`、`:957` 逐幀餵、`:812` 死亡邊緣。<br>❌ **本行前一稿寫的「全檔已無 `?? 0`」是錯的，已撤回。** `:1298`/`:1300` 確實是 `?? -1`，**但整支檔還有兩處**：`:1033` 與 `:1613`。無席位 entity 仍被畫成 0 號隊 → **排 1B-5**。這一條正好示範了本檔開頭那段方法論：**抽樣兩行不是「全檔已無」的證據。** |
| **#145** | `MatchController.ts:582` `selectRoundArena` → `pickRoundArena(arenaPool, matchSeed, round)`，`enterCombat:616` 在放置前呼叫，`snapshot.ts:32` 廣播 |
| **#147（五件）** | `VfxSystem.ts` 全在：ShadowLayer(:51,:391)、HitSpark(:57,:358)、BloodFx(:61,:388)、GroundDecalPool(:63,:372)、走路揚塵。（⚠ 「陰影」畫質選項是假的 → 排 3B）|
| **#148 / #110 / #146 版面** | `merchantTips.ts` → `MerchantTipBox.tsx:38` → `IntermissionStage.tsx:94`；`AugmentDraftPanel` 掛於 `HudRoot.tsx:169` + `draftCardStyle.ts` 分層光暈；`IntermissionScene` 掛於 `IntermissionStage.tsx:48` |
| **#94 卡片靠左半** | `layout.ts:123` `SHOP_CARD_SIDE = "left"` + `mirrorPoint()` + `CHAMPION_STAND`(:227) + `SHOP_CARD_WIDTH_FRACTION 0.45`(:371) **已出貨**。只剩「可用貨架」，且任何貨架移動**必須在同一次編輯裡重新滿足** `layout.test.ts` 與 `sightline.test.ts`（後者編碼了 #103 實測的 `multiPickWithRay` 遮擋） |
| **#107 主體** | `chromeReserve.ts` 發布音訊叢集框（`AudioToggle.tsx:492`）；`chromeReserve.test.ts` 21/21、`hudLayout.test.ts` 39/39 全綠。（殘留 → 1C-5 / 5B）|
| **#121 迴圈** | `MerchantShop.tsx:378` 「↩ 復原上一步」→ `sendUndoLastStep()` → `CommandSystem.ts:72-83` 用與買賣相同的存取規則把關 → `undoShopAction()`。（權威欄位沒讀 → 1C-2）|
| **#128 技能半** | `docs/_castability-128.md` 288 格 = 48 × 6。⚠ **重跑後是 279 PASS / 2 FAIL，不是出貨文件寫的 281/0**，且原因是量尺（→ 2B-4）不是遊戲 |
| **#63 SFX 半** | `AudioSystem.ts:257-266` boot 抓 0 支、`:403-405` warm `SFX_CORE` + 當前場景、`:467-471` 換場景再 warm |
| **#118 / #162** | `apps/platform/internal/wallet/{wallet,meta,handlers}.go` + client `walletMeta.ts` / `ChampMetaControls.tsx` 兩側都在硬碟上。**只欠一次目視，不要重建** |
| **#126 server 半** | `auth/service.go:51-55` `requireApproval`、`:210-213` pending 戳記、`:216-223` `claimOwnership`，加上 `private_deploy_test.go` / `account/status_test.go` / `admin.go` force-approve。**缺的只有後台核准佇列 UI** |
| **#136 / #133 機制半 / 方向性運鏡 kick + EX punch-in / `content:validate`** | 已由 `13afaf9` / `0c47fce` 修掉而未回寫活頁。`content:validate` 實跑：`content OK: 1441 docs` |
| **結算三件事（`4663e57` / `b287a13` / `c153304`）** | `lobby.mp3` 可達（`LeaderboardPanel` 不再無條件請求 menuNocturne）；寧靜女聲接在 match-win sting 之後（`useBedEnded(MATCH_WIN_STING)` + `matchEndBedScene`）；`AUTO_ADVANCE_SEC` **18 → 12 且改由 sting 結束起算** —— **前一版計畫警告的「in-flight agent 與 planned task 搶同一個常數」已解除** |

## 附錄 B · 進出清單盤點（這一次改寫加了什麼、退回了什麼）

**盤點來源**：兩份實地查核報告合計 **100 個 outstanding 項目**（第一份 22 項 · 第二份 91 項，重疊 13 項）。

| | 數 | 內容 |
|---|---|---|
| **前一稿已排進批次** | **89 / 100** | 略 |
| **前一稿漏掉、本次補進來** | **11 / 100** | ① `teamId ?? 0`（→ 1B-5）② #135 BGM rap/VO 層（→ B-4）③ 火環 intro 改寫（→ B-2，**無帳本編號**）④ 控室整首重寫（→ B-3，**無帳本編號**）⑤ #137 試聽頁對帳（→ B-5）⑥ #127 對外分級殘留（→ 7A）⑦ `mdl-150d` 文件矛盾（→ 1A-3 順手判定）⑧ #94 功能性貨架（→ 5D，新 lane）⑨ `spriteSheet` 內容（→ 2A-2）⑩ 回合第一名是否升成 server 權威（→ 8-4 決策）⑪ #75 被誤放進簽收清單（→ B-1，改成實作工作）|
| **本次從計畫退回（做過或誤判）** | **2** | ① `frameDataAudition.ts` 不是死碼：`public/frame-data.html:117` 的動態 import 就是呼叫者，且兩支檔都是飛行中 agent 的 untracked 產出 → 1D-2 從 M 降成 S 目視 ② #124 已被 city-pop 重寫取代並完成，帳本沒回寫而已 → 交給 1D-1 |
| **本次修掉的結構錯誤** | **6** | ① Lane 1A 的血條有一半在 Lane 1B 的檔案裡（`GameApp.ts:1602-1640`）② 1C-6 需要 `RoomStore.ts`，前一稿沒有任何 lane 擁有它 ③ 「批次 1/4/5/7 彼此不共用檔案」是假的（五處衝突）④ Lane 1D 的兩條路徑不存在 ⑤ 2B-2 與 1C-2 共用 `MerchantShop.tsx` 卻被排成平行 ⑥ 批次 8 混了一整波編輯器建置 → 拆成批次 9 |

**淨結果：100 個 outstanding 項目全部有歸屬，0 個落地。** 批次數 8 → 9，支線 1 → 2。

---

# 🎮 2026-07-24 實機試玩紀錄（Play offline vs bots，親自跑一局，非讀計畫）

跑法：登入頁 →「Play offline vs bots」→ 選角 → 備戰/商店 → 戰鬥 Round 1。以下每一條都是**畫面上看到的**，不是推測。

## ✅ 簽收：本批的東西確實在畫面上發生了

| 項目 | 證據 |
|---|---|
| 516 技能 icon | 技能列四格都是**各自不同的真實圖**（紫閃電／青骷髏／青法陣／暗漩渦），不再是字母格 |
| **被動第 6 格上線** | 技能列最右出現 `Lv1 天生 · 暗夜契約 · 被動 · 無需施放`，虛線框（#166 的視覺語言）——**你堅持的第六格真的在遊戲裡了** |
| 商人頭像＋輪播提示 | 中場左上是真的商人頭像，提示框顯示「先買『武聖手鐲』，便宜又補爆擊。」 |
| 商店真實道具圖 | 霸王槍／斬龍刀／炎神弩／光魔杖／寂靜刃-詠月 都有圖與數值 |
| 三選一 augment | SILVER AUGMENT 卡片正常觸發 |
| 效能 | 戰鬥中穩定 **101–105 fps** |

## 🔴 新發現的問題（依「家人會不會當場卡住」排序）

| # | 問題 | 觀察到的細節 | 建議歸屬 |
|---|---|---|---|
| P1 | **選角被自動鎖定，但玩家沒選任何英雄** | 進選角後立刻顯示`🔒 已鎖定 LOCKED`＋「已鎖定，無法再更換英雄」，但左側仍是「點選英雄查看詳情與 3D 模型」，座位是 `Player 0: … 🔒`（名字是空的）。雖然最後有分到英雄，但**玩家全程不知道自己玩誰**。這是 #130 的變形：不是沒鎖，是「鎖了個空的」 | 批次 5（選角）· T0 |
| P2 | **中場三個面板同時搶畫面** | SILVER AUGMENT 三選一卡片**直接蓋住**商人提示框；同時還有商店清單、備戰倒數 `0:13`、`Ready up`。四件事同時要注意力 | #107 safe-area · 批次 5 |
| P3 | **augment 卡片中英混雜** | 「鐵壁護甲」「疾風連擊」是中文，第三張卻是 `Bloodlust / +15% Attack Damage and +8% Lifesteal.` 全英文 | #149／#108 · 批次 2 |
| P4 | **敵人完全不在畫面內** | 敵方面板有 Bot 3/4/5，但視野裡一個敵人都沒有，只有自己；小地圖顯示敵人擠在右側。開場要走很久才遇得到人，**前 30 秒非常空虛** | 批次 8（節奏）／#145 |
| P5 | **競技場地面像未完成灰盒** | Skeleton 預設場＝一整片沙棕色平地＋幾塊純白多邊形石頭，沒有紋理層次或地貌 | #80 複驗 · 批次 6 |
| P6 | **角色模型過暗** | 幾乎是純黑剪影，配淺色地面對比度低，看不清在做什麼動作 | #147／模型 · 批次 6 |
| P7 | **按 Q 沒有可辨識的技能特效** | 實按 Q，畫面除了武器殘影**沒有出現明顯技能 VFX**，也沒有「不能施放／冷卻中」的任何回饋 | #147 · 批次 3 |
| P8 | **版本徽章停在 `7d1bb37`** | HEAD 已是 `5950d1e`，build stamp 沒更新 → #66「截圖可追溯」的意義失效 | 批次 4 |
| P9 | **`cheats` 按鈕出現在正式畫面** | 右上角常駐，家庭版應隱藏或收進選單 | 批次 7 |
| P10 | **登入頁英雄跑馬燈初期一排空黑格** | 頭像延遲載入，前幾秒是一整排黑方塊，第一印象差 | 批次 5 |
| ~~P11~~ | ~~client 載入的是舊 content bundle~~ **← 我自己判斷錯，撤回** | 當下 console 顯示 `cv_540d4fa9e29c`，我拿它跟音訊那一版 `cv_1c68c834dac0` 比而誤判為過期。實際上 `cv_1c68c834dac0` 是**只含音訊**的中間版（1490 docs），加入 108 份被動 doc 後重建即為 `cv_540d4fa9e29c`（1598 docs）——client 載的是**最新的**。反證：技能列真的顯示了 `暗夜契約` 被動，沒有新 bundle 不可能畫得出來 | — |

**最該先修的三個**：P1（家人第一步就困惑）、P2（資訊過載）、P7（技能沒特效＝你原本最痛的那點還沒完全解決）。

---

## ⚠️ 自我訂正：被動第 6 格「看得到」，但大部分「還沒生效」

批次 1 收工後我實際數了 `content/abilities/*.passive.json`，結果和我 commit 訊息裡寫的「sim 套用」**不相符**，在這裡誠實更正：

| 分類 | 數量 | 現況 |
|---|---:|---|
| 天生技 doc 總數 | **108** | ✅ 全數寫入，slot 在遊戲中**真的顯示得出來**（實機確認 `暗夜契約`） |
| `innateKind: active`（主動天生技） | 60 | ⛔ **還不能施放**——有 doc、有名字，但沒有接成可按的技能 |
| `innateKind: passive` 且**真的有效果** | **19** | ✅ 真的在跑（爆擊率／生命回復／`onBasicAttack`／`onDamageTaken` hook） |
| `innateKind: passive` 但 **modifiers 全空 → 完全無作用** | **29** | ⛔ 有 doc、有描述、UI 畫得出來，**但對戰鬥零影響** |

**根因**：`sim` 裡**沒有 evasion／迴避這個 stat**（grep 全樹只有註解與守衛塔的「dodge circle」，沒有實際屬性）。而這 29 個裡最大宗就是迴避類：`12-00 感應意脈`（+20% 迴避）、`74-00 JENOVA`（15% 迴避）、`92-00 憂鬱的眼神`（18% 迴避），以及靈壓、寫輪眼這類光環／感知效果。它們被忠實地記錄下來，但**落不了地**。

**所以現在的真實比例是 19/108 有戰鬥效果（約 18%）**，不是「108 個都套用了」。這正是這個專案一直在犯的那個錯——**綠燈、有 UI、但實戰不會發生**——只是這次我在推出後自己抓到並記錄，而不是等你玩到才發現。

**後續（建議排進批次 2 或 3，序列）**：
1. 先在 sim 加入 `evasion` 屬性（含命中判定接線）→ 一口氣解鎖最大一群迴避型天生技。
2. 光環型（靈壓 79-00 之類）需要 aura 半徑 + 敵我判定的套用機制。
3. 60 個主動天生技需要一個「等級 1 就有的第 6 個可施放槽」，含冷卻 UI 與按鍵（目前 `AbilitySlot` 刻意沒有納入 `PASSIVE`，Command 只收 5 個可施放槽）。

---
# 執行批次計畫 — 2026-07-24 晚間重整

## 今日戰果：9 條工作流落地，35 個 agent

| 工作流 | 交付 |
|---|---|
| 假完成盤點（6 agent） | **27 條 confirmed-broken**，其中 17 條完全靜默；產出 `docs/_false-completions.md` 的 S1–S11 形狀分類 ＋ 每形狀一行偵測配方 |
| 經濟可及性（3） | **推翻我的結論**：驅動真 sim 跑 30 場證明逆風方 R3 就買得起寶玉；同時挖出 `startingTeamLives` 是死設定 |
| 死設定掃描（2） | 修好死旋鈕；挖出**平台 30 分鐘回收器會解散進行中的比賽**；證明寫死的 3 讓 20 層屬性路線**從未有人走得完** |
| Babylon 發射器（3） | 條件四達成；**試聽頁抓到兩個綠燈測試抓不到的 bug**（池化發射器永遠 0 粒子、PIVOT 不在契約裡）；挖出 extractor 半徑大兩倍影響 282 份文件 |
| 角色內容 0 筆（3） | 33 個武器 tag → `attackKatana`/`attackGreatsword` 首次可播；112/113 hitFeel；**挖出法師施法播拉弓聲、`flashColor`/`flashMs` 客戶端不讀** |
| 音效最後一哩（3） | 3 個無觸發點音效接上（純客戶端，零線路成本）；**credits 頁 `boundKeys` 改成機器推導＋對 fan-out 名單驗證** |
| Chrome 密碼（3） | **推翻我的診斷**：主因不是缺 `<form>`，是註冊頁欄位順序讓 Chrome 把**邀請碼當帳號存了** |
| 聲線分離度（3） | 用 campplus 量出 **92% 的 Kyoko 配對相似度超過「同一真人兩段錄音」的中位數**——儀器判定是同一個人 |
| 語音雙引擎 QC（3） | CosyVoice 3 主力；**拒絕用 ASR 當閘**並給出無法分離的實測數字 |

## 今日確立的兩個判準

1. **假完成的判定是三段**：東西在 → 有引用 → **在真實對局裡跑得到**。第三段是這專案一直斷的地方。
2. **LoL 競技場是明確參考對象**（擁有者指定）。查證後採用其隊伍生命值模型：
   **20 點、−2/−2/−2 → −4/−4/−4 → −6、歸零淘汰、第 5 回合起 High Stakes 勝方 +15**。
   全敗方撐到第 7 回合，一場約 **7–13 回合**。

## 一個流程教訓（已記入）

我把 config 裡既有的 `startingTeamLives: 8` **當成擁有者的意圖**並據此分析「你的 8 要付什麼代價」。
git 證明那個值來自 initial commit，從未被改過，**不是他設的**。
他的指示是「修理這個死設定」，不是「命數要 8」。
→ **不得將既有資料歸因於使用者的意圖**；來歷不明的數值先查 git，查不到就問。

---

## 07-24 收尾盤點（晚間）

**16 條工作流落地，3 條在跑。** 全 workspace typecheck ✅ / Go build + vet ✅ / 平台測試全綠。
工作樹 956 檔未 commit（HEAD 仍是 `49dca64`）。

### 今晚新增的三條規則（擁有者現場定調）

| 規則 | 實作 |
|---|---|
| 吃雞水晶 2 倍 ＋ 1 枚 M 幣 | `CrystalPlace1 = 120 × CrystalWinMultiplier(2) = 240`；`mcoinRewards {1:1, 其餘 0}` |
| 有 bot / 有人跳離 → 不發 M 幣 | 12 個座位全真人才發（**沙發玩家算真人**） |
| 自己隊有 bot → 水晶砍半 | 逐隊判定，不是逐房間 |

**為什麼是逐隊而不是逐房間**：4 隊 × 3 人 = 12 座位，房間級規則等於「家人要湊 12 人才拿得到水晶」，
「打場免費賺」會變成存在但永不發生的功能——正是這批工作在清的病。逐隊規則仍然擋掉真正的 exploit
（一個人打 bot 最多拿一半），但家人組成一隊就能拿滿。

### 兩個在實作中被測試抓到的錯

1. **差點清空玩家餘額**：結算寫的是**絕對值**。閘住時若「跳過賦值」，map 缺 key → 解成 0 → 餘額被設為 0。
   正確寫法是寫入**當前餘額**。水晶那條線早已記錄過同一個陷阱，這是第二次出現 →
   **在這個檔案裡，「跳過一次絕對值寫入」等於「清空」**。
2. **沙發玩家被判成 bot**：`isGuestSeat` 把 `:pN` 判為非真人，會讓四人同機遊玩拿不到 M 幣、水晶砍半。
   已改成只看 `IsBot`。

### 合併 worktree CI 修正

三個被遺棄的 worktree 裡 6 個未合併 commit，**全部是我一直當成「本分支本來就紅」的那些紅燈的解藥**。
合併 5 個（`.gitignore` 是 dirty 的，所以逐檔取出而非 cherry-pick）；
`legendaryClaims.test.ts` 刻意不併——它是紅的，而且抓到的是真的（傳說池 14 件，測試要求 ≥25），
那是 #108 的內容，該跟 #108 的修正一起進來，不是提前進來當紅燈。

---

## ⏸ 被「月費上限」硬中斷的任務（2026-07-24 深夜）

這些 agent 是**跑到一半被硬切**，不是失敗也不是放棄。兩條都支援續跑，
已完成的 agent 會走快取不重跑。

| 工作流 | 中斷的階段 | 已經完成並落地的 | 還缺什麼 |
|---|---|---|---|
| `wcap02755` Arena 養成曲線 | `curve`、`cards + icons` | 隊伍生命值完整實作並測過（20 點、−2/−4/−6、**R7 起每回合再 +3**、High Stakes +15、bye 也給付）；augment 虹級 7→16；`draft.ts` 不再靜默少發卡；`config.match.json` 20 | **每回合金錢曲線的完整重寫**；新卡片的 icon 生成 |
| `wpu66wxr4` 假完成重新盤點 | `fix:magic-weapon-class` | 5 個切片重新量測（10/11 agent）；報告已改寫 | **補 `magic`/`beam` weapon class** —— 27 個法師施法時仍然播「拉弓聲」 |

**重啟指令**（腳本都在 `~/.claude/projects/-Users-Takuro-GGD/1fc1e42e-.../workflows/scripts/`）：

```
Workflow({scriptPath: ".../ggd-arena-team-health-progression-wf_0a330621-316.js",
          resumeFromRunId: "wf_0a330621-316"})
Workflow({scriptPath: ".../ggd-false-completions-remeasure-and-fix-wf_31d5c620-45b.js",
          resumeFromRunId: "wf_31d5c620-45b"})
```

### 同時仍在跑（未被中斷）

| 工作流 | 內容 |
|---|---|
| `wyec1o4t5` | 語音素材包整合（ECAPA + campplus 雙編碼器交叉驗證） |
| `wpvfatcq1` | 首局操作提示（半透明、依輸入方式切換） |

---

## ✅ v0.4.1 部署完成（2026-07-24 深夜）— 過程中的四個真實故障

`https://ggd.adms.ai/` **HTTP 200**。但這次部署連踩四個坑，全部值得記：

1. **主機磁碟 100% 滿** — Go build 失敗的訊息長得像編譯錯誤，實際是
   `no space left on device`。`docker builder prune -af` 清掉 4.5 GB。
   **build cache 一天長到 6.3 G，而磁碟只有 9.7 G** → 建議加定期
   `docker builder prune -af --filter until=48h`。
2. **85 MB 資產覆蓋層在磁碟寫滿時整個掉了**（`data/blizzard-overlay` 只剩 4 K）。
   它是 gitignore 的執行期資產，`git pull` 帶不回來。主機**沒有 rsync**，用 `tar | ssh` 重傳。
3. **第一次 tar 傳輸被截斷** — 主機 64,987,962 B vs 應有 87,403,869 B。
   **是 edge 的開機斷言抓到的**，不是我。改用未壓縮 tar 重傳並比對位元組數才過。
4. **最後的真兇是權限**。`tar` 解壓保留原始權限，**126 個檔案是 `600`**，
   容器內的非 root 使用者讀不到。而 `ggd-assets.sh` 的 `bytes_of()` 用
   `cat {} + 2>/dev/null`，**把讀取失敗靜靜吞掉**，所以它報「檔案短少」而不是
   「權限不足」——症狀指向錯誤的方向，我為此白繞了兩輪。
   → **`ggd-assets.sh` 值得改**：讀不到的檔案應該要明講是權限問題。
   這正是這批工作在清的同一種病：靜默失敗偽裝成別的東西。

**中途 SSH agent 掉了金鑰**（`Permission denied (publickey)`），一度無法收尾；
本機 `~/.ssh/` 只有 `id_rsa` 和 `github_rsa`，兩把都被主機拒——後來恢復了，
但**這個環境問題還在，下次可能再發生**。
