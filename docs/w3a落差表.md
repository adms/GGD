# w3a 落差表 —— 每一筆都要指得出**哪一層贏了**

> ⛔ **這一份是產生的,不可以手改。** 重生成 `pnpm w3a:build`;閘 `pnpm w3a:check`。
> 裁決住 `tools/w3a-translate/gap-ledger.json`(**人編的**),守衛住
> `packages/shared/src/ops/w3aTranslationGaps.test.ts`。

第〇·六守則的優先序階梯要求:一筆落差要嘛指得出**哪一層贏了**,要嘛它是 ⚫ **無主**。
⛔ 兩種東西長得一樣就會被混用 —— 所以這一份把它們分開列。

接得上的技能對:**452** 組。

## 1. 逐軸總表

| 軸 | 相同 | 有主(指得出哪一層) | ⚫ 無主 | w3a 沒這一格 |
|---|--:|--:|--:|--:|
| `scaling` | 0 | 6 | 64 | 0 |
| `cooldown` | 114 | 154 | 12 | 172 |
| `mana` | 26 | 166 | 79 | 181 |
| `range` | 7 | 98 | 31 | 316 |
| `radius` | 4 | 62 | 85 | 301 |
| `duration` | 13 | 0 | 216 | 223 |

## 2. 裁決帳本(逐列 —— ⭐ 棘輪:`max` 只准變小)

| 落差類別 | 幾筆 | 哪一層贏了 | 理由 |
|---|--:|---|---|
| `scaling:missing:gold` | 1 | engine-vocab-missing | w3x 用**現有金錢**當分母。`Scaling` 的三種讀法(`ratios` 讀 Stat、`attrRatios` 讀三圍、`resourcePct` 讀 health/mana)都碰不到經濟狀態。 |
| `scaling:missing:heroLevel` | 5 | engine-vocab-missing | w3x 用**英雄等級**當分母(例 45-03 千鳥「英雄等級*20+400」)。`Stat` 列舉沒有等級,`attrRatios` 只收三圍,`resourcePct` 只讀 health/mana ⇒ ⛔ 三個住處都寫不出來。owner:「JSON 沒支援的標籤或邏輯則**去實作**」。 |
| `scaling:translatable:agi` | 23 | ⚫無主 | 同 `str`,分母是**敏捷**。`attrRatios` 的 attr 列舉收 agi。 |
| `scaling:translatable:int` | 15 | ⚫無主 | 同 `str`,分母是**智慧**。`attrRatios` 的 attr 列舉收 int。 |
| `scaling:translatable:maxMana` | 1 | ⚫無主 | 20-03 約束與勝利之劍:w3x ubertip 逐字「魔力*0.4」,出貨是 `ap×1.0`。`Stat.MaxMana` **本來就在詞彙裡** ⇒ 翻得過去,只是沒人翻。 |
| `scaling:translatable:str` | 25 | ⚫無主 | w3x 的傷害公式以**力量**為分母,而出貨側用別的軸(多半是 ap)或完全沒有軸。⭐ `Scaling.attrRatios[{attr:"str"}]` **今天就寫得出來**(七個消費端都傳 `casterAttrs`)⇒ 這不是缺口,是**沒人翻**。⛔ 而換掉一條 scaling 軸引用不到 owner 的任何一句原話。 |
| `cooldown:ggd-zero` | 12 | ⚫無主 | 出貨側冷卻是 0 而且**沒有** `cooldownTier` ⇒ 級距表沒有覆蓋它,那個 0 是逐支手填的自由值。⚠️ 其中 5 支是 EX、4 支是天生技(結構上可能真的不吃冷卻),⛔ 但另外 2 支是 W/E —— 混在一起就指不出哪一層贏了。 |
| `cooldown:tier` | 154 | GGD-tier-table | owner 2026-08-19 裁定冷卻走五級距(表住 `content/config/cooldown-tiers.json`,單體/範圍兩條曲線)。這一支出貨文件帶著 `cooldownTier` ⇒ 它的秒數是**級距解出來的**,原作值被**刻意取代**。⛔ 這裡不重打級距數字(那會變成第四個住處)。 |
| `mana:ggd-zero` | 79 | ⚫無主 | 出貨魔耗 0 且**沒有** `manaCostTier`,而 w3a 那一支是要錢的。⚠️ 只有 17 支是天生技 —— 另外 **59 支是 Q/W/E/R/EX 主動技**,一個免費的主動技不是級距裁決的結果,是一個沒有出處的數字。 |
| `mana:tier` | 166 | GGD-tier-table | owner 的五級距魔耗表(`content/config/mana-tiers.json`)取代原作值;出貨文件帶著 `manaCostTier` ⇒ 有主。 |
| `range:ggd-zero` | 31 | ⚫無主 | 出貨 `range` 是 0(＝近身/自身)而 w3a 給了施法距離,且**沒有** `rangeTier`。⚠️ 8 支天生技合理,⛔ 但 7 支 R 與 7 支 EX 是主動指向技 —— 0 距離的指向技在場上是放不出去的形狀。 ⭐ GH#840/#734（2026-08-31）—— 65-04 天譴的 `castType` 從 `dash` 改成 `self`（JASS `Trig_MoriyaBYEBYE` 逐行**0 個位移呼叫**），⇒ `range` 從 8 變 **0**：`self` 的圓心就是施法者，⛔ 宣告一段到不了的距離會被 #268 那條閘擋下。⭐ 與 GH#635 **同一個形狀**：一個改動同時讓 `range:tier` 少一筆、`range:ggd-zero` 多一筆 —— ⛔ 不是兩次獨立漂移。 |
| `range:tier` | 98 | GGD-tier-table | owner 2026-08-19 的射程級距(`content/config/range-tiers.json`)取代原作的 WC3 世界單位;出貨文件帶著 `rangeTier`。 ⭐ GH#840/#734（2026-08-31）—— 65-04 天譴的 `castType` 從 `dash` 改成 `self`（JASS `Trig_MoriyaBYEBYE` 逐行**0 個位移呼叫**），⇒ `range` 從 8 變 **0**：`self` 的圓心就是施法者，⛔ 宣告一段到不了的距離會被 #268 那條閘擋下。⭐ 與 GH#635 **同一個形狀**：一個改動同時讓 `range:tier` 少一筆、`range:ggd-zero` 多一筆 —— ⛔ 不是兩次獨立漂移。 |
| `radius:free-number` | 5 | ⚫無主 | 出貨半徑是一個字面數字而**沒有** `radiusTier` ⇒ 它繞過了 owner 的「不寫範圍數字」裁決,而繞過的理由沒有寫在任何地方。 |
| `radius:ggd-absent` | 80 | ⚫無主 | w3a 有 `area`(範圍技)而出貨側**整棵效果樹找不到任何 radius**。⚠️ 這一批混了兩種:重製時刻意改成單體的,以及**漏接範圍**的 —— 而兩種在 JSON 裡長得一模一樣。⭐ 2026-08-28 −1：同上一列的另一半（nbbc.r 從『沒有半徑』變成『有半徑』）。 ⭐ 2026-09-02 —— `godie-etyr.r`（14-04 聖夜降臨）的 `damageArea` **在此之前被模板展開刪掉了**（`mergeExpansion` 只保留 `spawnModelFx`），⇒ 掃描器看到的是「GGD 沒有這一軸」。修好之後那一支從 `ggd-absent` **移到**這一格。⛔ 這不是漂移，是**同一支在兩格之間搬家**：兩個 `ggd-absent` 各 −3、兩個各 +3，總筆數 978 → 977。 |
| `radius:tier` | 62 | GGD-tier-table | owner 2026-08-11「原則上不寫範圍數字」⇒ AOE 走級距(`content/config/aoe-tiers.json`);出貨文件帶著 `radiusTier`。⭐ 2026-08-28 +1：08-04 阿邦快速劍X 變身態（godie-nbbc.r）拿掉空模板殼之後，落點 AoE（j:28918 `GetUnitsInRangeOfLocAll(250)` = 4.58→級距 4.5「小」）第一次進到出貨形狀 ——⛔ 不是漂移，是它本來就該有而以前被 `tpl-single-strike` 蓋住了。 ⭐ 2026-09-02 —— `godie-etyr.r`（14-04 聖夜降臨）的 `damageArea` **在此之前被模板展開刪掉了**（`mergeExpansion` 只保留 `spawnModelFx`），⇒ 掃描器看到的是「GGD 沒有這一軸」。修好之後那一支從 `ggd-absent` **移到**這一格。⛔ 這不是漂移，是**同一支在兩格之間搬家**：兩個 `ggd-absent` 各 −3、兩個各 +3，總筆數 978 → 977。 |
| `duration:free-number` | 38 | ⚫無主 | 出貨的 `durationSec` 與 w3a 的持續秒數不同,而**五級距裡根本沒有 duration 這一軸**(damage/cooldown/mana/range/aoe 五張表都沒有它),`config/skill-normalize.json` 的決策點也不含它 ⇒ 每一支的秒數都是逐支手填的自由數字。⭐ 2026-08-28 −4：`_walk_numbers` 開始跳過 cue kinds —— `screenShake.durationSec`（震多久）以前被讀成**技能的持續時間**。⛔ 那 4 筆從來不是技能時長。 ⭐ 2026-09-02 —— `godie-etyr.r`（14-04 聖夜降臨）的 `damageArea` **在此之前被模板展開刪掉了**（`mergeExpansion` 只保留 `spawnModelFx`），⇒ 掃描器看到的是「GGD 沒有這一軸」。修好之後那一支從 `ggd-absent` **移到**這一格。⛔ 這不是漂移，是**同一支在兩格之間搬家**：兩個 `ggd-absent` 各 −3、兩個各 +3，總筆數 978 → 977。 |
| `duration:ggd-absent` | 178 | ⚫無主 | w3a 宣告了持續時間而出貨側**整棵效果樹沒有任何 durationSec**。⚠️ 同 `radius:ggd-absent`:混了「重製成瞬發」與「漏接持續效果」兩種,而 JSON 裡分不出來。⭐ 另外 w3a 還有 `hero_duration`(對英雄減時)這一格,GGD **一格都沒有** —— 那是一個缺的機制,不只是漏翻。⚠️ 2026-08-28 +4：上一列的鏡像。⭐ 這 4 支**本來就沒有**時長，只是以前被 cue 的 `durationSec` 冒名頂替 ⇒ 195 是**低報**，199 才是真的缺口。 ⭐ 2026-09-02 —— `godie-etyr.r`（14-04 聖夜降臨）的 `damageArea` **在此之前被模板展開刪掉了**（`mergeExpansion` 只保留 `spawnModelFx`），⇒ 掃描器看到的是「GGD 沒有這一軸」。修好之後那一支從 `ggd-absent` **移到**這一格。⛔ 這不是漂移，是**同一支在兩格之間搬家**：兩個 `ggd-absent` 各 −3、兩個各 +3，總筆數 978 → 977。 |

