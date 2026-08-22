// rawcode: A0G7
// nameZh: 01-02 破光擊
// w3a base: Awfb  levels: 3
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 35.0}
// mana: {"1": 110, "2": 165, "3": 220, "4": 350}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BreakLight

// === family BreakLight (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BreakLight_Conditions (family, line 33511) ---
function Trig_BreakLight_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0G7' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BreakLight_Func006C (family, line 33518) ---
function Trig_BreakLight_Func006C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_FF7_Light_P1, udg_FF7_Light_P2) >= 400.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BreakLight_Func010Func001C (family, line 33525) ---
function Trig_BreakLight_Func010Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_FF7_CloudUnit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BreakLight_Func010A (family, line 33538) ---
function Trig_BreakLight_Func010A takes nothing returns nothing
    if ( Trig_BreakLight_Func010Func001C() ) then
        set udg_FF7_Light_Count = ( udg_FF7_Light_Count + 1 )
        call GroupAddUnitSimple( GetEnumUnit(), udg_FF7_Light_Group )
    else
    endif
endfunction

// --- Trig_BreakLight_Func011Func004Func002C (family, line 33546) ---
function Trig_BreakLight_Func011Func004Func002C takes nothing returns boolean
    if ( not ( GetEnumUnit() == udg_FF7_Light_Target ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BreakLight_Func011Func004A (family, line 33553) ---
function Trig_BreakLight_Func011Func004A takes nothing returns nothing
    call UnitDamageTargetBJ( udg_FF7_CloudUnit, GetEnumUnit(), ( ( 350.00 + ( 150.00 * I2R(GetUnitAbilityLevelSwapped('A0G7', udg_FF7_CloudUnit)) ) ) / udg_FF7_Light_Count ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    if ( Trig_BreakLight_Func011Func004Func002C() ) then
    else
        call SetUnitFacingToFaceUnitTimed( udg_FF7_Light_Unit, GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( udg_FF7_Light_Unit, "firebolt", GetEnumUnit() )
    endif
endfunction

// --- Trig_BreakLight_Func011C (family, line 33562) ---
function Trig_BreakLight_Func011C takes nothing returns boolean
    if ( not ( udg_FF7_Light_Count >= 2.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BreakLight_Actions (family, line 33569) ---
function Trig_BreakLight_Actions takes nothing returns nothing
    set udg_FF7_Light_Count = 0.00
    set udg_FF7_CloudUnit = GetTriggerUnit()
    set udg_FF7_Light_Target = GetSpellTargetUnit()
    set udg_FF7_Light_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_FF7_Light_P2 = GetUnitLoc(GetSpellTargetUnit())
    if ( Trig_BreakLight_Func006C() ) then
        call TriggerSleepAction( 0.50 )
    else
        call TriggerSleepAction( 0.45 )
    endif
    call RemoveLocation( udg_FF7_Light_P2 )
    call RemoveLocation( udg_FF7_Light_P1 )
    set udg_FF7_Light_P2 = GetUnitLoc(udg_FF7_Light_Target)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(480.00, udg_FF7_Light_P2), function Trig_BreakLight_Func010A )
    if ( Trig_BreakLight_Func011C() ) then
        call CreateNUnitsAtLoc( 1, 'u00F', GetOwningPlayer(udg_FF7_CloudUnit), udg_FF7_Light_P2, bj_UNIT_FACING )
        set udg_FF7_Light_Unit = GetLastCreatedUnit()
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call ForGroupBJ( udg_FF7_Light_Group, function Trig_BreakLight_Func011Func004A )
    else
    endif
    call RemoveLocation( udg_FF7_Light_P2 )
    call KillUnit( udg_FF7_Light_Unit )
    call RemoveUnit( udg_FF7_Light_Unit )
endfunction

// --- InitTrig_BreakLight (family, line 33597) ---
function InitTrig_BreakLight takes nothing returns nothing
    set gg_trg_BreakLight = CreateTrigger(  )
    call DisableTrigger( gg_trg_BreakLight )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BreakLight, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BreakLight, Condition( function Trig_BreakLight_Conditions ) )
    call TriggerAddAction( gg_trg_BreakLight, function Trig_BreakLight_Actions )
endfunction
