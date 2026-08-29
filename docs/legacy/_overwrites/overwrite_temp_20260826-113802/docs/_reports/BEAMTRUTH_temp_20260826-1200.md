# 光束砲家族 —— 逐格 JASS 真相稽核（TRUTH-JASS lane）

- 日期：2026-08-26
- 唯一資料來源：`tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`（56,765 行）＋ 同目錄 `OBJECTS.json`
- 交叉驗證：`docs/_reference/w3x-shots/{saber,eva01,lina,evangeline}/`（逐張看過）
- ⛔ 本 lane **完全沒有寫入 git、沒有改任何 content/ 或 tools/**。唯一新檔就是這一份報告。

---

## 0. 一句話結論

> **全 w3x 裡「光束砲」形狀的 dummy 生成點，`CreateNUnitsAtLoc` 的第一個參數 100% 是 `1`。
> 一支都沒有例外。粗、長、多層的觀感全部來自「同一點疊 2–3 具不同模型 × 放大到 250–410% × 動畫放慢到 15%」。**

而全地圖唯一真正「N 具沿施法方向排成一列」的技能是 **08-03 龍鬥氣砲咒文**（10 × RedDragonMissile，
150u 間距）—— ⭐ **而它正是被誤標成 59-04 的那一支**（見 §5 根因）。

---

## 1. 主表：每一列 = 一次 `CreateNUnitsAtLoc`

行號皆為 `war3map.j`。`scale0` = 物件編輯器的美術縮放（`OBJECTS.json.units[*].scale`），
`ScalePercent` 是 JASS 的覆寫。`t` 是 `SetUnitVertexColorBJ` 的第 4 參數 ⇒ `alpha=(100−t)/100`。

### 1.1 20-03 約束與勝利之劍 — `A0D5` · 4 級 · `Trig_Excalibur_Actions` (32298–32360)
英雄：`E002`/`E00L` 亞瑟王 · `E00Q` 英靈-亞瑟王（黑化）

| # | 行 | dummy | 模型 | scale0 | 位置 | facing | ScalePercent(x,y,z) | TimeScale | VertexColor | 清場 |
|---|---|---|---|---|---|---|---|---|---|---|
| ① | **32322** | `h00X` 勝利劍 黑化 | `NetherStrike.mdl` | 0.2 | `PolarProjection(LocPoint3, **+256u**, ang)`＝施法者前方 **406u** | `AngleBetweenPoints(caster→target)` | `250+15×lvl` 三軸（265/280/295/310） | — | **無** | ⛔ **無人清**（末尾 ForGroup 只掃 `h00S`）→ 殘留 |
| ② | **32324** | `h00S` 勝利劍 | `Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl` | 0.2 | `LocPoint3` ＝施法者前方 **150u** | 同上 | `250+15×lvl` 三軸 | — | **無** | `TriggerSleepAction(2)` → ForGroup `h00S` Kill+Remove |
| ③ | **32327** | `h008` 特效三號 | `Abilities\Weapons\FragDriller\FragDriller.mdl` | 2.0 | `LocPoint3`（同 ②，**同點疊加**） | 同上 | `350+15×lvl` 三軸（365/380/395/410） | **15%** | **無** | 建完**立刻** `KillUnit` → 播死亡動畫 |

⭐⭐ **①與②是 `if/else`，⛔ 不是兩具都生。**
`Trig_Excalibur_Func019C`（32227）：`GetUnitTypeId(GetTriggerUnit()) == 'E00Q'` ⇒
**只有黑化亞瑟王**走 NetherStrike，其餘（`E002`/`E00L`）走 ReviveHuman。

⇒ ⭐ **一次施放 = 2 具**（① 或 ②，加上 ③）。
⛔ 交辦單裡寫的「三顆不同模型同點疊加（h00X ＋ h00S ＋ h008）」**不成立** —— 那是把 if/else 讀成了序列。

- 額外（⛔ 不是光束）：**32317 / 32319** 在 `LocPoint3` 各放一發 `AddSpecialEffectLocBJ`：
  `NEDeathSmall.mdl` ＋ `NeutralBuildingExplosion.mdl` ＝ 擷圖裡施法者腳邊那顆白藍色核心爆點。
- 傷害：`WinSwordCounter 1..6 × 200u` **兩個迴圈**，⛔ **迴圈裡沒有任何 Create／AddSpecialEffect** —— 純判定。

### 1.2 09-04 龜派氣功 — `A03S` · 3 級 · `Trig_Turtle_Power_Actions` (31896–31950)
英雄：`Ogrh` 賽亞人 · `Hhkl`/`O00X` 超級賽亞人

| # | 行 | dummy | 模型 | scale0 | 位置 | facing | ScalePercent | TimeScale | 清場 |
|---|---|---|---|---|---|---|---|---|---|
| ① | **31907** | `h007` 特效龜派 | `ReviveHuman.mdl` | 1.25 | 前方 150u | `AngleBetweenPoints(caster→target)` | `250+15×lvl` 三軸 | — | ⛔ **無人清** → 殘留 |
| ② | **31909** | `h008` 特效三號 | `FragDriller.mdl` | 2.0 | 前方 150u（**同點**） | 同上 | `350+15×lvl` 三軸 | **15%** | 立刻 `KillUnit` |

⇒ **一次施放 = 2 具，同點疊加。**

### 1.3 03-04 全彈發射 — `A04N` · 3 級 · `Trig_Allbullet_Actions` (32905–32956)
英雄：`Hlgr` 鋼彈

| # | 行 | dummy | 模型 | scale0 | 位置 | facing | ScalePercent | TimeScale | 清場 |
|---|---|---|---|---|---|---|---|---|---|
| ① | **32916** | `h007` 特效龜派 | `ReviveHuman.mdl` | 1.25 | 前方 150u | `AngleBetweenPoints` | `250+15×lvl` | — | ⛔ 無人清 |
| ② | **32918** | `h00O` 特效集氣 | `Abilities\Spells\Human\MassTeleport\MassTeleportTarget.mdl` | 1.25 | 同點 | 同上 | `350+15×lvl` | **15%** | ForGroup `h00O`（sleep 2 後） |
| ③ | **32921** | `h00N` 特效全彈 | `Abilities\Spells\Items\TomeOfRetraining\TomeOfRetrainingCaster.mdl` | 1.25 | 同點 | 同上 | `350+15×lvl` | **25%** | 立刻 `KillUnit` ＋ ForGroup `h00N` |

⇒ ⭐ **一次施放 = 3 具同點疊加。這是全家族唯一真正的三層。**（⛔ 不是 20-03）

### 1.4 90-04 陽光烈焰 — `A0R4` · 3 級 · `Trig_SunFire_Actions` (26782–26809)
英雄：`Hgam`/`H02R` 種子神奇寶貝

| # | 行 | dummy | 模型 | scale0 | 位置 | facing | ScalePercent | 清場 |
|---|---|---|---|---|---|---|---|---|
| ① | **26790** | `h007` 特效龜派 | `ReviveHuman.mdl` | 1.25 | 前方 150u | `AngleBetweenPoints` | **`200, 200, 400`**（固定，⛔ 不隨等級） | `TriggerSleepAction(2)` → ForGroup `h007` |

⇒ **一次施放 = 1 具。** 這是家族裡唯一寫出「Z 軸 ≠ X/Y」的一行 —— 見 §4 的引擎警告。

### 1.5 59-04 野戰型陽電子砲 — `A0GI` · 3 級 · `Trig_ElecPower_Actions` (47756–47766)
英雄：`E00R` 最終泛用人型決戰兵器（EVA 初號機）

| # | 行 | dummy | 模型 | scale0 | 位置 | facing | ScalePercent | 清場 |
|---|---|---|---|---|---|---|---|---|
| ① | **47757** | `h01P` 野戰電子砲 | `Abilities\Spells\Other\Awaken\Awaken.mdl` | （無） | ⭐ **施法者自己的位置**（`GetUnitLoc(GetTriggerUnit())`，⛔ 不前推） | `AngleBetweenPoints(caster→target)` | `120+30×lvl` 三軸（150/180/210） | ⛔ **整份 JASS 沒有任何一行清它** |

⇒ **一次施放 = 1 具。整支技能只有這一具 dummy。**

⭐⭐ **而 `Awaken.mdl` 不是光束** —— 它是 WC3 的「甦醒」演出：**地面一個洋紅色符文圓陣 ＋ 向上升的環**。
`docs/_reference/w3x-shots/eva01/` 四張擷圖逐張確認：畫面上是**繞著施法者的粉紫色符文圓陣＋上升橘環**，
**一道光束都沒有**。⇒ 59-04 在原作裡是「腳下開陣」，⛔ 不是「射出一道砲」。
其餘演出只有：`AddSpecialEffectLocBJ(caster, FlameStrikeTarget.mdl)` 一根火柱 ＋ 對 900u 內英雄的鏡頭震動（`lvl×3` / `lvl×4`）。

### 1.6 81-03 Divine Buster Extention — `A0XN` · 4 級 · `Trig_DivineBusterEx_Actions` (36034–36081)
英雄：`O01Z` 魔砲少女 · `O02V` 白色惡魔

| # | 行 | dummy | 模型 | scale0 | 位置 | facing | ScalePercent | 清場 |
|---|---|---|---|---|---|---|---|---|
| ① | **36044** | `h01Y` 奈葉魔法陣 | `MidchilderNanohaAura.mdl` | （無） | 前方 150u | `GetUnitFacing(caster)` | ⛔ **無**（用 scale0） | 2.1s 後 Kill+Remove |
| ② | **36046** | `h01Z` 奈葉魔法陣（放大） | `MidchilderNanohaAura.mdl` | 2.0 | **施法者身上** | `GetUnitFacing` | ⛔ **無** | 同上 |
| ③ | **36048** | `h01V` 81-03天神烈破 | `ReviveHuman.mdl` | 3.0 | 前方 150u | `GetUnitFacing` | 見下 | 同上 |

⭐⭐ **③ 的縮放被寫了兩次，而第二次覆寫第一次：**

```
36049  SetUnitScalePercent( GetLastCreatedUnit(), 180.00, 180.00, 300.00 )      ← h01V
36050  set udg_Nanoha_DBE_Unit3 = GetLastCreatedUnit()                          ← 還是 h01V
36051  SetUnitScalePercent( udg_Nanoha_DBE_Unit3, (lvl*50)+100, 100, 100 )      ← 同一具,覆寫
```

⇒ ⭐ **`180,180,300` 是死碼。實際生效的是 `(50×lvl+100, 100, 100)`** ＝ 150/200/250/300%。
⛔ 交辦單裡的「h01V ＋ (180,180,300)」是讀到了被覆寫的那一行。

- 生命週期：`TriggerSleepAction(0.50)` ＋ `TriggerSleepAction(1.60)` ＝ **2.1 秒**後三具一起 Kill+Remove。
- 傷害：`Index 1..6 × 150u` 純判定迴圈，⛔ 迴圈裡沒有任何視覺。

### 1.7 Saber EX 收招（ExcaliburMAX）— `Trig_ExcaliburMAX_Actions` (32559–32661)
不是技能書上的技能，是 `udg_saber` 受傷觸發的處決演出。光束段（32628–32632）：

| # | 行 | dummy | 模型 | 位置 | facing | ScalePercent | TimeScale |
|---|---|---|---|---|---|---|---|
| ① | **32628** | `h00S` 勝利劍 | `ReviveHuman.mdl` | `PolarProjection(saber, **+70u**, saberFacing)` | `GetUnitFacing(saber)` | `350` 三軸（固定） | — |
| ② | **32630** | `h008` 特效三號 | `FragDriller.mdl` | ⭐ **目標身上**（`GetUnitLoc(udg_ExcalburMAXTarget)`） | `GetUnitFacing(saber)` | `400` 三軸（固定） | **15%** |

⇒ 2 具，**⛔ 不同點**：一具在自己前方 70u、一具在目標腳下。清場在 `TriggerSleepAction(4.00)` 之後。
前段的 7 連斬用 `h02G` Saber殘影（`HeroSaber.mdl`，TimeScale **600%**，
`SetUnitVertexColorBJ(80,10,10,50)` ⇒ RGB (204,26,26) 暗紅 · **alpha 0.5**）＋ `u018` DarkPortalTarget（100,100,100,**50** ⇒ 白 · alpha 0.5）。

---

## 2. ⭐ 疊加層總表（deliverable ②）

| 技能 | 同一次施放生幾具 | 各是什麼 | 是否同點 |
|---|---:|---|---|
| 20-03 約束與勝利之劍 | **2** | (`h00X` NetherStrike **或** `h00S` ReviveHuman) ＋ `h008` FragDriller | 走 `h00S` 時同點；走 `h00X` 時 ①在 406u、③在 150u ⇒ **不同點** |
| 09-04 龜派氣功 | **2** | `h007` ReviveHuman ＋ `h008` FragDriller | 同點（150u） |
| 03-04 全彈發射 | **3** | `h007` ReviveHuman ＋ `h00O` MassTeleportTarget ＋ `h00N` TomeOfRetrainingCaster | 同點（150u） |
| 90-04 陽光烈焰 | **1** | `h007` ReviveHuman | — |
| 59-04 野戰型陽電子砲 | **1** | `h01P` Awaken（**符文圓陣**） | 施法者本體位置 |
| 81-03 DBE | **3** | `h01Y`＋`h01Z` MidchilderNanohaAura 魔法陣 ×2 ＋ `h01V` ReviveHuman | ①③在 150u、②在施法者身上 |
| Saber EX 收招 | **2**（＋前段 7×2 殘影） | `h00S` ReviveHuman ＋ `h008` FragDriller | 不同點（+70u / 目標身上） |

⭐ **沒有任何一支的疊加層是「同一具模型複製 N 份」** —— 每一層都是**不同的模型**在同一點播不同的動畫。
這正是擷圖上「很粗、多層、邊緣有分層的橘金光」的來源。

---

## 3. ⭐ 「光束本體」vs「沿線傷害的視覺」—— 分開列（deliverable ③）

⚠️ 這一欄就是我上一輪走歪的地方。兩者在 JASS 裡長得很不一樣，判準是**它是 unit 還是 effect、
以及它的半徑是不是隨迴圈計數器變大**。

| 技能 | 光束本體（unit，⛔ 不在迴圈裡） | 沿線傷害的視覺（**⛔ 不是光束**） |
|---|---|---|
| 90-04 陽光烈焰 | `h007` ×1 @150u | **`AddSpecialEffectLocBJ`（effect，⛔ 不是 unit）× 10**，`FlameStrikeTarget.mdl`，`i×100u`（26798–26799）。判定半徑 280u |
| 09-04 龜派氣功 | `h007`＋`h008` @150u | **`CreateNUnitsAtLoc(1,'h006')` × 6**，`FlameStrike1.mdl`，`i×200u`（31927）。判定半徑 400u |
| 03-04 全彈發射 | `h007`＋`h00O`＋`h00N` @150u | **`h006` × 6**，`i×200u`（32931）。判定半徑 400u |
| 20-03 約束與勝利之劍 | 見 §1.1 | ⭐ **完全沒有** —— 兩個 `1..6 × 200u` 迴圈裡一行視覺都沒有，只有 `ForGroupBJ` 判定 |
| 59-04 野戰型陽電子砲 | `h01P` ×1 @施法者 | 沒有沿線視覺；只有施法者腳下一發 `FlameStrikeTarget.mdl` |
| 81-03 DBE | 見 §1.6 | ⭐ **完全沒有** —— `1..6 × 150u` 迴圈純判定 |

⭐⭐ **我當初的誤讀**：把 90-04 迴圈裡那 **10 發 `AddSpecialEffectLocBJ(FlameStrikeTarget)`** 讀成
「光束由 N 具組成」。它們是 **effect 不是 unit**，⛔ 沒有 facing、⛔ 沒有 scale、
⛔ 生命週期是 `DestroyEffectBJ` 立即銷毀（播完 birth 就消失），**而且半徑 = 傷害取樣半徑**。
⇒ 它是「傷害打在哪裡」的可視化，⛔ 不是光束的幾何。

⭐ 而 09-04/03-04 的 `h006` 雖然**真的是 unit**，它仍然屬於這一欄：
它用 `bj_UNIT_FACING`（⛔ **不朝施法方向**）、沒有 ScalePercent、緊接著就是同一個 `LocPoint3` 的
`GetUnitsInRangeOfLocMatching(400)` 判定 —— **它是火柱不是光束**。
GGD 側已經正確地把它綁成 `tpl-locust-line` + `w3x.stock.flamestrike1`（`godie-ogrh.r.json` / `godie-o00x.r.json`）✅。

---

## 4. ⚠️ 兩個「照抄會抄錯」的引擎語意

### 4.1 `SetUnitScalePercent` 的 Y/Z 參數
WC3 的 `SetUnitScale(u, x, y, z)` **只讀 x，y/z 被忽略**（模型一律等比縮放）。
⇒ 若此說成立，下列三處寫出來的非等比**在原作畫面上從來沒有發生過**：

| 位置 | 寫的 | 若 y/z 被忽略則實際 |
|---|---|---|
| 90-04 `26791` | `200, 200, **400**` | 等比 **200%**（⛔ 沒有 Z 軸拉長 2×） |
| 81-03 `36049`（已被 36051 覆寫） | `180, 180, 300` | 不生效（死碼） |
| 81-03 `36051` | `(50L+100), 100, 100` | 等比 **50L+100 %** |
| 03-01 系 `31029` `Trig_AKT_Effect` | `500, 100, 100` | 等比 500% |
| 70-xx `47942` `Trig_WoodStone` | `(150L+200), 300, 300` | 等比 `150L+200 %` |

⚠️ **這一條我沒有在本 repo 內找到既有的驗證**，所以標成**待驗**：
⭐ 判準很便宜 —— 找一具 GGD 已經轉好的 `revivehuman.glb`，用 200/200/400 與 200/200/200 各渲一張比對；
若兩張一樣，就照「等比」實作，⛔ 不要在 GGD 做 Z 軸拉長（那會做出一個原作沒有的東西）。
在驗完之前，⛔ **不要**把 `400` 當成「原作就是這樣」寫進任何模板預設 —— 那正是本 lane 要根治的病。

### 4.2 頂點色：⭐ **這一族一格都沒有**
全 repo 掃 57 處 `SetUnitVertexColorBJ`（含函式歸屬，見附錄 A），
**`h007` / `h008` / `h00S` / `h00X` / `h00N` / `h00O` / `h01P` / `h01V` 一具都不在裡面。**

⇒ ⭐ **光束的顏色 100% 來自模型自己的貼圖**（ReviveHuman 的金橘、FragDriller 的橘紅…），
⛔ 不是 tint。
⇒ ⛔ **`godie-e002.e.json` / `godie-e00l.e.json` 上的 `"tint": [1.0, 0.3922, 0.3922]` 沒有 JASS 出處。**
（`0.3922 ≈ 100/255` ⇒ 這是把 `tpl-beam-roll` 描述裡那句「頂點色 [255,100,100] 紅」照抄成 RGB —— 而那句話本身是編的。）

---

## 5. ⭐⭐ 根因：`count=6` 是怎麼長出來的（deliverable：反省）

### 5.1 全地圖真正「N 具沿施法方向排成一列」的技能只有一支

我對 56,765 行做了窮盡掃描（每一個 `loop … CreateNUnitsAtLoc … PolarProjection` 區塊，
逐個判斷半徑是不是隨計數器變大、角度是不是固定成施法方向）。結果：

| 形狀 | 出現次數 | 誰 |
|---|---:|---|
| **半徑 ∝ i、角度固定 = 施法方向**（＝真正的沿線） | **3** | ① `Trig_DraBom` **08-03 龍鬥氣砲咒文** 10 × `e003` RedDragonMissile @150u ② `Trig_Turtle_Power` 6 × `h006` FlameStrike1 @200u（火柱，§3） ③ `Trig_Allbullet` 6 × `h006` @200u（火柱，§3） |
| 角度 ∝ i（環／扇） | 8 | `EatDragon`/`DarkDragonEX`（12×30°）· `GaiaAngre`/`GroundAttack`（10 顆石頭）· `ManyStar`（36）· `ArmyOfTheDead`（8×45°）· `Ptt_Judge`（5×75°）· `LightCut`（12×30°） |
| 隨機方向 | 3 | `NineSwords` · `Gigantomakhia_0` · `HolyShit` |
| 垂直於施法方向（牆） | 1 | `DestWall`（`facing+90°`） |

⇒ ⭐ **`count>1` 在光束家族裡的出現次數是 0。**

### 5.2 錯誤是怎麼進到模板預設的 —— 一個**票號互換**

`content/ability-templates/tpl-beam-roll.json` 的 description 逐字寫著：

> 「`A05J`(**59-04** DraBom)@28838 逐行 `loop i=1..10 × 150` 一次擺十具」
> 「`A0GI`(**08-03**)@47757」

而 `OBJECTS.json` 說：

| rawcode | 真的是 | 真的在哪 | 真的做什麼 |
|---|---|---|---|
| `A05J` | **08-03 龍鬥氣砲咒文**（`Nbbc`/`N01C` 傳說的龍騎士） | 28838 | 10 × `e003` RedDragonMissile 沿線 @150u，`TimedLife 1.0s`，**⛔ 沒有 SetUnitScalePercent** |
| `A0GI` | **59-04 野戰型陽電子砲**（`E00R` EVA 初號機） | 47757 | 1 × `h01P` Awaken 符文陣，@施法者本體 |

⭐⭐ **兩張票的標籤被對調了。** 之後發生的每一件事都是這一個交換的直接後果：

1. 讀到「59-04 是 10 具沿線」→ 把「沿線」當成**家族**性質 → 寫進 `params.count.default`
   （⚠️ 而且連 10 都不是，**填了 6** —— 6 是 09-04/03-04 那個**火柱**迴圈的 `exitwhen > 6`，
   ⇒ 這個數字是把**兩支不同技能的兩個不同迴圈**混成一個預設，**它沒有任何單一出處**）
2. GH#692 實地查 59-04，量到「1 具」→ 只加了**逐支覆寫** `count: 1`
3. ⇒ 59-04 看起來被修好了，而**同一份錯誤預設繼續服務另外 6 支**（20-03 ×2 doc、09-04 ×2 doc、08-03 ×2 doc）

⇒ ⭐ **這就是 owner 說的「你已經知道是單個大型光束，是哪裡走歪」的機械答案：**
**逐支覆寫治好了症狀，掩蓋了病灶。**

### 5.3 ⭐ 這是 CLAUDE.md 已記錄的病的新載體
「我的推測會變成他的需求」說的是**票**；這一次的載體是**模板預設**。
差別在於它更難發現：票有 `> 引言` 格式可以檢查，而 `params.count.default = 6` 這一格
**長得跟一個從原作量到的值一模一樣**，⛔ 而且它旁邊那一大段 description 還替它背書。
⇒ ⭐ 可以當場檢查的規矩：**模板 `params.*.default` 的每一個數字，都要能指到一個
`檔案:行號` 的 JASS 出處；指不到 ⇒ 它是我挑的 ⇒ 描述裡要明說是我挑的。**

---

## 6. ⛔ `tpl-beam-roll.json` description 裡的**每一句可查證的錯**

（逐句對 JASS，僅列**錯的**；未列的即與 JASS 相符）

| # | description 原句 | JASS 真相 |
|---|---|---|
| 1 | 「原作是五具 dummy」＋列出 `h00S`·`h00X`·`h007`·`h01P`·`h000` | 那**不是同一次施放的五具** —— 是**五支不同技能各自的一具**。單次施放最多 3 具（03-04） |
| 2 | 「`h00S`(ReviveHuman·**頂點色[255,100,100]紅**)」 | ⛔ **`h00S` 從未被 `SetUnitVertexColorBJ` 碰過**（§4.2）。這個顏色不存在 |
| 3 | 「`h01P`(Awaken·**[100,100,0]橄欖**)」 | 同上，⛔ 沒有頂點色 |
| 4 | 「`h000`(ParasiteMissile·白·450×蓄力秒)」被列進光束家族 | `h000` 是 **12-04 龍氣爆發**（`A04X`）的**蓄力球**，`Trig_DragonExp` 29408。它 **@+125u、`bj_UNIT_FACING`（⛔ 不朝施法方向）、`TimedLife 6s`**，而且 `Trig_DragonExpGo` 每 0.02s `SetUnitPositionLoc(+75u)` 共 25 次 ⇒ **它是會飛的球，⛔ 不是光束** |
| 5 | 「`A05J`(**59-04** DraBom)@28838」／「`A0GI`(**08-03**)@47757」 | ⭐ **對調了**（§5.2） |
| 6 | 「`A0GI`(08-03)@47757 … 四支一次 `SetUnitPosition` 都沒有」 | 結論**碰巧對**（這四支確實不位移），但論據的票號是錯的 |
| 7 | 「`scale` 的預設 **2.5 ＝ 原作的 250%**（h00S/h00X/h007 共用的那一格，⛔ 不是我挑的數字）」 | ⭐ 原作是 **`250 + 15×lvl`**，⛔ 沒有任何一級等於 250%。最低級是 **265%**，滿級 **310%**。而且**第二層**是 `350+15×lvl`（365–410%）—— 「2.5」漏掉了整個第二層與整條等級曲線 |
| 8 | 「59-04 野戰型陽電子砲 `scale:1.2`」 | 原作 `120+30×lvl` ⇒ **1.5 / 1.8 / 2.1**。1.2 是把公式的常數項當成了值 |
| 9 | 「08-03 龍鬥氣砲咒文 `scale:4.5`」 | 08-03 的 `e003` **完全沒有 `SetUnitScalePercent`**；它的大小就是物件編輯器的 `scale0 = 4.0`。⇒ 4.5 沒有出處 |
| 10 | 「`count` 預設 **6**、`spacing` 預設 **2**（＝原作 200 wc3u÷100，09-04 量到的間距）」 | 200u 間距是 09-04 的**火柱**（`h006` FlameStrike1）迴圈，⛔ 不是光束。光束的 count 恆為 **1** |
| 11 | 「`modelKey` 預設 `imported.netherstrike`」 | NetherStrike **只在黑化亞瑟王（`E00Q`）身上出現**（1 次）＋ 佐助萬花筒 `h030`（1 次）。家族的通用模型是 **ReviveHuman**（4 個 unit type 用它） |
| 12 | 「`lifeSec` 預設 2（＝原作那個 `TriggerSleepAction(2)`）」 | 20-03/09-04/90-04 確實是 sleep 2；但 **81-03 是 2.1s**、**59-04 與 03-04 的 `h007` 從頭到尾沒有人清**（無限殘留）。⇒ 2 是**多數**，⛔ 不是全部 |
| 13 | （⭐ 同族的第三個載體，⛔ 不在 description 裡但在出貨 JSON 裡）90-04 的 `scale: 1.25` | 1.25 是 `h007` 的**物件編輯器基礎縮放**（`OBJECTS.json.units.h007.scale`），⛔ 不是玩家看到的大小。JASS 26791 用 `SetUnitScalePercent(200,200,400)` 覆寫它 ⇒ 少了 2 倍。**判準：兩個數字都存在時，JASS 的覆寫贏**（第〇·六守則第 3 層：程式不會說謊） |

---

## 7. 建議的修正（⛔ 本 lane **沒有動手**，理由在末尾）

### 7.1 `content/ability-templates/tpl-beam-roll.json`

| 欄位 | 現在 | 應為 | 出處 |
|---|---|---|---|
| `params.count.default` | **6** | ⭐ **1** | 7 支技能 · **13 個**光束生成點（26790 · 31907 · 31909 · 32322 · 32324 · 32327 · 32628 · 32630 · 32916 · 32918 · 32921 · 36048 · 47757）**全部**是 `CreateNUnitsAtLoc( 1, …)` |
| `params.spacing` | 2 | ⭐ **整格刪掉**（count=1 時它是 no-op ⇒ 第一·五守則的「說了不會發生」） | — |
| `params.modelKey.default` | `imported.netherstrike` | `w3x.stock.revivehuman`（NetherStrike 降為 20-03 黑化態的逐支覆寫） | 32322 vs 32324 的 if/else |
| `params.scale.default` | 2.5 | **2.65**（=`250+15×1`），並改成隨等級（若引擎支援）；⛔ 至少描述要寫明公式 | 31908 / 32326 / 32917 |
| `params.lifeSec.default` | 2 | 2（保留），但描述要註明 81-03=2.1、59-04/03-04 的第一層**不清場** | 各函式尾 |

⭐ **一鍵 rollback 就是 `count.default` 那一格**（把 1 改回 6）—— 符合 owner 2026-08-23
「自己判斷但留後台開關」的常設指令。

### 7.2 逐支
- `godie-e00r.r.json`（59-04）：⛔ **拿掉 `count: 1` 的逐支覆寫**（家族預設改成 1 之後它是冗餘）；
  ⭐ 加 `modelKey: w3x.stock.awaken`（⛔ 現在它繼承 netherstrike，而原作是 Awaken 符文陣）；`scale: 1.5`（L1）。
- `godie-e002.e.json` / `godie-e00l.e.json`（20-03）：⛔ **拿掉 `tint: [1.0,0.3922,0.3922]`**（§4.2 無出處）；
  ⭐ **補第二層** `spawnModelFx` = FragDriller `scale 3.65`（原作的 `350+15×lvl`，且動畫 15% 速度）。
- `godie-ogrh.r.json` / `godie-o00x.r.json`（09-04）：⭐ 補第二層 FragDriller。`tpl-locust-line`+flamestrike1 已正確 ✅。
- `godie-n01c.e.json` / `godie-nbbc.e.json`（08-03）：⭐ **這一支根本不屬於 `tpl-beam-roll`** ——
  它是 10 × RedDragonMissile 沿線 @150u ⇒ 應改綁 **`tpl-locust-line`**（count 10 / spacing 1.5 / lifeSec 1.0），
  ⛔ 並拿掉沒有出處的 `scale: 4.5`。
- ⭐ `godie-hgam.r.json` / `godie-h02r.r.json`（**90-04 陽光烈焰**）—— 這兩支**已出貨但綁錯家族**：
  ```json
  {"kind":"spawnModelFx","preset":"tpl-locust-orb","modelKey":"w3x.stock.revivehuman",
   "clip":"idle","soundKey":"wc3.shockwave","scale":1.25,"lifeSec":2.0}
  ```
  ⛔ `tpl-locust-orb`（球）↔ 原作是**朝 facing 的靜止大型光束** ⇒ 應為 `tpl-beam-roll`（`path:static`）。
  ⛔ **`scale: 1.25` 是 `h007` 的物件編輯器 `scale0`，⛔ 不是 JASS 的 `SetUnitScalePercent(200,…)`**
  ⇒ 少了整整 2 倍。⭐ 正確值 **2.0**（⛔ Z 軸的 400 等 §4.1 驗完再說）。`lifeSec 2.0` ✅ 對（sleep 2）。
  ⚠️ 這是同一個病的**第三個載體**：把「物件編輯器的基礎縮放」當成「原作的大小」——
  而 JASS 的覆寫才是玩家看到的那一個。
- ⛔ **03-04 全彈發射（`Hlgr` 鋼彈）與 81-03 DBE（`O01Z`/`O02V` 魔砲少女）在 GGD 側完全沒有 ability doc**
  （`ls content/abilities | grep -c 'hlgr\|o01z\|o02v'` = 0）。⇒ 這兩支是**未來要接**的，
  接的時候直接照 §1.3（三層）與 §1.6（三層，其中兩層是 `MidchilderNanohaAura` 魔法陣⛔非光束）做。

### ⛔ 為什麼本 lane 沒有動手改
`content/ability-templates/tpl-beam-roll.json` 與 `content/abilities/*.json` **都被內嵌進 `content/bundle.json`**。
改了來源而不能跑 `pnpm content:build`（本 lane 被禁止跑全域鎖指令）＝ 留下
「來源新 / bundle 舊」的工作樹 —— 那正是 CLAUDE.md 記錄的 2026-08-02 生產故障的形狀。
⇒ ⭐ 這些改動要由**握著 content 鎖的主 session** 一次做完並跑 `content:build`。
（另：`content/abilities/godie-*.json` 是 `skillremake:json` 的**產物**（621 份之一），
所以那幾支要改的是 `tools/skill-remake/heroes/godie-*.py`，⛔ 不是出貨 JSON。已用 `scripts/genguard.sh` 確認。）

---

## 8. 附錄 A：全家族「同形狀」窮盡清單（deliverable ④）

owner 說「一堆人都有用到」—— 以下是**每一個**使用光束家族模型的 unit type，
以及它在 JASS 裡**每一個**生成點。⛔ 沒有遺漏（用 `OBJECTS.json.units[*].model` 正則掃全 461 個 unit type）。

| 模型 | unit | 名稱 | scale0 | 生成點（行號） | 是不是「1具+放大+朝 facing」的光束 |
|---|---|---|---:|---|---|
| **ReviveHuman**(4) | `h007` | 特效龜派 | 1.25 | 26790 · 31907 · 32916 | ✅ ×3 |
| | `h00S` | 勝利劍 | 0.2 | 32324 · 32628（＋31992 預載，在 `SpecialUnitCreateArea` 場外） | ✅ ×2 |
| | `h01V` | 81-03天神烈破 | 3.0 | 36048 | ✅ ×1 |
| | `n00V` | 星光炸裂 delete | 2.0 | ⛔ **零生成點**（死資料） | — |
| **ReviveDemon**(1) | `n00M` | 賽飛天使 | 2.0 | ⛔ **零生成點** | — |
| **NetherStrike**(2) | `h00X` | 勝利劍 黑化 | 0.2 | 32322（＋32691 預載） | ✅ ×1（**只有 `E00Q`**） |
| | `h030` | 佐助萬花筒效果 | 4.0 | 42213 `Trig_ImbaEye` | ⛔ `bj_UNIT_FACING`、無 ScalePercent、`RemoveUnitSP(2,1)` ⇒ **不是光束**，是原地一發 |
| **Awaken**(2) | `h00M` | 特效加農炮 | 1.25 | ⛔ **零生成點**（死資料） | — |
| | `h01P` | 野戰電子砲 | — | 47757 | ✅ ×1（但模型是**符文陣**，§1.5） |
| **FragDriller**(1) | `h008` | 特效三號 | 2.0 | 31909 · 32327 · 32630 | ✅ ×3（永遠是**第二層**） |
| **DeathWave**(2) | `o00T` | 固有結界 | — | ⛔ **零生成點** | — |
| | `o01R` | 月牙天衝(虛化) | 2.0 | 37514 `Trig_Bleach_Moon` | ⛔ 無 ScalePercent，且 `Trig_Bleach_Moon_Effect` 每 tick `SetUnitPositionLocFacingBJ(+50u)` ⇒ **會飛的斬擊**，不是靜止光束 |
| *同族貼圖* MassTeleportTarget | `h00O` | 特效集氣 | 1.25 | 32918 | ✅（03-04 第二層） |
| *同族貼圖* TomeOfRetrainingCaster | `h00N` | 特效全彈 | 1.25 | 32921 | ✅（03-04 第三層） |
| | `h025` | 騎英之守綱(特效) | 4.0 | 38121 · 38381 | ⛔ `bj_UNIT_FACING`、無 ScalePercent |
| | `h02I` | 騎英之守綱(特效3) | 5.0 | 25419 | ⛔ facing = `caster−90°`、無 ScalePercent、`TimedLife 3s` |
| | `o00R` | 王者之笛 | 6.0 | 47086 | ⛔ `bj_UNIT_FACING`、`TimedLife 1s` |

### 其他「1 具 + ScalePercent + 朝 facing」但**不在光束家族貼圖**裡的（完整，供對照）

| 行 | 函式 | unit | 模型 | ScalePercent | 判定 |
|---|---|---|---|---|---|
| 34036 | `Trig_FinalShotting` | `h032` 龍氣2 GodEye | `AquaSpikeVersion2.mdl` | `800` 三軸 · `TimedLife 1s` | ⭐ **同形狀**（另一支砲，會被 `FinalShottingMove` 推走） |
| 55399 | `Trig_HudGhosts` | `h032` | 同上 | `300` 三軸 · `TimedLife 6s` | 同形狀但是常駐 |
| 47942 | `Trig_WoodStone` | `h01X` 大石頭 | `.mdl`（空） | `(150L+200), 300, 300` · `TimedLife 1s` | 同形狀 |
| 29964 | `Trig_DragonSlaveSet` | `h013` 新龍破斬2 | `MarkOfChaosTarget.mdl` | `230` 三軸 | ⭐ **就是 lina 擷圖裡施法者腳下那個粉色符文圓陣** |
| 31029 | `Trig_AKT_Effect` | `o01L` 召喚顯示特效 | `OblivionAura.mdl` | `500, 100, 100` | 目標點，`bj_UNIT_FACING` |
| 40722 | `Trig_EarthBoom` | `o029` 毀滅彈 | `PossessionCaster.mdl` | `1500` 三軸 | `bj_UNIT_FACING` |
| 50063 | `Trig_HoLuKen` | `o01P` 天翔龍閃 | `TornadoElemental.mdl` | `240` 三軸 | `bj_UNIT_FACING` |
| 47288 | `Trig_InfniLight` | `ogru` | — | `400` 三軸 | 真單位，被 `IssuePointOrder shockwave` ×15 環繞 |
| 42707 · 54484 · 35082 · 29453 · 43918 · 51932 | — | — | — | — | 蓄力／變身／殘影，⛔ 非光束 |

---

## 9. 附錄 B：對照組 —— 「看起來是長光束」但實作完全不同的兩支

⭐ 這兩支解釋了為什麼**肉眼看擷圖會得到「N 具沿線」的錯覺**。

### 04-03 龍破斬（Lina）`A04R` · `Trig_DragonSlaveSet` (29951) + `Trig_DragonSlaveMove` (30097)
- `h013` `MarkOfChaosTarget.mdl` @施法者、`230%` ⇒ **腳下粉色符文陣**（擷圖左下）
- `h014` `FireBlast.mdl` `scale0=4.5`、**⛔ 無 ScalePercent**，**只生 1 具**，
  然後每 tick `SetUnitPositionLoc(+45u)` 前進，**每一步丟一發** `HCancelDeath.mdl` ＋ `VolcanoDeath.mdl`
- ⇒ ⭐ **擷圖上那條又寬又長的火焰帶，是「一具會飛的頭」拖出來的 effect 尾跡，
  ⛔ 不是 N 具排成一列。** 結束時再補 18 發 `WarStompCaster` 環爆 ＋ 一發 `FlameStrikeTarget`

### 12-04 龍氣爆發 `A04X` · `Trig_DragonExp`(29398) + `Trig_DragonExpGo`(29569)
- `h000` `ParasiteMissile.mdl` ×1 @+125u、`TimedLife 6s`、`bj_UNIT_FACING`
- 蓄力期間 `Trig_DragonChannel` 每秒 `SetUnitScalePercent(i×450%, …)` ⇒ 球愈蓄愈大
- 放開後 `SetUnitPositionLoc(+75u)` × **25 tick @0.02s** ⇒ 飛 1,875u
- ⇒ 這是**真的會位移**的那一支（`tpl-beam-roll` 描述裡拿它當「對照組」是對的，⛔ 但票號寫成了 `A04X`@29587 而生成點其實在 29408）

---

## 10. 擷圖 ↔ JASS 對帳（deliverable：規格）

| 資料夾 | 英雄 | 畫面上是什麼 | 對到哪一段 JASS | 一致？ |
|---|---|---|---|---|
| `saber/` 5 張 | Saber（`E002` 亞瑟王） | **一道橫貫畫面的巨大金橘色光束**，由細變粗、末端呈扇形展開；施法者腳邊一顆白藍色核心爆點 | §1.1：`h00S` ReviveHuman `265–310%` ＋ `h008` FragDriller `365–410%` @動畫 15% 速度（⇒ 展開很慢 ⇒ 三張連拍看得到它在長大）；核心爆點 = 32318/32320 的 `NEDeathSmall`＋`NeutralBuildingExplosion` | ✅ **完全一致，且證明是 2 層不是 6 具** |
| `eva01/` 4 張 | 初號機（`E00R`） | **粉紫色符文圓陣繞著單位 ＋ 向上升的橘色環**，⛔ 一道光束都沒有 | §1.5：`h01P` = `Awaken.mdl` @施法者本體 | ✅ 一致 ⇒ **59-04 原作不是光束** |
| `lina/` 7 張 | 莉娜因巴斯（`H020`） | 寬火焰帶 ＋ 腳下粉色符文陣 | §9 龍破斬：1 具會飛的 `FireBlast` + effect 尾跡；符文陣 = `h013` MarkOfChaosTarget 230% | ✅ 一致 |
| `evangeline/` 8 張 | 依文潔琳 | 粉／紫**扁平寬光帶** ＋ 冰藍爆點 | ⛔ 不在本次七支之列（另一族） | — |

---

## 11. 可以當場檢查的三條（建議寫進守則／閘）

1. ⭐ **模板 `params.*.default` 的每一個數字，都要在 description 裡指到 `檔案:行號`。**
   指不到 ⇒ 描述要逐字寫「這是我挑的，rollback 把它改回 X」。
   （`count=6` 過不了這一關：它指不到任何一行。）
2. ⭐ **逐支覆寫要回頭問「那家族預設是誰的量值？」**
   閘的形狀：一個 ability doc 覆寫了某個 `preset` 的參數 ⇒ 該參數的家族預設**必須**在 description 裡
   說明「為什麼其他支不覆寫」。（GH#692 的 `count:1` 過不了：它讓一個錯誤預設繼續服務 6 支。）
3. ⭐ **讀 JASS 找「幾具」時，只數 `CreateNUnitsAtLoc` 的第一個參數與生成點個數，
   ⛔ 不要把 `AddSpecialEffectLocBJ` 算進去。**
   `AddSpecialEffectLocBJ` 沒有 facing、沒有 scale、生命週期是立即 `DestroyEffectBJ`
   ⇒ 它結構上不可能是光束的組成。

---

*本報告全部數字皆可用 `sed -n '<行號>p' tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j` 逐行覆核。*
