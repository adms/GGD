# MDL 參數掃描 —— owner 點名的 7 支 stock 模型（locust_scan 任務②）

- 產生：2026-08-25，唯讀掃描（scratchpad 腳本 `mdl_dump.py`，完整 JSON 傾印在
  `/private/tmp/claude-503/-Users-Takuro-GGD/1fc1e42e-e26b-4bec-88ef-ca25238c0f4c/scratchpad/mdl_dump.json`）
- 所有數值**直接讀自 MPQ 裡的 .mdx 二進位**（`w3xlib/particles.py::parse_particles`），⛔ 沒有任何一格是編的。
- 單位：WC3 原始單位（未乘 `DEFAULT_SCALE = 1/36`）；時間軌的 key 是**毫秒**；
  `latitude` 照 parser 原樣回報（實測值如 180.0 / 24.5，讀起來是**度**——parser 註解寫 radians，此處不改寫、照傾印）。
- `segmentAlpha` 是出生/中段/死亡三段（0–255）；`segmentScaling` 是三段粒子尺寸（WC3 單位）。

## 0. 工具與來源盤點（任務②-1）

| 問題 | 答案 |
|---|---|
| stock MPQ 在不在 | ⭐ **全在 repo 根目錄**：`war3.mpq` · `War3x.mpq` · `War3xLocal.mpq` · `War3Patch.mpq`（讀取順序即此，新的蓋舊的） |
| 讀得了嗎 | ⭐ 讀得了。`tools/w3x-import/w3xlib/mpq.py::W3XArchive` 直接開 stock MPQ（`extract_stock_vfx.py` 已在用同一條路）；`.mdl` 路徑自動改試 `.mdx` |
| 解析器 | `w3xlib/particles.py::parse_particles`（PRE2/RIBB/EVTS/TEXS/MTLS）；貼圖用 `w3xlib/blp.py::decode_blp` 驗 alpha 內容 |
| 既有出貨管線 | `tools/w3x-import/extract_stock_vfx.py`（GH#439）：census 裡 `form=blizzard-stock` **且有 family** 且 `refCount ≥ 100` 才進 worklist ⇒ 只收了 warstompcaster(150)+thunderclapcaster(123) |
| 7 支拿到幾支 | ⭐ **7/7 全數拿到**，零缺席（任務②-3 的「拿不到清單」是空的） |

## 1. WarStompCaster —— `war3.mpq` · 11,053 bytes · PRE2×1

貼圖表：`LightningBall.blp` / `Zap1_Red.blp` / `grad2d.blp`

| emitter | `BlizParticle01pulse` |
|---|---|
| 貼圖 | `Textures\Zap1_Red.blp`（128×64；**alpha 全 255，形狀住 RGB** ⇒ additive 安全） |
| filterMode | **additive** · tail（squirt=1，stretched） |
| lifetime | 0.5s · tailLength 0.10 |
| 速度 | 660 · variation 0 · latitude 180 · gravity 0 |
| 發射 | rate 0；KP2E 爆發軌 `[90700→109.2, 90900→0]` ⇒ 一次 ~109 顆（出貨 doc 的 burstCount=109 正是這裡來的） |
| 大小 | segmentScaling **[1.8, 28.5, 1.6]**（中段暴脹 ⇒ 衝擊環） |
| 顏色/alpha | 白 [1,1,1]×3；⚠ segmentAlpha **[0, 200, 0]** —— **出生 alpha=0**，靠中段 peak 才可見（出貨 doc colorStops 0→0.784→0，過 birth-visibility 閘因為判的是 peak） |
| 事件 | SNDXAHTC@90733 · UBRxTHND@90833（ubersplat 地裂貼花） |

## 2. EarthQuakeTarget —— `war3.mpq` · 78,876 bytes · PRE2×2

貼圖表：`EQ_Rock2.blp` / `Dust5A.blp` / `LavaLump.blp` / `Red_Glow3.blp`

