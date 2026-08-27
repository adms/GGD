# 三支技能 JASS 一比一還原底稿（技能特效編輯器大票用）

> 產出：2026-08-28 00:42 · 任務：為「技能特效編輯器」挖出三支技能的 JASS 逐字底稿＋翻譯對照表
> 方法論（owner 2026-08-26 逐字）：「**翻譯 JASS to 編輯器JSON**，如果 **JSON 沒支援的標籤或邏輯則去實作**」
> —— 每個 JASS 動詞對到一個現有 GGD 標籤，翻不過去標 **MISSING**，⛔ 不近似。

## 0. 定位確認（含兩個與任務原述的出入）

| 技能 | GGD 檔 | GGD name | w3x rawcode | JASS 觸發 |
|---|---|---|---|---|
| ① 超究武神霸斬 | `content/abilities/godie-hart.r.json` | 01-04 超究武神霸斬 | **A077**（EX 改版 **A0B1**，同一觸發家族） | `Trig_SuperFF7_*`（war3map.j 33759–33944） |
| ② 龍破斬 | `content/abilities/godie-h020.e.json` ＋ `godie-hjai.e.json`（**兩個 unit 形態共用同一支**，內容只差 `vfxKey`：h020=`fx.prim.fire.beam`、hjai=`fx.prim.void.slash`） | 04-03 龍破斬 | **A04R** | `Trig_Fire_NOVA_*`（29886–29926，CAST 詠唱）＋ `Trig_DragonSlaveSet_*`（29937–29972）＋ `Trig_DragonSlaveMove_*`（29981–30160，0.03s 週期投射物） |
| ③ 理想鄉EX 鏈 | `content/abilities/godie-e002.r.json`（20-04 Avalon）＋ `godie-e002.ex.json`（20-002 解放.約束勝利劍MAX；e00l.* 為變身形態同號技能，內容同） | 20-04 / 20-002 | Avalon=**A0CT**；EX 在 w3x **沒有掛在 A0SP 上**（A0SP 全 war3map.j 零引用）——真正的 EX 演出是 `Trig_ExcaliburMAX_*`（32475–32668），掛在 **Saber unit（E002）的 EVENT_UNIT_DAMAGED** 上（英雄 unit rawcode 那條路，於 `Trig_Open_Skill_of_Saber_Actions`@31982 動態註冊） |

出入①：任務原述「理想鄉EX＝godie-e002.ex.json」——實際 `理想鄉` 的名字在 **`.r`**（20-04），`.ex` 是 20-002 解放.約束勝利劍MAX。主 session 已裁定：演出鏈是「Avalon 反彈成功 → 七連斬 → 約束與勝利之劍收尾」，**兩支一起挖**（本報告照辦）。
出入②：龍破斬兩位「英雄」其實是同一位（黑魔導士莉娜因巴斯）的兩個形態：w3x heroes **H020** 與 **Hjai**（同模型 `LinaInvers.mdl`）。JASS 條件 `GetUnitTypeId()=='H020'` 只給 H020 形態 +INT×7 傷害加成（04-002 惡夢魔王的碎片 EX 增幅：「龍破斬及神滅斬增加傷害(智慧*7)」）。GGD 對應 `godie-h020` / `godie-hjai` 兩張卡。

rawcode 對照來源：`tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` 的 `abilities[*].name`（編號是 join key）。
GGD JSON 的 `provenance` 欄位只是字串（`"w3x-import"` / `"owner-spec"`），不含 rawcode——rawcode 靠編號↔name join。

---

## ① 超究武神霸斬（A077 / A0B1・克勞德 R）

### 1-1 GGD 現況（godie-hart.r.json）

- `provenance:"w3x-import"` · slot R · targeted · maxRank 3 · cd 60 · mana 144 · range 8（rangeTier 大）· castTimeSec **1.833** · vfxKey `fx.w3x.orb.herocloudkfksword.p00` · hitFeel（hitstop 5 / hitstun 9 / shake 0.614 directional / spark heavy / flash [0.85,0.92,1.0] 211ms / camKick 0.526）
- effects（5 個）：
  1. `applyStatus omnislash-lock`（target，3.5s，stun）
  2. `applyStatus omnislash-perform`（self，3.5s，stun）——status 文件自述對照 JASS 的 PauseUnitBJ+Avul
  3. `invulnerable`（self 3.5s，blocksDamage all）
  4. `comboStrikes family:"superff7"`：perStrike＝damage(極小)＋spawnVfx `fx.w3x.stock.thunderclapcaster.p00`@target＋floatingText「{{i}}Hit」；finisher＝damage(極小＋0.3AP)＋spawnVfx `fx.w3x.stock.warstompcaster.p00`@target＋spawnVfx `godie-herocloudkfksword-p0`@bone(weapon)＋floatingText＋screenFlash＋screenShake
  5. `spawnModelFx modelKey:"imported.herocloudstrife"`（alpha 0.6，path toTarget，speed 30，onArrive: `fx.prim.physical.explosion-lg`）——幻影分身
- 節奏共用表：`content/config/combo-strikes.json` 家族 `superff7`＝`steps:[0.0,0.9,1.1,1.3,1.5,1.7]`、`finisherDelaySec:1.8`、`seq:["W0.2","W0.6","W0.4","W0.2","D","D","W0.5","W1"]`、rawcodes [A077,A0B1]（機器從 war3map.j 抽出）

### 1-2 w3a 欄位（OBJECTS.json）

| | A077 | A0B1（改） |
|---|---|---|
| base | AEer（暗影突襲類指向技） | AEer |
| cd / mana | 60 / 170·260·350 | 60 / **216·341·466** |
| cast_range | 450 | 450 |
| duration / hero_dur | 13 / 13 | 13 / 13 |
| buff | B006 | — |
| icon | BTNDevourMagic | 同 |
| tooltip 傷害 | 630+力量×1 / 980+力量×2 / 1330+力量×3 | 630+力量×4.5 / 980+力量×7.25 / 1330+力量×9 |

輔助物件：
| code | 是什麼 | model | 備註 |
|---|---|---|---|
| `h002` 幻影 | dummy unit（base hwat） | **HeroCloudStrife.mdl** | 編輯器 scale 1.3，move 0，帶 A09O/A09P（Asph 球體）＋Aloc |
| `A0FZ` 00-設定飛行高度 | Arav（烏鴉形態） | — | 「有這個技能才能用觸發改變非飛行部隊的飛行高度」 |
| `Avul` | 無敵 | — | 演出期掛在克勞德身上 |
| TRIGSTR_3580 | 施放喊招文字 | — | 「超究武神霸斬」 |

### 1-3 JASS 逐字（tools/w3x-import/out/GoDieEX22s/jass-spells/A077.j；war3map.j 33759–33944）

事件：`EVENT_PLAYER_UNIT_SPELL_EFFECT`；條件（33759）：`GetSpellAbilityId()=='A077'` 或 `'A0B1'`。
EX 判定（33776）：`udg_EX_Mode[玩家] == true`。
finisher 判定（33787）：`udg_SupI >= 7`。

主函式 `Trig_SuperFF7_Actions`（war3map.j 33799；A077.j 61–203 逐字）：

