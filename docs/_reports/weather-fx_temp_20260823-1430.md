# GH#610 第二批 —— 濕地面 · 積水 · 雷擊補光 · 起霧（lane W，2026-08-23）

> owner 2026-08-23（逐字，三則）
>
> 「**do it, 但有開關**」
>
> 「但是**有些場景是室內**，請**不要下雨**會很奇怪」
>
> 「另外一個天氣特效是**起霧** 你覺得如何？」

---

## ① repo 裡本來有沒有「天氣」的概念？—— **有半個，而且我接上去了**

| 找到的 | 在哪 | 是什麼 |
|---|---|---|
| ⭐ **`wave: "storm"`（雷雨）** | `packages/shared/src/content/schema/arenaScenery.ts` 的 `SCENERY_LIGHT_WAVES` | GH#362 就有的**打光波形**，標籤逐字寫著「雷雨 —— 長時間偏暗，週期性爆出一下極亮」。出貨用它的有 **2 張**：`arena.royale`、`arena.infinity-castle`（另外 `map.infinity-castle` 也有） |
| ⛔ 雨 / 濕度 / 霧濃度 / 室內室外 | —— | **完全不存在**。全 repo 搜 `weather` / `rain` / `storm` 只命中上面那一格與無關字串（`RoomStore` 的 `warn` 之類） |
| ⚠️ 室內/室外的**唯一**既有線索 | `content/arenas/*.json` 的 `name` | ⭐ `arena.castle` = 「城堡競技場（**室內**）」、`arena.colosseum` = 「羅馬大擂台（**室外**）」—— 13 張裡只有這 2 張，而且那是**人看的字串**不是欄位 |

⇒ **沒有可以直接用的欄位** ⇒ 依指示新開一格。

### ⚠️ 我把它開在 `config.weather@1`（config 文件），⛔ 不是 `arena@1` 的一格 —— 三個理由

1. **柵欄**：這條 lane 的 ✅ 清單裡有 `content/config/*.json`（**新開天氣那一份**）＋
   `schema/config/<新檔>.ts`，⛔ **沒有** `content/arenas/**` 也沒有 `schema/arenaScenery.ts`。
   改 13 份 100KB 級的場地文件不在我手上。
2. **後台**：config 文件走**通用設定引擎** ⇒ owner 直接在後台一格下拉選單改「哪張圖是室內」。
   放進 `arena@1.scenery` 的話它只在 Codex 地圖編輯器裡編得到，⛔ 後台碰不到 —— 而
   owner 這一則的重點正是「這幾張我判錯了要能改」。
3. **第〇·四守則沒有被違反**：室內/室外這份知識**沒有第二個住處**（它以前不存在）。

⭐ 如果 owner 之後想把它搬進 `arena@1.scenery`，那是一次搬家，⛔ 不是一次重寫：
`weatherKindFor(policy, arenaId)` 是唯一的查詢入口。

---

## ② 三樣（＋起霧）各自做了什麼

### 1. 濕地面 —— ⭐ 零成本，先做的那一個

`apps/client/src/render/ArenaGround.ts`：`baseGroundMaterial()` 多吃一組 `WetGroundParams`：

| 動的東西 | 怎麼動 |
|---|---|
| `mat.roughness` | `0.9 × wetRoughnessMul`（出貨 0.45）⇒ 主光在地上拉出一條長高光 |
| `mat.albedoColor` | 乘進**染色那一顆**（`× wetAlbedoMul`，出貨 0.62）⇒ 地板變深 |
| `mat.specularIntensity` | 從 `GROUND_SPECULAR_DRY = 0.35` 內插到 `wetSpecular`（出貨 0.85） |

⚠️ **兩個非顯然的點**（都寫進程式碼註解）：

- 濕度必須乘進 **`tint`**，⛔ 不是乘在材質上 —— `dressWhenReady()` 在貼圖解碼完之後會
  **整個覆寫** `albedoColor`（失敗形態⑤：寫在別處的濕度會在貼圖載完那一瞬間憑空消失）。
