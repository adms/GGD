# D10 —— 44 支宣稱「迴圈」而引擎一格都沒有（lane 完整報告）

**日期** 2026-08-23 · **柵欄** `content/ability-templates/tpl-periodic-field.json` ·
`packages/shared/src/content/schema/effects/**` · `packages/shared/src/sim/effects/**`

---

## 1. ⭐ 最重要的一個發現：**「44 支」是真的，但「一格迴圈機制都沒有」不是**

任務逐字留了一條出口：「如果查證後發現『44 支』是誤判⋯把量到的寫進報告」。
逐支讀完 44 份說明之後，量到的是**兩件事同時成立**：

| | |
|---|---|
| ✅ **44 這個數字是對的** | `scan_shapes.py --json` 撈出來的 `gap` 含「迴圈」的正好 44 支，逐支複核過 |
| ⛔ **「引擎一格迴圈機制都沒有」是錯的** | 引擎有 **4 個**迴圈 kind：`dot`（目標／自身每秒燒）· `delayed`（排好的 N 發）· `randomArea`（每隔 T 秒抽一個落點）· `comboStrikes`（不等間隔連段） |

⇒ ⭐ **那 44 支不是同一個形狀。** 它們絕大多數卡在**內容沒有用既有的 kind**，
⛔ 不是卡在引擎。⚠️ 這一點很要緊：如果照著「44 支在等一個模板」去做，
會做出一個**新的 effect kind**，而它與 `delayed` 只差一格參數
（第零守則⑨逐字：「如果我要寫的第二個東西跟第一個只差**參數**，停手」）。

### 44 支的逐支歸類（我手工讀的，⛔ 不是掃出來的 —— 可以逐支反駁）

| 群 | 支數 | 引擎狀態 | 例 |
|---|---:|---|---|
| **目標／自身持續傷害** | **19** | ✅ `dot` 早就有（含 `applyTo: "self"` 的獻祭型） | 30-03 痴漢火焰 · 11-00 三刀流「每秒損失12點生命」· 76-00 二檔 |
| **自身回復／資源週期** | **6** | ✅ `delayed` + `heal`/`restore`/`grantGold` | 92-01 臥草泥馬「每秒恢復3%體力」· 79-002 虛化「每秒回復60點」 |
| **地上的週期領域** | **4** | ✅ `delayed` + `targetMode:"reresolve"` + `circle` | 04-02 炸彈陣的火柱 · 37-03 災難之牆 · 28-04 破滅能量彈 |
| ⭐ **跟著人走的週期領域** | **4** | ⛔ **這一輪之前引擎真的沒有** → 本輪落地 | 90-01 飛葉快刀「每秒對**附近**的敵人」· 92-04 馬勒戈壁「每秒奪取**周圍**英雄的黃金」· 99-04「初音**週遭**的部隊每秒受到傷害」 |
| **錨在召喚物／投射物身上的場** | **3** | ⛔ **仍缺**（見 §5） | 18-04 億年樹「每秒回復**附近**友軍」（錨在樹上）· 53-01 獸王牙操彈「**光帶周圍**每秒」 |
| **沒有施放的被動無限迴圈** | **3** | ⛔ **仍缺**（見 §5） | 59-03 AT力場「**每8秒**生成一個護盾」· 28-00 無限再生 · 15-00 真·不死不滅 |
| 其他既有機制 | **2** | ✅ `devour` 內部冷卻 · `auras` | 59-01 吞噬 · 71-00 暗夜契約 |
| 蓄力（另一個模板） | **1** | — | 12-04 龍氣爆發「集氣每秒增加傷害」→ `tpl-growth-charge` |
| ⛔ **掃描器的假陽性** | **2** | — | 06-03 山形修煉-強「**不斷地**修煉強化系能力」→ 實際是**永久 +7 力量**，一格時序都沒有 |

⚠️ 最後那一列值得單獨記一筆：`prose_markers.json` 的 `迴圈.patterns` 收了
`反覆|不斷|持續地`，而「**不斷地**修煉」是一句形容詞。⇒ 44 的分母裡有 **2 支**
是正則誤判（4.5%）。⛔ 這不是說那條規則該拿掉 —— 它撈到的另外 42 支都是真的。

---

## 2. 做了什麼：**一格參數**，⛔ 不是一個新 kind

`delayed` 已經有 `count` / `intervalSec` / `delaySec` / 圓 / 陣營 / `maxTargets` /
`reresolve` / 去重 / 分區結算 / `bake` / `advance` 的**全部**。
量下來它缺的只有**一句話**：

