# GH#610 —— 霧要**一片飄過去**（lane FG）

> ⭐ owner 2026-08-23（逐字）
> 「⭐ 起霧＝空氣漫反射同一顆旋鈕轉大
>  => **不是全場地都霧喔，而是像真實一樣會有一片飄過去，隨機產生不規則形狀霧**」

> ⭐ owner 2026-08-23（逐字，追加）
> 「**飄動霧 應該要很淡 不影響任何戰局只是裝飾 不計入也不影響重播**」

---

## 1. 盤點：三種做法，逐項成本

| 候選 | 每幀成本 | 俯角 68° 好不好看 | 分割畫面 ×4 | 判決 |
|---|---|---|---|---|
| **體積霧 post-process**（depth prepass ＋ 全螢幕 ray-march） | 一趟 depth ＋ 一趟全螢幕 march | ⛔ 相機幾乎垂直往下看 ⇒ 視線在霧層裡的行程極短，ray-march 的錢花在一層看不出厚度的薄膜上 | ⛔ **逐相機掛** ⇒ 成本 = `N_camera × 全螢幕像素` = **×4**（`MirrorTexture` / SSR / god rays 已經為同一個理由被否決過三次） | ⛔ |
| **地面材質上的動態遮罩** | ⭐ 零（多一次貼圖取樣） | ⛔ 它畫在**地板上** ⇒ 是地上的一塊污漬。霧片飄過英雄腳邊時**不會擋住任何東西** ⇒ 那不是霧是地毯 | ⭐ 免疫 | ⛔ |
| ⭐ **貼地飄的薄片 ＋ thin instances** | **1 個 draw call**／整張圖 ＋ 每幀 `N×16` 個 float | ⭐ 68° 是**往下看** ⇒ 水平薄片正對相機（sin 68° = 0.93），這個視角下唯一會佔到畫面面積的形狀 | ⭐ 免疫 —— thin instance 是**場景裡的 mesh**，⛔ 不是掛在相機上的 pass ⇒ 四顆相機看到同一批霧，而且各自角度正確。成本 = `1 draw call ＋ N_camera × 霧片實際覆蓋的像素` | ⭐ **選它** |

⚠️ **幀成本沒有量到**（這條 lane 跑不起 WebGL）。上表講的是**結構性**成本（幾趟 pass、幾個 draw call、乘不乘相機數），那是從程式碼讀得出來的事實。

### ⭐ 選它的三個理由
1. **分割畫面的算術**：post-process 4 趟全螢幕 ray-march vs. 薄片仍然 **1 個 draw call**。
2. **它真的會擋東西**（地面遮罩不會）⇒ 才叫「一片霧飄過去」。
3. **它已經是這個 repo 的慣例**：積水與接觸陰影都是「一顆 mesh ＋ thin instances」。

### ⛔ 形狀住**頂點 alpha**，⛔ 不住貼圖
原本寫成 `DynamicTexture` ＋ 程序畫的雲，**自己撤掉了**：`DynamicTexture` 要一張 canvas，而 `buildArena` 被一大票 headless 測試呼叫 ⇒ 一張畫不出來的雲會把**別人的**測試弄紅，而它換到的只是一個本來就可以用頂點做的柔邊。⭐ 同 `buildPuddles` 的檔頭：「邊緣的淡出住在頂點 alpha，⛔ 不是貼圖」。⛔ 全程沒有下載任何東西。

---

## 2. 不規則 ＋ 會飄

| 要求 | 怎麼做到 |
|---|---|
| **不規則形狀** | `fogBankRadius(seed, θ)` —— 三條不同頻率的正弦（相位由**場地 seed** 決定）疊出一個逐角度被啃過的外框 ⇒ 13 張場地各一個剪影，⛔ 不是同一個圓被縮放 |
| **每一片再各自不同** | 每片有自己的非等向縮放（x/z 各 0.65–1.0）＋ 自己的旋轉角 |
| **會飄** | 位置 = 沿著逐場地固定的風向平移，每片自己的速度（0.6–1.4×）與相位 ⇒ ⛔ 不會排成一列 |
| **飄出去不瞬移** | 一趟距離 = 跨距 ＋ 兩個直徑 ⇒ 霧片**完全離場**之後才折回 |

