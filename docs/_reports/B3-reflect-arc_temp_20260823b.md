# B3 技能模板③ · 理想鄉反彈七彩閃電 —— 完整報告（2026-08-23）

owner 2026-08-22（逐字）：

> 「**理想鄉被反彈的敵方單位 身上要有明顯的七彩閃電爆炸 畫面閃爍及震動** 不然都不知道
>  發生什麼事情**有沒有反擊成功** (原版JASS有，可補強增加更多視覺效果)」

---

## 0. 進場先量：這一票**已經做掉一大半**

commit `296aa167`（2026-08-22）已經落地，而且是 HEAD 的祖先：

| 層 | 狀態 |
|---|---|
| sim 事件 | `screenFlash` / `screenShake` / `floatingText` / `vfxSpawn` 全部發得出來（`sim/effects/clientCues.ts`） |
| 觀眾解算 | `applyTo` → `subjects` / `broadcast` 在**權威側**算完（⛔ 客戶端沒有第二份規則） |
| 白名單 | 四個全部在 `apps/game-server/src/net/eventFanout.ts` 的 `FANNED_OUT_EVENT_TYPES` 裡 |
| 客戶端 | `VfxSystem` 的 `case "screenFlash"/"screenShake"/"floatingText"/"vfxSpawn"` 都活著（GH#608 修完） |
| 內容 | `godie-e002.ex` / `godie-e00l.ex` 的 `onReflectSuccess` 有四個回饋節點（爆炸 at:"target" + 自己金閃 + 對方紫閃 + 全場震動） |
| 守衛 | `packages/shared/src/sim/effects/avalonReflectFeedback.test.ts`（讀出貨 JSON，⛔ 不是夾具） |

⇒ 這一輪**沒有重做**上面任何一格。做的是它缺的那一半：**「閃電」在畫面上不存在**。

---

## 1. 做了什麼

### 缺的是「閃電」，⛔ 不是「回饋」

`fx.avalon.reflect-burst` 是一份 `vfx@1` **粒子**文件。兩個結構性上限：

1. **粒子做不出「一道有分岔的鋸齒電弧」** —— `arcBolt.ts` 的檔頭逐字記著同一件事，
   那正是 owner 上一票（GH#571）「一堆閃電特效**都沒有真的出現**」的根因。
2. **`colorStops` 的上界是 4**（`schema/vfx.ts`）⇒ **一份文件寫不出七個顏色**。

⇒ 出貨的那一團是「彩色的粒子爆炸」，⛔ 不是 owner 說的「**七彩閃電**爆炸」。

### 落地：一個模板 + 一張表（第零守則⑨）

**新檔 `apps/client/src/vfx/reflectArcBurst.ts`**

| 東西 | 是什麼 |
|---|---|
| `REFLECT_ARC_CUES` | ⭐ **表**，鍵是**演出文件 id**（`vfx@1` 的 id），⛔ 不是技能 id / 英雄 id |
| `reflectArcBurstPlan()` | 純函式：`(vfxId, at, seed, bodyY)` → 「這一發要打哪幾道弧」 |
| `reflectArcHue()` | 色環上第 i 個色相（HSV→RGB）。⛔ 不是一張寫死七個顏色的陣列 |
| `setReflectArcsEnabled()` | 總開關，出貨 **on**（見 §3） |

**幾何重用既有的 `arcRadiateEnds()`**（均分一圈再各自抖一點 —— 純雜湊會結塊，
讀起來變成「往那邊噴了一坨」）。**顏色逐道不同** ⇒ 7 道弧同時在畫面上 = 七個顏色。
⛔ 不是「發七次 `spawnVfx`」（那是 O(N) 份會各自腐爛的文件，而且七團粒子疊在同一
個座標只會變成一團白的）。

**接線 `VfxSystem.ts` 的 `case "vfxSpawn"`**（＋21 行）：播完粒子文件之後，
照 plan 逐條 `this.strikeArc(...)`。⛔ 這裡**沒有任何技能 id 的 if**。

### ⭐ 這就是 owner 說的「模板」

> 「其他有反彈的技能（護盾反射、格擋反擊）應該共用同一份演出，各自只調參數」

第二支反彈技能要這套演出的成本 = **在它自己的 JSON 裡把 `spawnVfx.vfxId` 指到表上
已經有的一列**。⛔ 不必動這個檔案一行、⛔ 不必加一個 `case`。
要調參數 = 在表上加一列（`count` / `reach` / `power` / `forks` / `hueOffset` / `saturation`）。

出貨兩列：`fx.avalon.reflect-burst`（7 道 = 七彩，也剛好是原作的七次斬擊）與
`fx.avalon.reflect-spark`（每一刀的小火花，3 道、更輕 —— 它一秒鐘出現七次，重版會疲勞）。

---

## 2. 原版 JASS 查過了（第〇·六守則的階梯）

