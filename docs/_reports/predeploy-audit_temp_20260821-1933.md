# 部署前全域一致性稽核（唯讀）—— 2026-08-21 19:33 CST

> ⛔ **這一份沒有動過任何檔案。** 第零守則⑧：順手發現的缺陷開票，不當場修。
> 基準版本 = 這一版的六個架構改動：三圍成長歸 0 · 每級成長 100% 由出身級距 ·
> `intToAbilityPower` **4** · 技能傷害 `× (1 + AP × 0.5%)` · 屬性額外傷害換 AP%
> （58 支/74 條，⛔ `ad` 43 處不換）· `as` 進 `appliesTo` · 五欄級距 100% ·
> 母體 **49 位可選本體** · 集合令 5 秒 opt-out。

## 這一份是對著什麼量的

| | |
|---|---|
| HEAD | `1438c1d7` |
| 工作樹 | 集合令 lane 在飛（`lobbyRally.ts` / `rally.go` / `RallyConfirmDialog.tsx` / `store.ts` / `config.ts` / `lobby-rally.json` 已改，`userIdle.ts` 未追蹤）。⭐ 我把它一起讀進來了（③ 有它的結論），⛔ 但一個位元組都沒動 |
| 跑過的東西 | `pnpm mana:audit:check`（EXIT=0）· `npx vitest run` **一次**（3 支守衛，13 條，全綠）· ⛔ 沒跑 `skills:sync`、⛔ 沒 ssh/curl 到 ggd.adms.ai |

⚠️ **與 `docs/架構同步稽核_temp_20260821-0233.md` 的關係**：那一份是今天 02:33 的，
之後又進了 AP 傷害乘法、AP 換算、隱藏名單、集合令、後台四張票。
下面每一條都標了它是**新的**還是**那一份列過而還沒收**。

---

## ① 還在用舊數字的

### 🔴 1-A　魔力回復的量測現況，**五個住處**同時說謊，而且差了一個量級 ⭐**新**

| | 中位滿魔 LV30 / LV50 / LV99 | 超過 30 秒 | 母體 |
|---|---|---|---|
| 五處**現在寫著** | **15.8 / 14.1 / 13.2 秒** | **1 / 1 / 1 隻** | 71 隻 |
| `docs/魔力回復例外清單.md`（⭐ 產生的，`mana:audit:check` **EXIT=0** ⇒ 它是最新的） | **28.7 / 30.7 / 32.5 秒** | **13 / 33 / 45 隻** | 49 位 |

五個住處：

| 檔 : 行 | 為什麼這一個最貴 |
|---|---|
| `packages/shared/src/content/schema/config.ts:5696` | 🔴 它是 **Zod `.describe()`** ⇒ 同一句話同時出現在**後台欄位說明**與 **Codex 能力契約**。⛔ 對外契約 |
| `apps/admin/src/configForms.ts:1827` | owner 調回魔時**讀的就是這一段** |
| `packages/shared/src/sim/combatEnv.ts:503–513` | `intToManaRegen: 0.21` 這個出貨值的**唯一來歷說明** |
| `packages/shared/src/sim/manaEconomy.ts:26–38` | 整條規則的檔頭表 |
| `packages/shared/src/sim/baseBonus.ts:133` | 「全 **71 隻**裡唯一碰得到熊貓的旋鈕」 |

⭐ **這不是母體 71→49 的換算誤差** —— 71 張卡是 49 本體 + 20 變身態 + 2 骨架，
拿掉重複計數不可能讓中位數翻倍、讓超標數從 1 變 45。
真正的原因是**這一版**：`maxMana` / `manaRegen` 兩條軸都在 `appliesTo` 裡，
三圍成長歸 0 之後回魔不再跟著智慧長，改由出身級距釘死 ⇒ 魔力池與回魔的比值整組換掉。

**為什麼它是這份稽核裡最嚴重的一條**：owner 2026-08-20 的原話是
「**你要量給我以後給我例外清單判斷**」。他打開後台看到「只剩 1 隻超標、建議值已達成」，
而真相是 **LV99 有 45/49 超過最糟門檻**。⛔ 這是一個會直接產出錯誤裁決的輸入。
⚠️ 附帶：`baseBonus.ts:135` 的「調後中位回魔 LV30 **124.8/s**」，量到的是 **78.4/s**。

### ⚠️ 1-B　後台正規化頁：「等級 18」與「73 位可達英雄」（前一份 2-A，**未修**）

