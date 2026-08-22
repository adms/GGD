// rawcode: A0WN
// nameZh: 93-002 二一
// cooldown: {"1": 80.0}
// mana: {"1": 500}
// range: {"1": 400.0}
// duration: {"1": 1.0}
// hero_duration: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: flunkOut

// === family flunkOut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_flunkOut_Conditions (family, line 53733) ---
function Trig_flunkOut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0WN' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_flunkOut_Actions (family, line 53740) ---
function Trig_flunkOut_Actions takes nothing returns nothing
    set udg_Pro_FO_target = GetSpellTargetUnit()
    call EnableTrigger( gg_trg_flunkOutEff )
    call StartTimerBJ( udg_Pro_FO_timer, true, 0.10 )
endfunction

// --- InitTrig_flunkOut (family, line 53747) ---
function InitTrig_flunkOut takes nothing returns nothing
    set gg_trg_flunkOut = CreateTrigger(  )
    call DisableTrigger( gg_trg_flunkOut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_flunkOut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_flunkOut, Condition( function Trig_flunkOut_Conditions ) )
    call TriggerAddAction( gg_trg_flunkOut, function Trig_flunkOut_Actions )
endfunction
