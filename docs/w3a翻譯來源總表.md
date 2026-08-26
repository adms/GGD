# w3a 翻譯來源總表

> ⛔ **這一份是產生的,不可以手改。** 重生成：
> ```bash
> pnpm w3a:build     # 重生成
> pnpm w3a:check     # 唯讀:過期就回非零
> ```
> 產生器 `tools/w3a-translate/gen.py`;第②層的抽取器是 `tools/w3x-import/build_ability_w3a.py`。

> owner 2026-08-26:「你應該做的事情是 **翻譯 JASS to 編輯器JSON**,如果 **JSON 沒支援的標籤或邏輯則去實作**才對阿」
> owner 2026-08-26:「這個的做法還會**缺一個部分**就是 **w3x 原始技能的設定特效與機制包含傷害方式**,也請一起考慮翻譯進去」

⇒ 翻譯的來源是**兩層**,⛔ 不是只有 JASS:

| 層 | 是什麼 | 誰抽 |
|---|---|---|
| **① JASS 觸發器** | 演出時序 · 生成 · 縮放 · 清場 | `tools/w3x-import/extract_jass_spells.py` · `tools/jass-combo/extract.py` |
| **② w3a 物件資料** | **base 機制** · **傷害方式** · Data 欄 · 距離/範圍/冷卻/魔耗/持續/目標 · **特效欄** · **音效欄** | `tools/w3x-import/build_ability_w3a.py` ⇒ 本檔 |

母體:**1538 支** w3a 技能,其中 **452 支**接得到 GGD 出貨技能。

---

## 1. 逐欄:w3a 的這一格翻到 GGD 的哪一格

⚠️ 「帶值支數」是**量出來的**(從 `ABILITY_W3A.json` 數),⛔ 不是估計。

