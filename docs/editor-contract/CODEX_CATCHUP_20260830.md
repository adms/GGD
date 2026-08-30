# Codex 編輯器追平清單（2026-08-30）

> ⭐ 這一份是**給 `feat/ability-review-authoring` 追平今日 main 用的**。
> ⛔ 不是重寫清單 —— 每一項都是**加**，⛔ 沒有一項是「格式變了」。

---

## 0. ⭐ 先講結論：契約**沒有 breaking change**

owner 2026-08-30 的擔心逐字是「**契約格式可能是過時的**」。⭐ 量過了：

| 區塊 | 分支 | 今天 | 變化 |
|---|---:|---:|---|
| effect kind | 37 | 46 | **+9 / −0** |
| effect 欄位 | 190 | 260 | **+70 / −0** |
| hook 事件 | 19 | 33 | **+14 / −0** |
| hook 欄位 | 21 | 21 | ±0 |
| 條件葉 kind | 5 | 5 | ±0 |
| 條件葉欄位 | 12 | 13 | **+1 / −0** |
| ability 欄位 | 0 | 38 | ⭐ **全新區塊** |
| aura 欄位 | 0 | 8 | ⭐ **全新區塊** |
| 模板家族 | 17 | 26 | **+9 / −0** |

⇒ ⭐⭐ **每一格的「消失」都是 0。** 共 **+149 項**要補，⛔ 而一項都不必拆掉重做。

⚠️ 唯二要注意的：
· **`abilityFields`(0→38) 與 `auraFields`(0→8) 是全新區塊** —— 編輯器今天**完全沒有**這兩層。
· `planned` 少了 5 項，⭐ 而那是因為它們**被做出來了**
  （`delayed-sequence` · `execute` · `proxy-cast` · `consume-policy` · `on-ability-hit`）。

## ⭐ 為什麼分支仍然可用

`packages/shared/src/content/authoring/effectGraph.ts` 走的是 `zEffectDef.safeParse`
⇒ **schema 推導的，⛔ 不是寫死清單** —— schema 一改它就跟著走。
⇒ ⭐ 要補的是 **UI 那一層的欄位表**，⛔ 不是模型。

---

## 1. 基線落差

| | |
|---|---|
| 分支記的基線 | `main@9e5cc3785` ⇒ ⛔ **落後 1,186 個 commit** |
| content 版本 | `cv_3a0dbeda0f4d` → **`cv_736640f5dba5`** |
| 能力指紋 | `8d30566f` → **`f3f4185c`** |
| 契約來源 | `docs/editor-contract/ggd-runtime-capabilities.json`（⭐ 機器可讀，⛔ 不要讀 md）|

⚠️ ⭐ **重生成契約的指令**（⛔ 不要手改那份 JSON）：
```bash
pnpm caps:export
```


## effect kind —— **+9**

⭐ **最重要的一批** —— 每一種都要有節點型別與欄位表

```
  carry · chainLightning · comboStrikes · convertTeam · floatingText · pull
  screenFlash · screenShake · spawnModelFx
```

## hook 事件 —— **+14**

⭐ 這些是「什麼時候觸發」的下拉選單選項

```
  onAllyDamaged · onBoundaryTouch · onCrowdControlApplied · onCrowdControlReceived · onDashOrBlink · onHeal
  onLethalDamage · onOverheal · onProjectileExpire · onRoundEnd · onRoundStart · onStatCapReached
  onUltimateCast · onUltimateHit
```

## 模板家族 —— **+9**

⭐ 模板是玩家最常用的入口（一個家族服務 16 支）

```
  beam-roll · line-blast · locust-line · locust-orb · locust-strike · locust-swarm
  locust-travel · periodic-field · radial-burst
```

## ability 欄位 —— **+38**

⭐⭐ **全新區塊** —— 技能本身的欄位（冷卻／耗魔／施法型別／圖示…），編輯器今天沒有這一層

