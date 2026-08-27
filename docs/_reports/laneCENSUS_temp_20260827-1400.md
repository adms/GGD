# lane CENSUS —— #777 · #762 · #529（2026-08-27）

> ⚠️ `_temp_` 檔：這份是**一次工作的完整紀錄**，過期就搬 `docs/legacy/_temp-retired/`。
> 結論已經逐條落在票上與程式碼裡；⛔ 這裡不是第二個住處，是**推理過程**。

---

## 0. 一句話

⭐ **普查不是「沒人重跑」，是「跑不起來」** —— `build_vfx_census.py` 的第一行
`assert len(abilities) >= 600` 在內容合法縮到 421 之後，**在每一次正確的 checkout 上都
AssertionError**。而它的訊息是 `wrong checkout?` ⇒ 讀到的人會去查 checkout，⛔ 不會去查那個 600。

⇒ 一個**永遠不會綠的閘**，跟沒有閘是同一件事（元規則的第 N 次實例）。

---

## 1. #777 —— 分母

### 1.1 量到的（⛔ 不是引用票文）

| | 修之前 | 修之後 |
|---|---:|---:|
| `ggdDocState` 份數 | **662**（2026-07-24 的快照） | **421** |
| `retiredFromCensus`（在表上、技能已不存在） | **259** | **0** |
| `newSinceCensus`（技能在、JASS 側沒 join） | **18** | **0** |
| `/__live/jass-vfx` 的 `statusCounts` 分母 | 662 | **421**（`notInCensus` 整格消失） |
| `build_vfx_census.py` 跑得起來嗎 | ⛔ **AssertionError** | ✅ |

### 1.2 ⭐ 最重要的發現：**join key 自己漂掉了，而那是設計**

普查 join 的是**技能名字**。而 owner 核准過「GGD 有自己的技能名」（改名不是缺陷）。
⇒ **這把鑰匙被設計成會漂**。逐支查證之後：

| 類 | 支數 | 例 |
|---|---:|---|
| 名字**整支被重新命名** | **29**（橫跨 **6 位英雄**） | 13/15/60 整組換題材；39 修 `無名→無明` 錯字；72 `億萬星殞落→億萬衛星殞落` |
| 原作地圖**自己**的編號錯誤 | **1** | `A0BZ` 夾在英雄 86 的 rawcode 連號中間（A0BX 86-00 / A0BY 86-02 / **A0BZ** / A0C0 86-04），卻標成 `58-01` —— 作者從另一隻皮卡丘複製貼上忘了改號 |
| 原作**真的**有兩筆同名記錄 | **29** | 本體 ＋ 變身型分身（`22-002` 兩筆、`92-04` 兩筆…）⇒ 正確地判 `AMBIGUOUS` |
| GGD 原創、原作沒有 | **15** | `godie-zombiex.*`（英雄 100）· `godie-zombieking.passive` · `sela.*` / `thorne.*` 骨架 |

**修法**（`build_vfx_census.py::join`）：`ggdDocs` 提名 → **名字**先判 → 名字不合就用**英雄編號**判
（第〇·六守則：編號是 JASS join key，不可浮動）→ ⚠️ 用編號之前**先驗那把鑰匙**
（編號必須在候選集裡**唯一命中**，兩筆就判 `AMBIGUOUS`，⛔ 不猜）。

`joinConfidence`：**CONFIRMED 377 · AMBIGUOUS 29 · NONE 15 · WEAK 0**（原本 name-only 只有 347）。

### 1.3 兩個寫死的門檻，兩種修法

| 原本 | 為什麼是錯的 | 改成 |
|---|---|---|
| `assert len(abilities) >= 600` | 一個打字當下凍結的數字，內容一縮就整支擋死 | 問 `content/abilities/_index.json`：**清單上的每一份我都讀到了嗎** |
| `assert exact > len(rows) * 0.85` | 百分比門檻沒有人推導得出來，而且**往錯的方向壞**（key 一漂就先擋死產生器） | `assert not weak` —— 「候選只有一個卻放棄 join」是這支產生器不可以出貨的失敗 |

