# lane P2 —— 「龍虎亂舞」模板的演出三件套（owner 第 2、3 項）

> 2026-08-23 · 完整報告（回傳值只留摘要）

## ⭐ 題目被 owner 的更正改過（逐字）

> 「**龍虎亂舞是這個模板的俗稱**，意思是類似**格鬥天王**裡的角色招式龍虎亂舞，
>  **放招之後自動打打打打最後一個重招或大招結尾**，在許多格鬥遊戲常見」

⇒ ⛔ 它不是一支缺的技能，是**家族名**。⭐ 稽核先前判「根本沒有這支 ability 文件」是讀錯了 ——
複驗結果：原作**真的有**一支叫「00-00 龍虎亂舞」的技（rawcode `A0J2`，家族 key `dragontigerready`），
但它 `ownerKind: "map-mechanic"` —— `war3map.j:13868/13976` 把它加給**遊戲結束時的終結者**
（`Trig_GameOver_Red/Green_Actions`），tooltip 標籤 `[亂鬥]`、編號 `00-00`（＝無英雄）
⇒ **它是地圖模式的終局演出技，不在任何英雄的技能表上**，所以 GGD 沒有、也不該有對應的 ability。

---

## ① 盤點 —— 29 個家族裡「連段→收尾」有 13 個

判準（結構推導，⛔ 不是一張手寫名單）：`strikes ≥ 2`，或有 `steps` 且 `damageCalls ≥ 2`，
或 `shape:"per-step"` 且 `damageCalls ≥ 2`。⇒ **13 / 29**，指到 **18 個出貨 ability id**。

| 家族 | 段數 | 收尾延遲 | 擋住幾支 | ability id |
|---|---:|---:|---:|---|
| `xhunterstone` | 1+ | 2.0 | **2** | `godie-u034.passive` · `godie-ucrl.passive` |
| `plant` | 2 | 2.0 | **2** | `godie-n00p.w` · `godie-nsjs.w` |
| `romove` | 6 | 0.5 | **2** | `godie-u01u.e` · `godie-udre.e` |
| `linas` | 1+ | 0.5 | **2** | `godie-h020.r` · `godie-hjai.r` |
| `excaliburmax` | 7 | 4.0 | **2** | `godie-e002.r` · `godie-e00l.r` |
| `bleach-rush` | 2 | 0.3 | **2** | `godie-h01n.q` · `godie-h01o.q` |
| `youdie` | 2 | 1.0 | **2** | `godie-u00l.q` · `godie-umal.q` |
| `superff7` | 6 | 0.1 | **1** | `godie-hart.r` ⭐ 標本 |
| `flyswallow` | 1 | 0.1 | **1** | `godie-naka.r` |
| `lightcutrun` | 2 | 2.0 | **1** | `godie-edem.e` |
| `nine-lives-hits` | 10 | 0.6 | **1** | `godie-hapm.ex` |
| `dragontigerready` | 5 | 0.5 | **0** | ⛔ 地圖終局演出技（見上） |
| `near-to-death` | 16 | 0.25 | **0** | ⛔ 原作孤兒技能（沒有任何單位擁有 `A0AC`） |

其餘 16 個是「延遲一發」（`tail` / 單次傷害），⛔ 不屬於這一族。

⚠️ **今天真的用得上這 13 個家族的內容只有 1 支**（`godie-hart.r` 的 `family:"superff7"`）——
其餘 17 個 id 的技能還沒被改寫成 `comboStrikes`。⭐ 那是內容工作，⛔ 不是引擎缺口。

---

## ② 模板長什麼樣 · 住哪

**`content/ability-templates/tpl-combo-finisher.json`**（`family: "combo-finisher"`, `status: "draft"`）

兩層，逐字照第〇·五守則：

| 層 | 誰負責 | 住哪 |
|---|---|---|
| **機制** | 引擎 | `comboStrikes`（已出貨）＋ 節奏表 `config.combo-strikes@1`（已出貨） |
| **演出** | ⭐ **這張卡** | `hitVfx` · `hitText` · `hitTextSizeScale/RiseSpeed/DurationSec` · `finisherVfx` · `finisherFlash*` · `finisherShake*` |

⭐ **`hitTextSizeGrowth` 帶著 `inert` 理由**：原作字級是 `udg_SupI * 4 + 6`（每一刀變大），
而 `floatingText.sizeScale` 是**一個**數字 —— 段號只解析得進 `text` 的 `{{i}}`，⛔ 解析不進字級。
⇒ 要它就得讓 `sizeScale` 也吃佔位符（一次 schema 改動），⛔ 不是在這裡填一個沒有人讀的數字。

