# GH#648 內容批 —— 週期宣稱 ↔ 機制（2026-08-31）

> ⭐ 結論先講：**23 → 5**。18 支補上了機制，⛔ 而它們**不是同一種修法** ——
> 逐支讀完卡面之後是**四個形狀**，每一個都有出貨前例，⛔ 零個新機制。
> ⚠️ 而「43 支等 `tpl-periodic-field`」從頭到尾是**假前提**：真正套得上那份模板的只有 **5 支**。

---

## 〇 先重掃（⛔ 沒有相信交接給我的 37 或 43）

| 母體 | 數 |
|---|---:|
| `content/abilities/*.json` | 421 |
| 卡面同時命中「迴圈」與「持續」兩軸、而 JSON 一格節奏都沒有 | **23** |
| ⇒ 本批補上機制 | **18** |
| ⇒ 留在說謊名單（各自帶一個能被反駁的理由） | **5** |

判準與兩張詞彙表都不是我寫的，直接沿用出貨的那一份：
宣稱側 `tools/skill-templates/prose_markers.json`、機制側 `tools/skill-templates/shape_axes.json`、
剝角色對白 `descriptionClaims.mechanicsText`（第〇·六守則②）。

---

## 一 逐支表

| 技能 | 宣稱什麼 | JSON 有機制嗎 | 套了模板嗎 | 沒套的理由 |
|---|---|---|---|---|
| `godie-hjai.w` 04-02 炸彈陣（本體） | 每秒燒傷、持續5秒 | ⛔ 只有一發 `damage` | ⭐ `tpl-periodic-field`（point/1s/5s/中） | — |
| `godie-h020.w` 04-02（變身態） | 同上 | ⛔ | ⭐ 同上 | — |
| `godie-hgam.q` 90-01 飛葉快刀（本體） | 每秒對**附近**敵人、持續2秒 | ⛔ `tpl-ground-nova`（一發） | ⭐ `tpl-periodic-field`（caster/1s/2s/小） | — |
| `godie-h02r.q` 90-01（變身態） | 同上 | ⛔ | ⭐ 同上 | — |
| `godie-ubal.w` 37-03 災難之牆 | 每秒傷害、火牆持續3秒 | ⛔ `tpl-single-strike` | ⭐ `tpl-periodic-field`（point/1s/3s/中） | — |
| `godie-h02r.passive` 90-00 寄生種子 | 每秒傷害＋吸生命、持續5秒 | ⛔ | ⛔ | **單體**掛在目標身上 ⇒ `dot`（前例 `godie-huth.r`），⛔ 不是領域 |
| `godie-hgam.passive` 90-00（本體） | 同上 | ⛔ | ⛔ | 同上；⚠️ 順帶補回鏡射邊早就有、這一半漏掉的 `heal`（卡面同一句） |
| `godie-nsjs.w` 18-02 寄生種子 | 侵蝕後每秒60、持續2秒 | ⛔ | ⛔ | 傷害發生在**命中之後** ⇒ `dot` 掛進 `spawnProjectile.onHit` |
| `godie-n00p.w` 18-02（變身態） | 同上 | ⛔ | ⛔ | 同上 |
| `godie-orkn.e` 30-03 痴漢火焰 | 每秒持續傷害、持續7秒 | ⛔ `tpl-single-strike` | ⛔ | 單體 ⇒ 攤平模板＋`dot`（⚠️ 展開器擁有整格 `effects`，「模板＋多一個 dot」表達不了） |
| `godie-o030.e` 30-03（變身態） | 同上 | ⛔ | ⛔ | 同上 |
| `godie-ogld.w` 72-02 黑人牙菌斑 | 每秒傷害、持續10秒 | ⛔ `tpl-single-strike` | ⛔ | 單體 ⇒ `dot` |
| `godie-h01o.ex` 79-002 虛化 | 每秒回復60、持續15秒 | ⛔ | ⛔ | **自身**回復 ⇒ `healthRegen` 修正值（前例 `godie-huth.passive`） |
| `godie-h02u.q` 92-01 臥草泥馬 | 每秒回3%體力、持續10秒 | ⛔ | ⛔ | 自身**百分比**回復 ⇒ `delayed`+`restore`（前例 `godie-h02v.q` 逐位元同形） |
| `godie-ogrh.q` 09-01 界王拳 | 每秒**消耗**生命10、持續10秒 | ⛔ | ⛔ | 自傷 ⇒ `dot{applyTo:"self", damageType:"true"}`（`sim/effects/dot.ts:213` 早就在等） |
| `godie-o00x.q` 09-01（變身態） | 同上 | ⛔ | ⛔ | 同上 |
| `godie-nsjs.r` 18-04 億年樹 | 每秒回**友軍**4%、持續8秒 | ⛔ | ⛔ | **治療**場 —— 模板說明逐字寫「治療場還沒有參數，⛔ 不是拿 damageTier 去治療」⇒ `delayed{reresolve, side:"allies"}`+`restore` |
| `godie-n00p.r` 18-04（變身態） | 同上 | ⛔ | ⛔ | 同上 |
| `godie-h02u.r` 92-04 馬勒戈壁 | 每秒奪金＋傷害、持續6秒 | ⛔ | ⛔ **做過又收回** | ⭐ 階梯衝突：同編號本體 `godie-h02v.r` 帶 owner 新版說明且**一句每秒都沒有**（1 > 4）；`abilityCodeParity` 當場紅並逐字說「拿去給 owner 裁決」。⚠️ 草泥馬那一對 CLAUDE.md 明文禁止自動鏡射 |
| `godie-o030.w` 30-02 酒精灌腸 | 受火焰攻擊後「不斷灼傷」、持續8秒 | ⛔ | ⛔ | **條件閘**不是節奏 —— 需要「承受某傷害類型時」的條件葉（`condition.*` 沒有 `damageType`）⇒ 第〇·五守則：先做機制 |
| `godie-orkn.w` 30-02（本體） | 同上 | ⛔ | ⛔ | 同上 |
| `godie-u034.ex` 06-002 殺意 | 剪刀分支每秒60、持續8秒 | ⛔ | ⛔ | 掛在**另一支技能的一個分支**上（猜猜拳三選一）⇒ 要 `ability-augment@1` 的逐分支追加 |
| `godie-ucrl.ex` 06-002（本體） | 同上 | ⛔ | ⛔ | 同上 |

