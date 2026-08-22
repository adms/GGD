# 票務補件報告 —— #544 兩件道具 · #554 的「346 支」· 三個等裁決的票

> lane 產出（唯讀調查，⛔ 沒有改任何程式／內容／票）。
> ⛔ 這份是暫存報告（`_temp_`），過期後歸 `docs/legacy/`。
> ⭐ 下面每一節都寫成**可以直接貼進 GitHub issue body 的 markdown**。主 session 負責寫票。

---

## 0. 三句話

1. **#544** —— 兩件道具的完整資訊查齊了。⭐ 最重要的一件事：GGD 的
   `attributes.strGrowth` / `agiGrowth` **69 位英雄全部是 0**，而 `baseStats.ap`
   **全部是 0（只有成長）** ⇒ 朗基努斯之槍換不換 AP，是「**把一件屬性道具改成 AP 道具**」，
   ⛔ 不是「同一個數字換個寫法」。而 `godie-i018.authoringNote` 裡那段
   「lv10 ≈ 53 敏 → 53%」的 MEASURED 數字**今天是錯的**（它假設屬性會隨等級成長）。
2. **#554** —— ⭐ **owner 的直覺是對的，「346 支原作沒有音效」這個數字沒有根據。**
   逐支查完：**17 支證明原作有音效**（6 支 JASS 鏈式 + 11 支 w3a 物件資料），
   **230 支根本沒查過**（rawcode join 失敗／rawcode 不在 JASS／沒有施法閘），
   真正「查得到證據、而且證據說沒有音效」的只有 **101 支**。
   ⭐ 根因有三個，其中一個是**一行 `.upper()`**（見 §2.4）。
3. **⚠️ 順帶推翻票裡另一個數字**：#554 寫「348 支走元素風聲 / 通用音」，實際是
   **51 支**有元素風聲、**297 支**播的是**同一個** `abilityCast` clip ——
   因為 `ELEMENT_SFX` 只收 fire / ice / lightning 三種，而 `void`(55) `physical`(37)
   `arcane`(29) `holy`(26) `nature`(26) `ki`(19) `wind`(14) `blood`(13) `earth`(6)
   `sound`(4) 共 **229 支**全部 `?? null` 掉到通用音。

---

# ① #544 —— 兩件道具，owner 不必開檔案就能決定

> ⭐ owner 2026-08-22 逐字：「#544 `godie-i018` 的「總力量」換不換 AP⋯
> => **你寫id我根本不知道是什麼技能跟說明你也太懶了吧**」

## 1-A `godie-i018` = **朗基努斯之槍**（神器 · tier 2 · 合成品）

### 卡面（逐字，出貨中）

```
神器
效能
力量+12
敏捷+12
[普通攻擊時] (總敏捷)% 機率性造成等同 (總力量) 之閃電傷害
[淨化] 普通攻擊時機率移除目標身上的增益

解說
據說是沾有神之血的傳說武器，無法判定是否為真品。
```

### 現在的 JSON 效果（`content/items/godie-i018.json`）

| 卡面那一句 | JSON |
|---|---|
| 力量+12 敏捷+12 | `attributes: {str: 12, agi: 12}` |
| **(總敏捷)% 機率** | `passive[0].chanceFrom = {attr:"agi", basis:"total", coeff:0.01, min:0, max:1}` |
| **等同 (總力量) 之閃電傷害** | `passive[0].effects[0].amount.attrRatios = [{attr:"str", basis:"total", coeff:1}]`，`damageType: "magic"` |
| [淨化] | `passive[1] = {on:"onBasicAttack", chance:0.1, effects:[{kind:"dispel", polarity:"buff", count:1}]}` |
| ⚠️ 卡面**沒有**攻速 | owner 2026-08-01 裁定「取消攻速加成」，`modifiers` 一條都沒有 |

### ⭐ 換算前 / 換算後，各是什麼數字

公式來自 `tools/ap-conversion/knobs.json`（唯一住處）：
`AP% = round_halfUp(coeff × 0.25 × 100 ÷ 10) × 10`，下限 10%。
`力量×1` ⇒ **30% [AP]**。

| | 現在（不換） | 換成 AP 之後 |
|---|---|---|
| 公式 | 傷害 = **總力量 × 1.0** | 傷害 = **[AP] × 30%** |
| 卡面會變成 | 「等同 (總力量) 之閃電傷害」 | 「造成 30% [AP] 之閃電傷害」 |

**⭐ 實際數字（量的是出貨 `content/champions/` 69 位）**

| 量到的 | 值 |
|---|---:|
| `attributes.str` 中位數 / 最大 | **17 / 32** |
| ⭐ `attributes.strGrowth` | **69 位全部是 0** —— ⛔ 力量**不隨等級成長** |
| `attributes.agi` 中位數 / 最大 | **17 / 32**（agiGrowth 同樣全 0） |
| ⭐ `baseStats.ap` | **69 位全部是 0** |
| `growth.ap` > 0 的 | 47 位，最大 **2.92 / 級** |
| 出貨道具給 flat AP 的 | **13 件**，最高 **369**（月牙魔杖）、333（雅典娜的驚嘆號）、255、228、174… |

⇒ 攤成一次普攻的期望傷害（乘減傷前）：

| 情境 | 現在（總力量×1） | 換 AP（AP×30%） |
|---|---:|---:|
| 中位英雄 lv1，只帶這把槍 | 17 + 12 = **29** | 0 × 0.3 = **0** |
| 中位英雄 lv10，沒有 AP 裝 | **29**（不隨等級變） | ≈29 AP × 0.3 ≈ **9** |
| 中位英雄 lv10，帶一件月牙魔杖 | **29** | (29+369) × 0.3 ≈ **119** |
| 力量最高的英雄（32），沒有 AP 裝 | 32 + 12 = **44** | ≈9 |

**觸發率**（同樣不隨等級變）：中位英雄 17 + 12 = **29%**，敏捷最高的 40 + 12 = **52%**。
⚠️ `authoringNote` 裡寫的「lv10 ≈ 53 敏 → 53% / lv15 ≈ 64 敏 → 64%」是**過期的**
（它假設 `agiGrowth = 2.3/級`，而出貨資料是 0）。

### 誰會用它

- **合成鏈**：`貫雷槍`（godie-i01g，tier 3）＋ `朗基努斯之槍製作書`（godie-i024，**3,750 金**）。
  ⚠️ 這兩件今天都在 `content/_legacy/items/` ⇒ **這件神器目前買不到也合不出來**（另一條缺口，⛔ 不是這題）。
- **設計上的使用者**：近戰、力量/敏捷雙吃的普攻型英雄（它的兩個軸都是三圍，⛔ 不吃法強）。
- ⭐ **換成 AP 之後，它的使用者會整個換人** —— 從「堆三圍的普攻英雄」變成「堆 AP 的法系普攻英雄」。

### ⭐ 這一題要 owner 回答的是

> 「等同總力量」數學上就是 `力量×1` ⇒ 公式算得出 **30% [AP]**。
> 但它是**基準式**（`basis: "total"`，對應原作 `GetHeroStatBJ(…, true)`），
> ⛔ 不是裁決裡說的那種「乘數幾倍屬性」。

| 選項 | 結果 |
|---|---|
| **A. 換**（要的是「三圍不再直接餵任何傷害」這個系統性結果） | 卡面改成「30% [AP]」。⚠️ 沒有 AP 裝時它幾乎不造成傷害（9 點），帶 AP 裝時比現在強 4 倍 |
| **B. 不換**（保留這件神器「堆力量→變強」的識別特徵） | 現況不動，並把 `exemptions.json` 那一列改成「已裁決保留」＋貼上原話 |
| **C. 換一半** | 例如 `AP×30% + 總力量×0.5`（⛔ 這是新機制，需要新欄位） |

---

## 1-B `godie-i02t` = **盾甲天書**（法器 · tier 2 · 合成品 · 1,200 金）

### 卡面（逐字，出貨中 —— ⭐ 傷害那一半**已經換算過了**）

```
法器
施展需求魔力：350點
技能冷卻時間：60秒
效能
奇門之術

解說
相傳盾甲術與煉金術系出同源，在一邊對敵方造成傷害的同時能回復友軍生命，
亦有傳說此書與大惡魔撒但有關。
點選施展奇門之術，對範圍內敵方傷害(222+150% [AP])，回復友軍血量(222+智慧*6)。
```

**換算前的原文逐字**（第一·五守則：被取代的知識不可以無聲消失）：
「對範圍內敵方傷害(**222+智慧\*6**)，回復友軍血量(222+智慧\*6)」

### 現在的 JSON 效果

| | |
|---|---|
| `modifiers` | **無** |
| `passive` | **無** |
| 主動效果 | **無** |
| ⇒ | ⚠️ **這份文件一格效果酬載都沒有** —— 卡面上這兩個數字**今天在場上都不會發生**（道具主動技能尚未實作，⛔ 不是這次換算造成的） |

### ⭐ 換算前後各是什麼數字

`智慧×6` ⇒ `6 × 0.25 × 100 = 150` ⇒ **150% [AP]**。

| | 傷害那一半 | 治療那一半 |
|---|---|---|
| 原文 | 222 + **智慧×6** | 222 + **智慧×6** |
| 現況 | ⭐ **222 + 150% [AP]**（已換） | ⚠️ **222 + 智慧×6**（沒換，等裁決） |

**實際數字（69 位英雄）**：`attributes.int` 中位數 **18**、最大 **127**
⇒ `智慧×6` = 中位 **108**、最高 **762**。
`[AP]` 中位（lv10、無 AP 裝）≈ 29 ⇒ `150% [AP]` ≈ **44**；帶一件月牙魔杖 ≈ **597**。

⇒ ⭐ **同一句話裡的同一個數字，現在一半是新制一半是舊制**：
傷害走 AP、治療走智慧。卡面上兩個「222+…」看起來一樣，實際上是兩套系統。

### ⭐ 這一題要 owner 回答的是

> owner 的原話是「屬性額外**傷害**」，而「回復友軍血量」不是傷害。
> ⛔ lane 不替 owner 決定「治療酬載要不要吃 [AP]」。

| 選項 | 結果 |
|---|---|
| **A. 一起換** | 卡面變成「回復友軍血量(**222+150% [AP]**)」。⭐ 一句話裡兩邊一致 |
| **B. 不換** | 治療繼續吃智慧 ⇒ 這件道具的兩半分屬兩套成長系統。要把 `exemptions.json` 那一列改成「已裁決保留」＋貼原話 |
| **C. 治療自己一套係數** | 例如治療吃 `AP × 100%`（比傷害低）⇒ 需要 `knobs.json` 多一格 `healApPct` |

### 誰會用它

