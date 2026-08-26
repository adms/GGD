# BASE-VOCAB — WC3 base 技能 → GGD 機制詞彙對照，與缺的標籤

> lane: BASE-VOCAB · 2026-08-26 · ⛔ 唯讀稽核，**沒有動任何出貨檔**
> 機器可讀的字典：`docs/_reports/BASEVOCAB_temp_20260826-1500.dict.json`（262 個 base）

---

## 0. TL;DR（五行）

1. **823 支**英雄命名的自訂技能（`xx-nn 名稱`）建在 **201 個** WC3 base 上；
   前 44 個 base 就蓋掉 **439 支（53%）**，⇒ ⭐ 這是一個 **K 個模板** 的題目，⛔ 不是 823 輪。
2. ⭐ **翻譯的字典找到了，而且是權威的**：`AbilityMetaData.slk`（`War3x.mpq`/`War3Patch.mpq`）
   ＋ `WorldEditStrings.txt` 可以把 `data` 欄索引還原成 **w3a 欄位碼 → World Editor 官方欄位名**
   （`Osh1` → 「傷害」、`Osh2` → 「傷害上限」…）。**在此之前這一層是猜的。**
3. **第一名的 base 是 `ANcl` Channel（40 支）** —— 它**沒有任何 base 機制**。
   ⇒ 那 40 支的機制 **100% 住在 `war3map.j`**，w3a 只提供施法框架。
4. **七個缺的標籤**（§5），按「作者真的寫了值」排序：
   **傷害上限 34** · **行進波（距離＋最終區域）35** · **法術書容器 24**
   · **絕不失誤 19** · **階梯衰減半徑 11** · **忽視傷害/硬皮 7** · **序列波 3**。
5. ⚠️ 20-03 的落差**不是**孤例：`ubertip` 帶著公式（`魔力*0.4+350`）而 w3a 的 `Osh1` 是 **0** ——
   ⇒ ⭐ **「w3a 欄位是 0」本身就是一個訊號：這支技能的傷害在 JASS 裡。**

---

## 1. 方法與來源（可重跑）

| 層 | 檔 | 我從它拿到什麼 |
|---|---|---|
| ① w3a 物件資料 | `tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` | 1,538 筆 ability，其中 **1,359 筆 custom**；`base` / cooldown / mana / cast_range / area / duration / targets_allowed / `data` |
| ①' w3a 原始位元 | `.../raw/war3map.w3a` | ⭐ **每一個 mod 的 4-char 欄位碼**（`OBJECTS.json` 只留了欄位**索引**，碼被丟掉了） |
| ② Blizzard 母表 | `tools/w3x-import/out/stock/STOCK_ABILITIES.json` | base rawcode → `comments`（官方技能名）、`code`（指令碼） |
| ③ ⭐ **新** 欄位字典 | `war3.mpq`/`War3x.mpq`/`War3Patch.mpq` 的 `Units\AbilityMetaData.slk` ＋ `UI\WorldEditStrings.txt` | **欄位碼 → World Editor 顯示名**（755 列 metadata、7,412 條 WESTRING） |
| ④ GGD 詞彙 | `sim/effects/variants/*.ts`（**46 個 effect kind**）· `content/editorCapabilities.ts`（**49 筆 capability**）· `content/ability-templates/`（**46 個模板**）· `content/status-effects/`（**43 個狀態**） | 對面有什麼 |

⚠️ **`data` 的形狀（踩過才知道）**：外層 key = **資料欄索引**（1=DataA、2=DataB…），
內層 key = **等級**。⛔ 不是「外層等級」。欄位碼由 `w3xlib/objdata.py::_data_col_of`
的 `dataColumn` 還原（權威），第 4 字元的數字只是 fallback。

⚠️ **兩個誠實的限制**：
- `STOCK_ABILITIES.json` 只保留了 `DataA1`（`stock_ability_data.py::SCALAR`）
  ⇒ **base 的 DataB..DataF 預設值這個 repo 裡沒有**。要它就得再讀一次 SLK。
