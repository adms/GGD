# lane CLAIM —— 卡面空宣稱與變身退場（#648 · #623 · #425）

> 2026-08-27。HEAD = `fc710f1d`。⛔ 這一份是**暫存報告**（`_temp_`），過期就進 legacy。
> 路徑柵欄：`content/{abilities,champions,ability-templates,vfx}` · `content/config/vfx-families.json`
> · `tools/skill-remake/**` · `packages/shared/src/content/laneCLAIM*.test.ts` · `docs/legacy/**`。

---

## 0. 三張票的結論（先讀這個）

| 票 | HEAD 上的實況 | 我做了什麼 |
|---|---|---|
| **#425** wave 拖尾 | ⭐ **已經做完了**（commit `b4d2f65a`，含守衛與突變紀錄） | **0 改動** ⇒ 建議關票 |
| **#648** 43 支迴圈內容批 | ⭐ **票文的三個前提全部不成立**（下面逐條） | 修正盤點 ＋ 一條承重守衛；**內容批被三個柵欄外的一行擋住** |
| **#623** 變身逐對退場 | 進行中（見 §3） | —— |

---

## 1. #425 —— 已完成，建議零改動關票

票文說「9 份 `imported.wave.*` 裡 5 份與別的彈道共用 `vfxKey`」。**HEAD 上量到的是 0 份。**

| 驗收條目 | 實況 |
|---|---|
| 9 份 wave 有自己的 vfx | ✅ 8 份 `content/vfx/fx.wave.{arcane,earth,fire,ice,ki,lightning,physical,void}.json`，全在 `content/vfx/_index.json` |
| 「一個 primitive ＋元素填色」⛔ 不複製 9 份 | ✅ commit 訊息逐字記著 `WAVE_SHAPE` 一份 ＋ ramp 公式沿用 bolt |
| wave ≠ bolt（寬/慢/長 vs 細/快/短） | ✅ `fx.wave.ki` = radius 0.55 / 34° / burst 42 / size 0.75 / `tailLength 5.5`；`fx.prim.ki.bolt` = 0.14 / 6° / 18 / 0.26 |
| grail 兩顆彈脫離 arcane | ✅ 兩份都改指 `fx.grail.bolt`（紫 arcane → 金 holy，保真理由寫在 commit） |
| 出生可見性掃描涵蓋新 primitive | ✅ `vfxDocsBirthVisibility.test.ts` 5 tests 綠（我跑過） |
| 守衛 | ✅ `packages/shared/src/content/laneKWaveTrailFamily.test.ts`，三條 + 突變紀錄 |

⚠️ 唯一剩下的「共用」是 `imported.wave` (base) 與 `imported.wave.physical` 共用 `fx.wave.physical`
—— 那兩份**是同一個東西的別名**，⛔ 不是缺陷。

---

## 2. #648 —— 票文的三個前提，逐條複驗

### 2.1 「43 支」→ HEAD 上是 **40 支**

`godie-e00r.q`（59-01 吞噬）· `godie-e00r.e`（59-03 AT力場）· `godie-emfr.passive`（15-00 真·不死不滅）
已經被別的 lane 修好了。⭐ **而它們正好是最好的範本** —— 三支都用同一個形狀：

```jsonc
"passive": { "ranks": [{ "hooks": [{
  "on": "onInterval", "internalCooldown": 1.0, "target": "self",
  "effects": [ /* restore / spendMana / devour … */ ]
}] }] }
```

### 2.2 ⭐⭐ 「JSON 一格迴圈機制都沒有」→ **40 支裡 12 支（30%）是量測假象，⛔ 不是內容缺口**

這是本 lane 最重要的發現，而且它正是 CLAUDE.md 的
「⭐ 讀一張表之前，先問**這一欄的分母是什麼**」。

#### ① 7 支**已經做好了**，只是 `shape_axes.json` 看不見它

| 技能 | 卡面 | 引擎側 |
|---|---|---|
| `godie-huth.passive` 28-00 無限再生 | 每秒回覆12點生命 | `healthRegen flat +12` |
| `godie-osam.passive` 34-00 靈魂吞噬 | 每秒吸取200點生命 | `healthRegen flat +200` |
| `godie-u00n.passive` / `godie-u00o.passive` 76-00 二檔 | 每秒減少生命10點 | `healthRegen flat −10` |
| `godie-u01u.passive` / `godie-udre.passive` 11-00 三刀流 | 每秒損失12點生命值 | `healthRegen flat −12` |
| `godie-etyr.ex` 14-002 魔力激發 | 每秒獲得7%的瑪那回復 | `manaRegen flat 0.07` ⚠️ 見 §2.5 |