commit `296aa167` 的訊息已經逐字記錄了 `Trig_ExcaliburMAX_Actions`（`war3map.j:32559`）的
三個結論，這一輪**沿用，⛔ 不重查**：

| | 原作 | GGD |
|---|---|---|
| 畫面震動 | ✅ 逐字存在（`CameraSetEQNoiseForPlayer`，1600×1600 內每一個單位） | `screenShake applyTo:"all"` |
| 畫面閃爍 | ⛔ **零個 `SetCineFilter`** | owner 說的「**補強**」 |
| 七彩 | ⛔ 原作是紅色殘影（vertex 80,10,10）+ 白色斬擊 dummy | 🪜 第 1 層（owner 新版說明）贏過第 3 層（JASS） |

被取代的原作配色已記在該 commit 的訊息裡（⛔ 知識不無聲消失）。

---

## 3. rollback —— 兩層，而且我**刻意不掛在 `castArcs` 上**

⚠️ 最誘人的做法是重用既有的後台欄位 `config.vfx-families@1.castArcs`。
⛔ **那會讓這一票逐位元組不存在**：

```
packages/shared/src/content/schema/vfx.ts:463   export const DEFAULT_CAST_ARCS = false;
content/config/vfx-families.json                "castArcs": false
```

owner 2026-08-23 逐字「**請你預設關閉**」—— 理由是**每一次施法**生 5–8 條弧，而
低冷卻的 `nova`（58-01 十萬伏特）第一回合就在刷。⭐ **反彈成功走的是 60 秒大絕 ＋
1 秒內部冷卻**，cadence 差三個數量級 ⇒ 兩者本來就不該共用一格。

⇒ 這一族的兩層 rollback：

| # | 怎麼關 | 要不要部署 |
|---|---|---|
| ① **內容層**（今天就能用） | 技能 JSON 把 `spawnVfx.vfxId` 指到別份文件、或拿掉那個節點。`content/` 是 live bind-mount | ⛔ 不必 |
| ② **總開關** | `setReflectArcsEnabled(false)`，出貨值 `DEFAULT_REFLECT_ARCS = true`（＝我挑的那一邊，第〇·六守則） | ⚠️ **還沒接到後台**（見下） |

⚠️ ② **還不是後台欄位**，而我**不宣稱**它是（第一·五守則：不寫做不到的事）。
接上去是三行，三處都在這條 lane 的柵欄外：

```
packages/shared/src/content/schema/vfx.ts      reflectArcs: z.boolean().optional()  + DEFAULT_REFLECT_ARCS
apps/client/src/content/ContentDb.ts:394 旁     setReflectArcsEnabled(vfxFamiliesDoc?.reflectArcs);
apps/admin/src/configForms.ts                  一列（標籤：反彈電弧）
```

---

## 4. 守衛與突變

`apps/client/src/vfx/reflectArcBurst.test.ts`（105 行 / 實作 224 行 = **0.47×**）

三條，全部驗**機制**，⛔ 一個顏色值／長度／道數都沒有進斷言：

1. ⭐ **承重** —— vfxId 從**出貨的** `content/abilities/godie-e002.ex.json` 讀出來
   （失敗形態⑤：⛔ 不是夾具手寫），跑真的 `VfxSystem.handleEvent`，
   讀**真的 Babylon 頂點**確認場上長出 ≥ N 條**從那個座標出發**的弧。
2. **七彩** —— plan 的每一道色相互不相同（同色 = 那不是七彩，是一團）。
3. **不外溢** —— 表上沒有的演出文件（`fx.thorn`）一道弧都不畫。

**突變（一批一條，最承重）**：`VfxSystem` 的 `case "vfxSpawn"` 裡那個
`for (const req of reflectArcBurstPlan(...))` 迴圈拿掉
→ ① 紅：「場上沒有任何一條從被反彈者身上出發的弧: expected 0 to be greater than or equal to 7」。
（已還原，⛔ 用 `Edit` 改回去，不是 `git checkout`。）

**測試預算**：`npx vitest run` **3 次**（新守衛 → 突變 → 相關既有一起跑一次）、`tsc` **1 次**（EXIT=0）。

---

## 5. ⛔ 順手發現，**沒有當場修**（第零守則⑧）—— 請 owner 排序

### ⭐ ①（最嚴重）分割畫面：閃爍與震動**只認得 player 0**

> 這正是任務書要我驗的那一條：「⚠️ 分割畫面要驗（4 個 viewport 各自的鏡頭）」。

沙發模式最多 **4 位本機玩家**（`GameApp` 建構子 `playerCount = min(4, seatTokens.length ?? localPlayers)`），
每人**各自一個 `CameraRig`**（`this.viewports`）。而：

