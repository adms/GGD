# 42-04 世界終結（`godie-n003.r`）：詠唱 → 十二向放射 → 到點冰爆 → 到期（GH#695）

台子：`apps/client/public/feature-proof-audition.html?scenario=endworld`（1280×760）。
鏈路全部是出貨的：真 `SimWorld` → 出貨 `castAbility()`（`castType: skillshot`，方向 +x）
→ 出貨 `content/abilities/godie-n003.r.json` 的 6 個 effects
（`spawnProjectile imported.wave` · `floatingText` · `delayed` ×3 ·
`spawnModelFx preset "tpl-radial-burst"`）
→ 出貨 `VfxSystem` ＋ 出貨 `ModelFxRig`。
⭐ preset 的欄位（modelKey `imported.frostnova` / **count 12** / path `radial` / speed 6 /
distance 4.5 / scale 3）在載入時補齊，⛔ 技能 JSON 一格都沒抄。

量尺自證：`calibrate()` = **515,524** 亮像素。取樣點用事件對齊（⛔ 不猜 tick）。

## 逐張

| 圖 | 亮像素(>200) | lit(>96) | faint(>32) | 說明 |
|---|---:|---:|---:|---|
| e0_baseline | 0 | 2,234 | 29,685 | 基線：兩名敵人站在施放方向上 |
| e1_windup | 0 | 2,234 | 29,746 | 施放後 30 tick：1.233 秒詠唱中，畫面上什麼都沒有（對照組） |
| **e2_resolve** | **164,206** | **616,541** | 884,458 | 詠唱解算（第 39 tick）＋10：`spawnProjectile` ＋ **12 具 `imported.frostnova` 一次擺好**（radial），近鏡頭下佔滿畫面 |
| **e3_burst** | **126,155** | **558,730** | 913,940 | 放射中（第 57 tick）：12 具沿 radial 路徑外擴（6 u/s × 4.5 格 ≈ 0.75 秒），`onTouch` 掛 `slow50` |
| **e4_arrive** | **31,473** | **41,495** | 72,913 | ⭐ **到點**（等第 6 記 `vfxSpawn`，實測 12 記同在第 62 tick）＋3：**12 池 `vfx-fx.prim.ice.nova` 各 40 顆活粒子** ＋ 12 記 `screenShake` |
| e5_expired | 0 | 2,234 | 29,746 | 到期：投射物與 12 具模型全部收掉（逐位元同 e1） |

⭐ **A/B 就在表裡**：e1 **0** → e2/e3/e4 **164,206 / 126,155 / 31,473** → e5 **0**。

## 演出時間軸（出貨事件流）

```
tick 39  projectileSpawn ＋ modelFxSpawn ＋ projectileHit
tick 62  vfxSpawn ×12                      ← 12 具到點，各自 onArrive 一記 fx.prim.ice.nova
```

事件直方圖：`damage 13` · `hitImpact 13` · `vfxSpawn 12` · `screenShake 12` ·
`floatingText 4` · `projectileSpawn 1` · `projectileHit 1` · `projectileEnd 1` ·
`modelFxSpawn 1` · `statusApplied 1`。

⚠️ **一個量測坑（留給下一個人）**：`e4` 第一版拍在「事件那一格 ＋1 tick」，量到
**0 亮像素**、`liveSystems` 空陣列 —— 看起來就像「12 記 nova 根本沒畫」。
⭐ 真相是**粒子池要多走一兩個 update 才吐得出第一批粒子**：改成 **＋3 tick** 之後
同一格量到 **31,473 亮像素、12 個池各 40 顆**。
⇒ 「亮像素 0」在下結論之前，先看 `liveSystems`：**沒有生**與**生了還沒吐**是兩件事。

## 這一批宣稱什麼、⛔ 不宣稱什麼

| ✅ 宣稱（有終端像素證據） | ⛔ 不宣稱 |
|---|---|
| `tpl-radial-burst` 的 **12 具模型真的一次擺好、真的外擴、真的在到點炸開** | ⛔ 不宣稱 `imported.wave` 投射物本體畫得出來（它⛔ 不在 `content/models/_index.json` 裡，走的是投射物那條路，⛔ 不是 modelFx） |
| 到點的 12 記 `fx.prim.ice.nova` ＋ 12 記 `screenShake` 真的發出來且真的有粒子 | ⛔ 不宣稱三段 `delayed` 各自的視覺 |
| 到期後場面**完全收乾淨**（逐位元同施放前） | ⛔ 不宣稱畫面被 12 具模型佔滿是否「太滿」—— 那是 owner 的批核題（`params.count.default`） |
