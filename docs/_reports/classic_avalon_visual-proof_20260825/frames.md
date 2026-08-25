# 20-002 解放.約束勝利劍MAX（`godie-e002.ex`）：反彈成功 → 七連斬 → 勝利之劍（GH#695 · #549）

> owner 2026-08-25（逐字）：「超究武神霸斬 **理想鄉EX** 龍破斬 世界終結 …
> **跟天譴一樣連續圖片驗收 ＆一頁批次後台驗收**」

⚠️ **這一支⛔ 不是「放出來就看得到」的技能**：它的實作住 `passive.hooks` 的
**`onReflectSuccess`** ——「反彈成功時」才發動。所以這一頁**先造出一次真的反彈**：

```
① 解鎖 EX（exSlot rank 1 ＋ 出貨 syncAbilityPassives） ⇒ stats.sources 出現
   "abilityPassive:godie-e002.ex"（facts 逐字記著）
② 放 20-04 永恆的理想鄉（castType self）⇒ 2 秒 buff，帶 onDamageTaken 反彈 hook
③ 敵人打一發**魔法**傷害 ⇒ incomingPct 排出反彈封包 ⇒ 封包**落地**
④ 出貨 step() 的 8b `reflectHookSystem` 發 onReflectSuccess ⇒ EX 的 hooks 才跑
```

⛔ **不直接呼叫 `fireHooks`** —— 那會跳過四道閘（沒有觸發封包 / 超過 maxChainDepth /
排空預算 / 反彈量 ≤ 0），量到的就不是玩家會遇到的那條路。
⭐ 對照組在 facts 裡：**`reflectDamageDealtToAttacker: 1,137.4`** ＝ 反彈**真的**打到人了，
⛔ 不是「一個從來沒觸發過的 hook 安靜地什麼都沒做」。

台子：`?scenario=avalon`（1280×760）。量尺自證 `calibrate()` = **515,524** 亮像素。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| a0_baseline | 0 | 2,426 | 27,010 | 基線：Saber（金）與一名敵人（藍）站定；EX 已解鎖但**尚未觸發** |
| a1_avalon_up | 49 | 2,459 | 27,399 | 放 20-04（第 22 tick 落地）：`tpl-locust-strike` 紅柱 —— 模型節點 `w3x.stock.monsoonbolttarget` **enabled · 44 頂點**，⚠️ 但 `tint [0.39,0,0]` 很暗 ⇒ 只有 49 個亮像素 |
| **a2_reflect_hit** | **1,281** | **7,619** | 31,273 | ⭐ 敵人打一發魔法傷害 ⇒ **反彈成功**（第 29 tick）：同一格發了 **2 記 `vfxSpawn` ＋ 4 記 `screenFlash`** —— 七彩爆炸 `fx.avalon.reflect-burst` 長在**被反彈者**身上 |
| **a3_seven_hits** | **447** | **6,033** | 42,430 | 連續七斬進行中（第 41 tick，第 3 記）：`liveSystems` 同時有 `vfx-fx.avalon.reflect-spark`（13 / 16 顆）與兩個 `vfx-fx.avalon.reflect-burst`（46 / 40 顆） |
| **a4_finisher** | **16,465** | **35,923** | 60,797 | ⭐ **收尾**（第 57 tick）：`damageLine` 約束與勝利之劍（前方直線）＋ 第二發七彩爆炸 ＋ 全場閃光 |
| a5_expired | 0 | 2,426 | 26,825 | 到期：反彈 buff 與所有爆炸走完 |

⭐ **A/B 就在表裡**：a0（EX 已解鎖、未觸發）**0** → a2/a4 **1,281 / 16,465** → a5 **0**。

## 演出時間軸（出貨事件流）

```
tick 22  modelFxSpawn（20-04 的 tpl-locust-strike 紅柱）
tick 29  vfxSpawn ×2 ＋ screenFlash ×4      ← 反彈成功：R 與 EX 的 hooks 一起發
tick 33 · 37 · 41 · 45 · 49 · 53  vfxSpawn ×6   ← 七連斬（delayed count 7 × 0.12 秒 ≈ 每 4 tick）
tick 57  vfxSpawn ×2 ＋ screenFlash          ← finalEffects：damageLine ＋ 第二發爆炸
```

事件直方圖：`damage 10` · `vfxSpawn 10` · `screenFlash 5` · `screenShake 3` ·
`floatingText 7`（`{{i}}Hit` ×7）· **`damageLine 1`** · `buffApply 1` · `modelFxSpawn 1`。

⭐ 「七次斬擊 ＋ 最後一劍」在**事件層與像素層都對得上**：7 記浮字、6 記火花（第 7 記與
收尾同格）、1 記 `damageLine`。

## ⚠️ 兩個誠實的但書

1. **浮字（`{{i}}Hit`）不在這些截圖裡** —— 出貨的 `floatingText` 由
   `ui/WorldAnchorLayer.tsx`（**DOM**）畫，⛔ 不是 canvas。這一頁量的是 canvas 的像素，
   所以 7 記浮字在 `eventHist` 看得到、在 PNG 上看不到。⛔ 這**不是**缺陷的證據。
2. **a1 的紅柱只有 49 個亮像素** —— 模型在（44 頂點、enabled），但 `tint [0.39,0,0]` ＋
   scale 6 的暗紅在深色地板上幾乎不亮。⛔ 本 lane 不判定它是不是缺陷（那是 owner 的
   美術取捨），⭐ 但數字留在這裡供批核。

## 這一批宣稱什麼、⛔ 不宣稱什麼

| ✅ 宣稱（有終端像素證據） | ⛔ 不宣稱 |
|---|---|
| EX 的 `onReflectSuccess` **真的觸發得起來**，而且反彈**真的造成傷害**（1,137.4） | ⛔ 不宣稱 `godie-e00l.ex`（鏡像那一份）—— 這一頁只跑 `godie-e002` |
| 七彩爆炸 ＋ 七連斬 ＋ 收尾直線**在畫面上逐段發生**（0 → 1,281 → 447 → 16,465 → 0） | ⛔ 不宣稱浮字看得到（那是 DOM 層，這一頁量不到） |
| 出貨的 `screenFlash` / `screenShake` 上限（`config.screen-fx@1`）真的被套用 | ⛔ 不宣稱傷害倍率（7× 反彈、`ap` 7 倍那些是 sim 守衛的事） |
