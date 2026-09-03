# 46 份驗收 · 批1「位移與衝鋒」（7 份）—— GH#959

> 量測日 **2026-09-03**　·　治具 `packages/shared/src/ops/acceptanceN1.test.ts`
> ·　名冊與判定 `docs/editor-contract/ggd-acceptance-n1.json`（⭐ 機器讀的唯一住處）

---

## 0. ⛔⛔ 前提回驗 —— 票文的三條主張，**兩條今天不成立**

### ① 「本批的 id 清單只有一個住處（#953 定案的 #838 body）」⇒ ⛔ **不成立**

| 量了什麼 | 結果 |
|---|---|
| `gh issue view 838 --json body` 全文 | **22,057 字元** |
| grep `hvsh` / `u00v` / `hapm` / `位移` / `衝鋒` | ⛔ **0 命中** |
| #953 落地的 `docs/editor-contract/ggd-acceptance-eight.json` | ⭐ 只有**八招**，⛔ 沒有 46 份 |
| `grep -rn "位移與衝鋒" docs/` | 只有 `docs/_驗收計畫_codex編輯器_20260902.md:321` 的**批次計數表**（「N1 位移與衝鋒 · 7」），⛔ 沒有 id |

⇒ ⭐ 這 7 份在此之前**只住在 #959 的 body 裡**（人讀的），
⛔ **沒有任何閘讀得到它** —— 也就是說「⛔ 不要抄進測試」那句話成立，但它指的那個住處**不存在**。
⇒ 本輪補上機器讀的那一半：`docs/editor-contract/ggd-acceptance-n1.json`。
⚠️ ⭐ 它刻意**只存名冊與上一次的判定**，⛔ 判定理由是治具**每次重算**的 —— 修好一支就會紅並指名它。

⚠️ **仍然缺的**：46 份**整份**清單（六批）今天沒有機器住處，⛔ 本輪不擴權去建（會與 #960–#964 五條 lane 撞檔）。

### ② 「共同規則 #4：五級距標籤不存在 ⇒ 判定**阻塞於 #943**（46 份缺 `conditionTier`）」⇒ ⛔ **不成立**

**#943 已經落地** —— commit `3bdb3f925`，標題**逐字**：

