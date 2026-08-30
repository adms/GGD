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

---

# 4. ⛔⛔ 開發守則：**這個 repo 會咬你的九件事**

⚠️ ⭐ 這一節是給**看不到 `CLAUDE.md`、也看不到這個 repo 歷史**的人／agent 的。
⛔ 每一條都是**真的發生過**的，⛔ 不是理論。

## ① ⛔ 產物不可手改 —— 而且它會**擋下你**

`content/` 底下 **621 份是產生器的產物**，⛔ 而**用路徑猜不出來**（同一個目錄兩類都有）。

```bash
bash scripts/genguard.sh <path>      # ⭐ 動任何 content/ 或 docs/ 的檔之前先問
bash scripts/genrun.sh <step>        # ⭐ 改了來源之後用它重生成（會自己解鎖／上鎖）
```

⚠️ ⭐ 產物平時是 **`chmod 444`**（隔離區）⇒ 你直接寫會吃 **PermissionError**，
⛔ 而錯誤訊息不會告訴你原因。逃生口 `GGD_QUARANTINE_OFF=1`（⭐ 用了要在 commit 訊息說為什麼）。

## ② ⭐ 改 `content/` 之後要 `content:build`，**而且來源檔也要進版控**

```bash
pnpm content:build && git add content/    # bundle.json / manifest.json / 各 _index.json
```

⚠️ ⭐ **2026-08-02 有過一次生產故障**：三個新的 config 來源檔**沒 commit**，
而 `content:build` 讀工作區、把它們**烘進了被 commit 的 `bundle.json`**
⇒ 線上拿到「bundle 有這三份 / schema 不認得 / 來源檔不存在」⇒ 內容載入**整份失敗**
⇒ 退回 2 隻骨架英雄。⭐ 守衛：`shippedBundleHasTrackedSources.test.ts`（它比對 `git ls-files`）。

## ③ ⛔ `shape: "circle"` 一定要有**字面 `radius`**

schema 的 refine 跑在 `resolveRadiusTier` **之前** ⇒ 只寫 `radiusTier` 會讓
`content:build` 直接 **EXIT=1**。⭐ 出貨慣例是**兩格都寫**
（`radiusTier:"中"` ＋ `radius:6.0`，值取自 `content/config/aoe-tiers.json`）。

## ④ ⛔ `damageTier` 與 `flat` **不可以同時填**

五級距在**註冊時**把級別翻成數字，⭐ 是**取代**不是相加 ⇒ 兩格都填時 `flat` 一個位元都不會被讀。
⚠️ 而它是同一個值的第二個住處：owner 改一次公式表，填級別的全庫跟著動、填字面值的不動，
⛔ **沒有任何一步會報錯**。守衛：`tierFlatExclusive.test.ts`。

## ⑤ ⛔ `packages/shared/src/sim/**` 是**純函式區**

禁止 `Math.random` · `Date.now` · 三角函式 · `**`（守衛 `sim/purity.test.ts`）。
到期一律用**絕對 tick**，`Map` 迭代要先排序。
⚠️ ⭐ 理由是**決定性**：同一個 seed 必須得到同一場比賽（replay / 對帳都靠它）。

## ⑥ ⛔ Colyseus `defineTypes` 是 **APPEND-ONLY**

新欄位只能加在**最後**，⛔ 加錯回不去（線上舊分頁會整格錯位，**不報錯**）。
⚠️ `ENTITY_FLAG` 現在是 uint32，剩 **11 格**；⛔ 第 32 顆（`2^31`）**永遠不要用**
（JS 位元運算轉 int32 ⇒ 它是負數 ⇒ 寫成 `> 0` 的讀端靜默回 false）。

## ⑦ ⭐ `「」` 裡是**角色對白**，⛔ 不是效果

任何讀技能說明找機制的東西（正則／閘／LLM／編輯器的自動建議）**都要先剝掉整段 `「…」`**。
⚠️ 已量到的誤報：「在35秒後宣布勝利吧」被讀成一支有 35 秒延遲的技能。
⇒ ⭐ **編輯器的自動建議如果讀了台詞，它產出的 JSON 會多出不存在的機制。**