```jass
function Trig_SuperFF7_Actions takes nothing returns nothing
    set udg_FF7OmniSlashLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_FF7_CastedUnit = GetSpellTargetUnit()
    set udg_superPoint = GetUnitLoc(udg_FF7_CastedUnit)
    set udg_FF7_CloudUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A0FZ', udg_FF7_CloudUnit )
    call SetUnitAnimation( udg_FF7_CloudUnit, "Spell" )
    call SetUnitVertexColorBJ( udg_FF7_CloudUnit, 100, 60.00, 60.00, 50.00 )
    call UnitAddAbilityBJ( 'Avul', udg_FF7_CloudUnit )
    call CreateTextTagUnitBJ( "TRIGSTR_3580", GetTriggerUnit(), -30.00, 24.00, 100, 0.00, 0.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CloudUnit, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'h002', GetOwningPlayer(udg_FF7_CloudUnit), PolarProjectionBJ(udg_superPoint, -250.00, udg_superAngle), bj_UNIT_FACING )
    set udg_FF7_EffectUnit = GetLastCreatedUnit()
    call UnitAddAbilityBJ( 'A0FZ', udg_FF7_EffectUnit )
    call SetUnitVertexColorBJ( udg_FF7_EffectUnit, 100, 60.00, 60.00, 40.00 )
    call PauseUnitBJ( true, udg_FF7_CloudUnit )
    if ( Trig_SuperFF7_Func022C() ) then
        set udg_SuperFF7 = ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0B1', udg_FF7_CloudUnit)) * 0.25 ) + 0.25 ) * I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_FF7_CloudUnit, true)) ) + ( 49.00 + ( I2R(GetUnitAbilityLevelSwapped('A0B1', udg_FF7_CloudUnit)) * 50.00 ) ) )
    else
        set udg_SuperFF7 = ( 49.00 + ( I2R(GetUnitAbilityLevelSwapped('A077', udg_FF7_CloudUnit)) * 50.00 ) )
    endif
    set udg_SupI = 1
    loop
        exitwhen udg_SupI > 7
        call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_CloudUnit, "HeroCloudCyd.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_EffectUnit, "HeroCloudCyd.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_CastedUnit, "Objects\\Spawnmodels\\Human\\HumanBlood\\HumanBloodPeasant.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CloudUnit, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitFlyHeightBJ( udg_FF7_EffectUnit, 500.00, 2000.00 )
        call SetUnitAnimation( udg_FF7_EffectUnit, "Spell" )
        call SetUnitTimeScalePercent( udg_FF7_EffectUnit, ( I2R(udg_SupI) * 50.00 ) )
        call SetUnitPositionLoc( udg_FF7_EffectUnit, PolarProjectionBJ(udg_superPoint, 180.00, udg_superAngle) )
        call SetUnitTimeScalePercent( udg_FF7_CloudUnit, ( I2R(udg_SupI) * 100.00 ) )
        call IssueTargetOrderBJ( udg_FF7_CloudUnit, "attack", udg_FF7_CastedUnit )
        call SetUnitAnimation( udg_FF7_CloudUnit, "Spell" )
        call TriggerSleepAction( ( 1.00 - ( I2R(udg_SupI) * 0.50 ) ) )
        call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
        call SetUnitAnimationWithRarity( udg_FF7_CloudUnit, "Spell", RARITY_RARE )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_CloudUnit, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitPositionLocFacingBJ( udg_FF7_CloudUnit, udg_superPoint, udg_superAngle )
        set udg_superAngle = ( udg_superAngle + 270.00 )
        set udg_superPoint = PolarProjectionBJ(GetUnitLoc(udg_FF7_CastedUnit), 70.00, udg_superAngle)
        call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_CastedUnit, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_CastedUnit, "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(udg_SupI) + ( "Hit" + "" ) ), udg_FF7_CastedUnit, -30.00, ( ( I2R(udg_SupI) * 4.00 ) + 6.00 ), 100, 100.00, 100.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, udg_superAngle )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call IssueImmediateOrderBJ( udg_FF7_CastedUnit, "stop" )
        call SetUnitTimeScalePercent( udg_FF7_CastedUnit, 10.00 )
        call SetUnitAnimation( udg_FF7_CloudUnit, "Spell" )
        call SetUnitAnimation( udg_FF7_CastedUnit, "Death" )
        call SetUnitFlyHeightBJ( udg_FF7_EffectUnit, 0.00, 2000.00 )
        call TriggerSleepAction( ( 1.00 - ( I2R(udg_SupI) * 0.60 ) ) )
        call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
        if ( Trig_SuperFF7_Func023Func041C() ) then
            call PauseUnitBJ( true, udg_FF7_CastedUnit )
            call SetUnitInvulnerable( udg_FF7_CastedUnit, true )
            call UnitAddAbilityBJ( 'A0FZ', udg_FF7_CastedUnit )
            call SetUnitTimeScalePercent( udg_FF7_CloudUnit, 10.00 )
            call SetUnitAnimation( udg_FF7_CloudUnit, "Spell" )
            call SetUnitFlyHeightBJ( udg_FF7_CloudUnit, 1000.00, 2000.00 )
            call SetUnitFlyHeightBJ( udg_FF7_CastedUnit, 1000.00, 2000.00 )
            call SetUnitFlyHeightBJ( udg_FF7_EffectUnit, 1000.00, 1800.00 )
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CloudUnit, "HeroCloudKFKSword.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_FF7_CastedUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CloudUnit, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_FF7_CastedUnit, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call TriggerSleepAction( 0.20 )
            call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
            call SetUnitPositionLoc( udg_FF7_EffectUnit, GetUnitLoc(udg_FF7_CloudUnit) )
            call TriggerSleepAction( 0.60 )
            call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CastedUnit, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitFlyHeightBJ( udg_FF7_CastedUnit, 0.00, 5000.00 )
            call SetUnitFlyHeightBJ( udg_FF7_CloudUnit, 0.00, 4000.00 )
            call SetUnitFlyHeightBJ( udg_FF7_EffectUnit, 0.00, 3800.00 )
            call TriggerSleepAction( 0.40 )
            call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CastedUnit, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call UnitRemoveAbilityBJ( 'A0FZ', udg_FF7_CloudUnit )
            call UnitRemoveAbilityBJ( 'A0FZ', udg_FF7_CastedUnit )
            call TerrainDeformationRippleBJ( 5.00, false, GetUnitLoc(GetTriggerUnit()), 200.00, 200.00, 64, 1, 200.00 )
            call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
            set bj_forLoopBIndex = 1
            set bj_forLoopBIndexEnd = 3
            loop
                exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
                call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_superPoint, 1600.00, 1600.00)), function Trig_SuperFF7_Func023Func041Func039Func001A )
                set bj_forLoopBIndex = bj_forLoopBIndex + 1
            endloop
            call TriggerSleepAction( 0.20 )
            call SetUnitAnimation( udg_FF7_CastedUnit, "death" )
            call SetUnitInvulnerable( udg_FF7_CastedUnit, false )
            call UnitDamageTargetBJ( udg_FF7_CloudUnit, udg_FF7_CastedUnit, ( udg_SuperFF7 + ( I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, udg_FF7_CloudUnit, true) * udg_FF7OmniSlashLevel )) * 1.00 ) ), ATTACK_TYPE_HERO, DAMAGE_TYPE_NORMAL )
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CastedUnit, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_FF7_CastedUnit), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
            call UnitDamageTargetBJ( udg_FF7_CloudUnit, udg_FF7_CastedUnit, udg_SuperFF7, ATTACK_TYPE_HERO, DAMAGE_TYPE_NORMAL )
        endif
        set udg_SupI = udg_SupI + 1
    endloop
    call SetUnitTimeScalePercent( udg_FF7_CloudUnit, 100.00 )
    call SetUnitTimeScalePercent( udg_FF7_CastedUnit, 100.00 )
    call SetUnitVertexColorBJ( udg_FF7_CloudUnit, 100, 100.00, 100.00, 0.00 )
    call UnitRemoveAbilityBJ( 'Avul', udg_FF7_CloudUnit )
    call PauseUnitBJ( false, udg_FF7_CloudUnit )
    call PauseUnitBJ( false, udg_FF7_CastedUnit )
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FF7_CloudUnit), 'h002'), function Trig_SuperFF7_Func033A )
endfunction
```

輔助函式（逐字）：`Func023Func041Func039Func001A`＝對範圍內每單位的玩家 `CameraSetEQNoiseForPlayer(…,12.00)`；`Func033A`＝`KillUnit+RemoveUnit`（清 h002）。

