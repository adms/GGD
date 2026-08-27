# 三支技能 JASS 一比一還原底稿（第二批・技能特效編輯器大票）

> 產出：2026-08-28 03:12 · 任務：為「技能特效編輯器」挖出**第二批**三支技能的 JASS 逐字底稿＋翻譯對照表＋可存檔的 `vfx-script@1` 草案
> 章節結構逐字沿用第一批 `docs/_reports/vfx-editor-jass3_temp_20260828-0042.md`。
> 方法論（owner 2026-08-26 逐字）：「**翻譯 JASS to 編輯器JSON**，如果 **JSON 沒支援的標籤或邏輯則去實作**」
> —— 每個 JASS 動詞對到一個現有 GGD 標籤，翻不過去標 **MISSING**，⛔ 不近似。

## 0. 定位確認（含三個與任務原述的出入）

| 技能 | GGD 檔 | GGD name | w3x rawcode | JASS 觸發家族 |
|---|---|---|---|---|
| ① 龜派氣功 | `content/abilities/godie-ogrh.r.json` ＋ `godie-o00x.r.json`（**逐位元組相同，只差 id/icon**） | 09-04 龜派氣功 | **A03S**（base `AOsh` 震盪波） | `Trig_Turtle_Power_*`（war3map.j **31804–31953**；`jass-spells/A03S.j`） |
| ② 阿邦快速劍X | `content/abilities/godie-n01c.r.json` ＋ `godie-nbbc.r.json`（**內容有差**，見 1-1 註） | 08-04 阿邦快速劍X | **A0EZ**（base `AUcs` 腐屍蜂群／直線） | `Trig_ABanX_*`（war3map.j **28874–28940**；`jass-spells/A0EZ.j`） |
| ③ 天譴 | `content/abilities/godie-udea.r.json` | 65-04 天譴 | **A04C**（base `ANfd` 分岔閃電）＋ **A04H**（鏈鎖閃電·自動）＋ **A04I**（65-041 天譴退魔·奪魔） | `Trig_MoriyaBYEBYE_*`（war3map.j **46950–47021**；`jass-spells/A04C.j`） |

**出入①（龜派）**：任務原述「先驗名字」—— ✅ `godie-ogrh.r` 的 name 就是 `09-04 龜派氣功`。
⚠️ 但它有**兩張卡**：`godie-ogrh`（賽亞人 - 悟空，w3x hero `Ogrh`）與 `godie-o00x`（超級賽亞人 - 悟空，w3x hero `O00X`）。
兩份 `.r` JSON 逐位元組相同（`diff` 只有 `id` 與 `icon`），⛔ 但 **JASS 對這兩個 unit id 給的傷害不同**（見 1-4）。EX 版 `godie-*.ex` ＝ `09-002 十倍龜派氣功`（rawcode **A0O1**，base `Awar`，⛔ 它自己沒有觸發器 —— 它是一個**旗標**，被 A03S 的 `udg_EX_Mode` 分支讀）。

**出入②（阿邦）**：`grep -l "阿邦"` 命中 4 檔，逐一驗名如下 ——

| 檔 | id | name |
|---|---|---|
| `content/abilities/godie-n01c.r.json` | `godie-n01c.r` | **08-04 阿邦快速劍X** ⭐ 這一支 |
| `content/abilities/godie-nbbc.r.json` | `godie-nbbc.r` | **08-04 阿邦快速劍X** ⭐ 同一支的第二個形態 |
| `content/abilities/godie-n01c.w.json` | `godie-n01c.w` | 08-02 **萊丁**快速劍（⛔ 不是這一支，rawcode `A05T`） |
| `content/abilities/godie-nbbc.w.json` | `godie-nbbc.w` | 08-02 萊丁快速劍（同上） |

⇒ 兩位「英雄」是同一位（傳說的龍騎士 - 勇者小呆，w3x hero **N01C** 與 **Nbbc**，同模型 `SD2.mdl`、同 `hero_abilities:[A0CF,A05T,A05J,A0EZ,Aamk]`）。⛔ 它**不是** EX 版：EX 是 `08-002 龍魔人`（**A0T1**，變身）。

**出入③（天譴）**：✅ `godie-udea` ＝ **至尊學長 - 飛鼠先生**（war3map.j:8 的地圖作者欄逐字寫著 `Map Author: Moriya (adms) 飛鼠先生`，觸發器名 `MoriyaBYEBYE` 由此而來）。
⛔⛔ **但 GGD 的 `65-04 天譴` 帶了一個 JASS 裡不存在的 `dash`** —— 見 3-4 的 ⑨。

rawcode 對照來源：`tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` 的 `abilities[*].name`（編號是 join key）。
三支的 `provenance` 都是 `"w3x-import"`（字串，不含 rawcode）。
`bash scripts/genguard.sh` 三份都回「**正規化器 `castderive:build:raw` 會就地改欄位，但不是它的產物 ⇒ 不擋你**」，且 `grep -rl <basename> tools/` 沒有找到上游產生器來源（只有 census / w3a 傾印 / icon map 這類**讀取端**）⇒ ⭐ **三份都是手編檔**（改完要補跑 `pnpm castderive:build:raw`）。
`content/vfx-scripts/` **沒有**這三支的 script（目前只有 5 份：`godie-e002.ex` · `godie-e00l.ex` · `godie-h020.e` · `godie-hart.r` · `godie-hjai.e`）。

---

## ① 龜派氣功（A03S・悟空 R）

### 1-1 GGD 現況（`godie-ogrh.r.json`；`godie-o00x.r.json` 內容相同）

- `provenance:"w3x-import"` · slot **R** · `castType:"skillshot"` · maxRank 3 · cd 60（極大）· mana 144（小）· range 12（極大）· `castTimeSec` **1.233** · `vfxKey` `fx.prim.ki.beam-lg` · ⛔ 無 `sfxKey` · ⛔ 無 vfx-script
- effects（4 個）：
  1. `spawnProjectile projectileId:"imported.wave.ki"` → `onHit: damage magic {damageTier:小, ratios:[ap×0.5]}` ⭐ **傷害真相住這裡**
  2. `spawnModelFx preset:"tpl-beam-roll" modelKey:"w3x.stock.revivehuman"` ＋ `scaleAxis:[1,1,2.68]` ＋ `arriveSoundKey:"explosion"` ＋ `onArrive:[spawnVfx fx.prim.ki.explosion-lg @point]` ⇒ **＝ h007 特效龜派**
  3. `spawnModelFx preset:"tpl-beam-roll" modelKey:"w3x.stock.fragdriller" scale:3.65 clipTimeScale:0.15` ⇒ **＝ h008 特效三號**
  4. `spawnModelFx preset:"tpl-locust-line" modelKey:"w3x.stock.flamestrike1"`（家族預設 count 6 · spacing 2 · lifeSec 2 · path static · anchor 省略＝self）⇒ **＝ h006 龜派氣功火柱 ×6**
- 家族預設（`content/ability-templates/tpl-beam-roll.json`）：`path:"static"` · `lifeSec:2` · `scale:2.65` · `clip:"idle"` · `spinDegPerSec:720` · `soundKey:"wc3.crushingwavecaster1"` · `count:1`
  ⭐ 那份模板的 `params.scale.origin` 與 `params.count.origin` **逐字引用的就是這一支的行號**（`j:31925` `j:31937` `j:31939`）—— 也就是說 09-04 是這個家族的第二個 exemplar。

### 1-2 w3a 欄位（OBJECTS.json）

| | A03S |
|---|---|
| base | `AOsh`（震盪波·直線指向點） |
| cd | 60 / 60 / 60 |
| mana | 210 / 310 / 410 |
| cast_range | 900（→ 16.5 GGD-u；GGD 取 range 12 極大） |
| area | 400（→ 7.33 GGD-u） |
| data | 1:0 · 2:0 · 3:**1000** · 4:400 ⇒ **傷害全在觸發**（data1 震盪波傷害是 0） |
| targets_allowed | ground,structure,air,tree |
| ubertip(1) | 「造成一直線上敵方部隊 **450+力量\*2** 傷害。超級賽亞人狀態，可增加威力(**力量\*3**)」 |

輔助物件（`units`）：

| code | name | model | 編輯器 scale | 備註 |
|---|---|---|---|---|
| `h006` | 龜派氣功 | `Abilities\Spells\Human\FlameStrike\FlameStrike1.mdl` | （無） | hp 1 / hp_regen **−1** ⇒ **自己衰竭而死**，⛔ 觸發器不殺它 |
| `h007` | **特效龜派** | `Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl` | **1.25** | 同上自衰；`Aloc` |
| `h008` | **特效三號** | `Abilities\Weapons\FragDriller\FragDriller.mdl` | **2.0** | 生出來**當幀被 KillUnit** |

