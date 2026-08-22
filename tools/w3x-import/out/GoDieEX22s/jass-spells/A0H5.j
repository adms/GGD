// rawcode: A0H5
// nameZh: 19-02 迴切
// w3a base: ANss  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 50, "2": 70, "3": 90}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FitCutExecute

// === family FitCutExecute (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FitCutExecute_Func001C (family, line 27420) ---
function Trig_FitCutExecute_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0H5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FitCutExecute_Conditions (family, line 27427) ---
function Trig_FitCutExecute_Conditions takes nothing returns boolean
    if ( not Trig_FitCutExecute_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_FitCutExecute_Func016A (family, line 27434) ---
function Trig_FitCutExecute_Func016A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_FitCutExecute_Actions (family, line 27439) ---
function Trig_FitCutExecute_Actions takes nothing returns nothing
    set udg_fitCutUnit = GetTriggerUnit()
    set udg_fitCutTaget = GetTriggerUnit()
    set udg_fitCutPoint = GetUnitLoc(GetTriggerUnit())
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o012', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0H6', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0H6', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call UnitRemoveAbilityBJ( 'A09P', GetTriggerUnit() )
    set udg_fitCutYes = true
    call TriggerSleepAction( 1.00 )
    set udg_fitCutYes = false
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_fitCutTaget), 'o012'), function Trig_FitCutExecute_Func016A )
endfunction

// --- InitTrig_FitCutExecute (family, line 27458) ---
function InitTrig_FitCutExecute takes nothing returns nothing
    set gg_trg_FitCutExecute = CreateTrigger(  )
    call DisableTrigger( gg_trg_FitCutExecute )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FitCutExecute, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FitCutExecute, Condition( function Trig_FitCutExecute_Conditions ) )
    call TriggerAddAction( gg_trg_FitCutExecute, function Trig_FitCutExecute_Actions )
endfunction
