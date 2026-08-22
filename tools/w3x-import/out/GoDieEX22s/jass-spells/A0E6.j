// rawcode: A0E6
// nameZh: 00-04 魔戒
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_ring

// === family mission_ring (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_ring_Conditions (family, line 20799) ---
function Trig_mission_ring_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0E6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_ring_Actions (family, line 20806) ---
function Trig_mission_ring_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct________051), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct________051), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_ring (family, line 20812) ---
function InitTrig_mission_ring takes nothing returns nothing
    set gg_trg_mission_ring = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_ring, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_ring, Condition( function Trig_mission_ring_Conditions ) )
    call TriggerAddAction( gg_trg_mission_ring, function Trig_mission_ring_Actions )
endfunction
