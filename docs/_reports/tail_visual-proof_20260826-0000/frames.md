# 蝗蟲群長尾五族 — 連續圖片驗收（GH#688 Phase 6 · TAIL lane · 2026-08-26）

台子：`apps/client/public/beam-audition.html?ability=<id>`（`client-beam` :39673），
量尺先過 `calibrate()`：全亮 quad **462,400** 亮像素 > 0 ⇒ 量尺自證，之後的每一個讀數才算數。
鏈路：真 `SimWorld` → 出貨技能（`castAbility`，走真的詠唱條）→ 真 `modelFxSpawn` 事件 →
真 `VfxSystem`/`ModelFxRig` → 真的 `.glb`。內容經 `workingTreeSource()` 逐檔讀工作樹。

## ⭐ 這一批要用「A/B 像素差分」尺，⛔ 不是亮像素尺

五族裡有四族是**近黑或低對比**的演出（重力球 tint [0.3922,0,0]、封絕結界 [0.3922,0.3922,0.3922]、
水刺是暗青、黑焰是灰白半透明）。亮像素尺（通道 >96）對它們**數學上永遠是 0**，
所以每一列的讀數是 **rig `setEnabled` on/off 兩幀逐像素比對**（任一通道差 >8 記一點），
而且每一列都附一個 **control**（同一幀把 `caster` 方塊關掉再比）當作「一個確實看得見的東西
在這台量尺上值多少」的比例尺。⚠️ 有兩具模型是**會動的**（netherstrike 在長大、
aquaspikeversion2 的 Birth 是一次性噴發），所以取的是 10–26 幀序列裡的**峰值**，⛔ 不是單幀。

## 逐格讀數（差分＝這一具模型獨自造成的像素改變量）

| 擷圖 | 落點 | 差分 | control | 說明 |
|---|---|--:|--:|---|
| shot1_hvwd-ex_02-002_aquaspike_bright | godie-hvwd.ex（02-002 神通眼 ← h032） | **9,152** | 4,691 | 施法者**正前方 1.6** 的青藍水刺，bbox 高 **8.00**、寬 1.10（＝JASS `SetUnitScalePercent(800)` 逐字）。⭐ 目視可辨，差分是 control 的 1.95 倍 |
| shot1_hvwd-ex_02-002_aquaspike_diff | 同上（A/B 差分幀） | 9,152 | — | rig 全關掉的那一幀相減 ⇒ 這 9,152 px 全部來自 aquaspikeversion2，⛔ 不是技能自己的 vfx |
| shot2_hvwd-r_02-04_aquaspike_bright | godie-hvwd.r（02-04 ← h032 @HudGhosts） | **2,122** | 4,933 | scale 3（`SetUnitScalePercent(300)`）· lifeSec 6（`TimedLife 6.00`）· **步進 200 tick 後場上 rig = 0** ⇒ 到期回收乾淨 |
| shot2_hvwd-r_02-04_aquaspike_diff | 同上（A/B 差分幀） | 2,122 | — | ⚠️ 修**之前**同一支只有 **120** px（見 §缺陷①） |
| shot3_osam-ex_34-002_blackhole1_bright | godie-osam.ex（34-002 冥道殘月破 ← o01N） | **1,171** | 6,859 | 施法者腳下 **2.50 寬**的暗紅重力盤（3 個 prim，其中 1 個是原作就軟刪除的）· lifeSec 7（`sleep 6 + sleep 1 → KillUnit`） |
| shot3_osam-ex_34-002_blackhole1_diff | 同上（A/B 差分幀） | 1,171 | — | 抬高 0.25／1.0 世界單位再量＝1,024／893 ⇒ **不是 z-fighting**，就是一張暗紅的平盤 |
| shot4_edem-ex_45-002_netherstrike_bright | godie-edem.ex（45-002 天照 ← h030） | **33,619** | 5,683 | 施法者頭上綻開的黑焰球（5/5 prim，bbox 5.97×5.96）· 14 幀序列 29,623→33,619 **單調成長** ⇒ 它是一個會長大的演出 |
| shot4_edem-ex_45-002_netherstrike_diff | 同上（A/B 差分幀） | 33,619 | — | ⚠️ 取樣早 0.3 秒只有 **569** px —— 這一族**必須取峰值**，單幀會誤判成「幾乎看不見」 |
| shot5_hvsh-r_48-04_midchilderaura_bright | godie-hvsh.r（48-04 ← h02D） | **98,545** | 78,235 | ⭐ `spawns=3`：QUAD 綁的兩具 tome ＋ 本批的粉紫魔法陣（bbox **10.42 寬**，圓心在施法者**前方 1.0**＝`PolarProjectionBJ(...,100,facing)`） |
| shot5_hvsh-r_48-04_midchilderaura_diff | 同上（A/B 差分幀） | 98,545 | — | ⚠️ control 也很大（兩具 tome 蓋住施法者）⇒ 這一列的比例尺意義較弱，看圖為準 |
| shot6_e008-r_21-04_grandorcaura_bright | godie-e008.r（21-04 討滅封絕 ← o015） | **6,175** | 4,585 | 施法者腳下 **3.10 寬**的紅色結界環（4 prim，2 個是原作軟刪除的）· lifeSec 6＝`sleep lvl*4+2` 的 rank1 |
| shot6_e008-r_21-04_grandorcaura_diff | 同上（A/B 差分幀） | 6,175 | — | 序列 6,175→5,991 緩降（結界在轉） |
| shot7_emfr-ex_15-002_aquaspike_bright | godie-emfr.ex（15-002 ← o02Y） | **534** | 4,792 | 施法者**旁邊 1.0** 的青藍水刺（scale 2 · lifeSec 3＝`RemoveUnitSP(u,3,1)`） |
| shot7_emfr-ex_15-002_aquaspike_diff | 同上（A/B 差分幀） | 534 | — | ⚠️ 修**之前**是 **0**（見 §缺陷②） |

