# 火圈：最後一個人類死亡 → **立即**開始縮圈（GH#659 · #643）

> owner GH#659（對 #643 的更正，逐字）：「場地只剩 bot 的話 不管有沒有殭屍王
> **火圈都會立即出現縮圈**」

台子：`apps/client/public/feature-proof-audition.html?scenario=firering`。
鏈路：出貨 `config.match@1.match.fireRing` → 出貨 `fireRingRulesFromConfig()`
→ 出貨 `fireRingSystem`（跑在 `world.step()` 裡）→ 出貨 `currentFireRingRadius()`
→ 出貨 `render/vfx/FireRingFx.tick()`。

量尺自證：`calibrate()` = **462,400** 亮像素（1280×720）。俯視機位，⭐ 半徑逐幀變小
在畫面上就是那條橘色帶往內收。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| r0_humans_alive_dormant | 0 | 0 | 0 | 人類還在打：出貨點火 `startTicks=1800`（**60 秒**），半徑仍是場界 **24** ⇒ `FireRingFx` 刻意不畫（「在牆上畫一道火牆是雜訊」） |
| r1_last_human_dies | 0 | 0 | 0 | 最後一個人類死亡那一 tick：`startTicks` 被夾到 **90**（＝現在＋`botOnlyRingAccelSec` **0** 秒）。**這一幀還沒動** —— 半徑等於場界 |
| **r2_shrink_1s** | 0 | **19,405** | 21,031 | +1 秒：半徑 **23.00** < 場界 ⇒ 火圈帶亮起來（rim emitter **12** 具）。⭐ 0 → 19,405 就是「立即」那一下 |
| r3_shrink_3s | 0 | 19,959 | 21,666 | +3 秒：半徑 **21.00** |
| r4_shrink_8s | 0 | 24,180 | 26,266 | +8 秒：半徑 **16.00** —— 帶子隨 `progress` 變亮變厚 |
| r5_shrink_16s | **13,239** | 14,766 | 15,428 | +16 秒：半徑 **8.00**，接近第一段的 4.0 口袋（周長變短 ⇒ lit 下降、alpha 拉滿 ⇒ bright 上來） |

半徑序列 **24 → 23 → 21 → 16 → 8**，⛔ 不是台子算的：每一格都是
`currentFireRingRadius(world, 0)` 在 `world.step()` 之後讀回來的。

## ⚠️ 誠實的分界（這一批**沒有**驗到的那一半）

`accelFireRingForBotOnly()`（**誰算人類**、`humanSeat` vs `driverKind`、
哪個 zone 還在打、全 bot 沙盒不觸發、冪等單向夾）住
`apps/game-server/src/match/MatchController.ts:4292`，⛔ **不在客戶端 bundle 裡**
（它要整個 `MatchController` ＋ colyseus ＋ seat 表）。

⇒ 這一頁量的是它**唯一那一行行為**之後玩家看到什麼：

```ts
const cap = world.fireRingTicks + Math.round(botOnlyRingAccelSec * TICK_HZ);
rules.startTicks = Math.min(rules.startTicks, cap);      // ← 台子鏡照的就是這一行
```

⭐ 而 `botOnlyRingAccelSec`（**0**）與 `botOnlyRingAccelEnabled`（**true**）都是
從出貨 `content/config/arena-rules.json` 經 `Configs` 讀回來的，⛔ 不是字面值。
「誰算人類」那一半由既有的 server 側守衛管，本批⛔ 不宣稱驗過它。

| 讀數 | 值 |
|---|---|
| `botOnlyRingAccelSec`（出貨） | **0**（＝立刻點火） |
| `botOnlyRingAccelEnabled`（出貨） | **true** |
| 出貨 `startTicks` | 1,800（60 秒） |
| 夾之後 `startTicks` | **90**（＝當下的 `fireRingTicks`） |
| zone 半徑 | 24 |
