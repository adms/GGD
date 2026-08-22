// rawcode: A07J
// nameZh: 40-03 痛哭流悌麥克風
// w3a base: ANbf  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 115, "2": 165, "3": 215, "4": 265}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// area: {"1": 200.0, "2": 200.0, "3": 200.0, "4": 200.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Micphone

// === family Micphone (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Micphone_Conditions (family, line 39137) ---
function Trig_Micphone_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07J' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Micphone_Actions (family, line 39144) ---
function Trig_Micphone_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_SargerasRoar, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_ShamanPissed4, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_Micphone (family, line 39150) ---
function InitTrig_Micphone takes nothing returns nothing
    set gg_trg_Micphone = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Micphone, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Micphone, Condition( function Trig_Micphone_Conditions ) )
    call TriggerAddAction( gg_trg_Micphone, function Trig_Micphone_Actions )
endfunction