- ⭐ **w3a 欄位有值 ≠ 那個機制真的在跑**。這張地圖大量使用「base 只當殼、機制在 JASS」
  的寫法（§3 的 `ANcl`）。所以 §5 的「擋住幾支」量的是**作者真的寫了一個非 0／非 99999 的值**，
  ⛔ 不是「這支技能一定需要這個機制」。JASS 側的交叉驗證是 **JASS lane 的事**，⛔ 不是這一份。

---

## 2. base 分佈（前 44 = 439 支英雄技能 = 53%）

`all` = 全部自訂技能（含道具/單位）；`hero` = 名字符合 `^\d\d-\d` 的英雄技能。

| # | base | all | hero | 累計 hero | WC3 官方名 |
|--:|---|--:|--:|--:|---|
| 1 | `ANcl` | 42 | **40** | 40 | Illidan - Channel |
| 2 | `AOsh` | 38 | **29** | 69 | Chieftain - Shock Wave |
| 3 | `AHtb` | 29 | 25 | 94 | Mountain King - Thunder Bolt |
| 4 | `Aspb` | 28 | 24 | 118 | **Spell Book** |
| 5 | `Aegr` | 25 | 23 | 141 | Elune's Grace（防禦欄族 `Def*`） |
| 6 | `AOws` | 24 | 22 | 163 | Chieftain - War Stomp |
| 7 | `AHbh` | 23 | 21 | 184 | Mountain King - Bash |
| 8 | `AOcr` | 24 | 19 | 203 | Blade Master - Critical Strike |
| 9 | `AHtc` | 21 | 19 | 222 | Mountain King - Thunder Clap |
| 10 | `Aamk` | 19 | 19 | 241 | Attribute Modifier Skill |
| 11 | `AEIl` | 17 | 17 | 258 | Illidan - Metamorphosis |
| 12 | `Absk` | 15 | 15 | 273 | Beserk |
| 13 | `AEev` | 17 | 14 | 287 | Demon Hunter - Evasion |
| 14 | `ANin` | 20 | 13 | 300 | Inferno |
| 15 | `ANsb` | 13 | 13 | 313 | Rexxar - Storm Bolt（欄位＝`Htb1`） |
| 16 | `AEer` | 13 | 10 | 323 | Keeper - Entangling Roots |
| 17 | `AOcl` | 17 | 9 | 332 | Farseer - Chain Lightning |
| 18 | `AUcs` | 13 | 9 | 341 | Dreadlord - Carrion Swarm |
| 19 | `Assk` | 9 | 9 | 350 | Hardened Skin |
| 20 | `Awar` | 13 | 8 | 358 | Pulverize |
| 21 | `ANcs` | 8 | 8 | 366 | Cluster Rockets |
| 22 | `AEtq` | 8 | 8 | 374 | Tranquility |
| 23–44 | （`AItx` `Awrs` `Atau` `Scri` `ANbr` `AUfn` `AIfb` `ACro` `AIsx` `Aroa` `ANde` `AOwk` `Awfb` `AEbl` `ANss` `AUim` `ACct` `AIcf` `ACac` `AIcs` `Alit` `Aasl`） | | 65 | **439** | |
| 長尾 | 156 個 base | | 349 | 823 | 每個 ≤ 6 支 |

⭐ **`Asph` Sphere 有 75 個 custom 但只有 4 支是英雄技能** —— 它幾乎全部是**視覺球體附掛**
（`DUMMY_ORB.md` 量到 316 次 `AddSpecialEffectTargetUnitBJ`）。
⇒ ⛔ 不要把它當成一個要實作的機制：它是 `spawnModelFx` ＋ `attachment@1` 的內容題。

---

## 3. ⭐ Data 欄字典（翻譯用；⛔ 沒有它就只能猜）

> 逐欄 = `索引 → 欄位碼 → World Editor 官方欄位名`（③ 的來源）。
> 全部 262 個 base 在 `BASEVOCAB_temp_20260826-1500.dict.json`。

### 高頻 base 的完整字典

