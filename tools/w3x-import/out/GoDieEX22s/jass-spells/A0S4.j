// rawcode: A0S4
// nameZh: 74-01 獄門
// w3a base: AOws  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 120, "2": 155, "3": 190, "4": 225}
// area: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Hell_Gate

// === family Hell_Gate (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Hell_Gate_Conditions (family, line 48646) ---
function Trig_Hell_Gate_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0S4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func010Func001Func001C (family, line 48653) ---
function Trig_Hell_Gate_Func010Func001Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_SephUnit)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func010Func001C (family, line 48663) ---
function Trig_Hell_Gate_Func010Func001C takes nothing returns boolean
    if ( not Trig_Hell_Gate_Func010Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func010A (family, line 48670) ---
function Trig_Hell_Gate_Func010A takes nothing returns nothing
    if ( Trig_Hell_Gate_Func010Func001C() ) then
        call UnitDamageTargetBJ( udg_SephUnit, GetEnumUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_SephUnit) * 100 )) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Human\\HumanBlood\\HeroBloodElfBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "BloodBreathStream.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_Hell_Gate_Func017Func001C (family, line 48683) ---
function Trig_Hell_Gate_Func017Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_SephUnit))] == true ) ) then
        return false
    endif
    if ( not ( udg_SupernovaStart == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func017Func003A (family, line 48693) ---
function Trig_Hell_Gate_Func017Func003A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 30.00 )
endfunction

// --- Trig_Hell_Gate_Func017Func009A (family, line 48697) ---
function Trig_Hell_Gate_Func017Func009A takes nothing returns nothing
    call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- Trig_Hell_Gate_Func017Func013A (family, line 48704) ---
function Trig_Hell_Gate_Func017Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Hell_Gate_Func017C (family, line 48709) ---
function Trig_Hell_Gate_Func017C takes nothing returns boolean
    if ( not Trig_Hell_Gate_Func017Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Actions (family, line 48716) ---
function Trig_Hell_Gate_Actions takes nothing returns nothing
    set udg_SephUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A0FZ', udg_SephUnit )
    call SetUnitFlyHeightBJ( udg_SephUnit, 1000.00, 2000.00 )
    call SetUnitInvulnerable( udg_SephUnit, true )
    call PauseUnitBJ( true, udg_SephUnit )
    call TriggerSleepAction( 0.30 )
    call SetUnitInvulnerable( udg_SephUnit, false )
    call SetUnitFlyHeightBJ( udg_SephUnit, 0.00, 2500.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(370.00, GetUnitLoc(udg_SephUnit)), function Trig_Hell_Gate_Func010A )
    call UnitRemoveAbilityBJ( 'A0FZ', udg_SephUnit )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PauseUnitBJ( false, udg_SephUnit )
    if ( Trig_Hell_Gate_Func017C() ) then
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_SephUnit), 1600.00, 1600.00)), function Trig_Hell_Gate_Func017Func003A )
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_SephUnit), GetUnitLoc(udg_SephUnit), GetUnitLoc(udg_SephUnit) )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0SW', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0SW', GetLastCreatedUnit(), 1 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", GetUnitLoc(udg_SephUnit) )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(udg_SephUnit)), function Trig_Hell_Gate_Func017Func009A )
        call TriggerSleepAction( 2.00 )
        set bj_forLoopBIndex = 1
        set bj_forLoopBIndexEnd = 12
        loop
            exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
            call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
            set bj_forLoopBIndex = bj_forLoopBIndex + 1
        endloop
        call TriggerSleepAction( 5.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SephUnit), 'hfoo'), function Trig_Hell_Gate_Func017Func013A )
    else
        call DoNothing(  )
    endif
    set udg_SupernovaStart = false
endfunction

// --- InitTrig_Hell_Gate (family, line 48758) ---
function InitTrig_Hell_Gate takes nothing returns nothing
    set gg_trg_Hell_Gate = CreateTrigger(  )
    call DisableTrigger( gg_trg_Hell_Gate )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Hell_Gate, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Hell_Gate, Condition( function Trig_Hell_Gate_Conditions ) )
    call TriggerAddAction( gg_trg_Hell_Gate, function Trig_Hell_Gate_Actions )
endfunction