---

## 3. 決定性

- ⭐ `fogBankPose(foot, policy, seed, i, count, tSec)` 是**純函式** —— 同一個 `t` ＋ 同一個 seed ⇒ **逐位元**同一個結果。⛔ 沒有 `Math.random()`、⛔ 沒有累加狀態、⛔ 沒有遞減計數器（吃**絕對時間**）。
- ⚠️ 亂數來源刻意**不是** `Math.sin`（`ArenaGround.hash01` 用的那一招）—— `Math.sin` 的最後幾個位元不是 IEEE 規定的，跨引擎可以差一個 ulp。這裡用 **32-bit 整數 mix**（`Math.imul`），所以「同一個 t 同一個 seed ⇒ 同一個畫面」在**任何**機器上都成立。
- seed 來自 **arena id 的 FNV-1a**（⛔ 不存進任何狀態，隨時算得出來）。
- `prefers-reduced-motion` ⇒ 時間恆定 `t = 0`：霧還在，只是不飄（同積水微光的待遇）。

---

## 4. ⛔ 不影響戰局、⛔ 不計入也不影響重播（owner 的追加約束）

逐條確認：

| 要確認的 | 結果 |
|---|---|
| 有沒有進 `packages/shared/src/sim/**` | ⛔ **沒有**。`grep -rn "fogBank\|WeatherLook" packages/shared/src/sim` = 0 筆 |
| 有沒有進 `apps/game-server/src` | ⛔ **沒有**。同一個 grep = 0 筆 |
| 有沒有在 `SimWorld` 上佔一格狀態 | ⛔ **沒有** ⇒ `digestCoverage.ts` 那條閘連分類都不需要（它掃的是 `SimWorld` 的欄位） |
| 有沒有進快照／`EventMessage` | ⛔ **沒有**（Colyseus schema 一個位元組都沒動） |
| 有沒有碰 `canSee` / 索敵 / 命中 / 碰撞 | ⛔ **沒有**。`mesh.isPickable = false`，而它整個住在 `apps/client/src/render/` |
| 這個檔 import 了什麼 | 只有 `@babylonjs/core`（7 個）＋ `@ggd/shared/content` 的**兩個型別** |
| 這個檔有沒有出現 `world` 這個字 | ⛔ **一個都沒有** —— 原本有一個叫 `world` 的區域 `Matrix` 變數，⭐ 改名成 `pose`，免得下一個人 grep「這個檔有沒有碰 sim world」時誤報 |

⇒ ⭐ **純客戶端算繪**。它決定性，但那與重播無關 —— 理由是暫停／逐格步進／截圖比對。

---

## 5. 玩法閘怎麼擴的

### ⚠️ 擴之前先量到一件事：**舊的閘已經沒有餘裕了**

出貨場地量得到的最遠對戰距離 **84**（`arena.royale`，單 zone 半徑 42）。舊上界下的最壞情況：

```
density = AIR_SCATTER_DENSITY(0.006) + fogDensityAtFull_max(0.006) = 0.012
T = exp(-(0.012 × 84)²) = exp(-1.016) = 0.362   ≥ 0.35 ← 只剩 3.5% 餘裕
```

⇒ ⭐ **局部那一層要是再乘任何一個 <1 的數，舊的閘立刻破。** 所以擴閘不是加一條斷言，是**重新分配同一個預算**。

### ⭐ 擴法：一條界線，兩層相乘

新函式 `fogSightTransmittance(density, distance, bankAlpha) = exp(-(d·k)²) × (1 − alpha)`。

⭐ **局部那一層是 `1 − a` 而不是 `(1 − a)^N`，理由是幾何不是樂觀**：

- N 片霧 = 把場地橫切成 **N 條互斥車道**，一條一片；
- **全部同一個高度** ⇒ 相機射線穿過那個高度**恰好一次**；
- ⇒ 畫面上任何一點**最多被一片蓋到**。

