// unit rawcode: H01O
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Bleach_Moon, Bleach_Moon_Effect

// === family Bleach_Moon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Moon_Conditions (family, line 37492) ---
function Trig_Bleach_Moon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0LL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Func007C (family, line 37499) ---
function Trig_Bleach_Moon_Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01O' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Actions (family, line 37506) ---
function Trig_Bleach_Moon_Actions takes nothing returns nothing
    set udg_BleachUnit = GetTriggerUnit()
    set udg_BleachCastPoint = GetSpellTargetLoc()
    set udg_BleachTrigPoint = GetUnitLoc(udg_BleachUnit)
    set udg_BleachFaceAngle = AngleBetweenPoints(udg_BleachTrigPoint, udg_BleachCastPoint)
    set udg_BleachMoonDistan = 1000
    if ( Trig_Bleach_Moon_Func007C() ) then
        set udg_BleachMoonDam = ( ( 550.00 + I2R(( GetUnitAbilityLevelSwapped('A0LL', udg_BleachUnit) * 150 )) ) + 0.00 )
        call CreateNUnitsAtLoc( 1, 'o01R', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachUnit), GetUnitFacing(udg_BleachUnit) )
        set udg_BleachCreateUnit = GetLastCreatedUnit()
        call SetUnitPathing( udg_BleachCreateUnit, false )
    else
        set udg_BleachMoonDam = ( ( 300.00 + I2R(( GetUnitAbilityLevelSwapped('A0LL', udg_BleachUnit) * 150 )) ) + 0.00 )
        call CreateNUnitsAtLoc( 1, 'o01Q', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachUnit), GetUnitFacing(udg_BleachUnit) )
        set udg_BleachCreateUnit = GetLastCreatedUnit()
        call SetUnitPathing( udg_BleachCreateUnit, false )
    endif
    call EnableTrigger( gg_trg_Bleach_Moon_Effect )
endfunction

// --- InitTrig_Bleach_Moon (family, line 37527) ---
function InitTrig_Bleach_Moon takes nothing returns nothing
    set gg_trg_Bleach_Moon = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Moon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Moon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Moon, Condition( function Trig_Bleach_Moon_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Moon, function Trig_Bleach_Moon_Actions )
endfunction

// === family Bleach_Moon_Effect (armed) events=none ===

// --- Trig_Bleach_Moon_Effect_Func001Func007A (family, line 37538) ---
function Trig_Bleach_Moon_Effect_Func001Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Bleach_Moon_Effect_Func001Func008A (family, line 37543) ---
function Trig_Bleach_Moon_Effect_Func001Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Bleach_Moon_Effect_Func001Func009A (family, line 37548) ---
function Trig_Bleach_Moon_Effect_Func001Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Bleach_Moon_Effect_Func001Func016Func001C (family, line 37553) ---
function Trig_Bleach_Moon_Effect_Func001Func016Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_BleachDamUnit) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_BleachCreateUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Effect_Func001Func016A (family, line 37569) ---
function Trig_Bleach_Moon_Effect_Func001Func016A takes nothing returns nothing
    if ( Trig_Bleach_Moon_Effect_Func001Func016Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_BleachDamUnit )
        call UnitDamageTargetBJ( udg_BleachUnit, GetEnumUnit(), udg_BleachMoonDam, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "hand", GetEnumUnit(), "BloodBreathStream.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Bleach_Moon_Effect_Func001Func017Func001C (family, line 37580) ---
function Trig_Bleach_Moon_Effect_Func001Func017Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Effect_Func001Func017A (family, line 37587) ---
function Trig_Bleach_Moon_Effect_Func001Func017A takes nothing returns nothing
    if ( Trig_Bleach_Moon_Effect_Func001Func017Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Bleach_Moon_Effect_Func001C (family, line 37595) ---
function Trig_Bleach_Moon_Effect_Func001C takes nothing returns boolean
    if ( not ( udg_BleachMoonDistan >= 25 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Effect_Actions (family, line 37602) ---
function Trig_Bleach_Moon_Effect_Actions takes nothing returns nothing
    if ( Trig_Bleach_Moon_Effect_Func001C() ) then
        call AddSpecialEffectLocBJ( udg_BleachTrigPoint, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_BleachTrigPoint = PolarProjectionBJ(udg_BleachTrigPoint, 50.00, udg_BleachFaceAngle)
        call SetUnitPositionLocFacingBJ( udg_BleachCreateUnit, udg_BleachTrigPoint, udg_BleachFaceAngle )
        set udg_BleachMoonDistan = ( udg_BleachMoonDistan - 50 )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(300.00, GetUnitLoc(udg_BleachCreateUnit)), function Trig_Bleach_Moon_Effect_Func001Func016A )
        call EnumDestructablesInCircleBJ( 330.00, udg_BleachTrigPoint, function Trig_Bleach_Moon_Effect_Func001Func017A )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        call GroupClear( udg_BleachDamUnit )
        call CreateNUnitsAtLoc( 1, 'u00U', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachCreateUnit), GetUnitFacing(udg_BleachUnit) )
        call TriggerSleepAction( 0.30 )
        call KillUnit( udg_BleachCreateUnit )
        call RemoveUnit( udg_BleachCreateUnit )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BleachUnit), 'o01Q'), function Trig_Bleach_Moon_Effect_Func001Func007A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BleachUnit), 'o01R'), function Trig_Bleach_Moon_Effect_Func001Func008A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BleachUnit), 'u00U'), function Trig_Bleach_Moon_Effect_Func001Func009A )
    endif
endfunction

// --- InitTrig_Bleach_Moon_Effect (family, line 37625) ---
function InitTrig_Bleach_Moon_Effect takes nothing returns nothing
    set gg_trg_Bleach_Moon_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Moon_Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Bleach_Moon_Effect, 0.03 )
    call TriggerAddAction( gg_trg_Bleach_Moon_Effect, function Trig_Bleach_Moon_Effect_Actions )
endfunction