- **合成鏈**：`山之書`（godie-i00r，2,785 金，流星雨）＋ `澤之書`（godie-i02q，2,785 金，自我修復）
  ＋ `盾甲天書製作書`（godie-i02z，2,500 金）。
  ⚠️ 這三件今天都在 `content/_legacy/items/` ⇒ **同樣合不出來**。
- **設計上的使用者**：智慧型／輔助型英雄（同時要傷害與團隊回復）。

---

# ② #554 —— 「346 支原作沒有音效」這個數字**是錯的**

> ⭐ owner 2026-08-22 逐字：「#554 346 支原作沒有音效的技能⋯
> => **不可能沒有，你票裡面也不記載是哪些也太偷懶了，我怎麼可能有足夠資訊判斷**」

## 2-A 先把現況數字修正（票裡兩個數字都要改）

| 票裡寫的 | 實際量到的 | 怎麼量的 |
|---|---|---|
| 348/420 沒有 `sfxKey` | ✅ **對**（348 / 420） | 掃 `content/abilities/*.json` |
| 「其餘 348 支走元素風聲 → 通用音」 | ⛔ **元素風聲只有 51 支**，**297 支播同一個 `abilityCast` clip** | `ELEMENT_SFX` 只收 `fire`/`ice`/`lightning`（`apps/client/src/audio/combatSfx.ts:164`）；其餘 11 種元素 `?? null` |
| 「346 支原作沒有音效」 | ⛔ **沒有根據**（見下） | |

**348 支的實際落點**

| 走哪一條 | 支數 |
|---|---:|
| `castElementKey` → `magicLightning` | 25 |
| `castElementKey` → `magicFire` | 18 |
| `castElementKey` → `magicIce` | 8 |
| ⭐ **`"abilityCast"` 通用音（同一個 clip）** | **297** |
| 靜音 | 0 |

其中被丟掉的元素：`void` 55 · `physical` 37 · `arcane` 29 · `holy` 26 · `nature` 26 ·
`ki` 19 · `wind` 14 · `blood` 13 · `earth` 6 · `sound` 4 · 無 `vfxKey` 35 · 其他形狀 33。

⇒ ⭐ **「要不要配音效」這一題的實際嚴重度比票裡寫的高**：
不是「280 支聽起來像自己的元素」，是**297/420（71%）播同一個音**。

## 2-B ⭐ 逐支重查的結果 —— 346 拆成六格

方法（⛔ 不是重跑舊抽取器，是**獨立**再查一遍，見 §2.5）：
對每一支沒有 `sfxKey` 的技能解析出 w3x rawcode，再從 `war3map.j`
以 `GetSpellAbilityId() == 'RC'` 找它**真正的施法觸發器**、沿 `gg_trg_*` 追 3 跳，
再加查 `war3map.w3a` 的物件資料音效欄位。

| # | 分類 | 支數 | 「原作沒有音效」這句話成不成立 |
|---|---|---:|---|
| ① | **沒有 rawcode**（join 失敗） | **63** | ⛔ **不成立** —— 根本沒查到那支原作技能 |
| ② | rawcode 在 `war3map.j` **完全沒出現** | **76** | ⛔ **不成立** —— 它是純物件資料技能，音效在 w3a／暴雪基礎技能裡 |
| ② | rawcode 有出現但**沒有施法閘** | **91** | ⛔ **不成立** —— 只在 AI 學習表之類的地方出現 |
| ③ | ⭐ **有施法閘叢集、叢集裡確實沒有 `gg_snd`** | **101** | ✅ **成立**（唯一有證據的一格） |
| ④ | ⭐ **原作有音（JASS 鏈式追到）** | **6** | ⛔ **反證** |
| ⑥ | ⭐ **原作有音（w3a 物件資料 `aefs`/`aefl`）** | **11** | ⛔ **反證** |

⇒ ⭐ **346 → 101**。其餘 **230 支是「沒查過」，⛔ 不是「沒有」**，另外 **17 支是查到有**。

### ⭐ 17 支反證（⛔ 這些原作**真的有音效**）

**④ JASS 施法閘 → `gg_trg_*` 鏈式追到（6 支）**

| id | 技能 | 英雄 | rawcode | 原作音效 |
|---|---|---|---|---|
| `godie-edem.e` | 45-03 千鳥 | 寫輪眼復仇者 - 宇智波佐助 | `A0IJ` | `gg_snd_ThunderBoltMissileDeath` |
| `godie-efur.e` | 13-03 龍頭戲畫。布陣 | 揍敵客大家長 - 揍敵客桀諾 | `AEtq` | `gg_snd_GlueScreenMeteorHit1` · `gg_snd_GryphonRiderMissileLaunch3` |
| `godie-h02u.e` | 92-03 消化液 | 看似憂鬱的神獸 - 草泥馬 | `A0WB` | `gg_snd_Taunt` |
| `godie-nsjs.w` | 18-02 寄生種子 | 妖狐藏馬 - 南野秀一 | `A0RV` | `gg_snd_SpiritOfVengeanceYes3` |
| `godie-o02l.e` | 58-03 就決定是你了!小智 | 皮卡丘 | `A0C3` | `gg_snd_sawch`（⚠️ 已知：原作自己就播不出來） |
| `godie-ofar.e` | 58-03 就決定是你了!小智 | 神奇寶貝兒 - 皮卡丘 | `A0C3` | `gg_snd_sawch`（同上） |

⇒ 扣掉兩支 sawch，**4 支是全新的反證**。

**⑥ `war3map.w3a` 物件資料自帶 `aefs`/`aefl`（11 支）**

| id | 技能 | rawcode | w3a 欄位 |
|---|---|---|---|
| `godie-e008.w` | 21-01 火羽 | `A0BH` | `aefs: Flare1` · `aefl: Flare2` |
| `godie-e00w.e` / `godie-e00x.e` | 77-03 GLADIARIA ALAT | `A0JG` | `aefs: StormEarthFireSound` |
| `godie-hvwd.ex` | 02-002 神通眼 | `A0S6` | `aefs: MetalHeavyBashStone` |
| `godie-n003.ex` / `godie-n01g.ex` | 42-002 魔力印章 | `A06K` | `aefs: StormEarthFireSound` |
| `godie-n01c.ex` / `godie-nbbc.ex` | 08-002 龍魔人 | `A0T1` | `aefs: StormEarthFireSound` |
| `godie-o02l.r` / `godie-ofar.r` | 58-04 瘋狂皮卡丘 | `A040` | `aefs: StormEarthFireSound` |
| `godie-u00v.r` | 78-04 死亡噴射肘擊 | `A0L6` | `aefs: MetalHeavyBashStone` |

## 2-C ⭐ 交叉驗證：owner 要的「隨機 10 支」

上面那 17 支就是逐支查出來的反證。另外抽查三條線，全部指向同一個結論：

| 抽查 | 結果 |
|---|---|
| `war3map.j` 裡的 `PlaySound*` 呼叫 | **221 個**（`PlaySoundOnUnitBJ` 146 · `PlaySoundBJ` 68 · `PlaySoundAtPointBJ` 7），散在 **141 個** trigger 家族。其中 **76 個家族沒有任何 `GetSpellAbilityId` 閘**（第二段觸發器：`*_Effect` / `*_Move` / `*Run` / `*EX`）⇒ 舊掃描器**看不到它們** |
| `war3map.w3a` 的物件資料 | **31 支**技能帶 `aefs`/`aefl` 音效欄位，⭐ 而 GGD 的抽取器**從來沒有讀過這兩個欄位**（見 §2-D-③） |
| 英雄天生技（`.passive` / `.ex`）的 JASS | ⭐ **78 支** passive/EX 的英雄 `unit-*.j` 切片裡有 `gg_snd`。⚠️ **這不是綁定證據**（那些切片是 5,000 行的「英雄啟動叢集」，一份裡混著十幾個家族），但它證明**這條路從來沒有被查過** —— 而 63 支「join 失敗」裡有 **50 支**正是 `.passive`(25) 與 `.ex`(25) |

## 2-D ⭐ 根因三個（⛔ 都不是「原作真的沒音效」）

### ① 一行 `.upper()` —— 28/69 位英雄的 hero-numbers join 直接壞掉

`tools/w3x-import/scan_ability_effects.py` 第 ~250 行：

```python
hero_rc = cid.split("-", 1)[1].upper()   # godie-edem → "EDEM"
nn = HERO_TO_NUMBER.get(hero_rc)
```

⛔ **w3x rawcode 是大小寫敏感的**：`Edem` · `Efur` · `Hart` · `Ogrh` · `Nsjs` …

| 量到的 | |
|---|---:|
| content 英雄 | 69 |
| `.upper()` 之下 join 成功 | **41** |
| ⭐ **不分大小寫**之下 join 成功 | **68**（唯一失敗的是 `zombiex`，它沒有 w3x 原作） |

⇒ **28 位英雄（41%）掉到脆弱的「用技能名字比對」備援路**，而 GGD 有自己的命名層
（`ggd-naming-layer`：改名不是缺陷）⇒ 名字對不上 ⇒ `rawcode = None` ⇒ 自動變成 `NO_WC3_SOUND`。
⭐ 這正是 **#542 的同一個形狀**：看起來完全正常，只是少了 41%。

### ② 掃描器只看「rawcode 字面出現在哪個函式」，⛔ 沒有走施法閘

它把 rawcode 出現的**任何**位置的外圍函式當成該技能的觸發器叢集。實際結果：

| | |
|---|---:|
| 被判「有 rawcode + 有叢集但無音」的 209 支中，叢集含 `AILearning` 的 | **124** |
| 其中叢集**只有** `AILearning`（＝AI 學習表，⛔ 不是技能處理器） | **71** |

⇒ 那 71 支的「沒有音效」是**掃錯函式**的結果。
⭐ 正解是走 `GetSpellAbilityId() == 'RC'`（本報告用的方法）：全圖 **278 個** rawcode 有施法閘。

### ③ ⭐ w3a 的音效欄位**從來沒有被抽出來過**

`tools/w3x-import/src_objects.py` 逐一具名抽 `anam`/`acdn`/`amcs`/`aran`/… 共 15 個欄位，
其餘交給 `raw_mods(..., numeric_only=True)`。
⇒ **`aefs`（Effect Sound）與 `aefl`（Effect Sound Looped）是字串，被 `numeric_only` 濾掉** ——
實測 `OBJECTS.json` 裡 1,538 支技能的 `rawMods` **全部是空的 `{}`**。

而直接解 `war3map.w3a` 量到：**31 支**技能帶著 `aefs`/`aefl`
（`Flare1` · `StormEarthFireSound` · `MetalHeavyBashStone` · `PenguinSqueek` ·
`ReviveUndead` · `UndeadDissipate` · `DeathAndDecayLoop` · `HeroDeathKnightYesAttack` …）。

