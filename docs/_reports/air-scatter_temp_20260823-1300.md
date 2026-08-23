# GH#610 空氣漫反射 —— lane G 完整報告（2026-08-23）

## owner 的原話（⛔ 逐字，⛔ 不改寫）

> 「如果**規格高的客戶端環境**，還可以加上**空氣漫反射的效果，增加質感** （**可開關**）」

三個約束：**只在規格高的環境** · 目的是**質感**（⛔ 不是玩法） · **可開關**。
⚠️ 這份報告裡除了上面那一行以外的每一句都是**我的推測／我挑的**（CLAUDE.md
第一守則：沒有引言格式的句子預設是我的）。

---

## ① 盤點：`@babylonjs/core` 手上有什麼（⛔ 沒有下載任何套件／貼圖）

| 候選 | 每幀成本 | 結論 |
|---|---|---|
| `VolumetricLightScatteringPostProcess`（god rays） | **多一整趟場景 render**（遮罩 RTT，預設 0.5 解析度）＋ radial blur pass | ⛔ 否決。俯角 68° + FOV 45.8° ⇒ **太陽永遠不在畫面裡**（`shared/map/backdrop.ts` 檔頭已經為了同一個理由否決過天空盒），沒有光源在螢幕上就沒有光軸；而且 post-process 是**逐相機**掛的 ⇒ 四人分割畫面 ×4 |
| `ScreenSpaceReflections` | depth pass + reflection pass | ⛔ 否決。它是**表面**反射，⛔ 不是空氣散射 —— 答非所問，而且它是這三個裡最貴的 |
| `DefaultRenderingPipeline`（bloom/DOF） | 至少 2–4 個 pass | ⛔ 否決。bloom 是**光暈**不是空氣；而且 `LoginScene` / `IntermissionScene` 已經在用它，那兩個場景是**靜態展示**，跟一場 8 人混戰的預算不同 |
| ⭐ `scene.fog`（EXP2，aerial perspective） | **零個額外 pass** —— 材質多一個 `FOG` define，每像素一次 `exp(-(d·k)²)` 內插 | ⭐ **選它** |

### 為什麼是霧（判準：質感提升 ÷ 幀成本）

1. ⭐ **這條 render 路不是 Babylon 的 `runRenderLoop`**（`render/Renderer.ts` 檔頭逐字說了，
   GameApp 用自己的 rAF 驅動 `scene.render()`）。霧是 **scene 層級的狀態**，
   ⛔ 不必掛在任何一顆相機上、⛔ 不必接進任何 pipeline ⇒ 它是唯一**不動到現有幀序**的做法。
2. ⭐ **分割畫面免費**：多顆相機共用同一個 scene ⇒ 霧一次涵蓋全部；post-process 是 ×N。
3. ⭐ **`ArenaBackdrop` 的遠景層直接受惠**：那是平躺在圓盤外的 2D 環，離相機最遠
   ⇒ 最先被空氣洗淡。「有景深的背景」這件事本來是用 3–4 層 mesh 硬做的，
   霧讓它多拿到一層**真的距離感**，⛔ 沒有多一個 draw call。
4. ⭐ **它會跟著 GH#362 那個會動的光走**：空氣的顏色 = 天光（`palette.sky`）往
   這一刻的主光色混一點 × 這一刻的補光強度 ⇒ 雷雨場的空氣會隨閃電變色，
   ⛔ 不是 13 張圖共用同一片灰。

---

## ② 幀成本：⛔ **沒有量到**（誠實回報）

- ⛔ `NullEngine` 量不到 —— 它根本不編 shader、不畫像素。
- ⛔ 沒有跑瀏覽器實測（需要 dev server + 內容，而且這一版是併行 lane，
  `content:build` 是全域鎖 ⇒ ⛔ 不能跑）。
