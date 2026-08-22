// rawcode: A0W5
// nameZh: 79-002 虛化
// cooldown: {"1": 60.0}
// mana: {"1": 500}
// area: {"1": 100.0}
// duration: {"1": 15.0}
// hero_duration: {"1": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Bleach_Null_start

// === family Bleach_Null_start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Null_start_Conditions (family, line 37635) ---
function Trig_Bleach_Null_start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0W5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Null_start_Actions (family, line 37642) ---
function Trig_Bleach_Null_start_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0LS', GetTriggerUnit(), 2 )
    call SetUnitVertexColorBJ( udg_BleachUnit, 30.00, 30.00, 30.00, 0 )
    call EnableTrigger( gg_trg_Bleach_Null )
    call EnableTrigger( gg_trg_Bleach_Null_close )
endfunction

// --- InitTrig_Bleach_Null_start (family, line 37650) ---
function InitTrig_Bleach_Null_start takes nothing returns nothing
    set gg_trg_Bleach_Null_start = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Null_start )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Null_start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Null_start, Condition( function Trig_Bleach_Null_start_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Null_start, function Trig_Bleach_Null_start_Actions )
endfunction
