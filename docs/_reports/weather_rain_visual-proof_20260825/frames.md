# 天氣：無雨 → 下雨 → 強度階梯 → 起霧（GH#694 · #676 · #654）

台子：`apps/client/public/feature-proof-audition.html?scenario=weather`
（`apps/client/src/vfx/featureProofAudition.ts`）。
鏈路全部是出貨的：`weatherPolicy()`（讀 `Configs` 的 `content/config/weather.json`）
→ `weatherLookFor()`（含**每場開賽一次的決定性擲骰** `matchRainRoll`）
→ `buildRain()` / `buildFogBanks()`。⛔ 沒有一段是這一頁自己畫的。

量尺先自證：`calibrate()` 全亮 quad = **462,400** 亮像素（1280×720）。
粒子時間走 `scene.useConstantAnimationDeltaTime`（每 `render()` 固定 16ms）⇒ 逐幀可重現。
擲骰用 `rainChance: 1` **強制擲中**＋固定 seed **7919**，⛔ 不是把雨「打開」——
走的仍然是出貨那條擲骰分支（`chance>=1 ⇒ 必下` 是它自己的精確分支）。

## ⛔⛔ 紅字①：出貨的雨在**真瀏覽器上一定擲例外**（本批量到，⛔ 不是推測）

`w2_shipped_path_throws` 那一格就是**今天玩家的處境**：擲骰中了，而

```
buildRain → new GPUParticleSystem(...) →
  Error: The WebGL2ParticleSystem class is not available! Make sure you have imported it.
```

根因：`apps/client/src/vfx/WeatherRainFx.ts` 在 `GPUParticleSystem.IsSupported`
為真時走 GPU 路，而**全 repo 沒有任何地方** `import "@babylonjs/core/Particles/webgl2ParticleSystem"`
（那一支才會註冊 WebGL2 平台）。⚠️ 測試看不到：NullEngine 的 `IsSupported` 是 **false**
⇒ vitest 量到的一直是 CPU 那條路 —— `WeatherRainFx.ts` 的檔頭自己寫著這件事。
⚠️ 而出貨呼叫點 `ArenaScene.buildArena()` 的 `buildRain(...)` **沒有 try/catch**
⇒ 擲中雨的那一場，**整張地圖建不起來**。

⇒ `w2_rain_*` 之後每一張雨的圖，都是**台子自己補上那一行 import 之後**的樣子：
它們證明的是「**雨本身畫得出來**」，⛔ **不是**「玩家今天看得到雨」。

## ⚠️ 紅字②：雨很淡 —— 兩道標準門檻量到 ~0，看圖才看得到

出貨 `rainAlpha 0.22` × `DROP_WIDTH 0.05` ⇒ 一道雨絲約 1px 寬、峰值 ~68/255。
所以 `亮像素(>200)` 與 `lit(>96)` 對它**結構性失明**，本表因此加第三道 `faint(>32)`，
並在最後一欄附上**與對照組的差**。⭐ 判準看的是 Δfaint 與圖本身，⛔ 不是 lit。

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | Δfaint vs 無雨 | 說明 |
|---|---:|---:|---:|---:|---|
| w0_baseline_no_weather | 0 | 760 | 13,111 | — | 基線：深色地板＋三具替身，沒有任何天氣層 |
| w1_chance0_no_rain | 0 | 760 | 13,111 | **0** | `rainChance 0` ⇒ 出貨擲骰必不中 ⇒ `buildRain` 回 `null`，一顆粒子系統都不建 |
| **w2_shipped_path_throws** | 0 | 760 | 13,111 | **0** | ⛔ **出貨路徑**：擲骰中了（`rain:1`），`buildRain` **擲例外** ⇒ 一滴雨都沒有（見紅字①） |
| w2_rain_clear_outdoor | 0 | 760 | 13,120 | +9 | （台子補了 import 之後）clear 級的**室外**圖（羅馬大擂台）也在機率池裡 —— #676 的核心。場上 **680** 顆活粒子（GPU 路） |
| w3_rain_wet_arena | 0 | 762 | 13,520 | **+409** | 同一顆 seed 換成 rain 級場地（希干希納）：場上 **1,200** 顆活粒子，畫面上整片斜雨絲 |
| w4_indoor_never_rains | 0 | 760 | 13,111 | **0** | 室內圖（納薩力克）＋ `rainChance 1`：`kind` 解析成 `indoor-dry`、`look.rain=0` ⇒ 永遠不下 |
| w5_fog_off | 0 | 760 | 13,111 | — | 霧那一半的基線：clear 級場地 ⇒ `fogBanks 0` ⇒ 不建 |
| w6_fog_on | 0 | 760 | 13,111 | 0 | 起霧：出貨 `buildFogBanks` 真的建了 **2 片**霧堤；⚠️ 出貨 `fogBankAlpha` 太低，這個機位量不到（見下） |

## 逐格讀數（`weatherLookFor` 的輸出，⛔ 不是台子挑的）

| 格 | arenaId | chance | kind | look.rain | built | 活粒子 | 雨柱高 |
|---|---|---:|---|---:|---|---:|---:|
| w1 | arena.colosseum | 0 | clear | 0 | ✗ | — | — |
| w2 | arena.colosseum | 1 | clear | 1 | ⛔ 擲例外 | — | — |
| w2b | arena.colosseum | 1 | clear | 1 | ✓ | 680 | 21.6 |
| w3 | arena.shiganshina | 1 | rain | 1 | ✓ | 1,200 | 21.6 |
| w4 | arena.nazarick | 1 | indoor-dry | 0 | ✗ | — | — |
| w6 | arena.shiganshina（霧） | — | rain | fogBanks **2** | ✓ | — | — |

## ⚠️ 這一批**沒有**證明到的事（誠實列出）

1. **玩家今天看得到雨** —— ⛔ 沒有。紅字①：出貨路徑擲例外，而且那個例外會弄垮整張地圖。
2. **霧看得見** —— `buildFogBanks` 真的建了 2 片，⛔ 但這個機位（側視、深色地板）
   量到的差是 **0**：出貨的 `fogBankAlpha` 疊在深色地板上低於 32/255。
   霧的可見性要另一個機位（貼地平視）才驗得了，本批⛔ 不宣稱它可見。
3. **雨的「強度階梯」是連續的** —— 只量了 clear（680 顆）與 rain（1,200 顆）兩級，
   ⛔ 沒有逐級掃過四種室外級別。