⚠️ **而且這還只是地圖自己覆寫的那些。**
348 支裡有 **285 支**繼承一個暴雪基礎技能（`AEIl` 16 · `Aegr` 13 · `ANcl` 11 · `AHbh` 10 ·
`AOsh` 9 · `AHtb` 9 · `AOcr` 8 · `AEev` 8 · `AEme` 8 · `AHfs` 4 · `AOwk` 4 …），
而**基礎技能的 EffectSound 住在暴雪的 `AbilityData.slk` 裡，那一層我們一個位元組都沒有抽**。
⇒ ⭐ **owner 說「不可能沒有」——在原作引擎的意義上他是對的**：
一支繼承 Flame Strike / Blink / Carrion Swarm 的技能，就算 JASS 一行都沒寫，暴雪也會替它播音。

### ④ ⚠️ 順帶：這一切建立在一份 **2026-07-25** 的抽取產物上

`tools/w3x-import/out/GoDieEX22s-src/EFFECT_AUDIT.json` 的 mtime 是 **7/25**，
而 `content/abilities/` 最新改動是 **8/22 21:32**。
比對：**25 支技能是這份 audit 之後才新增的**（`godie-e010.*` · `godie-o030.*` ·
`godie-zombiex.*` 等），它們**從來沒有被任何 JASS 對照掃過**，卻一起被算進「346 支沒有音效」。

## 2-E ⭐ 給 owner 的三選一（重寫版）

⚠️ 舊版問的是「346 支原作沒有音效的技能要不要配？」——**那個前提是錯的**。
正確的問法拆成兩題：

### 題一：**要不要先把證據補齊？**（⛔ 這一題不是三選一，是要不要花這個時間）

| | 做什麼 | 成本 | 會拿到什麼 |
|---|---|---|---|
| **A1** | 修 §2-D 的三個根因（`.upper()` · 施法閘 · `aefs`/`aefl`），重跑抽取 | 小（一支腳本 + 一條守衛） | ⭐ 230 支「沒查過」變成**有答案**；預估再撈出數十支原作音效 |
| **A2** | 再補暴雪 `AbilityData.slk` 的基礎技能 EffectSound | 中（要一份 slk） | 285 支繼承技能的原作音效 |
| **A3** | 不補，照現況決定 | 0 | ⛔ 決定會建立在 30% 的證據上 |

### 題二：**101 支（＋補齊後剩下的）真的沒有原作音效的，要配什麼？**

| | 方案 | 成本 | 風險 |
|---|---|---|---|
| **B1** | ⭐ **先把 `ELEMENT_SFX` 的 11 種缺元素補上** —— `void`/`physical`/`arcane`/`holy`/`nature`/`ki`/`wind`/`blood`/`earth`/`sound` | **小**（一張表，⛔ 不是機制） | ⭐ 一次讓 **229 支**從「跟所有人同一個音」變成「有自己的元素聲」 |
| **B2** | 用**既有 135 個 `wc3.*` clip** 依「技能標籤 × 元素」再配一輪（⛔ 不新增素材） | 中 | 原作沒有的音配上去＝我們在創作，要 owner 認可 |
| **B3** | 為技能新錄／新採專屬音（効果音ラボ 授權已在） | 高 | 素材量大；辨識度最高 |
| **B4** | 維持現狀 | 0 | 297/420 播同一個音 |

⭐ **B1 的成本效益比其他三個高一個數量級**，而且它跟「原作有沒有音效」完全無關 ——
⛔ 它是今天就壞著的東西（11 種元素的 whoosh 全部掉到通用音），⛔ 不是一個設計選擇。

## 2-F ⭐ 逐支清單（owner 要的「是哪些」）

> ⚠️ 完整 348 列在下面。⭐ 貼進 issue 時建議只貼 **④/⑥ 的 17 支反證**與 **③ 的 101 支**，
> 其餘兩格（①②）用一句「230 支沒查過」帶過並連到這份報告。


#### ① 沒有 rawcode（join 失敗） —— 63 支

| id | 技能 | 英雄 | w3x rawcode | join |
|---|---|---|---|---|
| `godie-e001.ex` | 22-002 月光下的決鬥者 | 蟬在叫人壞掉 - 龍宮禮奈 | `—` | NONE  |
| `godie-e008.ex` | 21-002 天破壤碎 | 火霧戰士 - 夏娜 | `—` | NONE  |
| `godie-e00n.ex` | 22-002 月光下的決鬥者 | 蟬在叫人壞掉 - 龍宮禮奈 | `—` | NONE  |
| `godie-e00s.ex` | 70-002 樹海降臨 | 白木老樹精 - 白木卡迪那 | `—` | NONE  |
| `godie-e00s.passive` | 70-00 紮根 | 白木老樹精 - 白木卡迪那 | `—` | NONE  |
| `godie-e00w.passive` | 77-00 浮雲-旋一閃 | 神鳴流劍士 - 櫻綻剎那 | `—` | NONE  |
| `godie-e00x.passive` | 77-00 浮雲-旋一閃 | 神鳴流劍士 - 櫻綻剎那 | `—` | NONE  |
| `godie-e010.passive` | 70-00 紮根 | 白木老樹精 - 白木卡迪那 | `—` | NONE  |
| `godie-edem.ex` | 45-002 天照 | 寫輪眼復仇者 - 宇智波佐助 | `—` | NONE  |
| `godie-edem.passive` | 45-00 寫輪眼 | 寫輪眼復仇者 - 宇智波佐助 | `—` | NONE  |
| `godie-efur.ex` | 13-002 絕。暗殺奧義 | 揍敵客大家長 - 揍敵客桀諾 | `—` | NONE  |
| `godie-emfr.ex` | 15-002 敵彈吸收陣。太陰道 | 魔法老師 - 涅吉。史普林。菲爾德 | `—` | NONE  |
| `godie-emfr.passive` | 15-00 真·不死不滅 | 魔法老師 - 涅吉。史普林。菲爾德 | `—` | NONE  |
| `godie-etyr.passive` | 14-00 召喚式神 | 治癒系公主 - 木乃香 | `—` | NONE  |
| `godie-h01n.passive` | 79-00 靈壓 | 開外掛的死神 - 黑崎一護 | `—` | NONE  |
| `godie-h01o.passive` | 79-00 靈壓 | 外掛開很大的死神 - 黑崎一護 | `—` | NONE  |
| `godie-h01u.ex` | 80-002 戰無不勝 | 亂世癿王者 - 呂布奉先 | `—` | NONE  |
| `godie-h01u.passive` | 80-00 飛將神弓 | 亂世癿王者 - 呂布奉先 | `—` | NONE  |
| `godie-h020.passive` | 04-00 翔封界 | 黑魔導士 - 莉娜因巴斯 | `—` | NONE  |
| `godie-h02r.ex` | 90-002 超進化! 妙蛙花 | 種子神奇寶貝 - 妙蛙花 | `—` | NONE  |
| `godie-h02r.passive` | 90-00 寄生種子 | 種子神奇寶貝 - 妙蛙花 | `—` | NONE  |
| `godie-h02u.passive` | 92-00 憂鬱的眼神 | 看似憂鬱的神獸 - 草泥馬 | `—` | NONE  |
| `godie-h02v.passive` | 92-00 憂鬱的眼神 | 看似憂鬱的神獸 - 草泥馬 | `—` | NONE  |
| `godie-hapm.passive` | 52-00 十二道試煉 | 海克力斯 - Berserker | `—` | NONE  |
| `godie-hart.ex` | 01-002 究極魔劍 | 最終幻想 - 克勞德 | `—` | NONE  |
| `godie-hart.passive` | 01-00 怒斬 | 最終幻想 - 克勞德 | `—` | NONE  |
| `godie-hgam.ex` | 90-002 超進化! 妙蛙花 | 種子神奇寶貝 - 妙蛙種子 | `—` | NONE  |
| `godie-hgam.passive` | 90-00 寄生種子 | 種子神奇寶貝 - 妙蛙種子 | `—` | NONE  |
| `godie-hjai.passive` | 04-00 翔封界 | 黑魔導士 - 莉娜因巴斯 | `—` | NONE  |
| `godie-huth.ex` | 28-002 純粹魔人普烏 | 超級普烏 - 魔人普烏 | `—` | NONE  |
| `godie-hvsh.passive` | 48-00 石化之眼 | 梅杜莎 - Rider | `—` | NONE  |
| `godie-n00b.ex` | 57-002 時光機 | 小叮噹 - 哆拉A夢 | `—` | NONE  |
| `godie-o00k.q` | 86-01 十萬伏特 | 傲嬌電氣老鼠 - 皮卡娘 | `—` | NONE  |
| `godie-o00l.ex` | 53-002 恐懼力量 | 獸神官 - 傑洛士 | `—` | NONE  |
| `godie-o00x.ex` | 09-002 十倍龜派氣功 | 超級賽亞人 - 悟空 | `—` | NONE  |
| `godie-o030.ex` | 30-002 變態紳士 | 電車癡漢 - 臭作 | `—` | NONE  |
| `godie-ogrh.ex` | 09-002 十倍龜派氣功 | 賽亞人 - 悟空 | `—` | NONE  |
| `godie-orkn.ex` | 30-002 變態紳士 | 電車癡漢 - 臭作 | `—` | NONE  |
| `godie-u00h.passive` | 39-00 無明神風流-玄武 | 鬼畜紅王 - 鬼畜狂刀KYO | `—` | NONE  |
| `godie-u00j.ex` | 74-002 超新星 | 神性的流失 - 賽菲洛斯 | `—` | NONE  |
| `godie-u00k.ex` | 71-002 夜之主 | 邪惡意念集合體 - 死之王 | `—` | NONE  |
| `godie-u00k.passive` | 71-00 暗夜契約 | 邪惡意念集合體 - 死之王 | `—` | NONE  |
| `godie-u00n.ex` | 76-002 霸王色 | 草帽小子 - 蒙其.D.魯夫 | `—` | NONE  |
| `godie-u00o.ex` | 76-002 霸王色 | 草帽小子 - 蒙其.D.魯夫 | `—` | NONE  |
| `godie-u01u.ex` | 11-002 武裝色霸氣 | 三刀流劍士 - 索隆 | `—` | NONE  |
| `godie-u01u.passive` | 11-00 三刀流 | 三刀流劍士 - 索隆 | `—` | NONE  |
| `godie-ubal.passive` | 37-00 鬼眼 | 魔界霸主 - 巴恩大魔王 | `—` | NONE  |
| `godie-udre.ex` | 11-002 武裝色霸氣 | 三刀流劍士 - 索隆 | `—` | NONE  |
| `godie-udre.passive` | 11-00 三刀流 | 三刀流劍士 - 索隆 | `—` | NONE  |
| `godie-zombiex.e` | 100-03 咕咕嘎嘎 | 聖杯黑泥醬 - 喪標麥可 | `—` | NONE  |
| `godie-zombiex.ex` | 100-002 此世全部之咖哩・バタンキュー | 聖杯黑泥醬 - 喪標麥可 | `—` | NONE  |
| `godie-zombiex.passive` | 100-00 黑泥吞噬 | 聖杯黑泥醬 - 喪標麥可 | `—` | NONE  |
| `godie-zombiex.q` | 100-01 肝泥抹德 | 聖杯黑泥醬 - 喪標麥可 | `—` | NONE  |
| `godie-zombiex.r` | 100-04 百式・哈基米 | 聖杯黑泥醬 - 喪標麥可 | `—` | NONE  |
| `godie-zombiex.w` | 100-02 黑天覆七重咖哩・硬啦 | 聖杯黑泥醬 - 喪標麥可 | `—` | NONE  |
| `sela.e` | Scorch Ring | ? | `—` | —  |
| `sela.q` | Ember Bolt | ? | `—` | —  |
| `sela.r` | Firestorm | ? | `—` | —  |
| `sela.w` | Cinder Ward | ? | `—` | —  |
| `thorne.e` | Root Snare | ? | `—` | —  |
| `thorne.q` | Thorn Lash | ? | `—` | —  |
| `thorne.r` | Bramble Burst | ? | `—` | —  |
| `thorne.w` | Barkskin Bulwark | ? | `—` | —  |

