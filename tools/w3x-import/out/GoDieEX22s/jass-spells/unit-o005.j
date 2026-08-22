// unit rawcode: o005
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Blood_Cast, Blood

// === family Blood_Cast (armed) events=none ===

// --- Trig_Blood_Cast_Conditions (family, line 38447) ---
function Trig_Blood_Cast_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnteringUnit()) == 'o005' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Cast_Actions (family, line 38454) ---
function Trig_Blood_Cast_Actions takes nothing returns nothing
    set udg_Blood_Unit = GetEnteringUnit()
    call EnableTrigger( gg_trg_Blood )
endfunction

// --- InitTrig_Blood_Cast (family, line 38460) ---
function InitTrig_Blood_Cast takes nothing returns nothing
    set gg_trg_Blood_Cast = CreateTrigger(  )
    call DisableTrigger( gg_trg_Blood_Cast )
    call TriggerRegisterEnterRectSimple( gg_trg_Blood_Cast, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Blood_Cast, Condition( function Trig_Blood_Cast_Conditions ) )
    call TriggerAddAction( gg_trg_Blood_Cast, function Trig_Blood_Cast_Actions )
endfunction

// === family Blood (passive) events=none ===

// --- Trig_Blood_Func001Func004Func001C (family, line 38471) ---
function Trig_Blood_Func001Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Blood_Unit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'earc' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'nska' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Func001Func004A (family, line 38490) ---
function Trig_Blood_Func001Func004A takes nothing returns nothing
    if ( Trig_Blood_Func001Func004Func001C() ) then
        call UnitDamageTargetBJ( udg_Blood_Unit, GetEnumUnit(), ( 75.00 * I2R(GetUnitAbilityLevelSwapped('A06C', udg_Rider)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))], ( GetUnitLifePercent(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))]) + 1.00 ) )
        set udg_BloodSpecialPoint = GetUnitLoc(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))])
        call AddSpecialEffectLocBJ( udg_BloodSpecialPoint, "Abilities\\Spells\\Undead\\ReplenishMana\\SpiritTouchTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_Blood_Func001C (family, line 38501) ---
function Trig_Blood_Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_Blood_Unit) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Actions (family, line 38508) ---
function Trig_Blood_Actions takes nothing returns nothing
    if ( Trig_Blood_Func001C() ) then
        set udg_Blood_Point = GetUnitLoc(udg_Blood_Unit)
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(580.00, udg_Blood_Point), function Trig_Blood_Func001Func004A )
        call RemoveLocation( udg_Blood_Point )
    else
        call DisableTrigger( GetTriggeringTrigger() )
    endif
endfunction

// --- InitTrig_Blood (family, line 38520) ---
function InitTrig_Blood takes nothing returns nothing
    set gg_trg_Blood = CreateTrigger(  )
    call DisableTrigger( gg_trg_Blood )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Blood, 1.00 )
    call TriggerAddAction( gg_trg_Blood, function Trig_Blood_Actions )
endfunction
