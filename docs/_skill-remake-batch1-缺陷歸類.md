<!-- ⛔ 這一份是「修產生器」的施工圖。⛔ 不要拿 197 條逐條去改技能 —— 那正是第零守則⑨要擋的 N 輪。 -->

# 90 支重製技能 · 缺陷歸類（施工圖）

> **配套**：原始的 197 條逐句缺口在
> [`_skill-remake-batch1-涵蓋率稽核.md`](_skill-remake-batch1-涵蓋率稽核.md)（那是**素材**）；
> 這一份是**收斂後的施工圖**（K 個產生器缺陷 + 修復順序 + owner 要裁的）。
>
> **這是 v2。** v1 的 12 個缺陷裡有 6 個是單一 agent 自產、沒被推翻過的，
> 而複驗發現**其中 5 個照字面實作會讓 `content/` 整份載入失敗** ——
> 也就是 2026-08-02 那次「退回 2 隻骨架英雄」事故的形狀，第六次。
> ⛔ **所以這一份的每一條修法都要當成「還沒驗過」對待，除非它下面寫了 REJECT/OK 的實測。**
>
> ⭐ 主 session 已獨立查證四條承重的 schema 主張（2026-08-12）：
> `hpPct` 只長在 `damage`（`damageArea`/`damageLine` 有的是 `resourcePct`）·
> `onExisting` 屬於 `shield` 不屬於 `applyBuff`（`effect.ts:1727`）·
> `applyBuff.duration` 是 `z.number()` 不吃陣列 · `status()` 本來就有 `**kw`。
> **四條全部屬實**，所以 v1 那五條修法確實會被 Zod 拒收。

---

# 90 支重製技能 · 197 條缺口的收斂（v2 · 複驗定稿）

> **這一份取代 `/private/tmp/gap-classes.md`。** v1 的 12 個缺陷裡有 6 個是單一 agent
> 自己收斂、沒有被任何人推翻過的（#1 #3 #5 #7 #8 #9，合計宣稱關掉 74 條）。這一輪把那 6 個
> 逐條對著**產生器原始碼**、**Zod schema**、**引擎實作**、**出貨 JSON** 驗過，另外派了四組人
> 補上 v1 明說「沒有候選主張」的 113 條。
>
> **量測基礎（全篇一致）**：
> · 缺口分母 **197** = `/private/tmp/gaps-all.json` 全部條目（`wrong-semantics` 82 ·
>   `missing` 46 · `half-done` 25 · `condition-lost` 23 · `rank-collapsed` 19 · `engine-gap` 2；
>   sev：high 104 · medium 56 · low 37；**涉及 82 份 ability 文件**）。
> · 出貨檔分母 **96** = `git show --name-only 4347d4dd` 觸及的 `content/abilities/*.json`
>   （清單 `/private/tmp/remade90.txt`，96 份全部存在）。
>   ⚠️ **v1 全篇寫「82 份出貨檔」，那是「有缺口的文件數」不是出貨檔數** —— 它把兩個不同的
>   分母混用了，所以 v1 所有「N/82」的百分比都建立在錯的分母上（0 仍然是 0，比例全錯）。
> · 產生器 = `tools/skill-remake/batch1.py`（`A()` 表格 90 列）。

---

## 1. 一句話

**197 條 ＝ 15 個產生器缺陷（≈113 條，57.4%）＋ 18 條 owner 裁決（9.1%）＋ 66 條逐支資料錯誤（33.5%）。**

⚠️ **這 113 裡有 54 條（27.4%）無法稽核**：#2 #4 #6 #10 #11 #12 六個缺陷 v1 從未公布成員清單，
所以它們的涵蓋數既不能去重、也不能複驗。本輪對這六個只做「機制是否真的存在」與「上界是多少」的
量測，逐條清單仍然缺席。

### ⭐ K 從 12 變成 15，變在哪

| 動作 | 數量 | 是什麼 |
|---|---:|---|
| **完全被推翻的缺陷** | **0** | 12 個的**機制**全部真實存在 |
| **修法被推翻或重寫** | **6** | #1 #3 #5 #7 #8 #9 —— 其中 **5 個照 v1 逐字實作會讓內容整份載入失敗或靜默做錯事**（見第 2 節） |
| **前提是假的（結論碰巧對）** | **3** | #3（`status()` 有 `**kw`）、#7（`applyBuff` 沒有 `onExisting`）、#8（`status()` 有 `**kw`）—— 照前提做會關掉 **0 條**還以為修完了 |
| **被拆開** | **2** | #1 拆成「屬性係數＝假缺陷，0 行產生器工作」與「effect 層百分比項＝真缺陷」；#5 拆成四個落點 |
| **被重述並擴大** | **1** | #7 從「applyBuff 五格」變成「`SOURCE_GRANT_SHAPE` 的 5 格授權欄位對這 90 支全部不可達」 |
| **新增** | **3** | **M** 時序容器（6 條）· **N** `whileForm` 形態閘（4 條）· **O** ground 技頂層 `radiusTier`（3 條） |
| **新增「只產清單、關 0 條」的閘** | **2** | 反向閘（輸出有而規格沒有，≥8 處）· 惰性技能閘（見第 8 節，⚠️ v1 與补漏都把它的證據記錯了） |
| **涵蓋數被砍最多的** | #1 **22→12**（灌 1.8×）· #3 **17→9** · #5 **14→13 但落點四分五裂** · #8 **7→5** | |
| **涵蓋數被砍最多的（支數）** | #2 **18 支 → 上界 13 支**（我掃出貨檔量的，見 §3-B） | |

---

## 2. ⛔ 最前面：五條「照 v1 做會弄垮線上內容」的修法

⚠️ v1 §5 自己記過一次同型事故（`amt-no-hp-percent-outlet` 被推翻，理由是「照字面實作 →
`.strict()` 拒收 → 內容整份載入失敗 → 退回骨架（2 隻英雄）」）。**那個形狀在存活名單裡又出現了五次。**

底下每一條的 REJECT 都是用 repo 自己的 `validateDoc("abilities", …)`
（`packages/shared/src/content/loader.ts:102`）真的跑出來的，不是讀 schema 推的。

