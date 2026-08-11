# 90 支重製稿 57 條紅 —— 收斂成幾個模板缺陷

> 量測基礎：`cd /private/tmp/ggd-remake && npx vitest run --root packages/shared`
> 實跑結果 **Test Files 17 failed | 307 passed (324)** · **Tests 57 failed | 3361 passed (3418)**。
> 乾淨樹 `/Users/Takuro/GGD` 同一批全綠。log 在 `/private/tmp/remake-full.log`。
> ⚠️ 任務書寫「15 個紅檔」，實測是 **17 個**（多出 `bundle.test.ts` 與
> `shippedBundleIsCurrent.test.ts`，那兩支是同一個工序缺陷，見 A-2）。

---

## 1 · 一句話結論

**57 條紅 = 7 個產生器缺陷（A，35 條）+ 5 組 owner 真的改了設計（B，19 條）
+ 1 個測試夾具效應（C，2 條）+ 1 條 `damageArea` 語意誤用（**已定位**，見第 7 節，併進 A-6 修）。**

也就是說：**不是 90 支技能各有各的問題，是 7 個模板缺口被複製了 90 次。**
逐支修是 90 輪；修 7 個缺口再重跑產生器是 7 輪。

| 類 | 條數 | 佔 57 條的比例 | 收斂後的獨立缺陷數 |
|---|---:|---:|---:|
| **A · 產生器缺陷**（規格有、JSON 沒表達出來） | **35** | 61 %（35/57） | **7** |
| **B · 規格改了設計**（測試釘的是舊行為） | 19 | 33 %（19/57） | 5 |
| **C · 測試夾具假設** | 2 | 4 %（2/57） | 1 |
| **A-8 · `damageArea` 語意誤用**（形狀看起來對，但打 0 傷害） | 1 | 2 %（1/57） | 1（併 A-6） |

⚠️ 上表的「條數」= 一條 `it()`。一條紅可能同時被 A 與 B 咬到
（例：`castTimeCoverage` 的 diff 是 23 進 1 出，23 進是 B、1 出是 A-4），
歸類取**主因**（讓那條由紅轉綠所必須先修的那一個）。

⚠️ 另一個必須講清楚的**計數基礎**：A 的殺傷力被「條數」嚴重低估。
A-6（`build()` 只保留 5 個舊欄位）只讓 **1 條**測試紅，但它靜默刪掉了
**96 份文件裡的 111 個欄位值**。第二守則的失敗形態②（算出來但沒送到客戶端）
在這一批是主流，不是例外 —— **不要用紅燈數量當修復排序的唯一依據**。

---

## 2 · A 類缺陷表（最重要）

按「擋住幾條測試」由多到少。