| base | 1 (DataA) | 2 (DataB) | 3 (DataC) | 4 (DataD) | 5+ |
|---|---|---|---|---|---|
| **`AOsh`** Shock Wave | `Osh1` **傷害** | `Osh2` **傷害上限** | `Osh3` **距離** | `Osh4` **最終區域** | — |
| **`AUcs`** Carrion Swarm | `Ucs1` 傷害 | `Ucs2` 傷害上限 | `Ucs3` 距離 | `Ucs4` 最後區域 | — |
| **`ANcl`** Channel | `Ncl1` 跟隨經過時間 | `Ncl2` 目標類型 | `Ncl3` 選項 | `Ncl4` 美術時間 | `Ncl5` 中止其他能力 |
| **`AHtb`** Thunder Bolt | `Htb1` 傷害 | — | — | — | （暈眩秒數走 `duration`/`hero_duration`） |
| **`Aspb`** Spell Book | `spb1` **內含技能清單**（字串，逐級） | `spb2` 分散的法術等候時間 | `spb3` 最少法術 | `spb4` 最多法術 | — |
| **`Aegr`** 防禦族 | `Def1` 承受傷害 (%) | `Def2` 造成傷害 (%) | — | — | `Def5` 魔法傷害降低 · `Def6` **反彈機率** · `Def7` 反彈所受傷害（穿刺） · `Def8` 反彈所受傷害（法術） |
| **`AOws`/`Awrs`** War Stomp | `Wrs1` 傷害 | `Wrs2` 地形變形振幅 | `Wrs3` 地形變形持續(µs) | — | — |
| **`AOcr`** Critical Strike | `Ocr1` 致命一擊機率 | `Ocr2` 傷害乘數 | `Ocr3` 傷害加成 | — | `Ocr5` **絕不失誤** |
| **`AHbh`** Bash | `Hbh1` 狂怒擊機率 | — | `Hbh3` 傷害加成 | `Hbh4` 失手機率 | `Hbh5` **絕不失誤** |
| **`AHtc`** Thunder Clap | `Htc1` AOE 傷害 | — | `Htc3` 移動速度降低 (%) | `Htc4` 攻擊速度降低 (%) | — |
| **`Aamk`** Attribute Modifier | `Iagi` 敏捷加成 | `Iint` 智慧加成 | `Istr` 力量加成 | `Ihid` 隱藏按鍵 | — |
| **`AEIl`/`AEme`** Metamorphosis | — | — | — | — | `Eme5` 其他形態生命點數加成 |
| **`Absk`** Berserk | `bsk1` 移動速度增加 | `bsk2` 增加攻擊速度 | `bsk3` **增加承受傷害** | — | — |
| **`AEev`** Evasion | `Eev1` 閃避的機率 | — | — | — | — |
| **`ANin`** Inferno | `Uin1` 傷害 | `Uin2` 持續時間 | `Uin3` **衝擊延遲** | — | — |
| **`AEer`** Entangling Roots | `Eer1` 每秒傷害 | — | — | — | （定身秒數走 `duration`） |
| **`AOcl`** Chain Lightning | `Ocl1` 每個目標傷害 | `Ocl2` 目標擊中次數 | `Ocl3` 每個目標降低傷害 | — | — |
| **`Assk`/`Ansk`** Hardened Skin | `Ssk1` 降低傷害機率 (%) | `Ssk2` 最小傷害 | `Ssk3` **忽視的傷害** | `Ssk4` 含遠距 | `Ssk5` 含近戰 |
| **`Awar`** Pulverize | `War1` 動地跺機率 (%) | `War2` 造成傷害 | `War3` **全面傷害半徑** | `War4` **減半傷害半徑** | — |
| **`ANcs`** Cluster Rockets | `Ncs1` 傷害數量 | `Ncs2` 傷害間隔 | `Ncs3` 投射武器數 | `Ncs4` **最高傷害** | `Ncs5` 建築因子 · `Ncs6` 效果期限 |
| **`AUim`** Impale | `Uim1` **每波間隙** | `Uim2` **每波時間(秒)** | `Uim3` 造成傷害 | `Uim4` **空中時間(秒)** | — |
| **`AEtq`** Tranquility | `Etq1` 回復生命 | `Etq2` 回復間隙 | `Etq3` 建築削減 | — | — |
| **`AOwk`** Wind Walk | `Owk1` 變動時間 | `Owk2` 增加移動速度 (%) | `Owk3`/`Owk4` **背刺傷害** | | — |
| **`AEbl`** Blink | `Ebl1` 最大範圍 | `Ebl2` 最小範圍 | — | — | — |
| **`Aasl`** Slow Aura | `Slo1` 移動速度要素 | `Slo2` 攻擊速度要素 | `Slo3` 永遠自動施法 | — | — |
| **`ANsi`** Silence | `Nsi1` 預防攻擊 | — | `Nsi3` 移動速度修正 | `Nsi4` 攻擊速度修正 | — |
| **`AOmi`** Mirror Image | `Omi1` 影像數量 | `Omi2` 造成傷害(%) | `Omi3` 承受傷害(%) | — | — |
| **`ANms`** Mana Shield | `Nms1` 每點生命的法力 | `Nms2` 吸收的傷害 (%) | — | — | — |
| **`ANab`** Acid Bomb | `Nab1` 移速減緩(%) | `Nab2` 攻速減緩(%) | `Nab3` 護甲懲罰 | `Nab4` 主要傷害 | `Nab5` 次要傷害 |
| **`AEsh`** Shadow Strike | `Esh1` 腐化傷害 | `Esh2` 移動速度要素 | — | `Esh4` 延遲的力量 | `Esh5` 初始傷害 |
| **`AEfk`** Fan of Knives | `Efk1` 每個目標傷害 | `Efk2` **傷害總計上限** | — | `Efk4` 調整最高速度 | — |
| **`AHfs`** Flame Strike | `Hfs1` 造成全面傷害 | `Hfs2` 全面傷害間隙 | `Hfs3` **造成一半傷害** | — | `Hfs5` 削減建築 · `Hfs6` **最大傷害力** |
| **`Amnx`** Death Damage | `Dda1` **全面傷害半徑** | `Dda2` 全面傷害量 | `Dda3` **部份傷害半徑** | `Dda4` 部份傷害量 | — |
| **`Aroa`/`ACro`** Roar | `Roa1` 增加傷害(%) | `Roa2` 增加防禦 | `Roa3` 生命回復率 | `Roa4` 法力重生 | — |

