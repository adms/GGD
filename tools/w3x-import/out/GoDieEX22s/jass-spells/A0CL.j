// rawcode: A0CL
// nameZh: 22-00 嗚鎖打!
// cooldown: {"1": 40.0}
// mana: {"1": 150}
// duration: {"1": 0.5}
// hero_duration: {"1": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: KillPower

// === family KillPower (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KillPower_Conditions (family, line 33239) ---
function Trig_KillPower_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KillPower_Func008Func002A (family, line 33246) ---
function Trig_KillPower_Func008Func002A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KillPower_Func008Func003A (family, line 33251) ---
function Trig_KillPower_Func008Func003A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KillPower_Func008Func004A (family, line 33256) ---
function Trig_KillPower_Func008Func004A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KillPower_Func008C (family, line 33261) ---
function Trig_KillPower_Func008C takes nothing returns boolean
    if ( not ( udg_IsDay == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KillPower_Actions (family, line 33268) ---
function Trig_KillPower_Actions takes nothing returns nothing
    set udg_WooSoDaUnit = GetTriggerUnit()
    set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'oshm', GetOwningPlayer(GetTriggerUnit()), udg_Immediately_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "bloodlust", GetTriggerUnit() )
    call RemoveLocation( udg_Immediately_P1 )
    if ( Trig_KillPower_Func008C() ) then
        call TriggerSleepAction( 3.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_WooSoDaUnit), 'oshm'), function Trig_KillPower_Func008Func002A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_WooSoDaUnit), 'oshm'), function Trig_KillPower_Func008Func003A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_WooSoDaUnit), 'oshm'), function Trig_KillPower_Func008Func004A )
    else
    endif
endfunction

// --- InitTrig_KillPower (family, line 33286) ---
function InitTrig_KillPower takes nothing returns nothing
    set gg_trg_KillPower = CreateTrigger(  )
    call DisableTrigger( gg_trg_KillPower )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KillPower, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KillPower, Condition( function Trig_KillPower_Conditions ) )
    call TriggerAddAction( gg_trg_KillPower, function Trig_KillPower_Actions )
endfunction