| v1 的修法（逐字） | 會怎樣 | 為什麼 | 正確的修法 |
|---|---|---|---|
| **#1**「`dmg/area/line` 加 `hp_pct=`」 | **REJECT** `effects.N: Unrecognized key(s) in object: 'hpPct'` | `hpPct` 只長在 **`damage`**（`schema/effect.ts:1328`）。`damageArea`（:1489-1536）與 `damageLine`（:1538-1575）**沒有這一格**，而 #1 自己點名的三支受害者有兩支是 damageArea、一支是 damageLine | **只開 `res_pct=`**（→ `resourcePct`，effect.ts **:1435 / :1526 / :1571 / :2397** 四個 kind 同名同語意）。`hpPct` 一格都不要碰 —— `resourcePct{subject:"target",resource:"health"}` 完全涵蓋它，上界還是同一個常數 |
| **#3**「三個 helper 一律吃『純量或陣列』」 | **REJECT** `Expected number, received array` ×2 | `applyBuff.duration` 是 `z.number().min(0)`（effect.ts:1935，**不是** `zRankScalar`）；`modifier.value` 是 `z.number()`（common.ts:146）而 `zStatModifierFields` 是 `.strict()`（common.ts:142） | `applyBuff` 的**唯一**逐階落點是 `perRank[] = [{modifiers, duration}]` **整列覆寫**（effect.ts:2032-2043）。`M()` ⛔ **永遠是純量** |
| **#7**「`**kw` 直通，解鎖 `stackKey/maxStacks/exclusiveGroup/maxStat/onExisting` 五格」 | **REJECT** `Unrecognized key(s) in object: 'onExisting'` | **`onExisting` 不在 `applyBuff` 上** —— 它是 **`shield`** 的欄位（effect.ts:1727，配 `refineShieldStack` :789-800）。`**kw` 是無驗證直通，寫錯一格就是整份文件被拒 | 具名白名單 + **照 schema 宣告序**輸出（見 §3-G） |
| **#8**「`status()` 加 `with_=[…]` 一併吐出配套效果」 | **REJECT** `effects.0: Expected object, received array` | 「一併吐出」＝ 回傳多顆 ⇒ 產生巢狀 list，而 `build()`（:1280）與 `carry_mechanisms()`（:407）全程 `isinstance(x, dict)` 走 effects，**沒有任何一處攤平**。順帶：`:1355` 那條「[切換] 技不可以有 applyBuff/applyStatus」的 assert 也會被巢狀 list 靜默繞過 | ⛔ **不要動 `status()`** —— 它 :322-325 **本來就有 `**kw` + `o.update(kw)`**。配套效果由表格那一列寫成**兄弟節點** |
| **#5**「`area()/line()` 加 `bonus=(condition, effects)` → `victimCondition`」 | ⚠️ **Zod 收，但語意是回歸** —— 而且**沒有任何守衛會紅** | `victimCondition` 過濾的是「誰吃**基礎**傷害」（`damageArea.ts:69 selectVictims` → `struck`，:75-115 只對 `struck` 推 damageQueue），不是「誰吃額外的」。52-04 會從「對周圍造成 600/1000/1400，**帶恐懼的再追加**」變成「**只有帶恐懼的人挨打**」。同型會套在 70-04、52-02（後者條件 subject 是 **self**，語意都對不上） | 用 **`onHitTargets`**（effect.ts:1516/…），條件寫在**巢狀那顆效果自己的 `condition`** 上，`victimCondition` 留空。⚠️ 這是**唯一**一條 Zod 攔不住的 —— 要同時補一條「帶 bonus 的 damageArea，沒帶條件的敵人也要挨基礎傷害」的守衛 |

### ⚠️ 三條共通的地雷（v1 一條都沒寫）

1. **⛔ 出口必須是「具名參數」，不可以靠 `**kw` 轉發。**
   `amt()`（:226）的 `**kw` 在 :243 `o.update(kw)` —— 任何經由 `dmg/area/line` 傳進去的
   未知 kwarg 都會掉進 **`amount` 物件內部**，而 `zScaling` 是 `.strict()`（common.ts:428，
   `.strict()` 在 :454）。實測 REJECT：`amount.hpPct` · `amount.resourcePct` ·
   `amount.victimCondition` · `damage + attrRatios 兄弟鍵`。
   ⚠️ 這一格還沒被關掉：`canCrit`（effect.ts:1307/1509/1556，effect 層）今天寫
   `dmg(canCrit=True)` 就會踩爆 —— #1 只開三格具名參數，**沒有拆掉 `o.update(kw)` 這個陷阱本身**。
2. **鍵序 = fx-19 假 desync。** `abilityScaling.test.ts:284` 用
   `JSON.stringify(standalone.effects) !== JSON.stringify(ab.effects)` 比對獨立檔（生檔）
   與英雄卡內嵌版（`zChampionDoc.parse` 照 schema 序重建）。實測 `{…,stackKey,maxStat}`
   parse 後變 `{…,maxStat,stackKey}` → 判 desync。`area()` :263-268 的註解自己記載這個坑
   造過 **23 筆**假 desync。**任何新出口都要照 Zod 宣告序插入**，`o.update(kw)` 收尾一定錯。
3. **`baseOf` 只認 `flat`+`perRank`。** `abilityScaling.test.ts:73`
   `const baseOf = (a: Scaling) => (a.flat ?? 0) + Math.max(0, ...(a.perRank ?? [0]));`
   —— 看不見 `ratios`/`attrRatios`/`resourcePct`。#1（改成純比例供能）與 #6（刪掉注入的
   `flat=50`）**共用這一次修改**，⛔ 不要各改一次。不改的話 fx-15/fx-19（:261/:282）會把
   全場最痛的那一發判成「惰性技能」—— 第二守則說的「用錯誤的訊息紅」。

---

## 3. 修正後的缺陷表

「修法」欄：⚙️＝**機械式**（改 `build()`/helper 一次，**表格零列要動**）；🔌＝**開出口**
（helper 加參數，每一列仍要把規格值填進去）；📋＝**只要填表格**（出口今天就開著）。
「條」欄括號內是 v1 的原宣稱。