| w3a 欄位 | 抽取後的鍵 | 帶值支數 | → GGD 落點 |
|---|---|---:|---|
| `acdn` | `stats.cooldown` | 718 | ability@1.cooldown[] ／ cooldownTier |
| `amcs` | `stats.mana` | 683 | ability@1.manaCost[] ／ manaCostTier |
| `aran` | `stats.cast_range` | 320 | ability@1.range ／ rangeTier（⚠️ WC3 世界單位,要換算） |
| `aare` | `stats.area` | 401 | effect.radius ／ radiusTier（⚠️ 同上） |
| `adur` | `stats.duration` | 591 | effect.durationSec（對雜兵） |
| `ahdu` | `stats.hero_duration` | 573 | ⚫ **GGD 沒有這一格** —— 對英雄減時是一個缺的機制 |
| `atar` | `stats.targets_allowed` | 393 | ability@1.targetsEnemies ＋ 效果的 filter（w3x 的集合比布林細） |
| `abuf` | `stats.buffs` | 291 | applyStatus.statusId ／ applyBuff（w3h 是第二條特效通道） |
| `acas` | `stats.castTime` | 130 | ability@1.castTimeSec |
| `aart` | `icon` | 534 | ability@1.icon |
| `acat/atat/aeat/asat/amat/aaea` | `art.models` | 530 | ability@1.vfxKey → content/vfx/* |
| `alig` | `art.models.LightningEffect` | 41 | 電弧家族（Lightning.slk 的列,⛔ 不是模型） |
| `aefs/aefa` | `art.sounds` | 31 | ability@1.sfxKey（⭐ owner 2026-08-20 點名的「特效音效綁定」） |
| `acap/aspt/ata0..5` | `art.attach` | 183 | 球體綁定位置（⭐ owner 點名;vfx.bone-attachment@1） |
| `atp1/aub1` | `（ubertip）` | 745 | ability@1.description ＋ {{cd}}/{{mp}}/{{dmg}} 佔位 |
| `Data A–I` | `data[]` | 1402 | 語意隨 base 而異 —— 見 §3 的逐 base 字典 |

### 特效／音效／掛點欄(⭐ owner 點名的那三項)

| 群 | 欄位碼 | 支數 |
|---|---|---:|
| `models` | `TargetArt` | 262 |
| `models` | `Missileart` | 225 |
| `models` | `CasterArt` | 173 |
| `attach` | `Targetattach` | 161 |
| `models` | `EffectArt` | 88 |
| `models` | `SpecialArt` | 81 |
| `attach` | `Targetattach1` | 77 |
| `attach` | `Targetattach2` | 72 |
| `attach` | `Casterattach` | 51 |
| `models` | `LightningEffect` | 41 |
| `sounds` | `Effectsound` | 28 |
| `models` | `Areaeffectart` | 17 |
| `attach` | `Specialattach` | 11 |
| `sounds` | `Effectsoundlooped` | 4 |
| `attach` | `Targetattach3` | 2 |
| `attach` | `Targetattach4` | 1 |

⚠️ 這一份記的是**地圖寫了什麼**(w3a 覆寫),⛔ 不解析庫存 `*AbilityFunc.txt` 的繼承 ——
「最終生效的模型」住 `tools/w3x-import/build_vfx_bindings.py`,重寫一次就是第二個住處。

---

## 2. base 分佈 —— ⭐ 這是一個 **K 個模板**的題目,⛔ 不是 N 輪

| # | base | 自訂技能 | 累計 |
|--:|---|--:|--:|
| 1 | `Asph` | 75 | 75 |
| 2 | `ANcl` | 42 | 117 |
| 3 | `AOsh` | 38 | 155 |
| 4 | `AHtb` | 29 | 184 |
| 5 | `Aspb` | 28 | 212 |
| 6 | `Aegr` | 25 | 237 |
| 7 | `AOws` | 24 | 261 |
| 8 | `AOcr` | 24 | 285 |
| 9 | `AHbh` | 23 | 308 |
| 10 | `AHtc` | 21 | 329 |
| 11 | `ANin` | 20 | 349 |
| 12 | `AItx` | 19 | 368 |
| 13 | `Aamk` | 19 | 387 |
| 14 | `AEev` | 17 | 404 |
| 15 | `AEIl` | 17 | 421 |
| 16 | `AOcl` | 17 | 438 |
| 17 | `Absk` | 15 | 453 |
| 18 | `Arel` | 15 | 468 |
| 19 | `AEer` | 13 | 481 |
| 20 | `ANsb` | 13 | 494 |

---

## 3. Data 欄字典 —— 同一個索引在不同 base 底下是不同的東西

⛔ 「col 3 = 200.0」讀不出任何東西。下面每一欄都帶 **欄位碼 → World Editor 官方欄位名**,
由 `Units\AbilityMetaData.slk` ＋ `UI\WorldEditStrings.txt` 推導(⛔ 不是手寫的對照表)。

| base | 1 (DataA) | 2 (DataB) | 3 (DataC) | 4 (DataD) | 5 (DataE) |
|---|---|---|---|---|---|
| **`ANcl`** | `Ncl1` 跟隨經過時間 | `Ncl2` 目標類型 | `Ncl3` 選項 | `Ncl4` 美術時間 | `Ncl5` 中止其他能力 |
| **`AOsh`** | `Osh1` 傷害 | `Osh2` 傷害上限 | `Osh3` 距離 | `Osh4` 最終區域 | — |
| **`AHtb`** | `Htb1` 傷害 | — | — | — | — |
| **`Aspb`** | `spb1` 法術列表 | `spb2` 分散的法術等候時間 | `spb3` 最少法術 | `spb4` 最多法術 | `spb5` 基本順序ID |
| **`Aegr`** | `Def1` 承受傷害 (%) | `Def2` 造成傷害 (%) | — | — | `Def5` 魔法傷害降低 |
| **`AOws`** | `Wrs1` 傷害 | — | — | — | — |
| **`AOcr`** | `Ocr1` 致命一擊機率 | `Ocr2` 傷害乘數 | `Ocr3` 傷害加成 | `Ocr4` 閃避機率 | `Ocr5` 絕不失誤 |
| **`AHbh`** | `Hbh1` 狂怒擊機率 | `Hbh2` 傷害乘數 | `Hbh3` 傷害加成 | `Hbh4` 失手機率 | `Hbh5` 絕不失誤 |
| **`AHtc`** | `Htc1` AOE傷害 | `Htc2` 特殊目標傷害 | `Htc3` 移動速度降低 (%) | `Htc4` 攻擊速度降低 (%) | — |
| **`ANin`** | `Uin1` 傷害 | `Uin2` 持續時間 | `Uin3` 衝擊延遲 | — | — |
| **`AItx`** | `Iatt` 攻擊加成 | — | — | — | — |
| **`Aamk`** | `Iagi` 靈敏度加成 | `Iint` 智慧加成 | `Istr` 力量加成 | `Ihid` 隱藏按鍵 | — |
| **`AEev`** | `Eev1` 閃避的機率 | — | — | — | — |
| **`AEIl`** | `Eme1` 一般形態部隊 | `Eme2` 變形旗標 | `Eme3` 高度調整時間 | `Eme4` 著陸延遲時間 | `Eme5` 其他形態生命點數加成 |
| **`AOcl`** | `Ocl1` 每個目標傷害 | `Ocl2` 目標擊中次數 | `Ocl3` 每個目標降低傷害 | — | — |
| **`Absk`** | `bsk1` 移動速度增加 | `bsk2` 增加攻擊速度 | `bsk3` 增加承受傷害 | — | — |
| **`Arel`** | `Ihpr` 生命點數每秒重生 | — | — | — | — |
| **`AEer`** | `Eer1` 每秒傷害 | — | — | — | — |
| **`ANsb`** | `Htb1` 傷害 | — | — | — | — |

---

## 4. 傷害方式 —— 每一個 scaling 軸的 GGD 落點

⭐ **這一節有兩個方向的閘**(同 `editorCapabilities.ts`):宣告 `supported` 而引擎沒有 → 產生器硬錯;
宣告 `missing` 而引擎其實有了 → 一樣硬錯(要求刪掉那一列)。⛔ 一張手寫的支援表會過期而且不會有東西紅。

| w3x 文案的軸 | 狀態 | GGD 落點 | 引擎裡的證據 |
|---|---|---|---|
| `ad` | ⭐ 翻得過去 | `Scaling.ratios[{stat:"ad"}]` | `Stat.AttackDamage = "ad"` |
| `agi` | ⭐ 翻得過去 | `Scaling.attrRatios[{attr:"agi"}]` | 同 `str` —— 同一個列舉、同一條 `resolveScaling` |
| `gold` | ⛔ **要去實作** | `（無）` | 經濟狀態不在 `Scaling` 的任何讀法裡(`ratios` 讀 `Stat`、`attrRatios` 讀三圍、`resourcePct` 只讀 health/mana) |
| `heroLevel` | ⛔ **要去實作** | `（無）` | `Stat` 列舉裡沒有「等級」這個名詞,`attrRatios` 只收 str/agi/int,`resourcePct` 只讀 health/mana ⇒ 「英雄等級×N」在三個住處都寫不出來 |
| `int` | ⭐ 翻得過去 | `Scaling.attrRatios[{attr:"int"}]` | 同 `str` —— 同一個列舉、同一條 `resolveScaling` |
| `maxHealth` | ⭐ 翻得過去 | `Scaling.ratios[{stat:"maxHealth"}]` | `Stat.MaxHealth = "maxHealth"` |
| `maxMana` | ⭐ 翻得過去 | `Scaling.ratios[{stat:"maxMana"}]` | `sim/stats/statTypes.ts` 的 `Stat.MaxMana = "maxMana"` —— 本來就在詞彙裡,20-03 的「魔力×0.4」翻得過去,只是沒人翻 |
| `missingHealth` | ⭐ 翻得過去 | `damage.resourcePct{subject:"self",resource:"health",basis:"missing"}` | `effects/_shared.ts::zResourcePctTerm` 的 basis 收 `missing`(= 最大 − 現存);出貨的 虛哭神去 godie-i007「自身已損失的生命百分比」走的就是這一格 |
| `str` | ⭐ 翻得過去 | `Scaling.attrRatios[{attr:"str"}]` | `common.ts` 的 `attrRatios` 收 str/agi/int;`sim/effects/effect.ts::resolveScaling` 第 4 個參數(必填)就是三圍讀取器,而 damage/damageLine/damageArea/dot/chainLightning/heal/shield 七個消費端全部傳 `casterAttrs(ctx)` |

⭐ 引擎現有的詞彙(**推導**,⛔ 不是抄的):

- `Stat`（23 個）：`ad ap armor as cdr cooldownDrainRate critChance critDamage evasion healthRegen lifesteal manaRegen maxHealth maxHitPctMaxHp maxMana mr ms outputDamagePct outputHealingPct outputShieldPct range spellVamp unavoidablePct`
- `Scaling.attrRatios.attr`：`agi int str`
- `damage/dot.resourcePct`：subject `self target` · resource `health mana` · basis `current max missing`

---

## 5. ⛔ 這一份沒有裁決任何數值

owner 常設:「**公式已定好,只要公式本身自洽,我們只調系統倍率**」。
這一份的工作是**讓落差看得見**(見 `docs/w3a落差表.md`),⛔ 不是替他挑數字。

