// rawcode: A0KS
// nameZh: 00-06 GANTZ
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_Gantz

// === family mission_Gantz (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_Gantz_Conditions (family, line 20845) ---
function Trig_mission_Gantz_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_Gantz_Func001C (family, line 20852) ---
function Trig_mission_Gantz_Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetTriggerUnit()), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_Gantz_Actions (family, line 20859) ---
function Trig_mission_Gantz_Actions takes nothing returns nothing
    if ( Trig_mission_Gantz_Func001C() ) then
        call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_LoveHeroPoint), 0 )
        call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct_LoveHeroPoint), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
    else
        call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_DieHeroPoint), 0 )
        call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct_DieHeroPoint), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
    endif
endfunction

// --- InitTrig_mission_Gantz (family, line 20870) ---
function InitTrig_mission_Gantz takes nothing returns nothing
    set gg_trg_mission_Gantz = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_Gantz, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_Gantz, Condition( function Trig_mission_Gantz_Conditions ) )
    call TriggerAddAction( gg_trg_mission_Gantz, function Trig_mission_Gantz_Actions )
endfunction
