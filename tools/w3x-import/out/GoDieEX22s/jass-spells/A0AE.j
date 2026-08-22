// rawcode: A0AE
// nameZh: Tidal Wave
// mana: {"1": 100, "2": 105}
// area: {"1": 200.0, "2": 200.0, "3": 200.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Tidal_Wave

// === family Tidal_Wave (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Tidal_Wave_Conditions (family, line 25879) ---
function Trig_Tidal_Wave_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Tidal_Wave_Actions (family, line 25886) ---
function Trig_Tidal_Wave_Actions takes nothing returns nothing
    set udg_TidalMover = GetSpellAbilityUnit()
    call TriggerSleepAction( 0.50 )
    call SetUnitPositionLoc( udg_TidalMover, GetSpellTargetLoc() )
    call TriggerSleepAction( 0.15 )
    call DoNothing(  )
endfunction

// --- InitTrig_Tidal_Wave (family, line 25895) ---
function InitTrig_Tidal_Wave takes nothing returns nothing
    set gg_trg_Tidal_Wave = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Tidal_Wave, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Tidal_Wave, Condition( function Trig_Tidal_Wave_Conditions ) )
    call TriggerAddAction( gg_trg_Tidal_Wave, function Trig_Tidal_Wave_Actions )
endfunction