⚠️ 一列的 `max` 是**上一次量到的數字**。修好一筆 ⇒ 這一份重生成 ⇒ 守衛要求把 `max` 調降;
⛔ 沒有人可以靜靜地讓它變大。

## 3. ⚫ 無主的落差(逐筆)

⛔ 這一節**不是提案**。它只是把「w3x 說 A、我們出貨 B、而沒有任何一層贏」擺到同一列上 ——
第一守則:出貨數值的每一次改動要能引用到 owner 的一句原話,而這裡一句都引不到。

共 **487** 筆。

| # | 軸 | 類別 | w3a | 技能 | GGD id | w3x | GGD |
|--:|---|---|---|---|---|---|---|
| 1 | `scaling` | `translatable:agi` | `A04X` | 12-04 龍氣爆發 | `godie-e007.r` | attr:agi×5.0 | stat:ap×1.3 |
| 2 | `scaling` | `translatable:agi` | `A0JG` | 77-03 GLADIARIA ALAT | `godie-e00w.e` | attr:agi×1.0 | （無） |
| 3 | `scaling` | `translatable:agi` | `A0JD` | 77-00 浮雲-旋一閃 | `godie-e00w.passive` | attr:agi×5.0 | stat:ap×1.3 |
| 4 | `scaling` | `translatable:agi` | `A0JE` | 77-04 真-雷光劍 | `godie-e00w.r` | attr:agi×4.0 | stat:ad×0.6 |
| 5 | `scaling` | `translatable:agi` | `A0UA` | 45-002 雷遁 - 麒麟 | `godie-edem.ex` | attr:agi×5.0 | （無） |
| 6 | `scaling` | `translatable:agi` | `A0M7` | 45-01 火遁-豪火龍之術 | `godie-edem.q` | attr:agi×2.0 | （無） |
| 7 | `scaling` | `translatable:agi` | `A0U7` | 45-04 哥哥 | `godie-edem.r` | attr:agi×2.0 | stat:ap×3.0 |
| 8 | `scaling` | `translatable:agi` | `A0SA` | 44-002 交換筆記本 | `godie-emns.ex` | attr:agi×3.0 | （無） |
| 9 | `scaling` | `translatable:agi` | `A0TU` | 89-002 俄羅斯輪盤 | `godie-h02k.ex` | attr:agi×3.0 | （無） |
| 10 | `scaling` | `translatable:agi` | `A0VB` | 90-002 換~身~! | `godie-h02r.ex` | attr:agi×3.0 | （無） |
| 11 | `scaling` | `translatable:agi` | `A0SM` | 48-002 騎英之疆繩MAX | `godie-hvsh.ex` | attr:agi×6.0 | （無） |
| 12 | `scaling` | `translatable:agi` | `A01C` | 48-04 騎英之疆繩MAX | `godie-hvsh.r` | attr:agi×3.0 | （無） |
| 13 | `scaling` | `translatable:agi` | `A0RQ` | 48-04 騎英之疆繩 | `godie-hvsh.r` | attr:agi×3.0 | （無） |
| 14 | `scaling` | `translatable:agi` | `A0S6` | 02-002 神通眼 | `godie-hvwd.ex` | attr:agi×3.0 | stat:ap×0.7 |
| 15 | `scaling` | `translatable:agi` | `A0EZ` | 08-04 阿邦快速劍X | `godie-n01c.r` | attr:agi×7.0 | stat:ap×1.8 |
| 16 | `scaling` | `translatable:agi` | `A0DO` | 39-03 無名神風流-蛟龍 | `godie-u00h.e` | attr:agi×3.0 | stat:ap×0.8 |
| 17 | `scaling` | `translatable:agi` | `A0DJ` | 39-04 祕奧義．金色的神風 | `godie-u00h.r` | attr:agi×1.0 | （無） |
| 18 | `scaling` | `translatable:agi` | `A0S3` | 74-002 超新星 | `godie-u00j.ex` | attr:agi×3.0 | （無） |
| 19 | `scaling` | `translatable:agi` | `A0ET` | 74-02 八刀一閃 | `godie-u00j.w` | attr:agi×3.0 | stat:ap×0.8 |
| 20 | `scaling` | `translatable:agi` | `A0IR` | 76-00 二檔 | `godie-u00n.passive` | attr:agi×2.0 | （無） |
| 21 | `scaling` | `translatable:agi` | `A0OH` | 38-00 邪眼全開 | `godie-u010.passive` | attr:agi×2.0 | （無） |
| 22 | `scaling` | `translatable:agi` | `A0OG` | 38-01 邪王炎殺劍 | `godie-u010.q` | attr:agi×1.0 | stat:ap×0.3 |
| 23 | `scaling` | `translatable:agi` | `A09H` | 38-02 邪王炎殺煉獄焦 | `godie-u010.w` | attr:agi×2.0 | stat:ap×0.5 |
| 24 | `scaling` | `translatable:int` | `A10H` | 13-002 化龍 | `godie-efur.ex` | attr:int×2.0 | （無） |
| 25 | `scaling` | `translatable:int` | `A052` | 15-03 雷電風暴 | `godie-emfr.e` | attr:int×4.0 | stat:ap×0.4 |
| 26 | `scaling` | `translatable:int` | `A053` | 15-04 千之雷 | `godie-emfr.r` | attr:int×5.0 | stat:ap×0.7 |
| 27 | `scaling` | `translatable:int` | `A0JM` | 14-02 式神炸裂 | `godie-etyr.e` | attr:int×3.0 | （無） |
| 28 | `scaling` | `translatable:int` | `A0JL` | 14-01 東風繪扇、南風末廣 | `godie-etyr.q` | attr:int×2.0 | stat:ap×0.45 |
| 29 | `scaling` | `translatable:int` | `A0JZ` | 14-04 AKT戰隊 | `godie-etyr.r` | attr:int×4.0 | （無） |
| 30 | `scaling` | `translatable:int` | `A04R` | 04-03 龍破斬 | `godie-h020.e` | attr:int×7.0 | stat:ap×1.8 |
| 31 | `scaling` | `translatable:int` | `A0OE` | 04-002 惡夢魔王的碎片 | `godie-h020.ex` | attr:int×7.0 | （無） |
| 32 | `scaling` | `translatable:int` | `A07F` | 04-04 神滅斬 | `godie-h020.r` | attr:int×5.0 | stat:ap×1.3 |
| 33 | `scaling` | `translatable:int` | `A05D` | 42-04 世界終結 | `godie-n003.r` | attr:int×4.0 | stat:ap×1.0 |
| 34 | `scaling` | `translatable:int` | `A0K1` | 53-01 獸王牙操彈 | `godie-o00l.q` | attr:int×3.0 | stat:ap×0.8 |
| 35 | `scaling` | `translatable:int` | `A0DT` | 53-04 暴爆咒 | `godie-o00l.r` | attr:int×2.0 | （無） |
| 36 | `scaling` | `translatable:int` | `A0UE` | 53-04 暴爆咒 | `godie-o00l.r` | attr:int×1.0 | （無） |
| 37 | `scaling` | `translatable:int` | `A11F` | 99-002 把你給MikuMiku掉 | `godie-o02p.ex` | attr:int×6.0 | （無） |
| 38 | `scaling` | `translatable:int` | `A0CO` | 72-04 黑化 | `godie-ogld.r` | attr:int×9.0 | （無） |
| 39 | `scaling` | `translatable:maxMana` | `A0D5` | 20-03 約束與勝利之劍 | `godie-e002.e` | stat:maxMana×0.4 | stat:ap×1.0 |
| 40 | `scaling` | `translatable:str` | `A0DZ` | 20-01 風王結界 | `godie-e002.w` | attr:str×1.0 | stat:ad×0.5 |
| 41 | `scaling` | `translatable:str` | `A0O6` | 70-00 紮根 | `godie-e00s.passive` | attr:str×0.8 | （無） |
| 42 | `scaling` | `translatable:str` | `A0GP` | 70-01 伸卡球 | `godie-e00s.q` | attr:str×3.0 | stat:ap×0.8 |
| 43 | `scaling` | `translatable:str` | `A0UJ` | 70-01 伸卡球 | `godie-e00s.q` | attr:str×3.0 | stat:ap×0.8 |
| 44 | `scaling` | `translatable:str` | `A0RX` | 79-01 瞬步 | `godie-h01n.q` | attr:str×2.0 | （無） |
| 45 | `scaling` | `translatable:str` | `A0LK` | 79-02 斬擊 | `godie-h01n.w` | attr:str×2.0 | stat:ap×0.5 |
| 46 | `scaling` | `translatable:str` | `A0N0` | 80-03 鬼神烈戟 | `godie-h01u.e` | attr:str×3.0 | stat:ap×0.3 |
| 47 | `scaling` | `translatable:str` | `A0U5` | 52-002 射殺百頭 | `godie-hapm.ex` | attr:str×9.0 | stat:ap×1.0 |
| 48 | `scaling` | `translatable:str` | `AOr3` | 52-00 十二道試煉 | `godie-hapm.passive` | attr:str×5.0 | （無） |
| 49 | `scaling` | `translatable:str` | `A077` | 01-04 超究武神霸斬 | `godie-hart.r` | attr:str×1.0 | stat:ap×0.3 |
| 50 | `scaling` | `translatable:str` | `A0B1` | 01-04r 超究武神霸斬 - 改 | `godie-hart.r` | attr:str×4.5 | stat:ap×0.3 |
| 51 | `scaling` | `translatable:str` | `A0G3` | 07-03 列、在、前 | `godie-hpb1.e` | attr:str×2.0 | stat:ap×0.5, stat:ad×1.25 |
| 52 | `scaling` | `translatable:str` | `A0G2` | 07-02 者、皆、陣 | `godie-hpb1.w` | attr:str×1.0 | stat:ap×0.3 |
| 53 | `scaling` | `translatable:str` | `A0O1` | 09-002 十倍龜派氣功 | `godie-o00x.ex` | attr:str×10.0 | （無） |
| 54 | `scaling` | `translatable:str` | `A03S` | 09-04 龜派氣功 | `godie-o00x.r` | attr:str×2.0 | stat:ap×0.5 |
| 55 | `scaling` | `translatable:str` | `A0MV` | 34-002 冥道殘月破 | `godie-osam.ex` | attr:str×2.0 | （無） |
| 56 | `scaling` | `translatable:str` | `A0F1` | 74-01 魔連斬 | `godie-u00j.q` | attr:str×1.0 | stat:ad×0.5 |
| 57 | `scaling` | `translatable:str` | `A0HV` | 25-03 北斗百裂拳 | `godie-u00l.e` | attr:str×2.0 | stat:ap×0.5 |
| 58 | `scaling` | `translatable:str` | `A0AF` | 25-01 北斗懺悔拳 | `godie-u00l.q` | attr:str×3.0 | （無） |
| 59 | `scaling` | `translatable:str` | `A0IQ` | 76-04 三檔 | `godie-u00n.r` | attr:str×3.0 | stat:ap×0.5 |
| 60 | `scaling` | `translatable:str` | `A0RZ` | 76-04 三檔.巨人迴旋彈 | `godie-u00n.r` | attr:str×2.0 | stat:ap×0.5 |
| 61 | `scaling` | `translatable:str` | `A0L6` | 78-04 死亡噴射肘擊 | `godie-u00v.r` | attr:str×3.0 | stat:ap×0.8 |
| 62 | `scaling` | `translatable:str` | `A06P` | 11-03 鬼氣九刀流-阿修羅壹霧銀 | `godie-u01u.e` | attr:str×2.0 | stat:ap×0.5 |
| 63 | `scaling` | `translatable:str` | `A0MQ` | 11-04 三千世界 | `godie-u01u.r` | attr:str×3.0 | （無） |
| 64 | `scaling` | `translatable:str` | `A08Y` | 06-00 猜猜拳 | `godie-u034.passive` | attr:str×3.0 | stat:ap×0.6 |
| 65 | `cooldown` | `ggd-zero` | `A10G` | 77-002 御雷劍 | `godie-e00w.ex` | 75.0 | 0.0 |
| 66 | `cooldown` | `ggd-zero` | `A0JB` | 77-02 百烈櫻華斬 | `godie-e00w.w` | 60.0 | 0.0 |
| 67 | `cooldown` | `ggd-zero` | `A0ES` | 45-00 寫輪眼 | `godie-edem.passive` | 115.0 | 0.0 |
| 68 | `cooldown` | `ggd-zero` | `A10H` | 13-002 化龍 | `godie-efur.ex` | 8.0 | 0.0 |
| 69 | `cooldown` | `ggd-zero` | `A10T` | 13-0021 KISS | `godie-efur.ex` | 0.01 | 0.0 |
| 70 | `cooldown` | `ggd-zero` | `Auhf` | 13-00 狂氣 | `godie-efur.passive` | 45.0 | 0.0 |
| 71 | `cooldown` | `ggd-zero` | `ACds` | 60-00 聖光盾 | `godie-h00l.passive` | 45.0 | 0.0 |
| 72 | `cooldown` | `ggd-zero` | `A0W5` | 79-002 虛化 | `godie-h01n.ex` | 60.0 | 0.0 |
| 73 | `cooldown` | `ggd-zero` | `A0UH` | 04-00 翔封界 | `godie-h020.passive` | 50.0 | 0.0 |
| 74 | `cooldown` | `ggd-zero` | `A0WB` | 92-03 狂草泥馬 | `godie-h02u.e` | 60.0 | 0.0 |
| 75 | `cooldown` | `ggd-zero` | `A0WA` | 92-02 消化液 | `godie-h02u.w` | 40.0 | 0.0 |
| 76 | `cooldown` | `ggd-zero` | `A0S3` | 74-002 超新星 | `godie-u00j.ex` | 60.0 | 0.0 |
| 77 | `mana` | `ggd-zero` | `A007` | 22-01 鬼隱之擊 | `godie-e001.q` | 60.0 | 0.0 |
| 78 | `mana` | `ggd-zero` | `A02Q` | 22-04 雛見澤症候群L5 | `godie-e001.r` | 70.0 | 0.0 |
| 79 | `mana` | `ggd-zero` | `A02K` | 12-02 仙氣．採藥 | `godie-e007.w` | 50.0 | 0.0 |
| 80 | `mana` | `ggd-zero` | `A0UO` | 21-002 天破壤碎 | `godie-e008.ex` | 800.0 | 0.0 |
| 81 | `mana` | `ggd-zero` | `A0HB` | 21-04 討滅封絕 | `godie-e008.r` | 200.0 | 0.0 |
| 82 | `mana` | `ggd-zero` | `A0BH` | 21-01 火羽 | `godie-e008.w` | 30.0 | 0.0 |
| 83 | `mana` | `ggd-zero` | `A0O5` | 59-01 吞噬 | `godie-e00r.q` | 50.0 | 0.0 |
| 84 | `mana` | `ggd-zero` | `A0GR` | 70-03 木束縛之術 | `godie-e00s.e` | 100.0 | 0.0 |
| 85 | `mana` | `ggd-zero` | `A0JG` | 77-03 GLADIARIA ALAT | `godie-e00w.e` | 90.0 | 0.0 |
| 86 | `mana` | `ggd-zero` | `A10G` | 77-002 御雷劍 | `godie-e00w.ex` | 255.0 | 0.0 |
| 87 | `mana` | `ggd-zero` | `A0JD` | 77-00 浮雲-旋一閃 | `godie-e00w.passive` | 150.0 | 0.0 |
| 88 | `mana` | `ggd-zero` | `A0JB` | 77-02 百烈櫻華斬 | `godie-e00w.w` | 120.0 | 0.0 |
| 89 | `mana` | `ggd-zero` | `A10H` | 13-002 化龍 | `godie-efur.ex` | 166.0 | 0.0 |
| 90 | `mana` | `ggd-zero` | `Auhf` | 13-00 狂氣 | `godie-efur.passive` | 60.0 | 0.0 |
| 91 | `mana` | `ggd-zero` | `AEer` | 13-01 老樹盤根 | `godie-efur.q` | 150.0 | 0.0 |
| 92 | `mana` | `ggd-zero` | `A0ZU` | 15-002 風花-武裝解除 | `godie-emfr.ex` | 450.0 | 0.0 |
| 93 | `mana` | `ggd-zero` | `A0SA` | 44-002 交換筆記本 | `godie-emns.ex` | 350.0 | 0.0 |
| 94 | `mana` | `ggd-zero` | `A05F` | 44-00 機警 | `godie-emns.passive` | 50.0 | 0.0 |
| 95 | `mana` | `ggd-zero` | `A0IK` | 44-01 死神之眼 | `godie-emns.q` | 150.0 | 0.0 |
| 96 | `mana` | `ggd-zero` | `A00W` | 14-01 匕首狂風 | `godie-etyr.q` | 125.0 | 0.0 |
| 97 | `mana` | `ggd-zero` | `A0JL` | 14-01 東風繪扇、南風末廣 | `godie-etyr.q` | 120.0 | 0.0 |
| 98 | `mana` | `ggd-zero` | `Adef` | 60-03 海拉爾之盾的庇護 | `godie-h00l.e` | 100.0 | 0.0 |
| 99 | `mana` | `ggd-zero` | `ACds` | 60-00 聖光盾 | `godie-h00l.passive` | 300.0 | 0.0 |
| 100 | `mana` | `ggd-zero` | `A0BR` | 60-04 迴旋斬 | `godie-h00l.r` | 170.0 | 0.0 |
| 101 | `mana` | `ggd-zero` | `A0W5` | 79-002 虛化 | `godie-h01n.ex` | 500.0 | 0.0 |
| 102 | `mana` | `ggd-zero` | `A0LJ` | 79-01 瞬步 | `godie-h01n.q` | 65.0 | 0.0 |
| 103 | `mana` | `ggd-zero` | `A0RX` | 79-01 瞬步 | `godie-h01n.q` | 65.0 | 0.0 |
| 104 | `mana` | `ggd-zero` | `A0LN` | 79-04 卍解 | `godie-h01n.r` | 100.0 | 0.0 |
| 105 | `mana` | `ggd-zero` | `A0MZ` | 80-04 赤兔咆哮 | `godie-h01u.r` | 70.0 | 0.0 |
| 106 | `mana` | `ggd-zero` | `A0OE` | 04-002 惡夢魔王的碎片 | `godie-h020.ex` | 360.0 | 0.0 |
| 107 | `mana` | `ggd-zero` | `A0TU` | 89-002 俄羅斯輪盤 | `godie-h02k.ex` | 50.0 | 0.0 |
| 108 | `mana` | `ggd-zero` | `A0VB` | 90-002 換~身~! | `godie-h02r.ex` | 500.0 | 0.0 |
| 109 | `mana` | `ggd-zero` | `A0VG` | 90-002 超進化! 妙蛙花 | `godie-h02r.ex` | 350.0 | 0.0 |
| 110 | `mana` | `ggd-zero` | `A0NB` | 90-02 麻痺粉 | `godie-h02r.w` | 20.0 | 0.0 |
| 111 | `mana` | `ggd-zero` | `A0WB` | 92-03 狂草泥馬 | `godie-h02u.e` | 90.0 | 0.0 |
| 112 | `mana` | `ggd-zero` | `A0W9` | 92-01 臥草泥馬 | `godie-h02u.q` | 160.0 | 0.0 |
| 113 | `mana` | `ggd-zero` | `A0WA` | 92-02 消化液 | `godie-h02u.w` | 150.0 | 0.0 |
| 114 | `mana` | `ggd-zero` | `A02C` | 07-04 神聖結界 | `godie-hpb1.r` | 150.0 | 0.0 |
| 115 | `mana` | `ggd-zero` | `A07O` | 07-04 神聖結界 | `godie-hpb1.r` | 100.0 | 0.0 |
| 116 | `mana` | `ggd-zero` | `A03T` | 28-03 分身 | `godie-huth.e` | 120.0 | 0.0 |
| 117 | `mana` | `ggd-zero` | `A0RR` | 48-00 石化之眼 | `godie-hvsh.passive` | 150.0 | 0.0 |
| 118 | `mana` | `ggd-zero` | `A06K` | 42-002 魔力印章 | `godie-n003.ex` | 999.0 | 0.0 |
| 119 | `mana` | `ggd-zero` | `A059` | 42-00 魔法障壁 | `godie-n003.passive` | 180.0 | 0.0 |
| 120 | `mana` | `ggd-zero` | `A0D1` | 57-02 縮小燈 | `godie-n00b.e` | 100.0 | 0.0 |
| 121 | `mana` | `ggd-zero` | `A0D2` | 57-02 任意門 | `godie-n00b.e` | 225.0 | 0.0 |
| 122 | `mana` | `ggd-zero` | `A0MS` | 57-002-01 時間記憶 | `godie-n00b.ex` | 100.0 | 0.0 |
| 123 | `mana` | `ggd-zero` | `A0MT` | 57-002-02 時光倒流 | `godie-n00b.ex` | 1000.0 | 0.0 |
| 124 | `mana` | `ggd-zero` | `A0CY` | 57-00 四次元口袋 | `godie-n00b.passive` | 75.0 | 0.0 |
| 125 | `mana` | `ggd-zero` | `A0NE` | 57-03 複製鏡 | `godie-n00b.w` | 200.0 | 0.0 |
| 126 | `mana` | `ggd-zero` | `A0T1` | 08-002 龍魔人 | `godie-n01c.ex` | 200.0 | 0.0 |
| 127 | `mana` | `ggd-zero` | `A0CF` | 08-01 雙龍紋 | `godie-n01c.q` | 50.0 | 0.0 |
| 128 | `mana` | `ggd-zero` | `A0BX` | 86-00 裝可愛 | `godie-o00k.passive` | 50.0 | 0.0 |
| 129 | `mana` | `ggd-zero` | `A07T` | 53-03 破法對咒 | `godie-o00l.e` | 120.0 | 0.0 |
| 130 | `mana` | `ggd-zero` | `Aivs` | 53-00 空間穿梭 | `godie-o00l.passive` | 200.0 | 0.0 |
| 131 | `mana` | `ggd-zero` | `A03Y` | 09-02 瞬間移動 | `godie-o00x.w` | 100.0 | 0.0 |
| 132 | `mana` | `ggd-zero` | `A0SL` | 58-002 打雷絕招 | `godie-o02l.ex` | 300.0 | 0.0 |
| 133 | `mana` | `ggd-zero` | `A0R6` | 58-00 電光一閃 | `godie-o02l.passive` | 150.0 | 0.0 |
| 134 | `mana` | `ggd-zero` | `A11B` | 99-03 初音未來的消失 | `godie-o02p.e` | 175.0 | 0.0 |
| 135 | `mana` | `ggd-zero` | `A11F` | 99-002 把你給MikuMiku掉 | `godie-o02p.ex` | 400.0 | 0.0 |
| 136 | `mana` | `ggd-zero` | `A11C` | 99-04 世界第一的公主殿下 | `godie-o02p.r` | 225.0 | 0.0 |
| 137 | `mana` | `ggd-zero` | `A118` | 99-02 最初的聲音 | `godie-o02p.w` | 100.0 | 0.0 |
| 138 | `mana` | `ggd-zero` | `A0YT` | 30-002 變態紳士 | `godie-o030.ex` | 200.0 | 0.0 |
| 139 | `mana` | `ggd-zero` | `A029` | 30-00 攝影機 | `godie-o030.passive` | 100.0 | 0.0 |
| 140 | `mana` | `ggd-zero` | `A09L` | 30-01 綁架 | `godie-o030.q` | 30.0 | 0.0 |
| 141 | `mana` | `ggd-zero` | `A09B` | 72-002 億萬星殞落 | `godie-ogld.ex` | 600.0 | 0.0 |
| 142 | `mana` | `ggd-zero` | `ACdr` | 34-00 靈魂吞噬 | `godie-osam.passive` | 160.0 | 0.0 |
| 143 | `mana` | `ggd-zero` | `A07C` | 39-00 無名神風流-玄武 | `godie-u00h.passive` | 90.0 | 0.0 |
| 144 | `mana` | `ggd-zero` | `A0S3` | 74-002 超新星 | `godie-u00j.ex` | 520.0 | 0.0 |
| 145 | `mana` | `ggd-zero` | `A07H` | 25-00 北斗暗殺拳 | `godie-u00l.passive` | 70.0 | 0.0 |
| 146 | `mana` | `ggd-zero` | `A0ZK` | 76-002 霸王色 | `godie-u00n.ex` | 250.0 | 0.0 |
| 147 | `mana` | `ggd-zero` | `A09K` | 38-04 黑龍波吸收 | `godie-u010.r` | 100.0 | 0.0 |
| 148 | `mana` | `ggd-zero` | `A10N` | 11-002 武裝色霸氣 | `godie-u01u.ex` | 200.0 | 0.0 |
| 149 | `mana` | `ggd-zero` | `A0OU` | 11-00 三刀流 | `godie-u01u.passive` | 45.0 | 0.0 |
| 150 | `mana` | `ggd-zero` | `A0MQ` | 11-04 三千世界 | `godie-u01u.r` | 111.0 | 0.0 |
| 151 | `mana` | `ggd-zero` | `A0Y1` | 06-04 傑桑變化 | `godie-u034.r` | 200.0 | 0.0 |
| 152 | `mana` | `ggd-zero` | `A01A` | 37-00 光魔護盾 | `godie-ubal.passive` | 350.0 | 0.0 |
| 153 | `mana` | `ggd-zero` | `S001` | 37-00 鬼眼 | `godie-ubal.passive` | 150.0 | 0.0 |
| 154 | `mana` | `ggd-zero` | `A0FF` | 65-002 永恆的愚蠢鄉 | `godie-udea.ex` | 150.0 | 0.0 |
| 155 | `mana` | `ggd-zero` | `A04G` | 65-01 神出鬼沒 | `godie-udea.q` | 150.0 | 0.0 |
| 156 | `range` | `ggd-zero` | `A0V9` | 21-002-03-x 天破 | `godie-e008.ex` | 600.0 | 0.0 |
| 157 | `range` | `ggd-zero` | `A0GN` | 70-04 千年練成 | `godie-e00s.r` | 1200.0 | 0.0 |
| 158 | `range` | `ggd-zero` | `A0ZO` | 70-04 樹海降臨 | `godie-e00s.r` | 1200.0 | 0.0 |
| 159 | `range` | `ggd-zero` | `A0JC` | 77-00 閃電特效 | `godie-e00w.passive` | 99999.0 | 0.0 |
| 160 | `range` | `ggd-zero` | `A0TW` | 77-01-00 百烈櫻華特效 | `godie-e00w.q` | 99999.0 | 0.0 |
| 161 | `range` | `ggd-zero` | `A100` | 45-002-05 禁言 | `godie-edem.ex` | 9999.0 | 0.0 |
| 162 | `range` | `ggd-zero` | `A0UC` | 45-00x 鏈鎖閃電 | `godie-edem.passive` | 99999.0 | 0.0 |
| 163 | `range` | `ggd-zero` | `A0UN` | 45-00x 麒麟無傷害天雷 | `godie-edem.passive` | 99999.0 | 0.0 |
| 164 | `range` | `ggd-zero` | `A10H` | 13-002 化龍 | `godie-efur.ex` | 2000.0 | 0.0 |
| 165 | `range` | `ggd-zero` | `A052` | 15-03 雷電風暴 | `godie-emfr.e` | 450.0 | 0.0 |
| 166 | `range` | `ggd-zero` | `A0ZU` | 15-002 風花-武裝解除 | `godie-emfr.ex` | 750.0 | 0.0 |
| 167 | `range` | `ggd-zero` | `A053` | 15-04 千之雷 | `godie-emfr.r` | 900.0 | 0.0 |
| 168 | `range` | `ggd-zero` | `A054` | 15-02 沉睡之霧 | `godie-emfr.w` | 350.0 | 0.0 |
| 169 | `range` | `ggd-zero` | `A0VB` | 90-002 換~身~! | `godie-h02r.ex` | 350.0 | 0.0 |
| 170 | `range` | `ggd-zero` | `A0W7` | 92-00-01 降低50%攻擊 | `godie-h02u.passive` | 99999.0 | 0.0 |
| 171 | `range` | `ggd-zero` | `A0U8` | 52-04 巨神一擊 | `godie-hapm.r` | 600.0 | 0.0 |
| 172 | `range` | `ggd-zero` | `A00J` | 48-03 魔法枷鎖 | `godie-hvsh.e` | 400.0 | 0.0 |
| 173 | `range` | `ggd-zero` | `A06C` | 48-03 鮮血神殿 | `godie-hvsh.e` | 100.0 | 0.0 |
| 174 | `range` | `ggd-zero` | `A0RN` | 48-00-00 Rider石化之眼 | `godie-hvsh.passive` | 99999.0 | 0.0 |
| 175 | `range` | `ggd-zero` | `AUdr` | 42-02 吸血祭品 | `godie-n003.w` | 600.0 | 0.0 |
| 176 | `range` | `ggd-zero` | `A0DS` | 53-03-x 破法對咒 | `godie-o00l.e` | 800.0 | 0.0 |
| 177 | `range` | `ggd-zero` | `Aivs` | 53-00 空間穿梭 | `godie-o00l.passive` | 100.0 | 0.0 |
| 178 | `range` | `ggd-zero` | `A11A` | 99-03a 初音戰意 | `godie-o02p.e` | 99999.0 | 0.0 |
| 179 | `range` | `ggd-zero` | `A11D` | 99-04a 甩蔥歌 | `godie-o02p.r` | 99999.0 | 0.0 |
| 180 | `range` | `ggd-zero` | `A11E` | 99-04b 最初的聲音 | `godie-o02p.r` | 99999.0 | 0.0 |
| 181 | `range` | `ggd-zero` | `ACdr` | 34-00 靈魂吞噬 | `godie-osam.passive` | 350.0 | 0.0 |
| 182 | `range` | `ggd-zero` | `A0S3` | 74-002 超新星 | `godie-u00j.ex` | 450.0 | 0.0 |
| 183 | `range` | `ggd-zero` | `A0ZJ` | 76-002-00 霸王色效果 | `godie-u00n.ex` | 99999.0 | 0.0 |
| 184 | `range` | `ggd-zero` | `A0IU` | 76-04-00 三檔副作用 | `godie-u00n.r` | 99999.0 | 0.0 |
| 185 | `range` | `ggd-zero` | `A0CN` | 11-00x 三刀流效果 | `godie-u01u.passive` | 99999.0 | 0.0 |
| 186 | `range` | `ggd-zero` | `A04C` | 65-04 天譴 | `godie-udea.r` | 450.0 | 0.0 |
| 187 | `radius` | `free-number` | `A0LH` | 79-00 靈壓 | `godie-h01n.passive` | 500.0 | 4.5 |
| 188 | `radius` | `free-number` | `A0UV` | 79-00 靈壓 | `godie-h01n.passive` | 600.0 | 4.5 |
| 189 | `radius` | `free-number` | `A0UX` | 01-02 隕石擊 | `godie-hart.w` | 300.0 | 4.58 |
| 190 | `radius` | `free-number` | `A0G3` | 07-03 列、在、前 | `godie-hpb1.e` | 300.0 | 6.05 |
| 191 | `radius` | `free-number` | `A0S2` | 76-04-x 震地 | `godie-u00n.r` | 350.0 | 6.97 |
| 192 | `radius` | `ggd-absent` | `A0D5` | 20-03 約束與勝利之劍 | `godie-e002.e` | 200.0 | None |
| 193 | `radius` | `ggd-absent` | `A0HB` | 21-04 討滅封絕 | `godie-e008.r` | 1.0 | None |
| 194 | `radius` | `ggd-absent` | `A0HN` | 21-04x 封絕 | `godie-e008.r` | 1800.0 | None |
| 195 | `radius` | `ggd-absent` | `A0BH` | 21-01 火羽 | `godie-e008.w` | 350.0 | None |
| 196 | `radius` | `ggd-absent` | `A0DF` | 21-01a 夏娜拔焰後擴散火 | `godie-e008.w` | 350.0 | None |
| 197 | `radius` | `ggd-absent` | `A0GI` | 59-04 野戰型陽電子砲 | `godie-e00r.r` | 220.0 | None |
| 198 | `radius` | `ggd-absent` | `A0GM` | 70-00 芬多精(效果) | `godie-e00s.passive` | 250.0 | None |
| 199 | `radius` | `ggd-absent` | `A0UN` | 45-00x 麒麟無傷害天雷 | `godie-edem.passive` | 0.0 | None |
| 200 | `radius` | `ggd-absent` | `A10T` | 13-0021 KISS | `godie-efur.ex` | 220.0 | None |
| 201 | `radius` | `ggd-absent` | `A0ZT` | 15-002-00 風花武裝解除BUFF | `godie-emfr.ex` | 500.0 | None |
| 202 | `radius` | `ggd-absent` | `A0ZU` | 15-002 風花-武裝解除 | `godie-emfr.ex` | 500.0 | None |
| 203 | `radius` | `ggd-absent` | `A058` | 15-00 元素操控 | `godie-emfr.passive` | 50.0 | None |
| 204 | `radius` | `ggd-absent` | `A056` | 15-01-01 風精召喚 | `godie-emfr.q` | 400.0 | None |
| 205 | `radius` | `ggd-absent` | `A05I` | 44-04 心臟麻痺 | `godie-emns.r` | 0.5 | None |
| 206 | `radius` | `ggd-absent` | `A0ST` | 14-002 魔力激發 | `godie-etyr.ex` | 50.0 | None |
| 207 | `radius` | `ggd-absent` | `A0JL` | 14-01 東風繪扇、南風末廣 | `godie-etyr.q` | 0.0 | None |
| 208 | `radius` | `ggd-absent` | `AOae` | 14-03 魔力應援 | `godie-etyr.w` | 400.0 | None |
| 209 | `radius` | `ggd-absent` | `A0W5` | 79-002 虛化 | `godie-h01n.ex` | 100.0 | None |
| 210 | `radius` | `ggd-absent` | `A0N2` | 80-03-01 妖火 | `godie-h01u.e` | 600.0 | None |
| 211 | `radius` | `ggd-absent` | `A0MW` | 80-00 天生弒鬼神 | `godie-h01u.passive` | 350.0 | None |
| 212 | `radius` | `ggd-absent` | `A0MZ` | 80-04 赤兔咆哮 | `godie-h01u.r` | 450.0 | None |
| 213 | `radius` | `ggd-absent` | `A0AX` | 04-00 魔力增幅 | `godie-h020.passive` | 50.0 | None |
| 214 | `radius` | `ggd-absent` | `A0TN` | 89-03 憤怒的胸毛 | `godie-h02k.e` | 50.0 | None |
| 215 | `radius` | `ggd-absent` | `A0O2` | 90-03 藤鞭 | `godie-h02r.e` | 250.0 | None |
| 216 | `radius` | `ggd-absent` | `A0VE` | 90-03 鞏固本能 | `godie-h02r.e` | 10.0 | None |
| 217 | `radius` | `ggd-absent` | `A0VF` | 90-03-00 鞏固本能毒液 | `godie-h02r.e` | 180.0 | None |
| 218 | `radius` | `ggd-absent` | `A0Y4` | 90-03 藤鞭 | `godie-h02r.e` | 450.0 | None |
| 219 | `radius` | `ggd-absent` | `A0VA` | 90-00 KEROKERO | `godie-h02r.passive` | 1200.0 | None |
| 220 | `radius` | `ggd-absent` | `A0R4` | 90-04 陽光烈焰 | `godie-h02r.r` | 400.0 | None |
| 221 | `radius` | `ggd-absent` | `A0FV` | 52-03 狂暴血液 | `godie-hapm.e` | 50.0 | None |
| 222 | `radius` | `ggd-absent` | `A0VJ` | 52-01 狂戰士之怒 | `godie-hapm.q` | 50.0 | None |
| 223 | `radius` | `ggd-absent` | `A019` | 52-02 狂暴怒吼 | `godie-hapm.w` | 375.0 | None |
| 224 | `radius` | `ggd-absent` | `A0U1` | 52-02 蹂躪編年史 | `godie-hapm.w` | 0.0 | None |
| 225 | `radius` | `ggd-absent` | `A07O` | 07-04 神聖結界 | `godie-hpb1.r` | 50.0 | None |
| 226 | `radius` | `ggd-absent` | `A08U` | 28-04 破滅能量彈 | `godie-huth.r` | 410.0 | None |
| 227 | `radius` | `ggd-absent` | `A0RQ` | 48-04 騎英之疆繩 | `godie-hvsh.r` | 500.0 | None |
| 228 | `radius` | `ggd-absent` | `A03D` | 02-03 魂飛魄散 | `godie-hvwd.e` | 250.0 | None |
| 229 | `radius` | `ggd-absent` | `A045` | 02-02 明鏡止水 | `godie-hvwd.w` | 150.0 | None |
| 230 | `radius` | `ggd-absent` | `A05C` | 42-03 暗夜吹雪 | `godie-n003.e` | 200.0 | None |
| 231 | `radius` | `ggd-absent` | `A05D` | 42-04 世界終結 | `godie-n003.r` | 450.0 | None |
| 232 | `radius` | `ggd-absent` | `A0P6` | 42-04-01 世界終結 | `godie-n003.r` | 375.0 | None |
| 233 | `radius` | `ggd-absent` | `A0D0` | 57-01 空氣砲 | `godie-n00b.q` | 200.0 | None |
| 234 | `radius` | `ggd-absent` | `A0IO` | 18-01 風華圓舞陣 | `godie-n00p.q` | 350.0 | None |
| 235 | `radius` | `ggd-absent` | `A0RV` | 18-02 寄生種子 | `godie-n00p.w` | 0.0 | None |
| 236 | `radius` | `ggd-absent` | `A05J` | 08-03 龍鬥氣砲咒文 | `godie-n01c.e` | 300.0 | None |
| 237 | `radius` | `ggd-absent` | `A05T` | 08-02 萊丁快速劍 | `godie-n01c.w` | 250.0 | None |
| 238 | `radius` | `ggd-absent` | `A0K1` | 53-01 獸王牙操彈 | `godie-o00l.q` | 350.0 | None |
| 239 | `radius` | `ggd-absent` | `A0DT` | 53-04 暴爆咒 | `godie-o00l.r` | 400.0 | None |
| 240 | `radius` | `ggd-absent` | `A0UE` | 53-04 暴爆咒 | `godie-o00l.r` | 10.0 | None |
| 241 | `radius` | `ggd-absent` | `A0SI` | 09-002a 悟空指令靈氣 | `godie-o00x.ex` | 10.0 | None |
| 242 | `radius` | `ggd-absent` | `A082` | 09-01 界王拳 | `godie-o00x.q` | 50.0 | None |
| 243 | `radius` | `ggd-absent` | `A03S` | 09-04 龜派氣功 | `godie-o00x.r` | 400.0 | None |
| 244 | `radius` | `ggd-absent` | `A0SL` | 58-002 打雷絕招 | `godie-o02l.ex` | 1800.0 | None |
| 245 | `radius` | `ggd-absent` | `A11B` | 99-03 初音未來的消失 | `godie-o02p.e` | 0.0 | None |
| 246 | `radius` | `ggd-absent` | `A10I` | 30-002 EX變態針刺 | `godie-o030.ex` | 100.0 | None |
| 247 | `radius` | `ggd-absent` | `A01P` | 30-04 電車之狼衝擊 | `godie-o030.r` | 350.0 | None |
| 248 | `radius` | `ggd-absent` | `ANdh` | 30-02 酒精灌腸 | `godie-o030.w` | 600.0 | None |
| 249 | `radius` | `ggd-absent` | `ANmo` | 72-01洗刷刷 | `godie-ogld.q` | 350.0 | None |
| 250 | `radius` | `ggd-absent` | `ACdr` | 34-00 靈魂吞噬 | `godie-osam.passive` | 350.0 | None |
| 251 | `radius` | `ggd-absent` | `A034` | 34-01 風華之爪 | `godie-osam.q` | 260.0 | None |
| 252 | `radius` | `ggd-absent` | `A0FP` | 34-04 奧義˙蒼龍破 | `godie-osam.r` | 350.0 | None |
| 253 | `radius` | `ggd-absent` | `A0DO` | 39-03 無名神風流-蛟龍 | `godie-u00h.e` | 1.0 | None |
| 254 | `radius` | `ggd-absent` | `A07C` | 39-00 無名神風流-玄武 | `godie-u00h.passive` | 50.0 | None |
| 255 | `radius` | `ggd-absent` | `A0G5` | 74-04 最終殞落星 | `godie-u00j.r` | 600.0 | None |
| 256 | `radius` | `ggd-absent` | `A0HJ` | 71-03 厄夜靈魂 | `godie-u00k.e` | 250.0 | None |
| 257 | `radius` | `ggd-absent` | `A0HK` | 71-04 萬惡歸宗 | `godie-u00k.r` | 600.0 | None |
| 258 | `radius` | `ggd-absent` | `A0HI` | 71-02 魔力反噬 | `godie-u00k.w` | 600.0 | None |
| 259 | `radius` | `ggd-absent` | `AEah` | 25-04 北斗神拳究極奧義 - 無想轉生 | `godie-u00l.r` | 50.0 | None |
| 260 | `radius` | `ggd-absent` | `A0IV` | 76-03 伸縮自如的槍亂打 | `godie-u00n.e` | 400.0 | None |
| 261 | `radius` | `ggd-absent` | `A0ZK` | 76-002 霸王色 | `godie-u00n.ex` | 0.0 | None |
| 262 | `radius` | `ggd-absent` | `A09I` | 38-03 邪王炎殺黑龍波 | `godie-u010.e` | 175.0 | None |
| 263 | `radius` | `ggd-absent` | `A09K` | 38-04 黑龍波吸收 | `godie-u010.r` | 5.0 | None |
| 264 | `radius` | `ggd-absent` | `A0OU` | 11-00 三刀流 | `godie-u01u.passive` | 0.0 | None |
| 265 | `radius` | `ggd-absent` | `A0BC` | 11-01 燒鬼斬 | `godie-u01u.q` | 350.0 | None |
| 266 | `radius` | `ggd-absent` | `A0OY` | 37-02 黑核晶 | `godie-ubal.e` | 400.0 | None |
| 267 | `radius` | `ggd-absent` | `A01I` | 37-01 凱薩之鷹 | `godie-ubal.q` | 200.0 | None |
| 268 | `radius` | `ggd-absent` | `A01X` | 37-04-02 凱薩之鷹 | `godie-ubal.r` | 170.0 | None |
| 269 | `radius` | `ggd-absent` | `A0KC` | 37-03 災難之牆 | `godie-ubal.w` | 1.0 | None |
| 270 | `radius` | `ggd-absent` | `A0KD` | 37-03-00 災難之牆火燄 | `godie-ubal.w` | 150.0 | None |
| 271 | `radius` | `ggd-absent` | `A05S` | 65-02 寒冰破碎 | `godie-udea.w` | 200.0 | None |
| 272 | `duration` | `free-number` | `A02Q` | 22-04 雛見澤症候群L5 | `godie-e001.r` | 0.0 | 7.0 |
| 273 | `duration` | `free-number` | `A0ZO` | 70-04 樹海降臨 | `godie-e00s.r` | 0.0 | 8.0 |
| 274 | `duration` | `free-number` | `A102` | 45-002 天照 | `godie-edem.ex` | 0.01 | 10.0 |
| 275 | `duration` | `free-number` | `A0M7` | 45-01 火遁-豪火龍之術 | `godie-edem.q` | 0.01 | 3.0 |
| 276 | `duration` | `free-number` | `A0ZT` | 15-002-00 風花武裝解除BUFF | `godie-emfr.ex` | 4.0 | 5.0 |
| 277 | `duration` | `free-number` | `A0ZU` | 15-002 風花-武裝解除 | `godie-emfr.ex` | 0.01 | 5.0 |
| 278 | `duration` | `free-number` | `A0JZ` | 14-04 AKT戰隊 | `godie-etyr.r` | 0.1 | 8.0 |
| 279 | `duration` | `free-number` | `A0K2` | 14-04-03 涼宮禁言 | `godie-etyr.r` | 5.0 | 8.0 |
| 280 | `duration` | `free-number` | `A0BP` | 60-02 鎖鏈槍 | `godie-h00l.w` | 1.0 | 0.4 |
| 281 | `duration` | `free-number` | `A0LN` | 79-04 卍解 | `godie-h01n.r` | 0.0 | 8.0 |
| 282 | `duration` | `free-number` | `A0VC` | 90-01 保護色獵殺 | `godie-h02r.q` | 12.0 | 2.0 |
| 283 | `duration` | `free-number` | `A0U5` | 52-002 射殺百頭 | `godie-hapm.ex` | 1.0 | 1.5 |
| 284 | `duration` | `free-number` | `A019` | 52-02 狂暴怒吼 | `godie-hapm.w` | 1.0 | 1.05 |
| 285 | `duration` | `free-number` | `A072` | 01-01 凶斬 | `godie-hart.q` | 1.0 | 0.2 |
| 286 | `duration` | `free-number` | `A0AZ` | 01-01r 囧斬 | `godie-hart.q` | 1.0 | 0.2 |
| 287 | `duration` | `free-number` | `A077` | 01-04 超究武神霸斬 | `godie-hart.r` | 13.0 | 3.5 |
| 288 | `duration` | `free-number` | `A0B1` | 01-04r 超究武神霸斬 - 改 | `godie-hart.r` | 13.0 | 3.5 |
| 289 | `duration` | `free-number` | `A0G7` | 01-02 破光擊 | `godie-hart.w` | 0.01 | 0.82 |
| 290 | `duration` | `free-number` | `A0GY` | 01-02 破光擊 auto | `godie-hart.w` | 0.01 | 0.82 |
| 291 | `duration` | `free-number` | `A0UX` | 01-02 隕石擊 | `godie-hart.w` | 0.0 | 0.82 |
| 292 | `duration` | `free-number` | `A0UY` | 01-02-x 隕石擊 | `godie-hart.w` | 0.1 | 0.82 |
| 293 | `duration` | `free-number` | `A06K` | 42-002 魔力印章 | `godie-n003.ex` | 0.0 | 7.0 |
| 294 | `duration` | `free-number` | `A00B` | 18-02 寄生種子 | `godie-n00p.w` | 0.01 | 2.0 |
| 295 | `duration` | `free-number` | `A0RV` | 18-02 寄生種子 | `godie-n00p.w` | 5.0 | 2.0 |
| 296 | `duration` | `free-number` | `A0T1` | 08-002 龍魔人 | `godie-n01c.ex` | 0.0 | 20.0 |
| 297 | `duration` | `free-number` | `A0BN` | 72-02 黑人牙菌斑 | `godie-ogld.w` | 8.0 | 10.0 |
| 298 | `duration` | `free-number` | `A0S4` | 74-01 獄門 | `godie-u00j.q` | 0.01 | 0.3 |
| 299 | `duration` | `free-number` | `A0IR` | 76-00 二檔 | `godie-u00n.passive` | 0.1 | 20.0 |
| 300 | `duration` | `free-number` | `A0IQ` | 76-04 三檔 | `godie-u00n.r` | 12.0 | 0.84 |
| 301 | `duration` | `free-number` | `A0IU` | 76-04-00 三檔副作用 | `godie-u00n.r` | 5.0 | 0.84 |
| 302 | `duration` | `free-number` | `A0RZ` | 76-04 三檔.巨人迴旋彈 | `godie-u00n.r` | 0.0 | 0.84 |
| 303 | `duration` | `free-number` | `A0S2` | 76-04-x 震地 | `godie-u00n.r` | 2.0 | 0.84 |
| 304 | `duration` | `free-number` | `A10M` | 11-002 武裝色霸氣 | `godie-u01u.ex` | 0.01 | 15.0 |
| 305 | `duration` | `free-number` | `A10N` | 11-002 武裝色霸氣 | `godie-u01u.ex` | 0.0 | 15.0 |
| 306 | `duration` | `free-number` | `A08Y` | 06-00 猜猜拳 | `godie-u034.passive` | 0.01 | 8.0 |
| 307 | `duration` | `free-number` | `A0SN` | 06-00x 石頭暈 | `godie-u034.passive` | 1.0 | 8.0 |
| 308 | `duration` | `free-number` | `A0Y1` | 06-04 傑桑變化 | `godie-u034.r` | 0.0 | 8.0 |
| 309 | `duration` | `free-number` | `A0KD` | 37-03-00 災難之牆火燄 | `godie-ubal.w` | 0.1 | 3.0 |
| 310 | `duration` | `ggd-absent` | `AEsh` | 22-03 五吋釘 | `godie-e001.e` | 5.0 | None |
| 311 | `duration` | `ggd-absent` | `A0SU` | 22-002 月光下的決鬥者 | `godie-e001.ex` | 0.3 | None |
| 312 | `duration` | `ggd-absent` | `A0SV` | 22-002 月光下的決鬥者 | `godie-e001.ex` | 0.3 | None |
| 313 | `duration` | `ggd-absent` | `A0CL` | 22-00 嗚鎖打! | `godie-e001.passive` | 0.5 | None |
| 314 | `duration` | `ggd-absent` | `A007` | 22-01 鬼隱之擊 | `godie-e001.q` | 12.0 | None |
| 315 | `duration` | `ggd-absent` | `A0CT` | 20-04 Avalon-永恆的理想鄉 | `godie-e002.r` | 0.01 | None |
| 316 | `duration` | `ggd-absent` | `A0DZ` | 20-01 風王結界 | `godie-e002.w` | 0.0 | None |
| 317 | `duration` | `ggd-absent` | `A02W` | 12-03 破凰之心-徒手空破山 | `godie-e007.e` | 0.0 | None |
| 318 | `duration` | `ggd-absent` | `A04Y` | 12-01 鬥仙術 | `godie-e007.q` | 1.0 | None |
| 319 | `duration` | `ggd-absent` | `A04X` | 12-04 龍氣爆發 | `godie-e007.r` | 3.0 | None |
| 320 | `duration` | `ggd-absent` | `A0BF` | 21-03 赤焰爆發 | `godie-e008.e` | 1.0 | None |
| 321 | `duration` | `ggd-absent` | `A0UO` | 21-002 天破壤碎 | `godie-e008.ex` | 0.01 | None |
| 322 | `duration` | `ggd-absent` | `A0V9` | 21-002-03-x 天破 | `godie-e008.ex` | 0.01 | None |
| 323 | `duration` | `ggd-absent` | `A0BD` | 21-02 拔焰刀 | `godie-e008.q` | 0.5 | None |
| 324 | `duration` | `ggd-absent` | `A0HB` | 21-04 討滅封絕 | `godie-e008.r` | 0.01 | None |
| 325 | `duration` | `ggd-absent` | `A0BH` | 21-01 火羽 | `godie-e008.w` | 6.0 | None |
| 326 | `duration` | `ggd-absent` | `A0O5` | 59-01 吞噬 | `godie-e00r.q` | 9.0 | None |
| 327 | `duration` | `ggd-absent` | `A0GF` | 59-02 高週波短刀 | `godie-e00r.w` | 0.5 | None |
| 328 | `duration` | `ggd-absent` | `A0GR` | 70-03 木束縛之術 | `godie-e00s.e` | 0.0 | None |
| 329 | `duration` | `ggd-absent` | `A0GS` | 70-03-01 木束縛 | `godie-e00s.e` | 1.5 | None |
| 330 | `duration` | `ggd-absent` | `A0O6` | 70-00 紮根 | `godie-e00s.passive` | 0.0 | None |
| 331 | `duration` | `ggd-absent` | `A0GP` | 70-01 伸卡球 | `godie-e00s.q` | 1.0 | None |
| 332 | `duration` | `ggd-absent` | `A0GQ` | 70-02 大怒石 | `godie-e00s.w` | 0.4 | None |
| 333 | `duration` | `ggd-absent` | `A0JG` | 77-03 GLADIARIA ALAT | `godie-e00w.e` | 0.0 | None |
| 334 | `duration` | `ggd-absent` | `A10G` | 77-002 御雷劍 | `godie-e00w.ex` | 15.0 | None |
| 335 | `duration` | `ggd-absent` | `A0JD` | 77-00 浮雲-旋一閃 | `godie-e00w.passive` | 0.5 | None |
| 336 | `duration` | `ggd-absent` | `A0TV` | 77-01 百烈櫻華斬 | `godie-e00w.q` | 1.0 | None |
| 337 | `duration` | `ggd-absent` | `A0JE` | 77-04 真-雷光劍 | `godie-e00w.r` | 4.0 | None |
| 338 | `duration` | `ggd-absent` | `A0JB` | 77-02 百烈櫻華斬 | `godie-e00w.w` | 0.01 | None |
| 339 | `duration` | `ggd-absent` | `A0TY` | 77-02-01 雷鳴劍落雷 | `godie-e00w.w` | 0.01 | None |
| 340 | `duration` | `ggd-absent` | `A0JX` | 45-02 千鳥流 | `godie-edem.w` | 1.5 | None |
| 341 | `duration` | `ggd-absent` | `AEtq` | 13-03 快步 | `godie-efur.e` | 0.01 | None |
| 342 | `duration` | `ggd-absent` | `A10H` | 13-002 化龍 | `godie-efur.ex` | 2.0 | None |
| 343 | `duration` | `ggd-absent` | `A10S` | 13-002 KISS ME! | `godie-efur.ex` | 0.01 | None |
| 344 | `duration` | `ggd-absent` | `A10T` | 13-0021 KISS | `godie-efur.ex` | 0.01 | None |
| 345 | `duration` | `ggd-absent` | `Auhf` | 13-00 狂氣 | `godie-efur.passive` | 9.0 | None |
| 346 | `duration` | `ggd-absent` | `AEer` | 13-01 老樹盤根 | `godie-efur.q` | 1.0 | None |
| 347 | `duration` | `ggd-absent` | `A00X` | 13-02 變化念力 | `godie-efur.w` | 1.0 | None |
| 348 | `duration` | `ggd-absent` | `A052` | 15-03 雷電風暴 | `godie-emfr.e` | 2.0 | None |
| 349 | `duration` | `ggd-absent` | `A056` | 15-01-01 風精召喚 | `godie-emfr.q` | 2.0 | None |
| 350 | `duration` | `ggd-absent` | `A054` | 15-02 沉睡之霧 | `godie-emfr.w` | 3.0 | None |
| 351 | `duration` | `ggd-absent` | `A05H` | 44-03 火車輾過 | `godie-emns.e` | 0.0 | None |
| 352 | `duration` | `ggd-absent` | `A0SA` | 44-002 交換筆記本 | `godie-emns.ex` | 0.2 | None |
| 353 | `duration` | `ggd-absent` | `A0IK` | 44-01 死神之眼 | `godie-emns.q` | 15.0 | None |
| 354 | `duration` | `ggd-absent` | `A05I` | 44-04 心臟麻痺 | `godie-emns.r` | 1.0 | None |
| 355 | `duration` | `ggd-absent` | `A0JM` | 14-02 式神炸裂 | `godie-etyr.e` | 0.01 | None |
| 356 | `duration` | `ggd-absent` | `A0JJ` | 14-00 召喚式神 | `godie-etyr.passive` | 25.0 | None |
| 357 | `duration` | `ggd-absent` | `A0JK` | 14-00-01 式神之火 | `godie-etyr.passive` | 1.0 | None |
| 358 | `duration` | `ggd-absent` | `A0JY` | 14-00-01 式神之火 | `godie-etyr.passive` | 1.0 | None |
| 359 | `duration` | `ggd-absent` | `A0JL` | 14-01 東風繪扇、南風末廣 | `godie-etyr.q` | 0.01 | None |
| 360 | `duration` | `ggd-absent` | `A10P` | 60-002 絕光斬 | `godie-h00l.ex` | 0.01 | None |
| 361 | `duration` | `ggd-absent` | `ACds` | 60-00 聖光盾 | `godie-h00l.passive` | 3.0 | None |
| 362 | `duration` | `ggd-absent` | `A0BR` | 60-04 迴旋斬 | `godie-h00l.r` | 1.0 | None |
| 363 | `duration` | `ggd-absent` | `A0W5` | 79-002 虛化 | `godie-h01n.ex` | 15.0 | None |
| 364 | `duration` | `ggd-absent` | `A0LJ` | 79-01 瞬步 | `godie-h01n.q` | 0.5 | None |
| 365 | `duration` | `ggd-absent` | `A0RX` | 79-01 瞬步 | `godie-h01n.q` | 0.5 | None |
| 366 | `duration` | `ggd-absent` | `A0LK` | 79-02 斬擊 | `godie-h01n.w` | 10.0 | None |
| 367 | `duration` | `ggd-absent` | `A0N0` | 80-03 鬼神烈戟 | `godie-h01u.e` | 3.0 | None |
| 368 | `duration` | `ggd-absent` | `A0MZ` | 80-04 赤兔咆哮 | `godie-h01u.r` | 0.2 | None |
| 369 | `duration` | `ggd-absent` | `A04R` | 04-03 龍破斬 | `godie-h020.e` | 0.0 | None |
| 370 | `duration` | `ggd-absent` | `A0OE` | 04-002 惡夢魔王的碎片 | `godie-h020.ex` | 0.0 | None |
| 371 | `duration` | `ggd-absent` | `A0AY` | 04-01 火球術 | `godie-h020.q` | 1.5 | None |
| 372 | `duration` | `ggd-absent` | `A07F` | 04-04 神滅斬 | `godie-h020.r` | 2.0 | None |
| 373 | `duration` | `ggd-absent` | `A0TU` | 89-002 俄羅斯輪盤 | `godie-h02k.ex` | 0.01 | None |
| 374 | `duration` | `ggd-absent` | `A0TL` | 89-01 憤怒的頭槌 | `godie-h02k.q` | 0.5 | None |
| 375 | `duration` | `ggd-absent` | `A0TK` | 89-02 憤怒的菊花 | `godie-h02k.w` | 0.01 | None |
| 376 | `duration` | `ggd-absent` | `A0VB` | 90-002 換~身~! | `godie-h02r.ex` | 3.0 | None |
| 377 | `duration` | `ggd-absent` | `A0VG` | 90-002 超進化! 妙蛙花 | `godie-h02r.ex` | 0.0 | None |
| 378 | `duration` | `ggd-absent` | `A0NB` | 90-02 麻痺粉 | `godie-h02r.w` | 3.0 | None |
| 379 | `duration` | `ggd-absent` | `A0VD` | 90-02 腐蝕毒液 | `godie-h02r.w` | 2.0 | None |
| 380 | `duration` | `ggd-absent` | `A0W7` | 92-00-01 降低50%攻擊 | `godie-h02u.passive` | 3.0 | None |
| 381 | `duration` | `ggd-absent` | `A0W9` | 92-01 臥草泥馬 | `godie-h02u.q` | 0.0 | None |
| 382 | `duration` | `ggd-absent` | `A06Y` | 92-04 馬勒戈壁 | `godie-h02u.r` | 0.01 | None |
| 383 | `duration` | `ggd-absent` | `A0WC` | 92-04 馬勒戈壁 | `godie-h02u.r` | 0.01 | None |
| 384 | `duration` | `ggd-absent` | `A0WA` | 92-02 消化液 | `godie-h02u.w` | 7.0 | None |
| 385 | `duration` | `ggd-absent` | `A0BA` | 52-03 無銘斧劍 | `godie-hapm.e` | 0.6 | None |
| 386 | `duration` | `ggd-absent` | `A0E4` | 52-03-x 狂戰震地 | `godie-hapm.e` | 0.5 | None |
| 387 | `duration` | `ggd-absent` | `A0VJ` | 52-01 狂戰士之怒 | `godie-hapm.q` | 12.0 | None |
| 388 | `duration` | `ggd-absent` | `A000` | 01-03 畫龍點睛 | `godie-hart.e` | 5.0 | None |
| 389 | `duration` | `ggd-absent` | `A03Q` | 01-00 怒斬 | `godie-hart.passive` | 0.5 | None |
| 390 | `duration` | `ggd-absent` | `A02C` | 07-04 神聖結界 | `godie-hpb1.r` | 8.0 | None |
| 391 | `duration` | `ggd-absent` | `A0SJ` | 28-002 無限分裂 | `godie-huth.ex` | 25.0 | None |
| 392 | `duration` | `ggd-absent` | `A0SK` | 28-0021 分身 | `godie-huth.ex` | 15.0 | None |
| 393 | `duration` | `ggd-absent` | `A0T5` | 28-002 無限分裂 | `godie-huth.ex` | 0.01 | None |
| 394 | `duration` | `ggd-absent` | `A0CK` | 28-02 把你變成餅乾 | `godie-huth.w` | 0.01 | None |
| 395 | `duration` | `ggd-absent` | `A00J` | 48-03 魔法枷鎖 | `godie-hvsh.e` | 3.0 | None |
| 396 | `duration` | `ggd-absent` | `A06C` | 48-03 鮮血神殿 | `godie-hvsh.e` | 10.0 | None |
| 397 | `duration` | `ggd-absent` | `A0RN` | 48-00-00 Rider石化之眼 | `godie-hvsh.passive` | 4.0 | None |
| 398 | `duration` | `ggd-absent` | `A0S6` | 02-002 神通眼 | `godie-hvwd.ex` | 2.0 | None |
| 399 | `duration` | `ggd-absent` | `Aprg` | 02-00 淨化 | `godie-hvwd.passive` | 4.0 | None |
| 400 | `duration` | `ggd-absent` | `A0CE` | 02-01-r 破魔之箭 | `godie-hvwd.q` | 0.01 | None |
| 401 | `duration` | `ggd-absent` | `A0Z6` | 02-04 百鬼夜行 | `godie-hvwd.r` | 8.0 | None |
| 402 | `duration` | `ggd-absent` | `A11I` | 02-04-02 顯示 | `godie-hvwd.r` | 5.0 | None |
| 403 | `duration` | `ggd-absent` | `A059` | 42-00 魔法障壁 | `godie-n003.passive` | 9.0 | None |
| 404 | `duration` | `ggd-absent` | `A05B` | 42-01 凍結的大地 | `godie-n003.q` | 2.0 | None |
| 405 | `duration` | `ggd-absent` | `A05D` | 42-04 世界終結 | `godie-n003.r` | 0.01 | None |
| 406 | `duration` | `ggd-absent` | `A0P6` | 42-04-01 世界終結 | `godie-n003.r` | 3.0 | None |
| 407 | `duration` | `ggd-absent` | `A0D1` | 57-02 縮小燈 | `godie-n00b.e` | 10.0 | None |
| 408 | `duration` | `ggd-absent` | `A0JN` | 57-04 竹蜻蜓 | `godie-n00b.r` | 1.0 | None |
| 409 | `duration` | `ggd-absent` | `A00N` | 18-03-01 召喚毒蕈 | `godie-n00p.e` | 20.0 | None |
| 410 | `duration` | `ggd-absent` | `A0IH` | 18-03 妖狐變化 | `godie-n00p.e` | 0.0 | None |
| 411 | `duration` | `ggd-absent` | `A0IO` | 18-01 風華圓舞陣 | `godie-n00p.q` | 8.0 | None |
| 412 | `duration` | `ggd-absent` | `A00O` | 18-04-02 老樹盤根 | `godie-n00p.r` | 4.0 | None |
| 413 | `duration` | `ggd-absent` | `A0P7` | 18-04 億年樹 | `godie-n00p.r` | 0.01 | None |
| 414 | `duration` | `ggd-absent` | `A0PA` | 18-04-0x 老樹盤根 | `godie-n00p.r` | 1.0 | None |
| 415 | `duration` | `ggd-absent` | `A0CF` | 08-01 雙龍紋 | `godie-n01c.q` | 9.0 | None |
| 416 | `duration` | `ggd-absent` | `A0C0` | 86-04 打雷絕招 | `godie-o00k.r` | 0.5 | None |
| 417 | `duration` | `ggd-absent` | `A07T` | 53-03 破法對咒 | `godie-o00l.e` | 0.01 | None |
| 418 | `duration` | `ggd-absent` | `A0DS` | 53-03-x 破法對咒 | `godie-o00l.e` | 6.0 | None |
| 419 | `duration` | `ggd-absent` | `A0K1` | 53-01 獸王牙操彈 | `godie-o00l.q` | 0.01 | None |
| 420 | `duration` | `ggd-absent` | `A0DT` | 53-04 暴爆咒 | `godie-o00l.r` | 0.0 | None |
| 421 | `duration` | `ggd-absent` | `A0UE` | 53-04 暴爆咒 | `godie-o00l.r` | 5.0 | None |
| 422 | `duration` | `ggd-absent` | `A0DQ` | 53-02 強化炸彈陣 | `godie-o00l.w` | 0.98 | None |
| 423 | `duration` | `ggd-absent` | `A09E` | 09-03 超級賽亞人 | `godie-o00x.e` | 0.0 | None |
| 424 | `duration` | `ggd-absent` | `A0C3` | 58-03 就決定是你了!小智 | `godie-o02l.e` | 0.5 | None |
| 425 | `duration` | `ggd-absent` | `A0SL` | 58-002 打雷絕招 | `godie-o02l.ex` | 0.5 | None |
| 426 | `duration` | `ggd-absent` | `A040` | 58-04 瘋狂皮卡丘 | `godie-o02l.r` | 0.0 | None |
| 427 | `duration` | `ggd-absent` | `A04U` | 58-02 鋼鐵尾巴 | `godie-o02l.w` | 0.01 | None |
| 428 | `duration` | `ggd-absent` | `A11A` | 99-03a 初音戰意 | `godie-o02p.e` | 15.0 | None |
| 429 | `duration` | `ggd-absent` | `A11B` | 99-03 初音未來的消失 | `godie-o02p.e` | 0.0 | None |
| 430 | `duration` | `ggd-absent` | `A11F` | 99-002 把你給MikuMiku掉 | `godie-o02p.ex` | 15.0 | None |
| 431 | `duration` | `ggd-absent` | `A11C` | 99-04 世界第一的公主殿下 | `godie-o02p.r` | 4.0 | None |
| 432 | `duration` | `ggd-absent` | `A0YT` | 30-002 變態紳士 | `godie-o030.ex` | 0.0 | None |
| 433 | `duration` | `ggd-absent` | `A10I` | 30-002 EX變態針刺 | `godie-o030.ex` | 0.11 | None |
| 434 | `duration` | `ggd-absent` | `A09L` | 30-01 綁架 | `godie-o030.q` | 1.0 | None |
| 435 | `duration` | `ggd-absent` | `A01P` | 30-04 電車之狼衝擊 | `godie-o030.r` | 0.01 | None |
| 436 | `duration` | `ggd-absent` | `ANdh` | 30-02 酒精灌腸 | `godie-o030.w` | 9.0 | None |
| 437 | `duration` | `ggd-absent` | `Afae` | 72-03 超亮白 | `godie-ogld.e` | 8.0 | None |
| 438 | `duration` | `ggd-absent` | `A09B` | 72-002 億萬星殞落 | `godie-ogld.ex` | 30.0 | None |
| 439 | `duration` | `ggd-absent` | `ANmo` | 72-01洗刷刷 | `godie-ogld.q` | 4.0 | None |
| 440 | `duration` | `ggd-absent` | `A0CO` | 72-04 黑化 | `godie-ogld.r` | 0.2 | None |
| 441 | `duration` | `ggd-absent` | `A0F5` | 34-03 爆碎丸 | `godie-osam.e` | 0.5 | None |
| 442 | `duration` | `ggd-absent` | `ACdr` | 34-00 靈魂吞噬 | `godie-osam.passive` | 5.0 | None |
| 443 | `duration` | `ggd-absent` | `A0DO` | 39-03 無名神風流-蛟龍 | `godie-u00h.e` | 0.01 | None |
| 444 | `duration` | `ggd-absent` | `A07C` | 39-00 無名神風流-玄武 | `godie-u00h.passive` | 12.0 | None |
| 445 | `duration` | `ggd-absent` | `A0DG` | 39-01 無名神風流-白虎 | `godie-u00h.q` | 1.0 | None |
| 446 | `duration` | `ggd-absent` | `A0DJ` | 39-04 祕奧義．金色的神風 | `godie-u00h.r` | 1.0 | None |
| 447 | `duration` | `ggd-absent` | `A0Z4` | 39-02 無名神風流-朱雀 | `godie-u00h.w` | 0.01 | None |
| 448 | `duration` | `ggd-absent` | `A00T` | 74-03 -x 闇之天使 | `godie-u00j.e` | 0.3 | None |
| 449 | `duration` | `ggd-absent` | `A011` | 74-03-x 流星雨 | `godie-u00j.e` | 0.01 | None |
| 450 | `duration` | `ggd-absent` | `A0F4` | 74-03 闇之天使 | `godie-u00j.e` | 3.0 | None |
| 451 | `duration` | `ggd-absent` | `A0SW` | 74-03-x 流星雨 | `godie-u00j.e` | 1.0 | None |
| 452 | `duration` | `ggd-absent` | `A0S3` | 74-002 超新星 | `godie-u00j.ex` | 1.0 | None |
| 453 | `duration` | `ggd-absent` | `A0G5` | 74-04 最終殞落星 | `godie-u00j.r` | 0.9 | None |
| 454 | `duration` | `ggd-absent` | `A0HJ` | 71-03 厄夜靈魂 | `godie-u00k.e` | 3.0 | None |
| 455 | `duration` | `ggd-absent` | `A03L` | 71-01 死亡隕落 | `godie-u00k.q` | 0.0 | None |
| 456 | `duration` | `ggd-absent` | `A095` | 71-01-x 死亡隕落 | `godie-u00k.q` | 2.0 | None |
| 457 | `duration` | `ggd-absent` | `A0HG` | 71-01 屍靈裂 | `godie-u00k.q` | 0.05 | None |
| 458 | `duration` | `ggd-absent` | `A0HK` | 71-04 萬惡歸宗 | `godie-u00k.r` | 2.0 | None |
| 459 | `duration` | `ggd-absent` | `A08T` | 71-02 靈魂吸取 | `godie-u00k.w` | 0.01 | None |
| 460 | `duration` | `ggd-absent` | `A0HV` | 25-03 北斗百裂拳 | `godie-u00l.e` | 0.5 | None |
| 461 | `duration` | `ggd-absent` | `A10Y` | 25-002 喔拉喔拉喔拉喔拉 | `godie-u00l.ex` | 0.2 | None |
| 462 | `duration` | `ggd-absent` | `A07H` | 25-00 北斗暗殺拳 | `godie-u00l.passive` | 12.0 | None |
| 463 | `duration` | `ggd-absent` | `A0HW` | 25-04 ChangeDNA | `godie-u00l.r` | 0.0 | None |
| 464 | `duration` | `ggd-absent` | `A0IV` | 76-03 伸縮自如的槍亂打 | `godie-u00n.e` | 1.5 | None |
| 465 | `duration` | `ggd-absent` | `A0ZJ` | 76-002-00 霸王色效果 | `godie-u00n.ex` | 10.0 | None |
| 466 | `duration` | `ggd-absent` | `A0ZK` | 76-002 霸王色 | `godie-u00n.ex` | 0.01 | None |
| 467 | `duration` | `ggd-absent` | `A0IS` | 76-01 伸縮自如的橡膠戰斧 | `godie-u00n.q` | 0.01 | None |
| 468 | `duration` | `ggd-absent` | `A0IP` | 76-02 伸縮自如的橡膠火箭砲 | `godie-u00n.w` | 1.0 | None |
| 469 | `duration` | `ggd-absent` | `A0L2` | 78-03 廬山昇龍破 | `godie-u00v.e` | 0.01 | None |
| 470 | `duration` | `ggd-absent` | `A0L5` | 78-01 斬鐵拳 | `godie-u00v.q` | 1.0 | None |
| 471 | `duration` | `ggd-absent` | `A0L6` | 78-04 死亡噴射肘擊 | `godie-u00v.r` | 1.0 | None |
| 472 | `duration` | `ggd-absent` | `A0OH` | 38-00 邪眼全開 | `godie-u010.passive` | 0.0 | None |
| 473 | `duration` | `ggd-absent` | `A09K` | 38-04 黑龍波吸收 | `godie-u010.r` | 10.0 | None |
| 474 | `duration` | `ggd-absent` | `A09H` | 38-02 邪王炎殺煉獄焦 | `godie-u010.w` | 0.0 | None |
| 475 | `duration` | `ggd-absent` | `A06P` | 11-03 鬼氣九刀流-阿修羅壹霧銀 | `godie-u01u.e` | 1.0 | None |
| 476 | `duration` | `ggd-absent` | `A0CN` | 11-00x 三刀流效果 | `godie-u01u.passive` | 15.0 | None |
| 477 | `duration` | `ggd-absent` | `A0OU` | 11-00 三刀流 | `godie-u01u.passive` | 0.5 | None |
| 478 | `duration` | `ggd-absent` | `A0CC` | 11-01 燒鬼斬 | `godie-u01u.q` | 1.0 | None |
| 479 | `duration` | `ggd-absent` | `A0MQ` | 11-04 三千世界 | `godie-u01u.r` | 0.1 | None |
| 480 | `duration` | `ggd-absent` | `A06N` | 11-02 虎狩獵 | `godie-u01u.w` | 0.5 | None |
| 481 | `duration` | `ggd-absent` | `A08W` | 06-02 山形修煉-變 | `godie-u034.w` | 0.0 | None |
| 482 | `duration` | `ggd-absent` | `A0ZV` | 37-002 真‧黑核晶 | `godie-ubal.ex` | 0.01 | None |
| 483 | `duration` | `ggd-absent` | `S001` | 37-00 鬼眼 | `godie-ubal.passive` | 5.0 | None |
| 484 | `duration` | `ggd-absent` | `A01Z` | 37-04 魔界之王 | `godie-ubal.r` | 35.0 | None |
| 485 | `duration` | `ggd-absent` | `A0OT` | 37-04-01 魔力操控 | `godie-ubal.r` | 3.0 | None |
| 486 | `duration` | `ggd-absent` | `A0CH` | 65-03 魔法膨脹 | `godie-udea.e` | 1.0 | None |
| 487 | `duration` | `ggd-absent` | `A0FF` | 65-002 永恆的愚蠢鄉 | `godie-udea.ex` | 0.01 | None |

## 4. ⛔ 這一份改了什麼

**一個出貨數值都沒有。** owner 常設:「公式已定好,只要公式本身自洽,我們只調系統倍率」。