## ⛔ 差分尺當場抓到的兩個「說了但不會發生」（都已修，⛔ 沒有它會全綠出貨）

### ① 02-04（godie-hvwd.r）：整支水刺被施法者方塊遮掉
原作 `CreateNUnitsAtLoc(1,'h032',…, GetUnitLoc(GetTriggerUnit()), …)` ＝**施法者自己的位置**，
而 `tpl-locust-orb` 的 `distance` 預設 0.1 ⇒ 引擎把它擺進施法者體內。
逐格量：`distance` 0 → **120 px** · 0.5 → 1,171 · 0.8 → 1,197 · 1.2 → 1,193（0.5 之後就飽和）。
施法者 bbox 半寬實測 **0.42**、水刺半寬 0.21 ⇒ 0.63 是幾何臨界點。
⇒ 節點寫 `distance: 0.8`（**我挑的**，理由是量出來的臨界點加一點餘裕）。

### ② 15-002（godie-emfr.ex）：**兩個**缺陷疊在一起，合起來是 0 像素
- **位置**：`distance` 吃預設 0.1 ⇒ bbox（x −40.04…−39.76 · y 0.05…2.05 · z ±0.14）**100% 落在**
  施法者 bbox（x −40.42…−39.58 · y 0…1.85 · z ±0.42）裡面 ⇒ 差分 **0 px**（26 幀全 0）。
- ⭐ **顏色**：census 的 `tint [1,0,0]`（w3u 頂點色 255,0,0）乘上 `aquaspikeversion2.glb`
  **唯一一張純青藍貼圖** ≈ 全黑。同一幀把 albedo 改回白色：**3 px → 621 px（200 倍）**。
  ⇒ 這一格填了就是擺一個玩家看不見的節點（第一·五守則）。同族另外兩支的 census tint
  本來就是 null，而它們量到 9,152／2,122。
⇒ 修法：`distance: 1.0`（原作本來就擺在 `GetSpellTargetLoc()`＝**目標點**，⛔ 不在施法者體內）
  ＋ **不寫 tint**（吃模型自己的顏色）。修完 0 → **534 px**。

## ⚠️ 誠實限制（量到但本批不動）

1. **45-002 的黑焰球浮在施法者頭上 4.32 單位** —— `imported.netherstrike` 的
   `model@1.fxSpawnHeight 1.08` × 節點 scale 4。那一格是 `tpl-beam-roll` 家族
   （59-04／08-03 兩支經典）在讀的，動它會一起移動那兩道光束 ⇒ ⛔ 本批不碰。
2. **48-04 的魔法陣 10.42 世界單位寬** —— 那是 census 的 w3u `usca 1.5` 乘上
   `imported.midchildernanohaaura` 既有的 `doc.scale 1.0`，而那份文件**已經有出貨消費端**
   （`attach.ex.midchilder-aura` → godie-h020.ex／godie-hjai.ex，6.94 寬）⇒ ⛔ 不重新正規化。
3. `imported.blackhole1`（5.1051 → **0.1406**）與 `imported.grandorcaura`（1.0 → **0.0355**）
   的 `doc.scale` 是本批改的 —— 兩份**零消費端**，原值乘上 census scale 會得到 91／87
   世界單位（競技場只有 24×18）。守衛 `locustTailFamilies` ① 從 glb bbox 反推，寬過
   半個場就紅。
4. **音效沒有終端證據** —— audition 台子不播聲音。七個節點的 `soundKey` 是**推導**的
   （模型自己烘在動畫軌上的 `SNDX` 事件 ×4、JASS 生成點自己 `PlaySoundOnUnitBJ` ×1、
   同觸發器既有節點同鍵 ×1、⭐ 我挑的 ×1 —— 逐列見 TAIL 報告 §三）。