## ⑧ ⚠️ 新增 `content/config/*.json` 會動到**兩個共用檔**

`configDocCoverage.test.ts` 要求每份新 config 都要有後台入口
⇒ 一定會改 `apps/admin/src/store.ts` 與 `apps/admin/src/ui/App.tsx` **各一行**。
⭐ 那是這個 repo **唯一真正共用**的檔 —— ⚠️ 併行時的衝突熱點。

## ⑨ ⛔ `pnpm skills:sync` 是**全域鎖**

它會寫 `bundle.json` ⇒ **同一時間只能有一條工作流跑它**。
⭐ `--check`（`pnpm skills:check`）是唯讀的，隨便跑。

---

# 5. ⭐ 分工：檔案柵欄（⛔ 這一節是安全的關鍵）

⚠️ ⭐ **背景**：main 這邊每天有 **6–12 條平行 lane** 在動 `content/` 與 `packages/shared`。
⛔ 而 2026-08-30 量到 **85 個 commit 擱在 69 條分支上沒進 main** ——
⇒ ⭐ 「等全部做完再合」在這個 repo **已經證明會產生孤兒**。

| 目錄 | 誰動 | 規則 |
|---|---|---|
| `apps/editor/**` · `apps/editor-desktop/**` | ⭐ **Codex** | 主線不碰 |
| `packages/shared/src/content/authoring/**` | ⭐ **Codex** | 主線不碰 |
| `apps/content-api/**` | ⭐ **Codex** | 主線不碰 |
| ⚠️ `packages/shared/src/content/schema/**` | ⭐⭐ **兩邊都要動** | ⛔ **最危險的接縫** —— 見下 |
| `packages/shared/src/sim/**` | **主線** | ⛔ Codex 不碰（引擎機制） |
| `content/**` | **主線** | ⛔ Codex 不碰（⭐ 621 份是產物）|
| `apps/client/**` · `apps/game-server/**` | **主線** | ⛔ Codex 不碰 |
| `apps/admin/**` | **主線** | ⛔ Codex 不碰（⭐ 那是 owner 的後台，另一條線）|
| `docs/editor-contract/**` | ⭐ **產生的** | ⛔ **不要手改** —— 跑 `pnpm caps:export` |

## ⭐ 那條危險接縫的規則

`schema/` 是**引擎與編輯器的共同語言**。⇒ 規則只有一條：

> ⭐ **schema 的改動一律由主線做**（它跟著引擎機制走），
> ⛔ Codex 只**消費** schema，不修改它。
> ⇒ 編輯器發現「schema 少一格」時 ⇒ **回報**，⛔ 不要自己加。

⚠️ ⭐ 理由：schema 加一格意味著**引擎要有人讀它**。
⛔ 加了 schema 而引擎不讀 ＝ 玩家做出來的東西**上線就是死的**（失敗形態⑧，這個 repo 一天中過五次）。

## ⭐ 同步節奏（⛔ 不要「做完再合」）

| | |
|---|---|
| **Base** | ⭐ **rebase 到今日 main**，⛔ 不要在 1,186 個 commit 前的基線上做 |
| **合的頻率** | ⭐ **每完成一個區塊就合一次**（例：補完 `abilityFields` 38 格 ⇒ 合）|
| **方向** | Codex → main（⭐ 主線只送 schema 與契約過去）|
| **閘** | `npx vitest run packages/shared/src/ops/noStrandedLaneCommits.test.ts` |

---

# 6. ⭐ 收貨檢查表（主線用）

Codex 送回來的每一批，逐條檢查：

| # | 查什麼 | 指令 |
|---:|---|---|
| 1 | ⭐ **契約覆蓋率**：宣告 supported 的每一項，編輯器都有欄位 | （⚠️ 這條閘**還不存在** —— 見下面的缺口）|
| 2 | 沒有手改產物 | `bash scripts/genguard.sh <每一個改到的 content/ docs/ 檔>` |
| 3 | schema 沒被 Codex 改 | `git diff --stat main...<branch> -- packages/shared/src/content/schema/` **應該是空的** |
| 4 | 型別過 | `pnpm typecheck` ⇒ ⚠️ ⭐ 看**離開碼**（`pnpm typecheck; echo EXIT=$?`），⛔ 不要 `\| grep error`（`-s` 會吞掉子專案輸出，那個 grep **結構上永遠不會 match**）|
| 5 | 測試過 | `npx vitest run apps/editor packages/shared/src/content/authoring` |
| 6 | 內容仍然載得起來 | `pnpm content:build; echo EXIT=$?` |