- ⭐ **結構上可以說死的兩件事**（⛔ 這不是量到的數字，是架構事實）：
  - **每幀零個額外 render pass、零個額外 draw call、零個 RTT** ——
    霧是既有材質 shader 裡的一個 define，⛔ 不是一趟新的繪製。
  - **唯一真正的成本是切換的那一下**：`scene.fogMode` 一改，Babylon 會在
    `PrepareDefinesForMisc` 讓所有材質重編 shader ⇒ **一次性 hitch，玩家按下去才發生**。
- ⇒ 我沒有替它編一個 ms 數字。要量的話正確做法是在瀏覽器裡開 `perfBus.workMs`
  的 overlay，把那一格 on/off 各跑 30 秒比 p95。

---

## ③ 落地

| 檔 | 做了什麼 |
|---|---|
| `apps/client/src/render/airScatter.ts`（新） | 純模組：`airScatterEnabled()`（三態 × 畫質預設 × 梯子階） + `airScatterFog()`（天光×主光→霧色）。⛔ 零 Babylon |
| `apps/client/src/settings/types.ts` | `AirScatterSetting` 三態 + `GraphicsSettings.airScatter` + 出貨值 + `clampGraphics` |
| `apps/client/src/render/QualityController.ts` | `RenderParams.airScatter`（**解析過後**的布林）＋梯子接線 |
| `apps/client/src/render/Lighting.ts` | 套用：跟兩盞燈**同一個寫入點** `write()`；訂閱 qualityController，掛 `scene.onDisposeObservable` 自我解除 |
| `apps/client/src/ui/SettingsScreen.tsx` | Graphics 區塊 Antialiasing 下面一格 Segmented + 三種狀態各自的說明 |

### ⭐ 我挑的預設（⛔ 我沒有列表去問 owner —— owner 2026-08-23「沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback」）

| | |
|---|---|
| **那一格叫什麼** | 設定頁 → **Graphics → 空氣漫反射 (Air scatter)**；程式裡是 `settings.graphics.airScatter` |
| **三態** | `off` / **`auto`（出貨值）** / `on` |
| **為什麼是 `auto` 不是 `on` 也不是 `off`** | owner 的話是「規格高的環境**還可以**加上」—— 那是一個**條件**，⛔ 不是一個布林。`auto` 就是把那個條件寫下來 |
| **`auto` 的意思** | 畫質預設是 **High 或 Auto**（Low/Medium＝玩家自己說過「這台不行」）**而且**適應梯子還沒開始割解析度 |
| **`on`** | 一律開，⛔ 梯子不能翻案（跟固定預設拿到 `FIXED_PRESET_RES_FLOOR` 保護同一個道理：那是玩家對畫質的明確宣告） |
| **rollback** | 一次點擊：那一格轉到 `off` |

### 接 `AdaptiveQuality` 的那一階是**推導的**，⛔ 不是字面值

```ts
export const AIR_SCATTER_MAX_LEVEL = ADAPTIVE_LADDER.reduce(
  (last, rung, i) => (rung.resolutionScale >= FIXED_PRESET_RES_FLOOR ? i : last), 0);
```

＝「解析度還沒被拉到固定預設地板以下」的最後一階（出貨梯子上是第 1 階，
解析度 0.85）。梯子再降一階代表這台機器已經在為 fps 割肉 ⇒ 質感讓位。
⭐ owner 哪天調梯子，這個門檻自己跟著動，⛔ 不必改程式。

⚠️ 另外一個接線細節：梯子沒在管事時（固定預設 + 關掉動態解析度）餵 **0**，
⛔ 不是 `adaptive.level` —— 那個值會停在上一次它還在管事時的那一階，
於是玩家關掉動態解析度之後，空氣會被一個**沒有人在更新**的數字關著。

---

## ④ `prefers-reduced-motion`：⭐ 確認過，**這個效果不會動**

- 霧本身是**靜態的**（一層隨距離的 haze），⛔ 沒有自己的動畫、⛔ 沒有粒子、⛔ 沒有閃爍。
- 它唯一隨時間變的輸入是 `sceneryLightAt()` 那一幀的光 —— 而那個波形**已經**被
  兩道既有的閘管著：後台政策 `arenaScenery.animateLights`，以及 `wave: "none"`。
  ⇒ **關掉會動的光，空氣也跟著靜止**（因為它讀的是 `animated ? tSec : 0` 的同一個取樣）。