---

## 二 ⭐ 交接前提裡有一條是錯的：那 6 支**不是**「宣稱被刪掉」

交給我的前提逐字寫著：6 支掉出清單的技能「**不是被修好**，是**宣稱那一側的文案變了**才不再算差集」，
並點名 `godie-e00r.q`（59-01 吞噬）是「**先導樣本在沒被實作的情況下靜默離開了分母**」。

⛔ **逐支查證之後，那句話對其中 5 支是錯的，對第 6 支也不是「卡面變窄」。**

| 技能 | 今天為什麼不在清單裡 | 誰改的 | 是修好了嗎 |
|---|---|---|---|
| `godie-e00r.q` 59-01 吞噬 | ⭐ **真的被實作了** —— `passive.ranks[].hooks[].on = "onInterval"` ＋ `internalCooldown 0.9`、`devour` 效果、`condition` 兩條 | `cd921c0eb feat(skill)(#644)`「初號機四裁決落地 —— 格擋/免疫/**6秒吞噬**/暴走門檻2x，⛔ 零新機制」 | ✅ **是**（owner 裁決落地） |
| `godie-e00r.e` 59-03 AT力場 | ⭐ 有 `onInterval` hook（`internalCooldown 8.0` ＋ `shield`）—— 卡面「每8秒生成一個護盾」是真的 | `cd921c0eb` 同上 | ✅ 是 |
| `godie-emfr.passive` 15-00 真·不死不滅 | ⭐ 有 `onInterval`（`restore healthPct 0.02` ＋ `spendMana pctMaxMana 0.01`，`internalCooldown 1.0`） | `3a7fd4867 feat(#360-#372)` | ✅ 是 |
| `godie-huth.r` 65-04 天譴 | ⭐ 加了 `dot`（1s/5s/`stacking:"refresh"`） | `d4f631012 fix(#648)`「迴圈差集 39 → 38（1 支真的修好了）」 | ✅ 是 |
| `godie-o02p.r` 99-04 公主殿下 | ⭐ 有 `delayed`（含 `heal`），並補過 `shape:"circle"` 缺字面 `radius` | `f63cf3263 fix(#648)` | ✅ 是 |
| `godie-e007.r` 12-04 龍氣爆發 | ⚠️ 它的卡面**從來沒有**週期宣稱（「凝聚體內的龍氣造成大範圍傷害，附帶淨化」）⇒ ⛔ 它不該在清單裡 | `b3dc69067 fix(#854)` 對齊詠唱 | ⛔ 不適用（**誤報退場**，⛔ 不是「宣稱被刪」） |