⚠️ **道具族的欄位碼是助記字不是數字尾**（`Iatt` 攻擊加成、`Iagi`/`Istr`/`Iint`、`Ilif`、
`Iman`、`Imvb`、`Ihpr`、`Ivam`、`Imrp`）—— `objdata.py` 的檔頭已經記錄過這件事害過一次
（86 件道具漏了 139 條 modifier）。⇒ ⛔ 翻譯道具技能時**不要**用第 4 字元推欄位。

---

## 4. base → GGD 的表達（⭐ 有對應的那一半）

> 判準：**「這個 base 的每一個 data 欄，GGD 有沒有一格接得住？」**
> ⛔ 不是「GGD 有沒有一個名字很像的東西」。

| WC3 base（族） | GGD 的表達 | 完整度 |
|---|---|---|
| `ANcl` Channel | ⭐ **不需要 base 機制** —— 它就是「這支技能的一切都在觸發器裡」。GGD 的對應是 `ability@1` 本身（`castTimeSec` / cooldown / cost）＋ 一串 `effects` | ✅ 全 |
| `AHtb`/`ANsb`/`Awfb` Thunder Bolt | `damage` ＋ `applyStatus{stun}`（`content/status-effects/stun.json`），投射走 `spawnProjectile` | ✅ 全 |
| `AOws`/`Awrs`/`AOw2` War Stomp | `damageArea` ＋ `applyStatus{stun}` | ✅ 全（`Wrs2`/`Wrs3` 地形變形＝純視覺，`screenShake` 代之） |
| `AHtc`/`ACtc` Thunder Clap | `damageArea` ＋ `applyStatus{slowXX}`（43 個狀態文件裡有 `slow20…slow60`） | ⚠️ 移速與攻速**同一格**：`Htc3`/`Htc4` 分開，GGD 的 `slowXX` 是單一狀態 ⇒ 要兩個狀態或一個帶兩格的 buff |
| `AOcl`/`AOhw`/`ACfl` Chain Lightning | `chainLightning`（`amount`↔`Ocl1` · `jumps`↔`Ocl2` · `decay`↔`Ocl3`） | ✅ 全（GGD 還多了 `revisit` / `jumpIntervalSec`） |
| `AEer` Entangling Roots | `applyStatus{root}` ＋ `dot`（`Eer1`＝每秒傷害） | ✅ 全 |
| `AUfn` Frost Nova | `damageArea` ＋ `applyStatus{slowXX}` | ✅ 全 |
| `AEbl` Blink | `blink`（`Ebl1`↔最大範圍） | ⚠️ `Ebl2` **最小範圍**沒有對應格 |
| `AEIl`/`AEme` Metamorphosis | `championForm{to:"alternate"}` ＋ champion 的 alternate 表 | ✅ 全（`Eme5` 生命加成 → form 的 stat 表） |
| `Absk`/`AIxk` Berserk | `applyBuff`（ms/as ＋ `Def1` 型的承受傷害） | ✅ 全 |
| `AEev`/`ACev`/`AIev` Evasion | `Stat.Evasion` ＋ `evasion` effect（`dodgesAbilities`/`dodgesTrueDamage` 是 GGD 多的） | ✅ 全 |
| `AOcr`/`AIcs`/`ACct` Critical Strike | `Stat.CritChance` ＋ `Stat.CritDamage`（`Ocr1`/`Ocr2`）；`Ocr3` 傷害加成 → `flat` modifier | ⚠️ `Ocr5` **絕不失誤**沒有對應（§5-④） |
| `AHbh`/`ANb2`/`AIbx`/`ACbh` Bash | `hook`（on-attack）＋ `applyStatus{stun}`＋機率 | ⚠️ 同上，`Hbh5` 絕不失誤 / `Hbh4` 失手機率沒有格 |
| `Aamk`/`AIx5`/`AIs6`/`AIaz`/`AIi6` 屬性加成 | `grantAttribute` ／ item modifiers | ✅ 全 |
| `AItx`/`AIlz`/`AIbm`/`AIms`/`AIsx`/`AIs2`/`Arel`/`AIrm` 純數值道具 | modifiers（`ad`/`maxHealth`/`maxMana`/`ms`/`as`/`healthRegen`/`manaRegen`） | ✅ 全 |
| `AIva`/`AIpv` Vampiric | `Stat.Lifesteal` ＋ `Stat.SpellVamp` | ✅ 全 |
| `Aegr` 防禦族 `Def1/Def2/Def5` | `applyBuff` modifiers（承受/造成/魔法減免） | ✅ 全 |
| `Aegr` `Def6/Def7/Def8` 反彈 · `AUts`/`ANth` 荊棘 | `incomingReflect`（`reflectedDamageSource` / `reflectedDamageType`） | ⚠️ **反彈是百分比不是「要素」**；`AOls` 的 `Uls5` 反彈界限沒有格 |
| `Aasl`/`ACac`/`ACav`/`AUau`/`AEar`/`AOr2`/`Aoar`/`ACnr` 光環族 | `sim/auraCarrier.ts` ＋ `aura.scale-by-nearby@1`(partial) | ⚠️ partial |
| `Atau` Taunt | `taunt`（`durationSec`/`radius`/`maxTargets`/`side`） | ✅ 全（GGD 還有 `effect.taunt-reverse@1`） |
| `ANsi` Silence · `Amls` Aerial Shackles · `Acrs` Curse · `Aprg` Purge | `applyStatus` 的六個布林（root/stun/silenced/berserk/feared/disarmed）＋ `dispel` | ⚠️ `effect.control-restriction@1` 宣告 **unsupported**（沒有可組合的控制模型，只有六個布林） |
| `AOwk` Wind Walk | `sim/stealth.ts`（隱形）＋ `breakStealth` | ⚠️ **`Owk3`/`Owk4` 背刺傷害沒有格**（破隱一擊加成） |
| `ANss` Spell Shield · `AIsr` Runed Bracers · `Aam2` Anti-magic | `defense.block-source@1`(**partial**)：`BlockGrant` 有四個授權面 | ⚠️ Block 是**削減**不是**整發否決**；⛔ 而且「擋下的那一刻」不觸發 hook |
| `ANms` Mana Shield | `manaBarrier`（`defense.mana-barrier@1` partial） | ⚠️ partial |
| `ANcs`/`ANc3` Cluster Rockets · `ACmo` Monsoon | `randomArea`（`scheduler.random-area@1` partial）＋ `tpl-random-barrage` | ⚠️ `Ncs2` 傷害間隔／`Ncs6` 效果期限接不接得住要逐格對 |
| `ANin` Inferno · `Arai` Raise Dead · `ANr3` · `Aspy` · `AOmi` Mirror Image · `Arsg` · `Arsp` | `summon`（`count`/`durationSec`/`hpMult`/`damageMult`/`body:"self"`/`formation`） | ✅ 全（`Uin3` 衝擊延遲 → `delayed`） |
| `AEtq` Tranquility · `ACnr` · `Alsh` · `AEim` Immolation · `Apxf` | `dot` ／ `heal` ＋ `delayed`／`tpl-periodic-field` | ✅ 全 |
| `AOeq` Earthquake · `AHfs` Flame Strike | `damageArea` ＋ `delayed`（`tpl-periodic-field`） | ⚠️ 見 §5-⑤ 階梯半徑 |
| `Asal` Pillage | `grantGold` | ✅ 全 |
| `Afbk` Feedback · `AEmb` Mana Burn | `spendMana` ＋ `swapResource` ＋ `effect.event-value-conversion@1`(partial) | ⚠️ 「燒掉多少就打多少」要靠 `eventValueConversion`，partial |
| `Asph` Sphere · `Alit` Lightning Attack · `Asth` Storm Hammers | `spawnModelFx` ＋ `attachment@1` ＋ `vfx.bone-attachment@1`(**supported**) | ✅ 全（純視覺，見 §2 註） |
| `ANca` Cleaving Attack | `damageArea` 掛在 on-hit hook 上 | ✅ 全 |
| `ANde` Demolish · `ANba` Black Arrow · `ANab` Acid Bomb · `AEsh` Shadow Strike | `applyBuff` modifiers ＋ `dot` ＋ `applyStatus` | ✅ 全 |

