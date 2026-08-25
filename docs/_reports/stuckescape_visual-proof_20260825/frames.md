# 互卡脫困保險絲：黏 2 秒 → 穿過去（⛔ 但「脫困」兩個字**零像素**）（GH#677）

> owner 2026-08-24（逐字）：「黏超過 N秒一定可以離開之類，這些機制做成後台開關，
> 目前 **N 預設2秒**」

台子：`apps/client/public/feature-proof-audition.html?scenario=stuckescape`。
鏈路全部是出貨的：真 `SimWorld.step()`（出貨 `DEFAULT_COMBAT_FEEL`，保險絲預設開、N=2）
→ 出貨 `MovementSystem` 的分離 pass ＋ `stuckEscape` 放行窗
→ sim 真的 `floatingText` → 出貨 `VfxSystem.handleEvent`。
座標與指令**逐字照抄**出貨守衛 `packages/shared/src/sim/stuckEscape.test.ts` 的第①條。

量尺自證：`calibrate()` = **462,400** 亮像素（1280×720）。
⚠️ 替身圓柱只是**看得出誰在哪**的觀景窗，它們的座標**逐 tick 從 `world.transform` 讀** ——
所以下表的 lit/faint 量的是「兩具身體在畫面上的位置與重疊程度」，⛔ 不是台子畫的動畫。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| s0_baseline_tick0 | 0 | 17,532 | 54,033 | 基線：兩位隊友面對面（A x=**-44**、B x=**-42.8**），各自的終點在對方的另一邊 |
| s1_stuck_2s_tick60 | 0 | 15,797 | 48,807 | 互卡滿 2 秒（門檻）：A x=**-43.87**、B x=**-42.93** —— 幾乎沒動，保險絲**還沒**跳（前提自證：這個互卡是真的） |
| **s2_fuse_fires** | 0 | 19,109 | 54,591 | 保險絲在 tick **64** 跳（本張是 tick 72，跳後 8 tick）：sim 真的發了 **2** 則「脫困」`floatingText`，出貨 `VfxSystem` 的池裡有 **2** 個活著的字 —— ⛔ **而畫面上一個像素的字都沒有**（見紅字）。⭐ 兩具身體**已經換邊**（s1 是棕左藍右，這一張是藍左棕右）＝ phasing 真的放行了 |
| s3_phasing_mid | 0 | 22,979 | 58,990 | 放行窗過後、走到一半：兩具身體維持換邊後的順序繼續拉開 |
| s4_passed_through | 0 | 24,082 | 61,370 | 到站：A x=**-38.00**（出發時 B 在 -42.8）、B x=**-47.96**（出發時 A 在 -44）—— 兩人都走到對方的另一邊 |

⚠️ s3 刻意取在**半路上**：放行之後正好 30 tick 他們就走完全程，取在那裡的話
s3 會與 s4 **逐位元相同**（第一輪實測 sha1 一致）—— 一組連續圖片裡出現重複幀，等於少一張證據。

## ⛔⛔ 紅字：「脫困」兩個字**沒有任何東西在畫**（本批量到，⛔ 不是推測）

`s2_fuse_fires` 上：sim 發了 2 則 `floatingText`、出貨 `VfxSystem` 收下了、
`FloatingTextFx` 的池裡 **2 個 entry 是 active 的** —— 而截圖上沒有字。

根因（`grep` 得到的，全 repo）：

| 環節 | 狀態 |
|---|---|
| `sim/stuckEscape.ts` 發 `floatingText` | ✓ |
| `eventFanout` 白名單放行 | ✓ |
| `VfxSystem` 有 `case "floatingText"` → `this.floatingText.spawn(...)` | ✓ |
| `FloatingTextFx` 算出 text / 座標 / lift / alpha / lane | ✓ |
| **有沒有人讀 `VfxSystem.floatingTextEntries`** | ⛔ **只有 `screenCueKnobs.test.ts` 一個測試**，出貨路徑**零消費端** |

⇒ 這是 CLAUDE.md 第二守則失敗形態 **②（算出來了但從沒送到畫面）**＋**⑧** 的合體。
⚠️ 而且 `packages/shared/src/sim/stuckEscape.ts:173` 與
`packages/shared/src/sim/combat/hitstopHold.ts:398` 兩處註解**逐字寫著**
「客戶端 `FloatingTextFx` **真的在畫**」—— 那兩句話是假的（第三守則：註解會說謊）。
⚠️ `ui/WorldAnchorLayer.tsx` 畫的是 `ui/combatText`（**傷害數字**），
與 `floatingText` 是兩套東西，⛔ 不要拿它當消費端。

⇒ **這一批只證明了「穿過去」那一半。**「頭上冒字」那一半 ⛔ **未驗收**，
而且它影響的**不只**脫困 —— `floatingText` 這條事件路上的**每一個**技能文案
（克勞德的 `1Hit`…`7Hit` 那一族）今天都是零像素。