| # | 缺陷 | 擋住幾條／影響幾支 | 產生器哪裡錯 | 怎麼修 |
|---|---|---|---|---|
| **A-1** | **沒有「變身／切換」詞彙** —— `[變身]`/`[切換]` 標籤產不出 `championForm`，也產不出 `toggle`/`whileForm`/`whileOn` | **11 條紅**（`championFormToggle` 5、`championFormVisibility` 2、`auraCarrierContent` 2、`auraIncludeSelf` 1、`championFormContent` 1）＋`windOrbAndFormBuffs` 5 條與 A-4 共同致因。**5 支技能、5 對變身**：`godie-e002.w`(20-01 風王結界)、`godie-e00s.passive`(70-00 紮根)、`godie-e00w.e`(77-03)、`godie-ewar.e`(12-03)、`godie-h02v.q`(92-01 臥草泥馬)。帶 `championForm` 的文件 **29 → 24** | `grep -c` 實測：`batch1.py` 全檔 `championForm` **只出現 1 次**（:576 手打在 79-04 那一列裡）、`whileForm` **0 次**、`toggle` **0 次**、`whileOn` **0 次**。也就是**根本沒有 tag→機制的規則**，79-04 活下來純粹因為有人手打了那一格 | 加一條規則：標籤含 `[變身]` → `{"kind":"championForm","to":"alternate","durationSec":<規格秒數>}`；含 `[切換]` → `to:"toggle"`（**切換沒有 duration**，`championFormToggle.test.ts` 有一條叫「a toggle is not a 15-second buff」就是在守這個）。⚠️ 12-03 例外，見 B-4。⚠️ 20-01 還要另外補 `toggle:` 區塊（`ability.ts:703` 已存在，今天 0 份文件在用），因為它同時要換身體與開關閘 |
| **A-2** | **產生器沒有跑 `pnpm content:build`** —— 寫完 116 份 JSON 就結束 | **7 條紅**（`shippedBundleIsCurrent` 4、`bundle` 3）。影響**全部** 96 份 ability + 20 份 champion | `batch1.py` 的 `main()`（:860-885）寫完檔就 `print()` 收工，沒有任何重建索引的步驟。測試自己把修法印出來了：`pnpm content:build && git add content/`。出貨 bundle 1,635,566 B / 重建 1,663,943 B，第一個差異在 offset 4314 | 在 `main()` 末端 `subprocess.run(["pnpm","content:build"])`。**這是 CP 值最高的一格：一行指令消 7 條紅**。⚠️ CLAUDE.md 已經記載這個坑造成過一次線上事故（2026-08-01，選人畫面全空） |
| **A-3** | **標籤沒有機器對照** —— 規格寫了標籤，effects 沒有對應機制 | **7 條紅**（`berserkOwnerSpec` 5、`laneA.innates` 2）。已確認漏掉的：`[暴走]`→`applyStatus.berserk`（`godie-e00r.passive` + `godie-e00r.ex`，各含英雄鏡像共 4 份）、`[拉扯]`→`knockback.from:"pull"`（89-04 連 knockback 都沒產出）、70-002／92-002 的「友方回魔／回血」那一半整個消失、20-01 的「關閉時風王鐵槌」沒有輸出 | repo 裡**已經有** `skill-tag-manifest.json`（`暴走` → `{"engineToken":"applyStatus.berserk","state":"allowed"}`），而 `batch1.py` **一次都沒讀它**。表格是手寫 effect dict，沒有任何一步回頭核對自己的標籤列 | ⭐ **這一格是真正的閘**：產生器最後加一個自檢 —— 逐支把 `description` 的標籤抽出來，對 `skill-tag-manifest.json` 查 engineToken，**輸出的 JSON 裡找不到那個 token 就 `assert` 失敗**。不是「helper 多一個參數」，而是「讓下一次同型漏失當場紅」 |
| **A-4** | **槽位由編號後綴推導** | **5 條紅**（`windOrbAndFormBuffs` 全滅）＋`castTimeCoverage` 的 1 出＋`fieldAdoption` 的 `whileForm` 2 個 key。影響 **2 位英雄 4 支技能**：20 Saber Q↔W（20-01 風王結界 / 20-02 感知能力）、92 草泥馬 W↔E | `batch1.py:37-38` `SUFFIX = {"01":"q","02":"w",...}` / `SLOT`，用在 `:826-827` `aid = f"{cid}.{SUFFIX[part]}"`、`slot = SLOT[part]` —— slot 是**編號的純函數**。但出貨樹的編號→槽位來自地圖本身（`OBJECTS.json` 的 `E002.hero_abilities` = `A0CM,A0DZ,...`，A0CM=20-02 排第一），全 roster 有 **28 支**不照後綴慣例擺 | 槽位改成**讀既有出貨文件**（讀 `git HEAD` 的 `/Users/Takuro/GGD/content/abilities/*.json`，⛔ 不要讀工作區，跑過一次壞的之後工作區已經被污染）。編號只當 JASS join key。⚠️ 副作用比想像大：`icon`/`vfxKey` 是用 `aid` 讀舊檔的，所以圖與特效**跟著一起對調**了（`e002.q` 現在是風王結界卻掛 `holy.pulse-sm`）；`effect.ts:1525` 把 w3a `A0DZ` 綁在 `.w`；`vfxCensus.ts:163` 有一筆 owner 待裁決紀錄指到 `godie-e002.w` |
| **A-5** | **effects 整批重寫時，規格沒點名的既有機制一併消失** | **4 條紅**（`projectileElement` 3、`invulnerableBinding` 1）。實測：會發射彈道的技能 **53 → 46 支**；帶 `invulnerable` 的 `godie-hapm.w`(52-02 蹂躪編年史)、`godie-hapm.ex`(52-002 射殺百頭) 兩支的無敵窗口不見了 | 同 A-6 的根：`build()` 用字面 dict 從零產生 `doc["effects"]`。規格沒提到 `spawnProjectile` / `invulnerable`，所以它們就不存在了。**沉默 ≠ 移除** | 產生器加一條**差異守衛**：把舊文件 effects 樹裡的 kind 集合與旗標（`spawnProjectile` / `invulnerable` / `getupTicks` / `canCrit` …）抽出來，新輸出少了任何一個就**印出來要人確認**，而不是靜默丟掉。⛔ 不要自動 deep-merge effects（新舊語意會打架） |
| **A-6** | **`build()` 重建整份文件，只救回 5 個舊欄位** | **1 條紅**（`efurKit` 的 R 打斷）＋`fieldAdoption` 6 個 key。但**靜默影響 96 份文件的 111 個欄位值**：`template` 36 / `castTimeSec` 33 / `sfxKey` 19 / `radius` 14 / `vfxLayers` 6 / `recoverySec` 2 / `interruptOn` 1 | `batch1.py:843-856` 用字面 dict 產出整份 doc，只從舊檔複製 `icon`(:848) 與 `vfxKey`/`vfx`/`hitFeel`/`telegraph`(:867-869)。⚠️ 產生器自己的註解 `:837-839` 寫著「沿用既有文件的美術綁定。重製換的是機制，不是圖示與特效」—— 它**漏了 `sfxKey`(19 份) 與 `vfxLayers`(6 份)**，按它自己的契約這就是 bug | allowlist 反寫成 **denylist**：只有規格真的重新定義的欄位才可以動。⛔ **絕對不要 deep-copy 整份 prev** —— 那會把 `template` 帶回 36 份文件，而 `expand.ts:1810-1845` 的 `mergeExpansion()` 會 `delete` 掉重製稿的 `effects/castType/radius/castTimeSec/targetsEnemies/innateKind/passive/marks` 再用舊模板展開蓋上 = **靜默回滾 36/96 支技能**，而且描述講新的、實際打舊的。⛔ `radius` 也不要救（見 B-5） |
| **A-7** | **決策點欄位在 helper 裡寫死＋逐階數列被壓成 rank-1** | **0 條紅**（只在 `fieldAdoption` 的 key 裡現身），但**三個機制在這 90 支裡不可能出現**，且數值靜默錯階 | (a) `line()`（:82-87）寫死 `"aim":"target"` → 6 支新的 `castType:"ground"`「[前方][直線]」技能全部拿到 target 瞄準，而全 repo 唯一的 ground `damageLine`（`godie-efur.e`）與 `damageLine.ts` 檔頭都指明「面前」= `facing`。(b) 9 處 knockback 全部寫死 `"from":"caster"`，`facing`/`pull` 無路可達。(c) `buff()`（:90-91）只吐 kind/modifiers/duration，**沒有 `hooks`**，所以 buff 綁定的 proc 一支都產不出來。(d) 逐階數列被壓成第一階：20-01 耗魔 30/50/70/90 只出 30、暴擊 1.4/1.6/1.8/2 只出 1.4、92-01 護甲 20/40/60/80 只出 20 | helper 開出 `aim=` / `from=` / `hooks=` 參數（`status()` 本來就吃 `**kw`，所以 berserk 那一格缺的是呼叫不是詞彙）。逐階數列：`amt(per=[...])` 已經支援，是表格那幾列填錯。⚠️ `modifier.value` 是 `z.number()`（`common.ts:145`），**不能填陣列** —— 逐階 modifier 要靠 `passive.ranks[]` 逐階展開，填陣列會被 `content:build` 的嚴格 Zod 擋下來 |

