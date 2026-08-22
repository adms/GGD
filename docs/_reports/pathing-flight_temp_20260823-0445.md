# 路徑循環拉扯 ＋ 飛行單位前後端不一致 —— 調查與修正

> owner 2026-08-23（逐字）：
> 「**地圖路徑還很卡，常常會循環來回拉扯**，請你**重新檢查計算**，
>  特別是**飛行單位（翔封界、有翼劍士等）飛行路徑是可以飛過牆**，
>  **後端計算與前端預測方法不同**」

> owner 2026-08-23（逐字，常設）：
> 「**沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback**」

---

## ⭐ 一、前後端**是**同一支函式 —— 分歧在**餵進去的狀態**

`apps/client/src/predict/LocalPrediction.ts` 直接 import 出貨的
`movementSystem`（`@ggd/shared/sim/systems/MovementSystem`），伺服器的
`SimWorld.step()` 跑的也是同一支。⇒ ⛔ 「方法不同」**不是**兩份實作。

**憑據（逐行）：**

| | |
|---|---|
| `LocalPrediction.tickOnce()` | `orderSystem` → `movementSystem`，⛔ **沒有 `flightSystem`** |
| `LocalPrediction.spawn()` | `stats.sources` 鋪成 **`[]`** |
| `movementSystem` 的飛行判準 | `flightIgnoresObstacles(world, id)` → 讀 `world.flight` |
| `world.flight` 的唯一 writer | `flightSystem`（`SimWorld.step` slot 1d），從 `stats.sources` 推導 |

⇒ 影子的 `world.flight` **恆為空** ⇒ **影子永遠是地面單位**：它撞牆停住、
伺服器讓她飛過去 ⇒ 每個快照把玩家往前拉一段。
⭐ 這正是①「循環來回拉扯」在飛行英雄身上的樣子，而且**只有駕駛那具身體的玩家看得到**。

**量到的**（合成場地：一堵貫穿全場的牆，飛行英雄從 (-10,0) 走到 (10,0)）：
影子停在 **x ≈ -1.6**，伺服器飛到 **x = 10** ⇒ 最大誤差 **11.6 u**。

---

## ⭐ 二、循環來回拉扯的**主因不是飛行** —— 烘焙的 `nextHop` 根本不是「下一跳」

`packages/shared/src/map/graph.ts::bakeNav` 挑 via 的那一行：

```ts
const cost = dist[from][via] + dist[via][to];
if (cost < bestCost) { bestCost = cost; best = via; }   // 嚴格小於 ⇒ 平手取索引最小
```

任何**落在最短路上**的節點（含 `to` 自己）cost 都等於 `dist[from][to]`
⇒ 回傳的是「這條最短路上**索引最小**的節點」，而索引是按 (row, col) 排的
⇒ ⛔ **不是離我最近的那一個**。

**量到的**（出貨 6 張有導航的場地，body radius 0.6，全點對全點）：

| 場地 | `nextHop` 指向牆後面的比例 | 最遠的一跳 |
|---|---:|---:|
| 無限城 infinity-castle | **36.1 %** | 51.6 u（整張圖寬） |
| 進擊 shiganshina | 33.1 % | 51.6 u |
| 芙莉蓮 frieren | 32.8 % | 51.6 u |
| 納薩力克 nazarick | 32.4 % | 51.6 u |
| 天空鬥技場 heavens-arena | 24.3 % | 51.6 u |
| 聖杯 holy-grail / 世界樹 world-tree | 23.6 % | 51.6 u |

而這 6 張 graybox 的障礙物**全部是 `box`**，`steerAroundObstacles` **只認圓形**
⇒ 垂直撞牆時切向分量 0 ⇒ **原地卡死**。

**實測一條完整走位**（芙莉蓮，出生點 →對面出生點）：第 100 tick 起
**永遠停在 (-0.73, 9.00)**，離目的地 19.73 u，之後 300 tick 一步都沒動。