`apps/admin/src/configForms.ts:2031`「⚠️ 這是**等級 18 的最終總值**」
`apps/admin/src/configForms.ts:2032`「錨點 = **73 位**可達英雄在**等級 18** 的中位數」

⛔ 荒謬的地方是**同一頁**：`configForms.ts:2050` 的 `referenceLevel` 欄位說明
是從 `DEFAULT_STAT_NORMALIZATION.referenceLevel` **推導**印出來的，所以它印 **99**。
owner 在同一個畫面上會同時讀到「基準 99」與「這是等級 18 的值」。

### ⚠️ 1-C　`newHeroDefaults.ts:311` 還寫「傷害五級距（最低 **1,150**）」 ⭐**新**

出貨已經是 **600**（`content/config/damage-tiers.json`，第三次重錨）。

⭐ **為什麼閘沒抓到**：`packages/shared/src/ops/supersededTierNumbers.test.ts` 的
`LIVE_DOCS` 是 **12 份具名的 `.md`**，⛔ 不掃 `.ts`。這一句住在 shipped 原始碼裡。

### ✅ 零命中的（都逐點查過）

| 查什麼 | 查了幾個點 | 結果 |
|---|---:|---|
| `intToAbilityPower` 舊值 6.5 / 10 | **24** 個引用點 | ✅ **零命中** —— 每一處要嘛寫 **4**，要嘛明確標成沿革（`1→4→6.5→10→4`）並註明哪一則被推翻 |
| 舊五級距 `1150 / 2875 / 5750 / 8625 / 11500`（＋ `13927 / 9048 / 3442 / 2792`） | 全 repo **127** 個字面命中 | ✅ 扣掉道具金幣、SHA 雜湊、w3x 匯出、SDXL tokenizer、`combatText` 的 `lifeMs`、以及**明確標成「舊版長這樣」**的敘述後，只剩 1-C 一處 |
| `71 隻` / `59 隻` | — | `59` **零命中**；`71` 見 1-A（另有 3 處是**正確地**把 71 描述成「錯的母體」，⛔ 不是缺陷） |

---

## ② 註解說謊（第三守則）

### 🔴 2-A　「115 個 / 121 個帶 ap 係數的傷害節點」—— 實測 **196** ⭐**新**

| 出處 | 寫的數字 |
|---|---:|
| `packages/shared/src/sim/combat/apDamageScaling.ts:78` | **115** |
| `packages/shared/src/content/schema/config.ts:6001` | **115** |
| `apps/admin/src/combatEnv.ts:180` | **121** |
| ⭐ 我掃 `content/abilities/*.json` 量到的 | **196**（分佈在 **171** 個檔） |

原因就是這一版：AP 換算把 74 條屬性額外傷害變成 `ap` 係數。

⚠️ `combatEnv.ts:180` 那一句是**後台欄位說明**：「調它等於同時調那 **121** 支技能」——
低報了 **62%** 的爆炸半徑，而那正是 owner 在決定 `intToAbilityPower` 時要衡量的東西。

⭐ **但那個推導的結論仍然成立，我重量過**：檔頭說「115 個裡 115 個（100%）拿掉那條係數
之後就完全沒有任何屬性相依」→ 今天是 **196 / 196，仍然 100%**。⛔ 只有母數過期，
⛔ 不要順手把結論也改掉。

### ⚠️ 2-B　**43 個被引用的 `.test.ts` 檔名在 repo 裡不存在**（大部分是舊債）

方法：掃全部 git-tracked 的 `.ts` / `.tsx`，把每一個形如 `xxx.test.ts(x)` 的引用
拿去比對 `git ls-files`。抽驗其中 20 個 → **18 個連相似檔名都沒有**（另 2 個只有同名的
**實作**檔，沒有測試檔）。

**與這一版直接相關的兩條**（前一份稽核 5-A / 5-C 列過，**未修**）：

| 檔 : 行 | 宣稱 | 真相 |
|---|---|---|
| `packages/shared/src/content/statNormalization.ts:18` | 「這是一條**不變量**（`statNormalizationInvariant.test.ts` 在守）」 | ⛔ 全 repo 沒有這個檔 |
| `statNormalization.ts:496` · `aoeTiers.ts:75` · `cooldownRules.ts:85` | 「`configDrift.test.ts` 那一族在守（第一守則的三個住處）」 | ⛔ 全 repo 沒有這個檔 |

⚠️ `statNormalization` 正是這一版重寫的東西 —— 它的檔頭指著一個不存在的守衛。

