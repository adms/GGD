// rawcode: A0KQ
// nameZh: 00-02 天堂之劍
// w3a base: ANcl  levels: 1
// range: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: mission_heaven

// === family mission_heaven (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_mission_heaven_Conditions (family, line 20776) ---
function Trig_mission_heaven_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_mission_heaven_Actions (family, line 20783) ---
function Trig_mission_heaven_Actions takes nothing returns nothing
    call PanCameraToTimedLocForPlayer( GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_mission_heaven), 0 )
    call PingMinimapLocForForceEx( GetForceOfPlayer(GetOwningPlayer(GetTriggerUnit())), GetRectCenter(gg_rct_mission_heaven), 3.00, bj_MINIMAPPINGSTYLE_FLASHY, 100, 100, 100 )
endfunction

// --- InitTrig_mission_heaven (family, line 20789) ---
function InitTrig_mission_heaven takes nothing returns nothing
    set gg_trg_mission_heaven = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_mission_heaven, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_mission_heaven, Condition( function Trig_mission_heaven_Conditions ) )
    call TriggerAddAction( gg_trg_mission_heaven, function Trig_mission_heaven_Actions )
endfunction