### 2a `BlizParticle05standdust` ⭐ **alpha 病族（LUMA-KEY 候補）**

| | |
|---|---|
| 貼圖 | `Textures\Dust5A.blp`（64×64；⛔ **RGB 全白 lum=255/std=0，形狀 100% 住 alpha**（alphaMean 39.5、邊緣 ~1）） |
| filterMode | **blend** · head |
| lifetime | 1.5s |
| 速度 | 100 · variation 0.72 · latitude 24.5 · gravity 0 |
| 發射 | rate 20 · 平面 200×200 |
| 大小 | [40, 60, 110]（塵團越飄越大） |
| 顏色/alpha | 土色 [0.529,0.498,0.376]→[0.557,0.490,0.310]→[0.498,0.420,0.322]；alpha [255,255,0] |
| flipbook | headInterval [0,32] + decay [33,63]（Dust 序列圖） |
| 病理 | blend 依賴貼圖 alpha；轉出時丟 alpha ⇒ **整格白色方塊**；轉 additive 用 RGB ⇒ 全白疊爆。**LUMA-KEY 正解：把 alpha 通道搬進 RGB（或替代貼圖）** |

### 2b `BlizParticle05lava`

| | |
|---|---|
| 貼圖 | `Textures\LavaLump.blp`（32×32；alpha 全 255，形狀住 RGB ⇒ 安全） |
| filterMode | **additive** · head |
| lifetime | 1.5s · **gravity 700**（拋物噴岩） |
| 速度 | 520 · variation 0.17 · latitude 11 |
| 發射 | rate 30 · 5×5 點源 |
| 大小 | [37.1, 24.0, 13.0]（縮小） |
| alpha | [255,255,0]，顏色全白 |

兩個 emitter 都掛 KP2V **多次脈衝**可見軌（~167ms 起、到 ~6.4s 共 6 波）——地震的「一震一噴」節奏住在 visibility track，⛔ 不是 emission track。事件：SNDXAEQK@167 + **7 個 UBR 地裂貼花**（1033→9787ms）。

## 3. ThunderClapCaster —— `war3.mpq` · 40,937 bytes · PRE2×1

貼圖表：`LightningBall.blp` / `Thunderclap\Lightning2b.blp` / `Zap1.blp`

| emitter | `BlizParticle01` |
|---|---|
| 貼圖 | `Textures\Zap1.blp`（128×64；alpha 全 255，形狀住 RGB ⇒ 安全） |
| filterMode | **additive** · head（squirt=1） |
| lifetime | 0.41s |
| 速度 | 660 · latitude 180 · gravity 0 |
| 發射 | rate 0；KP2E `[90700→109.2, 90900→0]`（與 WarStomp 同款爆發） |
| 大小 | [23.5, 19.0, 10.9] |
| 顏色/alpha | 白；alpha [255,255,0]（出生就可見——與 WarStomp 的 [0,200,0] 是**同族但不同病歷**） |
| 事件 | SNDXAHTC@90733 · UBRxTHND@90833 |

⚠ 模型本體另含 Lightning2b 電光面片（MTLS 層），⛔ PRE2 抓不到 —— 抽 emitter 只還原地環那一半，「頭頂炸雷」那一半住 geoset/材質動畫。

## 4. ReviveHuman —— `war3.mpq` · 20,881 bytes · PRE2×3

貼圖表：ReplaceableId 2（隊色）/ `Yellow_Star_Dim.blp` / `firering4.blp` / `GenericGlow2_64.blp` / `Yellow_Star.blp`（全部 alpha=255 形狀住 RGB ⇒ 安全）

