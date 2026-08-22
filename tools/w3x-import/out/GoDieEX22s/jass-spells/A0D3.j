// rawcode: A0D3
// nameZh: 15-01 風精召喚
// w3a base: ANcl  levels: 4
// cooldown: {"1": 40.0, "2": 40.0, "3": 40.0, "4": 40.0}
// mana: {"1": 75, "2": 125, "3": 175, "4": 225}
// range: {"1": 350.0, "2": 450.0, "3": 550.0, "4": 650.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WindWizard

// === family WindWizard (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WindWizard_Conditions (family, line 34774) ---
function Trig_WindWizard_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0D3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WindWizard_Actions (family, line 34781) ---
function Trig_WindWizard_Actions takes nothing returns nothing
    set udg_MT_WWP = GetUnitLoc(GetTriggerUnit())
    set udg_MT_WWLv = GetUnitAbilityLevelSwapped('A0D3', GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_MT_WWP, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 5 , 1)
    call RemoveLocation(udg_MT_WWP)
    set udg_MT_WWP = GetSpellTargetLoc()
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A056', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A056', GetLastCreatedUnit(), udg_MT_WWLv )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "stampede", udg_MT_WWP )
    call RemoveLocation(udg_MT_WWP)
endfunction

// --- InitTrig_WindWizard (family, line 34796) ---
function InitTrig_WindWizard takes nothing returns nothing
    set gg_trg_WindWizard = CreateTrigger(  )
    call DisableTrigger( gg_trg_WindWizard )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WindWizard, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WindWizard, Condition( function Trig_WindWizard_Conditions ) )
    call TriggerAddAction( gg_trg_WindWizard, function Trig_WindWizard_Actions )
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
