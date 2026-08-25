# 01-04 超究武神霸斬（`godie-hart.r`）：詠唱 → 七連斬 → 收尾 → 到期（GH#695）

> owner 2026-08-25（逐字）：「超究武神霸斬 理想鄉EX 龍破斬 世界終結 跟 beam光束砲…
> 相關的都修正完了嗎？**跟天譴一樣連續圖片驗收 ＆一頁批次後台驗收**」

台子：`apps/client/public/feature-proof-audition.html?scenario=omnislash`（1280×760）。
鏈路全部是出貨的：真 `SimWorld` → 出貨 `castAbility()`（`castType: targeted`）
→ 出貨 `content/abilities/godie-hart.r.json` 的五個 effects
（`applyStatus` ×2 · `invulnerable` · `comboStrikes` · `spawnModelFx`）
→ sim 真的發 `vfxSpawn` / `modelFxSpawn` / `screenFlash`
→ 出貨 `VfxSystem.handleEvent` ＋ 出貨 `ModelFxRig`（`modelFxDocFor` ⊕ `Models` ⊕ `AssetManager`，
GameApp 同一份接縫）。⛔ 沒有合成 payload、⛔ 沒有自己組 model doc。

量尺自證：`calibrate()` = **515,524** 亮像素（全亮 quad @1280×760）。

⭐ **取樣點用事件對齊，⛔ 不猜 tick**：每一張圖等的是「第 n 個 `vfxSpawn` / `screenFlash`」。
⚠️ 這是踩出來的 —— 前兩輪我照 `config.combo-strikes@1` 的秒數算 tick 號，
**兩次都拍到空畫面**，而一張「剛好沒拍到」的圖與「這個特效不存在」在證據上長得一模一樣。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| o0_baseline | 0 | 2,048 | 31,970 | 基線：克勞德（金）與兩名敵人（藍）站定，還沒施放 |
| o1_windup | 0 | 2,051 | 25,301 | 施放後 40 tick：1.833 秒詠唱走到一半，畫面上**還什麼都沒有**（⭐ 這正是對照組） |
| **o2_resolve** | **19,213** | **25,917** | 36,494 | 詠唱解算 ⇒ **第一記斬擊**（等 `vfxSpawn` #1，實測第 57 tick）：`fx.w3x.stock.thunderclapcaster.p00` 109 顆活粒子 ＋ 無敵 3.5 秒 ＋ 目標被 `omnislash-lock` 鎖住 |
| **o3_combo_mid** | **51,526** | **67,751** | 96,889 | 連斬中段（第 4 記，第 78 tick） |
| **o4_combo_finish** | **66,151** | **85,966** | 124,350 | **收尾一擊**（等 `screenFlash` —— 出貨 JSON 裡**只有 finisher 有它**，第 87 tick）：`warstompcaster` ＋ 全場閃光 ＋ 震動 |
| o5_expired | 0 | 2,051 | 25,301 | 到期：3.5 秒鎖定與無敵結束，畫面回到只有替身（逐位元同 o1） |
| **o6_recast_warm_cache** | **24,918** | **33,829** | 45,139 | **診斷格**（⛔ 不是演出的一部分）：第 177 tick 重放一次 —— 見下面的紅字 |

⭐ **A/B 就在表裡**：o1（詠唱中）**0 亮像素** → o2/o3/o4 **19,213 / 51,526 / 66,151** → o5 **0**。
Δ 就是這支技能本體的像素。

## 演出時間軸（出貨事件流，⛔ 不是估的）

```
tick 57  modelFxSpawn（imported.herocloudstrife，path toTarget）＋ vfxSpawn #1（第一斬）
tick 59  vfxSpawn #2   ← 模型到點的 fx.prim.physical.explosion-lg（onArrive）
tick 72 · 75 · 78 · 81 · 84   vfxSpawn ×5（第 2–6 斬）
tick 87  vfxSpawn（收尾 warstompcaster）＋ screenFlash ＋ screenShake
```

事件直方圖（含 o6 的重放，⇒ 兩次施放）：`damage 8` · `vfxSpawn 10` · `floatingText 8` ·
`modelFxSpawn 2` · `screenFlash 1` · `screenShake 1` · `immunityGranted 2` · `stunApplied 4`。

⚠️ **實測的連段節奏是「每 3 tick 一記、整段 1 秒」（57 → 87）**，
而 `content/config/combo-strikes.json` 的 `superff7` 逐字寫著
`steps [0, .5, .6, .7, .8, .9]` ＋ `finisherDelaySec .1`（＝**3.6 秒**，JASS 原文的等待序列）。
⇒ ⛔ **兩者對不上。** 本 lane ⛔ 未查根因（那張表是 `tools/jass-combo/extract.py` 的產物，
而 `comboStrikes` 效果讀不讀它、`family: "superff7"` 有沒有解析成功，都不在本批的柵欄內）
⇒ **請主 session 開票**。⚠️ 這只影響**節奏**（快慢），⛔ 不影響「七段真的打出來」——
`damage` / `vfxSpawn` / `floatingText` 的段數逐段對得上。

## ⛔ 紅字：`spawnModelFx` 的模型在**第一次施放時 0 頂點** —— 那一層玩家看不到

| 何時 | `modelfx-imported.herocloudstrife-0` |
|---|---|
| o2–o5（**第一次**施放，冷快取） | ⛔ **vertices 0** · `enabled false`（容器根本還沒載完） |
| o6（第 177 tick **重放**，熱快取） | ✅ **vertices 1,949** |

⇒ `imported.herocloudstrife.glb` 是 **389 KB**（克勞德的英雄模型本體），
而這個節點的演出是 `path: "toTarget"` `speed: 30`（飛 3 格 ≈ **0.1 秒**）——
**載入比演出長一個數量級** ⇒ 冷快取的第一次施放，那一層必然是空的。

⚠️ **誠實的界線**：這一頁的替身是圓柱，⛔ 沒有預載任何英雄模型；
真比賽裡克勞德本人在場上，`AssetManager` 早就載過同一顆 glb ⇒ **實戰的嚴重度低於這裡**。
⛔ 但「技能引用一顆沒有被預載的大模型」這個形狀本身是真的（例如敵方克勞德不在場時）。
⇒ 屬**預載/暖機**的票，⛔ 不在本批的柵欄內，請主 session 開票。

⭐ 而畫面上量到的 19k–66k 亮像素**與那一層無關** —— 它們是 `comboStrikes` 的
`perStrike` / `finisher` 裡的 `spawnVfx`（逐張的 `liveSystems` 指名了池子）。

## 這一批宣稱什麼、⛔ 不宣稱什麼

| ✅ 宣稱（有終端像素證據） | ⛔ 不宣稱 |
|---|---|
| 七段連斬 ＋ 收尾**真的在畫面上發生**（0 → 19k → 51k → 66k → 0） | ⛔ 不宣稱連段**節奏**對（實測 1 秒 vs 表上 3.6 秒，見上） |
| 無敵 3.5 秒 ＋ 目標鎖定真的掛上（`immunityGranted` · `stunApplied`） | ⛔ 不宣稱 `spawnModelFx` 那一層玩家看得到（冷快取 **0 頂點**） |
| 收尾的 `screenFlash` / `screenShake` 真的發出來 | ⛔ 不宣稱傷害數字（那是 sim 守衛的事） |