| | 03 / 04（雙螺旋星屑，僅色差） | 01（上升星柱） |
|---|---|---|
| 貼圖 | `Yellow_Star_Dim.blp` | `Yellow_Star.blp` |
| filterMode | additive · **tail**（tailLength 1.7） | additive · head |
| lifetime | 0.75s | 2.0s |
| 速度 | 60 · variation 0.02 | 600 · variation 0.02 |
| 發射 | rate 40 · 點源 | rate 41.5 · 平面 120×120 |
| 大小 | [3.4, 13.0, 2.2] | [10, 10, 1] |
| 顏色 | 金黃 [1,0.89,0.46]→[0.95,0.84,0.39]→白 / 微差 | 白 |
| alpha | [255,200,0] | **[0,255,0]**（出生透明、中段 peak） |
| 可見軌 | KP2V [0→1, 1967→0] | KP2V [0→0, 133→1, 1267→0] |

事件：SNDXAHRV@0。flags 0x99000（modelSpace+XYQuad 族——螺旋位移由骨架動畫帶，抽 emitter 拿不到繞旋軌跡）。

## 5. Awaken —— `War3x.mpq` · 20,833 bytes · PRE2×3

貼圖表：ReplaceableId 2 / `GenericGlowFaded.blp` / `firering4.blp` / `GenericGlow2_64.blp` / `Star8b.blp`（全部形狀住 RGB ⇒ 安全）。結構與 ReviveHuman 同款（復活家族），差在**金→紫**配色：

| | 03 / 04（光暈對） | 01（星爆） |
|---|---|---|
| 貼圖 | `GenericGlowFaded.blp` | `Star8b.blp` |
| filterMode | additive · head | additive · head |
| lifetime | 2.0s | 3.0s |
| 速度 | **0**（原地暈） | 170 · variation 0.59 |
| 發射 | rate 60 | rate 35 · 平面 120×120 |
| 大小 | [3.4, 13.0, 2.2] | [12.6, 11.3, 3.9] |
| 顏色 | **金[1,0.82,0.11]→紫[0.64,0.18,0.92]→紫** | 白→金[0.97,0.78,0]→紫[0.76,0.17,0.97] |
| alpha | [255,200,0] | [70,254,38] |
| 可見軌 | [0→1, 2167→0] | [0→0, 133→1, 1833→0] |

事件：SNDXAHRV@0（跟 ReviveHuman 共用復活音）。

## 6. FragDriller —— `War3x.mpq` · 9,513 bytes · PRE2×1

貼圖表：`Roman1.blp` / `GenericGlowX.blp` / `Roman.blp` / `Clouds8x8Fade.blp`

| emitter | `BlizParticle01`（彈頭火花噴流） |
|---|---|
| 貼圖 | `Textures\Clouds8x8Fade.blp`（256×256 **8×8 flipbook**；lum 與 alpha 攜帶**同一個**形狀（兩者 mean 28.5/std 45.9 逐位相同）⇒ additive 走 RGB 也活，**⛔ 不是 alpha 病**） |
| filterMode | **additive** · head · rows 8 × cols 8 |
| lifetime | 0.75s |
| 速度 | 200 · latitude 74 · gravity 0 |
| 發射 | rate 80 · 20×20 |
| 大小 | [70.1, 68.6, 69.9]（幾乎恆定） |
| 顏色 | 紅橙 [1,0.235,0.086]→[1,0.753,0]→[1,0.753,0]；alpha [255,255,46] |
| 可見軌 | KP2V [90400→1, 90700→0]（death 段才噴——這是**飛彈**模型，命中瞬間的碎焰） |
| 事件 | SNDXMMTI@90400 |

⚠ 模型主體（鑽頭彈體 Roman 貼圖的 geoset）不在 PRE2 —— 抽 emitter 只還原爆焰。

## 7. MarkOfChaosTarget —— `War3x.mpq` · 25,418 bytes · **PRE2×6 + RIBB×8**（七支裡最重）

貼圖表：`GenericGlow2b` / `Clouds8x8Mod` / `star6` / `CartoonCloud` / `Red_Glow3` / `Shockwave1` / `GenericGlowFaded` / `firering1A`

### PRE2（六支）