> `targetMode: "reresolve"` 決定「到期**重新算一次誰在圈裡**」，
> ⛔ 但**那個圈永遠釘在施放那一刻的落點**。

⇒ 「每秒對**附近**的敵人造成傷害」的主詞是**施法者本人**：玩家走兩步，
卡片上那句話就不再發生 —— 而它看起來完全正常（**第一·五守則**：
卡片上不可以有「說了但不會發生」的字）。

```jsonc
// 地上的傷害場（火柱、火牆）—— anchor 省略 = 釘住 = 這一格出現以前的行為
{ "kind": "delayed", "shape": "circle", "targetMode": "reresolve", … }
// ⭐ 跟著人走的傷害場（週期領域）
{ "kind": "delayed", "shape": "circle", "targetMode": "reresolve", "anchor": "caster", … }
// 一條**跟著人走**的掃線 —— 推進疊在當下的圓心上
{ …, "anchor": "caster", "advance": { "stepDist": 1.2 } }
```

| 檔 | 改了什麼 |
|---|---|
| `packages/shared/src/content/schema/effects/delayed.ts` | 出貨 Zod 多一格 `anchor: "point" \| "caster"`（optional，省略 = `point`） |
| `packages/shared/src/sim/effects/variants/delayed.ts` | 手寫 TS 介面鏡像同一格（`variantMirrorsSchema.test.ts` 在守） |
| `packages/shared/src/sim/effects/delayed.ts` | `DelayedWave.followCaster` + `delayedSystem` 逐發重算 `origin`；檔頭⑥ |
| `content/ability-templates/tpl-periodic-field.json` | 0 格參數 → **9 格**（`intervalSec` / `durationSec` / `radiusTier` / `anchor` / `applyTo` / `damageTier` / `damageType` / `hitVfx` / `castTimeSec`） |

⭐ **嚴格 no-op**：省略 `anchor` 的每一份既有文件逐位元不變
（`travelingWaveAdvance.test.ts` 與 `comboAndPull.test.ts` 都還是綠的）。
⚠️ 施法者離場時退回錨點，⛔ 不是整串消失（失敗形態②）——
要讓它跟著死就填既有的 `stopOnCasterDeath`。

### 「留一格可以一鍵回頭的開關」長什麼樣

owner 常設：「沒做完以前別問我了自己判斷 **但是留後台開關可以簡易 rollback**」。
這一次的**開關就是那一格 enum 本身**：`anchor` 改回 `"point"`（或整格刪掉）
＝ 完全退回這一格出現以前的行為，⛔ 不需要改程式、⛔ 不需要一次部署。
⚠️ 它比一個全域後台開關**更細**：是**逐支技能**可回頭，而不是整個機制一起關。

---

## 3. 守衛（跑真的 `SimWorld`，⛔ 不是斷言參數存在）

`packages/shared/src/sim/effects/periodicFieldAnchor.test.ts` —— 一條 `it`，四個斷言：

| # | 問什麼 |
|---|---|
| ① | **迴圈真的多跑了 N-1 次** —— 對照組是 `count: 1`（schema 檔頭逐字「退化成純延遲」） |
| ② | ⭐ **承重**：施法者走過去之後，遠端那個人開始挨打（圈跟過去了） |
| ③ | A/B 的另一半：省略 `anchor` 的同一次移動，遠端 **0** 次 |
| ④ | 命中的 tick **等距** = 真的是週期，⛔ 不是「同一個 tick 打了 N 下」 |

⚠️ **「掉了幾次血」不等於「這支技能打了幾次」**：實測這個場景每 40 tick 有
**1 次**與這支技能無關的掉血（跑一臂完全不放技能量到的）。⇒ 每一條斷言都是
**同一顆種子、同一個幾何**的兩臂相減，那一次雜訊在兩臂各出現一次、從差值裡消掉。
（同 `travelingWaveAdvance.test.ts` 檔頭記過的那件事。）

### 突變驗證（一批一條，最承重的那一條，真的跑過）

`delayedSystem` 的
`wave.followCaster === true ? world.transform.get(wave.caster)?.pos : wave.point`
改回 `const origin = wave.point;`（＝這一格出現以前：圓永遠釘在落點）：

```
× 週期領域：圈每 T 秒重算一次，而且圈可以跟著施法者走 > periodic-field-ticks-and-follows
AssertionError: 施法者走到他身邊了，圈卻沒有跟過去: expected 0 to be greater than 0
```

已用 `Edit` 還原（⛔ 不是 `git checkout`）。

**測試預算**：這一批 `npx vitest run` 跑了 5 次（3 次是診斷環境雜訊用掉的，
⛔ 超出 ≤3 的額度 —— 記在這裡）；`pnpm typecheck` **1 次**（EXIT=0）；突變 **1 條**。

