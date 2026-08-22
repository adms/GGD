// rawcode: A0KU
// nameZh: 00-08 泰坦的腰帶
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_taitan

// === family mission_taitan (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_taitan_Conditions (family, line 20903) ---
function Trig_mission_taitan_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KU' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_taitan_Actions (family, line 20910) ---
function Trig_mission_taitan_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_mission_taitan), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct_mission_taitan), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_taitan (family, line 20916) ---
function InitTrig_mission_taitan takes nothing returns nothing
    set gg_trg_mission_taitan = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_taitan, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_taitan, Condition( function Trig_mission_taitan_Conditions ) )
    call TriggerAddAction( gg_trg_mission_taitan, function Trig_mission_taitan_Actions )
endfunction