---

## 3 · B 類表（owner 規格真的改了設計）

| # | 設計改了什麼 | 影響幾條紅 | 要改哪條測試 | **改了之後玩家會怎樣** |
|---|---|---:|---|---|
| **B-1** | **23 支技能從主動改成 `[被動]`**。規格描述第一個標籤逐字就是 `[被動]`，`effects: []`、`castTimeSec` 移除。含 59-001 完全暴走（`batch1.py:198` 描述開頭 `[被動][暴走]…`，改成「HP ≤ 20% 自動觸發」）、13-002 絕。暗殺奧義（`:369`，改成 W 命中致盲目標 20% 機率摘心） | **1 條**（`castTimeCoverage` 的 23 進）＋間接讓 `berserkOwnerSpec` 6 條、`efurKit` 4 條收到 `'passive'` 而不是 `'ok'` | `castTimeCoverage.test.ts:74-104` 的 `EXEMPT_PASSIVE_ONLY` 加 22 個 id（⛔ **不含** `godie-e002.w`，那一支是 A-4 的 mis-slot，先修產生器讓它自己歸位），並照 :83-96 的規矩留 paper trail 一句話：「owner 2026-08-08 的 90 支重製規格把這些改成 [被動]」。`berserkOwnerSpec` / `efurKit` 的 EX 段落要從「按鍵 → 期待 `'ok'`」改寫成「條件達成 → 自動觸發」 | **EX 鍵按不下去了**（回傳 `'passive'`）。59 的完全暴走從「血夠低才准按」變成「血夠低自動開」，13 的暗殺奧義從主動變成 W 的機率追擊。這是 owner 明寫的設計，但**HUD 上那顆 EX 鈕會變成一顆死鈕**，要確認 UI 有把被動技畫成虛線框（#166 有做） |
| **B-2** | **揍敵客 13 全套重寫**：13-02 牙突 3→4 階、CD 16/14/12→45、拿掉暈眩與 6% 最大生命、只留「[擊退]6距離」；13-03 布陣從衝鋒走廊改成 self；13-002 換成完全不同的一支技能 | **7 條**（`efurKit` 的 8 條裡除了 R 打斷那 1 條） | `efurKit.test.ts` 的 W/E/EX 三段整段重寫。⚠️ 13-04 龍星群那一條（R 被打斷）**不要**改測試 —— 那是 A-6 把 `interruptOn:"damage"` 弄丟了 | 揍敵客從「6% 最大生命 + 暈眩」的爆發刺客變成純位移擊退。⚠️ 副作用：`knockback.getupTicks` 全 repo 的**唯一使用者**就是他，改完之後全 roster 的 14 個 knockback 一個都不會擊倒 —— 若 owner 要保留擊倒窗口，那是一個要回去問的設計題，⛔ 不要由我替他填一個值 |
| **B-3** | **呂布 80 / 佐助 45 的天生技與被動改寫**：80-01 天下無雙從「永久 +AD/-armor」改成「普攻疊 10% 攻速、1 秒不打就歸零」；45-04 哥哥從屬性被動改成「千鳥命中[燃燒]目標時引爆麒麟」；80-03 鬼神烈戟從自身圓形 AoE 改成衝刺直線 | **4 條**（`nativeFidelity` 5 條裡的 4 條） | `nativeFidelity.test.ts:216 / 251 / 338 / 419` —— 這四條釘的是 **w3x 原作保真度（task #78）**，不是重製稿。要嘛改成新規格的斷言，要嘛把這四支從保真度名單裡拿掉並記一句「owner 2026-08-08 重製取代原作」 | 呂布的招牌「永久換傷」變成需要持續輸出才維持的疊層；鬼神烈戟不再打身後的人。⚠️ 這一組直接推翻 task #78「1:1 保真」的結論，**是最該拿去跟 owner 確認的一組** —— 記憶 `ggd-fidelity-to-editable-content` 記著他非常在意逐支對照 war3 原作 |
| **B-4** | **12-03 破凰之心。空破山不再是變身技**。`batch1.py:476` 的標籤逐字是 `[被動][暴擊][機率][普攻時][AP加成]`，**一個變身/切換標籤都沒有**，連名字都從「破凰之心-徒手空破山」改成「破凰之心。空破山」 | **1 條**（`championFormVisibility` 兩條紅裡的一格；另外 4 支是 A-1） | `championFormVisibility.test.ts:87` 的 `ART_DEBT` 刪掉 `"godie-e007"`；⚠️ 同時 :165 的真空下限 `25` 要下修成 `24`（合法退場的變身從 1 對變成 2 對，測試註解自己寫「26 w3x pairs exist; 61 鳳凰蛋 deliberately unreachable」） | **天地志狼（`godie-e007`）整個第二形態變成沒有入口的孤兒內容**，而 `champions/godie-ewar.json` 的 `transform.triggerAbility`（w3a `A02W`，逐階 12/18/24/30 秒）還指著一支已經不會變身的技能。⛔ 這一格要 owner 點頭再動：是「志狼退場」還是「變身要換綁到別的槽」，兩個答案的內容處置完全相反 |
| **B-5** | **數值與範圍語意調整**：79-00 靈壓從 -25% 攻速改成 **-50%**（規格逐字「攻擊速度減半」）；`radius` 數字改成 `radiusTier` 四級距（owner 2026-08-11「原則上不寫範圍數字」，`content/config/aoe-tiers.json` 已經是這個方向） | **1 條**（`innatePassivePayloads`），另外解釋 `fieldAdoption` 的 `radius` 14 份消失 | `innatePassivePayloads.test.ts:210` 的期望值改成 -50%。⚠️ 照第二守則「不要驗數字」，正確做法是從 config／文件推導，**不要再抄一個字面值進測試** | 一護站著就讓周圍敵人攻速砍半 —— 這是一個**很大**的強化（0.5289→0.3526，實測 2/3）。⚠️ `radius`→`radiusTier` 是 owner 的方向沒錯，但 A-6 的修法**不可以**把 `radius` 一起救回來，否則等於逆著 owner 走 |