- ⇒ ⛔ 不需要第二條 reduced-motion 的路。加一條反而會出現「兩個地方各自決定要不要動」。

---

## ⑤ 守衛（體驗層預算：測試 61 行 ≤ 實作 115 行，且 ≤80 ✅）

`apps/client/src/render/airScatter.test.ts` —— 兩條，⛔ 一個數字都不驗
（濃度／混色比例／天光色都是可調的質感值）：

1. **「規格高」那個條件本身**：`auto` 在 High/Auto 且梯子 ≤ 門檻時開；
   梯子再降一階 → 關；Low/Medium 預設 → 關；`off`/`on` 梯子不能翻案。
2. ⭐ **那一格真的接到出貨的場景上**：`NullEngine` + 真的 `setupLighting(scene)`，
   讀 **`scene.fogMode` 這個最終物件**（⛔ 不是 RenderParams 上的布林 —— 那是第⑤號
   失敗形態「被測的不是出貨的那個」），並且真的透過 `settingsStore.patchGraphics()`
   走完整條 seam（store → QualityController → Lighting → scene）。

**突變驗證（一批一條，做在最承重的那條線上）**：
`Lighting.write()` 裡那段 `if (scatter) { … }` 換成 `void scatter;` →
`airScatter.test.ts` 第②條紅（`expected 2 to be 0`，指名 `scene.fogMode`）→ 改回。

---

## ⑥ 指令離開碼

| 指令 | 離開碼 | 備註 |
|---|---:|---|
| `npx vitest run apps/client/src/render/airScatter.test.ts` | 0 | 3 tests ✅ |
| （突變）同上 | 1 | ⭐ 預期的紅，指名 `scene.fogMode` |
| `npx vitest run <airScatter + arenaScenery + AdaptiveQuality + settings/ + SettingsScreen.gore + RenderConfig>` | **0** | 8 檔 52 tests ✅ |
| `pnpm typecheck` | 1 | ⭐ **`apps/client typecheck: Done`（我的 lane 乾淨）**。唯一的紅是 `apps/admin/src/mobWavesSave.test.ts` 少三個 `MobWavesFieldKey` —— **lane Z 的檔，⛔ 在我的柵欄外，⛔ 不是我造成的** |
| `npx vitest run apps/client/src/architecture.test.ts clientGlobalsBoundary.test.ts` | 1 | ⭐ 唯一的違規是 **`vfx/AmbientVfx.ts` import 了 RoomStore** —— **lane T 的檔，⛔ 在我的柵欄外**。我的檔全部過（`Lighting.ts` 只 import `QualityController`） |

---

## ⑦ ⛔ 沒做到的部分與原因

| 沒做 | 為什麼 |
|---|---|
| **實機幀成本數字** | ⛔ 量不到（headless 沒有 GPU；併行 lane 不能起 content build）。⛔ 我沒有編一個數字 |
| **濃度滑桿** | 刻意不做。owner 要的是「**可開關**」，一格三態就滿足；再開一條滑桿是多一個沒有人會轉的旋鈕（第零守則）。⭐ 濃度是 `AIR_SCATTER_DENSITY` **一個住處**，要開滑桿隨時是一行 |
| **場地各自的空氣濃度（`content/arenas/*.json`）** | ⛔ 柵欄外（arena 內容不歸這條 lane），而且它是**下一步**不是這一步：先確認質感方向對，再讓 owner 逐圖調。⚠️ 顏色**已經**跟著場地走了（讀 `palette.sky` + 這一刻的主光） |
| **god rays / SSR** | 上面盤點裡的兩個否決，理由已列 |
| **`AmbientVfx` / `admin` / `content/config` 的任何改動** | ⛔ 柵欄外（lane T / Z / K） |
