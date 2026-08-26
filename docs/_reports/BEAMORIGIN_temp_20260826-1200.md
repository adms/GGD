# ORIGIN lane —— 模板家族預設「有沒有出處」稽核（GH#702）

> owner 2026-08-25：「你已經知道是**單個大型光束並非間距排列**，是哪裡走歪讓你又把約束勝利之劍等光束砲家族又變成間距排列？請你**反省根因並修正**」

**一句話**：`schema/template.ts` 早就寫著 `default` is the exemplar's MEASURED value (**never invented**) ——
而那是**判準**，它從**第一份**用到它的模板起就被破了，而且**沒有任何東西會紅**。
量到的底數：**250 個 `params[*].default` 裡，221 個（88.4%）引用不到任何東西。**

---

## 一、`tpl-beam-roll` 六格考古（逐格追到 commit，⛔ 不是印象）

| 參數 | 出貨值 | 哪個 commit 放進來的 | 當時的理由（逐字） | ⭐ 判決 |
|---|---:|---|---|---|
| `count` | ~~6~~ → **1** | `a3bc9838`（08-25） | 「tpl-beam-roll 補 count:6/spacing:2 預設（synthesis 量到的原作值 200 wc3u÷100）」 | ⛔ **誤讀**（見 §二） |
| `spacing` | 2 | `a3bc9838`（08-25） | 同上 | ⛔ **誤讀 ＋ 換算也錯**（÷100 vs 11/600） |
| `path` | `static` | `79b3ec5f`（08-23） | owner「光束砲原地開火，只有波飛出去」＋逐支撈觸發器 | ✅ **有出處**（owner ＋ j:32322…） |
| `scale` | 2.5 | `799e6988`（08-22 出生） | 出生 commit **沒有**點名 scale 的推導；`j:32326` 的引用是 `79b3ec5f`**隔天補的** | ⚠️ **事後對上**（值真的等於 250%，但不是先量後填） |
| `speed` | 30 | `799e6988`（08-22 出生） | 只寫了政策（「速度／距離／自轉／縮放留字面值」），⛔ **沒有寫值從哪來** | ⛔ **憑空**（exemplar 20-03 在原作零位移） |
| `distance` | 14 | `799e6988`（08-22 出生） | 同上 | ⛔ **憑空**（14 = 764 wc3u；原作傷害線到 1200 wc3u = 22.0） |
| `spinDegPerSec` | 720 | `799e6988`（08-22 出生） | `fa8dc538` 逐字「spinDegPerSec 720**(翻滾)**」＝家族名字 | ⛔ **設計選擇**（原作零旋轉呼叫） |
| `touchRadius` | 1.5 | `799e6988`（08-22 出生） | ⛔ 無 | ⛔ **憑空**（原作三個半徑 ×11/600 是 9.39 / 7.33 / 7.33，w3a `area` 是 3.67） |
| `castTimeSec` | 1 | `799e6988`（08-22 出生） | ⛔ 無 | ⛔ **憑空**（A0D5 的 w3a 沒有 cast point）＋**到達不了出貨節點** |
| `lifeSec` | 2 | `57bad55d`（08-24） | 原作 `TriggerSleepAction(2)` | ✅ **有出處**（j:32357 / j:31948 / j:28857） |

⇒ ⭐ **模板出生的那一刻，六個數字槽一個出處都沒帶**，而 `paramsSchema` / `editorCapabilities` /
`modelFxStagingContract` 三條既有守衛**全部是綠的** —— 它們問的是「格式對不對」「機制在不在」，
⛔ 沒有一條問「**這個數字是誰說的**」。

---

## 二、`count:6` 到底錯在哪（三段走歪，逐段有行號）

### ① 誤讀：把**傷害取樣格**讀成**演出具數**

`war3map.j` 逐行（`tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`）：

| 技能 | 那個 `> 6` 迴圈 | 它做什麼 | ⭐ 它生出幾具 unit |
|---|---|---|---:|
| 20-03（**exemplar** A0D5） | j:32335 · j:32346 | `GetUnitsInRangeOfLocMatching(400)` → 傷害（j:32337 j:32348） | ⭐ **0 具** |
| 09-04（A03S） | j:31925 · j:31937 | 第一圈另外生 `h006` FlameStrike1 **火柱**、第二圈純傷害 | 6 具 —— 但那是**火柱**，⛔ 不是光束 |