---

## 4 · C 類表（測試夾具假設）

| # | 是什麼 | 影響 | 處置 |
|---|---|---:|---|
| **C-1** | `fieldAdoption.test.ts` 的**普查是一張內容快照**。重製稿第一次把 `delayed` / `devour` / `randomArea` / `dispel.pools` / `restore` / `hooks[].abilitySlot` 這些 variant 寫進內容，它們的 reach 從 0（被 `fieldAdoption.ts:532` 的 `reach === 0 && docs === 0` 整組抑制）跳到 3–13，於是它們**沒填的 optional 子欄位**第一次跨過 `MIN_REACH = 3`（:516）而變成可回報 | **2 條紅**：`:2188` 列 35 個 key（其中 **22 個**是這個效應）、`:2217` 列 28 筆 stale exemption（其中 **26 筆**是「機制第一次被採用，豁免變成謊話」）。**沒有任何東西壞掉** | `EXEMPTIONS` 加 22 筆、刪 26 筆。⚠️ **豁免理由要寫對**：`delayed.{radius,radiusTier,side,maxTargets}` 與 `devour.` 同四格的正確理由是 **`schema-impossible`** 不是 `default-live` —— `schema/effect.ts` 的 `refineDispelShape` 規定 `shape:"single"` 填了這些會**載入時報錯**（「填了就紅」，不是「忘了填」）。⛔ 剩下的 6 個 key（`applyBuff.hooks` / `damageLine.aim=facing` / `knockback.from=facing` / `applyStatus.berserk` / `interruptOn` / `recoverySec`）**不要豁免**，它們是 A-3/A-6/A-7 的紅燈，豁免掉就是把唯一叫出聲的東西關掉 |