互斥是**關死的**：`fogBankHalf() = laneFill × span / (count × 2 × √2)` —— 夾的是霧片**轉到任何角度的外接半徑**，⛔ 不是邊長（少了那個 √2，45° 時會越線而畫面上完全看不出來）。而 `fogBankRadius()` 永遠 ≤ 1 ⇒ 縮放後每一點距離 ≤ `hypot(halfX, halfZ)`。

⚠️ ⭐ **那個前提本身也被測**：守衛沿一整趟飄程取 64 個時間點，兩兩驗外接圓不相交（車道最滿 `laneFill = 1`、片數最多的設定下）。

### 重新分配的結果

| | 舊 | 新 | 為什麼 |
|---|---|---|---|
| `fogDensityAtFull` **上界** | 0.006 | **0.003** | 反解自兩層相乘 |
| `fogDensityAtFull` **出貨** | 0.005 | **0.0025** | owner「不是全場地都霧」的字面實現：預算搬到飄過去的那一層 |
| `fogBankAlpha` **上界** | —— | **0.35** | 與上面那格是同一條界線反解出來的兩半 |
| `fogBankAlpha` **出貨** | —— | **0.10** | ⭐ owner「**很淡…只是裝飾**」⇒ 出貨值刻意只有上界的不到三分之一 |

驗算：
- **上界最壞**：`exp(-((0.006+0.003)×84)²) × (1−0.35) = 0.5646 × 0.65 = 0.367 ≥ 0.35` ✅
- **出貨實況**：`exp(-((0.006+0.0025)×84)²) × (1−0.10) = 0.6007 × 0.90 = 0.541` ✅ 餘裕 54%

---

## 6. 收斂成**一個**機制（⛔ 不是兩套濃度）

| 共用的東西 | 怎麼共用 |
|---|---|
| **開關** | 沿用既有的 `graphics.weatherFog` 三態，⛔ 沒有開第五格 |
| **權重** | `weatherLookFor()` **同一支**函式吐出 `fogDensity` 與 `fogBanks`，吃**同一個** `WEATHER_KIND_WEIGHTS[kind].fog` ⇒ ⛔ 不可能「全域說沒霧、局部飄了一片」 |
| **顏色** | 霧片材質每幀從 `scene.fogColor` 抄 —— 那正是 `Lighting.write()` 用這一刻的天光＋主光算出來的空氣色 ⇒ 雷雨場地閃電打下來時飄過去那片會跟著亮。⛔ 沒有第二個顏色欄位 |
| **玩法界線** | 兩層相乘吃同一條 `FOG_MIN_TRANSMITTANCE` |
| **畫質梯子** | `WEATHER_FOG_MAX_LEVEL`（＝ `PUDDLE_MAX_LEVEL`）—— 判準寫進註解：兩者都是「一顆 mesh ＋ thin instances ＋ alpha blend」，⛔ 沒有理由讓同一種成本吃兩條梯子 |

---

## 7. 後台（第一守則：三個住處）

`content/config/weather.json` ＋ Zod `DEFAULT_WEATHER` ＋ admin `WEATHER_SPEC.fields`，五格全部到齊：

| 欄位 | 中文 | 出貨 | 上下界 |
|---|---|---:|---|
| `fogBankCount` | 起霧②霧片：場上同時幾片 | 4 | 0–8（int） |
| `fogBankAlpha` | 起霧②霧片：一片有多濃 | **0.10** | 0–0.35 |
| `fogBankLaneFill` | 起霧②霧片：一片多大（佔車道） | 0.85 | 0.2–1 |
| `fogBankDriftSec` | 起霧②霧片：飄一趟幾秒 | 90 | 8–600 |
| `fogBankHeight` | 起霧②霧片：離地多高 | 1.2 | 0.2–20 |

⚠️ 改動的既有欄位：`fogDensityAtFull` 出貨 0.005 → **0.0025**、Zod 上界 0.006 → **0.003**，標籤改名成「起霧①空氣：最濃時的濃度」，說明寫清楚它為什麼降。
⚠️ `fogBankAlpha` 的說明逐字寫了 owner 的「很淡…只是裝飾」，並註明**上界是防呆不是目標**。
⭐ 新增三段 intro（兩層是什麼／顏色不在這頁選／N 片 = N 條互斥車道）＋ `consumer` / `effect` 兩行更新。