### 1-4 逐行標注（關鍵呼叫）

| JASS | 標注 |
|---|---|
| `GetUnitAbilityLevelSwapped('A077'…)` | ⚠️ 等級從 1 起算：per-hit 傷害＝49+50L → L1=99、L2=149、L3=199（×7 刀＝693/1043/1393，第 7 刀另 +STR×L） |
| EX 分支 | per-hit＝(0.25L+0.25)×STR＋49+50L（用 **A0B1** 的等級） |
| `SetUnitVertexColorBJ(cloud,100,60,60,50)` | BJ 簽名＝(unit, R%, G%, B%, **透明%**)：本體變紅色調 50% 半透明鬼影；結尾 (100,100,100,**0**) 還原 |
| `CreateNUnitsAtLoc(1,'h002',…,-250,angle)` | **1 具**幻影（HeroCloudStrife.mdl，1.3），生成在目標「angle 反方向 250u」 |
| `udg_superAngle` | 全域，初始 0（war3map.j:81/2426），**每刀 +270°**（＝每刀繞目標 −90° 旋轉走位），跨施放累積不重設 |
| `SetUnitPositionLocFacingBJ(cloud, superPoint, angle)` | **克勞德本體每刀瞬移**到目標周圍 70u 的旋轉點 |
| `SetUnitPositionLoc(effect, Polar(superPoint,180,angle))` | 幻影每刀瞬移到再外 180u |
| `SetUnitFlyHeightBJ(effect,500,2000)` → `0,2000` | 幻影每刀升空 500 再落地（rate 2000）；finisher 三人 1000 高（rate 2000/2000/1800）再落（5000/4000/3800） |
| `SetUnitTimeScalePercent(effect, i*50)` / `(cloud, i*100)` | 動畫加速：幻影 50%→350%、克勞德 100%→700%；目標每刀被定格 `10%` |
| `TriggerSleepAction(1−0.5i)` / `(1−0.6i)` | 節奏：i=1 → 0.5+0.4s；i≥2 兩式 ≤0 → 由 TSA 最小延遲撐（出貨共用表把它機械化為 steps [0,0.9,1.1,1.3,1.5,1.7]＋finisher 1.8） |
| `AddSpecialEffectTargetUnitBJ("chest", CastedUnit, …)` | ⚠️ 第二參數＝**受擊者**（HumanBlood / ThunderClap / MarkOfChaos / FlameStrike1）；掛克勞德的是 HeroCloudCyd / Phoenix_Missile / MirrorImage / ResurrectTarget / HeroCloudKFKSword |
| `UnitDamageTargetBJ(…, ATTACK_TYPE_HERO, DAMAGE_TYPE_NORMAL)` | 每刀一次（單體）；第 7 刀＝SuperFF7＋STR×L |
| `TerrainDeformationRippleBJ(5,false,loc,200,200,64,1,200)` | 地形波紋 5 秒 |
| `CameraSetEQNoiseForPlayer(…,12)` ×3 輪（1600×1600 矩形內） | 區域內玩家鏡頭震動 |

### 1-5 演出時間軸（施法點後；TSA≤0 以最小延遲 ε 計）

| t | 發生 |
|---|---|
| 0 | 喊招文字「超究武神霸斬」；克勞德紅染半透明＋無敵＋pause＋Spell 動畫；ResurrectTarget 光柱@weapon；h002 幻影生成（目標後 250u，紅染 40% 透明） |
| 0（每刀開頭） | 目標 death 動畫；HeroCloudCyd 劍氣@克勞德chest＋@幻影chest；血濺@目標chest；Phoenix_Missile@克勞德weapon；幻影升空 500、Spell 動畫（i×50% 速）；克勞德攻擊指令＋Spell |
| ≈0.5（i=1 前半睡完） | MirrorImage 殘影@克勞德chest；**克勞德瞬移**目標旁 70u（角度 +270°/刀）；ThunderClap＋MarkOfChaos@目標chest；「1Hit」沿角度飛出；目標 stop＋timescale 10% 定格；幻影落地 |
| ≈0.9 | **第 1 刀傷害**（其後 i=2..6 以 ε 節奏連刀 ≈1.1/1.3/1.5/1.7/…） |
| 第 7 刀進 finisher | 目標 pause＋無敵＋飛行解鎖；克勞德 timescale 10% 慢動作；**三人升空 1000**；HeroCloudKFKSword 究極武器@weapon；WarStomp@目標腳下；FlameStrike1@目標chest |
| +0.2 | 目標 death；幻影瞬移到克勞德位置 |
| +0.8 | WarStomp@目標weapon；**三人急墜**（rate 5000/4000/3800） |
| +1.2 | WarStomp again；地形波紋 5s；區域鏡頭震動(12)×3 |
| +1.4 | 解除目標無敵 → **終結傷害 SuperFF7+STR×L**；WarStomp@weapon＋NeutralBuildingExplosion@目標腳下 |
| 收尾 | timescale/vertex/Avul/pause 全還原 → +0.5s 清鏡頭噪動 → +1.0s 清幻影 |

### 1-6 翻譯對照表（JASS→GGD）

| JASS 動詞 | GGD 標籤 | 狀態 |
|---|---|---|
| 喊招 TextTag（沿面向飛） | `floatingText`（applyTo self） | ✅（方向速度缺 → M7） |
| PauseUnit+Avul（施法者） | `applyStatus omnislash-perform`＋`invulnerable` | ✅ 已出貨 |
| 目標 stop＋stun | `applyStatus omnislash-lock`（stun） | ✅ 已出貨 |
| 7 刀節奏＋per-hit 傷害＋finisher | `comboStrikes family:"superff7"`（steps 從共用表） | ✅ 已出貨 |
| `CreateNUnitsAtLoc(1,'h002')` 幻影 | `spawnModelFx imported.herocloudstrife alpha:0.6` | ✅ 已出貨（⚠️ 現行 path:toTarget speed:30 是**近似**——原作是「瞬移貼位＋升降」不是等速飛行） |
| 幻影紅染 (100,60,60) | `spawnModelFx.tint` | ✅ 可表達（現行只給 alpha 0.6，未給 tint）|
| **克勞德本體逐刀瞬移**（70u、+270°/刀） | — | ⛔ **MISSING M1**（`tpl-lock-combo` 文件自認「原作連段中施法者一擊一擊瞬移到目標身邊，這裡沒有搬」） |
| **本體 vertex 紅染半透明** 3.5s | — | ⛔ **MISSING M2**（status-effect 無 tint/alpha 欄位；spawnModelFx.tint 只管 dummy） |
| **飛行高度曲線**（500↔0、1000 急墜） | — | ⛔ **MISSING M3**（spawnModelFx 無 z/height 參數） |
| **目標 death 動畫反覆＋timescale 10% 定格** | stun 只凍行為 | ⛔ **MISSING M4**（victim 動畫剪輯/timescale 控制） |
| 掛骨特效（chest/weapon，受擊者側） | `spawnVfx at:"bone" attach:"chest"` | ✅（⚠️ `at:"bone"` 錨定**施法者**——掛**受擊者**骨頭那半今天缺，見 CLAUDE.md 2026-08-27 那條：316 呼叫裡 124 掛受擊者） |
| ThunderClap/WarStomp/MarkOfChaos/HeroCloudKFKSword | `fx.w3x.stock.thunderclapcaster.p00`／`fx.w3x.stock.warstompcaster.p00`／`fx.w3x.stock.markofchaostarget.p00–05`／`godie-herocloudkfksword-p0` | ✅ 資產在庫 |
| HumanBloodPeasant／Phoenix_Missile／MirrorImageCaster／ResurrectTarget／NeutralBuildingExplosion／HeroCloudCyd | HeroCloudCyd → `imported.herocloudcyd`（model 在庫）；resurrect 有 `fx.fam.resurrect.*` 家族近似 | ⚠️ 血濺/鳳凰彈/鏡像殘影/中立爆炸 **無對應 vfx key**（資產缺口，非機制缺口） |
| TerrainDeformationRipple | `screenShake` 近似 | ⛔ **MISSING M5**（建議豁免） |
| CameraSetEQNoise（區域內玩家） | `screenShake applyTo:"all"` | ⚠️ 部分（無範圍限定） |
| TextTag「iHit」 | `floatingText`「{{i}}Hit」 | ✅ 已出貨 |

