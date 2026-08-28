# 08-04 阿邦快速劍X：「二連技」逐格對照（JASS ↔ 出貨 GGD）

- 日期：2026-08-28（唯讀分析，⛔ 無內容改動）
- owner 的提問：「08-04 本質上是一個二連技你知道嗎？比較目前實作與設定上的差異（動畫及傷害判定）」
- 底稿：`docs/_reports/vfx-editor-jass3b_temp_20260828-0312.md` §②（JASS 逐字＋w3a 欄位）
- JASS：`tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` 28874–28940（`Trig_ABanX`，A0EZ，base `AUcs`）
- 出貨：`content/abilities/godie-n01c.r.json`（變身態）＋ `godie-nbbc.r.json`（本體）——
  ⭐ 2026-08-28 已收斂：兩形態 effects **逐格相同**、`castType:"ground"`、`castTimeSec:0.833`、
  champions 內嵌鏡射同步（本輪驗過）
- 演出：`content/vfx-scripts/godie-n01c.r.json` ＋ `godie-nbbc.r.json`（已在 `_index.json`）

---

## 0. 直接回答：「二連技」今天在 GGD 是什麼樣子

原作的兩段（都有傷害）：

| 段 | t | JASS | 傷害 |
|---|---|---|---|
| **第一段（A 式·直線）** | **0** | base `AUcs` 腐屍蜂群自己結算（⛔ 不在觸發器裡，§2-4⑩） | **450/650/850**，線長 550 wc3u＝**10.08u**、寬 200＝**3.67u**（w3a data 1/3/4；data 2 另有總傷上限 800/1400/2600） |
| **第二段（B 式·落點）** | **+1.0s** | j:28915 瞬移 550 → j:28918 半徑 250 逐人結算 | **L×7×AGI**（等級從 1 起算 ⇒ 7/14/21×AGI），`DAMAGE_TYPE_UNIVERSAL`＝真傷（j:28882），排除建築（j:28880） |

GGD 今天：**只有第二段有傷害**。第一段的位置上站著一個**純視覺**的
`spawnModelFx`（`tpl-locust-travel` 月牙飛出 12u，零傷害）——
⇒ ⭐ **今天它是「一段傷害＋一段演出」，不是二連技。** 第一段直線傷害＝ **GH#843**（已開票，
卡住的是級距裁決：450/650/850 是 WC3 傷害空間，⛔ 不可硬映射 GGD 五級距）。
⚠️ 引擎機制**不是**缺口：`damageLine` 已出貨（schema/common.ts ＋ `sim/effects/damageLine.ts`）——
缺的只是那一格 `damageTier` 的依據。

---

## 1. 傷害判定逐格

| 格 | JASS（行號） | 出貨 GGD | 判定 |
|---|---|---|---|
| 第一段·直線傷害 | base `AUcs`：450/650/850，長 550（10.08u）寬 200（3.67u） | —（無 `damageLine`） | ⛔ **缺**（GH#843） |
| 第一段·總傷上限 | w3a data 2：800/1400/2600（AUcs 的線傷總量帽） | — | ⛔ 缺（隨 #843；GGD `damageLine` 無總量帽概念，落地時要決定翻不翻） |
| 第二段·觸發位置 | j:28898+28915：**固定** 550u 前方（朝施法點方向） | `blink to:"point" distanceUnits:10.08` | ✅ 已表達（2026-08-28 修正；此前是 `to:"targetUnit" stopShort:1.8`） |
| 第二段·AoE 半徑 | j:28918：250 wc3u ＝ **4.583u** | `damageArea radius:4.5`（radiusTier 小） | ⚠️ 近似（−1.8%，級距圓整） |
| 第二段·傷害式 | j:28882：`L × 7 × AGI` | `amount:{damageTier:"小", ratios:[ap×1.8]}`（卡面：技能等級×180% [AP]） | ⚠️ **近似且缺等級成長**：JASS 逐級 7/14/21×AGI（×1/×2/×3）；卡面也寫「技能等級×」；出貨 `coeff:1.8` **三級固定**，`damageTier:"小"` 也固定 ⇒ R2/R3 的第二段不會變強 |
| 第二段·傷害類型 | j:28882：`DAMAGE_TYPE_UNIVERSAL` | `damageType:"true"` | ✅ 已表達（2026-08-28 修正；此前 physical） |
| 第二段·目標篩選 | j:28879–28880：敵方且非建築 | `targetsEnemies:true`＋damageArea 敵方預設 | ✅ 已表達 |
| 第二段·逐人扇出 | j:28918 `ForGroupBJ` 逐個受害者 | `damageArea`（範圍逐人） | ✅ 已表達（此前為單體） |
| 施法型態 | `AUcs` 指地（GetSpellTargetLoc） | `castType:"ground"` | ✅ 已表達（2026-08-28 修正；此前 targeted） |
| 兩段的**時間差** | 第一段 t=0、第二段 t=+1.0s（j:28909 唯一等待） | 全部擠在 castEffect 一瞬（castEnd＝提交後 0.833s） | ⚠️ 近似：有抬手窗但**兩段不分先後** —— 第一段落地（#843）時若也掛在 castEffect，「X」就是同時的兩劃，⛔ 不是原作的 0→1.0s 節奏 |