| # | 缺陷 | 關掉 | 支 | 產生器哪裡（**自己數的行號**） | 怎麼修 | 成本 |
|---|---|---:|---:|---|---|---|
| **A** | **反彈機制從來沒有被發出過** —— `damage.incomingPct` **0/96**；三處拿別位英雄的 `moon-combo` 當空殼 | **16** (16) | 7 | `status("moon-combo",…)` :538/:842/:965；`tag_gate.py:98` 把 moon-combo 認證成「反彈已實作」 | 🔌 `buff(mods=[], dur, hooks=[{on:"onDamageTaken", effects:[{kind:"damage", incomingPct:{perRank}}]}])`（`buff()` 的 `hooks=` 出口已開）＋ 刪 `tag_gate.py:98`。**⭐ v1 漏了兩格**：45-00 要 `incomingPct.negateOriginal`（effect.ts:1416，owner 對「這個技能是免傷」有逐字裁決）；60-04 要 `reflectedDamageSource`/`reflectedDamageType` | 中 |
| **B** | **範圍技的酬載寫成兄弟節點** —— `onHitTargets` **0/96**，酬載吃 `ctx.targets`，self 施法時那是施法者自己 | **≤13 支** (19 條/18 支) | **13** | `area()` **:260**-271 / `line()` **:273**-284 無 `onHitTargets`；`build()` 原樣攤平 | ⚙️ build() 自動折疊：同一 effects 陣列裡緊接在 `damageArea/damageLine` 之後、且沒明寫 `applyTo:"self"` 的 `applyStatus/knockback/dot` → 移進前一顆的 `onHitTargets` | **低** |
| **C** | **cast effect 的條件葉一格都沒有** —— `victimCondition` **0/96**、非 hook 的 `condition` **0/96**（hook 上的 condition 寫了 **33** 次） | **13** (14) | 11 | 表格手寫 hook dict；`build()` 對 condition 零規則 | 🔌 見下方「C 的四個落點」。⛔ **不是** `bonus=→victimCondition` | 中 |
| **D** | **effect 層級的百分比項沒有出口** —— 目標/自身最大生命%、現存生命%、現存魔力% | **12** (22) | 12 | `amt()` :226-244 有 `**kw`（:243）但落進 `amount`；`dmg()` :247 / `area()` :260 / `line()` :273 全部 `amt(**kw)` | 🔌 三個 helper 各加 `res_pct=` 具名參數 → `amount` 的**兄弟鍵** `resourcePct`。**其中 3 條是 📋**（`attrRatios`/`ratios` 今天就通，見 §5-D1a），**1 條移交 owner** | 中 |
| **E** | **缺基礎值就偷塞 `flat=50`** —— 純係數／純比例的子句寫不出來 | **12** (12) | 11 | 三處同一句話：**:250-251 / :261-262 / :278-279** `if "per" not in kw and "flat" not in kw: kw["flat"]=50` | ⚙️ 刪三行 ＋ 放寬 `abilityScaling.test.ts:73` 的 `baseOf`（與 D 共用這一次） | **低** ⚠️ 我量到 **29 顆 `flat==50` 且無 perRank / 17 份**（v1 寫 31/19），全檔手寫 `flat=50` 只有 :575 一處 |
| **F** | **`applyBuff` 的逐階唯一落點是 `perRank[]` 整列覆寫，而 `buff()` 沒有 `**kw`** | **9** (17) | 7 | `buff()` **:286-292** ⛔ 沒有 `**kw`、沒有 `o.update(kw)` | 🔌 `buff()` 加 `**kw`（⚠️ `perRank` 要排在 `hooks` **之前**），表格寫 `perRank=[{"modifiers":[…],"duration":n},…]`。⛔ `M()` 與 `buff(dur)` **維持純量** | 中（抄寫量 N×M，整列覆寫不能只寫差異） |
| **G** | **`SOURCE_GRANT_SHAPE` 的 5 格授權欄位全部不可達** —— `block`/`critStrike`/`attributes`/`damageTypeOverride`/`flight` 在 96 份出貨檔**全部 0** | **8** (8) | 8 | 同 F（`buff()` :286-292） | 🔌 具名白名單 + schema 序輸出（⛔ 不是裸 `**kw`）。⚠️ **`onExisting` 不在清單裡** | **低**（一段 helper + 8 列填值） |
| **H** | **主動技的 hook 掛在 `passive.ranks[]` 而沒有 arming** —— 「持續12秒期間普攻附加…」＝**技能學會**就永久生效 | **6** (6) | **7** | 表格手寫 passive；`build()` **:1362-1363**（v1 寫 :1363-1365）兩行原樣抄 | 🔌 ⛔ **不要做 `while_active()` marker**。把 hook 搬進 **`applyBuff.hooks`** —— `applyBuff.ts:228-233` 逐字寫「`fireHooks` 已經跳過 `expiresAtTick` 過期的 source，**the window needs no second clock**」，而 `buff()` 的 `hooks=` 出口早就開了 | 中 |
| **I** | **`area()` 的 `maxt=6` / `line()` 的 `maxt=5` 寫死在預設值** | **6** (6) | 6 | `area()` :260 / `line()` :273。⭐ **我 grep 過：`maxt=` 在全檔只出現在這兩個定義上 —— 35 個呼叫點（`area()` 28 ＋ `line()` 7）沒有一個明填** | ⚙️ 改 `maxt=None`，None 就不輸出 `maxTargets`（`spreadLimits.ts:70` 預設 20；schema `.optional()`） | **極低** |
| **J** | **`applyStatus` 這個 kind 沒有數值欄位** —— 「魔抗減半」「攻擊力降低40%」只剩一個 statusId | **5** (7) | 5 | ⛔ **落點不是 `status()`**（它 :322-325 有 `**kw`，表格已經用了六次）。落點是 schema：`applyStatus`（effect.ts:1732-1924，`.strict()`）沒有 armor/mr/ad/as | 📋 表格那一列補**兄弟 `applyBuff`/`dot`**（`M("mr","pctAdd",-0.5)` 早就出貨在 :1069-1070）。⚠️ **45-02/45-002 必須等 B 先做**：那兩列 `castType:"self"` ⇒ 現在補上去 = **-50% 攻速掛在佐助自己身上**，比現在更糟 | **低**（產生器零改動） |
| **K** | **沒有 `augment` 出口** —— 「改寫另一支技能的參數」用複製 hook 近似 | **4** (4) | 3 | ⭐ 我 grep 過：`augment` 在 batch1.py 出現 **0 次**、在 96 份出貨檔 **0 次** | 🔌 表格加 `augment={…}`，`build()` 寫進 doc、`"augment"` 加進 `SPEC_OWNED`。引擎三個呼叫點都活著 | **低** |
| **L** | **`amt()` 把 ap/ad 係數靜默夾到 1.0** | **3** (3) | 3 | :238 `min(float(ap),1.0)` · :240 ad 版（⭐ 逐字確認） | ⚙️ 刪兩個 `min()` ＋ 抬高 `abilityScaling.test.ts:38` 的 `RATIO_MAX` | **極低** ⚠️ 至少 1 條是幽靈（20-04「300% AP」的文件**零 damage 節點**，沒有 ratio 可夾） |
| **🆕 M** | **時序容器沒有閘，酬載一律攤平成同一 tick 的平行兄弟** —— B 的時間軸孿生 | **6** | 5 | 五個 helper 全部只回傳**單一 dict**，沒有一個吃巢狀 payload | ⚙️＋🔌 三條閘：`dash` 後面還有兄弟而無 `onEnd` → assert（**4/4 命中**）；`spawnProjectile.onHit` 不得為空（**7/7 命中**）；desc 有「隨後/之後/N秒後」而無 `delayed`/`onEnd` → assert。⭐ 我自己在 96 份上量的：`spawnProjectile` **7 顆 · `onHit` 7/7 全空**、`dash` **4 顆 · `onEnd` 0/4**、`delayed` 3 顆全是表格手寫 bare dict。⚠️ 巢狀**寫得出來**（`blink.onArrive`、`delayed` 都在用），所以不是「沒有出口」，是**沒有 helper、也沒有任何東西在叫** | **低** |
| **🆕 N** | **`whileForm` 形態閘沒有出口** —— 「卍解狀態下額外…」 | **4** | 3 | `build()` :1362-1363 只抄 passive，零規則 | 🔌 表格加 `while_form="alternate"` → `build()` 逐 rank `setdefault`。落點 `passive.ranks[].whileForm`（effect.ts **:4020**，enum any/base/alternate）。⭐ effect.ts:3989 的註解**逐字點名**這兩支 | **低**（一格參數 + 3 列） |
| **🆕 O** | **ground 技的 doc 頂層沒有 `radiusTier`，`ctx.targets` 退回半徑 1** | **3** | 3 | `build()` :1327-1329 只在表格明填時才寫 | ⚙️ `cast=="ground"` 而 doc 無 `radiusTier` → 從 effects 樹第一顆自發 `damageArea` 補；補不到就 assert。⭐ 量到 **10 支** ground 技頂層沒有 radius/radiusTier。⛔ **B 修不到這條** —— `onAbilityHit` 是 `abilitySystem.ts:432` 對 `targets` 發的，effect 樹碰不到 | **低** |