⭐ **結論：46 個 effect kind ＋ 43 個狀態 ＋ 46 個模板已經蓋掉這張表的大部分。**
真正接不住的只有下面七個，⛔ 而且它們都不是「再多一個技能」，是**七個機制**。

---

## 5. ⛔ 缺的標籤 —— 按「作者真的寫了值的英雄技能支數」排序

> ⚠️ **量法（可反駁）**：對每一個 base 的每一格 data 欄，取 World Editor 官方欄位名做關鍵字比對；
> 一支英雄技能只要在那一格寫了**非 0 且非 99999** 的值就算一支。
> ⛔ 它**不保證**那個機制真的在跑（可能被 JASS 蓋掉），也⛔ 不保證 GGD 的重製版需要它 ——
> 它回答的是「**原作在這一格放了設計意圖**」。

| # | 缺的標籤（建議 key） | 擋住 | 主要 base | WC3 欄位 | 為什麼現有的接不住 |
|--:|---|--:|---|---|---|
| ① | **`effect.line-wave@1`** 行進波（距離＋最終區域＋速度） | **35** | `AOsh` 21 · `AUcs` 6 · `ACsh` 4 · `AOeq` 2 · `ACfl`/`ANfl` 各 1 | `Osh3` 距離 · `Osh4` **最終區域** | GGD 的 `damageLine` 是**瞬發膠囊**（`length`/`width`，沒有時間軸）；`spawnProjectile{pierce}` 會飛但 **`hitRadius` 固定**、⛔ 不會沿途變寬。**29 支 `AOsh` 裡有 13 支的最終區域 ≠ 初始寬度** ⇒ 「波會擴散」是作者寫進去的意圖 |
| ② | **`damage.total-budget@1`** 一次施放的**總傷害預算** | **34** | `AOsh` 14 · `AUcs`/`ANcs`/`ANc3` 各 4 · `ACsh`/`AHfs` 各 3 · `AEfk`/`ANbf` 各 1 | `Osh2`/`Ucs2` **傷害上限** · `Efk2` 傷害總計上限 · `Ncs4` 最高傷害 · `Hfs6` 最大傷害力 | GGD 有 `maxTargets`（**個數**）與 `falloff`（**距離衰減**），⛔ **沒有跨受害者的傷害總額**。例：`35-04 光牙` 上限 2000/4000/6000、`57-01 空氣砲` 1200→4200 —— 這是**每級都在調**的設計旋鈕 |
| ③ | **`ability.grant-set@1`** 法術書／技能容器 | **24**（其中數支是 UI 用途） | `Aspb` | `spb1` **內含技能清單**（逐級疊加）· `spb3`/`spb4` 最少/最多 | `championForm` 只有 `base`↔`alternate` **二選一**；⛔ 沒有「這一級授予這 N 支子技能」。例：`16-01 超．占事略決` 是 1→2→3→4 支**逐級疊加**；`76-04-01 三檔法術書` 一次授予三支 |
| ④ | **`attack.never-miss@1`** 絕不失誤（無視迴避/失手） | **19** | `AHbh` **14** · `AOcr`/`AIcs`/`ANb2`/`ACbh`/`ANdb` 各 1 | `Hbh5`/`Ocr5` 絕不失誤 · `Hbh4` 失手機率 | GGD 的 `Stat.Evasion` 與 `evasion` effect 全在**防守方**；⛔ 攻擊方沒有「這一發不會被閃」的旗標。⚠️ **21 支 Bash 裡有 14 支開著它** ⇒ 這不是罕見選項 |
| ⑤ | **`damage.tiered-radius@1`** 階梯衰減（全額半徑 / 半額半徑） | **11** | `Amnx` 4 · `Awar` 3 · `AHfs` 2 · `Asd3` 2 | `War3`/`War4` · `Dda1..Dda4` · `Hfs1`/`Hfs3` | `damageArea.falloff` 是**線性內插**（圓心滿額→半徑處 ×falloff）；WC3 是**階梯**（R1 內滿額、R1–R2 半額）。例：`26-02 亂入` 全額 250 / 減半 350 |
| ⑥ | **`defense.flat-ignore@1`** 硬皮（機率性**固定值**減傷＋下限） | **7** | `Assk` 6 · `Ansk` 1 | `Ssk1` 降低傷害機率 · `Ssk2` 最小傷害 · `Ssk3` **忽視的傷害** | GGD 的 `armor`/`mr` 是**百分比**；`BlockGrant` 是削減但沒有「最小傷害下限」這一格。例：`03-00 相轉移裝甲`、`52-00 神性`、`80-002 戰無不勝` |
| ⑦ | **`scheduler.line-sequence@1`** 序列波（沿一條線逐段爆發） | **3** | `AUim` | `Uim1` 每波間隙 · `Uim2` 每波時間 · `Uim4` **空中時間** | `knockback.launchHeight` 有了（人會被拋起），⛔ 但「沿線每 X 距離、每 Y 秒引爆下一段」這個排程器沒有。⚠️ `tpl-locust-line` 是**逐位元不同**的東西（那是飛行物不是地面序列） |

