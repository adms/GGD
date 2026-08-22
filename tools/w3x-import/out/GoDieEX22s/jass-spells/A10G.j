// rawcode: A10G
// nameZh: 77-002 御雷劍
// cooldown: {"1": 75.0}
// mana: {"1": 255}
// duration: {"1": 15.0}
// hero_duration: {"1": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Control_Light

// === family Control_Light (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Control_Light_Conditions (family, line 49180) ---
function Trig_Control_Light_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A10G' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Control_Light_Actions (family, line 49187) ---
function Trig_Control_Light_Actions takes nothing returns nothing
    set udg_Light_Sword_Num = 2
    call TriggerSleepAction( 14.00 )
    set udg_Light_Sword_Num = 10
endfunction

// --- InitTrig_Control_Light (family, line 49194) ---
function InitTrig_Control_Light takes nothing returns nothing
    set gg_trg_Control_Light = CreateTrigger(  )
    call DisableTrigger( gg_trg_Control_Light )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Control_Light, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Control_Light, Condition( function Trig_Control_Light_Conditions ) )
    call TriggerAddAction( gg_trg_Control_Light, function Trig_Control_Light_Actions )
endfunction