### ⛔ 為什麼是 `draft` 而不是 `enabled`（可以被反駁的理由）

`paramsSchema.test.ts` 的規矩是：**enabled ⇒ 一定要有 expand 路徑；draft ⇒ 一定沒有**。
`combo-finisher` 在 `templates/expand.ts` 的 `FAMILIES` 裡沒有展開路徑，而
**`expand.ts` 不在 lane P2 的檔案柵欄裡**（它是 lane P4 在飛的檔，`git status` 顯示它正在被改）。
⇒ 加 expand 路徑是**下一張票**：`FAMILIES["combo-finisher"]` 回傳
`applyStatus(lock) + invulnerable(self) + comboStrikes{family, perStrike:[damage,spawnVfx,floatingText], finisher:[damage,spawnVfx,screenFlash,screenShake]}`，
所有零件都已出貨，⛔ 沒有任何新機制要做。

⚠️ 連帶的第二張票：`SIM_CAPABILITIES` 今天**沒有** `floatingText` / `screenFlash` / `screenShake` 的列
（16 列裡一列都沒有），所以這張卡的 `requires` 只寫得出 `combo` / `invulnerable` / `applyStatus` ——
演出那三個 kind 在能力契約上是**隱形的**。加列也要動 `expand.ts` ⇒ 同一張票一起做。

---

## ③ 特效文字接上幾支 —— 3 支，而且段號是**算出來的**

| 技能 | 作者介面 | 每一刀 | 收尾 |
|---|---|---|---|
| `godie-hart.r`（01-04 超究武神霸斬）＋ champion 鏡射 | `comboStrikes family:"superff7"` | `spawnVfx` thunderclapcaster ＋ `floatingText "{{i}}Hit"` | `spawnVfx` warstompcaster ＋ `floatingText` ＋ `screenFlash` ＋ `screenShake` |
| `godie-e002.ex` / `godie-e00l.ex`（20-002 解放·約束勝利劍MAX） | `delayed count:7` ＋ `finalEffects` | `spawnVfx` reflect-spark ＋ `floatingText "{{i}}Hit"` | `spawnVfx` reflect-burst ＋ `screenFlash` ＋ `screenShake` |

⭐ **「1Hit…7Hit」是一個節點，⛔ 不是七個**。`comboStrikes` 的收尾班次是班表的**最後一格**
（`finisherOnly`），所以「6 段本體 ＋ 收尾」自然得到 `1Hit`…`7Hit` —— 逐字對上卡面「連斬七次」，
而且段數改了它自己會跟著改（第〇·四守則）。行為守衛實際量到的就是這 7 個字串。

### ⚠️ 一個柵欄外的邊界情況：`applyTo` 從 `self` 改成 `victim`

原作 `CreateTextTagUnitBJ( I2S(udg_SupI)+"Hit", **udg_FF7_CastedUnit**, … )` —— 錨在**被打的人**身上。
出貨內容原本 5 支全部掛 `self`，而 `fieldAdoption.test.ts` 為 `victim` 留了一列**零採用豁免**，
理由寫著「GGD 這一側 `self` 已經對得上畫面」。
⇒ 那句話在克勞德真的長出特效文字之後就不成立了：施法者站在原地、目標最遠 **8 格**，
`self` 會把「1Hit…7Hit」冒在**離戰鬥現場八格外的施法者頭上**。
⇒ 三支連段技改掛 `victim`，那一列於是 **stale**，照那份檔案自己的規矩被刪掉
（⛔ 不是放寬，是它不再需要）。

⚠️ **這是唯一一處動到柵欄外的檔案**（`packages/shared/src/content/fieldAdoption.test.ts`，
刪掉 10 行豁免、補 7 行理由）。理由：不刪它，整條 `fieldAdoption` 閘會紅在「STALE EXEMPTION」上，
而那是**這次採用造成的**，⛔ 不是別人的債。已複驗過該檔的 diff 只有這一處（⛔ 沒有別的 lane 的改動）。

---

## ④ `axes.py` 現在量得到嗎 —— 量得到（前 2 → 後 7）

| | 前 | 後 | 卡面承諾 |
|---|---:|---:|---:|
| `godie-hart.r` `damageLeaves` | **2** | **7** | 7 |
| `godie-hart.r` `beats` | **0** | **7** | — |

⇒ 傷害軸的假缺口 **5 → 0**。