⚠️ `A0O1`（09-002 十倍龜派氣功）ubertip 逐字：「在**超級賽亞人三**的狀態下…使出龜派氣功將額外附加**力量\*10**點傷害」⇒ 它是 1-4 ③ 那個 `udg_EX_Mode` 分支的卡面。

### 1-3 JASS 逐字（`jass-spells/A03S.j`；war3map.j 31804–31953）

事件：`EVENT_PLAYER_UNIT_SPELL_EFFECT`；條件（31804）：`GetSpellAbilityId() == 'A03S'`。

```jass
// --- Trig_Turtle_Power_Func005002003 (31811) ---  鏡頭噪動的過濾器
function Trig_Turtle_Power_Func005002003 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_HERO) == true )
endfunction

// --- Trig_Turtle_Power_Func006A (31815) ---  逐個英雄的擁有者玩家上鏡頭噪動
function Trig_Turtle_Power_Func006A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 2 )) )
    call CameraSetTargetNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 3 )), 200.00 )
endfunction

// --- Trig_Turtle_Power_Func019Func001C (31820) ---  EX 旗標（false = 沒開 EX）
function Trig_Turtle_Power_Func019Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_SSJ))] == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func019C (31827) ---  施法者是不是「超級賽亞人」身體
function Trig_Turtle_Power_Func019C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O00X' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func020Func003002003 (31834/31838/31842) ---  傷害取樣的過濾器
//     ①非我方 ②**尚未被本次打過**（UNIT_TYPE_ANCIENT 當一次性旗標）
function Trig_Turtle_Power_Func020Func003002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction
function Trig_Turtle_Power_Func020Func003002003002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == false )
endfunction
function Trig_Turtle_Power_Func020Func003002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Turtle_Power_Func020Func003002003001(), Trig_Turtle_Power_Func020Func003002003002() )
endfunction

// --- Trig_Turtle_Power_Func020Func004A (31853) ---  逐人結算＋蓋上「已打過」旗標
function Trig_Turtle_Power_Func020Func004A takes nothing returns nothing
    if ( Trig_Turtle_Power_Func020Func004Func001C() ) then      // 不是建築
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), udg_LocReal, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), ( udg_LocReal * 0.20 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call UnitAddTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Turtle_Power_Func021Func003A (31888) ---  第二輪：把旗標拔掉
function Trig_Turtle_Power_Func021Func003A takes nothing returns nothing
    call UnitRemoveTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Turtle_Power_Func026A (31892) ---
function Trig_Turtle_Power_Func026A takes nothing returns nothing
    call CameraClearNoiseForPlayer( GetEnumPlayer() )
endfunction

// --- Trig_Turtle_Power_Actions (31896) ---  主函式
function Trig_Turtle_Power_Actions takes nothing returns nothing
    set udg_LocPoint1 = GetUnitLoc(GetSpellAbilityUnit())
    set udg_LocPoint2 = GetSpellTargetLoc()
    set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, 150.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
    set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(512, udg_LocPoint1, Condition(function Trig_Turtle_Power_Func005002003))
    call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func006A )
    call DestroyGroup( udg_TempUnitGroup )
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )          // 31903
    call TriggerExecute( gg_trg_Destroy_Effect )
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )   // 31905
    call TriggerExecute( gg_trg_Destroy_Effect )
    call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )   // 31907
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 同 ), ( 同 ) )                                     // 31908
    call CreateNUnitsAtLoc( 1, 'h008', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )   // 31909
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 同 ), ( 同 ) )                                     // 31910
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )                                                    // 31911
    call KillUnit( GetLastCreatedUnit() )                                                                          // 31912  ⭐ 殺的是 h008
    call RemoveLocation( udg_LocPoint3 )
    if ( Trig_Turtle_Power_Func019C() ) then                       // 施法者 == 'O00X'（超級賽亞人身體）
        if ( Trig_Turtle_Power_Func019Func001C() ) then            //   且 EX_Mode == false
            set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 5.00 ) ) + 150.00 )   // 31916
        else                                                       //   EX_Mode == true（十倍龜派氣功）
            set udg_LocReal = ( ( ( 300.00 * … ) + ( STR * 10.00 ) ) + 150.00 )                                     // 31918
        endif
    else                                                           // 一般賽亞人身體 'Ogrh'
        set udg_LocReal = ( ( ( 300.00 * … ) + ( STR * 2.00 ) ) + 150.00 )                                          // 31921
    endif
    set udg_TurtlePowerCounter = 1
    loop                                                                                                            // 31924
        exitwhen udg_TurtlePowerCounter > 6                                                                         // 31925
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_TurtlePowerCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )   // 31926
        call CreateNUnitsAtLoc( 1, 'h006', GetOwningPlayer(GetTriggerUnit()), udg_LocPoint3, bj_UNIT_FACING )        // 31927  ⭐ 火柱
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Turtle_Power_Func020Func003002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func020Func004A )
        call DestroyGroup( udg_TempUnitGroup )
        call EnumDestructablesInCircleBJ( 400.00, udg_LocPoint3, function Trig_Turtle_Power_Func020Func006A )        // 殺樹
        call RemoveLocation( udg_LocPoint3 )
        set udg_TurtlePowerCounter = udg_TurtlePowerCounter + 1
    endloop
    set udg_TurtlePowerCounter = 1
    loop                                                                                                            // 31936
        exitwhen udg_TurtlePowerCounter > 6                                                                         // 31937
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_TurtlePowerCounter) * 200.00 ), … )           // 31938
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Turtle_Power_Func021Func002002003))   // 31939
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func021Func003A )   // 拔掉 ANCIENT 旗標
        call DestroyGroup( udg_TempUnitGroup )
        call RemoveLocation( udg_LocPoint3 )
        set udg_TurtlePowerCounter = udg_TurtlePowerCounter + 1
    endloop
    call RemoveLocation( udg_LocPoint1 )
    call RemoveLocation( udg_LocPoint2 )
    call RemoveLocation( udg_LocPoint3 )
    call TriggerSleepAction( 2 )                                                                                    // 31948
    call ForForce( GetPlayersAll(), function Trig_Turtle_Power_Func026A )
endfunction
```

⭐ **主函式在 31948 之前一次 `TriggerSleepAction` 都沒有** ⇒ 光束＋鑽頭＋6 根火柱＋全部傷害**發生在同一幀**。

### 1-4 逐行標注（關鍵呼叫）