## 2. 動畫／演出逐格

| 格 | JASS（行號） | 出貨 GGD | 判定 |
|---|---|---|---|
| ⭐ 本體消失 1 秒（招牌） | j:28905 `ShowUnitHide` → j:28916 `ShowUnitShow` | vfx-script `hideBody on:castStart durationMs:1000` —— 全鏈已接：schema `zVfxScriptHideBody`（vfxScript.ts:184，GH#838 N6）→ `VfxScriptPlayer.ts:459` → `appBridges.ts:62` → `scriptedHide.hideBodyFor`（客戶端 alpha 覆寫，⛔ 刻意不用 ENTITY_FLAG.INVISIBLE 以免偷加無敵窗） | ✅ 已表達（1000ms ≥ 0.833s 詠唱窗，人在瞬移後 ~0.17s 現身，方向正確） |
| e003 龍息彈站原地 | j:28906 `CreateNUnitsAtLoc(1,'e003',原點,施法者面向)`，w3u usca **4.0**，活 1.0s（j:28909→28911） | vfx-script `modelFx w3x.stock.reddragonmissile path:"static" anchor:"self" scale:4 clip:"idle" lifeSec:0.7` | ⚠️ 近似：模型/定點/scale 4 ✅；**壽命 0.7 vs 1.0**（腳本 note 寫「壓到 0.7 對齊 castTimeSec 0.667」—— ⚠️ 那個 0.667 已過期，出貨是 0.833，可放寬到 ~0.83） |
| 出發點塵土 | j:28914 `ImpaleTargetDust` 於**原點地板** | vfx-script `vfx fx.fam.ground-dust.nature.s80 atMs:600 at:"self"` | ⚠️ 近似：資產不在庫（models/vfx index 皆無）⇒ 家族塵土代打；atMs 600 < 833 時人還沒瞬移 ⇒ `at:"self"`≈原點 ✅ |
| 落點逐人雷擊 | j:28884–28885 **每個受害者**腳下一份 ThunderClapCaster（活 1.0s，掛地板點非骨頭） | vfx-script `vfx fx.w3x.stock.thunderclapcaster.p00 on:castEffect at:"target" durationSec:1` | ⚠️ 近似：資產/壽命 ✅，但 script 只到得了**一個** target —— 逐人扇出要走 sim 側 `onHitTargets` 的 `spawnVfx`（底稿 §2-6 已記） |
| 第一段的視覺 | `AUcs` 的腐屍蜂群直線投射（基礎技能自帶） | ability `spawnModelFx tpl-locust-travel imported.crescent scale:2 distance:12` 月牙飛出 | ⚠️ **層1 演出替換**（刻意）：原作直線群彈 → GGD 一道月牙；⛔ 不是缺口但與 JASS 不同，且**它是今天唯一暗示第一段存在的東西** |
| A09O/A09P 球體（Mirror/Mirror_Red） | j:28902–28903 加、j:28932–28933 移除 —— 加完下一行就 Hide ⇒ 實際只閃最後一幀 | —（未翻譯） | ⛔ 缺（底稿 §2-6 建議**不翻譯**：原作遺留，肉眼近乎不可見） |
| 喊招漂浮字 | j:28921–28925 **整段被原作者註解掉** | —（無 floatingText） | ✅ 正確地不表達 |
| 重新選取單位 | j:28928 `SelectUnitForPlayerSingle` | —（GGD 無選取概念） | ✅ 不適用 |

## 3. 收斂建議（⛔ 本輪不動手，僅列給 #843 / 後續票）

1. **#843（第一段直線）是唯一的傷害缺口**：機制已出貨，只等級距依據。落地時同場要答
   「第一段掛哪個時點」（castStart 結算 vs castEffect）——那決定二連技的**節奏**還原度。
2. 第二段**等級成長缺失**（7/14/21×AGI vs 固定 1.8AP）不在 #843 的 AC 裡 ——
   值得在 #843 落地時一併裁決（`ratios` 是否走 perRank）。⛔ 本輪未開新票（唯讀指示）。
3. vfx-script notes 兩處過期散文：castTimeSec 0.667（實為 0.833，連動 e003 lifeSec 可放寬）；
   「⛔ MISSING N6」與「⭐ N6 已落地」同時在場（前者是舊句未刪）。