做法：新增 `_combo_table()` / `combo_strike_count()` / `combo_beats()`，從
`content/config/combo-strikes.json` **本人**解析，`ggd_counts` 的走訪把 `perStrike`
的每一片葉子**乘上段數**。解析順序逐字比照
`comboFamilies.ts::resolveComboFamilies`（表贏過手寫值）＋
`comboStrikes.ts::comboStrikeOffsets`（`steps` 贏過 `strikes`）。
排不出班表時回 **0**（⛔ 不是 1）—— 出貨 handler 在那種情況會擲錯，
回 1 會讓一支場上一刀都不會劈的技能在表上看起來只少一刀。

驗過的三種路：未知 family → 0 · 手寫 `steps` → `len(steps)` · `family` ⊕ 手寫 `strikes:99` → **表贏（6）**。

### ⛔ 兩個**還沒**修的量法缺口（都在柵欄外，開票）

1. **`audit.py` 只餵 `doc["effects"]`，⛔ 不走 `doc["passive"]`。**
   ⇒ `godie-e002.ex` / `godie-e00l.ex` 的整段連段住在 `passive.ranks[0].hooks[0]`，
   這把尺量到的是 **`damageLeaves: 0`**，而卡面承諾 7。單獨把 `passive` 餵進
   `ggd_counts` 就量得到（實測 2）。⛔ `audit.py` 是 lane P1 的檔。
2. **`delayed` 沒有按 `count` 展開**（`beats += 1`、傷害葉只數一次）。
   ⇒ 同一族用 `delayed` 介面寫的技能（Saber EX 的 7 段、`godie-hapm.ex` 的 10 段）
   仍然被數成 1。修法與 `comboStrikes` 那一段同型，但它會改動**整張** audit 表的數字，
   ⇒ 刻意留給一次獨立的改動，⛔ 不混進這一條 lane。

---

## ⑤ 第 3 項 —— 理想鄉反彈**現在真的會發生**（跑真的 sim、真的事件）

既有守衛 `packages/shared/src/sim/effects/avalonReflectFeedback.test.ts` 直接讀**出貨的**
`godie-e002.ex.json` 的 `onReflectSuccess` effects、丟進真的 `SimWorld` 跑 `runEffects`，
再讀 `world.events`。**複驗 EXIT=0**（1 test passed）：

- 七彩爆炸 `fx.avalon.reflect-burst` 落在**被反彈者**的座標上（⛔ 不是施法者的）
- `screenFlash` 的 `subjects` **同時包含施法者與被反彈者**（兩邊都知道發生了什麼）
- `screenShake` 真的過線，且 `broadcast === true`

⇒ ⭐ 三個事件在 `c49b04a1`（今天）之前是死的（`screenFlash`/`screenShake` 擲 TypeError），
**現在確認活著**。

### 七彩：`screenFlash.colorRgb` 表達不了，⭐ 但它不需要表達

`screenFlash` 一則 = **一個顏色**（`zRgb` 三格），所以「七彩」不住在它身上。
七彩住在 **vfx 文件的 `colorStops`**：`fx.avalon.reflect-burst` 有 4 個色停
（白 → 紅 → 綠 → 紫，`stretched` 拖尾 4）、`fx.avalon.reflect-spark` 有 4 個
（白 → 橙 → 青 → 藍）。⇒ **機制夠用**，⛔ 不需要新的 kind。

### 補強（owner：「原版 JASS 有，可補強增加更多視覺效果」）

- 每一刀補 `fx.avalon.reflect-spark`（⭐ 這份 vfx 早就在 `content/vfx/` 裡，但**零引用**）
- 每一刀補 `{{i}}Hit` 特效文字 —— 反擊之後「打了幾下」變成看得見的
- **收尾**（第 7 刀＝約束與勝利之劍落地）補 `spawnVfx` ＋ `screenFlash(all)` ＋ `screenShake(all)`
  ⇒ 反彈**成功那一刻**與**大招收尾**現在是**兩次**分得開的畫面事件

---

## ⑥ 守衛（新檔）

`packages/shared/src/sim/effects/comboFinisherShowcase.test.ts` —— 兩條：

1. **行為（承重）**：真的建世界、真的 `castAbility(R)`、真的 step 200 tick，
   斷言特效文字是 `["1Hit"…"7Hit"]`，而 `screenFlash`/`screenShake`
   **只發生在最後一個文字的那一 tick**（⭐「重招」與「第 N 刀」在畫面上唯一分得開的地方）。
   ⛔ 沒有任何數字進斷言（傷害／閃多亮／震多久全部不驗）。
2. **契約**：掃 `content/abilities/*.json`，用**結構**（`comboStrikes` 有 `finisher`，
   或 `delayed` 有 `finalEffects`）認出這一族，逐支要求三件套。⛔ 檔案裡沒有任何技能 id
   寫在判準上；唯一的 id 是 `FENCED_OUT` 的**豁免**（見下）。