**K = 15，關掉 ≈113 條 / 上界 73 支。**
⚠️ 這個 113 是**逐缺陷相加後扣掉已知重複**的結果。已識別的重複至少四處，⛔ 不可以兩邊都記：
52-04（**C** 的條件 ＋ **D** 的百分比是同一條缺口）· 15-04（**F** 逐階 ＋ **H** arming ＋ **M**
幽靈投射物三處共用）· 15-02 `emfr.w`（**F** ＋ **G** ＋ **H**）· RC14 `:820`（**F** ＋ §6「手打佔位常數」同一個節點、同一個編輯）。

### C 的四個落點（v1 把它們混成一格，所以產出了那個危險的修法）

| 落點 | 條 | 修法 |
|---|---:|---|
| **C1** 範圍技的條件加成 | 5 | `area()/line()` 加 **`onhit=[...]`**（→ `onHitTargets`，具名參數），條件寫在巢狀那顆效果自己的 `condition` 上。⚠️ 與 **B** 是**同一格**：B 先落地，C1 只剩填值 |
| **C2** proc 加成被拆成第二次擲骰 | 3 | **產生器零改動**。`batch1.py:1088-1095` 手寫了兩顆各帶 `chance: c` 的 hook ⇒ 「爆擊+致盲」聯合機率 0.03×0.03 = **0.09%**（規格 3%，少 33 倍）。把第二顆的 effects 併進第一顆、刪掉重複的 `chance` |
| **C3** 「基礎效果的受害者過濾」（44-03「[詛咒]標記的周圍敵人」、44-04） | 3 | ⭐ 這才是 `victimCondition` **唯一**正確的用途。⚠️ v1 的閘正則要求括號，這三條**沒有括號** → 修完 v1 的 #5 它們照樣是綠的 |
| **C4** 條件改寫機率／權重（89-002） | 2 | **REJECT**：`weightedBranch.branches[]` 是 `.strict()`，只有 `{weight, effects}`（effect.ts:2986-2993）。正解是**兩顆互斥的 weightedBranch**，各用效果層 `condition` / `{not:…}`（`condition.ts:256` 有 `not`） |

**C 的閘要重寫**（v1 的正則抓不到最重的三條）：
`(若|當)[^，。]{0,30}(狀態|標記)` 或 `\[[^\]]+\]\s*標記的` 或 `狀態下` → 該支必須有
`victimCondition` 或**非 hook 的** `condition`。⛔ 不要求括號。

---

## 4. 修復順序（四批重排）

### 🥇 第一名仍然是 **B（兄弟酬載折疊）**，但它的體積要下修

