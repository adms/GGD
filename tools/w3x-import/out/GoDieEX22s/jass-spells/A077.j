// rawcode: A077
// nameZh: 01-04 超究武神霸斬
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 170, "2": 260, "3": 350}
// range: {"1": 450.0, "2": 450.0, "3": 450.0}
// duration: {"1": 13.0, "2": 13.0, "3": 13.0}
// hero_duration: {"1": 13.0, "2": 13.0, "3": 13.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SuperFF7

// === family SuperFF7 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SuperFF7_Func001C (family, line 33759) ---
function Trig_SuperFF7_Func001C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A077' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A0B1' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_SuperFF7_Conditions (family, line 33769) ---
function Trig_SuperFF7_Conditions takes nothing returns boolean
    if ( not Trig_SuperFF7_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_SuperFF7_Func022C (family, line 33776) ---
function Trig_SuperFF7_Func022C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SuperFF7_Func023Func041Func039Func001A (family, line 33783) ---
function Trig_SuperFF7_Func023Func041Func039Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_SuperFF7_Func023Func041C (family, line 33787) ---
function Trig_SuperFF7_Func023Func041C takes nothing returns boolean
    if ( not ( udg_SupI >= 7 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SuperFF7_Func033A (family, line 33794) ---
function Trig_SuperFF7_Func033A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SuperFF7_Actions (family, line 33799) ---
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
            // xxxxxxxxx
            call TerrainDeformationRippleBJ( 5.00, false, GetUnitLoc(GetTriggerUnit()), 200.00, 200.00, 64, 1, 200.00 )
            call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
            // xxxxxxxxx
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

// --- InitTrig_SuperFF7 (family, line 33944) ---
function InitTrig_SuperFF7 takes nothing returns nothing
    set gg_trg_SuperFF7 = CreateTrigger(  )
    call DisableTrigger( gg_trg_SuperFF7 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SuperFF7, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SuperFF7, Condition( function Trig_SuperFF7_Conditions ) )
    call TriggerAddAction( gg_trg_SuperFF7, function Trig_SuperFF7_Actions )
endfunction