### ⭐ 那個假前提是怎麼長出來的（值得記下來）

`effects: []` 被讀成「這支技能是空的」。⛔ **對被動技來說那是正常的** ——
`e00r.q` / `e00r.e` / `emfr.passive` 的機制全部住在 **`passive.ranks[].hooks[]`**，
`effects` 本來就該是空陣列。⇒ 只看 `effects` 會把**三支已實作的被動**判成空殼。
⚠️ 這與 CLAUDE.md 記過的「一個看起來已經量過的東西，量的不是你以為的那個」同族：
**問「這一欄的分母是什麼」，⛔ 不是「這一格是不是空的」。**

---

## 三 ⛔ 這一批撞到的四個**沒有任何守衛在守**的東西

⭐ 四個全部是「內容側第一次真的採用某條路」才暴露的，⛔ 在此之前每一天都是綠的。

### ① ⛔⛔ 五支大絕變成**免費**的 —— 而 1,239 條測試全綠

`tools/skill-remake/tierize.py` 落地 owner 2026-08-21 ⑦「若不是主動傷害技能 就免魔力吧」：
非傷害技 ⇒ `manaCost` 抹 0、`manaCostTier` 拔掉。而「算不算傷害技」靠一張
**手寫的 `DAMAGE_TEMPLATES`（7 個名字）**，出貨模板裡符合條件的其實有 **15 個**。

⇒ 5 支接上 `tpl-periodic-field` 的那一刻，`manaCost` 從 288/72 → **0**。
⚠️ 逐條查過**沒有任何既有守衛問得出這一題**：`abilityAffordableAtUnlock` 問「付不付得起」（0 一定付得起）、
`tierRawParity` 問「級別與原始值一不一致」（級別被**一起拔掉**了）。

**修法**：`_derive_damage_templates()` —— 從出貨模板自己宣告的傷害參數推導。
⭐ 換上去之前逐名比對過：**15 ⊃ 原本 7，一個都沒少**；多出來的 8 個今天採用者是 0
⇒ 這次替換**改不了任何一支既有技能的耗魔**。
**新守衛** `packages/shared/src/content/damageTemplatesAreDerived.test.ts`（見第四節）。

### ② 第六個「不讀 `Scaling.mult`」的消費端

`descriptionClaims.ts` 的 `numbersUnder` 不乘 `mult` ⇒ 卡面印 250（**對的**）而對帳表量到 `{0.5, 500}`
⇒ 一支**正確**的技能被判成「說了但不會發生」。
⛔ 那是**誤報**，比漏報更貴：它會逼下一個人把正確的技能塞進 baseline ＝ 把守衛關掉。
修法 `damageNumbersUnder()`，與 `abilityProse.ts::damageRanks`（第五個）是同一個決策的兩半。
⭐ 判準留給下一輪：**`mult` 是整份酬載的倍率 ⇒ 每一個讀傷害量的消費端都要乘它。**

### ③ ⛔ 三格**假 FAIL** —— 觀察窗看不到「作者填的延後」

`castabilitySweep` 判 `godie-hgam.q` / `godie-hjai.w` / `godie-ubal.w` 為
`cast accepted but produced no measurable effect (no-op)` ⇒ 99.12% < 100% 地板。
⭐ 根因：【週期領域】展開結果**只有一個 `delayed` 節點**，第一發刻意等一個間隔
（＝「每秒」的第一秒），而觀察窗是 `WINDOW(26) + leapWindow + castWindow` ——
⛔ **沒有一項涵蓋 `delayed.delaySec`** ⇒ 窗口在第一發之前就關了。
⚠️ 那正是該檔自己記過的「2026-08-13 的 120 格假 ❌」，只是換了一個延後來源。
**修法** `delayedWindow()`，⭐ 只加**第一發**（⛔ 不是整段 `count × intervalSec`）——
⛔ 這不是把地板調低：一格仍然要在窗口內產生可量測的效果才算 PASS。

### ④ 一張豁免表上的**數字**也會過期

`templateFamiliesAreAdopted` 的豁免列逐字寫著「**38 支**的內容批還沒套用」，
`periodicFieldAdoptionBlocker` 的檔頭寫著「**11 支**真週期領域」。
⛔ 兩個都是假的：真正套得上的只有 **5 支**。兩處都當場更正並寫下**為什麼會多算**。

---

## 四 守衛與突變（⭐ 一條承重，⛔ 不是每支各一條）

