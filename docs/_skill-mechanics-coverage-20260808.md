# 90 支重製技能 → 機制覆蓋矩陣（2026-08-08 快照）

> **查證時間**：2026-08-08 16:08 CST（Asia/Taipei）
> **查證的 commit**：`git rev-parse --short HEAD` = **`8cfb22d3`**
> **來源規格**：`skill_temp_20260808.md`（90 支逐字原文，15 位英雄 × 6 槽）
> **介接契約**：`main_load_editor_plan.md` §2.1.1.2 · `GGD_EDITOR_PACKAGE_SPEC.md`

---

## ⚠️ 這是一份時間點快照，機制欄可能已經比它新

這份文件是 2026-08-08 下午在 `8cfb22d3` 上逐檔讀出來的。
**同一天有兩條工作流正在加機制**（`sim/effects/`、`content/schema/` 都在動），
所以「支不支援」欄**只對這個 commit 為真**。要重新驗證，重跑本文 §1 的每一個
`file:line`，不要相信這份表本身 —— 這正是 `content/editorCapabilities.ts` 檔頭
「一份手寫的能力清單一定會對另一個專案撒謊」那一段的教訓。

### ⚠️ 而且它**正在**過期 —— 這是量到的，不是提醒

寫這份文件的當下（`git status`），工作區裡有這些**尚未進 `EFFECT_HANDLERS`、
所以在 `8cfb22d3` 上判定為「不支援」**的檔案已經在路上：

```
packages/shared/src/sim/effects/modifyCooldown.ts          → 對應本文 X4（擋 3 支）
packages/shared/src/sim/effects/weightedBranch.ts          → 對應本文 X5（擋 1 支）
packages/shared/src/sim/effects/swapResource.ts            → 對應本文 X6（擋 1 支）
packages/shared/src/sim/effects/eventValueConversion.ts    → 對應本文 X10（擋 1 支）
packages/shared/src/sim/abilities/toggle.ts                → 可能對應 X3（擋 1 支）
packages/shared/src/sim/content/conditionEquipment.test.ts → 可能對應 X13（擋 1 支）
packages/shared/src/sim/systems/reflectSuccessProvenance.test.ts → 可能對應 H9（擋 4 支）
```

⛔ **我沒有把它們算成「支援」** —— 第二守則的判準是「消費端存在且真的跑」，
而它們在 `8cfb22d3` 的 `EFFECT_HANDLERS`（`sim/effects/effectRegistry.ts:105-163`）裡
一個都不在，未 commit 的來源檔也不是出貨的東西（CLAUDE.md「出貨的是 git，不是你這台
機器的工作區」）。**重讀本文前先重跑附錄那五條指令。**

⛔ **本文不是能力契約。** 對外的契約是 `packages/shared/src/content/editorCapabilities.ts`
的 `buildCapabilityManifest()`（推導式，帶 fingerprint）。本文是**把 90 支文案拆成
機制、再對著那份契約與出貨註冊表逐格對帳**的分析，用途是決定**做事順序**。
兩者不一致的地方，我在 §5 逐條列出來 —— 而且**有三處真的不一致**。

---

## 0. 圖例與判準

| 記號 | 意思 | 判準 |
|---|---|---|
| ✅ | 今天就寫得出來 | 出貨註冊表 / Zod schema 裡有對應的 kind、欄位或事件，且**消費端存在** |
| ◐ | 主要路徑有，但有明講的落差 | 能做出「像」的東西，但計畫 §2.1.1.2 / §13 要求的那一格缺 |
| ❌ | 做不到 | 沒有 primitive；⛔ **不可降級成相似效果**（計畫 §2.1.1 硬要求） |
| ？ | 待確認 | 我查不出來，或文案本身有歧義 —— **沒有填猜測值** |

⚠️ 「支不支援」全部是**去 repo 查證**的，不是照抄文案標籤或 `SKILL-TAG-SUPPORT.md`。
每一格的佐證集中放在 §1，格式是 `檔案:行號`。

---

## 1. 機制詞彙表（本文所有判定的佐證來源）

### 1.1 ✅ 今天就有的（effect kind / schema 欄位 / hook 事件）