---

## ② 龍破斬（A04R・莉娜 E；H020/Hjai 兩形態共用）

### 2-1 GGD 現況（godie-h020.e.json；hjai.e 同、僅 vfxKey 異）

- `provenance:"w3x-import"` · slot E · ground · maxRank 4 · cd 60 · mana 288 · range 12（極大）· radius 8（大）· castTimeSec **1.233**
- effects（7 個）：詠唱 5 句 `floatingText`（0/0.2/0.4/0.6/0.8s，橘紅 [255,120,40]）→ `spawnModelFx preset:"tpl-line-blast"`（onArrive：`fx.prim.fire.explosion-lg`＋`damageArea 大 +1.8AP r8`＋slow40 1.5s＋screenShake；onTouch：damage 大）→ `spawnModelFx preset:"tpl-locust-strike" modelKey:"w3x.stock.monsoonbolttarget"`
- `tpl-line-blast` params default：`imported.fireblast`、forward、speed 27.5、distance 12、spin 360°/s、scale 4.5、touchRadius 3.67 —— 模板文件自述設計正典就是 04-03（owner 2026-08-22：「莉娜龍破斬(一直線火球衝擊波後目的地火焰大爆炸)」）

### 2-2 w3a／物件

| | 值 |
|---|---|
| A04R base | ANc1（腐臭蜂群·直線彈道類）；data A/D/E 全 0 ⇒ 傷害**全在觸發** |
| cd / mana | 60 / 230·395·560·725 |
| cast_range / area | 900 / 450 |
| buff | B007 |
| `h013` 新龍破斬2 | dummy（hpea）＝**MarkOfChaosTarget.mdl**（詠唱聚氣魔法陣；觸發再放大 230%） |
| `h014` 新龍破斬1 | dummy（hpea）＝**FireBlast.mdl**，編輯器 scale **4.5**（火球本體；觸發未再縮放）|
| TRIGSTR_3337/3598/3599/3600/3601 | 詠唱五句（＝GGD 五句 floatingText 逐字同文） |

### 2-3 JASS 逐字

事件鏈：`Fire_NOVA`（**SPELL_CAST**＝抬手就唸咒）→ `DragonSlaveSet`（**SPELL_EFFECT**＝施法點）→ `DragonSlaveMove`（0.03s 週期）。

`Trig_Fire_NOVA_Actions`（war3map.j 29893；逐字節錄核心——五段完全同構，僅 TRIGSTR 不同）：

```jass
    call CreateTextTagUnitBJ( "TRIGSTR_3337", GetTriggerUnit(), -30.00, 18.00, 100, 0.00, 0.00, 40.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    call TriggerSleepAction( 0.20 )
    // …同構重複 TRIGSTR_3598 / 3599 / 3600（各隔 0.20）→ TRIGSTR_3601
```

`Trig_DragonSlaveSet_Actions`（war3map.j 29951，逐字）：

```jass
function Trig_DragonSlaveSet_Actions takes nothing returns nothing
    set udg_DragonSlaverCaster = GetTriggerUnit()
    set udg_DrganSlaveCastPoint = GetSpellTargetLoc()
    set udg_DrganSlaveMovePoint = GetUnitLoc(GetTriggerUnit())
    set udg_DrgaonSlaveFacing = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), udg_DrganSlaveCastPoint)
    set udg_DrgaonSlaveCounter = 0
    set udg_DragonSlaverDamage = ( ( I2R(GetUnitAbilityLevelSwapped('A04R', udg_DragonSlaverCaster)) * 500.00 ) + 200.00 )
    if ( Trig_DragonSlaveSet_Func008C() ) then    // GetUnitTypeId(GetTriggerUnit()) == 'H020'
        set udg_DragonSlaverDamage = ( udg_DragonSlaverDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 7 )) )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h013', GetOwningPlayer(GetTriggerUnit()), udg_DrganSlaveMovePoint, udg_DrgaonSlaveFacing )
    set udg_DragonSlaveUnit2 = GetLastCreatedUnit()
    call SetUnitScalePercent( udg_DragonSlaveUnit2, 230.00, 230.00, 230.00 )
    call GroupClear( udg_DragonSlaveGroup )
    call AddSpecialEffectTargetUnitBJ( "chest ", GetTriggerUnit(), "Abilities\\Spells\\Other\\Doom\\DoomTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call EnableTrigger( gg_trg_DragonSlaveMove )
endfunction
```

`Trig_DragonSlaveMove_Actions`（war3map.j 30098–30146，0.03s 週期，逐字）：

```jass
function Trig_DragonSlaveMove_Actions takes nothing returns nothing
    set udg_DrgaonSlaveCounter = ( udg_DrgaonSlaveCounter + 1 )
    if ( Trig_DragonSlaveMove_Func002C() ) then          // counter < 70 且 距離(castPoint,movePoint) > 55
        if ( Trig_DragonSlaveMove_Func002Func002C() ) then    // counter == 32
            call CreateNUnitsAtLoc( 1, 'h014', GetOwningPlayer(udg_DragonSlaverCaster), udg_DrganSlaveMovePoint, udg_DrgaonSlaveFacing )
            set udg_DragonSlaveUnit = GetLastCreatedUnit()
        else
        endif
        if ( Trig_DragonSlaveMove_Func002Func007C() ) then    // counter > 32
            set udg_DrganSlaveMovePoint = PolarProjectionBJ(udg_DrganSlaveMovePoint, 45.00, udg_DrgaonSlaveFacing)
            call SetUnitPositionLoc( udg_DragonSlaveUnit, udg_DrganSlaveMovePoint )
            call AddSpecialEffectLocBJ( udg_DrganSlaveMovePoint, "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectLocBJ( udg_DrganSlaveMovePoint, "Abilities\\Spells\\Other\\Volcano\\VolcanoDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call EnumDestructablesInCircleBJ( 256, udg_DrganSlaveMovePoint, function Trig_DragonSlaveMove_Func002Func007Func008003 )   // 殺樹
            call ForGroupBJ( GetUnitsInRangeOfLocAll(200.00, udg_DrganSlaveMovePoint), function Trig_DragonSlaveMove_Func002Func007Func009A )   // 收進命中組
        else
            call DoNothing(  )
        endif
    else                                                  // 到達或逾時 ⇒ 爆炸
        call EnumDestructablesInCircleBJ( 600.00, udg_DrganSlaveMovePoint, function Trig_DragonSlaveMove_Func002Func001003 )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_DrganSlaveMovePoint), function Trig_DragonSlaveMove_Func002Func004A )
        set bj_forLoopBIndex = 1
        set bj_forLoopBIndexEnd = 18
        loop
            exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
            call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_DrganSlaveMovePoint, 325.00, ( I2R(GetForLoopIndexB()) * 20.00 )), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            set bj_forLoopBIndex = bj_forLoopBIndex + 1
        endloop
        call ForGroupBJ( udg_DragonSlaveGroup, function Trig_DragonSlaveMove_Func002Func006A )   // 結算傷害
        call DisableTrigger( GetTriggeringTrigger() )
        call TerrainDeformationRippleBJ( 2.00, false, udg_DrganSlaveMovePoint, 300.00, 900.00, 280.00, 1.00, 300.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call AddSpecialEffectLocBJ( udg_DrganSlaveMovePoint, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.50 )
        call KillUnit( udg_DragonSlaveUnit )
        call RemoveUnit( udg_DragonSlaveUnit )
        call KillUnit( udg_DragonSlaveUnit2 )
        call RemoveUnit( udg_DragonSlaveUnit2 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DragonSlaverCaster), 'h014'), function Trig_DragonSlaveMove_Func002Func018A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DragonSlaverCaster), 'h013'), function Trig_DragonSlaveMove_Func002Func019A )
    endif
endfunction
```