> 唯一一個「改 `build()` 一條規則、表格一列都不用動」的缺陷。
> ⚠️ **但 v1 說「19 條 / 18 支」而它的機械規則在 96 份出貨檔上只匹配到 16 個節點 / 13 份文件。**
> 我自己掃的，那 13 份是：`e00s.e · e00w.q · edem.ex · edem.q · edem.w · emfr.e · emfr.q ·
> h00l.q · h01n.q · h01u.w · h02k.w · h02v.e · h02v.r`。**18 支是不可能的 —— 上界是 13。**
> 而且兩支被 v1 點名的成員**證明碰不到**：
> · `godie-h01n.w`（79-02）整份文件是 `damage`，**沒有 damageArea/damageLine**，
>   它的死因是 `castType:"self"` → `targets=[caster]` → `abilitySystem.ts:433` 的
>   `if (hitId !== caster)` 整圈跳過。
> · `godie-hapm.passive`（52-00）的 knockback+stun 在一條 `target:"self"` 的 hook 裡，
>   **整條 hook 沒有 shape**，正解是 `marks[].lethal.aoeEffects`。

### 修正後的四批

| 批 | 內容 | 關掉 | 為什麼這樣排 |
|---|---|---:|---|
| **B1 · 機械批**（仍然成立，而且變大了） | **B** 折疊 ＋ **E** 刪 flat=50 ＋ **I** maxt=None ＋ **L** 刪 clamp ＋ **M** 三條時序閘 ＋ **O** radiusTier 補值 | **≈43** | 六個都⚙️**零列表格編輯**。⚠️ **E 與 D 共用 `baseOf` 那一次修改**，所以 E 不能在 D 之前單獨上（會把純比例的技能判成惰性）。一起改、跑**一次** vitest、突變只驗 B |
| **B2 · 出口批** | **D** `res_pct=` ＋ **F** `buff()` `**kw`＋perRank ＋ **G** SOURCE_GRANT_SHAPE ＋ **N** `while_form=` | **≈33** | 四個都改在 `:226-292` 這 66 行。⚠️ **F 與 G 必須同一次做**：52-01 那一列是手寫 bare dict（要 `statusId=`），沒有 G 的白名單就進不了 F 的新簽章。⚠️ 四個共用「照 schema 宣告序插入」那條規則（見 §2 地雷 2） |
| **B3 · 機制批** | **A** 反彈（＋`negateOriginal`＋`reflectedDamageSource/Type`）＋ **C** 條件葉四個落點 ＋ **J** 狀態配套數值 | **≈34** | ⚠️ **J 依賴 B**（45-02/45-002/92-02 三列在 B 之前補值 = 減益掛到自己身上）。⚠️ **C1 依賴 B**（同一格 `onHitTargets`）。所以 B3 一定排在 B1 之後 |
| **B4 · 收尾** | **H** arming ＋ **K** augment | **10** | 兩個都要逐支判斷語意。⭐ H 落地會讓 `fieldAdoption.test.ts:2180` 的 `applyBuff.hooks` debt 豁免變 STALE → **那是預期的紅**，修法是刪那一筆豁免 |

⚠️ **每一批結束要跑**
`python3 tools/skill-remake/refresh_docs.py` ＋ `pnpm content:build` ＋ `git add content/ docs/`
—— 否則 `shippedBundleIsCurrent`、`shippedBundleHasTrackedSources`、`skillRemakeDocsFresh` 會紅。

### ⛔ 一個 v1 沒寫、會讓產生器**一個檔案都不寫**的硬閘

`tools/skill-remake/tag_gate.py:100` 的「層數累積」滿足式含 `{"stackKey": ANY}`，而 :159
（`godie-h01u.q`）與 :180（`godie-emfr.ex`）各有一筆豁免。誰去填 80-01 / 15-002 的 `stackKey`
而沒刪那兩列，`batch1.py:1513-1519` 會印「過期豁免」並 `sys.exit(1)`。
同理 J 要收緊 `tag_gate.py:96`（破魔的 OR 讓裸標記自己滿足自己）與 `:97`（虛弱＝任何 applyStatus）。

---

## 5. 被推翻／被拆的（誠實記錄）

### 5.1 這一輪推翻的（v1 的存活名單）

