# 光束砲終端驗收 —— 逐張亮像素（GH#673，2026-08-24）

台子：`public/beam-audition.html`（出貨 SimWorld → 出貨 09-04 龜派氣功 → 真
`modelFxSpawn` → 出貨 `VfxSystem`/`ModelFxRig` → 真 `netherstrike.glb`）。
量尺先自證：`calibrate()` 全亮 quad = **462,400** 亮像素（1280×720）；基線場景 = **0**。
亮像素 = max(R,G,B) > 200；lit = > 96。tick→秒 = tick/30。

| 圖 | 施放 | beam 秒齡 | 亮像素 | lit | 場上 beam 節點 |
|---|---|---:|---:|---:|---|
| t0_baseline_tick0 | — | — | 0 | 0 | 無 |
| t1_spawn_tick37 | 第 1 發（詠唱 1.233s 後） | 0.0 | **0** | **0** | node-0 **頂點 0**（glb 還在載） |
| t1b_spawn_plus2.5s_wallclock | 第 1 發 | 0.0（牆鐘 +2.5s） | 405 | 633 | node-0 **仍然頂點 0**（⛔ 幾何不回貼）；亮的是 onArrive 爆炸粒子 |
| t2_beam_0.5s_tick52 | 第 1 發 | 0.5 | 500 | 931 | node-0 頂點 0 |
| t3_beam_1.0s_tick67 | 第 1 發 | 1.0 | 522 | 1,186 | node-0 頂點 0 |
| t4_expired_tick98 | 第 1 發 | 2.03（模板 lifeSec=2 **應已消失**） | 652 | 1,558 | node-0 **還開著**（實測壽命 4.97s） |
| t8_cast2_reusedNode_0.5s_tick238 | 第 2 發（glb 已載完 ~6s） | 0.5 | 516 | 1,243 | **重用毒池 node-0，頂點 0 ⇒ 光束整發看不見** |
| t9_cast3_freshNode_spawn_tick281 | 第 3 發（與第 2 發重疊 ⇒ 池空 ⇒ 新節點） | 0.0 | 379 | 1,300 | node-1 **頂點 425**（shader 還在編譯） |
| t10_cast3_beam_visible_tick289 | 第 3 發 | 0.27 | 651 | 1,459 | node-1 可見 |
| t11_cast3_beam_later_tick304 | 第 3 發 | 0.77 | 658 | 1,578 | node-1 可見；rotZ 3.77→10.05 rad/0.5s = **720°/s** ✓ |
| **t13_AB_beam_OFF_tick305** | 第 3 發（A/B：關 node-1） | 0.8 | **9** | 224 | 只剩命中粒子 |
| **t14_AB_beam_ON_tick305** | 第 3 發（A/B：開 node-1） | 0.8 | **550** | 1,717 | **Δ亮 +541 / Δlit +1,493 = 光束本體的像素** |
| t15_all_expired_tick430 | 全部到期 | — | 0 | 0 | 兩節點都關（node-1 壽命 149 tick = **4.97s**） |

姿態（node-1，出貨接縫）：位置 **(-40, 0, 0) 兩次讀數逐位相同**（static 不位移 ✓）、
yaw **90°**（長軸躺在施放方向 +x ✓）、世界包圍盒 x −40.33…−36.08（**沿開火方向伸出 4.25 格** ✓）、
y **−2.55…+2.54 ⇒ 下半埋在地下**（`imported.netherstrike` 沒有 `fxSpawnHeight`）。

結論與根因見 `docs/_reports/BA_temp_20260824.md`。