### 突變紀錄（一批一條，挑最承重的那一行）

`sim/effects/clientCues.ts::resolveCueText` 的 `String(ctx.sequenceIndex ?? 1)`
改成 `String(1)`（＝段號不再前進；字仍然冒、數量仍然是七個、畫面上「有字在跳」看起來完全正常）
→ **紅**：`expected [ '1Hit','1Hit',… ] to deeply equal [ '1Hit','2Hit',… ]`（EXIT=1）。已改回。

### ⛔ 一列豁免，帶著能被反駁的理由

`godie-hapm.ex`（52-002 射殺百頭，家族 `nine-lives-hits` = 10 段＋收尾）**不在這條 lane 的柵欄裡**。
守衛把它列進 `FENCED_OUT`，⭐ **並且反向檢查**：它補齊三件套的那一天，
第二條斷言會紅並要求把那一列刪掉 ——⛔ 一個沒有到期日的豁免就是一張永久許可證。

---

## ⑦ 指令與離開碼

| 指令 | EXIT | 說明 |
|---|---:|---|
| `npx vitest run` ×5 檔（新守衛 · avalonReflectFeedback · hartJassFidelity · paramsSchema · abilityMirror） | **0** | 37 tests passed |
| `npx vitest run` ×8 檔（fieldAdoption · noOpModifierClaims · editorCapabilities · simCapabilityDrift · expand · abilityScaling · comboAndPull · modelFxAndCues） | **0** | 56 tests passed |
| `npx vitest run` 突變 | **1** | ⭐ 預期的紅（見上） |
| `pnpm typecheck` | **0** | 全部子專案 Done |
| `npx tsx` Zod 驗證（5 份改到的文件） | **0** | 5/5 OK |
| `python3 tools/skill-audit/audit.py --check` | **1** | ⚠️ **預期的紅**，見下 |

### ⚠️ 兩個「等主 session 跑一次就好」的紅

1. **`audit:check`** —— `axes.py` 的數字動了 ⇒ `docs/技能模板驗收標準.md` 過期。
   修法是 `pnpm audit:build`，⭐ 而它**已經在 `pnpm skills:sync` 裡**。
   ⛔ **這條 lane 刻意不跑它**：那份文件會把**其他 lane 尚未 commit 的內容**一起烘進去
   （＝ 2026-08-02 事故的形狀）。
2. **`content:build` 產物**（`bundle.json` / `_index.json`）—— 新增了
   `content/ability-templates/tpl-combo-finisher.json` 且改了 4 份內容文件。
   ⛔ 全域鎖，由主 session 統一跑。

---

## ⑧ ⛔ 沒做到的與原因

| 沒做 | 原因 |
|---|---|
| `tpl-combo-finisher` 的 **expand 路徑**（＝讓它 `enabled`） | `templates/expand.ts` 不在柵欄裡（lane P4 正在改它）。⭐ 零件全部出貨，只差接線 |
| `SIM_CAPABILITIES` 補 `floatingText`/`screenFlash`/`screenShake` 三列 | 同上，同一個檔 |
| 其餘 **17 個** 連段 ability id 改寫成 `comboStrikes` | 不在柵欄裡（`godie-u01u.e` / `godie-h020.r` / `godie-naka.r` …）。⭐ 純內容工作 |
| `godie-hapm.ex`（10 段＋收尾）補演出 | 不在柵欄裡 ⇒ 進守衛的 `FENCED_OUT`（帶反向檢查） |
| `godie-e002.ex` 從 `delayed` 改成 `comboStrikes family:"excaliburmax"` | ⛔ **刻意不做**：`excaliburmax` 的 `rhythm` 是 `loop-count-only`（迴圈內的等待解不成字面值），表裡**沒有 `intervalSec`** ⇒ 換過去會得到「7 刀擠在 7 個 tick（0.23 秒）」，比現有手寫的 0.12 秒節奏**更不誠實**。⭐ 要改，先讓 `tools/jass-combo/scan.py::loop_gap_series` 解得開那個運算式 |
| `audit.py` 走 `passive` · `delayed` 按 `count` 展開 | 見 ④ 的兩點 —— `audit.py` 是 lane P1 的檔，且第二點會改動整張表 |
| 原作「字級隨段號變大」（`udg_SupI*4+6`） | `floatingText.sizeScale` 不吃佔位符 ⇒ 在模板裡宣告成 `inert`（⛔ 不是偷偷填一個沒人讀的數字） |