### ⭐ 按第〇·五守則的做法（⛔ 不要逐支做）

1. **①＋②應該一起做** —— 它們是同一個 effect 的兩格（`AOsh`/`AUcs`/`ACsh` 兩欄都寫）。
   一個 `effect.line-wave@1` 帶 `travelSpeed` / `startWidth` / `endWidth` / `totalDamageBudget`
   ⇒ **一次解鎖 ~40 支**，而且把 `damageLine`（瞬發）與 `spawnProjectile`（飛行）之間那個洞補起來。
2. **④是一格布林** —— 落在 damage 封包上（`ignoresEvasion`），成本最低而擋住 19 支。
3. **⑤是 `damageArea.falloff` 多一種模式**（`falloffMode: "linear" | "stepped"` ＋ `innerRadius`）
   ⇒ ⛔ 不是新 kind。
4. **③是唯一一個真的新東西**（技能容器），而且它與 `championForm` 的關係要先想清楚 ——
   ⚠️ 它有一部分是 **UI**（`00-00-02 任務列表`），⛔ 不要把 UI 需求做成戰鬥機制。

### ⛔ 三個**看起來缺、其實不缺**的（列出來避免下一輪重做一次）

| 看起來缺 | 其實 | 證據 |
|---|---|---|
| Sphere 球體附掛 | `spawnModelFx`(78 用) ＋ `vfx.bone-attachment@1` **supported** | `editorCapabilities.ts` |
| Mirror Image 影像傷害/受傷比例 | `summon.hpMult` / `summon.damageMult` / `body:"self"` | `variants/summon.ts` |
| Mana Shield | `manaBarrier`（partial，但欄位對得上 `Nms1`/`Nms2`） | `variants/manaBarrier.ts` |

