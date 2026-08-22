// rawcode: A02D
// nameZh: 23-00 護御屏障
// cooldown: {"1": 90.0}
// mana: {"1": 150}
// range: {"1": 350.0}
// duration: {"1": 4.0}
// hero_duration: {"1": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Gas_to_Stop_Tower

// === family Gas_to_Stop_Tower (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Gas_to_Stop_Tower_Conditions (family, line 31136) ---
function Trig_Gas_to_Stop_Tower_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A02D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Gas_to_Stop_Tower_Func010A (family, line 31143) ---
function Trig_Gas_to_Stop_Tower_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Gas_to_Stop_Tower_Actions (family, line 31148) ---
function Trig_Gas_to_Stop_Tower_Actions takes nothing returns nothing
    set udg_FateUnit = GetTriggerUnit()
    set udg_P0 = GetSpellTargetLoc()
    call TriggerSleepAction( 0.01 )
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(udg_FateUnit), udg_P0, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'A0DW', GetLastCreatedUnit() )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "cloudoffog", udg_P0 )
    call RemoveLocation(udg_P0)
    call RemoveUnitSP( GetLastCreatedUnit() , 20 , 2 )
    call TriggerSleepAction( 10.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'ogru'), function Trig_Gas_to_Stop_Tower_Func010A )
endfunction

// --- InitTrig_Gas_to_Stop_Tower (family, line 31162) ---
function InitTrig_Gas_to_Stop_Tower takes nothing returns nothing
    set gg_trg_Gas_to_Stop_Tower = CreateTrigger(  )
    call DisableTrigger( gg_trg_Gas_to_Stop_Tower )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Gas_to_Stop_Tower, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Gas_to_Stop_Tower, Condition( function Trig_Gas_to_Stop_Tower_Conditions ) )
    call TriggerAddAction( gg_trg_Gas_to_Stop_Tower, function Trig_Gas_to_Stop_Tower_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction
