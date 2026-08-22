// rawcode: A0A1
// nameZh: 16-01-04 式神喚來
// w3a base: ANsh  levels: 1
// cooldown: {"1": 60.0, "2": 0.0, "3": 0.0}
// mana: {"1": 160}
// area: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Soul_Shock

// === family Soul_Shock (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Soul_Shock_Conditions (family, line 31339) ---
function Trig_Soul_Shock_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Soul_Shock_Func007001002 (family, line 31346) ---
function Trig_Soul_Shock_Func007001002 takes nothing returns boolean
    return ( GetUnitTypeId(GetFilterUnit()) == 'h00J' )
endfunction

// --- Trig_Soul_Shock_Func007002 (family, line 31350) ---
function Trig_Soul_Shock_Func007002 takes nothing returns nothing
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Soul_Shock_Func009001002 (family, line 31354) ---
function Trig_Soul_Shock_Func009001002 takes nothing returns boolean
    return ( GetUnitTypeId(GetFilterUnit()) == 'h00K' )
endfunction

// --- Trig_Soul_Shock_Func009002 (family, line 31358) ---
function Trig_Soul_Shock_Func009002 takes nothing returns nothing
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Soul_Shock_Actions (family, line 31362) ---
function Trig_Soul_Shock_Actions takes nothing returns nothing
    set udg_Holy_Strike_Angs[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] = 0.00
    set udg_Holy_Strike_Point[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] = GetSpellTargetLoc()
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 4
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call CreateNUnitsAtLocFacingLocBJ( 1, 'h00J', GetOwningPlayer(GetTriggerUnit()), udg_Holy_Strike_Point[GetConvertedPlayerId(GetTriggerPlayer())], GetUnitLoc(GetSpellTargetUnit()) )
        call SetUnitPositionLoc( GetLastCreatedUnit(), PolarProjectionBJ(udg_Holy_Strike_Point[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))], 400.00, udg_Holy_Strike_Angs[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))]) )
        call IssuePointOrderLocBJ( GetEnumUnit(), "move", udg_Holy_Strike_Point[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] )
        set udg_Holy_Strike_Angs[GetConvertedPlayerId(GetTriggerPlayer())] = ( udg_Holy_Strike_Angs[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + 90.00 )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call TriggerSleepAction( 1.20 )
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 4
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call CreateNUnitsAtLoc( 1, 'h00K', GetOwningPlayer(GetTriggerUnit()), udg_Holy_Strike_Point[GetConvertedPlayerId(GetTriggerPlayer())], bj_UNIT_FACING )
        call SetUnitPositionLoc( GetLastCreatedUnit(), PolarProjectionBJ(udg_Holy_Strike_Point[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))], 400.00, udg_Holy_Strike_Angs[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))]) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", udg_Holy_Strike_Point[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] )
        call UnitAddAbilityBJ( 'A0A0', GetLastCreatedUnit() )
        // Use this ability for edit damage and area effet.
        set udg_Holy_Strike_Angs[GetConvertedPlayerId(GetTriggerPlayer())] = ( udg_Holy_Strike_Angs[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + 90.00 )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call PolledWait( 1.05 )
    call ForGroupBJ( GetUnitsOfPlayerMatching(GetOwningPlayer(GetTriggerUnit()), Condition(function Trig_Soul_Shock_Func007001002)), function Trig_Soul_Shock_Func007002 )
    call RemoveLocation( udg_Holy_Strike_Point[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))])
    call ForGroupBJ( GetUnitsOfPlayerMatching(GetOwningPlayer(GetTriggerUnit()), Condition(function Trig_Soul_Shock_Func009001002)), function Trig_Soul_Shock_Func009002 )
endfunction

// --- InitTrig_Soul_Shock (family, line 31395) ---
function InitTrig_Soul_Shock takes nothing returns nothing
    set gg_trg_Soul_Shock = CreateTrigger(  )
    call DisableTrigger( gg_trg_Soul_Shock )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Soul_Shock, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Soul_Shock, Condition( function Trig_Soul_Shock_Conditions ) )
    call TriggerAddAction( gg_trg_Soul_Shock, function Trig_Soul_Shock_Actions )
endfunction