而**光束本體**在同一段裡是：

```
j:32322   CreateNUnitsAtLoc( 1, 'h00X', … )   ← 勝利劍 黑化 (NetherStrike.mdl)
j:32324   CreateNUnitsAtLoc( 1, 'h00S', … )   ← 勝利劍     (ReviveHuman.mdl)
j:32327   CreateNUnitsAtLoc( 1, 'h008', … )   ← 特效三號   (FragDriller.mdl)
```

⇒ ⭐ **三顆不同模型疊在同一點**（`udg_LocPoint3` ＝施法者前方 150u），
那就是擷圖上「很粗、多層」的來源 —— ⛔ 不是 6 具排成一列。
全 repo 掃過：光束 dummy（h007 h008 h00S h00X h01P h01V h000）的**每一個**生成點都是
`CreateNUnitsAtLoc( **1**, … )` —— j:26790 j:31907 j:31909 j:32322 j:32324 j:32327 j:36048 j:47757，
⛔ **沒有一處在迴圈裡**。

⭐⭐ 而 20-03 的那個 6×200 迴圈**早就已經被翻譯過一次**了：`fa8dc538`（08-22）的 commit 訊息逐字寫
「**6段×200u/收400u→onTouch**」。⇒ `count:6` 是把**同一段 JASS 算了兩次**：一次當傷害、一次當演出。

### ② 推測寫進**家族預設**（成本 O(引用節點數)，⛔ 不是 O(1)）

`a3bc9838` 把 6/2 寫成 `tpl-beam-roll` 的 `params[*].default` ⇒ 引用它的 **7 個出貨節點**一起吃
（20-03 ×2 · 08-03 ×2 · 09-04 ×2 · 59-04 ×1）。
⚠️ 同一個 commit **正確地**替 09-04 的火柱開了**自己的節點**（`preset: tpl-locust-line`）——
也就是說：火柱那一層做對了，然後**同一個數字又被裝進光束那一層**。

### ③ 逐支覆寫**掩蓋**了它（⭐ 這是最貴的一段）

GH#692 查到 59-04 是一具，於是在 `tools/skill-remake/heroes/godie-e00r.py` 寫下（逐字）：

> 「⇒ 逐支覆寫 `count:1`（**模板預設 6 是 09-04 的量值，⛔ 不動模板**）」

⇒ ⛔ **「6 是 09-04 的量值」那句話本身就是誤讀的產物**，而它被寫成一個**不要回頭看**的理由。
結果：59-04 看起來對了、另外 **6 個節點**繼續錯了一整版，而**每一條守衛都是綠的**。

⭐ 這是 CLAUDE.md 已記錄的病的**新載體**：
「我的推測寫進票會變成他的需求」→ **推測寫進模板預設會變成「原作就是這樣」**，
而**逐支覆寫是它的隱形斗篷**。

### ④ 附帶抓到：兩份模板的技能標籤**對調**了

`OBJECTS.json` 逐格對：`A05J` = **08-03 龍鬥氣砲咒文**（trigger `DraBom`@28838）、
`A0GI` = **59-04 野戰型陽電子砲**（trigger `ElecPower`@47757，生 `h01P`「野戰電子砲」）。
而 `tpl-beam-roll` 與 `tpl-locust-line` 的 description **兩處都寫反**。
⇒ 這正是第三守則的形狀：**一句被散文守著的錯誤活過了它的保存期限**，而下一輪（我自己）把它當事實引用。
`tpl-beam-roll` 已改正；⚠️ **`tpl-locust-line` 還沒**（見 §五）。

---

## 三、量到的底數：221 / 250 個 `default` 引用不到任何東西

範圍＝`content/ability-templates/tpl-*.json` 的 46 份（30 份有 `default`）。
280 個 slot · **250 個帶 `default`** · 其中 15 個標了 `inert`（產不出東西，⛔ 不必有出處）
· `tpl-beam-roll` 16 個本輪**全部補上出處** ⇒ 棘輪起點 **221**。