| # | JASS | 標注 |
|---|---|---|
| ① | `PolarProjectionBJ(caster, **150**, aim)` (31899) | **槍口點**＝施法者前方 150 wc3u ＝ **2.75 GGD-u**。三個東西都擺這裡：NEDeathSmall · NeutralBuildingExplosion · h007 · h008 |
| ② | `AddSpecialEffectLocBJ`×2 (31903 / 31905) | ⚠️ **`Loc` 版 ⇒ 掛在「地板點」，⛔ 不是施法者也不是受擊者**（本批三支**沒有任何一次** `AddSpecialEffectTargetUnitBJ` —— 那一格的施法者/受擊者陷阱在這批裡不適用） |
| ③ | `CreateNUnitsAtLoc( **1**, 'h007', …, aimAngle )` (31907) | **1 具**光束本體，朝向＝瞄準角。⛔ 不在迴圈裡 |
| ④ | `SetUnitScalePercent( u, 250+15·L, 同, 同 )` (31908) | ⭐ **等向**（三軸同值）。等級從 **1** 起算 ⇒ **265% / 280% / 295%**（⛔ 沒有任何一級是 250%）。⚠️⚠️ 全 war3map.j 只有 **2 個** `SetUnitScalePercent` 是非等向（j:31029 `500,100,100` · j:49915 `250,250,50`）—— ⛔ **龜派不在其中**。CLAUDE.md 第一守則裡寫的「龜派 `200,200,400`」**在這份 war3map.j 裡查不到**，讀 JASS 時請以本表為準 |
| ⑤ | `CreateNUnitsAtLoc( 1, 'h008' …)` ＋ `SetUnitScalePercent(350+15·L)` ＋ `SetUnitTimeScalePercent(**15**)` ＋ `KillUnit` (31909–31912) | **1 具**鑽頭，**365% / 380% / 395%**，動畫 **15% 慢速**，⭐ **當幀被殺** ⇒ 它播的是 **death 剪輯的慢動作**（`w3x.stock.fragdriller` 的 clipMap 六格全是 `Birth`，所以 GGD 這一支實際上播的是 Birth——差異見 1-6） |
| ⑥ | `udg_LocReal = 300·L + 150 + STR·k` (31916/31918/31921) | ⚠️ 等級從 1 起算 ⇒ 基礎 **450 / 750 / 1050**。`k` 三分支：**2**（`Ogrh` 賽亞人）· **5**（`O00X` 超級賽亞人，EX off）· **10**（`O00X` ＋ `udg_EX_Mode==true`，＝十倍龜派氣功）。⚠️ 旗標讀的是 `udg_SSJ` 的**擁有者**，⛔ 不是施法者本身（原作的小 bug，多人時可能讀到別人的 EX 旗標） |
| ⑦ | 6× `CreateNUnitsAtLoc(1,'h006', caster+200·i, bj_UNIT_FACING)` (31926–31927) | ⭐ **真的 6 具**（`tpl-locust-line` 的 exemplar）。位置 200/400/…/1200 wc3u ＝ **3.667 / 7.33 / 11.0 / 14.67 / 18.33 / 22.0 GGD-u**。⚠️ **朝向是 `bj_UNIT_FACING`（固定 270°）⛔ 不是瞄準角** —— 火柱是直立的，不跟著轉 |
| ⑧ | `GetUnitsInRangeOfLocMatching(**400**, node, filter)` ×6 | **傷害班表**（⛔ 不是視覺）。每格半徑 400 ＝ **7.33 GGD-u**，相鄰格間距只有 3.67 ⇒ **重疊 2 倍** |
| ⑨ | `UnitAddTypeBJ(UNIT_TYPE_ANCIENT, victim)` ＋ 第二輪 `UnitRemoveTypeBJ` (31878 / 31888) | ⭐ **一次性旗標**：6 個重疊的取樣格，同一個敵人**只吃一次傷害**。第二個 6 圈迴圈（31936–31944）**一具 unit 都不生**，它只是把旗標拔回來 |
| ⑩ | 建築 `× 0.20` (31876) | GGD 卡面沒寫這一條 |
| ⑪ | `CameraSetEQNoiseForPlayer(…, L×2)` ＋ `CameraSetTargetNoiseForPlayer(…, L×3, 200)`，**只給 512 內的英雄的擁有者** (31815/31817) | 範圍限定的鏡頭震動；`TriggerSleepAction(2)` 之後 (31948) 對**全部玩家** `CameraClearNoise` ⇒ 有效時長 **2.0s** |
| ⑫ | h006 / h007 的清場 | ⛔ **觸發器不殺它們**：`hp 1` ＋ `hp_regen −1` ⇒ 自己衰竭。h008 是唯一被 `KillUnit` 的 |

### 1-5 演出時間軸（施法結算點 t=0）

| t | 發生 |
|---|---|
| **0**（同一幀） | ①512 內每個英雄的玩家吃鏡頭噪動（EQ L×2、Target L×3@200）②槍口（前方 2.75u）：**NEDeathSmall** ＋ **NeutralBuildingExplosion** ③槍口：**h007 ReviveHuman** 光束本體，等向 265%，朝瞄準角 ④槍口：**h008 FragDriller** 鑽頭，等向 365%，動畫 15%，**當幀被殺**（慢動作死亡）⑤沿瞄準線 3.67/7.33/11.0/14.67/18.33/22.0u 各生一根 **h006 FlameStrike1 火柱**（朝向固定 270°），每根同時對半徑 7.33u 內未被打過的敵人結算一次 `300L+150+STR·k`（建築 ×0.2）並蓋旗標 ⑥第二輪把旗標拔掉 |
| **+2.0** | 全玩家 `CameraClearNoise` |
| **自衰** | h006 ×6 與 h007 靠 `hp_regen −1` 消失（實測 hp 1 ⇒ 約 1 秒內） |

### 1-6 翻譯對照表（JASS → GGD）

| JASS 動詞 | GGD 標籤 | 狀態 |
|---|---|---|
| `CreateNUnitsAtLoc(1,'h007')` ＋ 等向 265% | `spawnModelFx preset:"tpl-beam-roll" modelKey:"w3x.stock.revivehuman"`（家族 `scale:2.65`） | ✅ 已出貨（`scale` 那一格的 origin 逐字引用 20-03，值與 09-04 相同） |
| ⚠️ 但 GGD 加了 `scaleAxis:[1,1,2.68]` | — | ⚠️ **原作是等向的**（1-4 ④）。這是模板文件自述的「兩個誠實的偏離」之一（把 glb 沿行進軸拉長成光束比例），⛔ 不是量到的 JASS。⭐ 一鍵 rollback＝拿掉 `scaleAxis` |
| `CreateNUnitsAtLoc(1,'h008')` ＋ 365% ＋ timescale 15% | `spawnModelFx … modelKey:"w3x.stock.fragdriller" scale:3.65 clipTimeScale:0.15` | ✅ **逐格吻合**（365%→3.65、15%→0.15） |
| ⚠️ `KillUnit` ⇒ 播 **death** 剪輯 | 節點沒寫 `clip` ⇒ 吃家族預設 `idle` | ⚠️ `w3x.stock.fragdriller` 的 clipMap **六格全是 `Birth`** ⇒ 今天寫 `clip:"death"` 也會播 Birth ⇒ **資料層無差別**，⛔ 不是機制缺口 |
| 6× `CreateNUnitsAtLoc(1,'h006', 200·i)` | `spawnModelFx preset:"tpl-locust-line" modelKey:"w3x.stock.flamestrike1"`（家族 count 6） | ✅ 已出貨（count 6 ✅） |
| ⚠️ 間距 200 wc3u ＝ **3.667** | 家族 `spacing` 預設 **2** | ⚠️ **資料偏離**（模板 `spacing.origin` 自己就寫著「200 wc3u ＝ 3.67，⛔ 不是 2」）⇒ 這一支值得**逐支覆寫 `spacing:3.67`**，⛔ 或改家族預設（會動到別支） |
| 三個東西都在**槍口 +150u** | `spawnModelFx` 的 `anchor` 只有 self/point/target | ⛔ **MISSING N1**：`spawnModelFx` 沒有 `offsetForwardU`。⭐ **`vfx-script@1` 的 `modelFx` 段有這一格** ⇒ 只有 script 側寫得出來 |
| `AddSpecialEffectLocBJ` NEDeathSmall @槍口 | `modelFx w3x.stock.nedeathsmall path:"static" anchor:"self" offsetForwardU:2.75` | ✅ 資產在庫（`content/models/w3x.stock.nedeathsmall.json`），**今天寫得出來**（script 側） |
| `AddSpecialEffectLocBJ` NeutralBuildingExplosion @槍口 | `modelFx w3x.stock.neutralbuildingexplosion …` | ✅ 同上 |
| 6 格 `GetUnitsInRangeOfLocMatching(400)` ＋ ANCIENT 一次性旗標 | GGD 用 `spawnProjectile`（單體 onHit） | ⚠️ **層1 重設計**：原作是「一條 22u 長、7.33u 半徑、每人只吃一次」的線；GGD 是一發穿透投射物。要 1:1 就換成 `damageLine`／`spawnModelFx.onTouch`（`touchRadius` 已有 once-per-target 語意） |
| 建築 ×0.20 | — | ⚠️ 未表達（全域規則裡沒有 0.2 這一檔） |
| `CameraSetEQNoise` **只給 512 內的英雄玩家** | `screenShake`（`applyTo:"all"`） | ⛔ **MISSING N3**：screenShake 沒有「以施法點為圓心 R 內的玩家」這個範圍限定（與第一批的同一格缺口相同） |
| `EnumDestructablesInCircleBJ` 殺樹 | — | N/A（GGD 場上無 destructable） |
| ⛔ 無 `CreateTextTag` · 無 `PlaySound` · 無 `SetUnitAnimation` | — | ⭐ **這一支原作沒有喊招字、沒有音效、不改施法者動畫** ⇒ script 裡**不要**加，那會是憑空的 |

---

## ② 阿邦快速劍X（A0EZ・勇者小呆 R）

### 2-1 GGD 現況（`godie-n01c.r.json`）

- `provenance:"w3x-import"` · slot **R** · `castType:"targeted"`（`targetsEnemies:true`）· maxRank 3 · cd 60（極大）· mana 288（中）· range 12（極大）· `castTimeSec` **0.667** · `vfxKey` `fx.prim.physical.slash-lg` · ⛔ 無 sfxKey · ⛔ 無 vfx-script
- effects（2 個）：
  1. `spawnModelFx preset:"tpl-locust-travel" modelKey:"imported.crescent" clip:"idle" scale:2.0 distance:12.0`（家族：path forward · speed 30 · spin 720）
  2. `blink to:"targetUnit" applyTo:"self" stopShortUnits:1.8` → `onArrive:[ spawnVfx fx.prim.physical.slash @point ; damage physical {damageTier:小, ratios:[ap×1.8]} ]`