⚠️ 修 `bakeNav` 才是治本，但它要**重烘 6 張 `content/arenas/*.json`** ⇒ 需要
`pnpm content:build` 重寫 `bundle.json` ⇒ **這一批明令禁止**（併行 lane 的鎖）。
⇒ 改成**執行期修正**，而且它更強：用**真實碰撞幾何＋身體半徑**，
⛔ 不是烘焙時的 tile grid。

---

## ⭐ 三、做了什麼

### ① `packages/shared/src/sim/navRoute.ts`（新）

視線鄰接圖 → 每個目標節點跑一次 **Dijkstra（權重＝真實距離）** → 快取整張表。
執行期仍然只是查表。

⚠️ **中途踩到的坑（量到的，寫下來免得下一輪再踩）**：第一版用 **BFS 跳數**，
結果無限城「中心 → 東側出生點」被往**西北**帶了 130 tick、橫越整張圖才折返，
途中 **31 次方向反轉**。原因：視線邊可以長達整張圖，「跳數最少」＝「用最少的長跳」。
換成距離權重後 **0 次**。

其餘三個關鍵決定：
- **進入圖的節點**取「走到它 ＋ 剩下的路」**總長最短**的那個，⛔ 不是「最近的」——
  最近的節點常常在**身後**，挑它就是一次 180° 來回。
- **終點在牆裡**（點到柱子上）⇒ ⛔ 不導航，直直走過去讓推出把身體停在牆面
  （逐字沿用 `collision/avoid.ts` 對同一件事的裁決）。
- **前瞻拉繩** 3 跳（拉直折線）。

### ② `packages/shared/src/sim/systems/MovementSystem.ts`

- `nextWaypoint` → `walkWaypoint`
- ⭐ **飛行單位不查導航表**（`flyersGoStraight`）：飛行的定義就是穿牆，
  而導航表存在的唯一理由是繞牆 —— 讓她繞路是兩個機制互相矛盾，
  而且那條繞路是客戶端預測算不出來的。
- `flightIgnoresObstacles` 一 tick 只問一次（原本兩處各問一次）。

### ③ `packages/shared/src/sim/map/lineOfSight.ts` —— 順手修掉的**熱路徑效能缺陷**

`segmentsCross` / `segmentHitsBox` 把 `cross`、`inside` 兩個閉包與 4 個角物件
**寫在函式裡** ⇒ 每個盒子每次呼叫配十幾個物件。

| | 前 | 後 |
|---|---:|---:|
| `segmentHitsAny`（16 個障礙物，一次呼叫） | **36.9 µs** | **0.79 µs**（47×） |

⛔ 幾何一個字沒改（同樣的算式與容差），另加一個 AABB 早退。
⚠️ 這條路徑**普攻視線**（`BasicAttackSystem`）也在走 ⇒ 這不是只為導航修的。

### ④ `apps/client/src/predict/LocalPrediction.ts` ＋ `predict/localFlight.ts`（新）

- 影子在 `movementSystem` **之前**跑**出貨的** `flightSystem`（`SimWorld.step` 的 slot 1d，逐字同位置）
- `championId` 的**天生技**飛行授予解析成一個**出貨形狀的** `ModifierSource`
  （走出貨的 `isPassiveInnate` / `abilityPassiveSourceId`，⛔ 不抄判準）
- 新增公開 `setFlight(grant | null)` 通道

⚠️ **涵蓋範圍（誠實地）**：

| 來源 | 影子預測得到嗎 |
|---|---|
| **天生技** 04-00 翔封界（`godie-h020` / `godie-hjai`） | ✅ |
| 道具（天叢雲劍 · 立體機動裝置）、增益（騎乘 EX）、**變身 buff（77-03 有翼劍士）** | ⛔ **還沒有** |

⛔ 後者需要 `GameApp.ts` 加**一行** `prediction.setFlight(...)`，而 `GameApp.ts`
**由別的 lane 佔用**（逐檔柵欄）。⚠️ 在接上之前，變身/道具取得的飛行**仍然有那個拉扯**。

