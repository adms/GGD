# crescent（大紅蓮斬）×5 — 連續圖片驗收（GH#688 Phase 6 · CRESCENT lane · 2026-08-25）

台子：`apps/client/public/beam-audition.html?ability=godie-n01c.r`（client-beam :39673），
量尺先過 `calibrate()`（全亮 quad **173,056** 亮像素 > 0 ⇒ 量尺自證，CLAUDE.md 👁 節）。
鏈路：真 SimWorld → 出貨 `godie-n01c.r`（castAbility，castType targeted → enemyIds[0]）→ 真
`modelFxSpawn` → 真 VfxSystem/ModelFxRig → 真 `crescent.glb`（既有 map-imported mesh-only，
5 primitive 中 4 個是轉檔器軟刪除、**1 個帶貼圖的存活刃面**——本批釘住的靜態不變量）。
內容經 `workingTreeSource()` 逐檔讀工作樹（`imported.crescent` 已在出貨 models `_index`，零索引補列）。

| 擷圖 | tick | lit(>96) | bright(>200) | 說明 |
|---|--:|--:|--:|---|
| shot0_baseline_tick0 | 0 | **0** | 0 | 施放前基線（黑場＋替身） |
| （第一輪施放） | 20–35 | 0 | 0 | ⚠️ 事件已發（spawns=1，詠唱 0.667s＝20 tick）但 **glb 首次串流 > 飛行 0.4s** ⇒ 第一發整段 0 lit（誠實限制，見下） |
| shot1_midflight_crescent | 59 | **986** | **218** | 重放（glb 已快取）：彎月刃在飛行中，目視可辨（白銀刃面＋暖色環） |
| shot2_AB_crescent_disabled | 59 | 420 | **0** | ⭐ A/B：**只關 `modelfx-imported.crescent-0`** ⇒ 986→420、bright 218→**0** ⇒ 566 lit＋全部 bright 像素來自 crescent |
| shot3_AB_reenabled | 59 | 986 | 218 | 重新啟用 ⇒ 逐數字回到 A 態（量測可重現） |
| shot4_expired | 73 | **0** | 0 | 到期（distance 12 ÷ speed 30 ＝ 0.4s＝12 tick）：節點自動 disabled、畫面回基線 |

⭐ 判讀：**crescent 單獨貢獻 566 lit ＋ 全部 218 bright**（殘餘 420 lit 是 blink onArrive 的
`fx.prim.physical.slash` 原語）；到期回收乾淨（0 lit、節點 disabled）。

已知誠實限制：
1. **首發串流競速**——crescent.glb（203KB）首次載入約 1 秒 > 飛行 0.4 秒 ⇒ 一場比賽裡
   **第一次施放可能整段看不到刃**，第二發起可見（AssetManager 快取）。這是 modelFx 家族的
   既有性質（TORNADO 首 tick 同款、但其 lifeSec 2.5s 蓋得過），對 travel 短飛行族特別痛 ——
   已列 owner 裁決項（預載或接受）。
2. 4/5 primitive 是轉檔器軟刪除（原作的 glow 掃面），畫面上是**單刃面**而非原作的多層光暈 ——
   與 netherstrike/revivehuman 同款的既有轉換限制，重烘 emitter 是既有的下一批。
3. 渲染為**未染色**白銀刃（w3a missile 無 tint 證據）；紅 tint 屬於五隻未接線的 87-01 dummy，
   曹操出貨那天才輪到它們（守衛 `locustCrescent.test.ts` 第三條釘著）。