⚠️ **`godie-nbbc.r.json` 與它不同**（`diff` 有實質差異）：nbbc 把 `damage` 從 `blink.onArrive` 搬到 `template:{ref:"tpl-single-strike"}` 的 params，`vfxKey` 是 `fx.prim.nature.slash-lg`，`castTimeSec` 是 **1.233**（n01c 是 0.667）。⇒ ⭐ **同一支技能的兩個形態今天演出時序差一倍**，⛔ 而 JASS 只有一份。

### 2-2 w3a 欄位（OBJECTS.json）

| | A0EZ |
|---|---|
| base | `AUcs`（腐屍蜂群·直線穿透） |
| cd | 60 / 60 / 60 |
| mana | 250 / 315 / 380 |
| cast_range | 600（→ 11.0 GGD-u） |
| area | 200（→ 3.67 GGD-u，＝線寬） |
| buffs | B001 |
| data | 1:**450/650/850**（線傷）· 2:800/1400/2600（總傷上限）· 3:**550**（線長）· 4:200（線寬） |
| targets_allowed | air,enemies,ground,neutral |
| ubertip(1) | 「造成一直線敵人 **450** 點傷害，**距離550** 交叉在 X 中給予 (**技能等級\*敏捷\*7**) 的額外傷害」 |

輔助物件：

| code | name | model | 編輯器 scale | 備註 |
|---|---|---|---|---|
| `e003` | **特效** | `Abilities\Weapons\RedDragonBreath\RedDragonMissile.mdl` | **4.0** | `Aloc`＋`Avul`；⭐ **與 08-03 龍鬥氣砲咒文共用同一隻**（`Trig_DraBom` j:28838 用它排 10 具） |
| `A09O` / `A09P` | （無名） | `Asph` 球體，editor_suffix `(Mirror)` / `(Mirror_Red)` | — | 施法瞬間加上、結束移除 |

### 2-3 JASS 逐字（`jass-spells/A0EZ.j`；war3map.j 28874–28940）

事件：`EVENT_PLAYER_UNIT_SPELL_EFFECT`；條件（28874）：`GetSpellAbilityId() == 'A0EZ'`。

```jass
// --- Trig_ABanX_Second_Raid (28878) ---  落點 AoE 的逐人結算
function Trig_ABanX_Second_Raid takes nothing returns nothing
    if ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetTriggerPlayer()) == true ) then
       if ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) then

         call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( I2R(GetUnitAbilityLevelSwapped('A0EZ', GetTriggerUnit())) * ( 7.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_UNIVERSAL )

         call AddSpecialEffectLocBJ( GetRectCenter(RectFromCenterSizeBJ(GetUnitLoc(GetEnumUnit()), 100.00, 100.00)), "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
         call RemoveEffectSP( GetLastCreatedEffectBJ() , 1.00 )
       endif
    endif
endfunction

// --- Trig_ABanX_Actions (28890) ---
function Trig_ABanX_Actions takes nothing returns nothing
    // 設定數據
    local location land_point
    local location casting_unit_loc
    local unit special_effect_unit

    set udg_P0 = GetSpellTargetLoc()                                                                     // 28896
    set casting_unit_loc = GetUnitLoc(GetTriggerUnit())                                                  // 28897
    set land_point = PolarProjectionBJ(casting_unit_loc , 550.00 , AngleBetweenPoints(casting_unit_loc, udg_P0) )   // 28898
    call RemoveLocation( udg_P0 )
    // 設定結束

    call UnitAddAbilityBJ( 'A09O', GetTriggerUnit() )                                                    // 28902
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )                                                    // 28903

    call ShowUnitHide( GetTriggerUnit() )                                                                // 28905  ⭐ 本體消失
    call CreateNUnitsAtLoc( 1, 'e003', GetOwningPlayer(GetTriggerUnit()), casting_unit_loc, GetUnitFacing(GetTriggerUnit()) )   // 28906

    set special_effect_unit = GetLastCreatedUnit()

    call TriggerSleepAction( 1.00 )                                                                      // 28909  ⭐ 唯一的等待

    call KillUnit( special_effect_unit )                                                                 // 28911
    call RemoveUnit( special_effect_unit )                                                               // 28912

    call AddSpecialEffectLocBJ( casting_unit_loc, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )   // 28914  ⭐ 在**原點**
    call SetUnitPositionLoc( GetTriggerUnit(), land_point )                                              // 28915  ⭐ 瞬移固定 550u
    call ShowUnitShow( GetTriggerUnit() )                                                                // 28916

    call ForGroupBJ( GetUnitsInRangeOfLocAll( 250.00, land_point ), function Trig_ABanX_Second_Raid )     // 28918

    //漂浮文字  ⛔ 整段被作者註解掉（28921–28925）—— ⛔ 不要翻譯它
    //call CreateTextTagUnitBJ( "TRIGSTR_042", … )

    call SelectUnitForPlayerSingle( GetTriggerUnit(), GetOwningPlayer(GetTriggerUnit()) )                 // 28928
    call RemoveLocation( casting_unit_loc )
    call RemoveLocation( land_point )
    call UnitRemoveAbilityBJ( 'A09O', GetTriggerUnit() )                                                 // 28932
    call UnitRemoveAbilityBJ( 'A09P', GetTriggerUnit() )                                                 // 28933
    set land_point = null
    set casting_unit_loc = null
    set special_effect_unit = null
endfunction

// --- RemoveEffectSP (helper, 4814) ---  定時銷毀特效（借 bj_enumDestructableRadius 當秒數）
function RemoveEffectSP takes effect R_Effect , real Life_Time returns nothing
    local real Bj_Timer = bj_enumDestructableRadius
    set bj_lastCreatedEffect = R_Effect
    set bj_enumDestructableRadius = Life_Time
    call ExecuteFunc("RemoveEffectSP_Action")
    set bj_enumDestructableRadius = Bj_Timer
endfunction
```

### 2-4 逐行標注

| # | JASS | 標注 |
|---|---|---|
| ① | `PolarProjectionBJ(caster, **550**, 施法點方向)` (28898) | ⭐ **固定距離**位移 ＝ **10.083 GGD-u**，⛔ 不是「移到目標身邊」。GGD 用 `blink to:"targetUnit" stopShortUnits:1.8` ＝ 貼到目標前 1.8u ⇒ **層1 重設計** |
| ② | `UnitAddAbilityBJ('A09O'/'A09P')` (28902–28903) | `Asph`（球體）：把一個模型掛在單位身上。⚠️ 加上去的**下一行**就把單位藏起來（28905），移除又在最後（28932）⇒ 實際只在**最後一幀**看得到 —— 原作的遺留 |
| ③ | `ShowUnitHide(caster)` (28905) | ⭐ **這一招的核心演出**：小呆本人消失 1 秒，畫面上只有那道劍氣 |
| ④ | `CreateNUnitsAtLoc(1,'e003', **原點**, 施法者面向)` (28906) | **1 具** RedDragonMissile（w3u `usca` **4.0**），擺在**出發點**、朝施法者面向。⛔ 不位移、⛔ 不縮放（觸發器沒有 `SetUnitScalePercent`）⇒ 有效大小就是編輯器的 4.0 |
| ⑤ | `TriggerSleepAction( **1.00** )` (28909) | 整支唯一的等待。⇒ 「劍氣停在原地 1 秒 → 人出現在 550u 外」 |
| ⑥ | `AddSpecialEffectLocBJ(**casting_unit_loc**, ImpaleTargetDust)` (28914) | ⚠️ 掛在**出發點的地板**（⛔ 不是落點、⛔ 不是任何單位）—— 「他剛剛在這裡」的塵土 |
| ⑦ | `GetUnitsInRangeOfLocAll( **250**, land_point )` (28918) | 落點 AoE **半徑 250 ＝ 4.583 GGD-u**。GGD 今天是**單體**（`blink.onArrive` 的 `damage` 沒有 shape/radius） |
| ⑧ | 傷害 `L × 7 × AGI`，`ATTACK_TYPE_NORMAL` / **`DAMAGE_TYPE_UNIVERSAL`** (28882) | ⚠️ **UNIVERSAL ＝ 無視護甲與魔抗**。GGD 寫的是 `damageType:"physical"` ⇒ 對應的應該是 **`"true"`**。⚠️ 等級從 1 起算 ⇒ **7×AGI / 14×AGI / 21×AGI**（GGD 卡面「技能等級\*180% [AP]」是層1 重表達） |
| ⑨ | 每個受害者一份 `ThunderClapCaster`（活 1.0s） (28884–28885) | ⚠️ 掛點是 `RectFromCenterSizeBJ(受害者位置, 100, 100)` 的**中心** ＝ 受害者腳下的地板點（⛔ 不是掛在單位骨頭上） |
| ⑩ | 基礎技能 `AUcs`（28874 之外） | ⭐ **一直線 450/650/850 的傷害不在觸發器裡** —— 它是基礎技能自己做的（長 550、寬 200）。⇒ 「X」的兩劃：**基礎技能的線** ＋ **落點的圓**，⛔ 不是兩條交叉的線 |
| ⑪ | 28921–28925 的喊招文字 | ⛔ **整段被註解掉** —— ⛔ 不要翻譯它（否則就是憑空加一個原作沒有的字） |