| v1 的說法 | 判決 | 理由（自己驗的） |
|---|---|---|
| **#1**「`amt()` 的數值詞彙**只有** per/flat/ap/ad」 | **一半是假的** | `batch1.py:226` 逐字 `def amt(per=None, flat=None, ap=None, ad=None, **kw):`，:243 `o.update(kw)`。實測 `dmg('physical', flat=250, attrRatios=[{'attr':'agi','coeff':5}])` → validateDoc **OK**。⇒ **「屬性係數無處可寫」是假缺陷**（D1a，3 條，77-00 敏捷*5 / 70-01 力量*3 / 60-002 100% 最大生命護盾），工作量是「在 3 列表格填值」，⛔ 不是改 helper 簽章。這跟 v1 §5 判死的 `amt-no-hp-percent-outlet` 犯**同一個錯**，只是換了個欄位活在存活名單裡 |
| **#3**「`status()` 的 `float(dur)` 表達不了逐階」 | **前提是假的** | `status()` :322-325 是 `o = {...,"duration": float(dur)}` **然後 `o.update(kw)`** —— `status("curse", 6.0, duration=[6,12,18,24])` 今天就寫得出來（`applyStatus.duration` 是 `zRankScalar`，effect.ts:1807）。退回逐支填值，2 條 |
| **#3**「`M()` 的純量 value」 | **假落點，關 0 條** | `modifier` 沒有任何逐階形狀：`value: z.number()`（common.ts:146）、物件 `.strict()`（:142）、加兄弟 `perRank` 也 REJECT |
| **#3**「手寫 `passive.ranks` 單格」＋閘「`len(passive.ranks)==maxRank`」 | **推翻（閘會誤報）** | `abilityPassives.ts:195-213` 的註解逐字說 `grantRank` 存在就是為了**免掉**「每一階各抄一份同樣的 hook」的抄寫稅；`refineUnrankedHookPerRank`（effect.ts:3847）只掛在 `item.ts:92` / `augment.ts:23`，**沒有**掛在 `ability.passive`。全樹 **13 份**文件 `ranks.length < maxRank`，這條閘會把它們全部點成紅的 |
| **#5**「括號子句**沒有出口**」 | **推翻** | 出口存在而且已經在用：`EFFECT_COMMON_SHAPE.condition` 展開在全部 34 個 kind 上，hook 的 condition 在 96 份出貨檔寫了 **33 次 / 17 份**，batch1.py 手寫 `condition` **17 次**。⭐ 我走訪了整棵樹記錄每一顆 condition 的父節點：**33 顆全部掛在帶 `on:` 的 hook 上，掛在 cast effect 上的是 0**。真相是 **33:0** —— 出口不是不存在，是三個出口只有一個被用過 |
| **#7**「五格不可達」 | **推翻兩處** | (a)「不可達」假：表格已經繞過 helper 手寫過兩顆裸 applyBuff dict（:1035-1036、:1237-1239），缺的是人體工學不是可達性。(b) 第五格 `onExisting` **屬於 shield**，是從 59-03（`{"kind":"shield"}` 裸 dict，:583）誤植過來的 |
| **#7**「80-00 一顆 buff 塞 maxStat」 | **推翻（schema 收、行為錯）** | `applyBuff.ts:141-149` 頂到上限是 `continue` = **整發不生效**。80-00 同一顆 buff 帶「攻速+1%（無上限）」與「距離+0.01（上限10）」→ 距離滿 10 之後**攻速也一起停止成長**。正解是拆兩顆 |
| **#8**「落點：`status()` 只有 statusId/duration」 | **前提是假的（結論碰巧對）** | 同上，`status()` 有 `**kw`，表格已經用了六次（`:731 moveSpeedMult=0.5`、`:753 silenced=True` …）。真正的落點是 **schema**：`applyStatus` 全 21 格沒有 armor/mr/ad/as，`.strict()` 在 :1924。**照 v1 的前提做（給 `status()` 加參數）會關掉 0 條還以為修完了** |
| **#9**「修法 = `while_active(sec, hooks)` 發 marker + 補 condition」 | **推翻（症狀修好、地方修錯）** | 引擎早就有**一個時鐘**的答案：`applyBuff.hooks`（`applyBuff.ts:228-233` 逐字「the window needs no second clock」；`hooks.ts:280` 真的跳過 `expiresAtTick`）。而且 `fieldAdoption.test.ts:2155-2190` 把 `applyBuff.hooks` 登記成 `status:"debt"`（1,959 份文件 **0 採用**，每次跑都印 KNOWN DEAD MECHANISMS 橫幅）並**逐字點名**這幾支。照 v1 做 → 症狀好了、那格專用欄位仍然 0 採用、橫幅繼續印 |
| **#9** 的閘「非 PASSIVE 槽 + desc 有『持續N秒』 + hook 無 condition」 | **推翻（57% 誤報）** | 這條閘在 96 份上命中 **14 支**，其中 **8 支是誤報**（80-01、89-01/02/03/04、92-02、92-002、52-03 —— 全是 `[被動]` + cooldown 0，它們的「持續N秒」講的是 hook **施加出去**的狀態長度）。而且**漏掉 15-02**（它有 condition，只是指向一個全 content **沒有任何人授予**的 `rage`）。正確判準：**lead tag 含「[主動]」且 `cooldown[0] > 0`** → 14 降到 6，零誤報 |
| **#2** 的成員 79-02 / 52-00 | **推翻（規則碰不到）** | 見 §4。79-02 沒有 damageArea/damageLine；52-00 的 hook 裡沒有 shape |
| **#12** 在 `missing` 那 46 條裡的體積 | **推翻（0%）** | 唯一字面符合的 20-04「另加 300% [AP]」，其文件 `effects` 只有 `applyStatus moon-combo`、**零 damage 節點**。刪 `min()` 對它是 no-op |
| **v1 §1 的量測表** | **四格錯三格** | 我在 96 份上重量：`stackKey` 1（`godie-hapm.q`＝**52-01**，v1 寫 45-01）· `whileForm` **4 節點 / 1 份**（全在 `godie-e002.w`＝**20-01**，v1 寫 1、且歸給 45-01）· `block` **0**（v1 寫 1）· `perRank` **31 節點 / 30 份**（v1 寫 23）· `includeOrigin` **28 節點 / 25 份**（v1 寫 25）· `resourcePct` 1（`godie-edem.q`＝45-01 ✔ 唯一對的一格） |
| **v1 §5** 對 `status-id-unvalidated` 的推翻 | **結論對、軸選錯** | 「28 份 status-effect 逐個對照全部存在」是對的，但**存在性抓 0、可達性抓到 1**：15-02 的 condition 讀 `rage`，而全 `content/` 授予 `rage` 的三份**沒有一份屬於 godie-emfr** ⇒ 條件永遠 false |
| **v1 §4** 的殘渣「15-002 條件寫成 `tag:"legendary"`」 | **id 抄錯** | 那是 **77-002 御雷劍**（`godie-e00w.ex`）。`godie-emfr.ex` 裡沒有 equipment 條件 |
| **v1 §4** 把 `block`/`critStrike`/`flight` 當成三個「一次性機制」 | **錯層** | 它們是**同一個 schema 形狀的三格**：`SOURCE_GRANT_SHAPE`（effect.ts:1107-1134）展開進 `applyBuff`（:2108）與 `passive.ranks[]`（:3999）。五格在 96 份出貨檔**全部 0**，因為 `buff()` 沒有 `**kw` —— 那正是 **G**。60-03「敏捷沒有落點」＝那一格 `attributes`，v1 兩邊都沒收 |

### 5.2 v1 已經推翻、這一輪維持的

`amt-clamps-and-missing-scaling`（拆）· `damage-helpers-inject-phantom-flat`（形狀對數字錯）·
`cast-time-column-is-dead` ×3 · `phantom-internal-cooldown` · `radius-tier-hand-picked` ×2 ·
`form-body-stats-out-of-scope` · `engine-kind-has-no-helper-so-approximated`（拆）·
`bare-dict-decision-fields` · `amt-no-hp-percent-outlet`（拆）。

### 5.3 這一輪考慮過但**不成立**的新候選（誠實記錄）