傷害結算函式（`Func002Func006A`，逐字節錄）：

```jass
        if ( Trig_DragonSlaveMove_Func002Func006Func001Func001C() ) then   // 是建築
            call UnitDamageTargetBJ( udg_DragonSlaverCaster, GetEnumUnit(), ( udg_DragonSlaverDamage * 0.50 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( udg_DragonSlaverCaster, GetEnumUnit(), udg_DragonSlaverDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
```

### 2-4 逐行標注

| JASS | 標注 |
|---|---|
| 傷害＝`L×500+200` | ⚠️ 等級從 1 起算：700/1200/1700/2200；**H020 形態**另 +INT×7（＝惡夢魔王碎片 EX 增幅的住處；GGD 卡面「點選惡夢魔王碎片增幅後 +180% AP」是層1 重表達） |
| `CreateNUnitsAtLoc(1,'h013')`＋`SetUnitScalePercent(230,230,230)` | **1 具**聚氣魔法陣（MarkOfChaosTarget），**等向 230%**，施法點原地、面向彈道 |
| `CreateNUnitsAtLoc(1,'h014')` @counter==32 | **1 具**火球本體（FireBlast.mdl，編輯器 scale 4.5），**在施法點後 ≈0.96s 才出生** |
| `PolarProjectionBJ(move,45,facing)` 每 0.03s | 彈速＝**1500 w3x-u/s**；最多 (70−32)=38 tick ⇒ 最遠 ≈1710u、飛行 ≤1.14s。GGD 換算（分母 ≈54.5 w3x-u／GGD-u）＝27.5 GGD-u/s ⇒ **tpl-line-blast 的 speed:27.5 正是此值** |
| 每 tick `AddSpecialEffectLocBJ`（HCancelDeath＋VolcanoDeath） | **拖尾**：傷害段的視覺（⛔ 不是多具本體） |
| `GetUnitsInRangeOfLocAll(200)` 收組 | 沿路命中收集（半徑 200 ≈ touchRadius 3.67 GGD-u），一人一次（`IsUnitInGroup==false` 才加） |
| 到達判定 `距離≤55 或 counter≥70` | 到點爆炸／逾時爆炸二合一 |
| 爆炸 `GetUnitsInRangeOfLocAll(450)` | 半徑 450 ≈ 8 GGD-u（radiusTier 大）；**沿路收的組與爆炸收的組合併一次結算**（同一人不重複吃兩段）⚠️ GGD 模板刻意拆成 onTouch＋onArrive **兩串班表**（模板文件自述：合成一串會把沿路掃到的人擋在爆炸外——與原作「合併結算一次」語意不同，屬層1 裁決） |
| 18× WarStompCaster @r325 每 20° | **爆炸衝擊波環**（傷害段視覺，⛔ 不是 18 具本體） |
| 建築 ×0.5 | GGD 卡面「對建築傷害*50%」✅ 逐字保留 |
| `TerrainDeformationRippleBJ(2,…,300,900,280,1,300)` | 地形波紋 2s，300→900 |
| `TriggerSleepAction(0.50)` 後清 dummy | 爆炸視覺留 0.5s |

### 2-5 演出時間軸

| t | 發生 |
|---|---|
| 施法開始（CAST） | 詠唱 5 句，每句隔 0.2s（存活 0.5s、沿面向速度 32）：「比黃昏還要黑暗的東西…」→…→「賜與他們平等的毀滅吧」 |
| 施法點 t=0（EFFECT） | DoomTarget 魔法陣@caster chest；h013 聚氣陣（230%）在腳下、面向彈道；鎖定傷害；啟動 0.03s 週期 |
| t≈0.96（tick 32） | **h014 火球出生**（scale 4.5） |
| t≈0.96–2.1 | 火球以 1500u/s 直線推進；每 tick 拖尾（HCancelDeath＋VolcanoDeath）＋殺樹(256)＋收命中(200) |
| 到達（≤55）或 tick 70 | **爆炸**：殺樹(600)＋收人(450)＋18 具 WarStomp 環(r325/20°)＋逐人傷害（建築半額）＋地形波紋(2s)＋FlameStrikeTarget 火柱 |
| +0.5s | 清 h013/h014，觸發自我 disable |

### 2-6 翻譯對照表

| JASS | GGD | 狀態 |
|---|---|---|
| 詠唱 5 句（CAST 事件、0.2s 間隔） | 5× `floatingText`＋`delayed`（0.2/0.4/0.6/0.8）＋castTimeSec 1.233 | ✅ 已出貨（逐字同文） |
| DoomTarget@chest | `spawnVfx at:"bone" attach:"chest"`（model `imported.doom` 在庫） | ⚠️ 現行 JSON 未接（可加） |
| h013 聚氣陣 230% | `spawnModelFx path:"static" anchor:"self" scale`（vfx `fx.w3x.stock.markofchaostarget.p00` 亦可） | ⚠️ 現行未接 |
| h014 火球 4.5、1500u/s、≈1710u | `spawnModelFx preset:"tpl-line-blast"`（fireblast 4.5／27.5／12／spin360） | ✅ 已出貨（模板即為此技能建的） |
| **出生延遲 0.96s（詠唱聚氣後才發射）** | `delayed` 包住 spawnModelFx 可表達 | ⚠️ 現行未接（castTimeSec 吸收了一部分） |
| 每 tick 拖尾 spawn 特效 | — | ⛔ **MISSING M11**（spawnModelFx 無 trailVfx/interval；vfx emitter 屬資產層非班表層） |
| 沿路收組+爆炸合併**一次結算** | onTouch＋onArrive 兩段 | ⚠️ 層1 裁決不同（模板文件自述刻意拆兩段），⛔ 不是缺 |
| 爆炸 450／建築半額／slow | `damageArea r8 includeOrigin`＋onHitTargets slow40 | ✅ 已出貨（建築半額由全域規則） |
| 18× WarStomp 環 | `spawnModelFx path:"radial" count:18`（模型層）或 nova 家族 vfx | ⚠️ 部分（`spawnVfx` 無 count/環陣；用 radial 擺 18 具模型是錯層近似） |
| 地形波紋 | `screenShake` | ⛔ M5 |
| 殺樹（256/600） | — | N/A（GGD 場上無 destructable） |

---

## ③ 理想鄉 EX 鏈（Avalon A0CT → ExcaliburMAX・Saber）

### 3-1 GGD 現況

`godie-e002.r.json`（20-04 Avalon，`provenance:"owner-spec"`）：self、maxRank 3、cd 60、mana 144、castTimeSec 0.667、vfxKey `fx.prim.holy.nova-lg`。
effects：① `applyBuff duration:2`＋hooks：`onDamageTaken`→反彈傷害（3/5/7×原傷害＋3AP，negateOriginal）；`onReflectSuccess`→`spawnVfx fx.avalon.reflect-burst`＋雙 screenFlash＋screenShake（icd 1.0）② `spawnModelFx preset:"tpl-locust-strike" modelKey:"w3x.stock.monsoonbolttarget" anchor:"self" lifeSec:2 scale:6 tint:[0.3922,0,0]`

`godie-e002.ex.json`（20-002 解放.約束勝利劍MAX，`provenance:"owner-spec"`）：`effects:[]`，實作住在 **`passive.ranks[0].hooks`**：`onReflectSuccess`（icd 1.0）→ burst＋flash×2＋shake ＋ `delayed`(delaySec 0.12, **count 7**, interval 0.12)：每發 damage（7× 反彈傷害, maxChainDepth 1, negateOriginal）＋`fx.avalon.reflect-spark`＋「{{i}}Hit」；`finalEffects`：**`damageLine`（(現存魔力 resourcePct 7×)＋7AP，length 14 width 2，aim target fromCaster）**＋burst＋flash＋shake。另 `vfxLayers:[fx.prim.holy.beam-flat @point]`。

