# AP 係數：「接上之後變最多的」重新用公式判斷（owner 2026-09-07）

> owner（逐字）：「請你**重新用公式判斷 看是不是判斷錯了來校正 接上之後變最多的 14 支**」

---

## 0. 一句話結論

⭐ **「接上模板之後係數變了」這件事幾乎沒有發生（6/149 支，最大 1.14×）。**
⭐ **真正判錯的是「校準普查自己的分母」** —— 它掃磁碟原檔，看不到 191 支模板技的 AP 節點
⇒ 母體 186 → 91 條 ⇒ 讀出「漂了 −7.5%」⇒ ⛔ 會叫人把 `base` 校到 **0.1783**，
而那是**對一個 runtime 不存在的母體**算的。改成展開後 ⇒ 校準比 **0.925 → 1.019** ⇒ `base` 只要 **0.1649 → 0.1619**。

⭐ 逐支重判之後，**全庫只有 1 支是真的判錯**：34-04 蒼龍破（第七維把「一人只吃一次」的行進波當成 12 連擊）。

---

## 1. 分母與探針（⛔ 不是只回一個數字）

| 項目 | 值 |
|---|---:|
| `content/abilities/*.json` | **421** 份 |
| 帶 `template` 的 | **191** 支（baseline 93 ⇒ ⭐ 這一天新接上 **99** 支） |
| 有 `ap` 係數的（展開後） | **149** 支 / **186** 條 ratio（含 `when` 條件式 26 條） |
| 其中 AP 節點住 `template.params` 的 | **98** 條（83 支） |
| ⛔ 不展開時普查看得到的 | **91** 條 |
| ⭐ 「展開之後第一次被算進來」的 | **42 支 / 43 條** |
| 模板檔 | baseline 46 → HEAD **51** |

**baseline 探針**：`15cf8eba1`（第二波收編，⛔ 模板化第三～七批之前）。
**量法**：兩側都用 **HEAD 的公式程式碼 ＋ HEAD 的 config**，⛔ 只有 ability 文件與模板不同 —— 這樣才隔離得出「文件形狀改變」的效果。

---

## 2. 第一問：「接上之後變最多的」是哪幾支？

### 讀法 A —— 接上**模板**之後（parent 指定的讀法）

判準：`gm(該支展開後每一條 ap ratio 的解析值)` ，baseline vs HEAD，按 `|ln(after/before)|` 排序。

| # | id | before | after | ×倍 | 節點數 |
|---:|---|---:|---:|---:|---|
| 1–2 | `godie-u01u.r` · `godie-udre.r` | 3.0761 | 2.6233 | 0.853× | 2→2 |
| 3–4 | `godie-u01u.e` · `godie-udre.e` | 3.0685 | 2.6168 | 0.853× | 2→2 |
| 5–6 | `godie-h020.e` · `godie-hjai.e` | 0.2115 | 0.2412 | 1.140× | 2→3 |
| 其餘 143 支 | | | | **1.000×** | 不變 |

⇒ ⭐ **有變化的只有 6 / 149 支，最大 1.14×，`|Δ|≥1.5×` 的是 0 支。**
⇒ ⭐ 模板展開是**逐位元等價**的（「展開出來與出貨那一支逐位元相同」那條設計成立），
⛔ 「接上模板讓係數變了」**不成立**。ap 節點 0→N 與 N→0 都是 **0 支**，展開失敗 **0 支**。

### 讀法 B —— 接上**公式**之後（＝那份 before/after 報告的「14 支」）

判準：`|ln(公式值 / 文件手填值)|` 由大到小，不含 `when` 條件式（那是額外項，⛔ 兩個空間混算）。

| # | id | 名稱 | 手填 | 公式 | ×倍 | 新進母體 |
|---:|---|---|---:|---:|---:|:--:|
| 1 | `godie-h020.e` | 04-03 龍破斬 | 1.800 | 0.1400 | **0.08×** | |
| 2 | `godie-hjai.e` | 龍破斬（鏡） | 1.800 | 0.1400 | 0.08× | |
| 3 | `sela.e` | sela 骨架 | 0.500 | 0.0570 | 0.11× | |
| 4 | `godie-hvwd.ex` | 02-002 神通眼 | 0.700 | 5.2091 | **7.44×** | |
| 5 | `godie-e00x.e` | 77-03 GLADIARIA ALAT | 0.300 | 1.8577 | **6.19×** | |
| 6 | `godie-o00l.r` | 53-04 暴爆咒 | 0.300 | 1.8577 | 6.19× | ⭐ |
| 7–8 | `godie-e007.ex` · `godie-ewar.ex` | 12-002 仙氣發勁 | 6.000 | 1.0725 | 0.18× | |
| 9 | `sela.q` | sela 骨架 | 0.700 | 0.1342 | 0.19× | |
| 10 | `godie-etyr.r` | 14-04 | 0.700 | 0.1346 | 0.19× | ⭐ |
| 11 | `godie-o02p.q` | | 0.600 | 0.1188 | 0.20× | ⭐ |
| 12–14 | `godie-o00k.q` · `godie-o02l.q` · `godie-ofar.q` | | 0.600 | 0.1270 | 0.21× | ⭐ |