- 乘 `roughness` 在**貼好圖之後仍然有效**：ORM 走 `useRoughnessFromMetallicTextureGreen`，
  而 babylon 的 PBR 是 `metallicRoughness.g *= orm.g` ⇒ 材質常數是那個**乘數**。
  ⭐ 這就是為什麼濕地面可以是零成本：⛔ 沒有第二張貼圖、⛔ 沒有第二顆材質、⛔ 沒有第二趟 pass。

### 2. 雷擊補光 —— ⭐ 前一批確實只做了一半

`bec8c3bf` 之後空氣顏色已經跟著主光走 ✅，但**主光本身沒有變得更亮**：
`sceneryLightAt()` 只有 `keyIntensity × (1 + intensityAmp·w)`，而 `intensityAmp` 的
出貨值讓那一下閃是「稍微亮一點」，⛔ 不是「一道光打進來」。

`apps/client/src/render/Lighting.ts` 的 `write()` 現在多算一個 `strike`（**只取 storm 波的正半邊**）：

```
sun.intensity  ×= 1 + (lightningKeyBoost  − 1) × strike     // 出貨 1.7
hemi.intensity ×= 1 + (lightningFillBoost − 1) × strike     // 出貨 1.25（刻意比主光低）
fogColor       ×= 1 + (lightningFogBoost  − 1) × strike     // 出貨 1.5，clamp 到 1
```

⭐ **「這張圖有沒有雷」刻意不在天氣文件裡** —— 它已經有住處了（`scenery.lighting.wave`）。
⇒ 於是**無限城**（`groundStyle: tatami` ＝室內的鐵證，而它宣告了 `wave: "storm"`）
天然同時是「⛔ 不下雨」與「⭐ 會閃電」，⛔ 不必為它開任何例外。

### 3. 積水 —— ⭐ **兩個都沒選**，走材質

| 候選 | 判決 | 為什麼（結構性事實，⛔ 不是猜的） |
|---|---|---|
| `MirrorTexture` | ⛔ | 一趟**額外的完整場景 render**，而且鏡像矩陣用 **render 當下的 `scene.activeCamera`** 算。這一版最多 **4 顆相機**（四人分割畫面）而 RTT 每幀只 render 一次 ⇒ ⭐ **反射內容對其中 3 個玩家是錯的**。一個「對四分之一的人正確」的鏡子比沒有鏡子糟 |
| `ScreenSpaceReflectionPostProcess` | ⛔ | post-process 是**逐相機**掛的（`ArenaBackdrop` 與 `airScatter.ts` 檔頭已經為同一個理由否決過兩次）⇒ 分割畫面 **×4**，外加一趟 geometry/prepass |
| ⭐ **材質假鏡面** | ✅ | 一片低粗糙度（0.06）、半透明（0.72）、比地板深的薄圓盤。**沒有反射來源**（這個場景 `environmentIntensity = 0`，沒有 IBL）⛔ 但它不需要 —— 畫面上發生的是**主光／閃電在水面上的那一道高光**，而那正是「積水 ＋ 雷雨」裡玩家真的看得到的東西 |

實作：**一顆 mesh + thin instances**（同 `buildContactShadows` 的手法）⇒
一個 zone 的 N 片水窪是 **1 個 draw call**。邊緣淡出住頂點 alpha，⛔ 不是貼圖。
擺放是決定性雜湊（同 `expandSceneryProps`）⇒ 同一張圖每回合水窪在同一個地方。

### 4. 起霧 —— ⭐ **同一顆旋鈕轉大**，⛔ 不是第二套 fog

`Lighting.write()`：

```
density = (玩家的空氣漫反射開著 ? AIR_SCATTER_DENSITY : 0) + 這張圖的天氣加成
```