| 代號 | 機制 | 佐證 |
|---|---|---|
| M1 | 單體／圓形／直線傷害 | `packages/shared/src/sim/effects/effectRegistry.ts:107`（`damage`）、`:108`（`damageArea`）、`:111`（`damageLine`） |
| M2 | AP/AD/力敏智 係數 | `packages/shared/src/content/schema/effect.ts:349`（`amount: zScaling`）；`common.ts:343` |
| M3 | 目標最大／現存生命 % 傷害 | `content/schema/effect.ts:376-382`（`damage.hpPct`，`basis: max\|current`） |
| M3b | 任一方資源 % 項（自身最大生命、敵方現存 MP…） | `content/schema/effect.ts:200-232`（`zResourcePctTerm`，`subject/resource/basis`） |
| M4 | 護盾（可限定只吸收某型別） | `effectRegistry.ts:117` + `shield.absorbs`（`sim/effects/shield.ts`） |
| M5 | 治療／% 回復 | `effectRegistry.ts:116`（`heal`）、`content/schema/effect.ts:880`（`restore.healthPct/manaPct`） |
| M6 | 持續傷害（燃燒／每秒） | `effectRegistry.ts:135`（`dot`）、schema `content/schema/effect.ts:1008-1052`（interval/duration/stacking/tickOnApply） |
| M7 | 週期觸發（每 N 秒） | `content/schema/effect.ts:139`（`onInterval`）+ `:1621`（`internalCooldown`） |
| M8 | 增益／減益（含負值、逐級、疊層、掛 hook） | `effectRegistry.ts:119` + `content/schema/effect.ts:802-838`（`modifiers/perRank/stackKey/maxStacks/hooks`） |
| M8b | 修飾運算子（flat / pctAdd / pctMult / override / percentOf） | `sim/stats/modifiers.ts:18-61` |
| M9 | 輪替增益（依序循環強化） | `effectRegistry.ts:122`（`cycleBuff`）+ `content/schema/effect.ts:853-877`（`cycleKey/steps`） |
| M10 | 擊退／擊飛／拉扯 | `effectRegistry.ts:137` + `content/schema/effect.ts:1179-1210`（`from: caster\|facing\|pull`、`launchHeight`） |
| M11 | 衝刺 | `effectRegistry.ts:130`（`dash`）+ `content/schema/effect.ts:927-934` |
| M12 | 跳躍／勾拉／抓過來丟出去 | `effectRegistry.ts:131`（`leap`）+ `content/schema/effect.ts:941-960`（`dragToCaster/throwDistance/onLand`） |
| M12b | 瞬移 | **沒有獨立的 teleport kind** —— 由 `content/templates/expand.ts:959-1000` 的 `teleport` 家族展開成 `leap` + `apexHeight: 0` |
| M13 | 召喚物 | `effectRegistry.ts:139`（`summon`）+ `content/schema/effect.ts:1056` |
| M14 | 無敵／免疫（可分免傷/免控/型別） | `effectRegistry.ts:141` + `content/schema/effect.ts:1158-1177` |
| M15 | 淨化／驅散 | `effectRegistry.ts:157`（`dispel`）+ `content/schema/effect.ts:1308` |
| M16 | 吞噬／處決（逐階門檻 + 等值回復） | `effectRegistry.ts:159`（`devour`）+ `content/schema/effect.ts:1388-1408`（`thresholdPctOfMax/healPct/throughShields`） |
| M17 | 迴避（限時或常駐） | `effectRegistry.ts:161` + `sim/effects/evasion.ts:75`；消費端 `sim/combat/evasion.ts::rollEvade`（`BasicAttackSystem.ts:435`、`ProjectileSystem.ts:79`） |
| M18 | 永久三圍發放（力/敏/智，可「每 N 次」） | `effectRegistry.ts:115`（`grantAttribute`）+ `content/schema/effect.ts:590` |
| M19 | 燒魔／每擊扣魔 + 存款 | `effectRegistry.ts:126`（`spendMana`）+ `content/schema/effect.ts:898-922`（`pctMaxMana/pctCurrentMana/bankAs`） |
| M20 | 變身（toggle / alternate / base） | `effectRegistry.ts:132`（`championForm`）+ `content/schema/effect.ts:964-970` |
| M20b | 形態閘（只在某個身體生效） | `content/schema/effect.ts:1946+` 的 `zAbilityPassiveRank.whileForm`（`any/base/alternate`） |
| M21 | 飛行／無視碰撞 | `content/schema/effect.ts:1860-1868`（`zFlightGrant`），掛在 `zAbilityPassiveRank.flight` |
| M22 | 格擋（型別過濾／機率／比例／只擋致死／ICD） | `content/schema/effect.ts:1898-1944`（`zBlockGrant`）+ `zAbilityPassiveRank.block`；`editorCapabilities.ts:282-297` |
| M23 | 反彈（讀那一發封包） | `content/schema/effect.ts:427-470`（`damage.incomingPct`，`basis/perRank/maxChainDepth/whenTooLate`） |
| M24 | 具名標記層數（跨回合／跨比賽） | `content/schema/mark.ts:122-160`（`zMarkSpec`）+ `content/schema/ability.ts:129`（`marks`）；`sim/marks.ts` |
| M25 | 免死攔截（消耗一層 + 無敵 + 回復 + 周圍 AoE） | `content/schema/mark.ts:74-120`（`zMarkLethalRule`）；`sim/combat/lethalSave.ts`；`editorCapabilities.ts:127-137` |
| M26 | 每失去一層的**永久**加成 | `content/schema/mark.ts:57-68`（`zMarkPerStackModifier`） |
| M27 | 光環（半徑內敵/友方常駐效果） | `content/schema/effect.ts:1761`（`zAuraDef`）+ `zAbilityPassiveRank.auras` |
| M28 | 屬性上限提升（`ModOp.CapRaise`） | `sim/stats/modifiers.ts:35` + 消費端 `sim/stats/statPipeline.ts:115-162`；上限表 `sim/SimWorld.ts:660-665`（`statCaps`） |
| S1 | 定身 | `content/schema/effect.ts:730`（`applyStatus.root`） |
| S2 | 暈眩 | `content/schema/effect.ts:731`（`applyStatus.stun`） |
| S3 | 沉默 | `content/schema/effect.ts:779`（`applyStatus.silenced`） |
| S4 | 減速 | `content/schema/effect.ts:729`（`applyStatus.moveSpeedMult`） |
| S5 | 失手／致盲 | `content/schema/effect.ts:741`（`applyStatus.missChance`）；出貨文件 `content/status-effects/curse.json` |
| S6 | 恐懼 | `content/schema/effect.ts:768`（`applyStatus.feared`）；`content/status-effects/fear.json` |
| S7 | 混亂 | `content/schema/effect.ts:785`（`targetsAllies`，**要配 `berserk: true`**） |
| S8 | 暴走 | `content/schema/effect.ts:752`（`applyStatus.berserk`）；`sim/berserk.ts` |
| S9 | 重創（治療／吸血／回復打折） | `content/schema/effect.ts:793-795` |
| H1 | 普攻時 | `content/schema/effect.ts:118`（`onBasicAttack`） |
| H2 | 受到傷害時 | `content/schema/effect.ts:120`（`onDamageTaken`） |
| H3 | 造成傷害時 | `content/schema/effect.ts:119`（`onDamageDealt`） |
| H4 | 擊殺時 | `content/schema/effect.ts:121`（`onKill`） |
| H5 | 技能命中時 | `content/schema/effect.ts:117`（`onAbilityHit`）；`editorCapabilities.ts:158-164` |
| H6 | 週期 | 同 M7 |
| H7 | 被暈眩時 | `content/schema/effect.ts:135`（`onStunned`） |
| H10 | 死亡／復活／迴避／殭屍王／火圈／守衛塔倒下 | `content/schema/effect.ts:163-175`（`WorldHookSystem` 廣播的六個） |
| C1 | 機率 | `content/schema/condition.ts:65`（`zChanceLeaf`）；hook 端 `content/schema/effect.ts:1627`（`chance`）、`:1629`（`chanceFrom`） |
| C2 | 某主體身上有某個具名狀態 | `content/schema/condition.ts:141-147`（`zStatusLeaf`，`subject: self\|target` + **exact `statusId`**） |
| C3 | 屬性門檻（hp%/mp%/其它） | `content/schema/condition.ts:73-114`（`zResourceStatLeaf` / `zPlainStatLeaf`） |
| C5 | hook 效果落在誰身上 | `content/schema/effect.ts:1690`（`target: self\|event\|allies`）；`sim/effects/hooks.ts:352-356` |

### 1.2 ◐ 有主要路徑但有落差

| 代號 | 機制 | 落差 | 佐證 |
|---|---|---|---|
| H8 | 迴避時（onEvade） | 事件會發到閃掉的那一方，但**尚未區分「真閃避」與「攻擊者 fumble」**，計畫 §13 要求 fumble 零次 | `content/schema/effect.ts:174`；`editorCapabilities.ts:148-157` |
| H9 | 反彈成功時（onReflect） | 事件**存在**且語意就是「一發反彈封包真的排出去了」，但**沒有反彈封包的 provenance**（計畫要 source/defender/original packet/reflectDepth/castId） | `content/schema/effect.ts:140-150`；`sim/systems/ReflectHookSystem.ts`；契約側 `editorCapabilities.ts:229-237`（⚠️ 見 §5 矛盾 A） |
| C4 | 指定技能命中 | 只認得**槽位**（`abilitySlot: Q/W/E/R/EX/PASSIVE`），不是 exact ability id。計畫 §4.4 明令禁止用名稱反推，也要求 exact ref | `content/schema/effect.ts:1613` |
| M22b | 限時授予格擋 | 只有**道具**與**技能被動 rank** 能授予；`applyBuff` 掛上去的來源**沒有 `block` 這一格**，所以「接下來 5 秒內格擋」寫不出來 | `editorCapabilities.ts:282-297` |
| ~~M28b~~ | ~~攻速上限開到 10~~ | ⛔ **這一列是過期的（2026-08-08 量過）**。#286 三個住處在 v0.9.11–08-01 就全部到位：出貨值 `content/config/stat-caps.json`、Zod + `DEFAULT_STAT_CAPS` `sim/statCaps.ts:112`、後台頁 `apps/admin/src/ui/StatCapsPage.tsx`。**技能路徑**也實測解得開 → 見 `sim/effects/capRaiseFromAbility.test.ts` | `sim/stats/statPipeline.ts:141`；`apps/admin/src/statCaps.test.ts`（12 綠） |
| X16 | 逐級機率把該次普攻整發轉真傷 | `damageTypeOverride` 存在但**只在道具上可授予**（`content/schema/item.ts:550`），且**沒有逐級機率**那一格。⛔ 不可以改成「另外補一段真傷」 | `editorCapabilities.ts:298-308` |