---

## 5 · 修復順序建議（按 CP 值）

| 順位 | 做什麼 | 成本（估） | 消掉幾條紅 | 為什麼排這裡 |
|---:|---|---|---:|---|
| **1** | **A-2**：`main()` 末端跑 `pnpm content:build` | **1 行** | **7** | 一行換 7 條，而且它是 2026-08-01 線上事故的同型缺陷。⛔ 記得產物與來源檔**都要**進版控（`shippedBundleHasTrackedSources.test.ts` 在守） |
| **2** | **A-1**：加 `[變身]`/`[切換]` → `championForm` 規則（含 20-01 的 `toggle:` 區塊） | 半天 | **11**（+ 與 A-4 合計 16） | 條數最多，而且壞的是**靈魂層**：紮根按下去不會紮根、Saber 變不了身、白木的光環載體整個消失 |
| **3** | **A-4**：槽位改成讀既有出貨文件 | 2 小時 | **5** | 修完 `windOrbAndFormBuffs` 5 條自己好，`castTimeCoverage` 的 1 出歸位，icon/vfx 對調自動修正。⚠️ 一定要在跑產生器**之前**修，否則工作區被污染後越讀越錯 |
| **4** | **A-3**：標籤 ↔ `skill-tag-manifest.json` 自檢 assert | 2–3 小時 | **7** | 它同時是**閘**（第零守則：把判準換成會擋下你的程式）。修完 `berserkOwnerSpec` 5 + `laneA` 2 直接綠，而且下一批 90 支不會再犯同型 |
| **5** | **A-6 + A-5**：allowlist → denylist ＋ effects 差異守衛 | 半天 | **5** | 紅燈只有 5 條，但這一格救回 111 個靜默掉的欄位值與 7 支彈道技能。⛔ 修法必須是**選擇性**救援，deep-copy 會回滾 36 支 |
| **6** | **A-7**：helper 開出 aim/from/hooks + 逐階數列補齊 | 2 小時 | 0 | 不消紅，但這三個機制目前在 90 支裡**不可能出現**，而且逐階數列錯階是玩家等級 4 卻拿等級 1 效果 |
| **7** | **B 群**：把 5 組設計變更整理成一張表拿給 owner 勾 | — | 19 | ⛔ **不要自己改測試** —— B-3（推翻 task #78 保真度）與 B-4（志狼變成孤兒內容）是設計裁決，不是測試維護 |
| **8** | **C-1**：`fieldAdoption` 的豁免加 22 刪 26 | 1 小時 | 2 | 純帳務。排最後是因為它**必須在 A 全部修完之後才做** —— 現在做會把 A 的訊號一起豁免掉 |