**其餘 18 個（⛔ 與這一版無關，列出來給 owner 排）**：
`mobBossRing` · `mobRingIndependence` · `legendaryItemSets` · `legendaryCritStrike` ·
`weaponTierLabels` · `itemCardWiring` · `vfxSoundKeys` · `bossIntroShipped` ·
`vfxCleanupPolicy` · `shippedReplayPolicy` · `familyArtIntegration` ·
`voxelBarcodeRender` · `reviveEffect` · `conditionRng` · `championGrowthLayers` ·
`publicFeedReaders` · `versionBadgeSurfaces` · `shellLayout`。

⭐ **查過但不是謊的**（⛔ 免得誤傷）：`familyTuning.test.ts` / `victoryCrown.test.ts` /
`stealth.contentPath.test.ts` 三處，原文自己就寫著「**那個檔案不存在**」——
它們是**已經修好的**第三守則案例，⛔ 不要再修一次。

---

## ③ 說了但不會發生（第一·五守則）

### 🔴 3-A　速度成長級距的 **`as` 半邊整個死掉**，而後台不知道 ⭐**新**

量到的：`content/champions/*.json` **71 張卡**裡，帶 `msGrowthTier` 的有 **49** 張，
帶 `asGrowthTier` 的 **0 張**。

`packages/shared/src/content/speedGrowthTiers.ts:58` 自己老實寫著：

> 「⇒ 這一支今天實際只管 **`ms`**；上面 `asGrowthTier` 的每一句話都變成**紀錄**。」

⛔ **引擎知道，後台完全不知道。** `apps/admin/src/configForms.ts:1645` 的
`SPEED_GROWTH_TIERS_SPEC` 現在同時有三個問題：

| # | 是什麼 | 位置 |
|---|---|---|
| ① | **10 格可調但不接任何東西** —— `growth.A.as.{五格}` + `growth.B.as.{五格}` 存了也不會有任何一位英雄讀到 | `configForms.ts:1700` 的 `flatMap` |
| ② | intro 寫「攻速每級成長 **49 位全部是 0.02**（一個都不差）」「49 位一律…攻速「小」…**機制上線，數值一格沒動**」 | `configForms.ts:1653` · `:1654` |
| ③ | `ladder` A/B 那一格的**整段選擇理由**建在 `as` 上（「B 極大在 LV30 讓 49 位裡 **47 位**越線 ⇒ 預設 A」）—— 那個論證今天跟 A/B 無關了 | `configForms.ts:1658` · `:1680` |

⚠️ 出貨值裡 `as` 的每級成長現在是**十出身五級距的 0.003–0.0281**（`stat-normalization`），
⛔ 不是 0.02。②那句話對 `ms` 是真的、對 `as` 是假的，而它們寫在同一行。

⭐ 順帶：`speedGrowthTiers.ts:12–13` 的檔頭表也還寫「`as` | ⛔ **49 位全部 0.02**」，
但它在 55–58 行自己更正了 ⇒ 只是排版問題，⛔ 不是第二個缺陷。

### 🔴 3-B　`config.tier-snap@1` 是一份**永遠讀不到**的 config（前一份 3-B 的後續）

前一份稽核說 `tierSnap.ts` 未追蹤。⭐ 它現在**進版控了**（2026-08-02 那種事故的形狀關掉了），
但**配置那一半沒有接上**：

| 檢查 | 結果 |
|---|---|
| `content/config/tier-snap.json` | ⛔ **不存在** |
| `config.tier-snap@1` 在 `schema/config.ts` 的 Zod union | ⛔ **0 命中** |
| 後台頁 | ⛔ 沒有 |
| 消費端 | ✅ 有 —— `tools/skill-normalize/plan.ts:484` `tierSnapFromDoc(pick("config.tier-snap@1"))` |

⇒ 那一行 `pick()` **永遠回 undefined**，`tierSnapFromDoc` 永遠退回 `DEFAULT_TIER_SNAP`。
於是 `manaCost` 五格、`damageThreshold`、`outOfRange` 模式全部是**寫死的常數**（第一守則）。
⚠️ 而 `plan.ts:805` 的說明寫著「耗魔那一欄的建議級別，現在是從 `config.tier-snap@1` 的
`manaCost` 五格**現算**的」—— 讀起來像可調，實際上改不到。

### ✅ 零命中的（逐格查過消費端）

