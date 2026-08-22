// rawcode: A0KT
// nameZh: 00-10 奈落的旅人
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_nairo

// === family mission_nairo (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_nairo_Conditions (family, line 20926) ---
function Trig_mission_nairo_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KT' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_nairo_Actions (family, line 20933) ---
function Trig_mission_nairo_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_mission_nairo), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct_mission_nairo), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_nairo (family, line 20939) ---
function InitTrig_mission_nairo takes nothing returns nothing
    set gg_trg_mission_nairo = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_nairo, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_nairo, Condition( function Trig_mission_nairo_Conditions ) )
    call TriggerAddAction( gg_trg_mission_nairo, function Trig_mission_nairo_Actions )
endfunction