⭐ 另外量到一筆**內容漂移**（⛔ 沒改，內容編輯要 `content:build`）：
`godie-e00w.e.json`（有翼劍士，base 那一張）帶 `flight`，
而鏡像的 `godie-e00x.e.json` **沒有**。

---

## ⭐ 四、量到的（修前 / 修後）

280 條隨機走位（7 張有導航的場地 × 40 條，決定性 LCG，兩邊**同一組**起訖點）：

| | 方向反轉次數 | 走不到 | 平均抵達 tick |
|---|---:|---:|---:|
| **修前**（`losCorrection: false`＝一鍵回頭） | **305** | **32 / 280** | 147 |
| **修後**（出貨預設） | **10** | **0 / 280** | **108** |

執行期成本：一張表建一次 **38–62 ms**（一個 process 一輩子一次），
之後每次查詢 **2.2–5.9 µs**。

---

## ⭐ 五、我挑了什麼 · 開關叫什麼

owner 說「自己判斷，但留後台開關可以簡易 rollback」。三格全部是我挑的，全部可翻回去：

| 開關 | 出貨值 | 關掉會怎樣 |
|---|---|---|
| `losCorrection` | **true** | 逐位元退回烘焙表的原始查法（＝這條缺陷被修之前） |
| `flyersGoStraight` | **true** | 飛行單位照著地面路線繞牆（＝修之前） |
| `lookahead` | **true** | 逐節點折線走（看得到的鋸齒） |

住處：`packages/shared/src/sim/navRoute.ts`（`NavRules` / `DEFAULT_NAV_RULES` /
`normalizeNavRules` / `applyNavRulesDoc`）。

⛔ **為什麼不是一份 `config.map-nav@1`**：新增 `content/config/*.json` 必須跑
`pnpm content:build` 把它嵌進 `bundle.json`，而這一批**明令禁止**跑它。
⭐ 逐字沿用同一天 `sim/flight.ts` 的前例（「集中在一個住處、由單一出口供應，
之後要抬進 config 是一次搬家」）：`applyNavRulesDoc(doc)` 已經是
`config.combat-feel@1` 讀取器（`predictionHold` 那一支）的形狀，接上去是**一行**。

---

## ⭐ 六、守衛與突變

| 檔 | 驗什麼 |
|---|---|
| `packages/shared/src/sim/navRoute.test.ts` | 手搭一堵牆 + **刻意壞掉的 `nextHop`**（複製 bakeNav 的缺陷形狀）：單位繞得過去，而且**方向反轉 = 0** |
| `apps/client/src/predict/flightPredictionParity.test.ts` | 飛行英雄在伺服器與影子底下**逐 tick 位置序列相同**（maxErr < 1e-6），⭐ 並先釘住「她真的飛過了那堵牆」這個前提 |

**突變（一批一條，挑最承重的線）**：拿掉 `LocalPrediction.tickOnce()` 裡的
`flightSystem(this.world)` → 紅，`maxErr` 從 **0 變 11.6**（影子停在牆前，
伺服器飛到對岸）。已還原。
⭐ `navRoute.test.ts` 的第二條 `it` **本身就是突變**：把 `losCorrection` 關掉
（＝ owner 要的 rollback）單位就走不到 —— 這一格若變成 no-op，那一條會紅。

---

## ⚠️ 七、既有的紅（⛔ 不是這一批造成的）

`pnpm typecheck` **EXIT=0**。測試在 `main` 上本來就有紅：

- `content/bundle.test.ts` · `shippedBundleIsCurrent` · `abilityProvenance` ·
  `codexContractFresh` · `legacyIndexFresh` —— 全部是**內容/文件新鮮度閘**，
  而工作區有別的 lane 正在改 `content/bundle.json`、`docs/**`。我一份內容、一份文件都沒動。
- `apps/client/src/render/occlusionZone.test.ts` —— `occludeArgsFor` 回 `undefined`，
  而 HEAD 的前兩個 commit 正是**全視野**（`c9e90910` / `60a92961`）。
  `render/**` 在別的 lane 手上。