| 查什麼 | 結果 |
|---|---|
| 集合令四個新欄位 `joinMode` / `autoJoinLeadSeconds` / `idleExcludeSeconds` / `readyOnJoin` | ✅ **零孤兒** —— 依序落在 `lobbyRally.ts:157,178` / `:144` / `:170,173` / `store.ts:1111` |
| `ap-damage-scaling` 三格 `rate` / `scope` / `apRatioMode` | ✅ 全部有消費端（`apDamageMult` · `originInScope` · `apRatiosSuppressed`） |
| `noOpModifierClaims.test.ts`（掃 items/abilities/augments/champions 的空 modifier） | ✅ **10 條全綠** |
| 前一份稽核的 🔴 3-A「級距沒人填」 | ⭐ **已經收掉**：`damageTier` **0 → 266 檔**、`cooldownTier` **0 → 418 檔** |

---

## ④ 產生器沒接進聚合閘

### ✅ 零命中 —— 查了 **40 支 `*:check`**（root + 4 個子專案）

- **28 支**在 `pnpm skills:check` 裡（含這一版新的三支：`apdmg:check` · `skillnorm:check` · `speedtiers:check`）
- 其餘 12 支全部在 `skillsSyncCoversGenerators.test.ts` 的 `EXEMPT` 裡**帶著能被反駁的理由**
- 守衛本身跑過：**EXIT=0**

### ⚠️ 4-A　但那條閘有一個**結構性弱點**：它會讀到覆蓋備份 ⭐**新**

`skillsSyncCoversGenerators.test.ts:scripts()` 用
`git ls-files "package.json" "**/package.json"` 掃**全部**被追蹤的 package.json，
而 `docs/legacy/_overwrites/overwrite_temp_20260821-175405/package.json`
（第零守則的覆蓋前自動留底）**是被追蹤的**，於是備份檔的 `scripts` 會被 merge 進去。

⭐ 今天**湊巧沒紅**：我逐鍵比過，備份與 root 的 `*:check` 集合**完全相同**（36 = 36，兩邊差集皆空）。

⛔ 但下一次有人從 root **拿掉**一支 check，那支會在備份裡活著 ⇒
閘會指著一支**已經不存在的**產生器叫，而修法是去改一個 legacy 備份檔（荒謬）。
⇒ 建議：`scripts()` 過濾掉 `docs/legacy/`。⛔ 我沒有改（不是我這一段點名的檔）。

---

## ⑤ 重複相乘／單位不對盤

### ✅ 執行期：**零命中**，逐條查過

| 查什麼 | 結果 |
|---|---|
| `apDamageMult` 的呼叫點 | ✅ 全 repo **唯一一處**：`combat/damage.ts:964`，在傷害佇列排空迴圈裡，緊貼 `combatEnv.damageDealt`。「批次 splice」保證每發封包只排空一次 |
| 反彈（`incomingPct`）會不會被乘第二次 | ✅ 不會 —— `effects/damage.ts:114` 設 `skipGlobalDamageMult`，而 AP 層與全域倍率**共用同一個旗標**（`damage.ts:963`），⛔ 刻意不開第二個 |
| 內容側有沒有節點掛了**兩條** `ap` ratio | ✅ 掃 `content/{abilities,items,augments,champions}` 共 **397** 個帶 `ap` 係數的節點 → **0 個** |
| 「反彈旗標會不會連自帶傷害也一起免除」這個理論漏洞 | ✅ **今天沒有內容踩到**：10 個帶 `incomingPct` 的節點**全部** `amount.flat = 0`（⛔ 沒有一個混了自己的傷害項） |
| 殘留的 `attrRatios` | ✅ 只剩 **1 條**（`content/items/godie-i018.json` 的 `str`）—— `apconv` 的範圍本來就是 `content/abilities/`，道具不在內。⛔ 不是漏掉 |
| 治療 / 護盾會不會被 AP 乘一次 | ✅ 不會 —— `apRatiosSuppressed` 只掛在 `casterDamageStats`（傷害葉），`effectCommon.ts:74–75` 明文寫了為什麼只有傷害葉 |
| 吞噬 `devour.ts:120` 的 `skipGlobalDamageMult: true` | ✅ 正確 —— 那一發的 `amount` 是「目標當下的血 + 盾 + 1」的**致死量**，本來就不該被任何倍率乘。⚠️ 註解只用 `combatEnv.damageDealt` 論證，共用旗標之後也連帶排除 AP 層，⭐ 結論仍然對，只是理由沒寫全 |

### 🔴 5-A　但**回頭那條路是空的**：`apRatioMode: "replace"` 會讓 15 支技能傷害歸 0 ⭐**新**