⇒ **一格機制、兩個來源**（基礎空氣感 ＋ 場地天氣），`scene.fog` 只有一顆。
顏色**繼續跟著主光走**（前一批做完的那一半原封不動）⇒ 雷雨場的霧隨閃電變色、
室內的霧偏場地自己的色調。兩格各自關得掉：關掉天氣霧，空氣漫反射還在。

#### ⚠️ 霧的上界是**玩法**界線（owner：「這個地圖是**全視野**，就算牆後也看得到」）

`fogTransmittance(density, d) = exp(−(d·density)²)`；政策常數
`FOG_MIN_TRANSMITTANCE = 0.35`（最遠對戰距離上敵人至少留下 35% 原色）。
⭐ 閘是一條**會紅的測試**，而且它**從出貨內容量距離**，⛔ 不抄字面值：

```
apps/client/src/render/weather.test.ts
  「最濃的霧在出貨場地量得到的最遠對戰距離上仍然看得到敵人」
  far = max(zone.boundaryRadius × 2) over content/arenas/*.json   → 目前 84（arena.royale zone-0，r=42）
  assert fogTransmittance(0.006 + Zod 的 fogDensityAtFull 上界, far) ≥ 0.35
```

Zod 上界 `0.006` 就是這條不等式反解出來的（`sqrt(−ln 0.35)/84 − 0.006 ≈ 0.0062`）。
⇒ 有人把霧調到上限，敵人仍然看得到；有人把 Zod 上界調大，**這條測試會紅**。

---

## ③ 逐場地判斷（13 張，⭐ 逐張列出理由）

| 場地 | 出貨天氣 | 判斷根據 | 信心 |
|---|---|---|---|
| `arena.castle` | `indoor-dry` | ⭐ **名字逐字**「城堡競技場（**室內**）」 | ⭐ 逐字證據 |
| `arena.colosseum` | `clear` | ⭐ **名字逐字**「羅馬大擂台（**室外**）」；天光 `#fff2d6` 晴天暖光 | ⭐ 逐字證據 |
| `arena.holy-grail` | `indoor-damp` | 「大聖杯**洞窟**」；天光 `#d8ffe0` 地底螢光綠 | 高（⭐ 滲水⛔ 不是雨） |
| `arena.infinity-castle` | `indoor-dry` | ⭐ `groundStyle: **tatami**`（榻榻米）＝室內的鐵證 | 高（它仍然**會閃電**） |
| `arena.nazarick` | `indoor-dry` | 「大**墳墓**」＝地下墓所；`obsidian` 地板 | 高 |
| `arena.royale` | `storm` | ⭐ 場地**自己**宣告 `wave: "storm"`＋**沒有**遠景層 ⇒ 露天 | 高 |
| `arena.shiganshina` | `rain` | 天光 `#cdd6e0` 是 13 張裡**唯一**的無彩度灰 ⇒ 作者已經把它畫成陰天 | 中（⚠️ 我的推論） |
| `arena.dota` | `clear` | 草地河道，天光 `#dff0ff` | 高 |
| `arena.world-tree` | `clear` | 櫻花／雲海遠景，天光 `#e0ffd8` | 高 |
| **`arena.frieren`** | `fog` | ⚠️ **判不出來**：「迷宮」像地牢，而遠景層是**山稜**（`peaks`）⇒ 兩邊都說得通。選「起霧」是因為**霧不需要室內/室外的判斷**，而且它**不濕** | ⚠️ **請 owner 勾** |
| **`arena.godie`** | `clear` | ⚠️ **判不出來**（沒有遠景層可參考）⇒ 填室外·無天氣（＝今天的行為） | ⚠️ **請 owner 勾** |
| **`arena.heavens-arena`** | `clear` | ⚠️ 原作是**塔內**擂台，而遠景層是 `cloudSea` + `lightning`（＝高空**露天**）⇒ 兩邊都說得通 ⇒ 走不濕的那一邊 | ⚠️ **請 owner 勾** |
| **`arena.skeleton`** | `clear` | ⚠️ 骨架 fallback，沒有身分 ⇒ 今天的行為 | ⚠️ **請 owner 勾** |

