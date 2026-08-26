# 光束砲家族按真相重建 — 連續圖片驗收（GH#702 · APPLY lane · 2026-08-26）

台子：`apps/client/public/beam-audition.html?ability=godie-e002.e`（client-beam :39673）。
量尺先過 `calibrate()`：全亮 quad **462,400** 亮像素 > 0 ⇒ 量尺自證（CLAUDE.md 👁 節洞 d）。
鏈路：真 `SimWorld` → 出貨的 `godie-e002.e`（20-03 約束與勝利之劍）→ 真 `modelFxSpawn`
**×2**（核心 ReviveHuman ＋ 本批新增的 FragDriller 慢動作爆殼）→ 真 `VfxSystem` / `ModelFxRig`
→ 真 `.glb`。內容經工作樹讀取（`content/models/_index.json` 已補三份新 model doc 的索引列）。

## 一、逐幀

| 擷圖 | tick | 亮像素(>200) | lit(>96) | 說明 |
|---|--:|--:|--:|---|
| shot0_baseline | 0 | **0** | **0** | 施放前基線（黑場） |
| shot1_both_layers | 31 | 52,255 | 60,234 | 兩層都在：核心 ReviveHuman ＋ 爆殼 FragDriller |
| shot2_AB_core_only | 31 | 52,029 | 60,296 | A/B：爆殼層 `setEnabled(false)` |
| shot3_AB_shell_only | 31 | 49,232 | 56,723 | A/B：核心層 `setEnabled(false)` ⇒ **地面上那道白色光束不見了** |
| shot4_AB_scaleAxis_off | 31 | 49,706 | 57,254 | A/B：核心的 `scaleAxis` 關掉（等向）＝ 2026-08-25 的形狀 |
| shot5_scaleAxis_on | 31 | 52,074 | 60,238 | A/B：`scaleAxis [1,1,3.12]` 打開 —— 同一幀，只差第三格 |
| shot6_expired | 76 | 2,985 | 4,278 | `lifeSec 2` 到期回收 |

⚠️⚠️ **這張表的逐幀總數會誤導人，所以下面第二節才是結論。** 畫面上最大的一塊
（左邊那道黃色新月）是**施法演出**，⛔ 不是這一批的任何一層 —— 證據：shot2（爆殼關）
與 shot3（核心關）**兩張都還有它**。⇒ 兩層各自的貢獻要用**隔離差分**量，見下。

## 二、隔離差分（同一 tick，逐層開/關）

| 量 | lit(>96) | 判定 |
|---|--:|---|
| 兩層都開 | 64,433 | — |
| 只關**爆殼** | 64,354 | 爆殼 = **+79** |
| 只關**核心** | 60,798 | 核心 = **+3,635** |
| 兩層都關 | 60,781 | 底噪（施法演出＋傷害線標記＋替身） |
| ⇒ 核心 vs 兩層都關 | — | ⭐ **+3,573** |
| ⇒ 爆殼 vs 兩層都關 | — | ⚠️ **+17〜260**（見誠實限制） |

## 三、幾何：世界座標的實測跨距（⛔ 不是讀 `scaling` 屬性）

逐 mesh 取 `boundingBox.minimumWorld/maximumWorld` 的聯集。行進軸＝ yaw 90° ⇒ 世界 X。

| 技能 | 模型 | `scale` | `scaleAxis` | 實測跨距 [沿行進軸, 上, 橫向] | 對照 |
|---|---|--:|---|---|---|
| 20-03 約束與勝利之劍 | revivehuman | 2.65 | [1,1,3.12] | **[13.99, 3.80, 3.80]** | 自己的 `damageLine.length` = **14** ✅ |
| 20-03（同上，⛔ scaleAxis 關掉） | revivehuman | 2.65 | —（等向） | [4.49, 3.80, 3.80] | 長寬比 **1.18 : 1**（一顆方塊） |
| 20-03 第二層 | fragdriller | 3.65 | —（等向） | [6.18, 3.31, 3.31] | 槍口爆殼，⛔ 不拉長 |
| 59-04 野戰型陽電子砲 | awaken | 1.50 | [1,1,3.25] | **[8.25, 1.79, 1.79]** | 自己的 `damageLine.length` = **8.25** ✅ |
| 08-03 龍鬥氣砲咒文 | reddragonmissile | 1.00 | [1,1,7.09] | **[12.01, 1.83, 2.03]** | 自己的 `range` = **12** ✅ |
| 90-04 陽光烈焰 | revivehuman | 2.00 | [1,1,3.54] | **[11.98, 2.74, 2.74]** | 自己的 `range` = **12** ✅ |

⭐ **判讀**：`scaleAxis` 把 20-03 的核心從 **1.18 : 1**（方塊）變成 **3.68 : 1**（光束），
沿行進軸 **4.49 → 13.99（×3.12）**，而橫向 **3.80 → 3.80 逐位元不動**。
五支成員的渲染長度全部落在自己那一支打得到的距離上（第一·五守則：卡面與畫面不互相說謊）。

## 四、四支經典各自「有沒有畫出東西」（各自的 baseline 都是 0/0）

| 技能 | 模型（本批換的） | spawns | lit(>96) |
|---|---|--:|--:|
| 20-03 | revivehuman ＋ fragdriller | **2** | 64,433 |
| 59-04 | **awaken**（在此之前吃家族預設 netherstrike ＝ 黑化 Saber 的劍氣） | 1 | 19,533 |
| 08-03 | **reddragonmissile**（同上） | 1 | 1,744 |
| 90-04 | revivehuman（家族從 `tpl-locust-orb` 改回 `tpl-beam-roll`） | 1 | 48,460 |

## 五、⛔ 誠實限制（⛔ 不要把這一頁讀成「做完了」）

1. ⭐⭐ **FragDriller 爆殼層只畫得出 ~17〜260 個 lit 像素** —— 它**在**場景樹上、
   有 2 個 mesh、材質帶貼圖、`scaling` 4.402、`clip:"Birth"` 真的在播（`speedRatio 0.15`
   實測），跨距 6.18 世界單位 —— **而它幾乎是透明的**。
   ⇒ 這是**接通了但看不太到**，⛔ 不是「做完了」。根因候選（量到的）：
   `convert_stock_model.py` 的 `skipped_chunks` 對 FragDriller 是
   `['TXAN','GEOA','PRE2','EVTS']` —— **GEOA（逐 geoset 的 alpha 隨時間變化）與
   PRE2（粒子）都被丟掉了**，而 WC3 裡這一具的可見量體大半住在那兩個 chunk。
   ⇒ 下一批：把 GEOA/PRE2 帶進轉檔器（同一個限制也套在 ReviveHuman / TornadoElemental）。
2. **原作那條又長又窄的光帶住在 PRE2 粒子裡**，GGD 只拿得到 geoset 核心
   （`revivehuman.glb` = 10.751 × 16.757 × 10.751，**1.56 : 1**）。
   ⇒ `scaleAxis` 是**幾何補償**，⛔ 不是原作的量值（WC3 的 `SetUnitScale` 只讀第一個
   參數，而 `war3map.j` 的三軸值逐字相同 ⇒ 原作等向）。
3. 台子是黑場＋替身，⛔ 不是真的比賽場景：遮擋、AdaptiveQuality 降級、
   多人同時施放的層數上限**都沒有量到**。
4. `bright/lit` 的逐幀總數被施法演出主導（第一節的 ⚠️）—— 結論只能引用第二、三節。