### 3-2 w3a／物件

| | 值 |
|---|---|
| A0CT base | AEtq；cd 60（L2/3）；mana 150/250/350；duration 0.01（瞬發殼）；data1 250/500/750 |
| A0SP（20-002 名義技能） | base Aegr；**war3map.j 零引用** ⇒ 純圖示/購買載體，EX 演出全在 unit 觸發 |
| `o00G` avalon | dummy（ogru）＝**MonsoonBoltTarget.mdl scale 6.0**，帶 Aloc＋A0CS |
| `A0CS` 鏈鎖閃電2 | base AOcl：傷害 100/200/300、跳數 6/12/16、每跳衰減 0.05、施距 501/750/1000 |
| `h02G` Saber殘影 | dummy（hpea）＝HeroSaber.mdl 1.1，帶 Avul＋Aeth＋Aloc＋A0J7 |
| `u018` 安云衝刺 | dummy（uaco）＝DarkPortalTarget.mdl scale 2.0，move 522 |
| `h00S` 勝利劍 | dummy（hpea）＝**ReviveHuman.mdl**（復活光柱）編輯器 scale **0.2**；觸發 350% ⇒ 有效 0.70 |
| `h008` 特效三號 | dummy（hpea）＝**FragDriller.mdl**（鑽頭）編輯器 scale **2.0**；觸發 400% ⇒ 有效 8.0＋timescale 15% 凍格 |
| `A0J7` 球體(索龍2) | Asph 球體（加了立刻移除＝手上閃光一瞬） |
| TRIGSTR_9854 / 9046 | 「永恆的理想鄉」／「**8Hit**」（7 刀之後劍收尾＝第 8 hit） |

### 3-3 JASS 逐字 — Avalon（A0CT.j；war3map.j 32374–32466）

`Trig_avalonReady_Actions`（32381，逐字）：

```jass
function Trig_avalonReady_Actions takes nothing returns nothing
    set udg_SaberUnit = GetTriggerUnit()
    set udg_IsAvalonReady = true
    call EnableTrigger( gg_trg_avalonStart )
    call TriggerSleepAction( I2R(( GetUnitAbilityLevelSwapped('A0CT', GetTriggerUnit()) + 1 )) )
    call DisableTrigger( gg_trg_avalonStart )
    set udg_IsAvalonReady = false
endfunction
```

`avalonStart`（SPELL_EFFECT 常駐監聽；條件 32402：`GetSpellTargetUnit()==udg_SaberUnit` ∧ 非我方 ∧ 施放者是英雄）。
`Trig_avalonStart_Actions`（32450，逐字）：

```jass
function Trig_avalonStart_Actions takes nothing returns nothing
    set udg_saber = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateTextTagUnitBJ( "TRIGSTR_9854", GetTriggerUnit(), 0, 13.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    set udg_WildSaber = ( ( 30 * GetHeroLevel(GetSpellTargetUnit()) ) + ( GetHeroStatBJ(bj_HEROSTAT_STR, GetSpellTargetUnit(), true) * ( GetUnitAbilityLevelSwapped('A0CT', GetSpellTargetUnit()) * 5 ) ) )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(udg_saber)), function Trig_avalonStart_Func011A )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SaberUnit), 'o00G'), function Trig_avalonStart_Func013A )
endfunction
```

`Func011A`（32432，逐字——對 900 範圍每個敵方非建築）：

```jass
        call UnitDamageTargetBJ( udg_saber, GetEnumUnit(), I2R(udg_WildSaber), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
        call CreateNUnitsAtLoc( 1, 'o00G', GetOwningPlayer(udg_saber), GetUnitLoc(GetEnumUnit()), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0CS', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0CS', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0CT', udg_saber) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
```

### 3-4 JASS 逐字 — ExcaliburMAX（war3map.j 32475–32668）

註冊（`Trig_Open_Skill_of_Saber_Actions`@31982，Saber 選角時）：
`call TriggerRegisterUnitEvent( gg_trg_ExcaliburMAX, GetTriggerUnit(), EVENT_UNIT_DAMAGED )` —— **掛在英雄 unit（E002）身上，⛔ 不在任何技能 rawcode 上**。

條件（32477–32500，逐字摘錄）：受傷者==udg_saber ∧ `udg_EX_Mode[玩家]==true` ∧ **`udg_IsAvalonReady==true`**（＝必須在 Avalon 反射窗內受傷）∧ 傷害源非中立敵對 ∧ 非建築 ∧ **是英雄** ∧ `GetUnitManaPercent(saber) >= 70.00`。

`Trig_ExcaliburMAX_Actions`（32559–32661，逐字）：

```jass
function Trig_ExcaliburMAX_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_ExcalburMAXTarget = GetEventDamageSource()
    set udg_ExcalburCount = 0
    set udg_EXCaTakenDamage = ( GetEventDamage() * 0.60 )
    call PauseUnitBJ( true, udg_saber )
    call PauseUnitBJ( true, udg_ExcalburMAXTarget )
    call SetUnitInvulnerable( udg_saber, true )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, true )
    call UnitAddAbilityBJ( 'A0J7', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0J7', GetTriggerUnit() )
    set udg_ExcalburCount = 1
    loop
        exitwhen udg_ExcalburCount > 7
        call SetUnitPositionLocFacingLocBJ( udg_ExcalburMAXTarget, PolarProjectionBJ(GetUnitLoc(udg_ExcalburMAXTarget), 10.00, GetUnitFacing(udg_saber)), GetUnitLoc(udg_saber) )
        call SetUnitAnimation( udg_ExcalburMAXTarget, "death" )
        call SetUnitPositionLocFacingLocBJ( udg_saber, GetUnitLoc(udg_ExcalburMAXTarget), GetUnitLoc(udg_ExcalburMAXTarget) )
        call SetUnitTimeScalePercent( udg_saber, 600.00 )
        call SetUnitAnimation( udg_saber, "attack" )
        call CreateNUnitsAtLoc( 1, 'h02G', GetOwningPlayer(udg_saber), GetUnitLoc(udg_saber), GetUnitFacing(udg_ExcalburMAXTarget) )
        call SetUnitTimeScalePercent( GetLastCreatedUnit(), 600.00 )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 80.00, 10.00, 10.00, 50.00 )
        call SetUnitAnimation( GetLastCreatedUnit(), "attack" )
        call AddSpecialEffectTargetUnitBJ( "weapon", GetLastCreatedUnit(), "Abilities\\Spells\\Demon\\DarkPortal\\DarkPortalTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(udg_ExcalburCount) + ( "Hit" + "" ) ), udg_saber, -30.00, ( ( I2R(udg_ExcalburCount) * 4.00 ) + 8.00 ), 100, 100.00, 100.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, GetRandomDirectionDeg() )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_ExcalburMAXTarget, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "Abilities\\Spells\\Demon\\DarkPortal\\DarkPortalTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100, udg_saber )
        call CreateNUnitsAtLoc( 1, 'u018', GetOwningPlayer(udg_saber), GetUnitLoc(udg_saber), GetRandomDirectionDeg() )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 100.00, 100.00, 100.00, 50.00 )
        call SetUnitInvulnerable( udg_ExcalburMAXTarget, false )
        call UnitDamageTargetBJ( udg_saber, udg_ExcalburMAXTarget, udg_EXCaTakenDamage, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call SetUnitInvulnerable( udg_ExcalburMAXTarget, true )
        call CreateTextTagUnitBJ( ( I2S(R2I(udg_EXCaTakenDamage)) + "!" ), udg_saber, -30.00, 10.00, 30.00, 90.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call TriggerSleepAction( GetRandomReal(0.05, 0.30) )
        set udg_ExcalburCount = udg_ExcalburCount + 1
    endloop
    call SetUnitTimeScalePercent( udg_saber, 100.00 )
    call SetUnitAnimationWithRarity( udg_saber, "attack", RARITY_RARE )
    call PlaySoundOnUnitBJ( gg_snd_FlameStrikeTargetWaveNonLoop1, 100, udg_saber )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "Abilities\\Spells\\Items\\AIvi\\AIviTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h02G'), function Trig_ExcaliburMAX_Func020A )
    call TriggerSleepAction( 0.10 )
    call PlaySoundOnUnitBJ( gg_snd_SuccubusYesAttack2, 100, udg_saber )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "HolyAwakening.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "handright", udg_saber, "Magical_Sword.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitTimeScalePercent( udg_saber, 30.00 )
    call TriggerSleepAction( 0.30 )
    call CreateTextTagUnitBJ( "TRIGSTR_9046", udg_saber, -30.00, 40.00, 100, 100.00, 100.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, udg_superAngle )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call CreateNUnitsAtLoc( 1, 'h00S', GetOwningPlayer(udg_saber), PolarProjectionBJ(GetUnitLoc(udg_saber), 70.00, GetUnitFacing(udg_saber)), GetUnitFacing(udg_saber) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 350.00, 350.00, 350.00 )
    call CreateNUnitsAtLoc( 1, 'h008', GetOwningPlayer(udg_saber), GetUnitLoc(udg_ExcalburMAXTarget), GetUnitFacing(udg_saber) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 400.00, 400.00, 400.00 )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_ExcalburMAXTarget), "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_ExcalburMAXTarget), "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, false )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, PolarProjectionBJ(GetUnitLoc(udg_saber), 350.00, GetUnitFacing(udg_saber))), function Trig_ExcaliburMAX_Func044A )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, true )
    call TriggerSleepAction( 0.20 )
    call SetUnitInvulnerable( udg_saber, false )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, false )
    call PauseUnitBJ( false, udg_saber )
    call PauseUnitBJ( false, udg_ExcalburMAXTarget )
    call SetUnitTimeScalePercent( udg_saber, 100.00 )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_saber), 1600.00, 1600.00)), function Trig_ExcaliburMAX_Func052A )
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 4.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h02G'), function Trig_ExcaliburMAX_Func056A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h00S'), function Trig_ExcaliburMAX_Func057A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h008'), function Trig_ExcaliburMAX_Func058A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'u018'), function Trig_ExcaliburMAX_Func059A )
    call EnableTrigger( gg_trg_ExcaliburMAX )
endfunction
```

