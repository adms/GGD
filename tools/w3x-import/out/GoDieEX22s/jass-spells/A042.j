// rawcode: A042
// nameZh: 16-02 阿彌陀流真空佛陀斬
// w3a base: AHtb  levels: 4
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0}
// mana: {"1": 40, "2": 60, "3": 80, "4": 100}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 1.2999999523162842, "2": 1.2999999523162842, "3": 1.2999999523162842, "4": 1.2999999523162842}
// hero_duration: {"1": 1.2999999523162842, "2": 1.2999999523162842, "3": 1.2999999523162842, "4": 1.2999999523162842}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GDD

// === family GDD (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GDD_Conditions (family, line 31495) ---
function Trig_GDD_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A042' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GDD_Func009001002 (family, line 31502) ---
function Trig_GDD_Func009001002 takes nothing returns boolean
    return ( GetUnitTypeId(GetFilterUnit()) == 'h00J' )
endfunction

// --- Trig_GDD_Func009002 (family, line 31506) ---
function Trig_GDD_Func009002 takes nothing returns nothing
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GDD_Func011001002 (family, line 31510) ---
function Trig_GDD_Func011001002 takes nothing returns boolean
    return ( GetUnitTypeId(GetFilterUnit()) == 'h00K' )
endfunction

// --- Trig_GDD_Func011002 (family, line 31514) ---
function Trig_GDD_Func011002 takes nothing returns nothing
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GDD_Actions (family, line 31518) ---
function Trig_GDD_Actions takes nothing returns nothing
    set udg_GosofKingAG2 = 0.00
    set udg_GosofKingCP2 = GetSpellTargetLoc()
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 8
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call CreateNUnitsAtLocFacingLocBJ( 1, 'h00J', GetOwningPlayer(GetTriggerUnit()), udg_GosofKingCP2, udg_GosofKingCP2 )
        call SetUnitPositionLoc( GetLastCreatedUnit(), PolarProjectionBJ(udg_GosofKingCP2, 400.00, udg_GosofKingAG2) )
        set udg_GosofKingAG2 = ( udg_GosofKingAG2 + 45.00 )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 8
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call CreateNUnitsAtLoc( 1, 'h00K', GetOwningPlayer(GetTriggerUnit()), udg_GosofKingCP2, bj_UNIT_FACING )
        call SetUnitPositionLoc( GetLastCreatedUnit(), PolarProjectionBJ(udg_GosofKingCP2, 400.00, udg_GosofKingAG2) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", udg_GosofKingCP2 )
        call UnitAddAbilityBJ( 'A0A0', GetLastCreatedUnit() )
        // Use this ability for edit damage and area effet.
        set udg_GosofKingAG2 = ( udg_GosofKingAG2 + 45.00 )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call PolledWait( 1.05 )
    call ForGroupBJ( GetUnitsOfPlayerMatching(GetOwningPlayer(GetTriggerUnit()), Condition(function Trig_GDD_Func009001002)), function Trig_GDD_Func009002 )
    call RemoveLocation( udg_GosofKingCP2)
    call ForGroupBJ( GetUnitsOfPlayerMatching(GetOwningPlayer(GetTriggerUnit()), Condition(function Trig_GDD_Func011001002)), function Trig_GDD_Func011002 )
endfunction

// --- InitTrig_GDD (family, line 31550) ---
function InitTrig_GDD takes nothing returns nothing
    set gg_trg_GDD = CreateTrigger(  )
    call DisableTrigger( gg_trg_GDD )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GDD, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GDD, Condition( function Trig_GDD_Conditions ) )
    call TriggerAddAction( gg_trg_GDD, function Trig_GDD_Actions )
endfunction
