// rawcode: A11C
// nameZh: 99-04 世界第一的公主殿下
// w3a base: AOww  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 225, "2": 325, "3": 425}
// area: {"1": 225.0, "2": 225.0, "3": 225.0}
// duration: {"1": 4.0, "2": 6.0, "3": 8.0}
// hero_duration: {"1": 4.0, "2": 6.0, "3": 8.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MikuNo1

// === family MikuNo1 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MikuNo1_Conditions (family, line 54912) ---
function Trig_MikuNo1_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A11C' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuNo1_Actions (family, line 54919) ---
function Trig_MikuNo1_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_MikuNo1Effect )
    call TriggerSleepAction( ( 2.00 + ( 2.00 * I2R(GetUnitAbilityLevelSwapped('A11C', udg_Miku)) ) ) )
    call DisableTrigger( gg_trg_MikuNo1Effect )
endfunction

// --- InitTrig_MikuNo1 (family, line 54926) ---
function InitTrig_MikuNo1 takes nothing returns nothing
    set gg_trg_MikuNo1 = CreateTrigger(  )
    call DisableTrigger( gg_trg_MikuNo1 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MikuNo1, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MikuNo1, Condition( function Trig_MikuNo1_Conditions ) )
    call TriggerAddAction( gg_trg_MikuNo1, function Trig_MikuNo1_Actions )
endfunction