#### ② rawcode 在 JASS 完全沒出現 —— 76 支

| id | 技能 | 英雄 | w3x rawcode | join |
|---|---|---|---|---|
| `godie-e002.ex` | 20-002 解放.約束勝利劍MAX | 亞瑟王 - Saber | `A0SP` | prefix  |
| `godie-e002.passive` | 20-00 銀色甲胄 | 亞瑟王 - Saber | `A0CQ` | prefix  |
| `godie-e007.passive` | 12-00 感應意脈 | 龍之子 - 天地志狼 | `A04Z` | prefix  |
| `godie-e008.passive` | 21-00 灼眼 | 火霧戰士 - 夏娜 | `A0BE` | prefix  |
| `godie-e00l.ex` | 20-002 解放.約束勝利劍MAX | 亞瑟王 - Saber | `A0SP` | prefix  |
| `godie-e00l.passive` | 20-00 銀色甲胄 | 亞瑟王 - Saber | `A0CQ` | prefix  |
| `godie-e00r.e` | 59-03 AT力場 | 最終泛用人型決戰兵器 - 初號機 | `A0GH` | name  |
| `godie-e00r.ex` | 59-001 完全暴走 | 最終泛用人型決戰兵器 - 初號機 | `A0Z5` | prefix  |
| `godie-e00r.passive` | 59-00 暴走 | 最終泛用人型決戰兵器 - 初號機 | `A0GD` | prefix  |
| `godie-e00r.q` | 59-01 吞噬 | 最終泛用人型決戰兵器 - 初號機 | `A0O5` | name  |
| `godie-e00r.w` | 59-02 高週波短刀 | 最終泛用人型決戰兵器 - 初號機 | `A0GF` | name  |
| `godie-efur.passive` | 13-00 念。攻防轉換 | 揍敵客大家長 - 揍敵客桀諾 | `Auhf` | prefix  |
| `godie-etyr.ex` | 14-002 魔力激發 | 治癒系公主 - 木乃香 | `A0ST` | prefix  |
| `godie-etyr.r` | 14-04 聖夜降臨 | 治癒系公主 - 木乃香 | `A0SS` | name  |
| `godie-ewar.passive` | 12-00 感應意脈 | 龍之子 - 天地志狼 | `A04Z` | prefix  |
| `godie-h00l.ex` | 60-002 勇者意志 | 時空勇者 - 林克 | `A10P` | prefix  |
| `godie-h00l.passive` | 60-00 大師之劍 | 時空勇者 - 林克 | `ACds` | prefix  |
| `godie-h01n.r` | 79-04 卍解 | 開外掛的死神 - 黑崎一護 | `A0LN` | name  |
| `godie-h01o.r` | 79-04 卍解 | 外掛開很大的死神 - 黑崎一護 | `A0LN` | name  |
| `godie-h020.ex` | 04-002 惡夢魔王的碎片 | 黑魔導士 - 莉娜因巴斯 | `A0OE` | prefix  |
| `godie-h02k.passive` | 89-00 憤怒的門牙 | 國寶級的畜生 - 熊貓 | `A0TM` | prefix  |
| `godie-h02k.q` | 89-01 憤怒的頭槌 | 國寶級的畜生 - 熊貓 | `A0TL` | name  |
| `godie-h02r.w` | 90-02 麻痺粉 | 種子神奇寶貝 - 妙蛙花 | `A0NB` | name  |
| `godie-h02u.ex` | 92-002 最終戈壁 | 看似憂鬱的神獸 - 草泥馬 | `A0Z9` | prefix  |
| `godie-h02v.e` | 92-02 消化液 | 看似憂鬱的神獸 - 草泥馬 | `A0WA` | name  |
| `godie-h02v.ex` | 92-002 最終戈壁 | 看似憂鬱的神獸 - 草泥馬 | `A0Z9` | prefix  |
| `godie-hgam.w` | 90-02 麻痺粉 | 種子神奇寶貝 - 妙蛙種子 | `A0NB` | name  |
| `godie-hjai.ex` | 04-002 惡夢魔王的碎片 | 黑魔導士 - 莉娜因巴斯 | `A0OE` | prefix  |
| `godie-hpb1.ex` | 07-002 獸矛持有者 | 獸矛傳承使 - 蒼月潮 | `A0ZA` | prefix  |
| `godie-hpb1.passive` | 07-00 獸化心靈 | 獸矛傳承使 - 蒼月潮 | `A03H` | prefix  |
| `godie-hpb1.r` | 07-04 神聖結界 | 獸矛傳承使 - 蒼月潮 | `A02C` | name  |
| `godie-huth.passive` | 28-00 無限再生 | 超級普烏 - 魔人普烏 | `A03R` | prefix  |
| `godie-hvsh.ex` | 48-002 騎英之疆繩MAX | 梅杜莎 - Rider | `A0SM` | prefix  |
| `godie-hvwd.passive` | 02-00 淨化 | 除魔巫女 - 桔梗 | `Aprg` | prefix  |
| `godie-hvwd.q` | 02-01 破魔之箭 | 除魔巫女 - 桔梗 | `A0MH` | name  |
| `godie-n003.passive` | 42-00 魔法障壁 | 黑暗福音 - 依文潔琳 | `A059` | prefix  |
| `godie-n00p.ex` | 18-002 魔界吸血植物 | 妖狐藏馬 - 南野秀一 | `A0SE` | prefix  |
| `godie-n00p.passive` | 18-00 薔薇荊棘之刃 | 妖狐藏馬 - 南野秀一 | `A002` | prefix  |
| `godie-n01c.passive` | 08-00 龍紋記憶 | 傳說的龍騎士 - 勇者小呆 | `A05V` | prefix  |
| `godie-n01g.passive` | 42-00 魔法障壁 | 黑暗福音 - 依文潔琳 | `A059` | prefix  |
| `godie-nbbc.passive` | 08-00 龍紋記憶 | 傳說的龍騎士 - 勇者小呆 | `A05V` | prefix  |
| `godie-nsjs.ex` | 18-002 魔界吸血植物 | 妖狐藏馬 - 南野秀一 | `A0SE` | prefix  |
| `godie-nsjs.passive` | 18-00 薔薇荊棘之刃 | 妖狐藏馬 - 南野秀一 | `A002` | prefix  |
| `godie-o00k.e` | 86-03 神鳴 | 傲嬌電氣老鼠 - 皮卡娘 | `A04V` | name  |
| `godie-o00k.ex` | 86-002 雷電萌神 | 傲嬌電氣老鼠 - 皮卡娘 | `A10X` | prefix  |
| `godie-o00k.w` | 86-02 電光一閃 | 傲嬌電氣老鼠 - 皮卡娘 | `A0BY` | index  |
| `godie-o00l.passive` | 53-00 空間穿梭 | 獸神官 - 傑洛士 | `Aivs` | prefix  |
| `godie-o00x.passive` | 09-00 賽亞人的血脈 | 超級賽亞人 - 悟空 | `A0NL` | prefix  |
| `godie-o02l.passive` | 58-00 電光一閃 | 神騎寶貝 - 皮卡丘 | `A0R6` | prefix  |
| `godie-o02p.passive` | 99-00 可愛就是正義 | 夢幻之星 - 初音 | `A119` | prefix  |
| `godie-o030.passive` | 30-00 攝影機 | 電車癡漢 - 臭作 | `A029` | prefix  |
| `godie-ofar.passive` | 58-00 電光一閃 | 神奇寶貝兒 - 皮卡丘 | `A0R6` | prefix  |
| `godie-ogld.e` | 72-03 超亮白 | 美白大法師 - 黑人牙膏 | `Afae` | name  |
| `godie-ogld.q` | 72-01洗刷刷 | 美白大法師 - 黑人牙膏 | `ANmo` | prefix  |
| `godie-ogld.w` | 72-02 黑人牙菌斑 | 美白大法師 - 黑人牙膏 | `ACpa` | name  |
| `godie-ogrh.passive` | 09-00 賽亞人的血脈 | 賽亞人 - 悟空 | `A0NL` | prefix  |
| `godie-orkn.passive` | 30-00 攝影機 | 電車癡漢 - 臭作 | `A029` | prefix  |
| `godie-osam.passive` | 34-00 靈魂吞噬 | 犬妖 - 殺生丸 | `ACdr` | prefix  |
| `godie-u00j.passive` | 74-00 JENOVA | 神性的流失 - 賽菲洛斯 | `A0A4` | prefix  |
| `godie-u00l.ex` | 25-002 喔拉喔拉喔拉喔拉 | 北斗之鼠 - 拳四郎 | `A10Y` | prefix  |
| `godie-u00l.passive` | 25-00 北斗暗殺拳 | 北斗之鼠 - 拳四郎 | `A07H` | prefix  |
| `godie-u00v.ex` | 78-002 加速爆體 | 黑手黨老大 - 基廉列克 | `A10W` | prefix  |
| `godie-u00v.passive` | 78-00 銅皮鐵骨 | 黑手黨老大 - 基廉列克 | `A0L3` | prefix  |
| `godie-u00v.q` | 78-01 斬鐵拳 | 黑手黨老大 - 基廉列克 | `A0L5` | name  |
| `godie-u010.ex` | 38-002 究極暴走黑龍波 | 邪眼師 - 飛影 | `A0SO` | prefix  |
| `godie-u010.passive` | 38-00 邪眼全開 | 邪眼師 - 飛影 | `A0OH` | prefix  |
| `godie-u034.ex` | 06-002 殺意 | 職業獵人 - 傑 富力士 | `A025` | prefix  |
| `godie-u034.r` | 06-04 傑桑變化 | 職業獵人 - 傑 富力士 | `A0Y1` | name  |
| `godie-ucrl.ex` | 06-002 殺意 | 職業獵人 - 傑 富力士 | `A025` | prefix  |
| `godie-ucrl.r` | 06-04 傑桑變化 | 職業獵人 - 傑 富力士 | `A0Y1` | name  |
| `godie-udea.passive` | 65-00 古老智慧 | 至尊學長 - 飛鼠先生 | `A0EX` | prefix  |
| `godie-udea.q` | 65-01 神出鬼沒 | 至尊學長 - 飛鼠先生 | `A04G` | name  |
| `godie-umal.ex` | 25-002 喔拉喔拉喔拉喔拉 | 北斗神拳掌門人 - 拳四郎 | `A10Y` | prefix  |
| `godie-umal.passive` | 25-00 北斗暗殺拳 | 北斗神拳掌門人 - 拳四郎 | `A07H` | prefix  |
| `godie-uvng.ex` | 38-002 究極暴走黑龍波 | 邪眼師 - 飛影 | `A0SO` | prefix  |
| `godie-uvng.passive` | 38-00 邪眼全開 | 邪眼師 - 飛影 | `A0OH` | prefix  |

