// rawcode: A0KL
// nameZh: 00-00 尋找幸魂
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_turtle

// === family mission_turtle (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_turtle_Conditions (family, line 20730) ---
function Trig_mission_turtle_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_turtle_Actions (family, line 20737) ---
function Trig_mission_turtle_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_mission_turtle), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct_mission_turtle), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_turtle (family, line 20743) ---
function InitTrig_mission_turtle takes nothing returns nothing
    set gg_trg_mission_turtle = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_turtle, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_turtle, Condition( function Trig_mission_turtle_Conditions ) )
    call TriggerAddAction( gg_trg_mission_turtle, function Trig_mission_turtle_Actions )
endfunction
