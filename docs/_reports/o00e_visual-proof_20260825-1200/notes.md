# o00E MonsoonBoltTarget — 連續圖片驗收（GH#691 · #688 Phase 6-1 · 2026-08-25）

台子：`apps/client/public/beam-audition.html?ability=<id>`（client-beam :39673）。
量尺先過 `calibrate()` —— **每一次跑都量到 131,052 亮像素**（已知全亮的 control quad），
量不到就代表這一頁之後的每一個「看不見」都不可信（CLAUDE.md 👁 節 · 洞 d）。

鏈路：真 `SimWorld` → 出貨技能（`castAbility()`，目標型別由文件自己的 `castType` 推導）
→ 真 `modelFxSpawn` → 真 `VfxSystem`/`ModelFxRig` → 真
`content/assets/models/imported/monsoonbolttarget.glb`。⛔ 沒有任何一段是這一頁造的。

擷圖是 `canvas.toDataURL()`（engine 開 `preserveDrawingBuffer`），⛔ 不是
`CreateScreenshotAsync` —— 後者等 rAF，而背景分頁的 rAF 是停的（量到：整個呼叫卡住 30 秒）。

## 三支抽驗（三種 anchor × 三種縮放 × 有／無 tint）

| 技能 | 原作站點 | anchor | node scale | tint | clip |
|---|---|---|---|---|---|
| `godie-u00l.r` 25-04 ChangeDNA | `o00E` dummy（war3map.j:38740/38753 LightAttack） | target | **10**（usca） | `[1,0,0]` | `idle`→`Stand` |
| `godie-e002.r` 20-04 Avalon | `o00G` dummy（:32435 avalonStart） | self | **6**（usca） | `[0.3922,0,0]` | 同上 |
| `godie-e00w.r` 77-04 真-雷光劍 | `AddSpecialEffect`（:49906 Move_Effect，⛔ 無 dummy） | point | **8**（無原作值，見下） | 無 | 同上 |

### 逐張亮像素（bright = >200 · lit = >96）

| 擷圖 | u00l.r tick / bright / lit | e002.r | e00w.r |
|---|---|---|---|
| shot0 施放前基線 | 0 / **0** / 0 | 0 / **0** / 0 | 0 / **0** / 0 |
| shot1 詠唱中 | 30 / 0 / 0 | 30 / 0 / 0（節點已生、素材未編譯） | 58 / 0 / 0 |
| shot2 glb 回填 | 40 / 32 / 49 | 42 / 42 / 101 | 62 / 16 / 392 |
| **shot3 壽命中段** | 46 / **437** / 801 | 67 / **42** / 101 | 72 / **164** / 330 |
| shot3b 再 6 tick（同一支動畫的另一格） | 52 / **444** / 826 | — | — |
| shot4 到期回收 | 92 / 81 / 162（節點 off） | 127 / **0** / 0 | 117 / 42 / 131（節點 off） |

⭐ **剪輯真的在播**（GH#689 已落地）：`scene.animationGroups` 逐格量到
`modelfx-1-Stand playing=true`，frame **1.1 → 60.4 → 120.2**，到期時 `playing=false`。
⇒ 雷柱是**會閃**的，⛔ 不是一格靜止畫面（shot3 與 shot3b 是同一發的兩格）。

節點逐具（`stats()`）：`v44 @(x,0,0) yaw90` —— **44 個頂點 = 原作 8 個 geoset 的總和**
（4+4+4+8+4+4+12+4），⛔ 沒有一片被轉換器丟掉；`y=0` ＝ 貼地（雷擊打在地上，
`fxSpawnHeight` 刻意不填）。

⚠️ shot4 的殘亮**不是**模型：節點 `enabled=false` 而畫面上剩下的是那支技能自己的
施放 vfx 尾段（shot4 的 PNG 逐張看得到 —— 只剩施法者腳邊那顆光點）。

⚠️ shot2 → shot3 的跳升是**素材編譯**，⛔ 不是模型晚到：shot2 的 `v44` 已經在了。
（量尺坑③；`measure()` 自己 render ×2，但 PBR 素材首次上場要編譯著色器。）

