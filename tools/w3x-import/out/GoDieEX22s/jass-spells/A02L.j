// rawcode: A02L
// nameZh: 33-01 放山雞
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 35, "2": 70, "3": 105, "4": 140}
// duration: {"1": 180.0, "2": 180.0, "3": 180.0, "4": 200.0}
// hero_duration: {"1": 180.0, "2": 180.0, "3": 180.0, "4": 200.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: chieken

// === family chieken (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_chieken_Conditions (family, line 43368) ---
function Trig_chieken_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A02L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_chieken_Actions (family, line 43375) ---
function Trig_chieken_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_ChickenWhat1, 100, GetTriggerUnit() )
endfunction

// --- InitTrig_chieken (family, line 43380) ---
function InitTrig_chieken takes nothing returns nothing
    set gg_trg_chieken = CreateTrigger(  )
    call DisableTrigger( gg_trg_chieken )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_chieken, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_chieken, Condition( function Trig_chieken_Conditions ) )
    call TriggerAddAction( gg_trg_chieken, function Trig_chieken_Actions )
endfunction
