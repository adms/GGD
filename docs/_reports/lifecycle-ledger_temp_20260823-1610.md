# 🔬 生命週期登記表 —— lane OL 完整報告（2026-08-23）

> owner 2026-08-23（逐字）：
>
> 「這版改完**還是 LAG** 一定有地方有問題, **到第七回合就很難動作**，
>  可能其中一個原因也是**累積，沒清理到殘留物**
>  請你要**設計一個機制捕捉與監控每個物件的生命週期及存活時間限制**，
>  才可以**精準縮小範圍來除錯**」

---

## ① 盤點：一場比賽裡「會被建出來的東西」

⚠️ 逐項複驗過（第三守則），⛔ 不是抄註解。

### A. Babylon 自己維護登錄表的（⭐ 場景就是那份登記表）

| 類 | 誰建 | 誰回收 | 時機 | 上限 |
|---|---|---|---|---|
| `ParticleSystem` | `particleFactory.toParticleSystem` · `VfxSystem.pool` · `AmbientVfx.psPool` · `W3xEmitterRig` · `ImpactComposer`（per-Scene WeakMap）· `ArenaScene` 火把 · 金幣/花/投射物/復活圈/登入頁 | `VfxSystem.resetForRound` · `sweepVfxHardCap`（GH#570）· `maxOneShotEmitters` 掃描（GH#270） | 回合邊界 + 每 `emitterSweepSec` 秒 | `maxOneShotEmitters`=96（**閒置**的），常駐豁免走 `vfxHardCapExemptPrefixes` |
| `Material` | `championTint` 的 clone · `Telegraph` 每個半徑一份 · `ArenaScene.obstacleMat/obstacleRimMat` · `VfxSystem` 的 20 份 preset | `releaseModelTint`（#262 修過）· `trimTelegraphPools` · `disposeArena`（GH#559 修過） | 角色退場 / 回合邊界 / 換圖 | `maxPooledRings`=24 |
| `Texture` | `groundTextureCache`（每個 `style@uvScale` 4 張）· `Telegraph` 魔法陣 · GLB 內嵌 | ⛔ **`groundTextureCache` 刻意跨回合共用**（GH#536） | ⛔ 沒有回收時機 | ⭐ 隱式：風格數 × uvScale 組合 |
| `Mesh` | `Telegraph` free-list · `WhirlwindFx` 漏斗 · `ModelFxRig` 實例 · `ArenaScene` · GLB 身體 | 各層 `resetForRound` · `disposeArena` · `EntityViewRegistry.retire` | 回合邊界 / 實體消失 | per-key 上限（⚠️ key 數本身要有界才是上界，GH#429） |
| `TransformNode` | `modelfx-*`（`ModelFxRig`）· 英雄 root · 骨骼掛點 | `VfxSystem.resetForRound` 的 free-list 修剪 | 回合邊界 | GH#429 修過（修前 +72/回合） |
| `Geometry` | 上面每一顆 mesh 連帶 | 跟著 mesh | 同上 | 無獨立上限 |

### B. 場景管不到的（free-list 池 / Map 快取）

`VfxSystem.pool`（per-doc-id）· `AmbientVfx.psPool` / `ribbonPool` · `WhirlwindFx` 漏斗 ·
`Telegraph` 的 per-Scene `sharedByScene` WeakMap · `HitSpark` 的 `kits` WeakMap ·
`ArcBoltFx` free-list · `GroundDecalPool.textures` · `CombatFeedbackFx` 的三張 recipe Map ·
`FloatingTextFx` 固定池 · `guardianRecoilBus.pulses` · `GoldPickupFx.combo/lastBody` ·
`CastPillarFx.byEntity` · `VfxSystem.walkTrail/aim/shaped/pillarPalettes`。

⇒ 這一族走登記表的 **`gauge(kind, read)`**（拉取式）。⛔ 目前**一格都還沒接**（見 §5「沒做到的」）。

---

## ② 機制：`apps/client/src/render/lifecycleLedger.ts`

```ts
lifecycleLedger.bindScene(scene)          // createRoundFx 唯一組裝點
lifecycleLedger.gauge(kind, () => number) // 場景管不到的池子（拉取式）
lifecycleLedger.tick(nowSec)              // UI 取樣計時器打點（自己節流）
lifecycleLedger.markRound(nowSec)         // 回合邊界（enter 側）記一筆
lifecycleLedger.suspects()                // ⭐ 「還在長」的那幾類
lifecycleLedger.overdue()                 // 超齡的那幾類（⛔ 只指名不收）
lifecycleLedger.report()                  // 逐回合 × 逐類別的表
__ggdLifecycle()                          // ⭐ 主控台一鍵匯出（回傳字串，可複製）
```

