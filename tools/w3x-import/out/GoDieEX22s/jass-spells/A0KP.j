// rawcode: A0KP
// nameZh: 00-05 愛吃肉的將軍
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_meat

// === family mission_meat (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_meat_Conditions (family, line 20822) ---
function Trig_mission_meat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_meat_Actions (family, line 20829) ---
function Trig_mission_meat_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_mission_meat), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct________052), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_meat (family, line 20835) ---
function InitTrig_mission_meat takes nothing returns nothing
    set gg_trg_mission_meat = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_meat, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_meat, Condition( function Trig_mission_meat_Conditions ) )
    call TriggerAddAction( gg_trg_mission_meat, function Trig_mission_meat_Actions )
endfunction