#### ② rawcode 在 JASS 有出現但沒有施法閘 —— 91 支

| id | 技能 | 英雄 | w3x rawcode | join |
|---|---|---|---|---|
| `godie-e001.e` | 22-03 五吋釘 | 蟬在叫人壞掉 - 龍宮禮奈 | `AEsh` | name  |
| `godie-e001.q` | 22-01 鬼隱之擊 | 蟬在叫人壞掉 - 龍宮禮奈 | `A007` | name  |
| `godie-e001.r` | 22-04 雛見澤症候群L5 | 蟬在叫人壞掉 - 龍宮禮奈 | `A02Q` | name  |
| `godie-e001.w` | 22-02 染血的柴刀 | 蟬在叫人壞掉 - 龍宮禮奈 | `AOcr` | name  |
| `godie-e002.q` | 20-02 感知能力 | 亞瑟王 - Saber | `A0CM` | name  |
| `godie-e002.w` | 20-01 風王結界 | 亞瑟王 - Saber | `A0DZ` | name  |
| `godie-e007.e` | 12-03 破凰之心-徒手空破山 | 龍之子 - 天地志狼 | `A02W` | name  |
| `godie-e007.q` | 12-01 鬥仙術 | 龍之子 - 天地志狼 | `A04Y` | name  |
| `godie-e008.e` | 21-03 赤焰爆發 | 火霧戰士 - 夏娜 | `A0BF` | name  |
| `godie-e00l.q` | 20-02 感知能力 | 亞瑟王 - Saber | `A0CM` | name  |
| `godie-e00l.w` | 20-01 風王結界 | 亞瑟王 - Saber | `A0DZ` | name  |
| `godie-e00n.e` | 22-03 五吋釘 | 蟬在叫人壞掉 - 龍宮禮奈 | `AEsh` | name  |
| `godie-e00n.q` | 22-01 鬼隱之擊 | 蟬在叫人壞掉 - 龍宮禮奈 | `A007` | name  |
| `godie-e00n.r` | 22-04 雛見澤症候群L5 | 蟬在叫人壞掉 - 龍宮禮奈 | `A02Q` | name  |
| `godie-e00n.w` | 22-02 染血的柴刀 | 蟬在叫人壞掉 - 龍宮禮奈 | `AOcr` | name  |
| `godie-e00s.r` | 70-04 千年練成 | 白木老樹精 - 白木卡迪那 | `A0GN` | name  |
| `godie-e00s.w` | 70-02 大怒石 | 白木老樹精 - 白木卡迪那 | `A0GQ` | name  |
| `godie-e00w.w` | 77-02 雷鳴劍 | 神鳴流劍士 - 櫻綻剎那 | `A0TX` | name  |
| `godie-e00x.w` | 77-02 雷鳴劍 | 神鳴流劍士 - 櫻綻剎那 | `A0TX` | name  |
| `godie-e010.r` | 70-04 千年練成 | 白木老樹精 - 白木卡迪那 | `A0GN` | name  |
| `godie-e010.w` | 70-02 大怒石 | 白木老樹精 - 白木卡迪那 | `A0GQ` | name  |
| `godie-efur.q` | 13-01 暗步。極限之圓 | 揍敵客大家長 - 揍敵客桀諾 | `AEer` | index  |
| `godie-efur.r` | 13-04 龍星群 | 揍敵客大家長 - 揍敵客桀諾 | `A00S` | index  |
| `godie-efur.w` | 13-02 龍頭戲畫。牙突 | 揍敵客大家長 - 揍敵客桀諾 | `A00X` | index  |
| `godie-emns.passive` | 44-00 機警 | 奇樂 - 夜神月 | `A05F` | prefix  |
| `godie-emns.w` | 44-02 死神的規則 | 奇樂 - 夜神月 | `A05G` | name  |
| `godie-etyr.w` | 14-03 魔力應援 | 治癒系公主 - 木乃香 | `AOae` | name  |
| `godie-ewar.e` | 12-03 破凰之心。空破山 | 龍之子 - 天地志狼 | `A02W` | index  |
| `godie-ewar.q` | 12-01 鬥仙術 | 龍之子 - 天地志狼 | `A04Y` | name  |
| `godie-h00l.e` | 60-03 三角神力．勇氣 | 時空勇者 - 林克 | `Adef` | index  |
| `godie-h01n.w` | 79-02 月牙斬擊 | 開外掛的死神 - 黑崎一護 | `A0LK` | index  |
| `godie-h01o.w` | 79-02 斬擊 | 外掛開很大的死神 - 黑崎一護 | `A0LK` | name  |
| `godie-h01u.q` | 80-01 天下無雙 | 亂世癿王者 - 呂布奉先 | `A0MX` | name  |
| `godie-h020.q` | 04-01 火球術 | 黑魔導士 - 莉娜因巴斯 | `A0AY` | name  |
| `godie-h020.w` | 04-02 炸彈陣 | 黑魔導士 - 莉娜因巴斯 | `A021` | name  |
| `godie-h02r.q` | 90-01 飛葉快刀 | 種子神奇寶貝 - 妙蛙花 | `AOww` | name  |
| `godie-hapm.e` | 52-03 無銘斧劍 | 海克力斯 - Berserker | `A0BA` | name  |
| `godie-hgam.q` | 90-01 飛葉快刀 | 種子神奇寶貝 - 妙蛙種子 | `AOww` | name  |
| `godie-hjai.q` | 04-01 火球術 | 黑魔導士 - 莉娜因巴斯 | `A0AY` | name  |
| `godie-hjai.w` | 04-02 炸彈陣 | 黑魔導士 - 莉娜因巴斯 | `A021` | name  |
| `godie-huth.e` | 28-03 分身 | 超級普烏 - 魔人普烏 | `A03T` | name  |
| `godie-hvsh.e` | 48-03 鮮血神殿 | 梅杜莎 - Rider | `A06C` | name  |
| `godie-hvsh.w` | 48-02 心眼 | 梅杜莎 - Rider | `A069` | name  |
| `godie-hvwd.e` | 02-03 魂飛魄散 | 除魔巫女 - 桔梗 | `A03D` | name  |
| `godie-hvwd.w` | 02-02 明鏡止水 | 除魔巫女 - 桔梗 | `A045` | name  |
| `godie-n003.e` | 42-03 暗夜吹雪 | 黑暗福音 - 依文潔琳 | `A05C` | name  |
| `godie-n003.q` | 42-01 凍結的大地 | 黑暗福音 - 依文潔琳 | `A05B` | name  |
| `godie-n003.w` | 42-02 吸血祭品 | 黑暗福音 - 依文潔琳 | `AUdr` | name  |
| `godie-n00b.e` | 57-02 任意門 | 小叮噹 - 哆拉A夢 | `A0D2` | name  |
| `godie-n00b.q` | 57-01 空氣砲 | 小叮噹 - 哆拉A夢 | `A0D0` | name  |
| `godie-n00p.q` | 18-01 風華圓舞陣 | 妖狐藏馬 - 南野秀一 | `A0IO` | name  |
| `godie-n01c.q` | 08-01 雙龍紋 | 傳說的龍騎士 - 勇者小呆 | `A0CF` | name  |
| `godie-n01g.e` | 42-03 暗夜吹雪 | 黑暗福音 - 依文潔琳 | `A05C` | name  |
| `godie-n01g.q` | 42-01 凍結的大地 | 黑暗福音 - 依文潔琳 | `A05B` | name  |
| `godie-n01g.w` | 42-02 吸血祭品 | 黑暗福音 - 依文潔琳 | `AUdr` | name  |
| `godie-nbbc.q` | 08-01 雙龍紋 | 傳說的龍騎士 - 勇者小呆 | `A0CF` | name  |
| `godie-nsjs.q` | 18-01 風華圓舞陣 | 妖狐藏馬 - 南野秀一 | `A0IO` | name  |
| `godie-o00l.w` | 53-02 強化炸彈陣 | 獸神官 - 傑洛士 | `A0DQ` | name  |
| `godie-o00x.q` | 09-01 界王拳 | 超級賽亞人 - 悟空 | `A082` | name  |
| `godie-o00x.w` | 09-02 瞬間移動 | 超級賽亞人 - 悟空 | `A03Y` | name  |
| `godie-o02l.q` | 58-01 十萬伏特 | 神騎寶貝 - 皮卡丘 | `A0BZ` | name  |
| `godie-o02l.w` | 58-02 鋼鐵尾巴 | 神騎寶貝 - 皮卡丘 | `A04U` | name  |
| `godie-o02p.q` | 99-01 甩蔥歌 | 夢幻之星 - 初音 | `A116` | name  |
| `godie-o02p.w` | 99-02 最初的聲音 | 夢幻之星 - 初音 | `A118` | name  |
| `godie-o030.e` | 30-03 痴漢火焰 | 電車癡漢 - 臭作 | `ANso` | name  |
| `godie-o030.r` | 30-04 電車之狼衝擊 | 電車癡漢 - 臭作 | `A01P` | name  |
| `godie-o030.w` | 30-02 酒精灌腸 | 電車癡漢 - 臭作 | `ANdh` | name  |
| `godie-ofar.q` | 58-01 十萬伏特 | 神奇寶貝兒 - 皮卡丘 | `A0BZ` | name  |
| `godie-ofar.w` | 58-02 鋼鐵尾巴 | 神奇寶貝兒 - 皮卡丘 | `A04U` | name  |
| `godie-ogld.ex` | 72-002 億萬衛星殞落 | 美白大法師 - 黑人牙膏 | `A09B` | prefix  |
| `godie-ogrh.q` | 09-01 界王拳 | 賽亞人 - 悟空 | `A082` | name  |
| `godie-ogrh.w` | 09-02 瞬間移動 | 賽亞人 - 悟空 | `A03Y` | name  |
| `godie-orkn.e` | 30-03 痴漢火焰 | 電車癡漢 - 臭作 | `ANso` | name  |
| `godie-orkn.r` | 30-04 電車之狼衝擊 | 電車癡漢 - 臭作 | `A01P` | name  |
| `godie-orkn.w` | 30-02 酒精灌腸 | 電車癡漢 - 臭作 | `ANdh` | name  |
| `godie-osam.e` | 34-03 爆碎牙 | 犬妖 - 殺生丸 | `A0F5` | index  |
| `godie-osam.q` | 34-01 毒華爪 | 犬妖 - 殺生丸 | `A034` | index  |
| `godie-osam.w` | 34-02 閃光鞭 | 犬妖 - 殺生丸 | `A038` | index  |
| `godie-u00h.ex` | 39-002 紅王 | 鬼畜紅王 - 鬼畜狂刀KYO | `A0Z3` | prefix  |
| `godie-u00h.q` | 39-01 無明神風流-白虎 | 鬼畜紅王 - 鬼畜狂刀KYO | `A0DG` | index  |
| `godie-u00k.w` | 71-02 靈魂吸取 | 邪惡意念集合體 - 死之王 | `A08T` | name  |
| `godie-u00l.w` | 25-02 北斗神拳秘訣轉龍呼吸法 | 北斗之鼠 - 拳四郎 | `A01J` | name  |
| `godie-u01u.e` | 11-03 鬼氣九刀流-阿修羅壹霧銀 | 三刀流劍士 - 索隆 | `A06P` | name  |
| `godie-u01u.q` | 11-01 燒鬼斬 | 三刀流劍士 - 索隆 | `A0CC` | name  |
| `godie-u01u.w` | 11-02 虎狩獵 | 三刀流劍士 - 索隆 | `A06N` | name  |
| `godie-ubal.e` | 37-02 黑核晶 | 魔界霸主 - 巴恩大魔王 | `A0OY` | name  |
| `godie-ubal.q` | 37-01 凱薩之鷹 | 魔界霸主 - 巴恩大魔王 | `A01I` | name  |
| `godie-udre.e` | 11-03 鬼氣九刀流-阿修羅壹霧銀 | 三刀流劍士 - 索隆 | `A06P` | name  |
| `godie-udre.q` | 11-01 燒鬼斬 | 三刀流劍士 - 索隆 | `A0CC` | name  |
| `godie-udre.w` | 11-02 虎狩獵 | 三刀流劍士 - 索隆 | `A06N` | name  |
| `godie-umal.w` | 25-02 北斗神拳秘訣轉龍呼吸法 | 北斗神拳掌門人 - 拳四郎 | `A01J` | name  |