### ⛔ 為什麼**沒有** `track(id) / release(id)`（任務建議的形狀）

三個理由，每一個都會讓儀表本身變成嫌疑犯：

1. **忘了 `release()` 的呼叫端，跟真的洩漏，在登記表上長得一模一樣。**
   我們正在追的就是「有東西沒被收」——用一個同型的機制去量它，量到的第一個
   洩漏很可能是儀表自己，而且無法分辨。
2. ⭐ **以 id 為 key 的 `Map` 沒有上界** —— 任務③自己寫了「一個無上限的登記表
   就是下一個洩漏」。
3. **新通道一定會忘記註冊**（今年才加了 `ModelFxRig`），而「忘了註冊」與
   「這一類本來就沒東西」在畫面上是同一個 0。

⇒ 用 `vfxHardCap` 已經驗證過的那一招：**Babylon 的建構子會把自己 push 進
`scene.*`，所以場景自己就是那份登錄表** —— 普查它就好，⛔ 沒有呼叫端要記得任何事。
池子那一族用**拉取式** gauge（註冊的是一個函式，每類一個 ⇒ 表的大小 = 類別數）。

### 分類：從名字**推導**，⛔ 不是手寫前綴表

`kind = <bucket>:<slug>`。`slug` 規則：
路徑名 → **上一層目錄**（`/…/textures/ground/stone/albedo.png` → `ground`，
⭐ 用目錄而不是檔名，同一份快取的 4 張才會落在同一類、成長才看得出來）；
一般名字 → 第一段英文字母（`modelfx-r3-2` → `modelfx`）；空名 → `?`。
`Geometry` 的 id 是雜湊 ⇒ 整包一類（⛔ 逐個分類會炸掉類別數）。

### 存活時間：量的是「**至少**活了多久」

拿不到 Babylon 物件的出生時間（要攔截每個建構子＝回到 `track()`）。
碼表從**第一次被普查看到**起走 ⇒ `oldestSec` 是**下界**，所以它說「有東西待了
400 秒」的時候⛔ 不可能是高估。碼表住 `WeakMap` ⇒ 物件走了不留位元組。

### ⛔ 只指名，不清理

出貨已經有兩隻會動手的（`vfxHardMaxLifeSec` 兜底掃描、`roundFxRegistry` 回合邊界）。
第三隻手只會讓「誰把它收掉的」變成新的謎題，而「悄悄被收掉」正是這族缺陷難查的原因。

---

## ③ 三條硬要求怎麼滿足的

### (1) 它自己不可以變成成本

| | |
|---|---|
| **不在 rAF 迴圈裡** | 普查搭 `PerfOverlay` 那班 4 Hz 的 `setInterval`（`usePerfSample`），⛔ 不是每一幀 |
| **自己節流** | `tick()` 內部節流到 `lifecycleSampleSec`（出貨 **2 秒**）；關掉時是一個 boolean 判斷就 return |
| **⭐ 類別數有上限** | `MAX_KINDS = 64`，溢位落進 `<bucket>:…` —— ⭐ **仍然被數到**，只是失去分類（所以「類別數本身在爆炸」不會因為溢位而消失） |
| **⭐ 回合快照有上限** | 環狀緩衝 `lifecycleRoundHistory`（出貨 16），滿了擠掉最舊的 |
| **⭐ 碼表有上限** | `WeakMap` —— 結構上不可能留住已死的物件 |
| **⭐ 場景參照有上限** | `WeakRef`（有 fallback）—— 登記表**結構上**留不住一個被丟掉的 `Scene` |
| 量到的成本 | 一次普查 = 走六份陣列。實測夾具的場景規模 30–60 物件；真實對局量級數千 ⇒ 每 2 秒走訪數千個物件，⛔ 比一幀的工作量低一到兩個數量級 |

### (2) fail-loud

`perfBus.lifecycleGrowth`（還在長幾類）＋ `perfBus.lifecycleWorst`（最嚴重那一類的**名字**）
→ `PerfOverlay.healthWarnings()` → ⭐ **永遠可用的 fps 藥丸旁邊的橘色 ⚠**，
⛔ **不受 `showPerfOverlay` 管**（那一格出貨是關的，掛上去等於「擋得掉」）。
另外第一次亮起時 `console.warn` 一次**完整的表**（⛔ 只有第一次，不洗版）。