---

## 6. ⚠️ 個案：20-03 的 scaling 軸落差（主 session 已查證，這裡補上量到的普遍性）

```
w3a  A0D5 base=AOsh   Osh1 傷害 = 0（四級全 0）  Osh2 上限 = 0   Osh3 距離 = 200   Osh4 最終區域 = 200
ubertip                「前方直線敵人受到 |魔力*0.4+350| 點傷害」
GGD  damageLine{ amount:{ damageTier:"中", ratios:[{stat:"ap", coeff:1.0}] } }
```

⭐ **三件事同時成立，而沒有任何地方看得見它們打架**：

1. **scaling 軸不同**：原作是 `maxMana × 0.4`，GGD 是 `ap × 1.0`。
   ⚠️ ⭐ **`maxMana` 本來就在 `Stat` 列舉裡**（`sim/stats/statTypes.ts`）⇒ **翻得過去，只是沒人翻**。
2. **`Osh1 = 0` 是訊號不是缺值**：這支技能的傷害整段在 JASS。
   ⇒ ⭐ **建議加一條稽核**：`Osh1/Ucs1/Htb1 == 0` 而 ubertip 出現數字 ⇒ 標記「機制在觸發器裡」。
3. **`Osh3 距離 = 200` 而 `cast_range = 900`** ⇒ 波只走 200？那與「直線波」的文案不合
   ⇒ 這也是 JASS 覆寫的痕跡。