#### ③ 有施法閘叢集但無音 —— 101 支

| id | 技能 | 英雄 | w3x rawcode | join |
|---|---|---|---|---|
| `godie-e001.passive` | 22-00 嗚鎖打! | 蟬在叫人壞掉 - 龍宮禮奈 | `A0CL` | prefix  |
| `godie-e002.e` | 20-03 約束與勝利之劍 | 亞瑟王 - Saber | `A0D5` | name  |
| `godie-e002.r` | 20-04 Avalon-永恆的理想鄉 | 亞瑟王 - Saber | `A0CT` | name  |
| `godie-e007.ex` | 12-002 仙氣發勁 | 龍之子 - 天地志狼 | `A0SQ` | prefix  |
| `godie-e007.r` | 12-04 龍氣爆發 | 龍之子 - 天地志狼 | `A04X` | name  |
| `godie-e007.w` | 12-02 仙氣．採藥 | 龍之子 - 天地志狼 | `A02K` | name  |
| `godie-e00l.e` | 20-03 約束與勝利之劍 | 亞瑟王 - Saber | `A0D5` | name  |
| `godie-e00l.r` | 20-04 Avalon-永恆的理想鄉 | 亞瑟王 - Saber | `A0CT` | name  |
| `godie-e00n.passive` | 22-00 嗚鎖打! | 蟬在叫人壞掉 - 龍宮禮奈 | `A0CL` | prefix  |
| `godie-e00s.e` | 70-03 木束縛之術 | 白木老樹精 - 白木卡迪那 | `A0GR` | name  |
| `godie-e00w.ex` | 77-002 御雷劍 | 神鳴流劍士 - 櫻綻剎那 | `A10G` | prefix  |
| `godie-e00w.r` | 77-04 真-雷光劍 | 神鳴流劍士 - 櫻綻剎那 | `A0UB` | name  |
| `godie-e00x.ex` | 77-002 御雷劍 | 神鳴流劍士 - 櫻綻剎那 | `A10G` | prefix  |
| `godie-e00x.r` | 77-04 真-雷光劍 | 神鳴流劍士 - 櫻綻剎那 | `A0UB` | name  |
| `godie-e010.e` | 70-03 木束縛之術 | 白木老樹精 - 白木卡迪那 | `A0GR` | name  |
| `godie-edem.q` | 45-01 火遁-豪火龍之術 | 寫輪眼復仇者 - 宇智波佐助 | `A0M7` | name  |
| `godie-edem.w` | 45-02 千鳥流 | 寫輪眼復仇者 - 宇智波佐助 | `A0JX` | name  |
| `godie-emfr.e` | 15-03 獄炎煉我 | 魔法老師 - 涅吉。史普林。菲爾德 | `A052` | index  |
| `godie-emfr.q` | 15-01 雷神槍「巨神殺手」 | 魔法老師 - 涅吉。史普林。菲爾德 | `A0D3` | index  |
| `godie-emfr.r` | 15-04 雷天大壯。貳式 | 魔法老師 - 涅吉。史普林。菲爾德 | `A053` | index  |
| `godie-etyr.e` | 14-02 式神炸裂 | 治癒系公主 - 木乃香 | `A0JM` | name  |
| `godie-etyr.q` | 14-01 東風繪扇、南風末廣 | 治癒系公主 - 木乃香 | `A0JL` | name  |
| `godie-ewar.ex` | 12-002 仙氣發勁 | 龍之子 - 天地志狼 | `A0SQ` | prefix  |
| `godie-ewar.r` | 12-04 龍氣爆發 | 龍之子 - 天地志狼 | `A04X` | name  |
| `godie-ewar.w` | 12-02 仙氣．採藥 | 龍之子 - 天地志狼 | `A02K` | name  |
| `godie-h01n.e` | 79-03 月牙天衝 | 開外掛的死神 - 黑崎一護 | `A0LL` | name  |
| `godie-h01n.ex` | 79-002 虛化 | 開外掛的死神 - 黑崎一護 | `A0W5` | prefix  |
| `godie-h01n.q` | 79-01 瞬步 | 開外掛的死神 - 黑崎一護 | `A0RX` | name  |
| `godie-h01o.e` | 79-03 月牙天衝 | 外掛開很大的死神 - 黑崎一護 | `A0LL` | name  |
| `godie-h01o.ex` | 79-002 虛化 | 外掛開很大的死神 - 黑崎一護 | `A0W5` | prefix  |
| `godie-h01o.q` | 79-01 瞬步 | 外掛開很大的死神 - 黑崎一護 | `A0RX` | name  |
| `godie-h01u.e` | 80-03 鬼神烈戟 | 亂世癿王者 - 呂布奉先 | `A0N0` | name  |
| `godie-h020.e` | 04-03 龍破斬 | 黑魔導士 - 莉娜因巴斯 | `A04R` | name  |
| `godie-h020.r` | 04-04 神滅斬 | 黑魔導士 - 莉娜因巴斯 | `A07F` | name  |
| `godie-h02r.e` | 90-03 藤鞭 | 種子神奇寶貝 - 妙蛙花 | `A0Y4` | name  |
| `godie-h02r.r` | 90-04 陽光烈焰 | 種子神奇寶貝 - 妙蛙花 | `A0R4` | name  |
| `godie-h02u.q` | 92-01 臥草泥馬 | 看似憂鬱的神獸 - 草泥馬 | `A0W9` | name  |
| `godie-h02u.r` | 92-04 馬勒戈壁 | 看似憂鬱的神獸 - 草泥馬 | `A06Y` | name  |
| `godie-h02v.q` | 92-01 臥草泥馬 | 看似憂鬱的神獸 - 草泥馬 | `A0W9` | name  |
| `godie-h02v.r` | 92-04 馬勒戈壁 | 看似憂鬱的神獸 - 草泥馬 | `A06Y` | name  |
| `godie-hapm.ex` | 52-002 射殺百頭 | 海克力斯 - Berserker | `A0U5` | prefix  |
| `godie-hapm.q` | 52-01 狂戰士之怒 | 海克力斯 - Berserker | `A0VJ` | name  |
| `godie-hapm.r` | 52-04 巨神一擊 | 海克力斯 - Berserker | `A0U8` | name  |
| `godie-hapm.w` | 52-02 蹂躪編年史 | 海克力斯 - Berserker | `A0U1` | name  |
| `godie-hart.e` | 01-03 畫龍點睛 | 最終幻想 - 克勞德 | `A000` | name  |
| `godie-hart.q` | 01-01 凶斬 | 最終幻想 - 克勞德 | `A072` | name  |
| `godie-hart.r` | 01-04 超究武神霸斬 | 最終幻想 - 克勞德 | `A077` | name  |
| `godie-hart.w` | 01-02 隕石擊 | 最終幻想 - 克勞德 | `A0UX` | name  |
| `godie-hgam.e` | 90-03 藤鞭 | 種子神奇寶貝 - 妙蛙種子 | `A0Y4` | name  |
| `godie-hgam.r` | 90-04 陽光烈焰 | 種子神奇寶貝 - 妙蛙種子 | `A0R4` | name  |
| `godie-hjai.e` | 04-03 龍破斬 | 黑魔導士 - 莉娜因巴斯 | `A04R` | name  |
| `godie-hjai.r` | 04-04 神滅斬 | 黑魔導士 - 莉娜因巴斯 | `A07F` | name  |
| `godie-hpb1.q` | 07-01 臨、兵、鬥 | 獸矛傳承使 - 蒼月潮 | `A0G0` | name  |
| `godie-huth.q` | 28-01 吃掉你 | 超級普烏 - 魔人普烏 | `A0GB` | name  |
| `godie-huth.r` | 28-04 破滅能量彈 | 超級普烏 - 魔人普烏 | `A08U` | name  |
| `godie-hvsh.q` | 48-01 魔法鎖鏈 | 梅杜莎 - Rider | `A0RO` | name  |
| `godie-hvsh.r` | 48-04 騎英之疆繩 | 梅杜莎 - Rider | `A0RQ` | name  |
| `godie-hvwd.r` | 02-04 死魂蟲 | 除魔巫女 - 桔梗 | `A0Z6` | index  |
| `godie-n003.r` | 42-04 世界終結 | 黑暗福音 - 依文潔琳 | `A05D` | name  |
| `godie-n00b.passive` | 57-00 四次元口袋 | 小叮噹 - 哆拉A夢 | `A0CY` | prefix  |
| `godie-n00b.r` | 57-04 竹蜻蜓 | 小叮噹 - 哆拉A夢 | `A0JN` | name  |
| `godie-n00p.r` | 18-04 億年樹 | 妖狐藏馬 - 南野秀一 | `A0P7` | name  |
| `godie-n01c.r` | 08-04 阿邦快速劍X | 傳說的龍騎士 - 勇者小呆 | `A0EZ` | name  |
| `godie-n01c.w` | 08-02 萊丁快速劍 | 傳說的龍騎士 - 勇者小呆 | `A05T` | name  |
| `godie-n01g.r` | 42-04 世界終結 | 黑暗福音 - 依文潔琳 | `A05D` | name  |
| `godie-nbbc.r` | 08-04 阿邦快速劍X | 傳說的龍騎士 - 勇者小呆 | `A0EZ` | name  |
| `godie-nbbc.w` | 08-02 萊丁快速劍 | 傳說的龍騎士 - 勇者小呆 | `A05T` | name  |
| `godie-nsjs.r` | 18-04 億年樹 | 妖狐藏馬 - 南野秀一 | `A0P7` | name  |
| `godie-o00k.r` | 86-04 打雷絕招 | 傲嬌電氣老鼠 - 皮卡娘 | `A0C0` | name  |
| `godie-o00l.q` | 53-01 獸王牙操彈 | 獸神官 - 傑洛士 | `A0K1` | name  |
| `godie-o00x.e` | 09-03 超級賽亞人 | 超級賽亞人 - 悟空 | `A09E` | name  |
| `godie-o00x.r` | 09-04 龜派氣功 | 超級賽亞人 - 悟空 | `A03S` | name  |
| `godie-o02l.ex` | 58-002 打雷絕招 | 神騎寶貝 - 皮卡丘 | `A0SL` | prefix  |
| `godie-o02p.e` | 99-03 初音未來的消失 | 夢幻之星 - 初音 | `A11B` | name  |
| `godie-o02p.ex` | 99-002 把你給MikuMiku掉 | 夢幻之星 - 初音 | `A11F` | prefix  |
| `godie-o02p.r` | 99-04 世界第一的公主殿下 | 夢幻之星 - 初音 | `A11C` | name  |
| `godie-ofar.ex` | 58-002 打雷絕招 | 神奇寶貝兒 - 皮卡丘 | `A0SL` | prefix  |
| `godie-ogld.r` | 72-04 黑化 | 美白大法師 - 黑人牙膏 | `A0CO` | name  |
| `godie-ogrh.e` | 09-03 超級賽亞人 | 賽亞人 - 悟空 | `A09E` | name  |
| `godie-ogrh.r` | 09-04 龜派氣功 | 賽亞人 - 悟空 | `A03S` | name  |
| `godie-osam.ex` | 34-002 冥道殘月破 | 犬妖 - 殺生丸 | `A0MV` | prefix  |
| `godie-osam.r` | 34-04 奧義˙蒼龍破 | 犬妖 - 殺生丸 | `A0FP` | name  |
| `godie-u00h.w` | 39-02 無明神風流-朱雀 | 鬼畜紅王 - 鬼畜狂刀KYO | `A0Z4` | index  |
| `godie-u00j.e` | 74-03 闇之天使 | 神性的流失 - 賽菲洛斯 | `A0F4` | name  |
| `godie-u00j.q` | 74-01 獄門 | 神性的流失 - 賽菲洛斯 | `A0S4` | name  |
| `godie-u00j.r` | 74-04 最終殞落星 | 神性的流失 - 賽菲洛斯 | `A0G5` | name  |
| `godie-u00k.q` | 71-01 死亡隕落 | 邪惡意念集合體 - 死之王 | `A03L` | name  |
| `godie-u00l.e` | 25-03 北斗百裂拳 | 北斗之鼠 - 拳四郎 | `A0HV` | name  |
| `godie-u00n.q` | 76-01 伸縮自如的橡膠戰斧 | 草帽小子 - 蒙其.D.魯夫 | `A0IS` | name  |
| `godie-u00n.r` | 76-04 三檔.巨人迴旋彈 | 草帽小子 - 蒙其.D.魯夫 | `A0RZ` | name  |
| `godie-u00n.w` | 76-02 伸縮自如的橡膠火箭砲 | 草帽小子 - 蒙其.D.魯夫 | `A0IP` | name  |
| `godie-u00o.q` | 76-01 伸縮自如的橡膠戰斧 | 草帽小子 - 蒙其.D.魯夫 | `A0IS` | name  |
| `godie-u00o.r` | 76-04 三檔.巨人迴旋彈 | 草帽小子 - 蒙其.D.魯夫 | `A0RZ` | name  |
| `godie-u00o.w` | 76-02 伸縮自如的橡膠火箭砲 | 草帽小子 - 蒙其.D.魯夫 | `A0IP` | name  |
| `godie-u01u.r` | 11-04 三千世界 | 三刀流劍士 - 索隆 | `A0MQ` | name  |
| `godie-ubal.ex` | 37-002 真‧黑核晶 | 魔界霸主 - 巴恩大魔王 | `A0ZV` | prefix  |
| `godie-udea.ex` | 65-002 永恆的愚蠢鄉 | 至尊學長 - 飛鼠先生 | `A0FF` | prefix  |
| `godie-udea.r` | 65-04 天譴 | 至尊學長 - 飛鼠先生 | `A04C` | name  |
| `godie-udea.w` | 65-02 寒冰破碎 | 至尊學長 - 飛鼠先生 | `A05S` | name  |
| `godie-udre.r` | 11-04 三千世界 | 三刀流劍士 - 索隆 | `A0MQ` | name  |
| `godie-umal.e` | 25-03 北斗百裂拳 | 北斗神拳掌門人 - 拳四郎 | `A0HV` | name  |