出貨文件把 `"replace"` 寫成「為了**回頭**（owner 若判定雙重計算太肥）」。
量到的：`content/abilities/` 的 196 個帶 `ap` 係數的傷害節點裡，
有 **27 個（分佈在 15 支技能）連 `flat` / `perRank` / `damageTier` 都沒有** ——
整發傷害就是那條 `ap` 係數。切成 `"replace"` 之後 `casterDamageStats` 把 AP 摀成 0
⇒ 這 27 個節點**逐位元變成 0 傷害**，⛔ 不是「變小」。

```
godie-ewar.e ×4 · godie-h00l.e ×4 · godie-h02k.r ×3 · godie-h02v.r ×3
godie-h01n.e ×2 · godie-h01n.w ×2 · godie-e00w.ex · godie-e00w.w
godie-e002.ex · godie-e002.r · godie-emns.r · godie-h01u.e
godie-h02v.ex · godie-hapm.ex · godie-hart.r（amountPerTick）
```

⚠️ **這一條刻意不要求寫測試**：第〇·六守則說「測試只做預設啟動的那一邊」，
所以⛔ 沒有任何守衛會紅是**對的**。要修的是那句**描述** ——
「一鍵 rollback」在第一·五守則下就是一句說了不會發生的話，
正解是把 `apDamageScaling.ts:80–90` 與 admin 說明改成「切過去這 15 支要一起補基礎值」。

---

## ⑥ ⭐ 分級：哪幾條**現在就在造成錯誤數字**

⛔ **先講最重要的一句：沒有任何一條在改變比賽裡真的算出來的傷害或屬性。**
引擎那一側（傷害佇列、AP 乘法、反彈旗標、內容係數）逐條查下來是**乾淨的**。
下面的 🔴 全部是**決策輸入**與**可調面**的錯，⛔ 不是玩家那一場的錯。

| 排序 | 條目 | 為什麼是 🔴 | 修起來多大 |
|---:|---|---|---|
| **1** | **1-A 魔力量測（五處）** | owner 打開後台會讀到「只剩 1 隻超標、建議值已達成」，真相是 **LV99 45/49 超標**。他 2026-08-20 明說要「量給我以後給我例外清單判斷」⇒ 這是**直接產出錯誤裁決**的輸入。⭐ 其中一處是 Zod `.describe()` ⇒ **對外契約** | 小（5 處字串；⭐ 正解是讓那一段從 `mana:audit` 的產物**推導**，⛔ 不要再手抄第六次） |
| **2** | **3-A speed-growth 的 `as` 半邊** | 後台 **10 格**存得起來、印得出來、`content:build` 綠，而**一位英雄都讀不到**。intro 三句話對 `as` 是假的 | 中（要決定：拔掉 `as` 那一軸，還是留著並把說明改成「今天只管 ms」） |
| **3** | **5-A `replace` rollback 讓 15 支技能歸 0** | 出貨文件把它寫成「一鍵回頭」，實際會靜默刪掉 27 個傷害節點。⛔ 沒有守衛會紅（而那是刻意的） | 小（改描述）／中（若要真的讓它可用，那 27 個節點要補基礎值 ⇒ 需要 owner 決定數字） |
| **4** | **3-B `config.tier-snap@1` 讀不到** | 一整份 config 的 schema 標籤沒進 Zod、沒有出貨檔、沒有後台頁，而 shipped 工具真的去 `pick()` 它 ⇒ 六個旋鈕是寫死的常數（第一守則） | 中（補 Zod union + `content/config/tier-snap.json` + 後台頁；或把 `plan.ts:805` 那句改成「這是常數」） |
| **5** | **2-A 115/121 vs 196** | 後台欄位說明低報 `intToAbilityPower` 爆炸半徑 **62%** —— 而那正是 owner 這一版剛裁決過兩次的旋鈕 | 小（⭐ 讓它從內容**現算**，⛔ 不要再寫第四個字面值） |

### 🟡 其餘（散文／指路，⛔ 不影響任何一場比賽）

`1-B`（後台「等級 18 / 73 位」，同一頁另一格印 99）·
`1-C`（`newHeroDefaults.ts:311` 的 1,150）·
`2-B`（43 個死掉的 `.test.ts` 引用，其中 2 個指著 `statNormalization` —— 這一版重寫的東西）·
`4-A`（聚合閘會讀到 legacy 備份的 package.json，今天湊巧沒紅）。

---

## ⭐ 一句話結論

**引擎是乾淨的，說明書不是。** 這一版把成長曲線整個換掉之後，
沒有任何一條**手抄的量測**跟著動 —— 而「手抄的量測」正是 owner 用來下一次裁決的輸入。
五條 🔴 裡有四條的正解是同一件事：**讓那段文字從產生器的產物推導，⛔ 不要再抄第六次。**