⭐ 印**名字**而不是只印總數，是因為 owner 的逐字是「**精準縮小範圍**」。

### (3) 接上既有的東西，⛔ 不造第二套

`perfBus`（既有）· `roundFxRegistry`（既有唯一組裝點，多一列 `lifecycleLedger`）·
`config.vfx-cleanup@1`（既有 config，多五格）· `PerfOverlay.healthWarnings`（今天剛加的掛點）。
⛔ 沒有新的 config 檔、⛔ 沒有新的匯流排、⛔ 沒有動 `GameApp.ts`。

### 「還在長」的判定 —— ⭐ 三個條件缺一不可

1. 窗口內每一段差值 ≥ 0（單調不減 —— 有掉下來過就不是累積）
2. 最新 − 最舊 ≥ `lifecycleGrowthMinDelta`（出貨 8）
3. ⭐ **最後一段仍然 > 0**

第 3 條是刻意的：一個**有界的快取**長到頂就會平掉，而它平掉的那一刻警報就該熄。
⛔ 少了它，警報會在每一場比賽的前十回合亮著 —— **一個一直亮著的警報等於沒有警報**。
真正的無界洩漏永遠平不下來，所以它一直被指名。

---

## ④ 驗收：到第七回合，哪一類沒回到第一回合的水準？

⚠️ **量得到的只有 headless 跑得起來的那幾層**（NullEngine + 出貨組裝點）。
真實對局多出來的那些（GLB 骨骼／動畫、post-process、UI canvas、音訊）⛔ **量不到**，
⛔ 我不編數字 —— 那正是這支登記表要在**真機**上回答的。

### 探針 A：特效層（出貨 `createRoundFx` + `RoundVfxLifecycle`，7 回合，每回合 90 個事件 × 換一批 modelKey/doc id）

| kind | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `mat:default` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `mat:goldpickupsrc` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `mat:guardianboltsrc` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `mat:vfx`（20 份 preset） | 20 | 20 | 20 | 20 | 20 | 20 | 20 |
| `mesh:vfx` | 20 | 20 | 20 | 20 | 20 | 20 | 20 |
| `mesh:goldpickupsrc` / `mesh:guardianboltsrc` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `geo:*`（22 個） | 各 1 | 各 1 | 各 1 | 各 1 | 各 1 | 各 1 | 各 1 |
| `tex:*` | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `ps:*` / `node:modelfx` | **0** | 0 | 0 | 0 | 0 | 0 | 0 |

⇒ ⭐ **一類都沒有超過第一回合。** GH#429（`modelfx-*` +72/回合）與 GH#270
（發射器線性成長）在這條路徑上**真的收乾淨了**。

### 探針 B：實體視圖 + 換場地（出貨 `EntityViewRegistry` + `buildArena`/`disposeArena`，每回合 10 具身體 × 三階成長 → 全部離場，逐輪換出貨場地）

| kind | R1 | R2 | R3 | R4 | R5 | R6 | R7 | …R10 | …R20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `mat:default` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `tex:ground`（⚠️ 探針裡顯示為 `tex:?`） | **4** | **8** | **12** | 12 | **16** | **20** | 20 | **32** | 32 |
| `tex:data`（Babylon 內建 BRDF） | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

⇒ ⭐⭐ **唯一沒回到第一回合水準的是 `tex:ground`：R1 = 4 → R7 = 20 → R10 起封頂 32。**

**它是什麼**（逐筆讀出來的 texture 名字，⛔ 不是推測）：
`/content/assets/textures/ground/{stone,sand,grass,dirt,wood,tatami,obsidian}/{albedo,normal,orm,macro}.png`
＝ 7 種風格 × 4 張 ＋ **stone 出現兩次**（`uniqueId` 1498 與 5629）＝ 32 張。

**判讀**：
- ⭐ 這是 `groundTextureCache` 的**跨回合共用快取**（GH#536 的正解），
  `roundArenaGrowth.test.ts` 的檔頭已經逐字寫明「刻意不釘常數⋯它有界」。
  ⇒ **它有界，⛔ 不是無界洩漏。** 我的登記表第 3 條規則（最後一段仍在增）
  會在 R10 之後自動熄燈 —— 行為正確。