**新檔** `packages/shared/src/content/damageTemplatesAreDerived.test.ts`，兩條斷言都驗**關係**：

1. **承重** —— ⭐ 真的把 python 跑起來問 `DAMAGE_TEMPLATES`，與 TS 側**各自推導**的集合比對
   （⛔ 不是 grep 原始碼字串 ＝ 失敗形態⑥）。
2. **症狀** —— 引用傷害模板的出貨技能，⛔ 不可以全階耗魔都是 0。

**突變紀錄**：把 `DAMAGE_TEMPLATES = _derive_damage_templates()` 改回原本手寫的 7 個名字
⇒ 🔴 斷言① 紅，訊息逐字列出少掉的 8 個（含 `tpl-periodic-field`）。改回 ⇒ 綠。
⭐ 承重的是①：②要等正規化器真的跑過才會髒，而①在**編輯發生的當下**就叫。

---

## 五 棘輪 / 基準線的動向（全部**只往下走**）

| 閘 | 動向 |
|---|---|
| `periodicClaimHasMechanism` KNOWN_LYING | **23 → 5** |
| `periodicFieldAdoptionBlocker` referencedBy | **0 → 5** |
| `templateFamiliesAreAdopted` | 刪 `tpl-periodic-field`；⚠️ **新增** `tpl-ground-nova`（唯一採用者 90-01 搬走了 —— ⛔ 不是退步，它本來就選錯家族） |
| `fieldAdoption` | 刪 `dot.applyTo` 的 landing 豁免（**落地了**，09-01 界王拳）；新增 `delayed.anchor=point` 的 `default-live`（展開器對 point 刻意**整格省略**，省略與 `"point"` 逐位元同義） |
| `descriptionClaims.baseline` | 刪 **9** 列 `duration-absent`；`godie-orkn.json` **整份刪檔**（那一位全部修好） |
| `abilityCodeParity.baseline` | 刪 **11** 列（同編號技能現在一致了） |
| `abilityCodeParityForms.baseline` | 重生成（7 組兩邊一起動 ＋ 2 組單邊）；⭐ 兩組單邊都在 `form_counterparts.py` 明文宣告為刻意分歧，且**每一側都實作了自己那張卡** |
| `w3a` gap ledger | ⭐ `duration:ggd-absent` **198 → 188**，其中 **5 支逐字命中 w3a 的原值**（`duration:same` 4 → 9） |

---

## 六 ⚠️ 留給下一輪的三件事（⛔ 我沒有動）

1. **`godie-h02u.r` 92-04 是 owner 的一次裁決**：兩張卡（w3x 文案 vs owner 新版）說的是兩支不同的技能。
   ⛔ 照低層級的文案補機制會製造一次同編號分歧，而 `abilityCodeParity` 明文拒絕。
2. **兩個新機制各擋著 2 支**：`condition.damageType`（30-02 ×2）、
   `ability-augment@1` 逐分支追加（06-002 ×2）。⭐ 第〇·五守則：按**擋住幾支**排序，⛔ 不是逐支做。
3. ⭐ **閘的盲區**：另有 **6 支**只命中「迴圈」而沒命中「持續」、也沒有機制
   （`godie-e007.w` `godie-ewar.w` `godie-h02u.ex` `godie-o00l.q` `godie-u034.e` `godie-ucrl.e`）——
   兩軸取交集是為了擋掉修辭句（「小周天**循環**」），⛔ 而代價是這 6 支沒有人在看。
   ⚠️ 逐支讀過它們**是不是真的在說謊**再決定要不要放寬，⛔ 不要直接改判準。

## 七 ⛔ 兩個紅燈**不是我造成的**（第三守則：先確認再說）

| 閘 | 為什麼與這一批無關 |
|---|---|
| `skillsSyncCoversGenerators` | `tools/jass-template-map/` 沒有 `*:check` 進聚合指令 —— 純結構問題（讀 package.json ＋ tools/），⛔ 與內容無關。那支產生器由 `8d9e2cdea fix(#244)` 加入 |
| `legacyIndexFresh` | `docs/legacy-index.md` 因**今天 35 個 hook 備份夾**過期，而那裡面有**主 session 正在動的檔**（`apps/admin/src/ui/App.tsx`、`tools/review/middleware.mjs`、`tools/jass-template-map/gen.mjs`）⇒ ⭐ 我重生成過、**又還原了**：那是一份高頻共用檔，收尾統一重建（repo 本來就有 `chore: legacy 索引重建` 這種 commit） |