---

## 2. #762 —— 覆蓋率（`EnableTrigger` 遞移閉包）

### 2.1 接在哪裡（⛔ 不是票文猜的那一支）

票文說接 `build_vfx_census.py`。⛔ **實際的歸戶發生在更上游**：
`extract_invocation_params.py` 才是「trigger 群組 → ability id」那一步
（`RE_SPELL_GATE` = `GetSpellAbilityId() == 'XXXX'`），census 只是讀它的產物。
⇒ 閉包接在 census 上會**太晚**，什麼都撿不到。

⭐ 閉包是 **`from jassfacts import closure`**（⛔ 沒有寫第二條 `EnableTrigger` 正則）。
兩邊的群組命名空間實測**完全對齊**（gated 283/283 · unattributed 269/270）。

### 2.2 量到的（AC 1，⛔ 不引用舊票的「約 6% / 約 40 個」）

| | 值 |
|---|---:|
| `EnableTrigger` 邊 | **546** |
| 有出邊的 trigger 群組 | **207** |
| 靠閉包才歸戶到的群組 | **103**（其中 **89** 真的產生美術） |
| **從 `unattributed` 轉正的美術呼叫** | **200**（511 → 311） |
| 因此拿到 per-invocation 美術的 w3a 技能 | **+22**（182 → 204） |
| 因此拿到參數的模型 stem | **+27**（134 → 161） |
| `attributedInvocationRows` | 492 → **705** |
| `paramsConfirmed` | 92 → **110** |
| ⚠️ `artConfirmedNegative` | 575 → **572**（⛔ 只有 −3） |

⚠️ **`artConfirmedNegative` 只掉 3，而那是誠實的**：它數的是「**一個美術通道都沒有**」的
w3a 記錄，而閉包撿到的多半是**已經有 w3a/stock 美術、但缺演出參數**的技能。
⛔ 拿 −3 當這張票的成績單會低估它 **60 倍**；真正的量是上面那 200 / +22 / +27。

### 2.3 標本

`The_End_ofWorldStart`（gate `A05D`，1 次傷害）── `EnableTrigger` →
`The_End_ofWorldCasting`（**0.10 秒週期 timer**，⛔ 自己沒有 gate）。
修之前它整組躺在 `unattributed`；現在歸給 `A05D`，並帶 `viaEnableTrigger: ["The_End_ofWorldStart"]`。

### 2.4 順帶修掉一個潛伏的除零

`SetUnitTimeScalePercent(u, **0**)` 是 WC3 的合法慣用法（把動畫**凍在第一格**當佈景），
⛔ 不是「無限慢」。`INVOCATION_PARAMS.md` 的寫作器一直寫著 `100.0/v` ——
閉包撿進第一筆 0 的當下它就 `ZeroDivisionError`。⇒ 0 現在印 `frozen (first frame)`。

---

## 3. #529 —— 正確分母上的數字

⚠️ **本 lane 只把分母交出來，⛔ 沒有做重綁**（理由見 §3.3）。

| 票文寫的（舊分母 662/668） | ⭐ 今天量到的（421） |
|---|---|
| 技能有 `vfxKey` 384/420（91%） | **385 / 421（91.4%）** |
| 綁通用原型 `fx.prim.*` 342（**89%**） | **343 / 385 有 key 的 = 89.1%** ⇒ ⭐ **89% 這個數字在新分母上活下來了** |
| 綁原作 `fx.w3x.*` 24（6%） | **24 / 421（5.7%）** |
| `fx.w3x.*` 匯入 120 份，**110 份沒人用** | **118 份，綁上 10 份 ⇒ 108 份沒人用** |
| —— | 普查狀態：`PRIMITIVE-NECESSARY` 230 · `NO-SOURCE` 96 · `NO-CAST` 36 · `TRUE-PORT` 29 · `PRIMITIVE-SUBSTITUTE` 17 · `LEGACY-KEY` 13 |