| 模板 | 無出處 | 參數 |
|---|---:|---|
| `tpl-mark-stacks` | 20 | `markId` `initial` `max` `durationSec` `resetOn` `perStackLost` `lethalMode` `lethalConsume` `surviveHpPct` `lethalDamageTypes` `internalCooldown` `invulnerableSec` `invulnerableScope` `restoreHealthPct` `aoeRadius` `knockbackDistance` `knockbackSpeed` `knockbackFrom` `stunSec` `stunStatusId` |
| `tpl-line-blast` | 15 | `modelKey` `path` `speed` `distance` `spinDegPerSec` `scale` `touchRadius` `touchSide` `touchDamageTier` `blastRadius` `blastRadiusTier` `blastDamageTier` `blastApRatio` `damageType` `castTimeSec` |
| `tpl-combo-finisher` | 12 | `comboFamily` `hitVfx` `hitText` `hitTextSizeScale` `hitTextRiseSpeed` `hitTextDurationSec` `finisherVfx` `finisherFlashAlpha` `finisherFlashSec` `finisherShakeAmplitude` `finisherShakeSec` `damageType` |
| `tpl-radial-burst` | 12 | `modelKey` `path` `count` `speed` `distance` `spinDegPerSec` `scale` `touchRadius` `touchSide` `touchDamageTier` `damageType` `castTimeSec` |
| `tpl-charge-push` | 11 | `dashDistance` `dashDurationSec` `apexHeight` `radius` `damage` `damageType` `pushDistance` `pushSpeed` `pushFrom` `pushLaunchHeight` `castTimeSec` |
| `tpl-dragon-quake` | 11 | `modelKey` `count` `ringRadius` `speed` `blastRadius` `scale` `shakeAmplitude` `shakeSec` `impactLifeSec` `damage` `damageType` |
| `tpl-dragon-serpent` | 9 | `modelKey` `instances` `travel` `speed` `touchRadius` `spinDegPerSec` `scale` `damage` `damageType` |
| `tpl-lock-combo` | 9 | `hitCount` `hitIntervalSec` `perHitDamage` `finisherDamage` `finisherRadius` `damageType` `lockTarget` `casterGuard` `trigger` |
| `tpl-leap-strike` | 8 | `mode` `applyTo` `apexHeight` `durationSec` `landRadius` `damage` `damageType` `castTimeSec` |
| `tpl-periodic-field` | 8 | `intervalSec` `durationSec` `radiusTier` `anchor` `applyTo` `damageTier` `damageType` `castTimeSec` |
| `tpl-random-barrage` | 8 | `count` `intervalSec` `impactDamage` `damageType` `impactRadius` `scatterRadius` `payout` `castTimeSec` |
| `tpl-traveling-wave` | 8 | `stepSize` `stepCount` `stepIntervalSec` `aoePerStep` `terminalBurst` `damage` `damageType` `castTimeSec` |
| `tpl-dragon-shockwave` | 7 | `modelKey` `travel` `speed` `scale` `spinDegPerSec` `touchRadius` `damage` |
| `tpl-locust-orb` | 7 | `modelKey` `path` `count` `distance` `speed` `lifeSec` `alpha` |
| `tpl-locust-strike` | 7 | `modelKey` `path` `anchor` `clip` `lifeSec` `scale` `alpha` |
| `tpl-locust-swarm` | 7 | `modelKey` `path` `count` `speed` `distance` `spinDegPerSec` `scale` |
| `tpl-locust-travel` | 7 | `modelKey` `path` `speed` `distance` `spinDegPerSec` `scale` `alpha` |
| `tpl-proxy-cast` | 7 | `anchor` `radius` `damage` `damageType` `statusId` `statusDurationSec` `castTimeSec` |
| `tpl-orbit-array` | 6 | `rayCount` `reach` `rayIntervalSec` `damage` `damageType` `castTimeSec` |
| `tpl-proxy-fanout` | 6 | `radius` `damage` `damageType` `statusId` `statusDurationSec` `castTimeSec` |
| `tpl-locust-line` | 5 | `modelKey` `path` `count` `spacing` `lifeSec` |
| `tpl-on-attack` | 5 | `event` `condition` `bonusDamage` `damageType` `internalCooldown` |
| `tpl-teleport` | 5 | `destination` `castTimeSec` `travelSec` `arriveRadius` `damageType` |
| `tpl-ground-nova` · `tpl-instant-blast` | 4 · 4 | `radius` `damage` `damageType` `castTimeSec` |
| `tpl-on-hit-react` | 4 | `chance` `reflectDamage` `damageType` `internalCooldown` |
| `tpl-buff-self` · `tpl-line-sweep` · `tpl-single-strike` | 3 · 3 · 3 | `duration`/`damage` `modifiers`/`damageType` `castTimeSec` |