## ⛔ 量到的一件壞事：`tint` 對這一族**逐位元無效**

出貨節點寫 `tint:[1,0,0]`（o00E 的原作頂點色），而**畫面上的閃電是藍的**。
逐材質量到（`scene` 現場讀，⛔ 不是推測）：

```
mat0-fxtint … mat6-fxtint   albedoColor [1,0,0]  ✅ tint 到了
                            emissiveColor [1,1,1] + emissiveTexture  ⛔ 沒被碰
```

`applyFxTint`（`render/modelFxRig.ts`）**刻意只乘 `diffuseColor`/`albedoColor`**，
而 stock 特效模型經 `gltf.py` 的 luma-key 路徑轉出來之後，**看得見的顏色住 emissive**
（7 個材質全部是 `additive glow w/o alpha → luma-keyed`）。
⇒ 這一族的 `tint` / `model@1.fxTint` 是「說了但不會發生」（第一·五守則）。

⚠️ 影響**遠大於這一批**：locust 計畫裡「fxTint 回填 133/236 非白 dummy」整條線，
只要那份 glb 是 luma-keyed 的 stock 特效模型，回填就會全部無效。
⛔ 本 lane **不修**（`modelFxRig.ts` 是 A6 的柵欄）—— 交給主 session 開票。
⛔ 也**不刪**那幾格 tint：值是量到的（`UNIT_TINTS.json`），刪掉只會讓這個缺陷隱形。

## `scale` 是怎麼定的（⛔ 不是憑印象）

`model@1.scale = 0.0225`。推導：轉換器把 glb 匯出在 **wc3 ÷ 36**（`DEFAULT_SCALE`），
而 GGD 的距離換算是 **÷100**（synthesis §0，09-04 沿線 6×200↔range 12 對過）
⇒ 1:1 忠實值是 **0.36**。⚠️ 但 1:1 的結果是 `o00E`（usca 10）在畫面上有
**160 世界單位**高，而競技場是 24×18（CLAUDE.md 地圖鐵則）⇒ 除以 16 ⇒ **0.0225**。
⭐ 這個除數只有**一個住處**（模型文件那一格），所以節點上寫的就是**原作 usca 本身**
（10 / 6），⛔ 沒有第二個換算，而且「渲染高度（世界單位）≈ usca」。
一鍵 rollback：改 `content/models/w3x.stock.monsoonbolttarget.json` 的 `scale` 一格。

`AddSpecialEffect` 站點原作**沒有記下縮放**（沒有 dummy 單位就沒有 `usca`）
⇒ 那一格是我挑的：**8.0**，而它是**量出來的** —— 第一版填 4.0，擷圖顯示雷柱
有一大半被 1.85 高的替身身體擋掉（bright 56）；8.0 之後清楚地站在目標頭上（bright 201）。

## 誠實限制

1. **兩顆 PRE2 emitter 不在 glb 裡**（`BlizParticle01` 白紫爆閃 · `BlizParticle02`
   出生 alpha 0 / peak 255 的第二層）—— 轉換器只轉幾何（`skipped MDX chunks: …PRE2`）。
   畫面上有的是雷柱面片本體，⛔ 沒有原作的粒子噴發。emitter → `content/vfx/fx.w3x.stock.*`
   是另一條產線（`extract_stock_vfx.py`，被 family+refCount≥100 兩道門擋著）。
2. ~~`Stand` 剪輯沒有播~~ ⇒ **已解**：A6 的 #689（`15f108e8`）落地之後補上
   `clip:"idle"`（經 `model@1.clipMap` 解成 `Stand`），逐格量到 frame 在前進。
3. 台子的三個敵人**留在假英雄 id 上**（`MoveSpeed=0` 才站得住）；施法者換成真英雄
   （`statRecomputeSystem` 對假 id 會擲 `content not registered` ⇒ 所有會給自己上增益
   的技能在這一頁根本跑不完一次施放）。
4. `godie-u00l.r` 的節點落在 x=−38.6 而目標替身在 −36：`anchor:"target"` 走的是
   sim 解出來的目標點（`targeted` 施放有近身/射程夾取），⛔ 不是替身的畫面座標。