⭐ **根因**：`tools/skill-templates/shape_axes.json` 把 `modifiers` 逐字列進 `ignored`
（「屬性加成清單（**它的期間住在 duration**）」）。那個判斷對**期間**是對的，
⛔ 對**節奏**是錯的 —— 一格 `healthRegen: -10` 就是「每秒扣 10 點」，
它的節奏由引擎的 regen tick 提供，與 `onInterval` 是同一件事。

#### ② 5 支的「迴圈」宣稱是**文案，⛔ 不是機制**

`prose_markers.json` 的 `迴圈` 收了 `循環|輪流|依照順序` 與 `反覆|不斷|持續地`：

| 技能 | 命中的那句 | 它其實是 |
|---|---|---|
| `godie-e007.w` · `godie-ewar.w` 12-02 仙氣．採藥 | 利用身體小周天**循環**恢復生命 | 修真術語，一次性治療 |
| `godie-u034.e` · `godie-ucrl.e` 06-03 山形修煉-強 | **不斷**地修煉強化系能力 | 背景敘述，效果是永久 +7 力量 |
| `godie-u00k.passive` 71-00 暗夜契約 | GGD 沒有日夜**循環** | ⭐ **這句話說的正是「沒有循環」** |

⭐ 最後那一列值得單獨記一筆：**標記命中了一句宣告該機制不存在的句子。**
它與 CLAUDE.md 記過的「44-04 心臟麻痺的台詞被讀成 35 秒時序」是同一族，
⛔ 但剝 `「」` 治不了它 —— 它不在對白裡。

⇒ **真正缺機制的是 28 支，⛔ 不是 43 支。**

### 2.3 ⛔ 「✅ 機制已落地（D10，commit `76b4ef22`）」→ **模板那條路今天走不通**

`content/ability-templates/tpl-periodic-field.json` 的 `status` 是 **`draft`**，
而它自己的 `description` 逐字寫著「**expand.ts 的家族接線仍缺**…引用這份模板的技能會在註冊時擲錯」。

⭐ **逐行複驗過，那句話是真的**：`packages/shared/src/content/templates/expand.ts` 的
`FAMILIES` 有 **25 個家族**，⛔ `periodic-field` 不在裡面；`expand()` 第一行就
`throw new ExpandError('family "…" has no P1 expand path')`。
全 repo **零個**技能引用 `tpl-periodic-field`。

⇒ 票名「`tpl-periodic-field` 套用」**是一條死路** —— 而正解其實更便宜：
⭐ **`dot` 與 `onInterval` hook 都已經出貨、已經有人用**（`dot` 4 支 · `onInterval` 一族）。
28 支裡絕大多數要的就是這兩個，⛔ 不需要新模板家族。

### 2.4 ⛔⛔ 真正的擋路石：**一行 `DAMAGE_KEYS`**（柵欄外，我沒有動）

`amountPerTick`（`dot` 唯一的傷害欄）在**兩份** `DAMAGE_KEYS` 名單裡**都不存在**：

| 檔 | 行 | 後果 |
|---|---|---|
| `packages/shared/src/content/abilityProse.ts` | 585 | `{{dmg}}` **綁不到 dot 的每跳傷害** ⇒ 卡面印出一個裸的 `{{dmg}}` ⇒ `skillnorm:check` 第③問當場紅 |
| `packages/shared/src/content/descriptionClaims.ts` | 199 | `damage-absent` **看不見 dot 的傷害** ⇒ 一支正確實作的週期技能被報成「卡面承諾的傷害不存在」 |

⭐ **這一格把 §2.2 的 28 支裡每一支卡面寫「每秒受到 `{{dmg}}` 點傷害」的都鎖死了**
（例：`godie-huth.r` 28-04 破滅能量彈、`godie-o00l.q` 53-01 獸王牙操彈）——
把 `damage` 換成 `dot` ⇒ 佔位符變裸的（紅）；把 `dot` 加在 `damage` 旁邊 ⇒ 傷害變 6 倍（平衡）。
⇒ **兩條路都是錯的，而第三條路是那一行。**

⚠️ 現有的 4 支 `dot`（`godie-h02u.e` / `h02v.e` / `edem.q` / `edem.ex`）躲過這一格是**運氣** ——
它們的卡面寫「每秒受到 20/30/40/50 + 30% [AP] **傷害**」而 `dmg` 的正則要的是「N**點傷害**」。

