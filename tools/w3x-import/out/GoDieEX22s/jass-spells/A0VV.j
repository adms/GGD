// rawcode: A0VV
// nameZh: 91-00 符文鍛造 - 墮落十字軍符文
// mana: {"1": 150}
// duration: {"1": 10.0}
// hero_duration: {"1": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: CrusadeRune

// === family CrusadeRune (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CrusadeRune_Conditions (family, line 53023) ---
function Trig_CrusadeRune_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CrusadeRune_Actions (family, line 53030) ---
function Trig_CrusadeRune_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0VU', GetTriggerUnit(), 2 )
    call EnableTrigger( gg_trg_CrusadeRune_close )
endfunction

// --- InitTrig_CrusadeRune (family, line 53036) ---
function InitTrig_CrusadeRune takes nothing returns nothing
    set gg_trg_CrusadeRune = CreateTrigger(  )
    call DisableTrigger( gg_trg_CrusadeRune )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CrusadeRune, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CrusadeRune, Condition( function Trig_CrusadeRune_Conditions ) )
    call TriggerAddAction( gg_trg_CrusadeRune, function Trig_CrusadeRune_Actions )
endfunction
