// rawcode: A0KR
// nameZh: 00-07 Keroro軍曹
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_flog

// === family mission_flog (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_flog_Conditions (family, line 20880) ---
function Trig_mission_flog_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_flog_Actions (family, line 20887) ---
function Trig_mission_flog_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_mission_flog), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct________050), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_flog (family, line 20893) ---
function InitTrig_mission_flog takes nothing returns nothing
    set gg_trg_mission_flog = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_flog, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_flog, Condition( function Trig_mission_flog_Conditions ) )
    call TriggerAddAction( gg_trg_mission_flog, function Trig_mission_flog_Actions )
endfunction