```
  augment · castTimeSec · castType · cooldown · cooldownShape · cooldownTier
  description · descriptionRoles · effects · hitFeel · icon · id
  innateActivePassive · innateKind · interruptOn · manaCost · manaCostTier · marks
  maxRank · name · passive · persistentVfx · provenance · radius
  radiusTier · range · rangeTier · rangeUnlimited · recoveryRoots · recoverySec
  rootWhileCasting · sfxKey · slot · targetsEnemies · template · toggle
  vfxKey · vfxLayers
```

## aura 欄位 —— **+8**

⭐⭐ **全新區塊** —— 靈氣（持續影響周圍的那一族）

```
  affects · hooks · includeSelf · key · lingerSec · modifiers
  radius · scaleByNearby
```

## 條件葉欄位 —— **+1**

⚠️ 條件葉 kind 仍是 **5 種**（±0）—— ⭐ 那是 no-code 表達力的上界，值得單獨討論

```
  other
```

## effect 欄位 —— **+70**

⚠️ ⭐ 這 70 格分佈在上面那 9 種新 kind **與既有 kind 上** ——
⛔ 不要假設它們只屬於新 kind（例：`scaleAxis` 是 2026-08-26 加給既有 `spawnModelFx` 的）。

```
  advance · alpha · amplitude · anchor · anchorCount · anchorRadius · arriveSoundKey · attach
  attackType · boneOn · centre · clip · clipTimeScale · colorRgb · countsForOriginalTeam · deathWard
  decay · destination · distanceUnits · driftAngleDeg · driftAngleStepDeg · driftFrom · driftSpeed · family
  finisher · finisherDelaySec · forcedTarget · hitOncePerTarget · immobile · includeNeutrals · jumpIntervalSec · jumpRange
  jumps · lifeSec · maxHeld · maxSources · maxTotalJumps · modelKey · offsetForwardU · onCarrierDeath
  onTouch · oncePerRoundPerVictim · path · peakAlpha · perStrike · permanentScope · preset · primaryAttribute
  revisit · riseSpeed · scale · scaleAxis · scripted · sizeScale · soundKey · spacing
  spinDegPerSec · statusImmunity · stopDistance · strikeReposition · strikes · text · tint · touchOncePerTarget
  touchRadius · touchSide · typeStreakImmunity · untargetable · until · vision
```

---

## 2. ⭐ 追平的驗收（⛔ 不是「看起來都在」）

⚠️ 依第二守則，一個 `[x]` 不等於一條會紅的守衛。⇒ 追平要有**一條覆蓋率閘**：

> 契約（`ggd-runtime-capabilities.json`）宣告 **supported** 的每一項，
> 編輯器的欄位表都要有對應的一格；⛔ 少一格就紅並指名。

⭐ 那條閘寫得出來，因為**兩邊都是機器可讀的**：
契約是 JSON，編輯器的欄位表是 TS 常數。

⚠️ ⭐ 而它**必須兩個方向都驗**（失敗形態⑫）：
· 契約有而編輯器沒有 ⇒ 🔴（玩家碰不到那個機制）
· 編輯器有而契約沒有 ⇒ 🔴（玩家做出來的東西**上線就是死的**）

---

## 3. ⛔ 追平**不涵蓋**的（⭐ 那是另一份計畫）

既有計畫 `EDITOR_IMPLEMENTATION_PLAN.md` 逐字搜尋：
**玩家 · UGC · 分享 · 審核 · 權限 · 帳號 · 上傳 · 社群 · moderation ⇒ 全部 0 次。**

⇒ ⭐ 它是一份**作者工具**計畫，⛔ 不是 UGC 計畫。
玩家那一層（身分 · 投稿 · 審核 · 發現 · 對抗性測試）寫在
`docs/玩家UGC No Code 視覺化遊戲引擎編輯器計畫.md`。

⚠️ ⭐ 而 **M5 的三個 `[ ]`（staging validate → CAS apply → rollback）與 M4 的 render bridge
在遊戲端**，⛔ 不在編輯器 —— 那是 GH#736，今天 **0 commit**。
⇒ ⭐ **編輯器追平之後，那條鏈仍然是斷的。**