| 位置 | 讀的是 | 後果 |
|---|---|---|
| `VfxSystem.ts:2136` `const me = this.ctx.localEntityId?.() ?? null` | `hudStore.localEntityId` = **player 0** | ⛔ 主角是**沙發玩家 2/3/4** 時，`screenCueIsForViewer` 回 false ⇒ **整發丟掉**，四個 viewport 一個都沒閃 |
| `GameApp.ts:3028` `this.cameraRig.addShake(...)` （`cameraRig` = `this.viewports.primary`） | **player 0 的鏡頭** | ⛔ 作者寫的 `screenShake` **只震 viewport 0** |
| `ScreenFxLayer.ensureEl()` `position:fixed;inset:0` | 整個視窗 | ⚠️ player 0 的**指名**閃爍會蓋住**全部四格** |

⇒ 「反擊成功」的回饋在沙發模式下對 3/4 的本機玩家**不存在**，對第 4 位是**假的**（別人的閃爍蓋到他臉上）。
⛔ **修不進這條 lane 的柵欄**：需要 `GameApp.ts`（注入全部本機 entityId + 逐 rig 派震動）
與 `VfxSystem` 的 ctx 介面一起改，而 `GameApp.ts` 是跨 lane 的重災區。
⭐ 修法方向：ctx 加 `localEntityIds(): readonly number[]`（player 0 只是第一格），
震動改成「命中哪幾位本機玩家就震哪幾個 rig」。

### ② 理想鄉的 **R** 反彈成功時**零回饋** —— 沒解鎖 EX 就等於沒做

`godie-e002.r`（20-04 Avalon）用 `applyBuff` + `onDamageTaken` + `incomingPct` 做反彈，
而**四個回饋節點全部住在 `godie-e002.ex`**（20-002 解放.約束勝利劍MAX）。
⇒ **EX 沒解鎖的那一整場**，反彈成功與失敗在畫面上仍然一模一樣 —— 正是 owner 抱怨的那句話。
⛔ 沒有當場修：R 的技能文件是**鏡像**的（`content/champions/godie-e002.json` 內嵌同一份），
改它要同時動 champion 文件（柵欄外，而且是別條 lane 的重災區）＋ `content:build`（全域鎖）。

### ③ `godie-e00l.r`（舊版 Saber 的 R）**根本沒有反彈**

它的 `effects` 只有一個 `damage` 節點（`provenance: "w3x-import"`），
而同一位英雄的 `godie-e00l.ex` 掛著 `onReflectSuccess`。
⇒ ⛔ 那條 hook 在這位英雄身上**永遠不會觸發**（`reflectDepth > 0` 的封包生不出來）。
🪜 階梯上 `godie-e002`（owner-spec）贏，所以這多半是舊版該下架 —— 但**知識不該無聲消失**，
請 owner 裁決是「補上反彈」還是「這隻整個退休」。

### ④ 出貨的紫色閃爍被全域上限**靜默夾掉**

`godie-e002.ex` 的 victim flash 寫 `peakAlpha: 0.62`，而 `config.screen-fx@1` 的全域上限是
`flashMaxAlpha 0.55` ⇒ 作者寫的值**從來沒有發生過**。
GH#602 owner 裁決 (a)「全域上限的本意是**防濫用**，⛔ 不是防你自己寫的演出」給了正解：
那三個節點補一格 `"scripted": true`。
⛔ 沒有當場改：它是**數值**（0.62 → 0.55，差 11%），而一次 content 編輯要拖著
`content:build`（全域鎖）＋ 一次跨 lane 協調 —— 第零守則說這不划算，交給 owner 排。

### ⑤ 第三守則：一段**會說謊的註解**

`packages/shared/src/content/schema/vfx.ts:1086`：

```
省略 = `DEFAULT_CAST_ARCS`（true，＝我挑的那一邊；第〇·六守則：優先權大的更新預設啟動）
```

而同一個檔案 `:463` 是 `export const DEFAULT_CAST_ARCS = false;`（owner 2026-08-23
「請你預設關閉」之後改的）。⇒ 那句 `（true，…）`在改值的當下沒有跟著改。
下一個人照它推導就會得到相反的結論 —— 我自己差一點就把這一票掛上去然後出貨一個死的功能。

---

## 6. 動到的檔（逐檔）

```
apps/client/src/vfx/reflectArcBurst.ts        新 · 203 行 · 模板 + 表 + 總開關
apps/client/src/vfx/reflectArcBurst.test.ts   新 · 105 行 · 三條守衛（含承重那一條）
apps/client/src/vfx/VfxSystem.ts              +21 −1 · case "vfxSpawn" 接線
docs/_reports/B3-reflect-arc_temp_20260823b.md 本檔
```

⛔ 沒有動：`content/`、`packages/shared/`、`apps/game-server/`、`GameApp.ts`、
產生器擁有的任何文件。⛔ 沒有跑 `content:build` / `skills:sync`（全域鎖）。