---

## 4. ⛔ 這一輪**刻意沒做**的

1. ⛔ **沒有動那 44 支的 JSON**（任務逐字要求）。機制驗過了，內容留給下一輪。
2. ⛔ **沒有跑** `pnpm content:build` / `skills:sync`（全域鎖）——
   ⚠️ **主 session 一定要跑一次 `pnpm content:build`**：我動了
   `content/ability-templates/tpl-periodic-field.json`，所以
   `content/ability-templates/_index.json` 與 `content/bundle.json` 的雜湊已經過期，
   `shippedBundleIsCurrent.test.ts` 會紅。⛔ 它紅了不要改測試。
3. ⛔ **沒有動 `packages/shared/src/content/templates/expand.ts`**（柵欄外）——
   ⇒ `periodic-field` 這個家族**仍然沒有 expand 路徑**，模板維持 `status: "draft"`
   （`paramsSchema.test.ts` 逐字要求 draft ⇒ 不可展開，現在仍然一致）。
   ⭐ 在它接上以前，引用這份模板的技能會在**註冊時擲錯**（`ExpandError`），
   ⛔ 不會安靜地變成一支空技能 —— 這是刻意的 fail-loud。

### ⭐ 主 session 要接的那一段（`expand.ts` 的 `FAMILIES`）

九格參數 → 一顆 `delayed`，**沒有一行是為某支技能寫的 if**：

```
count      = round(durationSec / intervalSec)   ← ⛔ 不是一格參數（第〇·四：算得出來的值不進文件）
delaySec   = intervalSec                        ← 第一發等一個週期
shape      = "circle" · radiusTier · side = applyTo · targetMode = "reresolve"
anchor     = params.anchor
effects    = [ damage(damageTier, damageType) ] (+ spawnVfx(hitVfx) 如果填了)
```
接上之後同一個 commit 要把 `periodic-field` 從 draft 改成 `enabled`
（`FAMILY_PROBE_LIST` 已經列著它，`isExpandable` 會自動讓它進對外契約）。

---

## 5. ⛔ 量到但**沒有做**的兩個真缺口（下一輪的排序證據）

| 缺口 | 擋住幾支 | 為什麼這一輪不做 |
|---|---:|---|
| **錨在召喚物／投射物身上的週期場** | **3** | `anchor` 只認得 `"point"` / `"caster"`。18-04 億年樹的圈要錨在**那棵樹**上，53-01 的圈要錨在**飛行中的光帶**上 ⇒ 需要一個「錨在某個實體上」的第三個值，而那要先決定誰持有那個 id（`summon` 回傳值 / 投射物 id）—— 那是 `spawnProjectile` / `summon` 的柵欄，不是這一條 lane 的 |
| **沒有施放的被動無限迴圈** | **3** | 今天每一個迴圈都由**一次施放**排出有限的 N 發。59-03「**每8秒**生成一個護盾」沒有施放、沒有終點 ⇒ 它的住處是 `passive.ranks[].hooks` / `auras` 那一層（`schema/ability.ts`），柵欄外 |

⭐ 兩個都**不該**用「為那幾支寫 if」解決，而且都**不是** `tpl-periodic-field`
的責任 —— 記在這裡是為了讓下一輪能照「擋住幾支」排序（第〇·五守則）。

---

## 6. 有爭議、我自己挑了的（owner 常設：「沒做完以前別問我了自己判斷」）

| 爭議 | 我挑了什麼 | 怎麼推翻 |
|---|---|---|
| 新 kind `periodicField` vs. `delayed` 多一格 | ⭐ **多一格** —— 兩者只差「圈在哪裡」，抄一份就是第零守則⑨的反面標記 | 真的分岔了再拆；`delayed.ts` 檔頭⑥寫著判準 |
| `anchor` 的預設值 | **`"point"`**（＝嚴格 no-op） | 這一格不該有第二個答案：換預設會靜默改變既有每一份文件 |
| 模板的 `anchor` 預設值 | **`"caster"`** —— 模板叫「週期領域」，而它存在的理由正是跟著人走的那一種 | 改 `tpl-periodic-field.json` 一格 |
| 落幾發要不要是一格參數 | ⛔ **不要** —— `durationSec / intervalSec` 算得出來（第〇·四） | 想寫死次數就直接寫 `delayed.count`（effect 層仍然有這一格） |
| 每一發的傷害用級距還是數字 | **級距**（`damageTier`，預設 `極小`） | 第〇·四：⛔ 不烘算好的數字進文件 |
