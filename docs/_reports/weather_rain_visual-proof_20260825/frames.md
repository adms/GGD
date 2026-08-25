# 天氣：無雨 → **出貨路徑真的下起來** → 強度階梯 → 室內不下 → 起霧（GH#694 · #700 · #676 · #610）

> **這一份是第二版（2026-08-25 重產）。** 第一版（S7）在同一個台子上量到出貨的雨
> **一定擲例外**（GH#700，T0）—— 那時每一張雨的圖都是「台子自己補了一行 import」
> 之後的樣子，⛔ 只證明「雨畫得出來」，⛔ 不證明「玩家看得到雨」。

台子：`apps/client/public/feature-proof-audition.html?scenario=weather`（1280×760）。
鏈路全部是出貨的：出貨 `weatherPolicy()`（讀 `content/config/weather.json`）
→ 出貨 `weatherLookFor()`（含每場擲骰、室內閘、`WEATHER_KIND_WEIGHTS` 強度階梯）
→ 出貨 `buildRain()` / `buildFogBanks()`。

量尺自證：`calibrate()` = **515,524** 亮像素（全亮 quad @1280×760）。
⭐ 量不到它 ⇒ 這一批的每一個「看不見」都不可信，整批作廢。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 與基線相異像素(Δ>8) | 說明 |
|---|---:|---:|---:|---:|---|
| w0_baseline_no_weather | 0 | 862 | 14,621 | — | 基線：地板＋三具替身，沒有任何天氣層 |
| w1_chance0_no_rain | 0 | 862 | 14,621 | **0** | `rainChance 0` ⇒ 出貨擲骰必不中 ⇒ `buildRain` 回 null（一顆粒子系統都不建）。⭐ 與基線**逐位元組相同**（sha1 一致）＝ 這一格真的什麼都沒做 |
| **w2_shipped_path_rains** | 0 | 862 | 14,655 | **422** | ⭐ **GH#700 的驗收格**：`rainChance 1` ＋ seed 7919，clear 級的**室外**圖也在機率池裡（#676 的核心）。⭐ 台子**⛔ 沒有補任何 import**（`harnessImportedWebgl2Platform: false`），而 `buildRain` **⛔ 不再擲例外**：`gpu: true` · `psReady: true` · `texReady: true` · **活粒子 1,200** |
| **w3_rain_wet_arena** | 0 | 862 | 15,273 | **3,003** | 同一顆 seed 換成 **rain 級**場地（希干希納）：強度階梯由 `WEATHER_KIND_WEIGHTS` 決定 ⇒ 相異像素 **422 → 3,003（7.1×）**，這就是階梯本身 |
| w4_indoor_never_rains | 0 | 862 | 14,621 | **0** | 室內圖（納薩力克）＋ `rainChance 1`：室外閘擋住（`kind: "indoor-dry"` · `rain: 0`）⇒ 永遠不下。與基線 sha1 一致 |
| w5_fog_off | 0 | 2,752 | 6,028 | — | 霧那一半的基線（**俯視**機位；⛔ 與 w0 不同機位，兩組數字不可互相比） |
| **w6_fog_on** | 0 | 2,752 | 6,028 | **0（與 w5）** | ⛔ **零像素**：`buildFogBanks` 回了 handle、`fogBanks: 2`，而 PNG 與 w5 **sha1 完全相同** —— 見下面紅字 |

## ⭐ 這一版與第一版的差別，只有一句話

第一版：`buildRain → new GPUParticleSystem(...)` 擲
`The WebGL2ParticleSystem class is not available!`，而**出貨呼叫點
`ArenaScene.buildArena` 沒有 try/catch** ⇒ 擲中雨的那一場**整張地圖建不起來**
（出貨 `rainChance 0.3` ⇒ 約三成室外場）。

這一版：`WeatherRainFx.ts:69` 自己 `import "@babylonjs/core/Particles/webgl2ParticleSystem"`，
`ArenaScene.ts:481` 多了 `buildRainSafely()` 的 fail-safe。
⇒ 這一頁走的是**同一條出貨路徑，⛔ 一行都沒補**，而它 `threw: null`。

⚠️ **半透明環境特效的量法**（第一版踩出來的，留著）：出貨 `rainAlpha 0.22` ×
`DROP_WIDTH 0.05` ⇒ 一道雨絲約 1px 寬、峰值只有 ~22–32/255 ⇒
**`亮像素(>200)` 與 `lit(>96)` 兩道標準門檻對它結構性失明**（兩欄全是 0，而畫面上真的在下雨）。
⇒ 這一份多了一欄「**與基線相異像素**」（`PIL.ImageChops.difference` 逐像素，Δ>8）——
⭐ 它才是這一批的承重讀數，⛔ 亮像素那一欄在這裡沒有鑑別力。

## 讀數（出貨事件流／handle 自己的帳）

| 格 | arenaId | chance | look.rain | look.kind | built | threw | gpu | 活粒子 |
|---|---|---:|---:|---|---|---|---|---:|
| w1 | arena.colosseum | 0 | 0 | clear | ⛔ false | null | — | — |
| **w2** | arena.colosseum | 1 | 1 | clear | ✅ true | **null** | ✅ | **1,200** |
| **w3** | arena.shiganshina | 1 | 1 | rain | ✅ true | **null** | ✅ | **1,200** |
| w4 | arena.nazarick | 1 | **0** | indoor-dry | ⛔ false | null | — | — |

## ⛔ 紅字（GH#610，霧那一層）：霧堤建起來了，畫面上是**零像素**

`buildFogBanks` 回了 handle、`look.fogBanks = 2`、出貨 `fogBankAlpha 0.1`，
而 `w6_fog_on` 與 `w5_fog_off` 的 PNG **sha1 完全一樣**（＝**根本沒被畫**，⛔ 不是「太淡」）。

三種「其實是量尺壞了」都排除過（第一版做的，這一版重現同一個結果）：
兩個機位（側視＋俯視）各量一輪都逐位元相同；第二輪刻意走出貨的 `reducedMotion`
把霧**凍在 t=0**（排除漂移相位）仍然 0。

⚠️ **誠實的界線**：⛔ 根因仍然沒查。這個台子的場景是最小的（地板＋替身＋一顆半球光），
而出貨路徑是 `ArenaScene.buildArena()` ＋ `Lighting`（它另外開 `scene.fog`），
霧堤有可能依賴那邊設定的東西。⇒ 屬 **GH#610**，⛔ 不在本批的宣稱範圍內。

## 這一批宣稱什麼、⛔ 不宣稱什麼

| ✅ 宣稱（有終端像素證據） | ⛔ 不宣稱 |
|---|---|
| 出貨路徑的雨**在真 WebGL2 瀏覽器上建得起來、不擲例外、真的畫得出來**（GH#700 已驗收） | ⛔ 不宣稱雨在**真比賽場景**裡的濃度好不好看（那是 owner 的旋鈕） |
| 「室外才有機率下雨」的三層邏輯逐格對得上（#676） | ⛔ 不宣稱霧堤能看得見（GH#610 **仍然是零像素**） |
| clear→rain 的強度階梯在像素上量得到（422 → 3,003） | ⛔ 不宣稱 `AdaptiveQuality` 降級階梯（這一頁固定滿載） |
