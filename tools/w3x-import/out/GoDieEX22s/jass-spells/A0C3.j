// rawcode: A0C3
// nameZh: 58-03 就決定是你了!小智
// w3a base: AHtb  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 70, "2": 120, "3": 170, "4": 220}
// duration: {"1": 0.5, "2": 1.0, "3": 1.5, "4": 2.0}
// hero_duration: {"1": 0.5, "2": 1.0, "3": 1.5, "4": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Sadosi

// === family Sadosi (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Sadosi_Conditions (family, line 40241) ---
function Trig_Sadosi_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0C3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Sadosi_Actions (family, line 40248) ---
function Trig_Sadosi_Actions takes nothing returns nothing
    call PlaySoundBJ( gg_snd_sawch )
endfunction

// --- InitTrig_Sadosi (family, line 40253) ---
function InitTrig_Sadosi takes nothing returns nothing
    set gg_trg_Sadosi = CreateTrigger(  )
    call DisableTrigger( gg_trg_Sadosi )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Sadosi, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Sadosi, Condition( function Trig_Sadosi_Conditions ) )
    call TriggerAddAction( gg_trg_Sadosi, function Trig_Sadosi_Actions )
endfunction
