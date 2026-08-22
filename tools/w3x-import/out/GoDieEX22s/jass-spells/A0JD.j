// rawcode: A0JD
// nameZh: 77-00 浮雲-旋一閃
// cooldown: {"1": 15.0}
// mana: {"1": 150}
// duration: {"1": 0.5}
// hero_duration: {"1": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Cloud_reset

// === family Cloud_reset (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Cloud_reset_Conditions (family, line 49352) ---
function Trig_Cloud_reset_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cloud_reset_Actions (family, line 49359) ---
function Trig_Cloud_reset_Actions takes nothing returns nothing
    set udg_Inshou = GetTriggerUnit()
    call EnableTrigger( gg_trg_Cloud_ready )
    set udg_InshouJudg = 1
    call TriggerSleepAction( 0.50 )
    call DisableTrigger( gg_trg_Cloud_ready )
endfunction

// --- InitTrig_Cloud_reset (family, line 49368) ---
function InitTrig_Cloud_reset takes nothing returns nothing
    set gg_trg_Cloud_reset = CreateTrigger(  )
    call DisableTrigger( gg_trg_Cloud_reset )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Cloud_reset, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Cloud_reset, Condition( function Trig_Cloud_reset_Conditions ) )
    call TriggerAddAction( gg_trg_Cloud_reset, function Trig_Cloud_reset_Actions )
endfunction
