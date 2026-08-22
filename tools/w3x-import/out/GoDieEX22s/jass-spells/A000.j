// rawcode: A000
// nameZh: 01-03 畫龍點睛
// w3a base: ANab  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 120, "2": 180, "3": 240, "4": 300}
// range: {"1": 200.0, "2": 200.0, "3": 200.0, "4": 200.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Toro, Toro_Rotation

// === family Toro (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Toro_Func006C (family, line 33325) ---
function Trig_Toro_Func006C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A000' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Toro_Conditions (family, line 33335) ---
function Trig_Toro_Conditions takes nothing returns boolean
    if ( not Trig_Toro_Func006C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Toro_Func005C (family, line 33342) ---
function Trig_Toro_Func005C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_ToroTraget, 'B03V') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Toro_Actions (family, line 33349) ---
function Trig_Toro_Actions takes nothing returns nothing
    set udg_FF7_CloudUnit = GetTriggerUnit()
    set udg_ToroTraget = GetSpellTargetUnit()
    set udg_ToroCount = 0
    call TriggerSleepAction( 0.05 )
    if ( Trig_Toro_Func005C() ) then
        call SetUnitTimeScalePercent( udg_FF7_CloudUnit, 1000.00 )
        call UnitAddAbilityBJ( 'A0FZ', udg_FF7_CloudUnit )
        call UnitAddAbilityBJ( 'A0FZ', udg_ToroTraget )
        call SetUnitInvulnerable( udg_FF7_CloudUnit, true )
        call SetUnitInvulnerable( udg_ToroTraget, true )
        call SetUnitFlyHeightBJ( udg_FF7_CloudUnit, 400.00, 600.00 )
        call SetUnitFlyHeightBJ( udg_ToroTraget, 400.00, 600.00 )
        call PauseUnitBJ( true, udg_FF7_CloudUnit )
        call PauseUnitBJ( true, udg_ToroTraget )
        call SetUnitAnimation( udg_FF7_CloudUnit, "spell" )
        call CreateNUnitsAtLoc( 1, 'e013', GetOwningPlayer(udg_FF7_CloudUnit), GetUnitLoc(udg_FF7_CloudUnit), bj_UNIT_FACING )
        call EnableTrigger( gg_trg_Toro_Rotation )
    else
    endif
endfunction

// --- InitTrig_Toro (family, line 33372) ---
function InitTrig_Toro takes nothing returns nothing
    set gg_trg_Toro = CreateTrigger(  )
    call DisableTrigger( gg_trg_Toro )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Toro, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Toro, Condition( function Trig_Toro_Conditions ) )
    call TriggerAddAction( gg_trg_Toro, function Trig_Toro_Actions )
endfunction

// === family Toro_Rotation (passive) events=none ===

// --- Trig_Toro_Rotation_Func002Func010A (family, line 33453) ---
function Trig_Toro_Rotation_Func002Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Toro_Rotation_Func002C (family, line 33458) ---
function Trig_Toro_Rotation_Func002C takes nothing returns boolean
    if ( not ( udg_ToroCount <= 14 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Toro_Rotation_Actions (family, line 33465) ---
function Trig_Toro_Rotation_Actions takes nothing returns nothing
    set udg_ToroCount = ( udg_ToroCount + 1 )
    if ( Trig_Toro_Rotation_Func002C() ) then
        call SetUnitFacingTimed( udg_FF7_CloudUnit, ( GetUnitFacing(udg_FF7_CloudUnit) + 270.00 ), 0 )
        call SetUnitPositionLoc( udg_ToroTraget, PolarProjectionBJ(GetUnitLoc(udg_FF7_CloudUnit), 150.00, GetRandomDirectionDeg()) )
        call SetUnitAnimation( udg_FF7_CloudUnit, "spell" )
        call SetUnitAnimation( udg_ToroTraget, "death" )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitFacingToFaceUnitTimed( udg_FF7_CloudUnit, udg_ToroTraget, 0 )
        call SetUnitAnimationWithRarity( udg_FF7_CloudUnit, "attack slam", RARITY_RARE )
        call AddSpecialEffectTargetUnitBJ( "weapon", udg_FF7_CloudUnit, "Abilities\\Weapons\\WaterElementalMissile\\WaterElementalMissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_ToroTraget, "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_ToroTraget, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FF7_CloudUnit), 'e013'), function Trig_Toro_Rotation_Func002Func010A )
        call TriggerSleepAction( 0.01 )
        call SetUnitTimeScalePercent( udg_FF7_CloudUnit, 100.00 )
        call SetUnitFlyHeightBJ( udg_FF7_CloudUnit, 0.00, 2000.00 )
        call SetUnitFlyHeightBJ( udg_ToroTraget, 0.00, 2000.00 )
        call TriggerSleepAction( 0.10 )
        call PauseUnitBJ( false, udg_FF7_CloudUnit )
        call PauseUnitBJ( false, udg_ToroTraget )
        call UnitRemoveAbilityBJ( 'A0FZ', udg_FF7_CloudUnit )
        call UnitRemoveAbilityBJ( 'A0FZ', udg_ToroTraget )
        call SetUnitInvulnerable( udg_FF7_CloudUnit, false )
        call SetUnitInvulnerable( udg_ToroTraget, false )
        call UnitDamageTargetBJ( udg_FF7_CloudUnit, udg_ToroTraget, ( 300.00 + ( I2R(GetUnitAbilityLevelSwapped('A000', udg_FF7_CloudUnit)) * 150.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
endfunction

// --- InitTrig_Toro_Rotation (family, line 33499) ---
function InitTrig_Toro_Rotation takes nothing returns nothing
    set gg_trg_Toro_Rotation = CreateTrigger(  )
    call DisableTrigger( gg_trg_Toro_Rotation )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Toro_Rotation, 0.04 )
    call TriggerAddAction( gg_trg_Toro_Rotation, function Trig_Toro_Rotation_Actions )
endfunction