⭐ **判不出來的一律填了 `clear` / `fog`（兩者都不濕）** ⇒ 就算我把某張室內圖誤判成室外，
玩家也**不會**看到室內下雨。保守的方向是刻意的。
⭐ 每一列都是後台「場地天氣」那一頁的一格下拉選單，⛔ 改它不必動任何程式。

⚠️ **沒有列在表上的場地一律算 `clear`** ⇒ 一張新地圖不會因為忘了填而突然下雨。

---

## ④ 開關（⭐ 四格，各自可關）

### 玩家設定（`apps/client/src/settings/types.ts` → `graphics`，逐台）

| 欄位 | 出貨值 | 梯子上限（⭐ 推導，⛔ 不是字面值） | 減少動態 |
|---|---|---|---|
| `wetGround` | **`auto`** | `WET_GROUND_MAX_LEVEL` = 梯子**還沒放棄陰影**的最後一階（第 5 階） | ⛔ 不關（靜態） |
| `puddles` | **`auto`** | `PUDDLE_MAX_LEVEL` = `AIR_SCATTER_MAX_LEVEL`（解析度還沒被拉到固定預設地板以下，第 1 階） | ⛔ 不關（微光被關） |
| `lightningFlash` | **`auto`** | `LIGHTNING_MAX_LEVEL` = `MAX_ADAPTIVE_LEVEL`（⭐ 梯子永遠不關它，成本是兩個 float） | ⭐ **強制關**（光敏） |
| `weatherFog` | **`auto`** | `WEATHER_FOG_MAX_LEVEL` = `AIR_SCATTER_MAX_LEVEL`（⭐ 它**就是**同一顆 `scene.fog`） | ⛔ 不關（靜態） |

三態 `off / auto / on` 的判準抽成 `qualityTriStateEnabled()`（`render/airScatter.ts`），
⭐ 五格共用**一個**住處 —— ⛔ 五份各抄一次的話，漏掉 `if (setting === "on") return true;`
的那一格會變成「玩家明確打開了、而畫面上沒有」，而五格長得一模一樣沒有人看得出來。

⚠️ **生效時機（誠實版，⛔ 不是「下一場」）**：
霧與雷擊補光**立即**（`Lighting` 訂閱著 store）；
濕地面與積水**下一回合換圖**才生效（它們是建材質當下決定的常數）。這句話寫在設定頁上。

### 後台（`content/config/weather.json`，全域政策 + 逐場地表）

一頁 **「🌧️ 場地天氣」**（`apps/admin`，通用設定引擎）：13 格純量 + 1 張逐場地對照表。
`enabled: false` = 三樣全部回到這一版之前（⛔ 不影響閃電，那是場地自己的燈）。

---

## ⑤ 幀成本

⚠️ **沒有量到**，⛔ 我不編一個數字。這條 lane 不能連正式站，也沒有在這個環境裡跑起
WebGL/WebGPU 量幀。可以從程式碼讀出來的**結構性**事實：

| | 額外 render pass | 額外 draw call | 額外配置 |
|---|---:|---:|---|
| 濕地面 | **0** | **0** | 0（三個材質常數） |
| 雷擊補光 | **0** | **0** | 0（每幀兩個 float 乘法；`weatherPolicy()` 有 memo，⛔ 不每幀 spread） |
| 起霧 | **0** | **0** | 0（`scene.fog` 已經在跑） |
| 積水 | **0** | **每 zone 1**（thin instances） | 建場時一顆 mesh + 一顆材質；真正的成本是**透明混合的填充率** |

⭐ 這正是「光追的 1%」那句話的具體內容：⛔ 一趟額外的場景 render 都沒有。

---

## ⑥ 檔案

**新增**
- `packages/shared/src/content/schema/config/weather.ts`（schema + 級距表 + 純函式）
- `content/config/weather.json`
- `apps/client/src/render/weather.ts`（梯子上限 · 三態解析 · store · 純算術）
- `apps/client/src/render/weather.test.ts`

