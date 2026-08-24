# 09-04 龜派氣功 pilot — 連續圖片驗收（GH#688 Phase 5 · 2026-08-25）

台子：`apps/client/public/beam-audition.html`（client-beam :39673），量尺先過 `calibrate()`
（全亮 quad 亮像素 > 0 才往下量 —— 量尺自證，CLAUDE.md 👁 節）。
鏈路：真 SimWorld → 出貨 `godie-ogrh.r`（castAbility，詠唱 1.233s＝37 tick）→ 真
`modelFxSpawn` ×2 → 真 VfxSystem/ModelFxRig → 真 `revivehuman.glb`/`flamestrike1.glb`。
內容經 `workingTreeSource()`（逐檔讀工作樹；`_index.json` 缺的兩份 model doc 補索引列，
`content:build` 落地後該段為 no-op —— 見 `beamAuditionWorld.ts` 檔頭）。

| 擷圖 | tick | 亮像素(>200) | lit(>96) | 說明 |
|---|--:|--:|--:|---|
| shot0_baseline_precast | 0 | **0** | 0 | 施放前基線（黑場+替身） |
| shot1_tick37_birth | 37 | 55 | 100 | cast resolve：12 具節點已擺好（座標正確），glb 仍在串流（vertices 0）；亮的是施放 vfx |
| shot2_tick38_glb_loaded | 38 | **1384** | 3060 | GH#673-①c 回填生效：revivehuman 340v×6＋flamestrike1 425v×6 全部有幾何 |
| shot3_tick58_midlife | 58 | 1208 | 2725 | 沿線 6 點（x=-40..-30，間距 2）雙層演出持續 |
| shot4_tick88_latelife | 88 | 1200 | 2695 | lifeSec 2（60 tick）內持續可見 |
| shot5_tick118_expired | 118 | 34 | 189 | 到期回收：enabled beam 0，殘亮為施放 vfx 尾段 |

節點座標（stats() 逐具）：revivehuman ×6 @ y=1.40（`fxSpawnHeight 0.55 × scale 2.5`），
flamestrike1 ×6 @ y=0（貼地火柱），兩層皆 x ∈ {-40,-38,-36,-34,-32,-30}＝**間距 2.0 ×
6 具**＝原作 `A03S` 的 `i×200`（÷100）。

已知誠實限制：ReviveHuman 的上升星柱/雙螺旋星屑住 PRE2 emitter＋骨架動畫（轉換器
skip PRE2；螺旋位移在骨架），所以主體呈星芒面片而非完整星柱；FlameStrike1 的火焰柱
噴發同理 —— 幾何（金色螺旋帶）在、粒子不在。⇒ 機制③（動畫剪輯播放）與 emitter 重製
是下一批（`M4_temp_20260825.md` §機制③）。