（⭐ ＝ 展開之後第一次被算進母體。完整 26 列見 `/private/tmp/apbase/final.txt`。）

⚠️ ⛔ **`godie-osam.r` 34-04 奧義˙蒼龍破原本是這張表的第 1 名（0.7 → 0.0275，`0.04×`）** ——
它現在不在表上了，因為它是**唯一真的判錯**的那一支，而它已經修好（見 §3）。

---

## 3. 第二問：逐支「當初判錯了沒有」

### ⛔ 判錯了 —— 1 支（改在**公式**那一層）

**`godie-osam.r` 34-04 奧義˙蒼龍破 —— 第七維（發數）**

| | |
|---|---|
| **落在哪一維** | ⑦ `multiHit` |
| **那一格誰提供** | ⭐ **模板結構**（`tpl-traveling-wave` 展開成 `delayed{count:12}`） |
| **判定** | `apCoeffHitsOf` 讀到 `delayed.count = 12` ⇒ 每一發只拿 1/12 ⇒ 係數 0.7 → **0.0275** |
| **⛔ 為什麼是錯的** | 展開後的容器**自己逐字宣告** `"hitOncePerTarget": true`；`tpl-traveling-wave` 的說明逐字寫「**同一個人整串只吃一次**」；ability 說明逐字寫「（**每人只吃一次**）」；sim 端 `sim/effects/delayed.ts:332` 在這一格開著時建 `struck` 集合去重，守衛 `sim/effects/travelingWaveAdvance.test.ts` 逐字驗過 |
| **⭐ 錯在哪一層** | **公式的維度**，⛔ 不是模板參數 —— `stepCount:12` 是對的（12 段**空間推進**）。第七維問的是「一次施放打**同一個人**幾下」，⛔ 不是「這個容器結算幾次」 |
| **修法** | `apCoefficient.ts` `apCoeffHitsOf`：容器帶 `hitOncePerTarget === true` ⇒ 回 **1** |

⭐ 全庫母體：`count>1` 的容器 **20 個**，其中帶 `hitOncePerTarget` 的 **2 個**，
真的掛著 AP 節點的 **1 個**（就是這支）。其餘 7 條 hits>1 的 AP 節點**都驗過是真的連擊**：
`e00s.r`/`e010.r`（randomArea 4 顆流星）· `efur.r` 13-04 龍星群 10 顆 ·
`hapm.ex`（`delayed{count:9, shape:single}` 九連擊，⛔ 沒有去重）· `hart.r` 超究 7 段＋收尾。

### ✅ 沒判錯 —— 其餘每一支都指得到「哪一維的哪一條規則」

| 族 | 支數 | 落在哪一維 | 結論 |
|---|---:|---|---|
| **w3x 手填的設計性偏離** | 8 | ⑥ `baseComp` ＋ ① 冷卻 | 龍破斬 1.8 · 仙氣發勁 6.0 · 神通眼 0.7 —— 這些是**原作逐字匯入的字面值**，公式與它們的落差是**設計上的**，⛔ 不是標籤錯。（第〇·四守則的豁免那一格） |
| **`sela` 骨架** | 2 | ⑥ `damageTier` 缺席 ⇒ `whenTierAbsent` | fail-open 用的骨架英雄，⛔ 不是出貨內容 |
| **「0.6 蓋章」的範圍技** | 11 | ④ 形狀 ＋ ① 冷卻 | `o00k.q`/`o02l.q`/`ofar.q`/`n01g.q`/`n003.q`/`o02p.q`… 手填**全部是 0.6**，公式全部給 0.12–0.14 ⇒ ⭐ 0.6 是一個**預設戳章**，⛔ 不是逐支判斷。公式在這一族是對的（範圍 shape 0.64–0.71 × 冷卻 0.75） |
| **長冷卻單體** | 5 | ① 冷卻（60s 單體 ⇒ 上限 3.0） | `h01n.w`/`h01o.w`/`hpb1.w`/`u010.q`/`uvng.q` —— 手填 0.3–0.5，公式 1.4–2.3。冷卻維度**照規則**給的，⛔ 沒有誤判 |