### 2-5 演出時間軸（施法結算點 t=0）

| t | 發生 |
|---|---|
| **0** | 基礎技能 `AUcs` 的直線傷害（450/650/850，長 10.08u、寬 3.67u）；掛上 A09O/A09P 球體；**小呆本體消失**；出發點生出 **e003 RedDragonMissile（scale 4.0，朝施法者面向）** |
| **0 → 1.0** | 只有那具劍氣站在原地（⛔ 沒有任何位移、沒有動畫指令） |
| **+1.0** | 殺掉 e003；出發點地板 **ImpaleTargetDust**；本體**瞬移到 550u（10.08u）外**並現身；落點半徑 250（4.58u）內每個敵方非建築吃 `L×7×AGI` **真傷**，各自腳下一份 **ThunderClapCaster**（活 1.0s）；重新選取自己的單位 |
| **收尾** | 移除 A09O/A09P |

### 2-6 翻譯對照表

| JASS | GGD | 狀態 |
|---|---|---|
| 基礎 `AUcs` 直線 450/650/850（長 550 寬 200） | `damageLine`（未接） | ⚠️ **未表達**：GGD 只有落點那一段。要 1:1 就補 `damageLine length:10.08 width:3.67` |
| `ShowUnitHide(caster)` 1 秒 | — | ⛔ **MISSING N6**：沒有任何標籤能把**英雄本體模型**暫時藏起來（`applyStatus` 沒有 `hideModel`）。⭐ 這一格是這一招的**招牌** —— 缺了它，畫面上就是「人站著、旁邊有一團龍息」 |
| `CreateNUnitsAtLoc(1,'e003', 原點, 面向)` scale 4.0 | `modelFx w3x.stock.reddragonmissile path:"static" anchor:"self" scale:4.0 clip:"idle" lifeSec:1.0` | ✅ 資產在庫（`content/models/w3x.stock.reddragonmissile.json`，clipMap idle→`Birth`），**今天寫得出來** |
| ⚠️ GGD 現行用的是 `imported.crescent`（推進式） | `spawnModelFx preset:"tpl-locust-travel" … distance:12` | ⚠️ **層1 演出替換**：原作是**定點**一具龍息彈；GGD 是一道飛出去的月牙。⛔ 不是缺口，但**與 JASS 不同**要記錄 |
| `TriggerSleepAction(1.00)` | `castTimeSec`（n01c 0.667 / nbbc 1.233）＋ script 的 `atMs` | ⚠️ 兩個形態不一致（2-1 註）。script 側可用 `atMs:1000` 精準對上 |
| `AddSpecialEffectLocBJ(原點, ImpaleTargetDust)` | — | ⚠️ **資產缺口**：`impaletargetdust` 不在 `content/models/_index.json` 也不在 `content/vfx/_index.json`。近似：`fx.fam.ground-dust.nature.s80`（存在） |
| `SetUnitPositionLoc(caster, 前方 550)` | `blink to:"point"`（09-02 瞬間移動已在用） | ✅ **機制在**，是**接法**不同（今天接的是 `to:"targetUnit"`） |
| 落點 AoE 半徑 250 | `damage` 加 `shape:"circle" radius:4.58 side:"enemies"` | ✅ **機制在**（`EFFECT_COMMON_SHAPE`），沒接 |
| `DAMAGE_TYPE_UNIVERSAL` | `damageType:"true"` | ✅ **機制在**，選成了 `"physical"` |
| 每個受害者腳下一份 ThunderClapCaster | `spawnVfx fx.w3x.stock.thunderclapcaster.p00 at:"target"`（單一）／sim 側 `shape:"circle"` 扇出 | ⚠️ script 側只到得了**一個** target；扇出要走 ability 的 `onHitTargets` |
| `A09O`/`A09P`（Asph 球體 Mirror / Mirror_Red） | — | ⚠️ **資產缺口**（無對應 vfx key）；而且原作實際只閃一幀 ⇒ 建議**不翻譯** |
| 28921–28925 註解掉的喊招 | — | ⛔ **不要翻譯** |

---

## ③ 天譴（A04C ＋ A04H ＋ A04I・飛鼠先生 R）

### 3-1 GGD 現況（`godie-udea.r.json`）

- `provenance:"w3x-import"` · slot **R** · `castType:"dash"` · maxRank 3 · cd **30**（極小）· mana 288（中）· range 8（大）· `castTimeSec` **0.067** · `vfxKey` **`fx.prim.holy.nova-lg`** · ⛔ 無 sfxKey · ⛔ 無 vfx-script
- effects（3 個）：
  1. `dash mode:"forward" speed:16 maxDistance:8.25`
  2. `chainLightning shape:"circle" centre:"caster" radius:8.0 maxSources:20 jumps:16 jumpRange:24.0 decay:0.9 jumpIntervalSec:0.05 amount:{damageTier:極小}` → `onHitTargets:[ spendMana applyTo:"target" amount:{perRank:[250,350,450]} ]`
  3. `damageArea magic {damageTier:大} radius:8.0 maxTargets:1`

### 3-2 w3a 欄位（OBJECTS.json）

| | A04C（本體） | A04H（鏈鎖閃電·自動） | A04I（65-041 天譴退魔） |
|---|---|---|---|
| base | `ANfd` 分岔閃電 | `AOcl` 鏈鎖閃電 | `AEmb` 奪取魔法 |
| levels | **5** | 3(+4) | **9** |
| cd | 90 / 60 / 30 / 30 / 30 | 0 | 0 |
| mana | 250 / 350 / 450 / 550 / 650 | 0 | 0 |
| cast_range | 450（→ **8.25 GGD-u**） | — | 500（→ 9.17） |
| area | — | **1800**（→ **33.0 GGD-u**） | — |
| data | 欄位3 ＝ **501 / 1000 / 1500 / 2000 / 2500** | 欄1 傷害 **150/200/250/280**；欄2 跳數 **16**；欄3 每跳衰減 **0.0** | 欄1 **250/350/450/550/650/750/850/950/99999** |
| ubertip(1) | 「對周圍 **500** 範圍內的所有敵人放出閃雷造成 **250點法力損失** 和 **150點傷害** 並**傳遞16次**，聚集越多敵人則威力越強，另外給予**指定目標額外500點傷害**」 | — | — |

輔助物件：

| code | name | model | 編輯器 scale | 備註 |
|---|---|---|---|---|
| `ogru` | **天譴** | `" .mdl"` ⭐ **空字串模型 ⇒ 完全隱形** | 2.3 | `Aloc`；timed life 10s |
| `U00K` | 邪惡意念集合體 | `EredarWarlock.mdl` | — | ⭐ 特判：對它 A04I 用等級 9（**99999 ＝ 抽乾**） |

### 3-3 JASS 逐字（`jass-spells/A04C.j`；war3map.j 46950–47021）

事件：`EVENT_PLAYER_UNIT_SPELL_EFFECT`（觸發器出生時 `DisableTrigger`，由 `Trig_Open_Skill_of_Moriya_Actions` @46748 在飛鼠先生進場時 `EnableTrigger`）。

