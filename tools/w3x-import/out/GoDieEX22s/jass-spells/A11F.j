// rawcode: A11F
// nameZh: 99-002 把你給MikuMiku掉
// w3a base: AUfa  levels: 1
// cooldown: {"1": 65.0}
// mana: {"1": 400}
// range: {"1": 600.0}
// duration: {"1": 15.0}
// hero_duration: {"1": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MikuEX

// === family MikuEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MikuEX_Conditions (family, line 55005) ---
function Trig_MikuEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A11F' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuEX_Actions (family, line 55012) ---
function Trig_MikuEX_Actions takes nothing returns nothing
    call SetUnitLifePercentBJ( GetSpellTargetUnit(), 100 )
    call SetUnitManaPercentBJ( GetSpellTargetUnit(), 100 )
endfunction

// --- InitTrig_MikuEX (family, line 55018) ---
function InitTrig_MikuEX takes nothing returns nothing
    set gg_trg_MikuEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_MikuEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MikuEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MikuEX, Condition( function Trig_MikuEX_Conditions ) )
    call TriggerAddAction( gg_trg_MikuEX, function Trig_MikuEX_Actions )
endfunction
