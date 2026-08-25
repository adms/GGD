# 04-03 龍破斬（`godie-h020.e`）：詠唱 → 火球飛行 → 落點爆炸 → 到期（GH#695）

台子：`apps/client/public/feature-proof-audition.html?scenario=dragonslave`（1280×760）。
鏈路全部是出貨的：真 `SimWorld` → 出貨 `castAbility()`（`castType: ground`）
→ 出貨 `content/abilities/godie-h020.e.json` 的 7 個 effects
（`floatingText` · `delayed` ×4 · `spawnModelFx preset "tpl-line-blast"` ·
`spawnModelFx preset "tpl-locust-strike"`）
→ 出貨 `VfxSystem` ＋ 出貨 `ModelFxRig`。
⭐ 兩個 preset 的欄位（modelKey / speed 27.5 / distance 12 / scale 4.5 / blastRadius 8）
**在載入時**由 `content/modelFxPreset.ts` 從 `content/ability-templates/` 補上 ——
⛔ 技能 JSON 一格都沒抄（第〇·四守則）。

量尺自證：`calibrate()` = **515,524** 亮像素。取樣點用事件對齊（⛔ 不猜 tick）。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| g0_baseline | 0 | 1,750 | 27,747 | 基線：莉娜（金）與兩名敵人（藍）站定 |
| g1_windup | 0 | 1,750 | 27,819 | 施放後 30 tick：1.233 秒詠唱中，畫面上什麼都沒有（對照組） |
| g2_resolve | 0 | 1,843 | **30,770** | 詠唱解算（第 39 tick）＋4：**火球出膛** —— `modelfx-imported.fireblast-0` **enabled · 164 頂點**，⚠️ 但它**一個亮像素都沒有**（見下） |
| g3_travel | 0 | 1,831 | **30,430** | 飛行中（第 48 tick）：沿施放方向前進（27.5 u/s × 12 格 ≈ 0.44 秒） |
| **g4_blast** | **1,749** | **5,189** | 32,678 | ⭐ **落點爆炸**（等 `onArrive` 的 `vfxSpawn`，實測第 53 tick）：`fx.prim.fire.explosion-lg` ＋ `damageArea` 半徑 8 ＋ `slow40` |
| g5_expired | 0 | 1,750 | 27,819 | 到期：爆炸與四段 `delayed` 全部走完（逐位元同 g1） |

## 演出時間軸（出貨事件流）

```
tick 39  explosion ＋ modelFxSpawn ×2   ← 詠唱解算：火球（fireblast）＋ 紅柱（monsoonbolttarget）
tick 53  vfxSpawn                        ← 火球到點：onArrive 的 fx.prim.fire.explosion-lg
```

事件直方圖：`modelFxSpawn 2` · `abilityHit 2` · `damage 3` · `hitImpact 3` ·
`floatingText 5` · `explosion 1` · `vfxSpawn 1` · `screenShake 1` · `statusApplied 1`（slow40）。

⚠️ **`explosion` 事件在「解算那一格」就發了（tick 39），⛔ 它不是「火球到點」**。
真正到點的訊號是那一發 `vfxSpawn`（晚 14 tick）。⭐ 這一格寫下來是因為它**騙過我一輪**：
用 `explosion` 對齊拍到的是空畫面。

## ⚠️ 誠實的紅字：**飛行中的火球本體幾乎看不見**

`g2` / `g3` 兩張的 `亮像素(>200)` 與 `lit(>96)` **都是 0**，而模型節點是在的
（`enabled: true` · 164 頂點）。faint(>32) 相對基線只多 ~2,600–3,000。
⇒ ⭐ **「模型有接上」與「玩家看得見」是兩件事**，而這一支今天落在中間：
飛行段是一顆很暗的東西，唯一亮起來的是**落點那一下**（1,749 亮像素）。

⛔ 本 lane **不判定**這是不是缺陷 —— `imported.fireblast` 的材質沒有自發光，
而這一頁的場景只有一顆 0.62 強度的半球光；真比賽的 `Lighting` 不同。
⇒ 這正是**一頁批次後台驗收**要 owner 看的那種題（機器判不了「像不像龍破斬」）。
⭐ 要一鍵回頭：翻這一批登記的開關（`config.vfx-families@1` 的 `families.dissipate.enabled`
—— 04-03 的家族綁定 entry 就是 `dissipate`）。

## 這一批宣稱什麼、⛔ 不宣稱什麼

| ✅ 宣稱（有終端像素證據） | ⛔ 不宣稱 |
|---|---|
| 出貨的 `tpl-line-blast` **真的生出模型、真的沿方向飛、真的在落點炸開**（1,749 亮像素） | ⛔ 不宣稱飛行段在畫面上讀得出來（**0 亮像素**，見紅字） |
| preset 的欄位在載入時補齊（技能 JSON ⛔ 沒有第二個住處） | ⛔ 不宣稱四段 `delayed` 各自的視覺（它們沒有自己的 vfx 節點） |
| 落點的 `damageArea` ＋ `slow40` ＋ `screenShake` 真的發出來 | ⛔ 不宣稱傷害級距（sim 守衛的事） |