### ⚠️ 兩支是**內容層**的問題（⛔ 在我的柵欄外，只回報不動）

| id | 症狀 | 證據 | 建議 |
|---|---|---|---|
| `godie-e00x.e` 77-03 | 6.19× | 卡面逐字「[變身]…**對英雄攻擊附帶額外 {{ap}}% [AP] 傷害**」⇒ 它是**普攻 proc**，⛔ 而 JSON 是一個裸的頂層 `damage`（沒有 `onBasicAttack` hook）⇒ 公式當成 60 秒大招。**與 15-02 疾風迅雷（判斷層③）同型**，只是這一次錯的是文件 | 開票：補 `onBasicAttack` hook |
| `godie-o00l.r` 53-04 暴爆咒 | 6.19× | 卡面逐字「**以自我為中心逆時針放射**火焰爆裂」⇒ 是自我中心的放射，⛔ 而 `template.ref` 是 **`tpl-single-strike`** ⇒ 形狀維判成單體（2.5×）而不是範圍（~0.7×） | 開票：換模板 ref（`content/abilities/` 是別條 lane 的柵欄） |

---

## 4. 第三問：改了什麼

| # | 檔 | 改動 | 層 |
|---|---|---|---|
| ① | `packages/shared/src/content/apCoefficient.ts` | `apCoeffHitsOf`：`hitOncePerTarget === true` ⇒ 發數 1 | **公式的維度⑦** |
| ② | 同上 | `base` **0.1649 → 0.1619** | 校準 |
| ③ | `content/config/ap-coefficient.json` | `"base": 0.1619` | 出貨值 |
| ④ | `packages/shared/src/content/schema/config/apCoefficient.ts` | 校準段落改寫（186 條母體 · 0.6919 / 4.3541 ⇒ 0.1619）＋ 記下「分母」那個教訓 | 說明（⛔ 舊的那段已經是謊話） |
| ⑤ | `packages/shared/src/content/apCoefficient.test.ts` | 普查改成**展開後**；儀器門檻 80 → **150**；新增「母體是 runtime 那一個」；容差 **1.12 → 1.05** | 閘 |
| ⑥ | `packages/shared/src/content/apCoeffJudgment.test.ts` | 新增判準⑥（`hitOncePerTarget` ⇒ 1，含反方向 `hapm.ex` 仍要除） | 守衛 |
| ⑦ | `packages/shared/src/content/apCoeffDeviation.test.ts` | `OUTLIER_CEIL` **21 → 11** | 棘輪 |
| ⑧ | `apps/editor/src/preview/forgeRealCast.test.ts` | 假人加厚（走出貨 `registerChampion`→`spawnChampion`→statPipeline）＋ 還原註冊表 ＋ 新斷言「七段全部拿得到受害者座標」 | 夾具 |

⛔ **沒有動**：任何 `content/abilities/**`、任何 `content/ability-templates/tpl-*.json`
（逐支查過，**沒有一格模板參數是填錯的** —— 唯一的錯在公式那一層）、`base` 以外的任何一格設定。
⛔ `globalMult` / `cooldownSlopeExp` 是 owner 旋鈕，一格沒碰（`owner-knobs.json` 沒有 `base`，校準是規定的程序）。

### 三個住處 ＋ 消費端

| 住處 | 狀態 |
|---|---|
| `content/config/ap-coefficient.json` | ✅ 0.1619 |
| Zod `DEFAULT_AP_COEFFICIENT` (`apCoefficient.ts:67`) | ✅ 0.1619 |
| admin | ✅ `AP_COEFFICIENT_SPEC` 走 `derivedFields(zConfigApCoefficientDoc)` ⇒ **無字面值**，說明用 `{{出貨值}}` 佔位 ⇒ 不會漂 |
| ⭐ **消費端** | ✅ `packages/shared/src/content/registries.ts:327`（讀 config）→ `:334` `resolveApCoeffOnDocWithTiers(...)`，掛在 `withTiers` 上（`:245`） |

---

## 5. 第四問：`base` 校準做了沒

⭐ **做了：0.1649 → 0.1619。校準比 1.0186 → 1.0001（收斂到不動點）。**

### ⭐ 而它與上一輪的差別是**分母**，⛔ 不是勇氣

```
⛔ 不展開母體  91 條: 手填 gm 0.7843 · 公式 gm 0.7253 ⇒ 比 0.9248  ⇒ 會叫人校到 0.1783
⭐ 展開後母體 186 條: 手填 gm 0.6919 · 公式 gm 0.6920 ⇒ 比 1.0001  ⇒ base = 0.1619
```

