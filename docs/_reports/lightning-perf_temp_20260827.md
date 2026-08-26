# ⚡ #781 閃電效能深入分析（lightning-perf）— 2026-08-27

> owner 2026-08-27（逐字）：「**閃電演算法太過耗效能 請深入分析原因
> 特別是場上有飛鼠先生、拳四郎、皮卡丘都在的時候**」

⚠️ **量測環境誠實聲明**：本輪 lane 沒有瀏覽器工具。下面所有數字是
**NullEngine（Node v25.9.0，出貨程式碼、出貨參數）量到的 CPU 半邊**；
GPU fill-rate（加法混合 overdraw）與真瀏覽器 GC 節奏**量不到**，
未驗收，補拍指引在文末。量測腳本：scratchpad `lightning-bench_temp_20260827.ts`
（探測檔，未進 repo）。

---

## 一、三位英雄的閃電各自是什麼（出貨內容盤點，⛔ 不是猜的）

| 英雄 | 閃電來源 | 每次施放的量 |
|---|---|---|
| **飛鼠先生**（godie-udea） | R 65-04 天譴 `chainLightning`（sources 20 × jumps 16 × interval 0.05s） | ⭐ **320 個事件 → 320 次 strikeArc（960 條弧帶）＋ 320 次 layeredPop** |
| **皮卡娘**（godie-o00k，86-04 打雷絕招） | R 同款 `chainLightning`（20×16×0.05s） | 同上 320 跳 |
| **皮卡丘**（godie-ofar） | Q/E/EX/R/被動全是 `fx.prim.lightning.*` **施法電弧** | 每次施放 1–8 條弧帶。⚠️ `castArcs` 出貨預設 **false**（2026-08-23 owner「請你預設關閉」）—— 除非後台開著 |
| **拳四郎**（godie-umal） | R `fx.prim.lightning.pulse-lg`（施法電弧 burst 5） | 同上，受 `castArcs` 閘 |

⇒ **演算法成本的大頭在 `chainLightning`**（唯一不受任何開關管的閃電路徑）：
`case "chainLightning"` 每跳無條件 strikeArc（主幹＋2 分岔）＋ layeredPop。
三人同場的「三倍」主要是天譴/打雷絕招的施放重疊，加上（若後台開了 castArcs）
皮卡丘低冷卻技的每放一次 6–12 條弧。

## 二、票上四個候選熱點的逐一判決

| # | 候選 | 判決 | 證據 |
|---|---|---|---|
| ① | 每幀重建電弧幾何 | ⭐ **真，最大的可修項** | 每次 reshape 走 `CreateRibbon(instance)` ＝ 重算 `ComputeNormals`＋包圍盒＋builder 閉包，而**法線與包圍盒在這材質上零讀者**（`disableLighting`＋`alwaysSelectAsActiveMesh`）。一發天譴 = **2,183 次 reshape**（960 次 draw＋30Hz 重抖×活著的 32 條） |
| ② | 每發新 mesh/material 不進池 | ⛔ **排除** | 池化健在：一發天譴 960 條弧帶擠進 32 格池，materials 恆 = 32、particleSystems 恆 = 12（pool 4/key×3 key）、粒子峰值 328 顆 —— 上限全部咬住 |
| ③ | fanout 每 hop 一事件 | **真但刻意，⛔ 不可修** | 事件數恆等於跳數（320/次），這是 owner 2026-08-20 的設計（「每個閃電有極小的時間間隔…剛好可以避免計算上限」）——尖峰攤平靠的就是逐跳。線路成本已記在 `eventFanout.ts` 的預算註解 |
| ④ | AdaptiveQuality 無電弧階梯 | **真** | `QualityController` 零處提到 arc；弧帶路徑完全不讀 `particleDensity`（pop 那半有讀）。⇒ 本輪補的是**手動**上限旋鈕；自動階梯留給 #614 那條線 |

## 三、量到的（NullEngine CPU；60fps 模擬、出貨天譴排程 20×16×2tick cascade）

### 單元成本（修法前 → 修法後）

| 單元 | 前 | 後 | Δ |
|---|---|---|---|
| `ArcBoltFx.reshape`（一次就地重算） | **5.98 µs**（churn ~0.64KB） | **1.36 µs**（churn ~0.02KB） | **−77%，垃圾 −97%** |
| `ArcBoltFx.strike`（主幹＋2岔） | **19.36 µs** | **9.04 µs** | **−53%** |
| `arcBoltSpec`（每 strike 一次） | 0.36 µs | 不變 | — |
| `impactRecipe('light')`（每 hop ×2） | 2.6 µs | 不變 | — |

### 一發 65-04 天譴（216 幀 / 3.6s 合計）

