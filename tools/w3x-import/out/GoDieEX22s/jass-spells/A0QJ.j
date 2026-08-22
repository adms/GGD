// rawcode: A0QJ
// nameZh: 94-03 珍奶顏射
// w3a base: AIxk  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 100, "2": 175, "3": 250, "4": 325}
// duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// hero_duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MilkTea

// === family MilkTea (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MilkTea_Conditions (family, line 53958) ---
function Trig_MilkTea_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0QJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MilkTea_Actions (family, line 53965) ---
function Trig_MilkTea_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.10 )
    call UnitAddAbilityBJ( 'A0W2', udg_NM_Master )
    call TriggerSleepAction( 14.00 )
    call UnitRemoveAbilityBJ( 'A0W2', udg_NM_Master )
endfunction

// --- InitTrig_MilkTea (family, line 53973) ---
function InitTrig_MilkTea takes nothing returns nothing
    set gg_trg_MilkTea = CreateTrigger(  )
    call DisableTrigger( gg_trg_MilkTea )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MilkTea, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MilkTea, Condition( function Trig_MilkTea_Conditions ) )
    call TriggerAddAction( gg_trg_MilkTea, function Trig_MilkTea_Actions )
endfunction
