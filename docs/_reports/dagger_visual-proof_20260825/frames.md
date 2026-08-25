# 幻之匕首：普攻 → 3% 觸發 → 受害者**背後**噴血 → 消散（GH#696 · #641）

> owner 2026-08-24（逐字）：「幻之匕首真的會造成20%傷害嗎 => 你真的測試過嗎?
> 如果觸發效果可否追加**明顯特殊特效**（例如**受傷角色背後大量噴血**）」

台子：`apps/client/public/feature-proof-audition.html?scenario=dagger`。
鏈路全部是出貨的：真 `SimWorld`（種子 **7**）→ 出貨 `godie-o02l` 鏡像對決真普攻
→ 出貨 `content/items/godie-i039.json` 的 passive **真的擲中 3%**
→ sim 真的 `vfxSpawn` → 出貨 `VfxSystem.handleEvent` → 出貨
`content/vfx/fx.prim.blood.spray-back.json`。⛔ 沒有合成 payload、⛔ 沒有把機率改成 1。

量尺自證：`calibrate()` = **462,400** 亮像素（1280×720）。
⭐ 粒子時間走 `scene.useConstantAnimationDeltaTime`（每 `render()` 固定 16ms）——
⚠️ **這一格是被踩出來的**：血花壽命只有 **0.22–0.62 秒**，而「量→PNG→POST」一張
要 0.3–0.8 秒 ⇒ 用牆鐘的話第二張圖上血就散光了，一個好好的特效會被量成
「只有出生那一幀看得到」。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| d0_baseline_tick0 | 0 | 1,720 | 42,440 | 基線：持有者（金）與受害者（藍）站定，還沒開打 |
| d1_quiet_swings_tick20 | 0 | 1,720 | 42,440 | 普攻已經在互砍 20 tick，3% 還沒擲中 —— 場上**沒有**血花，逐位元同基線 |
| **d2_trigger_spray_born** | **2,615** | **5,730** | 46,839 | 3% 在第 **1,574** tick 擲中：出貨 `vfxSpawn` 落地，池名 `vfx-fx.prim.blood.spray-back@aim90`（`@aim90` ＝瞄準真的套上了） |
| **d3_spray_0_2s** | **2,402** | **9,899** | 58,120 | 噴血約 0.2 秒：96 顆 burst 沿 26° 錐口往受害者**背後（+x，遠離攻擊者）**拉成紅色 trace |
| d4_spray_0_6s | 0 | 1,807 | 44,868 | 壽命尾段：`gravityY -6` 把殘粒往下帶，`sizeStops` 收到 0、alpha 收到 0 |
| d5_dissipated | 33 | 1,922 | 42,364 | 消散：`particles.length = 0`，畫面回到只有兩具替身 |

⭐ **A/B 就在表裡**：d1（同一場、同一機位、觸發前）0 亮像素 → d2/d3 **2,615 / 2,402**。
Δ 就是血花本體的像素，⛔ 不需要另外做一組對照。

## 讀數（sim 側，出貨事件流）

| | |
|---|---|
| 觸發 tick | **1,574**（種子 7，⛔ 不是寫死的 —— 逐 tick 掃到擲中那一格） |
| 事件直方圖 | `basicAttack 42` · `damage 44` · `hitImpact 44` · `knockdown 1` · **`vfxSpawn 2`** |
| 觸發當下兩邊存活 | holder ✓ · victim ✓ |
| 池名 | `vfx-fx.prim.blood.spray-back@aim90` |
| 血花文件 | burst 96 · cone 26° · `lifetimeSec 0.22–0.62` · `blendMode additive` · `gravityY -6` · `stretched` `tailLength 3.2` · `orient.yawFrom "aim"` `pitchDeg 25` |

## ⚠️ 與出貨守衛唯一不同的一格（⛔ 它不碰擲骰）

`daggerBloodSprayRenders.test.ts` 在 node 只載 6 個集合，第 **15** tick 就擲中；
瀏覽器載的是**全部**出貨內容（含一整排 `config.*`），RNG 消耗序不同 ⇒ 3% 落在第 1,574 tick。
⚠️ 在那之前受害者早被砍死、`attackTarget` 清掉 ⇒ 從此不再有普攻 ⇒ 「4,000 tick 一次都沒中」。
⇒ 台子把兩邊血量墊到 4,000,000 讓對打持續。**⛔ 不改機率、⛔ 不改綁定、⛔ 不改 vfx 文件。**

## ⛔⛔ 紅字：這一批登記的 rollback 開關**現在還關不掉它**

登記用的是 `config.gore@1.style`（`blood` → `off`），⚠️ 而 `VfxSystem` 的
`resolveGore()` 只閘 **`hitImpact`** 那條血路（`VfxSystem.ts:1396`），
⛔ **不閘 `vfxSpawn`** —— 選「無血」的玩家仍然會看到匕首噴血（lane K 2026-08-24 已記）。

⭐ 真正「一鍵關」的位置是 `content/items/godie-i039.json` 的
`passive[0].effects` 裡那條 `spawnVfx`（**刪即關**，編輯器可編），
⚠️ 但 `tools/review/features.mjs` 的 `SWITCH_DIRS` 只認 `content/config` 與
`content/ability-templates` ⇒ 那條 dot path 登記閘解析不到。
⇒ 正解是 **`vfx@1` 加一格可選 `gore: true`**（文件宣告「我是血」→ 依 gore 設定降級/停播），
⛔ 不是 id 名單；那是 GH#685 的候選票，本 lane ⛔ 未實作。