**修完 1–5（估：1.5 個工作天）預期消掉 35 條紅中的 35 條**，剩下 19 條 B + 2 條 C 是決策與帳務，不是工程。

---

## 6 · 被複驗推翻的診斷（誠實記錄）

13 筆逐支診斷裡有 **7 筆被複驗推翻**（54 %，7/13）。推翻的形態高度一致，值得記下來：

| 原診斷 | 為什麼被推翻 | 教訓 |
|---|---|---|
| `castTimeCoverage`「22 支改被動，加進 EXEMPT 名單就好」 | 實跑 diff 是 **23 進 1 出**，不是 22 進。11 + 22 = 33 與實際 33 **數量剛好相同**，所以沒跑就看起來對了，但集合不等 —— 修完 `toEqual` 仍然紅 | ⛔ **數量對不代表集合對。** 這一筆就是「用掃描代替跑測試」的教科書案例 |
| `championFormVisibility`「77-03 掉了 championForm」 | 掉的是 **5 支不是 1 支**。只補 77-03：reachable 20→21（仍 <25）、stale 仍有 3 個 → **三條斷言一條都沒修好** | 一個修完仍然紅的修法，不能算那條失敗的真因 |
| 同上「92-01 是真因」／「70-00 是真因」／「12-03 是真因」 | 三筆各自只解釋 1/4 的 stale。它們其實是**同一個模板缺口的四個實例** | ⭐ **這正是第零守則⑨要抓的東西**：四個人各自診斷出「一支技能的 bug」，合起來才看得出是**一個模板缺口** |
| `fieldAdoption`「getupTicks 是產生器缺陷」 | 規格（`batch1.py:352-355`）標籤只有 `[主動][指定][擊退]`，**沒有任何爬起來/擊倒的字**，而 `knockback` 已忠實輸出。這是 B 不是 A | 「舊行為消失」≠「產生器漏翻」。要回去讀規格原文才知道是哪一種 |
| `fieldAdoption`「這 5 個 key 都是 B，加豁免就好」 | 其中 `applyBuff.hooks` 是 A（20-01 的「開啟時」耗魔被寫成**沒有閘門**的 passive hook，玩家從開場第一刀就每刀掉 30 MP、關不掉）。加豁免＝把活的缺陷埋掉 | ⛔ 豁免只能給「真的沒有客戶」的機制，不能給「有客戶但我們寫壞了」的 |
| `fieldAdoption`「26 筆 stale，全刪」 | 實際 **28 筆**，多的 2 筆（`whileForm=any` / `=base`）方向**相反** —— 不是「被採用了」而是 **reach 掉下去**（4 份 → 2 份），是 A-4 mis-slot 的下游 | 同一條斷言裡可能混著兩個相反方向的失敗。⛔ 別只讀訊息開頭那一句 |

