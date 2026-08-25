# 幻之匕首：普攻 → 3% 觸發 → 受害者**背後**噴血 → 消散 →（翻開關）**一顆都不生**（GH#696 · #641 · #702）

> owner 2026-08-24（逐字）：「幻之匕首真的會造成20%傷害嗎 => 你真的測試過嗎?
> 如果觸發效果可否追加**明顯特殊特效**（例如**受傷角色背後大量噴血**）」

> **這一份是第二版（2026-08-25 重產）。** 第一版（S7）登記的 rollback 開關
> （`config.gore@1.style`）當時**是壞的** —— `resolveGore()` 只閘 `hitImpact` 那條血路，
> ⛔ 不閘 `vfxSpawn` ⇒ 選「無血」的玩家照樣看得到匕首噴血。#702 把閘搬進
> `VfxSystem.play()`、判準住**文件身上**（`vfx@1.gore`）之後，這一版多了 **d6**：
> ⭐ 同一顆種子、同一條 3%、**翻開關之後一顆粒子都不生**。

台子：`apps/client/public/feature-proof-audition.html?scenario=dagger`（1280×760）。
鏈路全部是出貨的：真 `SimWorld`（種子 **7**）→ 出貨 `godie-o02l` 鏡像對決真普攻
→ 出貨 `content/items/godie-i039.json` 的 passive **真的擲中 3%**
→ sim 真的 `vfxSpawn` → 出貨 `VfxSystem.handleEvent` → 出貨
`content/vfx/fx.prim.blood.spray-back.json`（`gore: true`）。
⛔ 沒有合成 payload、⛔ 沒有把機率改成 1、⛔ 沒有手改 vfx 文件。

量尺自證：`calibrate()` = **515,524** 亮像素（全亮 quad @1280×760）。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| d0_baseline_tick0 | 0 | 1,919 | 47,286 | 基線：持有者（金）與受害者（藍）站定，還沒開打 |
| d1_quiet_swings_tick20 | 0 | 1,919 | 47,286 | 普攻已經在互砍 20 tick，3% 還沒擲中 —— 場上**沒有**血花，與基線 sha1 一致 |
| **d2_trigger_spray_born** | **2,972** | **6,534** | 52,618 | 3% 在第 **1,574** tick 擲中：出貨 `vfxSpawn` 落地，池名 `vfx-fx.prim.blood.spray-back@aim90`（`@aim90` ＝瞄準真的套上了） |
| **d3_spray_0_2s** | **2,856** | **10,575** | 64,466 | 噴血約 0.2 秒：96 顆 burst 沿 26° 錐口往受害者**背後（+x，遠離攻擊者）**拉成紅色 trace |
| d4_spray_0_6s | 0 | 2,084 | 50,246 | 壽命尾段：`gravityY -6` 把殘粒往下帶，`sizeStops` 收到 0、alpha 收到 0 |
| d5_dissipated | 47 | 2,083 | 47,226 | 消散：血花池 `particles.length = 0`，畫面回到只有兩具替身 |
| **d6_gore_off_same_trigger** | 316 | 2,292 | 47,028 | ⭐ **翻開關**（`config.gore@1.style` `blood` → `off`，走出貨的 `applyGoreDoc()`）之後，同一條 3% 在第 **2,942** tick **又擲中一次**：sim 照樣發 `vfxSpawn`、出貨 `VfxSystem` 照樣收到，而 `play()` 直接回 null ⇒ **場上活粒子 0（`liveSystems` 空陣列）** |

⭐ **A/B 全在表裡，⛔ 不需要另做對照組**：
d1（觸發前）**0** → d2/d3（觸發）**2,972 / 2,856** → d6（翻開關後同一次觸發）**血花 0 顆**。

⚠️ **d6 那 316 個亮像素⛔ 不是血**：那一格 `liveSystems` 是**空的**（全場沒有任何
粒子系統有活粒子）。兩具替身走了 2,942 tick，站位與基線不同 —— 亮的是**替身本身**。
⭐ 血的證據是 `goreOffLiveParticles: 0`，⛔ 不是「畫面全黑」。

## 讀數（sim 側，出貨事件流）

| | |
|---|---|
| 第一次觸發 tick | **1,574**（種子 7，⛔ 不是寫死的 —— 逐 tick 掃到擲中那一格） |
| 翻開關後再次觸發 tick | **2,942** |
| `goreStyleShipped` → `goreStyleFlipped` | `blood` → `off` |
| 翻開關後血花活粒子 | **0** |
| 翻開關後全場活著的粒子系統 | **[]**（空） |
| 池名（blood 時） | `vfx-fx.prim.blood.spray-back@aim90` |
| 血花文件 | `gore: true` · burst 96 · cone 26° · `lifetimeSec 0.22–0.62` · `blendMode additive` · `gravityY -6` · `stretched` `tailLength 3.2` · `orient.yawFrom "aim"` |

⭐ 粒子時間走 `scene.useConstantAnimationDeltaTime`（每 `render()` 固定 16ms）——
⚠️ 這一格是被踩出來的：血花壽命只有 **0.22–0.62 秒**，而「量→PNG→POST」一張要
0.3–0.8 秒 ⇒ 用牆鐘的話第二張圖上血就散光了，一個好好的特效會被量成
「只有出生那一幀看得到」。

## ⚠️ 與出貨守衛唯一不同的一格（⛔ 它不碰擲骰）

`daggerBloodSprayRenders.test.ts` 在 node 只載 6 個集合，第 **15** tick 就擲中；
瀏覽器載的是**全部**出貨內容（含一整排 `config.*`），RNG 消耗序不同 ⇒ 3% 落在第 1,574 tick。
⚠️ 在那之前受害者早被砍死、`attackTarget` 清掉 ⇒ 從此不再有普攻 ⇒ 「4,000 tick 一次都沒中」。
⇒ 台子把兩邊血量墊到 4,000,000 讓對打持續。**⛔ 不改機率、⛔ 不改綁定、⛔ 不改 vfx 文件。**

## 這一批宣稱什麼、⛔ 不宣稱什麼

| ✅ 宣稱（有終端像素證據） | ⛔ 不宣稱 |
|---|---|
| 3% 觸發時**受害者背後真的噴出一蓬紅血**（2,972 / 2,856 亮像素） | ⛔ 不宣稱那 20% 傷害的數字對不對（那是 sim 守衛的事，⛔ 不是像素能回答的） |
| ⭐ 登記的 rollback 開關（`gore.style`）**現在真的關得掉它**（#702 已驗收） | ⛔ 不宣稱其他血路（`hitImpact`）的表現 —— 那一條本來就受同一格管 |