> feat(GH#943): 🏷 兩個缺席的五級距軸 —— ⭐ 而正解是**推導**，⛔ 不是去填 235 份檔

`packages/shared/src/content/conditionTiers.ts::resolveConditionTier` 缺席時從**文件自己的結構**推導
（無條件 ⇒ 極小、有條件而作者沒判斷 ⇒ 中），而它的檔頭**逐字**寫著：

> ⇒ ⭐ 缺席時從**文件自己的結構**推導，⛔ 不是要人去 208 份檔各填一格
> —— 那會是 208 個會過期的第二住處（第〇·四守則）。

⇒ ⭐ **`conditionTier` 欄位缺席是設計上的正常狀態。**
照票文判「阻塞」會產生 **46 個假阻塞** —— ⛔ 而那正是這支模組的檔頭在防的事。

⚠️ 本批 **7/7 都有 `rangeTier`**（全庫 235/422 缺，但本批零缺）⇒ ⭐ **本批 0 份阻塞**。

### ③ 「共同規則 #5 必測案例：`godie-nbbc.r` 極大·**範圍** ⇒ 120s（陣列寫 60）」⇒ ⛔ **不成立**

| 案例 | 票文說 | ⭐ 量到 |
|---|---|---|
| `godie-nbbc.r` | 極大·**範圍** ⇒ 解析 **120s**，陣列寫 60 | 帶顯式 `cooldownShape:"單體"` ⇒ 解析 **60s** ＝ 陣列值，**落差 0** |
| `godie-e00r.q` | 極小·**範圍** ⇒ 解析 **30s**，陣列寫 6 | 帶顯式 `cooldownShape:"單體"` ⇒ 解析 **6s** ＝ 陣列值，**落差 0** |

根因：`cooldownShapeOf` 的第 1 條規則是「**手填的 `cooldownShape` 永遠贏**」。
⚠️ ⭐ 而 `godie-nbbc.r` 的那一格是 **#838 自己的 lane 加的**（commit `62b259ce9`
「feat(#838)(N1/N3 · 08-04): 兩個 JASS 標籤落地 —— ⭐ 而 `radius` 的雙重意義住在**五個**掃描器裡」）
⇒ ⭐ **規則 B 描述的是那次 commit 之前的世界。**

**全庫掃描**（342 份帶 `cooldownTier` ＋ `cooldown` 的技能）：**解析值與作者值落差 0 份**。
⇒ ⭐ 這兩個「已知答案」今天**校準不了任何東西** ——
⚠️ 而 `acceptanceEightSingleHome.test.ts` 對它們是**綠的**，因為它斷言的是
`cooldown[0] === 60`（真的成立），⛔ 而**訊息**寫著「這個案例的價值就是『陣列說 60 而級距解析成 120』」——
⭐ **一條綠燈，配一句已經過期的理由**（失敗形態⑩：守衛靠著一個已經消失的前提在綠）。

---

## 1. ⭐ 逐份判定（7/7，⛔ 沒有一份空白）

| id | 技能 | 卡面宣稱（剝台詞後） | 出貨 primitive | 傷害落點 | 判定 |
|---|---|---|---|---|---|
| `godie-edem.e` | 45-03 千鳥 | charge · alongPath | `dash{12.83}` | **沿線** | ✅ **通過** |
| `godie-nbbc.w` | 08-02 萊丁快速劍 | blink | `blink{to:targetUnit}` | template 單體 | ✅ **通過** |
| `godie-nbbc.r` | 08-04 阿邦快速劍X | alongPath | `blink{distanceUnits:10.08}` | **沿線 ＋ 終點** | ✅ **通過** |
| `godie-hjai.r` | 04-04 神滅斬 | **stun** | ⛔ 無 | 起點 | ⛔ **不通過** |
| `godie-hvsh.r` | 48-04 騎英之疆繩 | **charge** | ⛔ **無** | — | ⛔ **不通過** |
| `godie-u00v.r` | 78-04 死亡噴射肘擊 | **charge** · knockback · stun | `blink` ＋ `knockback` | 終點 | ⛔ **不通過** |
| `godie-hapm.w` | 52-02 蹂躪編年史 | **alongPath** · knockback · drag | `leap{throw:7.33, drag}` | 終點（圓） | ⛔ **不通過** |

**3 通過 · 4 不通過 · 0 阻塞。**（粗體 ＝ 未兌現的那一條宣稱。）

### ⛔ 四份不通過，逐份的**證據**

**`godie-hjai.r` 04-04 神滅斬** —— 卡面逐字「造成敵方單體…傷害並**暈眩2秒**」，
⛔ 而 effect 是 `applyStatus{statusId:"slow40", duration:2.0, moveSpeedMult:0.6}`。
`content/status-effects/slow40.json` 的 tags ＝ `slow` / `move-speed-down` / **`soft-cc`**，⛔ **沒有 `stun`**。
⇒ 第一·五守則：**卡面上一句說了不會發生的話**。
⚠️ ⭐ 同一份 repo 裡 `burnstun` 就帶 `stun` / `hard-cc` / `move-denied`（78-04 用的就是它）
⇒ ⛔ **不是「引擎做不到」**，是這一格接錯了。

**`godie-hvsh.r` 48-04 騎英之疆繩** —— ⛔⛔ **票文未列的第二個同型衝突**（票文只點名 `u00v.r`）。
卡面逐字「招喚飛馬以超快的速度**衝擊前方**」，⛔ 而 effect 樹裡**零個位移 primitive**：
3 個 `spawnModelFx` ＋ `template:tpl-single-strike`（該模板的 params 只有
`damage` / `damageType` / `castTimeSec`，⛔ 沒有位移）。
⚠️ `content/config/cast-approach.json` 的「走過去再放」也不是它 —— 那是**走進射程**，⛔ 不是衝鋒，
而且它只管 `castType:"targeted"` 的射程不足情形。
⇒ ⭐ **角色一步都不動，而卡面說牠衝過去了。**

**`godie-u00v.r` 78-04 死亡噴射肘擊** —— ⭐ 票文的「已知衝突」**量到成立**：
卡面「超快速速**飛奔**到敵人面前」，runtime 是 `blink`。
`sim/effects/variants/blink.ts` 檔頭逐字說它**刻意沒有** `arriveRadius`（`leap.landRadius` 的對應物）
⇒ 瞬移**沒有中間位置** ⇒ 「若受到**撞擊停止**」那一句在結構上無從發生。
⚠️ ⭐ 其餘三段**全部在**：`onArrive` 的 `damage{0.8 AP}` ＋
`knockback{distanceTier:極大, distance:8}` ＋ `applyStatus{burnstun, stun:true, 1s}`
⇒ ⭐ 缺的**只有**「飛奔」那一段位移本身（票文要的重建：衝鋒＋撞擊＋擊退＋暈眩 —— 後三者已具備）。

**`godie-hapm.w` 52-02 蹂躪編年史** —— ⭐ 抓取（`leap.dragToCaster:true`）與拋出
（`throwDistance:7.33`）**都在**，⛔ 而「使之撞擊[前方]一[**直線**][範圍]的敵人」那一段沒有落地：
`onLand` 走的是 `LeapSystem.detonate → enemiesInCircle(world, casterId, point, landRadius=4.95)`
⇒ ⭐ 傷害是**落點的一個圓**，⛔ 不是沿線碰撞。
⚠️ **無敵窗那一軸是過的**：`invulnerable 1.05s` ≤ `castTimeSec 0.833 + leap.durationSec 0.42 = 1.253s`
⇒ ⛔ 沒有超過實際動作（票文的第三個要點）。
⚠️ `狂怒才追加恐懼` 也在：`applyStatus{fear,3s}` 帶 `condition{kind:"status", subject:"self", statusId:"rage"}`。

### ⭐ 三份通過的**證據**（⛔ 不是「沒找到問題」）

**`godie-edem.e` 45-03 千鳥** —— 本批**唯一四軸全中**：
`dash{mode:"toPoint", speed:16, maxDistance:12.83}` ＋ **兄弟節點**的
`damageLine{length:12.83, width:12, aim:"facing", fromCaster:true, includeOrigin:true}`。
⭐ `length` **逐位元等於** dash 距離 ⇒ 傷害走廊蓋住整條衝刺路徑。
⭐ `width:12` == 2 × `aoe-tiers.radius[中]=6` ⇒ 卡面的「有效半徑」與走廊寬度是**同一個數字**。
⚠️ 而它**必須**是兄弟節點（⛔ 不是 `dash.onEnd`）——
`schema/effects/dash.ts` 的 `onEnd` 檔頭實測過：兄弟節點是從**起點**放的（位移在 slot 5、effect 在 slot 2b/3）
⇒ ⭐ 一條從起點沿 facing 延伸、長度等於衝刺距離的線，**正好**就是「沿途」。

**`godie-nbbc.w` 08-02 萊丁快速劍** —— 卡面「並**瞬間移動**到敵方面前」↔ `blink{to:"targetUnit", stopShortUnits:1.8}`。
⭐ 本批的**正向對照**：它刻意**不是** dash，而卡面也沒說衝鋒 ⇒ 兩邊是同一件事。

**`godie-nbbc.r` 08-04 阿邦快速劍X** —— 兩段都對得上：
A 式 `damageLine{length:10.08, width:3.67}` ＝ **沿線**；
B 式 `delayed{0.5s} → blink{to:"point", distanceUnits:10.08} → onArrive: damageArea ×2` ＝ **終點**。
⭐ 位移 10.08 == 傷害線 10.08（＝ JASS `j:28898` 的 `550.00`，ubertip 逐字「距離550」）。

---

## 2. ⭐⭐ 量尺的**兩個方向**（⛔ 一把只驗過單邊的尺不算自證過）

四個校準點**全部是出貨資料**，⛔ 沒有一個是自造夾具（失敗形態⑤）。

| 方向 | 技能 | 要量到什麼 | 它擋住哪一種瞎眼 |
|---|---|---|---|
| **有** | `godie-edem.e` | `dash` ＋ 落點含「沿線」 | 尺對**已知存在的衝鋒**瞎 |
| **有** | `godie-u00v.r` | stun 這一軸**兌現得到**（`burnstun` 帶 `stun` 標籤） | stun 軸整條是死的（永遠說「沒有」） |
| **沒有** | `godie-hvsh.r` | ⛔ **零**位移 primitive | 把 `spawnModelFx` / `template` 讀成「角色在動」 |
| **沒有** | `godie-efur.e` | ⛔ **零** charge 宣稱 | ① 台詞沒剝乾淨 ② `衝擊` 吃到名詞 |

### ⭐ `godie-efur.e` 為什麼是**最好**的 known-absent 校準點（量出來的）

它把**兩個誤報陷阱疊在同一支出貨技能上**，而它的 effects **只有一個 `damageArea`**：

1. **台詞**逐字是「**其實還可以衝刺，但老了**」（一句玩笑）
2. **內文**是「將念形成龍形**衝擊波**包裹全身」 —— `衝擊` 在這裡是**名詞的一半**

⇒ 判準必須是 `衝擊(?!波)`，而且**必須先剝台詞**。

**全庫量測**（`content/abilities/*.json`，126 支帶「」台詞）：
台詞裡含位移詞彙的**只有 2 支** —— `godie-efur.e`（衝刺）與 `godie-hapm.w`（飛出）。
⚠️ ⭐ 而「剝不剝台詞會不會改變宣稱」的答案是 **0 支** —— 因為這 2 支的**內文**碰巧也有同族詞。
⇒ ⛔ 我**沒有**為此加一條斷言：**一條永遠綠的斷言是裝飾，⛔ 不是閘**。
⭐ 剝台詞仍然保留（它擋的是 44-04 心臟麻痺「在35秒後」那一族），
⭐ 但這一批真正在承重的是 `衝擊(?!波)`。

---

## 3. 突變紀錄（⭐ 實跑，⛔ 不是「應該會紅」）

| # | 改壞什麼 | 結果 |
|---|---|---|
| **M1** | 治具 `satisfies()` 的 `charge` 從 `dash` 放寬成 `dash \|\| blink`（＝票文警告的那個錯：拿瞬移充當衝鋒） | 🔴 ③「判定漂了」，逐字指名 `godie-u00v.r（78-04 死亡噴射肘擊）：契約說 不通過[charge]、量到 通過[-]` |
| **M2** | **出貨內容** `content/abilities/godie-edem.e.json` 的 `dash.maxDistance` **12.83 → 6** | 🔴 ④ 逐字指名 `godie-edem.e：位移 dash=6 vs 傷害線 length=12.83 ⇒ 沿線傷害蓋不住路徑` |

⭐ 兩次都用 `python3 scripts/edit-or-die.py`（⛔ 不是 `python3 -c "…replace…"` ——
CLAUDE.md 逐字：對不上時它靜默印 ✓，⭐ 而突變驗證正是它最會騙人的地方）。
⭐ 還原後 `git diff --stat -- content/abilities/godie-edem.e.json` **空**（逐位元組相同）。

---

## 4. 離開碼

| 指令 | 結果 |
|---|---|
| `npx vitest run packages/shared/src/ops/acceptanceN1.test.ts` | ✅ **6 passed**，EXIT=0 |
| `npx tsc --noEmit -p packages/shared/tsconfig.json` | ⚠️ EXIT=2 —— ⭐ **5 個錯全部在 `packages/shared/src/ops/acceptanceN3.test.ts`**（#961 那條 lane 的**未追蹤**新檔），`grep -c acceptanceN1` = **0** ⇒ ⛔ 不是本批造成的，⛔ 也不在本批的檔案柵欄內 |

---

## 5. ⭐ 交出去的東西（票文 AC 逐條）

| AC | 狀態 |
|---|---|
| ① 7 份逐份有判定，⛔ 沒有一份空白 | ✅ 3 通過 / 4 不通過 / 0 阻塞（見 §1） |
| ② JSON receipt ＋ 失敗原因 ＋ 技能 ID | ✅ `ggd-acceptance-n1.json` 的 `roster[].why` 逐份帶證據；⛔ **連續擷圖沒有做** —— ⭐ 那是 #664 Tier 2 的批核頁（本票 Non-goals 逐字：⛔ 不做「像不像」的判定） |
| ③ 「已知衝突」必須被標紅，⛔ 靜默通過＝不通過 | ✅ `godie-u00v.r` 標紅；⭐ **並多標了一支票文沒列的** `godie-hvsh.r` |
| ④ 四層驗證 | ✅ schema（出貨 `content/` 通過 `content:build`）· template（`tpl-single-strike` 逐格讀過）· effect graph（治具走整棵樹）· runtime（`LeapSystem.detonate` / `blink` / `dash.onEnd` 逐行對照） |
| ⑤ `typecheck` EXIT=0 | ⚠️ 見 §4 —— 本檔 0 錯，紅的是隔壁 lane 的未追蹤檔 |

## 6. ⭐ 順手發現、⛔ 沒有當場修的（第零守則⑧ —— 排序是 owner 的權力）

1. ⭐ **`acceptanceEightSingleHome.test.ts` 的規則 B 訊息已經過期** ——
   它斷言的東西成立，⛔ 而它寫的理由（「級距解析成 120」）今天是假的。
   ⇒ 一條**綠著的**守衛帶著一句過期散文（第三守則）。
2. ⭐ **46 份整份清單仍然沒有機器住處** —— 本輪只補了 N1 這 7 份。
3. ⭐ **全庫 65 支技能的「宣稱 ↔ 位移 primitive」對不上**（用同一把尺掃 422 份量到的）——
   本批只認領了其中 4 支。⚠️ 其中很多是 `alongPath` 宣稱配 `damageLine`（那是**對的**，
   我的粗掃只數位移 primitive）⇒ ⭐ 真正要人看的是 `charge` / `blink` 那一族。
4. ⭐ `godie-u00v.r` 卡面印著「擊退目標 **800** 距離」—— 一個**未換算的 wc3 生數字**
   （出貨是 `distanceTier:極大` ⇒ 8 GGD-u）。⛔ 卡面不該印生數字（第〇·四守則）。