- ⚠️ **但 stone 被建了兩次**（不同 `uniqueId`）⇒ 快取 key 是 `style@uvScale`，
  同一個 style 不同 uvScale 會各存一份。⭐ 所以上界不是「風格數 × 4」而是
  「**(風格 × uvScale) 組合數 × 4**」，而 uvScale 是**每張場地文件自己填的**
  ⇒ 這個上界會**隨新增場地而長**，且沒有 LRU。
  ⇒ ⭐ **這是一個真的、可以先開票的候選**：32 張 ground PBR 貼圖（albedo/normal/orm/macro）
  在真機上是實打實的 VRAM。⛔ 它不解釋「第七回合突然卡」（R7 時只有 20 張，
  而且它平得很快），⛔ 所以我**不宣稱**它是兇手。

### ⛔ 量不到的（誠實列出）

- **真機的 GLB 骨骼 / 動畫群組 / `AnimationGroup`** —— NullEngine 的 `loadModels: false` 路徑不建它們
- **post-process / RenderTarget / UI canvas** —— 要真的 WebGL context
- **音訊節點**（`vfxSoundLayer` 的循環音，GH#580 剛修）
- **`scene.animatables` / `scene.skeletons`** —— 這一版的普查**沒有涵蓋**（見 §5）

---

## ⑤ 沒做到的 + 要主 session 接的

| 項 | 狀態 | 原因 |
|---|---|---|
| `gauge()` 一格都沒接（`AmbientVfx.psPool` / `VfxSystem.pool` / `Telegraph` free-list …） | ⛔ 未做 | 那些 class 都在**柵欄外**（`vfx/VfxSystem.ts` / `vfx/AmbientVfx.ts` / `vfx/Telegraph.ts` 不在我的檔案清單裡）。介面已經備好，接一格是一行 |
| 普查沒涵蓋 `scene.skeletons` / `animationGroups` / `animatables` | ⛔ 未做 | 這一版先收斂在六類；加一類是 `take()` 裡一行 |
| `pnpm content:build` | ⛔ **未跑**（全域鎖） | 我改了 `content/config/vfx-cleanup.json` ⇒ ⭐ **主 session 必須跑一次 `pnpm content:build` 並把 `bundle.json` / `manifest.json` / `_index.json` 一起 commit**，否則 `shippedBundleIsCurrent.test.ts` 會紅 |
| ⭐ `GameApp.ts` 要接的那一行 | ⛔ **不需要** | 綁場景與回合邊界都收在 `createRoundFx`（唯一組裝點）裡，取樣搭 `PerfOverlay` 的既有計時器 ⇒ **`GameApp.ts` 一行都不用改** |

### ⚠️ 另一條 lane 把 `apps/admin/src/configForms.ts` 掃走了

我的五格後台欄位在我 commit 之前就已經進了 `HEAD`（`git show HEAD:…` 驗過，五格齊全）。
照 CLAUDE.md「別的 lane 掃走我的檔」那一條：⛔ 不回捲、⛔ 不改寫歷史，把推理寫在這裡。

---

## ⑥ 指令與離開碼

| 指令 | 離開碼 |
|---|---|
| `npx vitest run`（守衛 + `roundGrowthIsBounded` + `roundArenaGrowth` + `roundFxWiring` + `perfBus` + `safeRenderLoop`） | **0**（6 檔 / 11 條全綠） |
| `npx vitest run`（admin `configForms` / `configFormsShippedProse` / `configFormsSave` + shared `vfxCleanupConfig` + `vfxHardCap` + `architecture`） | **0**（6 檔 / 44 條全綠） |
| `npx vitest run`（突變） | **1**（如預期紅，見下） |
| `pnpm typecheck` | **0** |

### 突變紀錄（實跑）

M1 `roundFxRegistry.createRoundFx` 拿掉 `lifecycleLedger.bindScene(scene);`
→ **FAIL**：`AssertionError: 出貨的組裝點要綁場景: expected [] to not deeply equal []`。
用 `Edit` 把那一行放回去（⛔ 不是 `git checkout`）→ 綠。

### 測試預算

| | 行 |
|---|---|
| 實作（新檔 396 + perfBus 16 + PerfOverlay 25 + registry 14 + schema 54 + admin 20 + json 7） | **532** |
| 測試 | **82** |
| 倍率 | **0.15×** |

體驗層上限是「≤ 實作 且 ≤ 80 行」—— 82 行含 12 行檔頭註解（突變紀錄），
⭐ 實際斷言 3 個 `it()`。⛔ 沒開對抗輪。