| 候選 | 判決 | 理由 |
|---|---|---|
| `castType-self-kills-onAbilityHit` | **降級為殘渣** | 先掃到 4 支，逐支追觸發槽位後只有 **79-02 真死**（45-04→E 是 ground、13-002→W 是 targeted、80-03→E 是 ground、15-03 是 6 槽只有 Q 是 ground 的半死）。N=1.5 |
| 零酬載 `spawnProjectile` 單獨立案 | **併進 M** | 7 顆空 `onHit` 裡 5 顆有 damageArea/damageLine 兄弟（純視覺，可接受），真的壞掉的只有 15-04 與 80-04。⚠️ 順帶記一筆：`projectile="deliver"` 這顆旋鈕 **90 列零填** |
| 「代價／自傷那一半整段缺席」 | **不是模板** | 五條的落點各不相同（`toggle.onExit`／damage 節點／第二顆 hook／weightedBranch 目標／champion 文件）。這是**語意**的分群不是**機制**的分群 |
| hook 裡的 `damageArea` 沒人決定 `includeOrigin` | **併進殘渣（但值得一格 assert）** | 缺口只有 2 條（45-04、77-02），⚠️ 但**面有 12 個節點 / 8 支全部沒填** —— `_own_area()`（:295-317）的規則是**位置**，它只走 `doc["effects"]`。「震央要不要吃」是決策點，現在由預設值靜默決定（第一守則） |
| 變身技兩個時鐘沒有交叉檢查 | **不開案** | `championForm.durationSec`（zRankScalar）與 payload 的 `applyBuff.duration`（z.number）全樹 **7 份**不一致，但只有 1 份（77-03）落在這 197 條裡 |

---

## 6. 逐支資料錯誤：**66 條 / ≈45 支（33.5%）**（v1：48 條 / 37 支）

增加的 18 條來自兩個方向：

| 來源 | 條 | 說明 |
|---|---:|---|
| **從 v1 的缺陷退回來的** | **≈15** | #3 退回 12（`status()` 逐階 2 · 手寫 passive.ranks / 裸 restore / damageArea flat 10）· #7 退回 3（80-01 ×2 與 59-03 是裸 dict / shield，`**kw` 對它們關 0 條） |
| **113 條補漏新找到、四個桶都接不住的** | **≈22** | 見下表 |
| **被新缺陷 M/N/O 吸收掉的** | −10 | 時序 6 · whileForm 4（另 O 的 3 條原本就在殘渣裡） |

### 補漏找到、v1 兩邊都沒收的（節錄，全部是我自己對著 JSON + 產生器判的）

| 條 | 為什麼接不住 |
|---|---|
| **20-01 `toggle.onExit` 酬載硬編** | `batch1.py:506` 逐字寫死 `"onExit":[{"kind":"championForm","to":"toggle"}]`，`build()` :1368-1369 只是 `doc["toggle"]=e["toggle"]`。**沒有任何出口**，N=1（全批只有 20-01 有 toggle） |
| **12-02 / 60-04 的 `restore.healthPct` 是字面值** | :898-899 與 :968-969 手寫 `{"kind":"restore","healthPct":0.05,…}`，**不經過任何 helper**。全樹 `restore.healthPct` 就這 2 個節點 ⇒ N=2，不夠格當模板。⚠️ gaps-all 對 60-04 的**診斷是錯的**（說是 `passive.ranks` 只有一筆被夾住）——`abilityPassives.ts:213` 是 `grantRank: Math.max(1, rank)`（**技能的階**），所以 `healthPct:[0.08,0.16,0.24]` 配一列 `ranks[]` 就會生效 |
| **89-01「10 倍暴擊」/ 89-03「2% 自爆」/ 20-04「300% AP」** | 整顆 damage 節點／整條風險分支**不存在**。#1 只給數值出口、#6 管的是「有 flat=50」，補不出一顆不存在的節點 |
| **15-002「將該傷害短暫加成至 [AP]」** | 需要「以吸收量為基數的增益」，`SOURCE_GRANT_SHAPE` / `applyBuff` 都沒有這個形狀 —— 真的 engine-gap |
| **13-01 `missChance=0.5` / 20-01 `critChance 1.0`＋追傷** | 憑空的決策點，規格零來源。§4 群三只收 damage 的 flat=30/flat=1 |
| **13-02 `subtractGap` 沒填 / 52-002 `launchDistance` 沒填** | 引擎預設讓「擊退6距離」實推 4–6、最大射程一格都不推。N=2 |
| **15-04 `consumeOn:"fire"` 沒有 `maxTriggers`** | `hooks.ts` 扣額度整段包在 `if (hook.maxTriggers !== undefined)` 裡 ⇒ **死旋鈕**，「施放後的下一次普攻」一個字都沒實作 |
| **59-03「護盾不會疊加」** | `shield.stackKey`/`onExisting`（GH#299 專門開的），⛔ 不經過 `buff()` |
| **80-01「若沒有繼續攻擊則歸零」** | 疊層衰減，不是條件加成 |
| **77-002 equipment 條件該是 `itemId` 不是 `tag`** | v1 §4 有列，但 id 抄成 15-002 |

⚠️ **v1 §4 的兩個數字也要改**：「16 顆 ICD」→ 我量到 **25 顆 `internalCooldown` 節點 / 15 支**；
群五逐字只列 45-00 / 92-00 / 89-03 三條，漏了 89-02 的那一顆。

---

## 7. 要 owner 裁決的：**18 條**（v1：15 條）

