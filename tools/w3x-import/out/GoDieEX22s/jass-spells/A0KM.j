// rawcode: A0KM
// nameZh: 00-01 黃金沒力號
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_crossHo

// === family mission_crossHo (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_crossHo_Conditions (family, line 20753) ---
function Trig_mission_crossHo_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KM' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_crossHo_Actions (family, line 20760) ---
function Trig_mission_crossHo_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct________027), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct________027), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_crossHo (family, line 20766) ---
function InitTrig_mission_crossHo takes nothing returns nothing
    set gg_trg_mission_crossHo = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_crossHo, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_crossHo, Condition( function Trig_mission_crossHo_Conditions ) )
    call TriggerAddAction( gg_trg_mission_crossHo, function Trig_mission_crossHo_Actions )
endfunction
