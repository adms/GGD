# TornadoElemental ×9 — 連續圖片驗收（GH#688 Phase 6 · TORNADO lane · 2026-08-25）

台子：`apps/client/public/beam-audition.html?ability=godie-udre.r`（client-beam :39673），
量尺先過 `calibrate()`（全亮 quad **173,056** 亮像素 > 0 ⇒ 量尺自證，CLAUDE.md 👁 節）。
鏈路：真 SimWorld → 出貨 `godie-udre.r`（castAbility，詠唱 0.667s＝20 tick）→ 真
`modelFxSpawn` ×2（musashi 舊節點 ＋ **tornadoelemental 新節點**）→ 真 VfxSystem/ModelFxRig
→ 真 `tornadoelemental.glb`（本批 War3x.mpq → glb 轉換，visiblePrims 3/3）。
內容經 `workingTreeSource()` 逐檔讀工作樹（`PILOT_MODEL_DOCS` 補了 tornadoelemental 的索引列；
`content:build` 落地後該段為 no-op）。

| 擷圖 | tick | 亮像素(>200) | lit(>96) | 說明 |
|---|--:|--:|--:|---|
| shot0_baseline_tick0 | 0 | 0 | **0** | 施放前基線（黑場＋替身） |
| shot1_tick22_birth | 22 | 0 | 0 | cast resolve：spawns=2（事件已發），glb 仍在串流 |
| shot2_glb_ready | 23 | 0 | **419** | glb＋shader 就緒：兩具球體演出可見 |
| shot3_midlife | 53 | 0 | 412 | lifeSec 2.5（75 tick）內持續可見 |
| shot4_expired | 108 | 0 | **0** | 到期回收：畫面回到與基線同級（png 位元組數同 shot0） |
| shot5_recast_both_orbs | 130 | 0 | 415 | 重放：spawns=4，兩具（musashi＋tornado）都在 |
| shot6_AB_tornado_only | 130 | 0 | **414** | ⭐ A/B：**musashi 節點 setEnabled(false)** 之後仍 414 ⇒ 亮像素幾乎全部來自 **TornadoElemental**（musashi 是 alpha 0.5 幻影，僅貢獻 ≈1） |

⭐ 判讀：**tornado 單獨 = 414 lit vs 基線 0**；到期後回到 0（回收乾淨）。
`bright(>200)` 全程 0 —— 模型是 tint 過的半透明風效＋0.5 hemispheric 光，落在 96–200 區間，
可見性以 `lit(>96)` 與 A/B 差分判定（calibrate 已自證量尺讀得到 >200）。

已知誠實限制：畫面上讀得出的是**藍色調的龍捲風漏斗環繞施法者上半身**（shot6 目視可辨），
原作的粒子拖尾（PRE2 emitter：BlizParticle03tubespinner 等 4 支，peak alpha 68–100）
不在 glb 幾何裡 —— emitter 重製是既有的下一批（同 ReviveHuman/FlameStrike1 的限制）。
spin 動畫走 `clip:"idle"` → `clipMap.idle = "Stand Walk"`（GH#689 modelFxRig 真的會播）。