### 1.3 ❌ 今天做不到（每一條都對得上計畫 §12 G4 / §2.1.1.2）

| 代號 | 機制 | 佐證（為什麼判定沒有） |
|---|---|---|
| X1 | **被動技強化另一招**（`ability-augment@1`） | `editorCapabilities.ts:272-281` —— 沒有 exact ability ref、沒有 stable edge id、沒有 reverse closure 重編 |
| X2 | **互斥變身群**（`state.exclusive-group@1`） | `editorCapabilities.ts:263-271` —— `championForm` 只有單一形態槽 |
| X3 | **狀態生命週期**（`state.lifecycle@1`：onEnter/onExit/**onAutoExit**） | 計畫 §2.1.1.2 點名；⛔ **`PLANNED_CAPABILITIES` 一列都沒有**（見 §5 矛盾 C）。`championForm` schema 只有 `to` 與 `durationSec`（`content/schema/effect.ts:964-970`），沒有離場鉤子 |
| X4 | **冷卻操作**（縮短／重置**特定一支**技能） | `editorCapabilities.ts:167-175`（`effect.modify-cooldown@1` = unsupported） |
| X5 | **加權互斥分支**（一次抽一個結果） | `editorCapabilities.ts:183-189` |
| X6 | **交換雙方現存生命** | `editorCapabilities.ts:190-196` |
| X7 | **魔力抵傷**（每點 MP 抵 N 點傷害） | `editorCapabilities.ts:197-203`；⛔ 不可用「受傷後補護盾」假裝 |
| X8 | **可組合的控制限制**（同時擋移動與攻擊，但不是暈眩） | `editorCapabilities.ts:204-214` —— 只有 root/stun/silenced/berserk/feared 五個獨立布林 |
| X9 | **隨機落點排程**（每 0.2 秒一顆共 10 顆） | `editorCapabilities.ts:215-221` |
| X10 | **事件數值轉資源**（把這次反彈的量轉成 MP 並疊 AP） | `editorCapabilities.ts:222-228` |
| X11 | **同 tick 兩組具名 target set**（友方回魔 + 敵方傷害） | `editorCapabilities.ts:238-246` |
| X12 | **「下一次普攻」一次性消耗**（`hook.consume-policy@1`） | 計畫 §2.1.1.2 點名；⛔ `PLANNED_CAPABILITIES` **沒有這一列**。`zHookDef` 有 `internalCooldown` / `chance`，**沒有 `maxTriggers` / `consumeOn` / `expiresAt`**（`content/schema/effect.ts:1609-1754`） |
| X13 | **條件：裝備了某類道具** | `content/schema/condition.ts:149` —— 條件葉只有 `chance/stat/kind/status` 四種 |
| X14 | **條件：層數比較** | 同上；`marks` 讀不進條件樹 |
| X15 | **永久累積「非三圍」屬性**（攻速／攻擊距離／AP 點數） | `applyBuff` 一定會到期（`sim/effects/applyBuff.ts:15`：`expiresAtTick = world.tick + round(duration/dt)`）；`grantAttribute` **只認力/敏/智**（`sim/marks.ts:14-18` 明寫「發不出 ad / maxHealth」） |
| X17 | **反彈倍率上界不夠**（文案要 7 倍） | `sim/effects/reflectLimits.ts:36`：`INCOMING_PCT_MAX = 5` |
| X18 | **exact ability ref** | 見 C4；計畫 §4.4、§13「比對 exact ability id，不比對中文名」 |
| X19 | **條件：泛型狀態類別**（「敵方處於**任何來源的**暈眩／燃燒／致盲」） | `content/schema/condition.ts:141-147` 的 `zStatusLeaf` 只吃 **exact `statusId`**；而 `stun/root/missChance` 是 `applyStatus` 的**布林欄位**（`content/schema/effect.ts:730-745`），不同技能施加的同一種 CC 會帶不同 `statusId`，所以條件讀不到 |
| X20 | **累積承傷門檻 → 延長既有 buff 期限** | `applyBuff` 沒有「延長」語意（重套用是 refresh 到新的 `expiresAtTick`）；沒有累積計量器 |
| X21 | **多段序列 / 「最後一擊」索引** | 沒有 per-hit index 或序列排程 kind；`dot` 是週期不是連擊，`leap.onLand` 是單次 |
| X22 | **限時授予飛行** | `zFlightGrant` 只掛在 `zAbilityPassiveRank.flight`（`content/schema/effect.ts:1860`），主動技的 `effects[]` 沒有這個 kind |
| X24 | **selector 依標記過濾目標** | `damageArea` 的圓沒有「只選帶某 statusId 的人」這一格（`content/schema/effect.ts:522-553`）；`shape` 家族的 `side` 只分敵我 |
| X25 | **「每 N 次普攻」閘（給傷害用）** | `grantAttribute` **有**這個閘（`effectRegistry.ts:113-115`），但那是那個 kind 專屬；`damage` 沒有 |
| X26 | **主動技效果的形態閘** | `whileForm` 只在 `zAbilityPassiveRank`（`content/schema/effect.ts:1946+`），**不在 `EffectDef` 上**，所以「卍解狀態下這一招多打 200% AP」寫不進主動技的 `effects[]` |
| X27 | **資源 % 係數上界不夠** | `sim/effects/dynamicTerms.ts:87`：`RESOURCE_PCT_RATIO_MAX = 1`（文案 20-002 要「現存魔力 × 7」） |

---

## 2. 逐支技能表（90 支）

> 「卡點」欄空白 = 今天就寫得出來。多個卡點以 `·` 分隔。

### 20 · Saber

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 20-00 | 銀色甲胄 | M22（`damageTypes:["magic"]`, chance .3, fraction 1） | ✅ | |
| 20-02 | 感知能力 | M17（被動常駐、逐級 6/12/18/24%） | ✅ | |
| 20-01 | 風王結界 | M20 toggle · M20b · M19（每擊扣魔）· H1 · M8（暴擊倍率）· M1（關閉時範圍） | ❌ | **X3** —— 「MP 不足自動關閉」與「關閉時釋放風王鐵槌」是 onAutoExit/onExit，沒有離場鉤子 |
| 20-03 | 約束與勝利之劍 | M1（直線）· M2（100% AP）· 吟唱 | ✅ | |
| 20-04 | Avalon-永恆的理想鄉 | M23（2 秒視窗反彈魔法）· M2（另加 300% AP） | ❌ | **X17** —— 7 倍 > `INCOMING_PCT_MAX = 5` |
| 20-002 | 解放.約束勝利劍MAX | H9 · M23 · M3b（現存魔力）· M1（直線終結） | ❌ | **X17**（7 倍）· **X27**（現存魔力 ×7 > ratio 上界 1）· **X21**（連續七次斬擊）· H9 provenance ◐ |

### 59 · 初號機

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 59-00 | 暴走 | H2 · C3（hp < 5%）· S8 · M8（攻速/吸血/迴避）· ICD 150 秒 | ✅ | |
| 59-01 | 吞噬 | M16（threshold 3/5/7/9%、healPct 1、victim champion） | ✅ | ⚠️ 執行順序見 §5「待確認 14」 |
| 59-02 | 高週波短刀 | H1 · C1（10/15/20/25%）· 該次普攻轉真傷 | ◐ | **X16** —— 只在道具可授予、且無逐級機率 |
| 59-03 | AT力場 | M7（每 8 秒）· M4（只吸魔法、不疊加） | ✅ | |
| 59-04 | 野戰型陽電子砲 | M1（直線真傷）· 吟唱 3 秒 | ✅ | |
| 59-001 | 完全暴走 | 同 59-00，但門檻與全部數值被改寫 · M28（攻速上限 10） | ❌ | **X1**（改寫另一支的門檻/數值）—— ~~M28b~~ **不再是障礙**（#286 已完成，2026-08-08 實測） |

### 70 · 白木卡迪那

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 70-00 | 紮根 | M20 toggle · S1 · M8（防禦 ×2、力量 +10、攻擊距離 →10） | ✅ | |
| 70-01 | 伸卡球 | M1（範圍）· M2（力量 ×3） | ✅ | |
| 70-02 | 大怒石 | H1 · M1（小範圍擴散 %） | ✅ | |
| 70-03 | 木束縛之術 | S1（周圍範圍、0.6~2.4 秒） | ✅ | |
| 70-04 | 千年練成 | M13（召喚 4/6/8 棵樹精）· M1 · C2（被定身時傷害加倍） | ❌ | **X9** —— 「周圍隨機」落點沒有排程器 |
| 70-002 | 樹海降臨 | 對 70-04 追加 500% AP · M5（友方回復 10%） | ❌ | **X1** |

### 77 · 櫻綻剎那

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 77-00 | 浮雲-旋一閃 | M17（10%）· H8 · M1（250 + 敏捷×5）· S2（2 秒） | ◐ | **H8** —— 未區分真閃避 vs fumble |
| 77-01 | 百烈櫻華斬 | M1（範圍 + 50% AD）· M10 | ✅ | |
| 77-02 | 雷鳴劍 | H1 · C1（10%）· M8（1.5 倍暴擊）· M1（範圍落雷 10% AP） | ✅ | |
| 77-03 | GLADIARIA ALAT | M20 · M8（攻速 60~150%）· M21（飛行無視碰撞、限時 6~15 秒） | ❌ | **X22** —— 飛行只掛得上被動 rank，主動技給不了 |
| 77-04 | 真-雷光劍 | M1（小範圍 + 60% AD）· 施展 2 秒 | ✅ | |
| 77-002 | 御雷劍 | C-裝備條件 · 提高 77-02 機率 → 50% · 延長 77-03 → 30 秒 | ❌ | **X13** · **X1** |

### 45 · 宇智波佐助

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 45-00 | 寫輪眼 | C1（20%）· M23 | ？ | 文案**沒有給反彈倍率**（見 §5 待確認 1） |
| 45-01 | 火遁-豪火龍之術 | M1（範圍）· M6（每秒現存生命 1%，3 秒）· 燃燒標記（`applyStatus`） | ✅ | |
| 45-02 | 千鳥流 | M1（範圍 + 20% AP）· S4 · M8（攻速 −50%） | ✅ | |
| 45-03 | 千鳥 | M11（直線衝刺）· M1（沿途） | ✅ | |
| 45-04 | 哥哥 | H5 · C4（限定 E）· C2（目標帶燃燒）· M1（小範圍 + 300% AP） | ◐ | **X18** —— 只到槽位，計畫 §13 要 exact ability id |
| 45-002 | 天照 | M6（每秒 400）· S3 · M8（攻擊力 −40%）· 燃燒標記 | ✅ | |

### 13 · 揍敵客桀諾

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 13-00 | 念。攻防轉換 | M9（4 步 × 1.0 秒：AP/AD/防禦/魔抗 各 +10%）· H1 | ✅ | |
| 13-01 | 暗步。極限之圓 | M12b（`teleport` 家族 → `leap` apex 0）· S5（致盲 1 秒） | ✅ | ⚠️ 「無視地形與碰撞」由 leap 弧線代表，不是獨立 teleport primitive |
| 13-02 | 龍頭戲畫。牙突 | M1 · M3（目標最大生命 6~12%）· M10（擊退 6） | ✅ | |
| 13-03 | 龍頭戲畫。布陣 | M1（範圍 + 60% AP） | ✅ | |
| 13-04 | 龍星群 | 每 0.2 秒隨機落一顆 × 10 · M1（小範圍） | ❌ | **X9** |
| 13-002 | 絕。暗殺奧義 | H5 · C4（限定 W 牙突）· C2（致盲）· C1（20%）· M3（+40% 最大生命） | ◐ | **X18** |

### 15 · 涅吉

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 15-00 | 真·不死不滅 | M7（每秒）· M5（+5% 最大生命）· M19（−5% 魔力） | ✅ | |
| 15-01 | 雷神槍「巨神殺手」 | M1（直線 + 30% AP）· S4（麻痺＝緩慢移速 1 秒） | ✅ | |
| 15-02 | 疾風迅雷 | M20 · M8（移速 ×1.2、攻速 30~120%）· H1（附加雷電傷害） | ❌ | **X2** —— 「變身為唯一狀態不可疊加」 |
| 15-03 | 獄炎煉我 | M20 · H1 · H5（技能命中引爆炎）· M1（範圍）· M8（移速減半） | ❌ | **X2** |
| 15-04 | 雷天大壯。貳式 | M20 · M8（移速 ×2、攻速 100~200%）· M28（上限 →10）· 施技後的下一次普攻 | ❌ | **X2** · **X12** —— ~~M28b~~ **不再是障礙**（#286 已完成，2026-08-08 實測） |
| 15-002 | 敵彈吸收陣。太陰道 | M23（反彈 100%）· 把反彈量轉 MP 並疊 AP、5 秒歸零 | ❌ | **X10** · 語意未 freeze（§5 待確認 10） |

### 44 · 夜神月

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 44-00 | 機警 | 魔力護盾：每點 MP 抵 3 點傷害 | ❌ | **X7** |
| 44-01 | 死神之眼 | 自傷（自身生命 75%）· S5（詛咒標記 50% 失手 6~24 秒） | ✅ | |
| 44-02 | 死神的規則 | M8（智慧 +7~22，被動常駐） | ✅ | |
| 44-03 | 火車輾過 | M1（範圍 + 60% AP）· C2（詛咒標記） | ？ | **X24** —— 「被標記者周圍的敵方部隊」的 selector 語意（§5 待確認 8） |
| 44-04 | 心臟麻痺 | M3（現存生命 30~50%）· M2（+40% AP）· S4 | ？ | 同上：目標是「被標記的那一位」還是「範圍」，文案未帶範圍標籤 |
| 44-002 | 交換筆記本 | 交換雙方現存生命 | ❌ | **X6** · 邊界未 freeze（§5 待確認 12） |

### 12 · 天地志狼

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 12-00 | 感應意脈 | M17（常駐 20%） | ✅ | |
| 12-01 | 鬥仙術 | M1（+60% AP）· S7（混亂 1 秒，`berserk + targetsAllies`） | ✅ | |
| 12-02 | 仙氣．採藥 | M5（5~11% 最大生命）· M15 | ✅ | |
| 12-03 | 破凰之心 | H1 · C1（10%）· M8（1.1~4.4 倍暴擊）· C2（混亂標記時 +100% AP） | ✅ | |
| 12-04 | 龍氣爆發 | M1（大範圍 + 200% AP）· M15 | ✅ | |
| 12-002 | 仙氣發勁 | M1（1800 + 600% AP）· M10 | ✅ | |

⭐ **志狼 6/6 全支援** —— 全批唯一一位。

### 60 · 林克

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 60-00 | 聖光盾 | H1 · M3（3% 最大生命）· M15 | ✅ | |
| 60-01 | 科奇利族的迴旋鏢 | M1（範圍 + 50% AD）· M10 | ✅ | |
| 60-02 | 鎖鏈槍 | M12（直線勾住 + 自身跳過去）· M1 | ✅ | |
| 60-03 | 海拉爾之盾的庇護 | M8（三圍 +3~12）· 每三下普攻額外 33% AP | ◐ | **X25** —— 「每 N 次」閘只有 `grantAttribute` 有 |
| 60-04 | 迴旋斬 | M23（反彈 AP + AD，3 秒）· H9（成功 → 回復 8~24% + 擊退） | ◐ | **H9** provenance |
| 60-002 | 絕光斬 | C3（hp < 30%）· M4（100% 最大生命護盾）· ICD 120 秒 · 反彈成功 → **冷卻立即重置** | ❌ | **X4** · **H9** ◐ |

### 79 · 黑崎一護

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 79-00 | 靈壓 | M27（小範圍光環：敵方攻速減半） | ✅ | |
| 79-01 | 瞬步 | M11（直線衝刺）· M8（魔抗減半）· 破魔標記 | ✅ | |
| 79-02 | 斬擊 | M1 · C2（破魔 → +100% AP）· **卍解形態 → 再 +200% AP** | ◐ | **X26** —— 形態閘只在被動 rank，主動技的 `effects[]` 用不到 |
| 79-03 | 月牙天衝 | M1（直線）· C2（破魔 → +60% AP）· 卍解形態 → +120% AP | ◐ | **X26** |
| 79-04 | 卍解 | M20 · M8（攻速 100~200%）· **79-01 冷卻縮短 50%** | ❌ | **X4** |
| 79-002 | 虛化 | M20b（`whileForm: alternate`）· M8（AD +100%、吸血 60%）· M22（格擋物理 30%）· **79-03 冷卻縮短 50%** | ❌ | **X4**（其餘四項今天都寫得出來） |

### 80 · 呂布奉先

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 80-00 | 飛將神弓 | H4 · **永久** 攻速 +1% / 攻擊距離 +0.01（上限 10） | ❌ | **X15** —— 永久累積只做得到力/敏/智 |
| 80-01 | 天下無雙 | H1 · M8（`stackKey` 疊加攻速 +10%，1 秒不續就歸零） | ✅ | |
| 80-02 | 弒鬼神 | M1（範圍）· M10 · 破甲標記 + M8（負 armor） | ✅ | |
| 80-03 | 鬼神烈戟 | M11 · M1（直線 + 30% AP）· C2（破甲 → +100% AP，標記由 80-02 自己施加） | ✅ | |
| 80-04 | 赤兔咆哮 | M8（AP/AD → 150~250%）· H1 + H2 · C1（20%）· 「使出弒鬼神反擊」 | ◐ | **X18** —— 引用另一支技能；今天只能把 80-02 的效果**複製**進 hook |
| 80-002 | 戰無不勝 | M28（攻速上限 →10）· M8（吸血 50%、防禦/魔抗 −50%） | ✅ | ~~M28b~~ **已解除**：#286 三個住處 + 技能路徑 2026-08-08 實測通過 |

### 89 · 熊貓

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 89-00 | 憤怒的門牙 | H1 · C1（3%）· M1（999 真傷）· M6（1% 生命燃燒 5 秒）·「**敵方暈眩** → 追加致盲」 | ❌ | **X19** |
| 89-01 | 憤怒的頭槌 | H1 · C1（3~6%）· M8（10 倍暴擊）· S2 ·「**敵方燃燒** → 追加致盲」 | ❌ | **X19** |
| 89-02 | 憤怒的菊花 | H2 · C1（3%）· M23 · H9（反彈時範圍施加「癱瘓」+ 詛咒）·「**敵方致盲** → 追加混亂」 | ❌ | **X19** · **H9** ◐ · 「癱瘓」語意未定（§5 待確認 5） |
| 89-03 | 憤怒的胸毛 | H2 · C1（4% / 2%）· M8（攻速 200~350%）· 自傷（`target:"self"` + `hpPct current`） | ✅ | |
| 89-04 | 憤怒的簡諧運動 | H1 · C1 · M10（`from:"pull"`）· M17 · H8 · M10 · S2 ·「**敵方致盲** → 追加混亂」 | ❌ | **X19** · **H8** ◐ |
| 89-002 | 俄羅斯輪盤 | 1/6 對方死 · 1/6 自己死 · 4/6 恐懼 ·「致盲 → 2/6、混亂 → 3/6」 | ❌ | **X5** · **X19** · 機率表未 freeze（§5 待確認 11） |

### 92 · 草泥馬

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 92-00 | 憂鬱的眼神 | H2 · C1（30%）· S5（致盲 6 秒） | ✅ | |
| 92-01 | 臥草泥馬 | M20 · **無法移動與攻擊** · M7 + M5（每秒 1~4%）· M8（防禦 +20~80） | ❌ | **X8** —— `root` 只擋腳，不擋普攻 |
| 92-03 | 狂草泥馬 | C3（hp < 30%）· H1 · M16（吞噬 3~6%）· **永久 +1 點 AP** | ❌ | **X15** · 「1 點 AP」語意（§5 待確認 16） |
| 92-02 | 消化液 | H2 · C1（10%）· M1（直線）· M6（每秒 3 秒）· M8（魔抗 −50%） | ✅ | |
| 92-04 | 馬勒戈壁 | M1/範圍 · S4 · S5（致盲 6 秒）·「攻擊**帶致盲標記**的敵人 → +100~300% AP」 | ◐ | **X19**（若致盲來自別人施加則讀不到） |
| 92-002 | 最終戈壁 | 掛在 92-04 施展期間 · M7 · **同 tick** 友方回 10% 最大魔力 + 敵方 2% 最大生命 + 100% AP | ❌ | **X1** · **X11** |

### 52 · Berserker（海克力斯）

| 編號 | 技能 | 用到的機制 | 狀態 | 卡點 |
|---|---|---|---|---|
| 52-00 | 十二道試煉 | M24（12 層、`resetOn: "match"`）· M25（免死 + 無敵 1.5 秒 + 回復 50% + 周圍擊退暈眩）· M26（每失一層永久 +10% AD / +10% 最大生命） | ✅ | ⭐ 全批最高階、卻**今天就完整落地**的一支 |
| 52-01 | 狂戰士之怒 | M8（攻速 60~150%、吸血 10~25%）· **每承受 5% 最大生命 → 延長 2 秒** | ❌ | **X20** |
| 52-02 | 蹂躪編年史 | M12（`dragToCaster` + `throwDistance`）· M1（直線）· C2（`subject:"self"` 狂怒 → 附加恐懼）· S6 | ✅ | |
| 52-03 | 無銘斧劍 | H1 · M1（額外 50~110）· 「麻痺」0.6 秒 | ？ | 「麻痺」語意未定（§5 待確認 6） |
| 52-04 | 巨神一擊 | M11 · M1（範圍）· C2（恐懼 → 追加自身最大生命 25%）· M3b（`self/health/max`） | ✅ | |
| 52-002 | 射殺百頭 | 連續 9 次斬擊 · M2 + M3b（每次 100% AP + 自身最大生命 3%）· **最後一擊** M10 + S6 | ❌ | **X21** |

---

## 3. 機制側彙總 —— 按「擋住幾支」排序

⭐ **這一欄決定做事順序**（CLAUDE.md 第〇·五守則：按擋住的支數做機制，不是按技能順序做技能）。

> **計算基礎**：分母是 `skill_temp_20260808.md` 的 **90 支**（15 英雄 × 6 槽，逐支點名）。
> 一支技能可能同時被多個機制擋住，所以下表的支數**加總會超過 90**。
> 「擋住」= 該支的狀態是 ❌ 或 ◐ 且卡點包含這個機制。**全部是點名數，不是估計值。**

| 排名 | 機制 | 擋住 | 是哪幾支 |
|---|---|---:|---|
| **1** | **X19 條件：泛型狀態類別**（任何來源的暈眩／燃燒／致盲／混亂） | **6** | 89-00 · 89-01 · 89-02 · 89-04 · 89-002 · 92-04 |
| **2** | **X1 `ability-augment@1`**（被動技強化另一招） | **4** | 59-001 · 70-002 · 77-002 · 92-002 |
| **2** | **H9 `onReflect` 的 provenance 落差** | **4** | 20-002 · 60-04 · 60-002 · 89-02 |
| **4** | **X4 `effect.modify-cooldown@1`**（縮短／重置特定技能） | **3** | 60-002 · 79-04 · 79-002 |
| **4** | **X2 `state.exclusive-group@1`**（互斥變身群） | **3** | 15-02 · 15-03 · 15-04 |
| **4** | **X18 exact ability ref**（今天只到 `abilitySlot`） | **3** | 45-04 · 13-002 · 80-04 |
| ~~4~~ | ~~**M28b 攻速上限 →10 的後台頁**（task #286）~~ ✅ **已完成，不佔額度** | ~~3~~ **0** | ~~59-001 · 15-04 · 80-002~~ |
| 8 | X9 `scheduler.random-area@1` | 2 | 70-04 · 13-04 |
| 8 | X26 主動技效果的形態閘 | 2 | 79-02 · 79-03 |
| 8 | X15 永久累積非三圍屬性 | 2 | 80-00 · 92-03 |
| 8 | X17 反彈倍率上界（5 < 7） | 2 | 20-04 · 20-002 |
| 8 | H8 `onEvade` 未區分 fumble | 2 | 77-00 · 89-04 |
| 8 | X21 多段序列／「最後一擊」 | 2 | 20-002 · 52-002 |
| 8 | X24 selector 依標記過濾 | 2 | 44-03 · 44-04 |
| 15 | X3 `state.lifecycle@1`（onAutoExit/onExit） | 1 | 20-01 |
| 15 | X16 逐級機率轉真傷 | 1 | 59-02 |
| 15 | X22 限時授予飛行 | 1 | 77-03 |
| 15 | X13 條件：裝備了某類道具 | 1 | 77-002 |
| 15 | X10 事件數值轉資源 | 1 | 15-002 |
| 15 | X7 魔力抵傷 | 1 | 44-00 |
| 15 | X6 交換現存生命 | 1 | 44-002 |
| 15 | X25 「每 N 次普攻」閘（給傷害用） | 1 | 60-03 |
| 15 | X8 可組合控制限制 | 1 | 92-01 |
| 15 | X11 同 tick 雙 target set | 1 | 92-002 |
| 15 | X12 `hook.consume-policy@1`（下一次普攻） | 1 | 15-04 |
| 15 | X5 加權互斥分支 | 1 | 89-002 |
| 15 | X20 累積承傷 → 延長 buff | 1 | 52-01 |
| 15 | X27 資源 % 係數上界（1 < 7） | 1 | 20-002 |

### 3.1 一句話結論

| 指標 | 數字 | 基礎 |
|---|---:|---|
| 今天就完整寫得出來 | **46 / 90（51%）** | 逐支點名，不是抽樣 |
| ◐ 有落差（能做像的，但契約那一格缺） | **11 / 90（12%）** | |
| ❌ 做不到 | **29 / 90（32%）** | |
| ？ 待確認（我不猜） | **4 / 90（4%）** | 45-00 · 44-03 · 44-04 · 52-03 |

⭐ **前四名（X19 / X1 / H9 / X4）合起來擋住 15 支**，佔全部受阻 44 支的 **34%**。
其中 **X19 是最便宜的一個** —— 它不需要新的 effect kind，只需要條件葉能讀「狀態類別」
而不是 exact `statusId`（`content/schema/condition.ts:141` 一格的擴充），
而它一個人擋住熊貓六支裡的五支。

---

## 4. 每位英雄一句話的風險註記

| 英雄 | ✅ / 6 | 一句話 |
|---|---:|---|
| **89 熊貓** | 1 | ⛔ **五支架在同一個機制上（X19）** —— 每支都寫著「(敵方 [某狀態] 下額外追加⋯)」，而條件葉只讀得到 exact `statusId`。**修 X19 = 一次解鎖五支。** |
| **15 涅吉** | 2 | **W/E/R 三支是同一個問題（X2 互斥變身群）**，三支各自標明「[變身]為唯一狀態不可疊加」。EX 另外卡在 X10。 |
| **79 一護** | 2 | 分成兩堆：**79-04 / 79-002 卡冷卻操作（X4）**、**79-02 / 79-03 卡主動技的形態閘（X26）**。兩個都不是傷害問題，是「效果掛在哪裡」的問題。 |
| **20 Saber** | 3 | **反彈家族的上界不夠**：20-04 與 20-002 都要 7 倍，而 `INCOMING_PCT_MAX = 5`。20-01 另外卡在唯一一支需要 onAutoExit 的技（X3）。 |
| **44 夜神月** | 2 | **兩支各自要一個全新 primitive**（X7 魔力抵傷、X6 交換生命），另外兩支的**目標選取語意在文案裡就不清楚**（44-03 / 44-04）。 |
| **80 呂布** | 3 | 三支被擋的都與**永久性／上限**有關（X15 永久攻速攻距、M28b 攻速上限、X18 引用弒鬼神），沒有一支是傷害公式問題。 |
| **92 草泥馬** | 2 | 分散：X8（臥草泥馬要同時擋移動與攻擊）、X15（永久 +1 AP）、X1+X11（最終戈壁）。**沒有共同卡點，所以拆不出一次解鎖多支的捷徑。** |
| **77 剎那** | 3 | 兩支被擋的是**授予方式**不是效果本身：X22（飛行只掛得上被動）、X13+X1（御雷劍要讀裝備並強化另外兩招）。 |
| **13 桀諾** | 4 | 13-04 卡 X9（隨機落點），13-002 卡 X18；**其餘四支全支援**，含 13-00 輪替增益（`cycleBuff` 就是為它做的）。 |
| **59 初號機** | 4 | 只有兩支被擋：59-02（X16 轉真傷）、59-001（X1 改寫 59-00）。**吞噬（`devour`）與 AT 力場（`shield.absorbs`）今天都是現成的。** |
| **70 白木** | 4 | 兩支被擋且**互為因果**：70-04 卡隨機落點（X9），70-002 是對 70-04 的 augment（X1）。**X9 不做，70-002 也沒有意義。** |
| **52 Berserker** | 3 | 反差最大的一位：**52-00 十二道試煉（全批最複雜的一支）今天完整落地**，被擋的反而是 52-01（累積承傷延長）與 52-002（多段序列）這兩個「看起來簡單」的。 |
| **45 佐助** | 4 | 唯一的落差是 45-04「哥哥」要 exact ability ref（X18），今天用 `abilitySlot: "E"` 近似得到；45-00 是文案缺數字。 |
| **60 林克** | 3 | 三支落差全在**「反彈成功之後」**這條線上（60-04 / 60-002 的 H9 + X4），加一支 X25（每三下普攻）。 |
| **12 志狼** | **6** | ⭐ **全批唯一 6/6 全支援。** 六支全部是既有 primitive 的組合（傷害 / 混亂 / 淨化 / 暴擊 / 擊退），**可以當成第一批端到端驗收的 pilot。** |

---

## 5. 待確認（21 項）—— ⛔ 我沒有猜任何一個答案

### 5.1 文案本身有歧義（6 項）

| # | 技能 | 歧義在哪 |
|---|---|---|
| 1 | 45-00 寫輪眼 | 「有 20% [機率][反彈]魔法([AP])傷害」—— **反彈幾成？** 其他反彈技（20-04 3/5/7 倍、15-002 100%）都有數字，這一支沒有。是 100% 還是別的？ |
| 5 | 89-02 憤怒的菊花 | 「造成 [癱瘓] 及 [詛咒]」—— **「癱瘓」對應哪一個狀態？** `content/status-effects/` 十九份文件裡沒有這個名字；候選是暈眩（`stun`）、定身（`root`）、或 root+silenced。三者玩家體感完全不同。 |
| 6 | 52-03 無銘斧劍 | 「附加 [麻痺] 效果，持續 0.6 秒」—— **同上**。⚠️ 15-01 用的是「麻痺 [緩慢] [移動速度]」（帶修飾詞 → 減速），52-03 **沒有修飾詞**，所以不能直接套用。 |
| 8 | 44-03 火車輾過 | 「使敵方 [詛咒]標記的 [周圍]的敵方部隊受到⋯」—— 圓心是**被標記的那個人**還是**施法者**？只打帶標記的，還是打圓內全部？兩種讀法的傷害輸出差好幾倍。 |
| 8b | 44-04 心臟麻痺 | 「造成敵方[詛咒]標記的[現存生命] 30~50% 傷害」—— 標籤只有 `[主動][AP加成]`，**沒有 `[指定]` 也沒有 `[範圍]`**，所以目標數不明。 |
| 16 | 92-03 狂草泥馬 | 「永久增加 1 點 [AP]」—— `grantAttribute` 只發力/敏/智。**是 1 點智慧（會被三圍係數換算成別的 AP 數）還是字面 1 點 AP？** |

### 5.2 我查不出來 / 需要 owner freeze（計畫 §16 已列，尚未裁決）（5 項）

| # | 技能 | 未 freeze 的是什麼 | 出處 |
|---|---|---|---|
| 10 | 15-002 太陰道 | 「反彈傷害」以 `raw \| mitigated \| hpLost` 哪個為基數；AP 疊層是**每層各自 5 秒**還是**全部一次歸零** | 計畫 §16.12 |
| 11 | 89-002 俄羅斯輪盤 | 致盲／混亂時對方死亡率升到 2/6、3/6，**自己的 1/6 是否一併重分配**。⛔ 計畫說未 freeze 前 importer 應直接拒絕這張權重表 | 計畫 §16.14 |
| 12 | 44-002 交換筆記本 | 對死亡、1 HP、超過對方 max HP、施放中目標死亡的處理 | 計畫 §16.16 |
| 13 | 15-02/03/04 | 三種變身是**三個 gameplay state** 還是**三個 3D body**（決定用泛化互斥狀態還是擴 champion-form registry） | 計畫 §16.15 |
| 14 | 59-01 吞噬 · 52-00 試煉 | 處決／免死的傷害順序：穿不穿護盾、無敵、格擋；「回復等同剩餘生命」讀 cast commit 前還是實際 hpLost | 計畫 §16.13 |

### 5.3 數值形狀我確認不了（4 項）

| # | 技能 | 問題 |
|---|---|---|
| 15 | 20-002 | 「（[現存魔力]+[AP]）× 7 倍傷害」—— `zResourcePctTerm` 的 ratio 係數上界是 **1**（`sim/effects/dynamicTerms.ts:87`），寫不進 7。是要提高上界，還是這個式子該拆成別的形狀？ |
| 17 | 20-01 風王結界 | 「造成 1.4/1.6/1.8/2 倍 [暴擊] 傷害」—— 是 `Stat.CritDamage` 的 **override**（取代原本的 1.75）還是 **pctMult**（在原本之上再乘）？兩者差距很大。 |
| 18 | 89-00 憤怒的門牙 | 「使出超會心一擊造成 999 點 [真實傷害]」—— 999 是**固定值**（那「會心」只是文案）還是**基礎值再乘暴擊倍率**？ |
| 22 | 77-03 GLADIARIA ALAT | 「[加速][攻擊速度] 60/90/120/150%」與「變換為 [飛行] 狀態」—— 飛行是**限時 6~15 秒**的，而 `zFlightGrant` 只掛得上被動 rank。是要開一個 `flight` effect kind，還是走 `championForm` 的第二個身體？ |

### 5.4 ⛔ 契約自身的三處不一致（我不改，交回去裁決）（3 項）

這三項是我在對帳時抓到的 **`editorCapabilities.ts` 與出貨註冊表打架**，
而 `editorCapabilities.test.ts` 的推導守衛**抓不到它們**（因為 probe 的 key 名對得上自己）。

| # | 矛盾 | 證據 |
|---|---|---|
| **A** | **`hook.on-reflect-success@1` 宣告 `unsupported`，理由寫「反彈成功這個時刻沒有事件」—— 但 `zHookEvent` 已經有 `onReflect`，而且它的註解逐字寫著「⛔『成功』= 一發反彈封包真的排出去了」** | 契約側 `content/editorCapabilities.ts:229-237`（`probe: hook("onReflectSuccess")`）vs 引擎側 `content/schema/effect.ts:140-150` + `sim/systems/ReflectHookSystem.ts`。**key 名不同（`onReflectSuccess` vs `onReflect`），所以 probe 永遠回 false，而 `expected: "unsupported"` 與它一致 → 守衛全綠。**⚠️ 這正是「推導式清單仍然會撒謊」的形狀：推導的是**值**，不是**鍵名**。 |
| **B** | **`effect.execute@1` 宣告 `unsupported`，理由寫「處決沒有 typed primitive」—— 但 `devour` 已經出貨，而且帶 `thresholdPctOfMax` 逐階處決線與 `throughShields`** | 契約側 `content/editorCapabilities.ts:176-182`（`probe: has("execute")`）vs 引擎側 `sim/effects/effectRegistry.ts:159` + `content/schema/effect.ts:1388-1408`。同 A 的形狀：probe 找的 kind 名是 `execute`，出貨的叫 `devour`。 |
| **C** | **計畫 §2.1.1.2 點名的五個 capability 在 `PLANNED_CAPABILITIES` 一列都沒有** | 缺：`hook.consume-policy@1`（15-04）· `condition.has-equipment@1`（77-002）· `condition.stack-count@1` · `condition.ability-state@1` · `state.lifecycle@1`（20-01）。編輯器照契約找不到它們 → 會以為「沒被點名 = 不需要」，而實際上它們各自擋著技能。 |

⚠️ **A 與 B 的共同教訓**：`editorCapabilities.ts` 的檔頭承諾「每一格都從出貨的註冊表推導」，
而它推導的是 **probe 的求值結果**，不是 **probe 要找的那個名字對不對**。
一個 key 名打錯（或引擎後來換了名字）的 `unsupported`，在守衛眼裡與一個誠實的 `unsupported`
**完全一樣**。這是 CLAUDE.md 失敗形態 ④（斷言方向跟缺陷無關）在契約層的版本。

### 5.5 其餘（3 項）

| # | 項目 |
|---|---|
| 19 | 13-01 暗步的「無視地形與碰撞[瞬移]」今天是由 `teleport` 模板展開成 `leap` + `apexHeight: 0`（`content/templates/expand.ts:959`）。**它符合文案，但它不是一個離散瞬移 primitive** —— 若計畫 §13 要求「零飛行時間」，這一格要重新看。 |
| 20 | 80-04「20% 機率使出[弒鬼神]反擊」今天只能把 80-02 的 `effects[]` **複製**進 hook。複製版**不會**跟著 80-02 的後續調整走 —— 這正是 `ability-augment@1` 要解決的維護債，值得在做 X1 時一併回收。 |
| 21 | 45-01 燃燒標記、79-01 破魔標記、80-02 破甲標記今天都要**自己另外開一份 `status-effect@1` 文件**（`content/status-effects/` 現有 19 份，這三個都不在裡面）才能被 C2 讀到。這不是引擎缺口，是**內容側的前置工作**，但它是 X19 之外「條件讀不到狀態」的第二個原因，要一起排。 |

---

## 6. 建議的做事順序（依 §3 的擋住支數，不是依技能順序）

> ⚠️ 這是**建議**不是裁決；排序權在 owner。列出來是因為 §3 的數字本身就指向一個順序。

| 順位 | 做什麼 | 解鎖 | 為什麼排這裡 |
|---|---|---:|---|
| 1 | **X19** 條件葉能讀「狀態類別」而不只是 exact `statusId` | 6 支 | 擋最多，而且**不需要新的 effect kind** —— `content/schema/condition.ts:141` 一格的擴充 |
| 2 | **X4** `effect.modify-cooldown@1` | 3 支 | 一個新 kind 解三支，而且三支都是招牌 EX/R |
| 3 | **X2** `state.exclusive-group@1` | 3 支 | 涅吉整組 W/E/R 一次到位；⚠️ 先等 §16.15 裁決（是 state 還是 body） |
| 4 | **X1** `ability-augment@1` | 4 支 | 擋第二多，但**成本也最高**（authoring graph edge + reverse closure），所以不排第一 |
| 5 | **H9** 反彈封包 provenance | 4 支 | ⚠️ 先修 §5 矛盾 A —— 有可能大部分已經做完了，只是契約沒對上 |
| 6 | **X17 + X27** 兩個上界 | 3 支 | 各是**一行常數**（`reflectLimits.ts:36`、`dynamicTerms.ts:87`），CP 值最高的一格 |
| ~~7~~ | ~~**M28b** 攻速上限後台頁（task #286）~~ ✅ **已完成** | ~~3 支~~ 0 支 | 後台頁 2026-08-01 就上了；2026-08-08 補上技能路徑守衛後三支全部解封 |

⛔ **不要**按 §2 的表由上往下做技能 —— 那會讓 Saber 的 X3（只擋 1 支）排在熊貓的 X19（擋 6 支）前面。

---

## 附錄 · 這份文件怎麼重新驗證

```bash
# 1. 對這份表的 commit
git rev-parse --short HEAD        # 本文寫成時：8cfb22d3

# 2. 出貨的 effect kinds（§1 的 M 系列）
sed -n '105,163p' packages/shared/src/sim/effects/effectRegistry.ts

# 3. 出貨的 hook 事件（§1 的 H 系列）
sed -n '115,175p' packages/shared/src/content/schema/effect.ts

# 4. 條件葉（§1 的 C 系列 —— X19 的現場）
sed -n '141,149p' packages/shared/src/content/schema/condition.ts

# 5. 對外契約（§1.3 的 X 系列 + §5.4 的三處矛盾）
sed -n '125,309p' packages/shared/src/content/editorCapabilities.ts
```

⛔ 本文**沒有**產生任何程式碼變更，所以沒有測試要跑。
它唯一的驗收就是上面五條指令的輸出，與 §1 的每一個 `檔案:行號`。