```jass
// --- Trig_MoriyaBYEBYE_Func004Func002C (46950) ---  ⭐ 第二個入口：某道具技 1/5 機率
function Trig_MoriyaBYEBYE_Func004Func002C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AIds' ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 5) == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func004C (46960) / _Conditions (46970) ---
function Trig_MoriyaBYEBYE_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A04C' ) ) then
        return true
    endif
    if ( Trig_MoriyaBYEBYE_Func004Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_MoriyaBYEBYE_Func005Func010C (46977) ---
function Trig_MoriyaBYEBYE_Func005Func010C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'U00K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func005A (46984) ---  ⭐ 逐個敵人生一具隱形施法者
function Trig_MoriyaBYEBYE_Func005A takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())                                                            // 46985
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )        // 46986 ⭐ 生在**施法者腳下**
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )                                     // 46987
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )                                                // 46988
    call UnitAddAbilityBJ( 'A04I', GetLastCreatedUnit() )                                                // 46989
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )   // 46990
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())                                                        // 46991 （寫了沒用到 —— 記憶體洩漏）
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )                          // 46992
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )                     // 46993 ⭐ 每個敵人一條鏈
    if ( Trig_MoriyaBYEBYE_Func005Func010C() ) then
        call SetUnitAbilityLevelSwapped( 'A04I', GetLastCreatedUnit(), 9 )                               // 46995 ⭐ 99999 = 抽乾
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "manaburn", GetEnumUnit() )                       // 46996
    else
        call SetUnitAbilityLevelSwapped( 'A04I', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )   // 46998
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "manaburn", GetEnumUnit() )                       // 46999
    endif
endfunction

// --- Trig_MoriyaBYEBYE_Func007A (47003) ---
function Trig_MoriyaBYEBYE_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MoriyaBYEBYE_Actions (47008) ---
function Trig_MoriyaBYEBYE_Actions takes nothing returns nothing
    call TerrainDeformationWaveBJ( 2.00, GetUnitLoc(GetSpellTargetUnit()), GetRectCenter(gg_rct_moriyasp), 500.00, 120.00, 0.50 )   // 47009
    set udg_MoriyaUnit = GetTriggerUnit()
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, GetUnitLoc(GetTriggerUnit())), function Trig_MoriyaBYEBYE_Func005A )   // 47012
    call TriggerSleepAction( 10.00 )                                                                     // 47013
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoriyaUnit), 'ogru'), function Trig_MoriyaBYEBYE_Func007A )   // 47014
endfunction
```

⭐ **對照：真正的「向前衝鋒」住在 65-02（A05S）身上**，⛔ 不是天譴 —— `Trig_Run` / `Trig_Run_Effect`（war3map.j 46786–46905）：

```jass
function Trig_Run_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05S' ) ) then      // ← 65-02 寒冰破碎
        return false
    endif
    return true
endfunction
// Trig_Run_Effect：TriggerRegisterTimerEventPeriodic 0.04s
//   每 tick 把施法者沿面向推 20 wc3u（＝500 wc3u/s ＝ 9.17 GGD-u/s），最多 10 tick（200 wc3u ＝ 3.67 GGD-u）
//   每 tick 在**原位**生一具 'o00P'（FrostNovaTarget.mdl，usca 1.8，timed life 1s，帶 ACfn）
//   每 tick 把 300 內每個非建築非中立敵對單位**往外推 80 wc3u** ＋ 播 "Death" 動畫
//   1/5 機率下 "frostnova" 指令（＝卡面的「附帶隨機冰爆250傷害」）
```

### 3-4 逐行標注

| # | JASS | 標注 |
|---|---|---|
| ① | `GetUnitsInRangeOfLocAll( **500**, **施法者**位置 )` (47012) | ⭐ **半徑 500 ＝ 9.167 GGD-u**，圓心是**施法者**。⚠️ `…All` ⇒ **不過濾陣營**（友方也會進迴圈，只是 chainlightning/manaburn 對友方下不了指令而失敗）。⛔ **沒有數量上限** —— GGD 的 `maxSources:20` 是 GGD 加的 |
| ② | `CreateNUnitsAtLoc(1,'ogru', **施法者腳下**)` (46986) | ⭐⭐ **每一個敵人一具**，而且**全部生在施法者腳下** ⇒ **所有的電弧都從施法者腳下發出**。⚠️ `ogru` 的模型欄是 `" .mdl"` ＝ **空模型** ⇒ ⭐ **這一支原作沒有任何自己的模型特效**，畫面上全部是 WC3 內建技能美術 |
| ③ | `A04H` 鏈鎖閃電（w3a） | 傷害 **150/200/250/280**、跳 **16**、**每跳衰減 0.0**（⇒ 每一跳都是滿傷）、area **1800 ＝ 33.0 GGD-u**。⚠️ GGD 用 `decay:0.9` ＋ `jumpRange:24.0` ⇒ **兩格都與量到的不同** |
| ④ | `A04I` 奪取魔法（w3a） | **250/350/450/550/650**（等級＝技能等級，從 1 起算）⇒ ⭐ GGD 的 `spendMana perRank:[250,350,450]` **逐格吻合前三級** |
| ⑤ | `U00K` 特判 → A04I 等級 **9 ＝ 99999** (46995) | ⭐ 對「邪惡意念集合體」直接抽乾魔力 |
| ⑥ | `A04C` 基礎 `ANfd` data 欄位3 ＝ **501/1000/1500/2000/2500** | ＝ ubertip 的「指定目標**額外 500 點**傷害」（L1 501）。⇒ GGD 的 `damageArea maxTargets:1 {damageTier:大}` 對應這一格 |
| ⑦ | `TerrainDeformationWaveBJ(2.00, 目標位置 → gg_rct_moriyasp 中心, 500, 120, 0.50)` (47009) | 地形波：從目標位置往一個**矩形**中心推。⚠️ 那個矩形 `gg_rct_moriyasp` 會被 **65-03 魔法膨脹**（`Trig_MagicUp` j:46941 `MoveRectToLoc`）搬到施法者身上 ⇒ **波的方向取決於上一次施放 65-03 的位置**（原作的 quirk） |
| ⑧ | `TriggerSleepAction(10.00)` ＋ `UnitApplyTimedLife(10.00)` | 隱形施法者活 10 秒（讓 16 跳的鏈跑完），之後統一清場 |
| ⑨ | ⛔ **整支觸發器沒有任何位移** | ⭐⭐ **GGD 的 `dash mode:"forward" speed:16 maxDistance:8.25` 在 JASS 裡不存在。** 而 **8.25 ＝ A04C 的 `cast_range` 450 ÷ 54.545** ⇒ 那個數字是把**施法距離**讀成了**衝刺距離**。真正的衝刺是 **65-02（A05S）** 的 `Trig_Run_Effect`（0.04s × 20 wc3u × ≤10 tick），而 GGD 的 `godie-udea.w`（65-02）今天是 `tpl-single-strike`，**一格 dash 都沒有** ⇒ ⭐ **兩支技能的 dash 掛反了**。GGD 卡面「怒氣凝聚為閃電，**向前衝鋒**」也跟著寫進去了（w3x ubertip 是「怒氣凝聚為閃電**殺暴附近的敵人**」，⛔ 沒有衝鋒） |
| ⑩ | 第二個入口：`AIds` 1/5 機率 (46950–46958) | 某道具技有 20% 機率白嫖一次天譴（`AIds` cd 60 / mana 300）。⛔ GGD 未表達（⚠️ 且 `GetRandomInt` 在 `sim/**` 是禁令，要走 seeded RNG） |

### 3-5 演出時間軸（施法結算點 t=0）

| t | 發生 |
|---|---|
| **0** | ①地形波 2 秒（目標 → moriyasp 矩形中心，半徑 500、深 120、0.5s 週期）②以施法者為圓心 **9.17u** 內**每一個**單位各生一具**隱形** `ogru` 於**施法者腳下**（活 10s）③每一具立刻朝它的目標下 `chainlightning`（150/200/250 傷、**16 跳**、⛔ 不衰減、跳距 33u）與 `manaburn`（250/350/450；對 U00K 抽乾）④基礎 `ANfd` 對指定目標另加 501/1000/1500 |
| **0 → ≈0.8** | WC3 內建鏈鎖閃電的跳躍演出（引擎自帶，⛔ 觸發器沒有畫任何東西） |
| **+10.0** | 清掉全部 `ogru` |

### 3-6 翻譯對照表