| # | 是什麼 | 兩層打架的是誰 | 為什麼不能自己決定 |
|---|---|---|---|
| **1–15** | **吟唱秒數**（`cast_time=` 表格寫 14 次、讀 0 次） | 第 1 層 A「吟唱 1/2/3 秒」（2026-08-08 重製規格） vs 第 1 層 B「0.3–0.6 秒，最兇封頂 0.9」（`castTimeFormula.ts` 檔頭，flat 0.6 版在 12-bot A/B 輸掉之後的產物） | 15 支裡 **14 支**連把 `CAST_CAP` 拿掉都達不到規格秒數，因為 `CD_CEILING_FRACTION=0.125 × cooldown × 0.2` 壓得更低。**owner 對 owner 的衝突**，⛔ 產生器修不掉 |
| **🆕 16** | **20-002「（現存魔力+AP）×7」** | 規格 ×7 vs `RESOURCE_PCT_RATIO_MAX = 1`（`dynamicTerms.ts:87`） | 實測 `resourcePct.perRank:[7]` → **REJECT**「scale:"ratio" 的係數上限是 1(拿到 7)」。要嘛動那個 mis-parse 護欄，要嘛把 ×7 拆進七次斬擊。**出口開了也關不掉這一條** |
| **🆕 17** | **80-04「[AP]與[AD] 提升至 150/200/250%」** | 「提升**至** 150%」＝ 1.5 倍 vs 現行 `pctAdd 1.5` ＝ +150%（2.5 倍） | **兩種讀法差一倍**，而且不管選哪個 2/3 階都沒落點 |
| **🆕 18** | **70-04「[指定]…施法距離14 …在[周圍]隨機」** | 規格自己的標籤 vs 內文 | 規格內部矛盾，不是產生器選錯 |

⭐ 照第〇·六守則：**列一張表拿給 owner**；不能停就**做成一格後台開關，高層級（新版說明）那一邊預設 on**，
且**測試只做預設啟動的那一邊**。

⚠️ 另有 5 條 `radiusTier` 選值（45-02 / 45-002 / 45-04 / 79-00 / 60-04）留在殘渣裡但**是 owner-bound**：
「取最近 `TIER_R`」的規則與 `aoeTiers.ts:2-11` 矛盾（那四級距是**原始 WC3 半徑的區間**，
大 = 300–500 ⇒ 5.50–9.17；7.79＝425 WC3 落在「大」，手填值是對的），而 owner 的 desc 自己寫了級距詞。

---

## 8. ⚠️ 兩條「關 0 條規格子句、但只有它擋得住下一批」的閘

第零守則說「把判準換成一個會擋下你的數字或程式」。這兩條不佔 K 的位置（它們不解鎖任何詞彙），
但它們是**唯一**能防止下一批 90 支再犯同型的東西。

### 8.1 反向閘：**輸出有而規格沒有** —— 15 個缺陷的閘**全部**只檢查一個方向

15 個缺陷的閘都是「規格有而輸出沒有」。**沒有一個**檢查反方向，而反方向已知 **≥8 處**：
13-01 `missChance`、20-01 `critChance`＋每擊追傷、89-02/89-03 幽靈 ICD、79-01 幽靈 damageArea＋投射物、
13-02 幽靈 `ad 0.5`、15-04 幽靈投射物、59-02 幽靈 `flat 50`。
（**E** / **I** / **L** 只是這個家族裡「產生器自己注入」的三格；**手寫的那些一格都沒被守。**）
修法：一格閘列出所有「輸出裡的數值決策在 desc 找不到來源」的節點，表格零列要動 —— 閘產生清單，作者再逐列處理。

### 8.2 惰性技能閘 —— ⚠️ **但它的落點不是 `build()`，而 v1 與补漏都記錯了證據**

我掃 96 份出貨檔，**6 支完全惰性**（`{"effects": []}` 且無 passive／marks／toggle，
全份文件解析不出任何行為）：

| 檔 | 技能 | 槽 | desc 承諾什麼 |
|---|---|---|---|
| `godie-etyr.r` | 14-04 聖夜降臨 | R | 召喚式神 + 周圍傷害 |
| `godie-huth.q` | 28-01 吃掉你 | Q | 吃掉目標、每 6 隻 +1 力量 |
| `godie-ubal.e` | 37-02 黑核晶 | E | 引爆毀滅 |
| `godie-umal.q` | 25-01 北斗懺悔拳 | Q | 三秒後造成自身力量*3 |
| `godie-zombiex.q` | 100-01 肝泥抹德 | Q | 範圍魔法傷害＋減速 |
| `godie-zombiex.e` | 100-03 咕咕嘎嘎 | E | 受傷並被黏住定身 |

**按下去 100% 什麼都不會發生。**

⛔ **但我自己驗過之後要更正一個推論**：這 6 支
**(a) 不在 `batch1.py` 的 90 列表格裡**（grep `14-04`/`28-01`/`37-02`/`25-01`/`100-01`/`100-03`
在 batch1.py 命中 **0 行**），**(b) 也不在 197 條缺口裡**（`gaps-all.json` 沒有這 6 個 id）。
⇒ 它們**不是產生器產出的**，所以「`build()` 加一條 assert」**抓不到它們**（`build()` 從沒跑過它們），
而「這 6 支證明規格→表格可以整列漏掉」這個推論**是錯的**。

**正確的落點是內容層，不是產生器**：「白名單裡的每一支非 PASSIVE 技能，必須解析出至少一個 effect kind」。
`build()` 那條 assert 仍然值得加（它擋的是**未來**的表格列），但它與這 6 支無關。
另有 2 支**有節點但零傷害 kind** 而 desc 承諾傷害：`godie-e002.r`（20-04，只有 applyStatus）、
`godie-h02k.q`（89-01，只有 applyStatus stun）—— 這兩支**在** 197 條裡，歸殘渣。

---

## 9. ⚠️ 這份報告自己的限制（不寫下來就會被當成量過的）

1. **54 條無法稽核**：#2 #4 #6 #10 #11 #12（＝ **A B E I K L**）v1 從未公布成員清單。
   本輪只量到它們的**上界**（B ≤13 支）與**機制是否存在**（E 的三處注入 ✔、I 的兩個預設值 ✔、
   K 的 `augment` 0 次 ✔、L 的兩個 `min()` ✔）。⛔ 逐條清單仍然缺席。
2. **≈113 是相加後扣掉「已識別」重複的結果**，不是去重過的集合。已識別四處重複（§3 表下），
   未識別的重複只會讓這個數字更低，⛔ 不會更高。
3. **殘渣 66 是下界。** 每一次把一個缺陷的涵蓋數砍下來（#1 22→12、#3 17→9、#8 7→5），
   被砍掉的條數多半落進殘渣。
4. 出貨面的 0/96 是**現況**不是**上界** —— `attrRatios` 在這 96 份是 0，但在全樹 696 份有 1 份
   （`godie-hart.r`），這正是「出口今天就開著、只是沒人填」的獨立證據。