### 3.1 ⭐ 這一輪真正的產出：**推導綁定 36 → 57 支（+21）**

`content/config/ability-vfx-bindings.json`（`vfxbind:build` 的產物，四道證據閘）
從 **36 支** 長到 **57 支**。⛔ 而那 +21 支**現在還到不了畫面**。

### 3.2 ⛔ 卡住的那一格：`vfx-ability-art.json` 的 `promoted` 缺 30 列

`tools/vfx-bind/scan.py --check` 的跨表對帳現在報 **30 筆 `MISSING`**（原本 9 筆）：

> 證據過了四道閘，但 `vfx-ability-art.json` 沒有 promoted 列 ⇒ **這支技能拿不到原作藝術**

逐支（30）：
`godie-e00w.passive` `godie-e00x.passive` `godie-h01n.e` `godie-h01o.e` `godie-h020.e`
`godie-hapm.ex` `godie-hapm.w` `godie-hart.w` `godie-hjai.e` `godie-hpb1.e` `godie-huth.r`
`godie-hvsh.r` `godie-hvwd.ex` `godie-n01c.r` `godie-nbbc.r` `godie-o00x.e` `godie-ogrh.e`
`godie-osam.ex` `godie-u00h.r` `godie-u00j.w` `godie-u00n.q` `godie-u00n.w` `godie-u00o.q`
`godie-u00o.w` `godie-u00v.w` `godie-u01u.r` `godie-u034.passive` `godie-ucrl.passive`
`godie-udea.w` `godie-udre.r`

另有 **2 筆 `SET-DRIFT`**（`godie-u010.e` · `godie-uvng.e`：推導說 `fx.w3x.locust.boomnl.p00–p04`，
promoted 說 `godie-tectonicfury-p0/p1`）與 **2 筆 `EXTRA`**（`godie-u01u.q` · `godie-udre.q`，人工裁決，⛔ 不是缺陷）。

### 3.3 ⛔ 為什麼我沒有直接補那 30 列

`promoted` 列要挑一顆 **`primary`**（家族裡哪一顆 emitter 當主角，其餘進 `extra`）——
⭐ **那是一個視覺判斷，⛔ 不是機械推導**。我在 headless 環境裡挑它，就是
「用現有參數湊一個看起來像的」（第一守則明令禁止的第三條路），
而 #529 自己的 `Known risks` 逐字寫著「**接錯比不接糟**」＋「回綁後過出生可見性掃描」。

⇒ ⭐ 這 30 列是 **HITL 的料**（owner 2026-08-24 的分層漏斗 Tier 2）：
機器已經把 Tier 0/1 做完了（四道閘＋唯一性），剩下的是「像不像」。
⭐ 而且 `scan.py` **已經備好收口**：`--check --strict` 會讓 `MISSING/DEAD/SET-DRIFT` 回非零。
⇒ 那 30 列補完的那一天，把 `package.json` 的 `vfxbind:check` 改成 `--check --strict`，這道閘就永久關上。

---

## 4. ⚠️ 重跑普查會**引爆三支下游產生器** —— 這是 #777 的真實成本

| 產生器 | 為什麼會過期 | 結果 |
|---|---|---|
| `vfxbind:build` | 讀 `w3x-ability-provenance.json` | 綁定 36 → **57** 支 |
| `jasscombo:build` | 由 provenance 反查 `abilityIds` | 見 §4.1 |
| `audit:build` | 讀 provenance ＋ jassfacts | `docs/技能模板驗收標準.md` 重推（421 支 / 273 支有缺口） |

### 4.1 ⭐ 順帶抓到一個**空宣稱**（第一·五守則）