⛔ **我沒有改任何傷害數值**（owner 常設：公式已定，只調系統倍率）。
⭐ 我建議的是**讓落差看得見**：一條把「w3a/ubertip 的 scaling 軸」與「出貨 JSON 的 `ratios[].stat`」
並排的產生器＋`--check` 閘 —— 對不上就紅，⛔ 而不是自動改數字。

---

## 7. 下一步（給下一條 lane 的三件事，按序）

1. ⭐ **把 §3 的字典變成一支產生器**（`tools/w3x-import/extract_ability_meta.py`），
   輸出 `tools/w3x-import/out/stock/ABILITY_FIELD_DICT.json`。
   ⚠️ 現在這份字典是**這一輪臨時算出來的**，⛔ 沒有寫入點、⛔ 沒有 `--check` ⇒ **它會過期**。
   （這一輪的 JSON 是 `docs/_reports/BASEVOCAB_temp_20260826-1500.dict.json`，⛔ 是暫存不是產物。）
2. **做 ①＋② 那一個機制**（`effect.line-wave@1` ＋ `totalDamageBudget`）—— 一次 ~40 支。
3. **加「scaling 軸落差」稽核**（§6-3），⛔ 不要自動改數字。

---

### 這一輪動的檔（⛔ 沒有 git 寫入、⛔ 沒有跑任何全域鎖指令）

| 檔 | 狀態 |
|---|---|
| `docs/_reports/BASEVOCAB_temp_20260826-1500.md` | ⭐ **新增**（這一份） |
| `docs/_reports/BASEVOCAB_temp_20260826-1500.dict.json` | ⭐ **新增**（262 個 base 的機器可讀字典） |

⛔ 沒有動 `content/`、⛔ 沒有動 `tools/`、⛔ 沒有動任何出貨技能的傷害數值。