⚠️ **這張表⛔ 不是說 221 個數字都是錯的** —— 抽查發現 `tpl-line-blast` 的
`speed 27.5`（45u/0.03s × 11/600）與 `touchRadius 3.67`（200u × 11/600）**是真的量出來的**，
只是**沒有人寫下它們是量出來的**。⇒ 那正是問題：⭐ **「量出來的」與「編出來的」在檔案裡長得一模一樣。**

---

## 四、⭐ 血跡：憑空的數字**會被複製**，而每一份副本讓它更像事實

| 參數 | `tpl-beam-roll`（08-22 憑空） | `tpl-locust-travel`（08-25） | `tpl-locust-swarm` |
|---|---:|---:|---:|
| `speed` | **30** | **30** | 7.7 |
| `distance` | **14** | **14** | 8 |
| `spinDegPerSec` | **720** | **720** | **720** |

⇒ 三個**沒有出處**的數字被原封搬進另一個家族（不同的 dummy、不同的原作行為）。
⭐ 這是「一個沒有出處的預設」的真正成本：它⛔ 不只服務錯 7 個節點，它還會**繁殖**。

⚠️ 另一格：`spacing = 2` 兩份模板都寫著「原作 200 wc3u **÷100**」——
而本專案的換算是 `GGD_PER_WC3 = 11/600`（`templates/expand.ts:50`）⇒ 200 wc3u = **3.67**。
`tpl-beam-roll` 的那一格現在 `count:1` ⇒ 讀不到（無害）；
⛔ **`tpl-locust-line` 的那一格是 `count:6`，它每一場都在畫面上。**

---

## 五、⛔ 沒做的（交給誰、一行是什麼）

| # | 事 | 為什麼我沒做 | 一行修法 |
|---|---|---|---|
| **1** | ⭐⭐ **主 session 必跑** `pnpm skills:sync`（或 `bash scripts/genrun.sh skillremake:json`）＋ `pnpm content:build` | 本 lane 禁跑全域鎖 | 我改的是**來源** `tools/skill-remake/heroes/godie-e00r.py`（刪掉 59-04 的 `count:1` 逐支覆寫）；產物 `content/abilities/godie-e00r.r.json` ＋ `content/champions/godie-e00r.json` **還是舊的** ⇒ `animationFxTemplate.test.ts` 現在**紅**並指名它（見 §六） |
| **2** | `tpl-locust-line.params.spacing` 2 → **3.67** | 另一條 lane 的檔；而且它會改變 09-04 火柱的畫面（要 `@visual-proof`） | 換算是 `200 × 11/600`；順便修 description 裡 `A05J`(59-04) → **08-03** 的對調 |
| **3** | `apps/client/src/vfx/beamAudition.ts:52` 註解仍寫「模板 count 6 沿線」 | 動 `vfx/` 的**非測試檔**會觸發 `visual-proof.sh` 要求像素證據 | 改成「模板 count 1（原作 CreateNUnitsAtLoc(1,…)）」，由要做像素證據的那條 lane 順手帶 |
| **4** | 其餘 220 格出處回填 | 不是一輪的量；棘輪就是為了讓它**只能變短** | `templateOriginBaseline.json` 每一列都寫了**反駁法**；`tpl-orbit-array`/`proxy-cast`/`proxy-fanout`/`random-barrage` 四份的 exemplar **已經帶了 JASS 行號範圍** ⇒ 回填只差把那幾十行讀一遍，最便宜 |
| **5** | `field:models.voxel` 的 fieldAdoption 紅 | ⛔ **不是我造成的**：`status:"landing"`、`since:"2026-07-26"`，今天（08-26）grace 到期 —— 純時間觸發 | 那條 exemption 的正解是改 `status:"debt"` 或完成 #226/#229 |