`content/config/combo-strikes.json`（出貨檔）替 **5 支已經不存在的技能**登記著連段：
`godie-ntin.r`（23-04 雷焰聖劍）· `godie-nplh.q`（16-03 無無明亦無）·
`godie-naka.r`（27-04 飛燕閃）· `godie-u00b.w`（75-02 幻影鬥氣）· `godie-e00j.r`（95-04 一百重天）
—— 那 5 位英雄**整隻下架了**，而過期的普查一直替它們背書。修完後**死宣稱 = 0**。

⚠️ 而 `extract.py` 原本的反應是 **`AssertionError` 整支擋死** ——
它的前提是「查不到 = 我漏寫一列 `RESOLUTION`」，⛔ 而那個前提在普查真的會重跑之後就破了：
**下架一位英雄 = build 掛掉**。⇒ 改成**推導**那句「能被反駁的理由」（指名 rawcode ＋ 原作名），
⛔ 不是每退休一位英雄就要有人回來手寫一列（一張要靠人記得維護的表 = 下一次的過期快照）。

---

## 5. 守衛與突變

`packages/shared/src/ops/laneCENSUSVfxCensusFresh.test.ts`（5 條，⛔ 一個出貨數值都沒寫進斷言）

| 條 | 問的關係 |
|---|---|
| ① | `ggdDocState` ↔ `content/abilities` 逐份對齊（漂了就指名那幾份） |
| ② | 出貨 provenance 只認領活著的技能（⛔ 沒有空宣稱） |
| ③ | 閉包是 `from jassfacts import` 來的，⛔ 檔裡沒有第二條 `EnableTrigger` 正則 |
| ④ | `viaEnableTrigger` 真的有列，而且每一列指得出**是誰**點亮它 |
| ⑤ | `The_End_ofWorldCasting` 不再躺在 `unattributed` |

**突變（跑過，承重的那一條）**：`jass_closure(jass_groups, [seed])` → `[seed]`
（＝拿掉遞移展開）→ 重跑產生器 → ④⑤ **兩條紅**：`viaEnableTrigger` 歸零、42-04 的週期演出回到
`unattributed`。改回來後全套重生成、三支 `--check` 全綠。

---

## 6. 柵欄外的餘量（⛔ 我沒動）

| 東西 | 在哪 | 狀況 |
|---|---|---|
| `w3xAbilityArtRows()` 掉 `heightY` / `anchor` / `groundDecal` | `apps/client/src/render/vfx/w3xAbilityArt.ts` | ⚠️ 逐行讀過：`familyRow()`（:246–281）**三格都在**；缺的是 `promotedRow()` 那一條路 ⇒ ⭐ **上面那 30 列一旦補進 `promoted`，就會走到缺欄位的那一條** ⇒ 兩張票要一起收 |
| ⚠️ 過期散文 `"which is 34 of 668"` | 同檔 `w3xAbilityArtRows()` 下方註解 | 668 是舊分母，今天是 **421**；promoted 也不是 34（推導 57、promoted 29） |
| `w3xArtFamilies.ts` 缺 4 個 owner 點名 stem 的家族 | `apps/client/src/render/vfx/` | 未查 |
| `tsc` 一支紅 | `apps/game-server/src/index.ts:403` `TS2345 CacheReport` | ⛔ **不是我的**：該檔有另一條 lane 未提交的 +37 行 |
| `vfxbind:check` 收口 | `package.json` | 30 列補完後改成 `--check --strict` |

## 7. 柵欄外但我動了的（全部是**產生器產物**，經 `genrun.sh`，⛔ 零手改）

`content/config/ability-vfx-bindings.json` · `content/config/combo-strikes.json` ·
`docs/_reference/jass-combo-29.md` · `docs/技能模板驗收標準.md`

⭐ **理由**：它們是我改的來源的**機械後果**。不重生成 ⇒ `skills:check` 對**每一條 lane** 都紅，
而那正是本 repo 記過的「mid-run 改動 = 下一輪的紅」。⛔ 我沒有手改其中任何一個位元組。