### 2.5 順手量到的（⛔ 沒有當場修，第零守則⑧ —— 請 owner 排）

| 技能 | 事實 | 為什麼是缺陷 |
|---|---|---|
| `godie-etyr.ex` 14-002 魔力激發 | 卡面「每秒獲得 **7%** 的瑪那回復」，JSON 是 `manaRegen op:"flat" value:0.07` | `manaRegen` 基準是 **8/秒** ⇒ `flat +0.07` ≈ **+0.9%**。這是把百分比寫進 `flat` 的**單位錯誤**；⭐ 正解多半是 `op:"pctAdd"`，⛔ 但那是一次平衡改動，我不挑 |
| `godie-h02r.q` vs `godie-hgam.q`（90-01 飛葉快刀） | 同一支技能，一殼 `effects:[damage]`、另一殼 `template: tpl-ground-nova` | 「變身對子兩邊一起動」的反例。同型的還有 90-00 · 04-02 · 18-04 · 09-01 · 30-03 · 06-03 · 06-002 |

### 2.6 ⛔ 我沒有做內容批的原因（誠實列出）

| 擋住我的 | 檔 | 在柵欄外 |
|---|---|---|
| ① `DAMAGE_KEYS` 缺 `amountPerTick` | `abilityProse.ts` · `descriptionClaims.ts` | ✅ |
| ② **40 支裡 25 支在說明↔JSON 的棘輪基準線上** —— 修好它們會讓基準線項目「過期」⇒ `skillnorm:check` 紅，而修法是刪那一份分片 | `packages/shared/src/content/descriptionClaims.baseline/*.json` | ✅ |
| ③ 假宣稱那 12 支的正解是改**標記表／軸表** | `tools/skill-templates/{prose_markers,shape_axes}.json` | ✅ |
| ④ `periodic-field` 家族接線 | `packages/shared/src/content/templates/expand.ts` | ✅ |

⇒ ⭐ **在柵欄內，#648 今天沒有一支技能是可以安全落地的。**
⛔ 這不是「做不完」，是**票的形狀錯了**：它是一張 4 行程式的票，⛔ 不是一張 43 份 JSON 的票。

### 2.7 我落地的東西：一條承重守衛

`packages/shared/src/content/laneCLAIMPeriodicRegen.test.ts`

它關的是 §2.2① 那 7 支的洞：**它們沒有第二個表達**。
任何人把那一格 `healthRegen` / `manaRegen` 清掉或改成 0，卡面那句「每秒 …」當場變成謊話，
而 `content:build` · `skillnorm` · `prose` · `shapes` **一支都不會叫**
（`shapes` 甚至會覺得情況變好，因為它本來就沒把那一格算進去）。

- ⭐ 母體**推導**：「卡面有每秒宣稱」∩「沒有強週期機制」∩「有 regen modifier」。
  補了真的 `dot` 的那一支會自己離開母體，⛔ 不必改測試。
- ⛔ 零個出貨數值住在斷言裡（第二守則：驗機制不驗數字）。
- ⭐ 量尺自證：`expect(covered).toBeGreaterThan(0)` —— 母體空掉＝這支守衛失明。
- **突變驗過**：`godie-u00n.passive` 的 `healthRegen` 改成 `0.0` ⇒ 紅，訊息指名 `godie-u00n.passive`；已用 `Edit` 還原（`git diff` 為空）。

---

## 3. #623 —— 變身態逐對退場

見回報。⚠️ 已知的前置更正：#623 的 v2 報告那一欄的表頭逐字寫著
「（今天畫面上真的存在的）」⇒ ⭐ **它只量了視覺軸，從來沒讀過卡面文字**，
所以 9 個 🟢 裡只有 1 個真的可以退場。⛔ 不要照那份報告的顏色做。

---

## 4. 要跑哪些產生器（⛔ 我沒有跑，全域鎖）

| 指令 | 為什麼 |
|---|---|
| `pnpm shapes:build` | ⚠️ **`shapes:check` 在 HEAD 上就已經是紅的**（`docs/editor-contract/ggd-skill-shapes.md` 過期），⛔ 與本 lane 無關 —— 是別的 lane 的內容改動造成的。差異是群組排序與三個統計數字 |

⭐ 我這一輪**沒有改任何內容檔** ⇒ ⛔ 不需要 `content:build` / `skills:sync`。
（⚠️ 工作區裡 `content/{bundle,manifest,*_index}.json` 是**髒的** —— 那是別的 lane 的產物，
⛔ 我沒有 stage 它們。）