| emitter | 貼圖 | filter | life | 速度/重力 | rate/爆發 | 大小 | 顏色 · alpha | 備註 |
|---|---|---|---|---|---|---|---|---|
| white02 | `Clouds8x8Mod.blp` ⭐病 | **modulate** · head 8×8 | 1.1 | 84 · lat 180 | KP2E 爆發 `[2033→40]` | [40,35,30] | 白 · [255,255,255] | ⭐ **alpha 病（modulate 型）**：貼圖 RGB 近全白(241.5)、形狀住 alpha ⇒ modulate 乘 ~1 幾乎不改畫面；引擎若丟 alpha 直接**整支不可見** |
| white03 | 同上 ⭐病 | modulate · head 8×8 | 1.2 | 200 · var 1.0 · lat 10 | KP2E `[1933→50]`，⚠ **基線 −16.5（負值要 clamp 0）** | [50,50,50] | 白 · [255,255,255] | 同上 |
| 022222 | `star6.blp` | additive · **tail**(0.5) | 0.46 | 420 · lat 180 | rate 80（KP2V 窗 1767–2167ms） | [9.1,31.5,5.1] | 紅[1,0,0]→紅→橙[1,0.37,0.03] · [0,200,0] | 出生 alpha 0、中段 peak |
| BlastFlareStreamers | `CartoonCloud.blp` ⛔⛔病 | **additive** · tail(0.1) | 0.9 | 0 · lat 36 · **gravity 500** | KP2E `[267→26.3, 700→0]` | [4,4,3] | 白→綠[0.24,0.93,0.35]→紫[0.26,0.06,1] · [128,128,0] | ⭐⭐ **alpha 病最重症＝電弧同病**：貼圖 RGB **純白 255/std 0、形狀 100% 住 alpha**（邊緣 alpha ~2）。additive 走 RGB ⇒ 每顆粒子是**實心白方塊**；丟 alpha 的匯出 ⇒ 同樣白方塊。**LUMA-KEY（alpha→RGB）是唯一正解** |
| shockwaves02 | `Shockwave1.blp` | additive · head | 1.0 | 100 · var 0.5 | rate 30（KP2V 窗 1867–2167ms） | **[66.5,128.3,265.9]** 巨環 | 黃[1,0.96,0.49]→紅[1,0,0]→暗紅 · [255,151,0] | 環面貼圖形狀住 RGB（lum peak 102）⇒ 安全但偏暗 |
| shockwavesYellow | `GenericGlowFaded.blp` | additive · head | 1.0 | 300 · var 0.5 | rate 30（同窗） | [50.5,92.2,137.7] | 黃綠[0.97,0.87,0.22]→[0.75,0.97,0.16] · [135,85,0] | 安全 |

### RIBB（八條，全同款紅絲帶）

`BlizRibbon02/03/04/06/07/09/10/12`：heightAbove/Below **18/18** · alpha 1.0 · 色 [1,0,0]（07 是 [1,0,0.047]）· lifespan 0.4s · emissionRate 30 · 材質 = **additive `GenericGlow2b.blp`** · KRVS 可見窗 [1167→1, 1700→0]。⇒ 印記畫圈的「八臂紅光軌」，時窗只有 0.53 秒。

事件：SNDXAHMC@1167。

## 8. ⭐ alpha 病族總表（LUMA-KEY 候補，任務②-2 特標）

