// rawcode: A0JJ
// nameZh: 14-00 召喚式神
// cooldown: {"1": 5.0}
// mana: {"1": 150}
// range: {"1": 450.0}
// duration: {"1": 25.0}
// hero_duration: {"1": 25.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MoveSlaveStart

// === family MoveSlaveStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoveSlaveStart_Conditions (family, line 30207) ---
function Trig_MoveSlaveStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveSlaveStart_Actions (family, line 30214) ---
function Trig_MoveSlaveStart_Actions takes nothing returns nothing
    set udg_MoNiUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_MoveSlaveOrder )
endfunction

// --- InitTrig_MoveSlaveStart (family, line 30220) ---
function InitTrig_MoveSlaveStart takes nothing returns nothing
    set gg_trg_MoveSlaveStart = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoveSlaveStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoveSlaveStart, Condition( function Trig_MoveSlaveStart_Conditions ) )
    call TriggerAddAction( gg_trg_MoveSlaveStart, function Trig_MoveSlaveStart_Actions )
endfunction
