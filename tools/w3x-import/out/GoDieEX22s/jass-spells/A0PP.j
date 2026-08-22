// rawcode: A0PP
// nameZh: 82-04-01 術式兵裝-疾風迅雷
// cooldown: {"1": 20.0}
// mana: {"1": 100}
// area: {"1": 0.0}
// duration: {"1": 1.0}
// hero_duration: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WindThunder

// === family WindThunder (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WindThunder_Conditions (family, line 35638) ---
function Trig_WindThunder_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0PP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WindThunder_Actions (family, line 35645) ---
function Trig_WindThunder_Actions takes nothing returns nothing
    call UnitRemoveAbilityBJ( 'A0PY', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A0PV', GetTriggerUnit() )
endfunction

// --- InitTrig_WindThunder (family, line 35651) ---
function InitTrig_WindThunder takes nothing returns nothing
    set gg_trg_WindThunder = CreateTrigger(  )
    call DisableTrigger( gg_trg_WindThunder )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WindThunder, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WindThunder, Condition( function Trig_WindThunder_Conditions ) )
    call TriggerAddAction( gg_trg_WindThunder, function Trig_WindThunder_Actions )
endfunction