## ⭐⭐ 更新（2026-08-30 當天做掉了）：**清單現在是機器產生的**

⛔ 本文件第一版寫「第 1 條那個閘還不存在」。⭐ **現在有一半了。**

### ⭐ `docs/editor-contract/ggd-editor-coverage.json` —— **450 項必須實作 · 15 項明確不必**

```bash
pnpm editorcov:build      # 重生成（⛔ 不要手改那份 JSON）
pnpm editorcov:check      # 唯讀對帳
```

| group | 幾項 |
|---|---:|
| effectField | 260 |
| effectKind | 46 |
| hookEvent | 33 |
| templateFamily | 26 |
| hookField | 21 |
| **abilityField** | **38** |
| **auraField** | **8** |
| conditionLeafField | 13 |
| conditionLeaf | 5 |
| **合計** | **450** |
| ⭐ 明確**不必**實作（unsupported，**帶理由**）| 15 |

⭐ 它**從出貨註冊表推導** ⇒ 引擎長出新機制，這一份自動變長。
⇒ ⭐⭐ **這份追平清單不需要維護** —— ⛔ 讀那份 JSON，不要讀這裡的表。

守衛：`packages/shared/src/ops/editorCoverageFresh.test.ts`
（突變驗過：砍掉 3 項 ⇒ 🔴「清單過期了」· 推導漏掉一個 group ⇒ 🔴「漏了一整類」）

## ⛔ 而**另一半在你們那邊**（⭐ 這是分工）

⚠️ ⭐ `apps/editor` **不在 main 上** ⇒ 一條寫在 main 的測試**讀不到它**
⇒ 那會是一條**永遠不會紅的閘**（這個 repo 已經踩過：一個從來沒人看它綠過的閘，
與一個不存在的閘沒有差別）。

⇒ ⭐ **請在編輯器那一側寫這條閘**：

> 讀 `docs/editor-contract/ggd-editor-coverage.json` 的 `required`，
> 逐項確認編輯器的欄位表有對應的一格；⛔ 少一項就紅並**指名**。

⚠️ ⭐ 而它**必須兩個方向都驗**（⛔ 只驗一頭一定會漏）：
· 清單有而編輯器沒有 ⇒ 🔴（玩家碰不到那個機制）
· 編輯器有而清單沒有 ⇒ 🔴（⭐ **玩家做出來的東西上線就是死的**）

⭐ `notRequired` 那 15 項是**刻意不必實作**的（引擎今天做不到），每一項都帶理由 ——
⇒ ⛔ 不要為它們做 UI，⭐ 但也不要靜默忽略：它們該在畫面上顯示成「引擎還不支援」。

## ⛔ 原本寫在這裡的那一段（保留）：**第 1 條那個閘還不存在**

⚠️ ⭐ 今天有 `packages/shared/src/content/editorCapabilities.test.ts`，
⛔ 但它守的是「**契約有沒有對引擎說謊**」（宣告 supported 而引擎沒有 → 紅；反之亦然），
⛔ **不是**「編輯器有沒有跟上契約」。

⇒ ⭐ **追平的第一件事應該是寫那條閘**，⛔ 不是先補欄位：

> 契約（`ggd-runtime-capabilities.json`）宣告 supported 的每一項，
> 編輯器的欄位表都要有對應的一格；⛔ 少一格就紅並**指名**。

⚠️ ⭐ 而它**必須兩個方向都驗**（⛔ 只驗一頭一定會漏）：
· 契約有而編輯器沒有 ⇒ 🔴（玩家碰不到那個機制）
· 編輯器有而契約沒有 ⇒ 🔴（⭐ **玩家做出來的東西上線就是死的**）

⭐ 有了它，這份追平清單就**不需要維護** —— 閘會自己說還差什麼。