| JASS | GGD | 狀態 |
|---|---|---|
| 「半徑 500 內每個敵人各一條 16 跳鏈」 | `chainLightning shape:"circle" centre:"caster" radius:8.0 maxSources:20 jumps:16` | ✅ **機制吻合**（radius 8.0 vs 量到 9.17；maxSources 20 是 GGD 加的護欄） |
| 每跳衰減 **0.0**（w3a data 欄3） | `decay:0.9` | ⚠️ **資料偏離**（GGD 卡面「每跳一次傷害只剩前一次的九成」是 GGD 自己的設計，w3x 是不衰減） |
| 跳距 area **1800 ＝ 33.0** | `jumpRange:24.0` | ⚠️ 資料偏離 |
| 奪魔 250/350/450 | `onHitTargets:[spendMana perRank:[250,350,450]]` | ✅ **逐格吻合** |
| 對 `U00K` 抽乾（99999） | — | ⛔ **MISSING N11**：`spendMana` 沒有「全部」語意（只有固定數字／perRank） |
| 指定目標額外 501/1000/1500 | `damageArea maxTargets:1 {damageTier:大}` | ✅ 已出貨（GGD 用「最近一名」代替「指定目標」） |
| `ogru` **空模型**、生在施法者腳下 | — | ⭐ **正確的翻譯是「什麼都不要畫」** —— 但它告訴我們**每一條電弧的起點都是施法者腳下** ⇒ script 用一發 `fx.prim.lightning.nova-lg @self` 表達這件事是**有出處**的 |
| WC3 內建鏈鎖閃電的弧線 | 客戶端 `vfxArc` | ⚠️ **待查證**：CLAUDE.md 記過「`vfxArc` 零 emitter ⇒ 28 支雷電技能裡 26 支走不到電弧」。⛔ 我沒有跑測試，⛔ 不宣稱它今天的狀態 —— 但這一支的整個畫面都靠它 |
| 每個受害者的奪魔視覺 | `chainLightning.onHitTargets` 可以再塞一個 `spawnVfx` | ✅ **機制在**，沒接（今天 `onHitTargets` 只有 `spendMana`） |
| `TerrainDeformationWaveBJ(2.00, …)` | `screenShake amplitude durationSec:2.0` | ⛔ **M5**（沿用第一批的編號；建議豁免 —— 體素地板無變形機制） |
| `dash`（GGD 有、JASS 沒有） | — | ⛔ **N13 內容缺陷**：dash 屬於 65-02（A05S）。⚠️ 這不是機制缺口，是**接錯技能** |
| `AIds` 1/5 機率白嫖 | — | ⚠️ 未表達（且需 seeded RNG） |
| `vfxKey:"fx.prim.holy.nova-lg"` | — | ⚠️ **一支純雷電技能掛了聖光 nova**。`fx.prim.lightning.nova-lg` 在庫 ⇒ 一格字串的修正 |

---

## ④ MISSING 機制總表（本批新增；M 編號沿用第一批 `vfx-editor-jass3_temp_20260828-0042.md` §④）

| # | 缺的機制 | 一句話 | 誰要 | 建議形狀 |
|---|---|---|---|---|
| **N1** | **`spawnModelFx` 的前後位移** | 原作把模型擺在「施法者前方 d」（`PolarProjectionBJ`），而 `spawnModelFx` 的 `anchor` 只有 self/point/target | ①（150u＝2.75）· 全 beam-roll 家族 | ⭐ **`vfx-script@1` 的 `modelFx` 段已經有 `offsetForwardU`** ⇒ 短期走 script；長期把這一格加進 `spawnModelFx`（與 script 共用同一格） |
| **N3** | **範圍限定的鏡頭震動** | `CameraSetEQNoiseForPlayer` 只對「以施法點為圓心 R 內的英雄的擁有者」生效 | ①（512＝9.39u） | `screenShake` 加 `radius`（`EFFECT_COMMON_SHAPE` 已有 `shape:"circle"+radius`，只是 `applyTo:"all"` 時沒有讀） |
| **N6** | ⭐ **隱藏英雄本體模型（時限）** | `ShowUnitHide` 1 秒：人消失、只剩劍氣 —— 這是 08-04 的招牌 | ②（1.0s） | `status-effect@1` 加 `hideModel:boolean`（渲染側；與 M2 的 tint/alpha 同一格家族） |
| **N11** | **「抽乾」語意的奪魔** | `SetUnitAbilityLevel(A04I, 9)` ⇒ 99999 ＝ 全部魔力 | ③（對 U00K） | `spendMana.amount` 收 `{resourcePct:1.0}`（`damageLine` 已有 `resourcePct` 的先例） |
| **M5** | 地形波紋／地形波 | `TerrainDeformationRipple` / `…Wave` | ①②③ | ⛔ **建議豁免**（`screenShake` 近似；體素地板無變形機制） |

**⛔ 不是機制缺口（是資料或接法，今天就改得動）：**

| 項 | 誰 | 現況 → 應該 |
|---|---|---|
| `tpl-locust-line` 的 `spacing` | ① | 家族預設 **2** → 量到 **3.667**（200 wc3u）。⚠️ 改家族預設會動到其他成員 ⇒ 建議**逐支覆寫** |
| `scaleAxis:[1,1,2.68]` | ① | 原作是**等向 265%**。這是模板文件自述的「誠實偏離」⇒ 保留但要知道它不是 JASS |
| `damageType:"physical"` | ② | JASS 是 `DAMAGE_TYPE_UNIVERSAL` ⇒ 應為 **`"true"`** |
| 落點 AoE | ② | 今天單體 → 應為 `shape:"circle" radius:4.58` |
| 基礎 `AUcs` 的直線傷害 | ② | 未表達 → `damageLine length:10.08 width:3.67` |
| `blink to:"targetUnit"` | ② | JASS 是**固定 550u（10.08）沿施法方向** → `blink to:"point"` |
| `decay` / `jumpRange` | ③ | 0.9 / 24.0 → 量到 **0.0 / 33.0**（⚠️ 動它是平衡改動，走 owner） |
| `dash` 掛錯技能 | ③ | 65-04 有、65-02 沒有 → **對調**（8.25 是 A04C 的 cast_range，⛔ 不是衝刺距離） |
| `vfxKey` | ③ | `fx.prim.holy.nova-lg` → `fx.prim.lightning.nova-lg`（在庫） |
| `castTimeSec` 兩形態不一致 | ② | n01c 0.667 vs nbbc 1.233，而 JASS 只有一份（1.00） |

**資產缺口（非機制；開票給美術／匯入線）**：`ImpaleTargetDust`（②）· `Asph` 球體 A09O/A09P（②，建議不翻譯）。
⭐ 其餘本批用到的 w3x stock 資產**全部在庫**：`w3x.stock.nedeathsmall` · `w3x.stock.neutralbuildingexplosion` · `w3x.stock.revivehuman` · `w3x.stock.fragdriller` · `w3x.stock.flamestrike1` · `w3x.stock.reddragonmissile` · `w3x.stock.thunderclapcaster` ＋ vfx `fx.w3x.stock.thunderclapcaster.p00`。

---

## ⑤ `vfx-script@1` 草案（三份，⭐ **可直接存檔**）

**共同原則（寫在每一份的 `notes` 裡）**：
1. ⭐ **只放 ability JSON 今天沒有畫的東西** —— ⛔ 不重複已經在 `effects[]` 裡的 `spawnModelFx`/`spawnVfx`，否則畫面會出現兩份。
2. ⭐ 每一段都指得到一個 `j:行號`。**JASS 沒有的動詞 ⇒ 不寫**（① 沒有喊招字、沒有音效、不改動畫 ⇒ script 裡就沒有那些段）。
3. 資源 id **全部逐一驗證存在**（`content/models/_index.json` 148 筆 · `content/vfx/_index.json` 649 筆 · `content/config/audio-map.json` 232 個 sfx key）。

### 5-1 `content/vfx-scripts/godie-ogrh.r.json`（鏡像檔 `godie-o00x.r.json` 把 `id`/`abilityId` 換掉即可）

```json
{
  "id": "godie-ogrh.r",
  "schema": "vfx-script@1",
  "abilityId": "godie-ogrh.r",
  "notes": "09-04 龜派氣功（JASS A03S，war3map.j 31804-31953；底稿 docs/_reports/vfx-editor-jass3b_temp_20260828-0312.md §1）。⭐ 只補 ability JSON 沒有畫的三段：槍口的兩發爆炸（j:31903 j:31905，掛在施法者前方 150wc3u=2.75u 的地板點）＋ 鏡頭噪動（j:31815-31817，2 秒後 j:31948 清除）。h007/h008/h006 已住 ability 的三個 spawnModelFx 節點 ⇒ ⛔ 這裡不重複。⚠️ 原作 A03S 沒有 CreateTextTag、沒有 PlaySound、沒有 SetUnitAnimation ⇒ 這裡也沒有。⚠️ 已知偏差：ability 的三個 spawnModelFx 缺 offsetForwardU（MISSING N1）⇒ 它們今天畫在腳下而不是槍口；鏡頭噪動只能是全域（MISSING N3，原作限 512wc3u=9.39u 內的英雄玩家）。",
  "segments": [
    {
      "kind": "modelFx",
      "on": "castEffect",
      "modelKey": "w3x.stock.nedeathsmall",
      "path": "static",
      "anchor": "self",
      "offsetForwardU": 2.75,
      "lifeSec": 1
    },
    {
      "kind": "modelFx",
      "on": "castEffect",
      "modelKey": "w3x.stock.neutralbuildingexplosion",
      "path": "static",
      "anchor": "self",
      "offsetForwardU": 2.75,
      "lifeSec": 1.2
    },
    {
      "kind": "screenShake",
      "on": "castEffect",
      "amplitude": 0.3,
      "durationSec": 2
    }
  ]
}
```