#### ⭐④ 原作有音（施法閘鏈式） —— 6 支

| id | 技能 | 英雄 | w3x rawcode | join |
|---|---|---|---|---|
| `godie-edem.e` | 45-03 千鳥 | 寫輪眼復仇者 - 宇智波佐助 | `A0IJ` | name  · JASS: `gg_snd_ThunderBoltMissileDeath` |
| `godie-efur.e` | 13-03 龍頭戲畫。布陣 | 揍敵客大家長 - 揍敵客桀諾 | `AEtq` | index  · JASS: `gg_snd_GlueScreenMeteorHit1`, `gg_snd_GryphonRiderMissileLaunch3` |
| `godie-h02u.e` | 92-03 消化液 | 看似憂鬱的神獸 - 草泥馬 | `A0WB` | index  · JASS: `gg_snd_Taunt` |
| `godie-nsjs.w` | 18-02 寄生種子 | 妖狐藏馬 - 南野秀一 | `A0RV` | name  · JASS: `gg_snd_SpiritOfVengeanceYes3` |
| `godie-o02l.e` | 58-03 就決定是你了!小智 | 神騎寶貝 - 皮卡丘 | `A0C3` | name  · JASS: `gg_snd_sawch` |
| `godie-ofar.e` | 58-03 就決定是你了!小智 | 神奇寶貝兒 - 皮卡丘 | `A0C3` | name  · JASS: `gg_snd_sawch` |

#### ⭐⑥ 原作有音（w3a 物件資料 aefs/aefl） —— 11 支