| 貼圖 | 量到的證據 | 病型 | 中招 emitter |
|---|---|---|---|
| `Textures\CartoonCloud.blp` | lum 255/std **0**（純白）；alpha std 124、邊緣 ~2 | ⛔⛔ **additive+形狀全住 alpha**（與連鎖閃電 Arc 同病） | MarkOfChaosTarget · BlastFlareStreamers |
| `Textures\Dust5A.blp` | lum 255/std **0**；alpha mean 39.5、邊緣 ~1 | ⛔ **blend+形狀全住 alpha**（丟 alpha ⇒ 白方塊） | EarthQuakeTarget · standdust |
| `Textures\Clouds8x8Mod.blp` | lum 241.5（近白）；alpha std 63、邊緣 ~1 | ⛔ **modulate+形狀住 alpha**（丟 alpha ⇒ 整支不可見；帶 alpha 也近乎無效果） | MarkOfChaosTarget · white02 / white03 |
| `Textures\Clouds8x8Fade.blp` | lum 與 alpha 逐位相同（28.5/45.9） | ✅ 雙通道同形 ⇒ **不是病** | FragDriller |
| 其餘全部（Zap1 / Zap1_Red / LavaLump / Yellow_Star* / GenericGlowFaded / Star8b / star6 / Shockwave1） | alpha 恆 255，形狀住 RGB | ✅ additive 安全 | — |

另一類（**不是貼圖病，是 segmentAlpha 病**）：出生 alpha=0 的 emitter —— WarStompCaster pulse [0,200,0]、ReviveHuman 01 [0,255,0]、MarkOfChaos 022222 [0,200,0]。轉檔時若只取 `start` 丟 stops ⇒ 全程透明（birth-visibility 閘①的病型；判可見要取 **peak**）。

## 9. content/ 對應物現況（任務②-4）

| 模型 | vfx doc | glb | 綁定/可見性 |
|---|---|---|---|
| WarStompCaster | ⭐ `content/vfx/fx.w3x.stock.warstompcaster.p00.json` | ⛔ 無（stock 模型從未轉 glb；`content/assets/models/imported/` 只有地圖檔內建模型） | `content/config/ability-vfx-bindings.json` 4 列引用；runtime `apps/client/src/render/vfx/w3xAbilityArt.ts::stockEmitterIds()`（shockwaveRing family）。**過 `vfxDocsBirthVisibility` 閘**（peak alpha 0.784；KNOWN_INVISIBLE 名單現為**空**） |
| ThunderClapCaster | ⭐ `content/vfx/fx.w3x.stock.thunderclapcaster.p00.json` | ⛔ 無 | 同上 5 列引用；**過閘**（peak alpha 1.0） |
| EarthQuakeTarget | ⛔ 無 | ⛔ 無 | census：family=None · refCount 4 ⇒ 被 `extract_stock_vfx.py` 的兩道門都擋（**要有 family + refCount≥100**） |
| ReviveHuman | ⛔ 無 | ⛔ 無 | family=None · refCount 11 |
| Awaken | ⛔ 無 | ⛔ 無 | family=None · refCount 3 |
| FragDriller | ⛔ 無 | ⛔ 無 | family=None · refCount 5 |
| MarkOfChaosTarget | ⛔ 無 | ⛔ 無 | ⚠ **有 family（`mark`）但 refCount 24 < 100** ⇒ 只差 min-refs 這一道門。⛔ 降 floor 是 owner 可見的決策（工具檔頭明寫是 blast-radius gate，實測 40 就會讓 burst family 每次施放多 3 支 emitter） |

補充：音效對應物已在 —— `content/assets/audio/wc3/warstomp.wav` · `thunderclapcaster.wav` · `markofchaos.wav`。

## 10. 拿不到的清單（任務②-3）

**空。** 7/7 模型與 13/13 被引用貼圖全數從 repo 根目錄的四顆 stock MPQ 讀出。

唯二**結構性拿不到**（⛔ 不是 MPQ 缺）：
1. ThunderClapCaster 的頭頂電光面片、FragDriller 的鑽頭彈體、MarkOfChaos 的地面印記貼花 —— 住在 **geoset/材質動畫**，`parse_particles` 只讀 PRE2/RIBB；要它們得走 mdx→glb 轉換（`w3xlib/mdx.py`+`gltf.py`，動畫 agent 所有）。
2. ReviveHuman/Awaken 的螺旋位移 —— 粒子掛在**骨架動畫節點**上，emitter 參數裡沒有軌跡。
