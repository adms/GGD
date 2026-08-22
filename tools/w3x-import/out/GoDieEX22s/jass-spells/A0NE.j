// rawcode: A0NE
// nameZh: 57-03 複製鏡
// w3a base: AIil  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 200, "2": 300, "3": 400}
// range: {"1": 600.0, "2": 600.0, "3": 600.0}
// area: {"2": 200.0, "3": 200.0}
// duration: {"1": 20.0, "2": 25.0, "3": 30.0}
// hero_duration: {"1": 20.0, "2": 25.0, "3": 30.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Copy

// === family Copy (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Copy_Conditions (family, line 45777) ---
function Trig_Copy_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Copy_Func001C (family, line 45784) ---
function Trig_Copy_Func001C takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() == gg_unit_Utic_0117 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Copy_Actions (family, line 45791) ---
function Trig_Copy_Actions takes nothing returns nothing
    if ( Trig_Copy_Func001C() ) then
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stop" )
    else
    endif
    call PlaySoundOnUnitBJ( gg_snd_SpellbreakerPissed4, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_Copy (family, line 45800) ---
function InitTrig_Copy takes nothing returns nothing
    set gg_trg_Copy = CreateTrigger(  )
    call DisableTrigger( gg_trg_Copy )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Copy, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Copy, Condition( function Trig_Copy_Conditions ) )
    call TriggerAddAction( gg_trg_Copy, function Trig_Copy_Actions )
endfunction