**改**
- `packages/shared/src/content/schema/config/index.ts`（import + union + re-export，各一行）
- `apps/client/src/render/airScatter.ts`（抽出 `qualityTriStateEnabled`）
- `apps/client/src/render/ArenaGround.ts`（濕地面材質 + `buildPuddles`）
- `apps/client/src/render/ArenaScene.ts`（推 arena.id 進 store + 把天氣傳給地板）
- `apps/client/src/render/Lighting.ts`（雷擊補光 + 霧濃度合流 + 訂閱）
- `apps/client/src/render/QualityController.ts`（`RenderParams.weather` + 推進 store）
- `apps/client/src/settings/types.ts`（`QualityTriState` + 四格 + clamp）
- `apps/client/src/ui/SettingsScreen.tsx`（四列 Segmented + 逐列說明）
- `apps/admin/src/configForms.ts` · `store.ts` · `ui/App.tsx`（後台一頁）

⚠️ `apps/admin/src/configForms.ts` 在我進場前**另一條 lane 已經改了 2 行**
（特效終極壽命 3 秒 → 4 秒的欄位說明）。它們會跟著我的 commit 一起上車 ——
逐檔 pathspec 擋得住「我把別人的東西送上車」的**反方向**，⛔ 擋不住同一個檔。

---

## ⑦ ⛔ 沒做到的，與原因

| 沒做 | 原因 |
|---|---|
| ⛔ **雨絲（降水粒子）** | ① `apps/client/src/vfx/**` 在柵欄外（⛔ 完全不准碰）；② ⛔ 不准下載任何貼圖／資產。⇒ 天氣目前是**地面與空氣**的，⛔ 沒有天上掉東西。`indoor-*` 那一格已經備好，雨絲做出來的那天直接吃它 |
| ⛔ **漣漪（水面波紋）** | 同上（需要可捲動的法線貼圖，而共用貼圖不可以就地捲 —— 會連地板一起捲）。⭐ 改成**微光呼吸**（`puddleSheenAmp`），而且它**誠實地叫微光不叫漣漪**（第一·五守則） |
| ⛔ **濕地面／積水的即時生效** | 它們是建材質當下的常數。做成即時要把每顆地面材質的基準色記下來再重套 —— 那超出這一批的測試預算，而地圖**每回合換**（#145）所以實際延遲是幾十秒。⚠️ 已經逐字寫在設定頁上 |
| ⛔ **`content/config/_index.json` / `bundle.json` 沒更新** | ⭐ `pnpm content:build` 是**全域鎖**，指示明說由主 session 最後統一跑。⚠️ **在它跑之前 `shippedBundleIsCurrent` 會紅**，這是預期的 |
| ⛔ **沒量幀成本** | 見 ⑤ |

---

## ⑧ 離開碼

| 指令 | 離開碼 |
|---|---:|
| `pnpm typecheck`（全 repo，兩次） | **0** |
| `npx vitest run`（client：weather / airScatter / ArenaGround / ArenaScene / settings） | **0**（98 passed） |
| `npx vitest run`（admin：configForms / configDocCoverage / configTables） | **0**（40 passed） |
| `npx vitest run`（shared：configUnionCoversDirectory） | **0**（3 passed） |

### 突變驗證（⭐ 一條，挑最承重的那一行）

把 `ArenaScene.buildArena()` 那一行的 `weather` 參數拿掉
（`buildZoneGround(scene, root, zone, zi, groundStyle, palette)`）
⇒ `weather.test.ts` 的「③ 接線」**紅**，訊息指名那一條。改回來（⭐ 用 `Edit`，
⛔ 不是 `git checkout <檔>`）。

⚠️ 那條測試刻意走 **`buildArena`** 而不是直接呼叫 `buildZoneGround` ——
後者對「ArenaScene 忘了把天氣傳下去」是**全綠**的（失敗形態③）。