⭐ **變體 B（要先把 ability 的兩個 `spawnModelFx` 節點拿掉，否則會畫兩份）** —— 把光束本體與鑽頭搬進 script 以取得 `offsetForwardU`：

```json
{
  "kind": "modelFx", "on": "castEffect",
  "modelKey": "w3x.stock.revivehuman", "path": "static", "anchor": "self",
  "offsetForwardU": 2.75, "scale": 2.65, "clip": "idle", "lifeSec": 2,
  "soundKey": "wc3.crushingwavecaster1"
},
{
  "kind": "modelFx", "on": "castEffect",
  "modelKey": "w3x.stock.fragdriller", "path": "static", "anchor": "self",
  "offsetForwardU": 2.75, "scale": 3.65, "clipTimeScale": 0.15, "clip": "idle", "lifeSec": 2
}
```

### 5-2 `content/vfx-scripts/godie-n01c.r.json`（鏡像檔 `godie-nbbc.r.json` 同法；⚠️ 它的 `castTimeSec` 是 1.233，`atMs` 要跟著調）

```json
{
  "id": "godie-n01c.r",
  "schema": "vfx-script@1",
  "abilityId": "godie-n01c.r",
  "notes": "08-04 阿邦快速劍X（JASS A0EZ，war3map.j 28874-28940；底稿 docs/_reports/vfx-editor-jass3b_temp_20260828-0312.md §2）。段落對應：e003 RedDragonMissile 擺在出發點朝施法者面向、活 1 秒（j:28906 j:28909 j:28911，w3u usca 4.0，⛔ 觸發器沒有 SetUnitScalePercent）；出發點地板的 ImpaleTargetDust（j:28914）—— ⚠️ 該資產不在庫，這裡用 fx.fam.ground-dust.nature.s80 代打；落點每個受害者腳下的 ThunderClapCaster 活 1 秒（j:28884 j:28885 RemoveEffectSP 1.00）。⚠️ 原作的 TriggerSleepAction 是 1.00 秒，GGD 的 castTimeSec 是 0.667 ⇒ 這裡把 e003 的 lifeSec 壓到 0.7 對齊詠唱窗。⛔ 28921-28925 的喊招 TextTag 在原作裡是**被註解掉的** ⇒ 這裡沒有 floatingText。⛔ MISSING N6：ShowUnitHide（本體消失 1 秒）今天沒有任何標籤表達得出來 —— 那是這一招的招牌。",
  "segments": [
    {
      "kind": "modelFx",
      "on": "castStart",
      "modelKey": "w3x.stock.reddragonmissile",
      "path": "static",
      "anchor": "self",
      "scale": 4,
      "clip": "idle",
      "lifeSec": 0.7
    },
    {
      "kind": "vfx",
      "on": "castStart",
      "atMs": 600,
      "vfxId": "fx.fam.ground-dust.nature.s80",
      "at": "self",
      "durationSec": 0.8
    },
    {
      "kind": "vfx",
      "on": "castEffect",
      "vfxId": "fx.w3x.stock.thunderclapcaster.p00",
      "at": "target",
      "durationSec": 1
    }
  ]
}
```

### 5-3 `content/vfx-scripts/godie-udea.r.json`

```json
{
  "id": "godie-udea.r",
  "schema": "vfx-script@1",
  "abilityId": "godie-udea.r",
  "notes": "65-04 天譴（JASS A04C，war3map.j 46950-47021；底稿 docs/_reports/vfx-editor-jass3b_temp_20260828-0312.md §3）。⭐⭐ 這一份天生就短，而那是量到的：原作每個敵人各生一具 'ogru' 施法者，而 ogru 的 w3u 模型欄是空字串 \" .mdl\" ⇒ **完全隱形**（OBJECTS.json.units.ogru）。⇒ 這一支原作沒有任何自己的模型特效，畫面全部是 WC3 內建的鏈鎖閃電／奪魔美術。段落對應：①所有 ogru 都生在**施法者腳下**（j:46985 j:46986）⇒ 每一條電弧的起點都是施法者 ⇒ 一發 lightning nova 表達這件事；②TerrainDeformationWaveBJ(2.00,…)（j:47009）⇒ screenShake 2 秒（M5 建議豁免）。⛔ 觸發器沒有 PlaySound、沒有 CreateTextTag ⇒ 這裡也沒有。⚠️ 待查證：這一支的畫面主體是客戶端的 vfxArc（鏈鎖弧線），CLAUDE.md 記過它曾經零 emitter —— ⛔ 本報告沒有跑測試，不宣稱它今天的狀態。",
  "segments": [
    {
      "kind": "vfx",
      "on": "castEffect",
      "vfxId": "fx.prim.lightning.nova-lg",
      "at": "self",
      "durationSec": 0.6
    },
    {
      "kind": "screenShake",
      "on": "castEffect",
      "amplitude": 0.4,
      "durationSec": 2
    }
  ]
}
```

⚠️ **三份都還沒有進 `content/vfx-scripts/_index.json`** —— 存檔之後要跑 `pnpm content:build`（⛔ 本次任務唯讀，沒有跑）。

---

## ⑥ 單位換算與讀 JASS 的備忘（本批新增的）

- 距離：`GGD_PER_WC3 = 11/600 = 0.018333`（`expand.ts:50`）⇒ **1 GGD-u ＝ 54.545 wc3-u**。
  本批用到的：150→**2.75** · 200→**3.667** · 250→**4.583** · 400→**7.333** · 450→**8.25** · 500→**9.167** · 512→**9.387** · 550→**10.083** · 600→11.0 · 900→16.5 · 1200→**22.0** · 1800→**33.0**
- `SetUnitScalePercent(a,b,c)` 是**編輯器 scale 的百分比**；⚠️ beam-roll 家族**刻意不把 w3u `usca` 乘回去**（模板 description 自述的「誠實偏離 (b)」）⇒ 讀到 `scale:3.65` 不要以為漏了 h008 的 usca 2.0。
- ⚠️ **等級一律從 1 起算**：`250+15·L` 的最低級是 **265%**、`350+15·L` 是 **365%**、`300·L+150` 是 **450**。
- ⭐ **迴圈三分類**（本批的實例）：
  | 形狀 | 本批實例 | 是什麼 |
  |---|---|---|
  | `CreateNUnitsAtLoc` 在迴圈裡 | ① `h006` ×6（j:31926-31927） | **真的多具**（`tpl-locust-line`） |
  | `GetUnitsInRangeOfLocMatching` ＋ `ForGroupBJ`，⛔ 迴圈體零生成 | ① 第二個 6 圈迴圈（j:31936-31944，只拔 ANCIENT 旗標） | **傷害班表／簿記**，⛔ 不是視覺 |
  | `ForGroupBJ` 逐人 `AddSpecialEffect` | ② ThunderClapCaster（j:28884） | **傷害段的視覺**（per-victim） |
- ⚠️ **本批三支沒有任何一次 `AddSpecialEffectTargetUnitBJ`** —— 全部是 `AddSpecialEffectLocBJ`（掛地板點）。第一批那個「第二個參數掛在誰身上」的陷阱**在這批不適用**，⛔ 但它換成了另一個問題：`Loc` 版掛的是**哪一個點**（槍口 / 出發點 / 受害者腳下 —— 三種都出現了）。
- ⭐ **空模型的 dummy 是一種合法的翻譯結果**：`ogru` 的 `model` 欄是 `" .mdl"`。⛔ 不要因為「有 `CreateNUnitsAtLoc` 就一定要畫一具模型」而憑空補一個 modelKey —— 先去 `OBJECTS.json.units[<code>].model` 讀那一格。
- ⭐ **一個數字出現在兩個欄位時，先問它是哪一個**：③ 的 `8.25` 同時是 GGD 的 `dash.maxDistance` 與 A04C 的 `cast_range ÷ 54.545`。⇒ 那個 dash 是把**施法距離**讀成了**衝刺距離**（真正的衝刺在 65-02 的 `Trig_Run_Effect`）。