**共同根因只有一個：診斷者讀了檔案但沒有跑測試，或跑了但只讀第一條失敗。**
七筆推翻裡有六筆的致命傷是「我的修法套下去，那條測試還是紅的」。
判斷一個診斷是否成立，最便宜的檢查就是**在腦裡（或在 scratch 裡）把修法套上去，重算那條斷言**。

---

## 7 · 原本的 unsure —— **已定位**（主線在複驗之後獨立追出來的）

`nativeFidelity.test.ts:397`「火遁-豪火龍之術 deals its JASS damage」期望 >50、實測 **0**。

診斷 agent 排除了半徑／幾何／打斷／等級（都量過，見下），但沒讀到真因。真因是：

### ⛔ `damageArea` 不是「範圍傷害」，它是**擴散／濺射**

`packages/shared/src/sim/effects/damageArea.ts` 的檔頭逐字：

> `damageArea` — **擴散** (task #210)。傷害一個圓，圓心是**這次事件的受害者**。

而 `:50` 那一行是致命的：

```ts
// 震央那個人預設**不再吃一次** —— 他已經吃過觸發這次擴散的那一擊。
const epicentre = e.includeOrigin === true ? null : new Set(ctx.targets);
...
if (epicentre?.has(id)) continue;
```

`ground` 施法時引擎把**圈內敵人放進 `ctx.targets`** → `damageArea` 把**每一個都當成
「已經吃過那一擊的震央」跳過** → 傷害正好是 **0**。

**證明（實驗，不是推論）**：只在 `godie-edem.q` 的那個 effect 上加 `includeOrigin: true`
（那一格**只**影響「要不要跳過 `ctx.targets`」，不動半徑、不動傷害、不動幾何）
→ 那條測試**由紅轉綠**。

產生器的 `area()` 助手（`batch1.py:82-86`）一律吐 `kind: "damageArea"`。量到的：

| | 數 |
|---|---:|
| 帶 `damageArea` 的技能（文件任何位置） | **25** |
| 其中在**頂層 `effects`**（＝技能主效果，語意錯的） | **16** |
| 只在 `passive` / `hooks` 裡（＝擴散語意**正確**，⛔ 不該改） | **9** |
| `damageArea` 節點總數 | 30 |

⚠️ **但不可以盲改。** 三次全套實測：

| 做法 | 紅燈 |
|---|---:|
| 純重製稿（基準） | 57 |
| 只把火遁一支改 `kind:"damage"` | 火遁轉綠 |
| **全部** `damageArea` → `damage` | **59**（更糟） |
| 只換**頂層那 16 支** | **58**（更糟） |

→ `damage` 在 `ground` 施法下的目標解析與 `damageArea` 不同，換過去會弄壞別支。
出貨版走的是 `tpl-instant-blast` 模板，**這才是正解的形狀**（也呼應 A-6：
產生器丟掉了 36 份文件的 `template`）。

⭐ **所以這一格併進 A-6 一起修**：不要手寫 inline effects 去取代模板，
而是讓產生器在「規格沒有改變機制形狀」時**沿用既有 `template` 並只覆蓋參數**。

### 診斷 agent 已排除的（保留，都是量出來的）
- **半徑不是差異點**：乾淨版模板 `params.radius: 330 wc3u` → 展開 `radius 6.05`；重製版 inline `radius 6` + `radiusTier "大"`（大 = 6）。同量級。
- **幾何不是差異點**：`mk()`（:57-64）把單位放在 `P + (dx,dz)`，兩個受害者在 `P±1`，在半徑 6 內。
- **施法沒有被打斷**：`windUp()`（:123-130）自己 `expect(ab.cast).toBeNull()`，那一行過了。
- **不是等級 0**：同檔 `鬼神烈戟` 有 `toRank(...,1)` 也照樣 0 傷害（→ 它是同一個 `damageArea` 缺陷）。