runtime 是 `withProse(withTiers(expandIfTemplated(d)), x)`（`registries.ts:245`）——
**展開在前、AP 求值在後** ⇒ 91 條那個母體**在 runtime 根本不存在**。

⚠️ ⭐ 上一輪的註解寫「今天的漂移（−7.5%）來自**母體**」—— 那句話**對了一半**：
漂移確實來自母體，⛔ 但那是**普查自己的母體錯了**，⛔ 不是「內容變了所以公式要容忍」。
⇒ 於是把容差放寬到 1.12、把儀器門檻從 100 砍到 80 —— ⭐ **兩個動作都是在配合一個錯的分母**。
（CLAUDE.md：「讀一張表之前先問**這一欄的分母是什麼**」；「一條被放寬的閘等於沒有閘」。）

### `forgeRealCast` —— ⭐ 綠，而且**與 `base` 脫鉤了**

夾具修法：`sandbox()` 用**同一份 def** 生施法者與假人（`PreviewController.ts:281`）
⇒ 把**餵進 `triggerReflectSuccess` 的 def** 的 `baseStats.maxHealth` ×50，
它照樣走 `registerChampion` → `spawnChampion` → statPipeline，⛔ 沒有 mock 掉任何一段。
⚠️ `withScopedPreviewDefinition` 只在**有傳 `definition`** 時還原註冊表 ⇒ 我自己在 `finally` 還原。

**兩個方向都跑過**（⛔ 單邊校準的尺不算自證過）：

| 情境 | 結果 |
|---|---|
| `base = 0.1783` ＋ **新**夾具 | ✅ **綠** |
| `base = 0.1783` ＋ **舊**夾具 | ❌ **紅** —— `理想鄉的受害者位移要保存真 SimWorld 座標: expected 1 to be greater than 1` |
| `base = 0.1619`（出貨）＋ 新夾具 | ✅ 綠（19/19） |

⇒ ⭐ 上一輪那條紅燈**是真的**，它在說「這個 base 太大了」；而現在就算 base 被調到 0.1783，那條閘也不會再誤報。
⭐ 新斷言「七段全部拿得到受害者座標」讓「假人中途倒了」變成**會紅的數字**，⛔ 不是靠它剛好死不掉。

---

## 6. 突變驗證（三條，全部真的跑過）

| 突變 | 期待 | 實際 |
|---|---|---|
| `apCoeffHitsOf` 拿掉 `hitOncePerTarget` 那一行 | 紅 | ✅ 2 條紅；棘輪訊息逐字指名 **`godie-osam.r(0.04×)`**，離群 11 → 12 |
| 普查停止展開模板（`expandedForAp` → 原檔） | 紅 | ✅ 2 條紅：`expected 91 to be greater than 150` · `展開後與展開前一樣多（各 91）` |
| 夾具退回不加厚 ＋ `base=0.1783` | 紅 | ✅ `expected 1 to be greater than 1` |

---

## 7. ⚠️ 交給主 session 的三件

1. ⭐ **`content/bundle.json` 內嵌的 `base` 還是 0.1649** —— 我照禁令沒跑 `content:build`。
   ⇒ 主 session 收工時要跑一次並 `git add content/`，否則 `shippedBundleIsCurrent.test.ts` 會紅。
2. ⭐ **`docs/editor-contract/ggd-ap-coeff-before-after.md` 是 `apcoeffdiff:build` 的產物**，
   `base` 與第七維都動了 ⇒ 它過期了。⇒ `bash scripts/genrun.sh apcoeffdiff:build`（我照禁令沒跑）。
3. **兩張建議開的票**（§3 最後那張表）：`godie-e00x.e` 缺 `onBasicAttack` hook ·
   `godie-o00l.r` 的 `template.ref` 應該是放射而不是 `tpl-single-strike`。
   ⛔ 兩個都在 `content/abilities/**`（別條 lane 的柵欄），我沒有動。

### ⚠️ 一筆守則帳（建議記進 `守則犯錯.md`，`scripts/` 在我的禁令外）

**守則**：「⭐ 讀一張表之前先問這一欄的分母是什麼」／「一條被放寬的閘等於沒有閘」
**成因**：`沒有閘` —— 普查與 runtime 的母體一致性當時只是一句註解。
**一句話**：上一輪看到校準漂 −7.5%，把容差 1.05 → 1.12、儀器門檻 100 → 80 去配合它，
⛔ 而沒有問「這 91 條是不是 runtime 真的服務的那一批」（不是，runtime 是 186 條）。
⇒ 現在它是閘：`apCoefficient.test.ts` 的「母體是 **runtime 那一個**」（突變驗過）。