---

## 8. 測試（體驗層預算：≤ 實作且 ≤80 行）

`apps/client/src/render/weatherFogBanks.test.ts` —— **78 行**，三個 `it()`，⛔ 一個可調數字都沒抄（全部從 Zod `maxValue` / `DEFAULT_WEATHER` / `content/arenas/*.json` 推導）：

1. **玩法閘**：兩層相乘的最壞情況 ≥ `FOG_MIN_TRANSMITTANCE`，距離**從出貨場地量**；⭐ 而它依賴的「最多被一片蓋到」**自己也被驗**（64 個時間點 × 兩兩不相交）。
2. **決定性**：同 t 同 seed ⇒ `toEqual`；t 走了／換 seed ⇒ `not.toEqual`。
3. **接線**：走**出貨路徑** `buildArena()`（⛔ 不是直接呼叫 builder ——後者對「ArenaScene 忘了接」是全綠的，失敗形態③），開著 ⇒ `thinInstanceCount` 等於 `weatherLookFor()` 算出來的片數（先斷言它 > 0，⛔ 不讓 `0 === 0` 變成永遠綠的裝飾品）；`weatherFog: "off"` ⇒ **mesh 根本不存在**。

### 突變驗證（一批一條的預算，做了兩處但一次跑完 —— 它們守的是不同的 `it()`，歸因不混）

| 突變 | 結果 |
|---|---|
| `ArenaScene` 那行接線換成 `null`（＝整個功能撤銷） | ⛔ **紅**：`③ … expected +0 to be 4` |
| `fogBankHalf()` 拿掉 `√2`（＝互斥車道破功） | ⛔ **紅**：`① … expected 7.7285… to be greater than 8.7129…` |

兩處都用 `Edit` 改回來（⛔ 不是 `git checkout`）。

---

## 9. 順帶：owner 說的「亮藍色往外擴散的圈圈特效」

⛔ **沒有動任何東西**（不是我的柵欄）。我在自己的柵欄裡沒有碰到它；一次表面掃描指到的**候選**是
`apps/client/src/render/AimIndicator.ts`、`render/groundShapes.ts`（`aoeIndicatorCentre.test.ts` / `padTargetRing.test.ts` 在守）與 `render/vfx/groundDecal*` 那一族。
⚠️ ⭐ **這只是檔名層級的猜測，⛔ 我沒有讀過它們的顏色常數**，請派去查的人自己確認。

---

## 10. ⛔ 沒做到的

1. ⚠️ **動了一個柵欄外的檔**：`apps/client/src/render/ArenaScene.ts`（＋4 行接線 ＋3 行 import／註解）。
   ⭐ 原因：柵欄裡**沒有任何一個地方同時拿得到 `Scene` 與 `arena.zones`** ——
   `weather.ts` 只收得到 `arena.id`（`setWeatherArena`）、`airScatter.ts` 只收得到 palette 與這一幀的光。
   ⇒ 不接這一行，這個功能就是失敗形態③（可以整個刪掉而測試全綠）。
   ⭐ 已把外溢壓到**最小**：**每幀更新自己掛 `scene.onBeforeRenderObservable`** ⇒ ⛔ `GameApp.ts` / `Renderer.ts` / `Lighting.ts` **一個字都沒動**。
   commit 用逐檔 pathspec，⛔ 沒有 `git add`。
2. ⚠️ **同一片剪影**：一張場地裡 N 片霧共用同一個 seed 產生的外框（靠旋轉＋非等向縮放區分）。
   ⭐ 理由是 thin instances **共用幾何** —— 要讓每片各自一個剪影就是 N 顆 mesh = N 個 draw call，而那正是選這個做法的理由。⇒ 逐**場地**隨機，⛔ 不是逐片。
3. ⚠️ **幀成本沒有量到**（跑不起 WebGL）—— 只給結構性成本。
4. ⚠️ ⛔ **沒有跑 `pnpm content:build`**（全域鎖，主 session 統一跑）。⇒ `content/config/weather.json` 動過 ⇒ **`bundle.json` 現在是過期的**，主 session 收尾時務必跑。