收尾掃蕩函式（`Func044A`@32524，逐字——前方 350u 為圓心 900 範圍每個敵方非建築）：

```jass
        call UnitDamageTargetBJ( udg_saber, GetEnumUnit(), 1800.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
```

`Func052A`＝區域內每單位的玩家 `CameraSetEQNoiseForPlayer(…,20.00)`。

### 3-5 逐行標注（關鍵）

| JASS | 標注 |
|---|---|
| Avalon 窗＝`sleep(L+1)` | 2/3/4 秒（L 從 1 起算）＝tooltip「承受時間2/3/4秒」逐字吻合 |
| `WildSaber = 30×英雄等級 + STR×(5L)` | ＝tooltip「等級*30+力量*5/10/15」 |
| 反射觸發條件（原作） | 「敵方**英雄**的**技能指向 Saber**」（SPELL_EFFECT 監聽），⛔ 不是受傷事件；GGD 層1 重設計成 onDamageTaken/onReflectSuccess |
| o00G（MonsoonBolt 6.0）**逐敵一具、生成在敵人腳下** | GGD e002.r 現行是 anchor:self **一具**——保真度缺口（機制上 `spawnModelFx shape:"circle" path:"static"` per-target 待驗證） |
| o00G 下 `chainlightning` 指令（A0CS） | 每個敵人再吃一發鏈鎖閃電（100/200/300、跳 6/12/16、每跳 −5%）→ GGD `chainLightning` kind 可逐格翻譯 |
| ExcaliburMAX 前置 | EX_Mode ∧ **在 Avalon 窗內**受傷 ∧ 傷害源是敵方英雄 ∧ **魔力≥70%** —— 魔力閘可用 hook `condition:{kind:"stat",stat:"mana",mode:"percent",op:">=",value:0.7}` 表達 ✅ |
| `EXCaTakenDamage = 事件傷害×0.60` | 每刀傷害＝受到傷害的 60%（×7 刀＝420%）；GGD 層1 改為 7×反彈傷害 ×7 刀 |
| 每刀 `SetUnitPositionLocFacingLocBJ(target, +10u)` ＋ saber 瞬移到 target | **拖行連段**：目標每刀被推 10u、Saber 貼身瞬移 —— M1 同型 |
| `SetUnitTimeScalePercent(saber,600)` | 攻擊動畫 6 倍速；殘影 h02G 同 600%＋vertex(80,10,10,50%) 暗紅半透明 |
| `TriggerSleepAction(GetRandomReal(0.05,0.30))` | **隨機刀距** —— M10（GGD steps 是定值；sim 禁 Math.random，需 seeded 亂數葉） |
| 收尾 h00S（ReviveHuman 0.2×350%＝0.70）＋h008（FragDriller 2.0×400%＝8.0、timescale 15%） | ⚠️ `SetUnitScalePercent` 是「編輯器 scale 的百分比」——**有效 scale 要乘 unit 的編輯器 scale**，⛔ 不要把 350/400 直接抄成 3.5/4.0 |
| 掃蕩 1800 固定傷害@前方 350u 圓心 900 半徑 | GGD 層1 改為 `damageLine`（(現存魔力+AP)×7，length 14 width 2）——形狀從「圓」改「直線」，owner 裁決 |
| `PlaySoundOnUnitBJ`（DefendCaster 每刀／FlameStrikeWave／SuccubusYesAttack2） | 逐擊音效動詞 —— M6 |
| TRIGSTR_9046「8Hit」 | 收尾文字＝第 8 hit（7 連斬＋劍） |

### 3-6 演出時間軸（EX 鏈；t=0＝在 Avalon 窗內被敵方英雄打中且魔力≥70%）

| t | 發生 |
|---|---|
| （前置）Avalon 施放 | `fx.prim.holy.nova-lg`（GGD）；窗開 2/3/4s；窗內敵方英雄技能指向 Saber ⇒ avalonStart：「永恆的理想鄉」文字＋900 範圍逐敵 WildSaber 傷害＋每敵腳下 MonsoonBolt 柱（6.0，活 2s）＋鏈鎖閃電；3s 後清柱 |
| 0 | ExcaliburMAX：雙方 pause＋無敵；A0J7 球體閃一下；EXCaTakenDamage＝事件傷害×0.6 |
| 0 → ≈0.35–2.1（7 刀，隨機 0.05–0.30/刀） | 每刀：目標被拖 10u＋death 定格；Saber 瞬移貼身、attack 600%；暗紅殘影 h02G 生成揮刀；DarkPortal@雙 weapon；StampedeMissileDeath@目標chest；DefendCaster 音；u018 傳送門 dummy；**傷害 60%×1**；「iHit」（隨機方向）＋「傷害!」直升 |
| 7 刀後 | timescale 100%＋attack rare；FlameStrikeWave 音；ResurrectTarget＋AIviTarget@weapon；清殘影 |
| +0.10 | SuccubusYesAttack2 音；HolyAwakening@weapon＋Magical_Sword@handright（聖光＋魔法劍舉起）；timescale 30% 慢動作 |
| +0.40 | 「8Hit」；**勝利劍光柱 h00S**（前方 70u，有效 0.70）＋**FragDriller h008**（目標位置，有效 8.0、15% 凍格）＋HCancelDeath＋NEDeathSmall@目標腳下；**前方 350u 圓心 900 範圍掃蕩 1800**（每人 SteamTankImpact＋NeutralBuildingExplosion） |
| +0.60 | 全解除（無敵/pause/timescale）；1600 矩形內玩家鏡頭噪動(20) |
| +1.10 | 清鏡頭噪動 |
| +5.10 | 清全部 dummy；觸發 re-enable |