| 相位 | 前 | 後 |
|---|---|---|
| 事件消費（strike＋pop fire） | 21.2 ms | **14.9 ms** |
| `arcs.update`（30Hz 重抖） | 10.8 ms | **3.8 ms（−65%）** |
| `composer.update` | 0.4 ms | 0.3 ms |
| `scene.render`（32 ribbon mesh＋12 粒子系統的引擎端） | 108.2 ms | 98.3 ms |
| 平均每幀 | 0.65 ms | **0.54 ms** |

三發錯開 0.3s（三人同場上界）：事件消費 39.2→24.6 ms、arcs.update 7.0→4.1 ms；
**池上限讓 render 端不隨施放數線性長**（32 mesh 恆定）——線性長的是事件端，而它砍半了。

### ⭐ 分析出的結構性事實（比單一數字重要）

1. **960 條弧帶擠 32 格池** ⇒ 平均每條只活 ~1/3 壽命就被搶。畫面上永遠只有
   32 條，**多出來的 draw 是純 CPU 浪費**——這浪費隨跳數/施放者數線性長。
2. 弧帶的 CPU 大頭本來在「為零讀者算法線」（reshape 的 ~77%）—— 已修。
3. pop 那半（每 hop 一次 3 系統 burst）粒子峰值 328 顆、受 `particleDensity`
   品質階梯管 —— CPU 端次要；**GPU 端（1.15u 白熱閃 quad × 每秒 ~300 發）量不到**。

## 四、修了什麼（commit 見票）

1. **`ArcBoltFx.reshape` 直寫頂點**：跳過 `CreateRibbon(instance)` 的
   ComputeNormals＋包圍盒重建，逐 float 寫進預配的 `Float32Array` →
   `updateVerticesData`。佈局（path-major）拿 **Babylon 自己的 instance 路徑**
   當參考逐 float 比對（守衛 `arcReshapeDirect.test.ts` ①，突變驗證：拿掉
   `updateVerticesData` 那行 → 紅）。`freezeNormals()` 讓未來任何人走回舊路也
   結構上跳過法線。
2. **後台一格上限**：`config.vfx-families@1.maxConcurrentArcs`（4–128，出貨 32
   ＝原寫死值，畫面逐位元組不變）。三住處：`content/config/vfx-families.json`
   ＋ `schema/vfx.ts`（Zod＋`DEFAULT_MAX_CONCURRENT_ARCS`）＋ admin
   `vfxForge.ts`（鑄技工坊全域欄位）。接線 `ContentDb.load()` —— 存檔重載內容
   即生效。守衛 `arcReshapeDirect.test.ts` ②（防死旋鈕＋界外夾回＋留白回預設）。

**rollback**：後台把 `maxConcurrentArcs` 留白/填 32 ＝ 上限回出貨；
直寫頂點那半是逐 float 等值的純效能重構（守衛釘住），單一回頭點 = revert 本 commit。

## 五、⛔ 未驗收的那一半 —— 主 session 補拍指引

真瀏覽器的幀時間 A/B 與 GPU 半邊本輪拍不到。補拍法：

1. 開 `public/chain-lightning-audition.html`（出貨 sim→VfxSystem→ArcBoltFx 全真路）。
2. DevTools Performance 錄 5s，`cast()` 後 `step()` 連續推進，讀
   **frame time 分佈**與 GC 次數；對照組 = 切到修法前 commit（或後台把
   `maxConcurrentArcs` 調到 4 看上限的效果方向）。
3. 量三人同場：audition 世界只有天譴 —— 用真比賽（本機房間）挑
   飛鼠先生＋皮卡娘＋皮卡丘，訓練假人 20 隻，連放 R，錄同一組指標。
4. 指標：p95 frame ms、Minor GC 次數/秒、`scene.meshes` 中 `vfx-arc` enabled 數
   （應 ≤ maxConcurrentArcs）。

## 六、順手發現（⛔ 未修，按規矩留給 owner 排序）

- **`ArcBoltFx.ensureMesh` 的 UV 佈局假設錯誤**：註解稱頂點交錯，實測（Babylon
  來源＋`chainLightningArc.test.ts`）是 path-major ⇒ 那組 UV 的 v 沿弧鋸齒。
  今天無讀者（材質刻意不掛貼圖）＝零影響；哪天把橫截面貼圖接回來會咬人。
  已在原地加警告註解，⛔ 未改行為。
- **`HitSpark` 每 hop 算兩次 `impactRecipe`**（`composer.fire` 裡一次、ctor 裡
  又一次，各 ~2.6µs＋~1KB）：可把 fire 的 recipe 傳回共用，省一半。次要。
- `case "chainLightning"` 的**每 hop layeredPop** 沒有自己的節流（僅靠 pool
  4/key 擋）；若真瀏覽器量到 pop 的 GPU 佔比高，下一格旋鈕應該開在這裡。