| id | 技能 | 英雄 | w3x rawcode | join |
|---|---|---|---|---|
| `godie-e008.w` | 21-01 火羽 | 火霧戰士 - 夏娜 | `A0BH` | name  · w3a: `{'aefs': 'Flare1', 'aefl': 'Flare2'}` |
| `godie-e00w.e` | 77-03 GLADIARIA ALAT | 神鳴流劍士 - 櫻綻剎那 | `A0JG` | name  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-e00x.e` | 77-03 GLADIARIA ALAT | 神鳴流劍士 - 櫻綻剎那 | `A0JG` | name  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-hvwd.ex` | 02-002 神通眼 | 除魔巫女 - 桔梗 | `A0S6` | prefix  · w3a: `{'aefs': 'MetalHeavyBashStone'}` |
| `godie-n003.ex` | 42-002 魔力印章 | 黑暗福音 - 依文潔琳 | `A06K` | prefix  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-n01c.ex` | 08-002 龍魔人 | 傳說的龍騎士 - 勇者小呆 | `A0T1` | prefix  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-n01g.ex` | 42-002 魔力印章 | 黑暗福音 - 依文潔琳 | `A06K` | prefix  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-nbbc.ex` | 08-002 龍魔人 | 傳說的龍騎士 - 勇者小呆 | `A0T1` | prefix  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-o02l.r` | 58-04 瘋狂皮卡丘 | 神騎寶貝 - 皮卡丘 | `A040` | name  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-ofar.r` | 58-04 瘋狂皮卡丘 | 神奇寶貝兒 - 皮卡丘 | `A040` | name  · w3a: `{'aefs': 'StormEarthFireSound'}` |
| `godie-u00v.r` | 78-04 死亡噴射肘擊 | 黑手黨老大 - 基廉列克 | `A0L6` | name  · w3a: `{'aefs': 'MetalHeavyBashStone'}` |

---

# ③ 三個「等 owner 裁決」的票 —— 補上同樣的資訊密度

## 3-A #554 的第二個裁決點：**分層播放**（票裡只寫「17 列 / 15 支」）

⭐ **就是這 15 支**（`content/audio-manifests/ability-sfx-cues.json` 的 `unmatched[cause=secondary-cue]`）。
每一支原作 JASS 綁了不只一個 `gg_snd`，而 `combatSfxKey()` 一次施法只回**一個** key：

| id | 技能 | 英雄 | 現在播的 | ⛔ 沒播到的 |
|---|---|---|---|---|
| `godie-e008.r` | 21-04 討滅封絕 | 火霧戰士 - 夏娜 | `wc3.soulpreservation` | `wc3.flaretarget1` |
| `godie-emns.q` | 44-01 死神之眼 | 奇樂 - 夜神月 | `wc3.gruntyesattack1` | `wc3.fountainoflifewhat1` |
| `godie-h00l.q` | 60-01 旋風斬 | 時空勇者 - 林克 | `wc3.druidofthetalonmissilelaunch2` | `wc3.witchdoctorcastattack1` |
| `godie-hpb1.w` | 07-02 者、皆、陣 | 獸矛傳承使 - 蒼月潮 | `wc3.moongo` | `wc3.darksummoninglaunch1` |
| `godie-u00l.q` | 25-01 北斗懺悔拳 | 北斗之鼠 - 拳四郎 | `wc3.peondeath` | `wc3.gruntwhat2` · `wc3.peonwhat2` |
| `godie-umal.q` | 25-01 北斗懺悔拳 | 北斗神拳掌門人 - 拳四郎 | `wc3.peondeath` | `wc3.gruntwhat2` · `wc3.peonwhat2` |
| `godie-u00n.e` | 76-03 伸縮自如的槍亂打 | 草帽小子 - 蒙其.D.魯夫 | `wc3.demonhuntermissilehit3` | `wc3.waterelementalmissile3` |
| `godie-u00o.e` | 76-03 伸縮自如的槍亂打 | 草帽小子 - 蒙其.D.魯夫 | `wc3.demonhuntermissilehit3` | `wc3.waterelementalmissile3` |
| `godie-u00v.w` | 78-02 地走龍牙破 | 黑手黨老大 - 基廉列克 | `wc3.gluescreenmeteorhit1` | `wc3.gluescreenmeteorhit2` |
| `godie-u010.e` | 38-03 邪王炎殺黑龍波 | 邪眼師 - 飛影 | `wc3.dragonyes2` | `wc3.shimmeringportaldeath` |
| `godie-uvng.e` | 38-03 邪王炎殺黑龍波 | 邪眼師 - 飛影 | `wc3.dragonyes2` | `wc3.shimmeringportaldeath` |
| `godie-u010.r` | 38-04 黑龍波吸收 | 邪眼師 - 飛影 | `wc3.dragonroostwhat1` | `wc3.flashback1second` |
| `godie-uvng.r` | 38-04 黑龍波吸收 | 邪眼師 - 飛影 | `wc3.dragonroostwhat1` | `wc3.flashback1second` |
| `godie-ubal.r` | 37-04 魔界之王 | 魔界霸主 - 巴恩大魔王 | `wc3.shadowhunterready1` | `wc3.treantready1` |
| `godie-ubal.w` | 37-03 災難之牆 | 魔界霸主 - 巴恩大魔王 | `wc3.trollbatriderpissed2` | `wc3.hcancelbuilding` |

⭐ **那 12 個第二 cue 的音檔全部已經出貨**（都在 `content/config/audio-map.json`）⇒ 位元組是現成的。
⛔ 缺的是「一次施法播兩層」這個機制（`combatSfxKey()` 的簽章要從 `string|null` 變成陣列）。

**要 owner 決定的**：做不做？做的話預設 on 還是 off？
（lane 的建議是 `cues.*.layer2` + 後台一格 `abilitySfx.layeredCast`，出貨預設 **off**。）

## 3-B #554 的第三個裁決點：**出貨了卻構不到的 `wc3.*` clip**（票裡寫 11，實際 **83**）

`content/config/audio-map.json` 有 **135** 個 `wc3.*` clip，
但 `ability-sfx-cues.json` 只宣告 **52** 個 cue
⇒ ⭐ **83 個 clip 已經打包出貨，內容作者寫 `sfxKey: "wc3.warstomp"` 會靜靜退回元素風聲/通用音。**

其中 **9 個正是 3-A 那些「沒播到的第二 cue」**（`flaretarget1` · `fountainoflifewhat1` ·
`witchdoctorcastattack1` · `gruntwhat2` · `peonwhat2` · `waterelementalmissile3` ·
`gluescreenmeteorhit2` · `shimmeringportaldeath` · `flashback1second`）。

其餘 74 個含一批**明顯可用的施法音**：
`wc3.warstomp` · `wc3.shockwave` · `wc3.fanofknives` · `wc3.blademasterwhirlwind` ·
`wc3.criticalstrike` · `wc3.holybolt` · `wc3.healtarget` · `wc3.bloodlusttarget` ·
`wc3.dispelmagictarget` · `wc3.invisibilitytarget` · `wc3.reincarnation` ·
`wc3.flamestrikebirth1` · `wc3.infernalbirth1` · `wc3.blinkbirth1` ·
`wc3.fireballmissilelaunch1-3` · `wc3.coldarrow1-3` · `wc3.catapultmissile1-4` ·
`wc3.keeperofthegrovemissilelaunch1-3` / `hit1-3` · `wc3.deathcoilmissilelaunch1` ·
`wc3.farseermissile` · `wc3.crushingwavecaster1` · `wc3.ancestralspirit` ·
`wc3.stasistotem` · `wc3.wandofneutralization` · `wc3.feralspirittarget1` …
（其餘是死亡音 `*death*` 與消散音 `*dissipate*`，⛔ 不適合當施法音。）

**要 owner 決定的**：把這 83 個（或其中的「施法音」子集）宣告成 cue？
⚠️ `apps/client/src/audio/sfxReachability.ts` 有**剛好 52 列**指向這份 JSON ⇒ 擴大要同步改那裡。

## 3-C #423 千年練成／樹海降臨 —— **三個問題的數字**（票裡只說「需要平衡裁決」）

票已經列了原作證據鏈，⛔ 但沒有給 owner「在 GGD 裡這是多大一件事」的比例尺。補上：

| 原作數值 | 換算成 GGD 的比例尺 |
|---|---|
| 千年練成樹精 `n00Q` **HP 450** | ⭐ GGD 英雄 `baseStats.maxHealth` 中位數 **150**（min 100 / max 150）⇒ **一具樹精 = 3 個英雄的基礎血量** |
| 一次召 **4 / 6 / 8** 具 | ⇒ 滿級一次 **3,600 HP** 的身體 |
| 技能冷卻 `godie-e00s.r` = **90 秒**（三級都是 90） | ⇒ 每 90 秒一次 |
| EX（樹海降臨）**8 / 12 / 16** 具 × HP 4,500 | ⇒ 滿級一次 **72,000 HP** 的身體 |
| 攻擊 100 / 射程 180 / 護甲 2 / `move_speed 0` | GGD 英雄 `baseStats.ad` ≈ 30（+成長 4.8/級）⇒ **一具樹精的攻擊 ≈ lv15 英雄** |

**三個問題（原文）＋ 現在可以直接回答的部分**

1. **要不要做這具身體？** ⇒ 需要新 `model@1` + 一顆 GLB + 新 `champion@1` + 選人畫面排除。
   ⭐ 今天代價是 **0**（`content/items` 與 `content/augments` 沒有任何一件吃召喚物）。
2. **樹精的壽命？** ⛔ 原作沒有這個數字（Rain of Chaos 的樹精是**永久**的）。
   ⇒ ⭐ 三個可選錨點：**(a) 永久**（原作）· **(b) 一回合**（GGD 每場 5–6 回合）·
   **(c) 一個秒數**（建議與冷卻同數量級，例如 30 / 45 / 60 秒）。
   ⚠️ 選 (a) 的話，每 90 秒 +3,600 HP 的免費身體是一次**真的**平衡改動。
3. **`maxAlive` / `onCap`？** ⇒ 建議做成後台兩格（第一守則），預設值請 owner 指定。

---

## 附錄：怎麼重現這份報告的數字

⛔ 全部是唯讀查詢，沒有改任何檔案。

```bash
# ① 348 / 51 / 297 的落點
python3 - <<'PY'
import json,glob
ELEM={'fire','ice','lightning'}
n=e=0
for p in glob.glob('content/abilities/*.json'):
    if p.endswith('_index.json'): continue
    d=json.load(open(p,encoding='utf-8'))
    if '"sfxKey"' in json.dumps(d,ensure_ascii=False): continue
    n+=1; v=d.get('vfxKey')
    if isinstance(v,str):
        q=v.split('.')
        if len(q)>=3 and q[0]=='fx' and q[1]=='prim' and q[2] in ELEM: e+=1
print(n, e, n-e)
PY

# ② .upper() 的 join 破口
python3 -c "
import json
h=json.load(open('tools/w3x-import/out/GoDieEX22s-src/HERO_NUMBERS.json'))['hero_to_number']
import pathlib
c=[p.stem.split('-',1)[1] for p in pathlib.Path('content/champions').glob('godie-*.json')]
ci={k.upper():k for k in h}
print('upper():',sum(1 for x in c if x.upper() in h),'  不分大小寫:',sum(1 for x in c if x.upper() in ci),'/',len(c))"

# ③ w3a 的 aefs / aefl（⛔ 抽取器沒抽）
cd tools/w3x-import && python3 -c "
from w3xlib.objdata import parse_object_file
w=parse_object_file(open('out/GoDieEX22s-src/raw/war3map.w3a','rb').read(),True)
o={}
for t in ('original','custom'):
    for e in w[t]:
        d={m.code:m.value for m in e.mods if m.code in ('aefs','aefl') and m.value}
        if d: o[e.obj_id]=d
print(len(o)); print(o)"

# ④ war3map.j 的 PlaySound 數量
grep -c 'PlaySound' tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j
```

## ⚠️ 需要主 session 接線

| # | 事情 | 為什麼 lane 不能做 |
|---|---|---|
| 1 | 把 §① 貼進 **#544**、§② 貼進 **#554**、§3-C 貼進 **#423** | ⛔ gh 寫入是禁令 |
| 2 | ⭐ 開一張新票：**`tools/w3x-import` 的三個抽取根因**（`.upper()` · 施法閘 · `aefs`/`aefl`），掛在 **#542** 底下 | 同上。⚠️ 它是 #542 的**第二個實例**，⛔ 不是重複 |
| 3 | ⭐ 開一張新票或併進 #554：**`ELEMENT_SFX` 缺 11 種元素 ⇒ 229 支技能掉到通用音** | 同上。⛔ 這一項不需要裁決，是缺陷 |
| 4 | ⚠️ 更新 **#542** 的前提：`jass-spells/` 今天有 **415** 個 `.j` 檔（含 98 個 `unit-*.j`），⛔ 不是票裡寫的 67 | 同上 |
| 5 | ⚠️ `content/items/godie-i018.json` 的 `authoringNote` 裡「lv10 ≈ 53 敏 → 53%」等 MEASURED 數字**已過期**（出貨 `agiGrowth`/`strGrowth` 全是 0） | 內容檔在柵欄外 |
| 6 | ⚠️ 朗基努斯之槍與盾甲天書的**合成材料全部在 `content/_legacy/items/`** ⇒ 兩件今天都合不出來 | 需要 owner 排（第零守則⑧） |