### 3-7 翻譯對照表

| JASS | GGD | 狀態 |
|---|---|---|
| Avalon 反射窗（L+1 秒） | `applyBuff duration`（現行固定 2.0——L+1 需 perRank duration ✅ schema 支援 zRankScalar） | ✅ |
| 「敵方技能指向我」事件 | hook 表無 `onTargetedBySpell` | ⛔ **MISSING M8**（層1 已改 onDamageTaken；1:1 才需要） |
| 反射傷害 WildSaber 公式 | `damage`＋ratios（層1 改 3/5/7×incomingPct） | ✅ 層1 取代 |
| **逐敵一具 MonsoonBolt 柱@敵人腳下** | `spawnModelFx shape:"circle"`（per-target static）？ | ⚠️ 需驗證；現行內容是 anchor:self 單具（保真度缺口） |
| 鏈鎖閃電 A0CS | `chainLightning`（jumps/decay/jumpRange 逐格對應：6-16 跳、decay 0.95） | ✅ 機制在（現行未接） |
| 魔力≥70% 前置 | hook `condition {kind:"stat", stat:"mana", mode:"percent"}` | ✅ |
| 7 連斬（60% 事件傷害/刀、隨機刀距） | ex：`delayed count:7 interval:0.12`（定距）；`comboStrikes` 亦可 | ✅ 已出貨（⚠️ 隨機刀距 M10 缺） |
| Saber/目標互相瞬移拖行 | — | ⛔ **M1** |
| 殘影 h02G（600% 動畫、暗紅 50%） | `spawnModelFx imported.herosaber path:"static" clip:"attack" clipTimeScale:6 tint alpha` | ✅ **可完整表達**（clip＋clipTimeScale＋tint＋alpha 都在 schema） |
| 勝利劍 h00S（0.70 光柱） | `spawnModelFx w3x.stock.revivehuman path:"static" scale:0.7` | ✅ 資產在庫 |
| FragDriller h008（8.0、15% 凍格） | `spawnModelFx w3x.stock.fragdriller scale:8 clipTimeScale:0.15`（schema 註解逐字點名「h008 的凍播＝0.15」） | ✅ |
| u018 傳送門／StampedeMissileDeath／SteamTankImpact／NeutralBuildingExplosion／NEDeathSmall／HCancelDeath／AIviTarget／DarkPortalTarget | — | ⚠️ 資產缺口（vfx key 不在庫）；HolyAwakening＝`fx.w3x.particle.holyawakening.p00–05` ✅、Magical_Sword＝`fx.w3x.orb.magical-sword.p00` ✅ |
| 逐擊音效（DefendCaster…） | — | ⛔ **M6** |
| 收尾掃蕩（圓 900@前方 350） | 層1 改 `damageLine length:14 width:2`＋resourcePct（已出貨） | ✅ 層1 取代 |
| 鏡頭噪動（區域、強度 20） | `screenShake` | ⚠️ 部分（無範圍） |

---

## ④ MISSING 機制總表（去重後 10 個；按擋住的支數排序建議）

| # | 缺的機制 | 一句話 | 這三支裡誰要 | 建議形狀 |
|---|---|---|---|---|
| M1 | **連段逐擊瞬移/拖行**（施法者貼身瞬移＋受害者被拖） | comboStrikes 的 per-strike 位移：把施法者（或目標）在每一段瞬移到「目標周圍 距離 d、角度 +Δ/段」 | ①（70u/+270°）③（10u 拖行＋貼身） | `comboStrikes.strikeReposition:{who, dist, angleStepDeg}`（tpl-lock-combo 文件已自認缺） |
| M2 | **英雄本體染色/半透明**（時限） | SetUnitVertexColorBJ on 本尊：狀態期間 tint+alpha | ①（紅染 50%） | status-effect@1 加 `tint/alpha` 欄；render 走既有 applyModelTint |
| M3 | **模型 fx 高度曲線** | SetUnitFlyHeightBJ：升空/急墜（rate 控制） | ①（500↔0、1000 急墜） | `spawnModelFx.heightKeys:[{h,rate}]` 或 path:"arc" |
| M4 | **受害者動畫控制**（強制剪輯＋timescale 定格） | 對被打者播 death 並凍 10% | ①③ | `applyStatus.forceClip/clipTimeScale`（渲染側） |
| M5 | 地形波紋 | TerrainDeformationRipple | ①②③ | ⛔ 建議豁免（screenShake 近似；體素地板無變形機制） |
| M6 | **逐擊音效動詞** | PlaySoundOnUnitBJ 在班表任意時點 | ③（每刀＋收尾兩段） | 效果詞彙加 `playSound{soundKey}` 或 comboStrikes.perStrikeSoundKey |
| M7 | floatingText **方向速度** | SetTextTagVelocityBJ 沿任意角度飛 | ①③（喊招沿面向、Hit 沿斬角） | `floatingText.velocityAngle/"facing"/"random"` |
| M8 | **onTargetedBySpell hook** | 敵方技能指向我＝事件 | ③ Avalon 1:1（層1 已改 onDamageTaken——僅在 owner 要求 1:1 時做） | hook 事件＋sim 發射點 |
| M10 | **隨機段距**（seeded） | TriggerSleepAction(Random(0.05,0.30)) | ③ 七連斬 | `comboStrikes.intervalJitter`（用 sim 的 seeded RNG，⛔ Math.random 禁令） |
| M11 | **投射物拖尾班表** | 每 tick 在路過點 spawn 特效 | ②（HCancelDeath＋VolcanoDeath 拖尾） | `spawnModelFx.trailVfxId+trailIntervalSec`（或資產層 emitter 蓋掉） |

已存在、⛔ 不要重做的：per-hit 傷害節奏（comboStrikes＋combo-strikes.json 共用表）、殘影/凍格（clip＋clipTimeScale＋tint＋alpha）、魔力% hook 條件（condition stat/percent）、鏈鎖閃電（chainLightning）、直線衝擊波＋落點爆炸（tpl-line-blast）、定點柱（tpl-locust-strike）、建築半額、反射鉤（onDamageTaken/onReflectSuccess＋incomingPct/negateOriginal/resourcePct）。

資產缺口（非機制，開票給美術/匯入線）：HumanBloodPeasant、Phoenix_Missile、MirrorImageCaster、NeutralBuildingExplosion、SteamTankImpact、StampedeMissileDeath、DarkPortalTarget、NEDeathSmall、HCancelDeath、VolcanoDeath、FlameStrikeTarget、AIviTarget（12 顆 w3x stock 特效無 GGD vfx/model key；ResurrectTarget 有 `fx.fam.resurrect.*` 家族可近似）。

## ⑤ 單位換算備忘

- w3x → GGD 距離分母 ≈ **54.5 w3x-u／GGD-u**（實證三組：touch 200↔3.67、speed 1500↔27.5、爆半徑 450↔8≈56）；cast_range 900↔12（tier 表另有裁量）。
- `SetUnitScalePercent(a,b,c)` 是**編輯器 scale 的百分比**（h00S 0.2×350%＝0.70、h008 2.0×400%＝8.0）；WC3 Z-up，三軸等向時直接乘。
- `TriggerSleepAction` ≤0 由引擎最小延遲撐；等級一律從 1 起算（`GetUnitAbilityLevelSwapped`）。
- 詠唱五句在 **SPELL_CAST**（抬手），主體在 **SPELL_EFFECT**（施法點）——編輯器要能分這兩個時機（GGD 以 castTimeSec 吸收）。