---

## 六、落地了什麼（檔案清單）

| 檔 | 動作 | 說明 |
|---|---|---|
| `packages/shared/src/content/schema/template.ts` | **改** | `zParamSlot` 新增 `origin?: string`（optional，與既有的 `inert` 同型）；註解裡寫死文法 |
| `content/ability-templates/tpl-beam-roll.json` | **改** | ① 16 格全部補 `origin` ② `count.default` **6 → 1**（帶 8 個行號） ③ description 修正 `A05J`/`A0GI` 對調 ＋ 撤回「十具 dummy 沿一條線」那句誤讀，並記下三段走歪 |
| `packages/shared/src/content/templateOriginBaseline.json` | ⭐ **新檔** | 棘輪豁免表：29 份模板 · **221** 格 · 每份一條**能被反駁**的理由 ＋ `howToRemoveARow` |
| `packages/shared/src/content/templateDefaultsHaveOrigin.test.ts` | ⭐ **新檔** | 四條斷言的閘（見下） |
| `apps/client/src/render/modelFxStatic.test.ts` | **改** | 出貨 09-04 兩層的具數斷言 `6/6` → **`1`（光束）/ `6`（火柱）**；註解寫明為什麼刻意不一樣 |
| `tools/skill-remake/heroes/godie-e00r.py` | **改** | 刪掉 59-04 的 `count:1` 逐支覆寫（＝走歪的第三段）；⚠️ **產物待重生成** |
| `docs/_reports/BEAMORIGIN_temp_20260826-1200.md` | ⭐ **新檔** | 本報告 |

### 閘：`templateDefaultsHaveOrigin.test.ts`

| # | 問什麼 | 紅的時候說什麼 |
|---|---|---|
| ① | 沒有出處的 `default` 一律要在豁免表上 | 逐格指名 `<模板>.<參數>`，並**明說⛔ 不要往豁免表加列** |
| ② | 豁免表⛔ 不可以有過期的列（**棘輪只能變短**） | 「已經有 origin 了，把這一列刪掉」＋總格數 > `RATCHET`(221) 就紅 |
| ③ | ⭐ `j:<行號>` **真的去讀 `war3map.j` 的那一行** | 「超出 56766 行」／「是空行」。⚠️ 檔案不在這台機器上時 **fail-open 但不靜默**：要設 `GGD_ALLOW_MISSING_JASS=1` 才准跳過 |
| ④ | `STRICT_FAMILIES`（＝走歪過的 `tpl-beam-roll`）**永遠不准**再拿豁免 | 「它已經因為一個沒有出處的 default 讓七個出貨節點錯了一整版」 |

**突變驗證（兩條，各自對一個獨立機制）**

| 突變 | 結果 |
|---|---|
| `tpl-beam-roll.count.origin` → 改名成 `MUTATION_origin`（＝出處消失） | ⭐ **①④ 同時紅**，逐字指名 `tpl-beam-roll.count`。已用 `Edit` 還原（⛔ 不是 `git checkout`） |
| `count.origin` 裡的 `j:47757` → `j:999999` | ⭐ **③ 紅**：「`tpl-beam-roll.count → j:999999 超出 56766 行`」。已用 `Edit` 還原 |

**驗證**：`pnpm typecheck` EXIT=**0**（全 workspace）· `bash scripts/visual-proof.sh` ✅（只動到 `render/` 的**測試檔**，不需像素證據）·
9 支相關測試中 **7 綠**，2 紅＝§五-1（待 sync）與 §五-5（時間觸發，非本輪）。

---

## 七、⭐ 這一輪真正的教訓（要進 CLAUDE.md 的那一句）

> **一個沒有出處的預設，比一個錯的數字貴** —— 錯的數字只錯一次；
> 沒有出處的預設會被**當成量測結果引用**，會被**複製到別的家族**，
> 而且**逐支覆寫會把它藏起來**（59-04 看起來對了 ⇒ 沒有人回頭問家族預設是誰的量值）。

⇒ 判準（「`default` is the exemplar's MEASURED value (never invented)」）已經在檔案裡寫了一個月，
它**從第一份用到它的模板起就被破了**。這次換成閘：**引用不到 ⇒ 紅，而且棘輪只能變短。**
