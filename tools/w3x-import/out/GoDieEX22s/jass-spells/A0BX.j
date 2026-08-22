// rawcode: A0BX
// nameZh: 86-00 裝可愛
// cooldown: {"1": 3.0}
// mana: {"1": 50}
// area: {"1": 1600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: NoCute

// === family NoCute (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NoCute_Conditions (family, line 40422) ---
function Trig_NoCute_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NoCute_Actions (family, line 40429) ---
function Trig_NoCute_Actions takes nothing returns nothing
    call PlaySoundBJ( gg_snd_nocute )
endfunction

// --- InitTrig_NoCute (family, line 40434) ---
function InitTrig_NoCute takes nothing returns nothing
    set gg_trg_NoCute = CreateTrigger(  )
    call DisableTrigger( gg_trg_NoCute )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NoCute, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NoCute, Condition( function Trig_NoCute_Conditions ) )
    call TriggerAddAction( gg_trg_NoCute, function Trig_NoCute_Actions )
endfunction
