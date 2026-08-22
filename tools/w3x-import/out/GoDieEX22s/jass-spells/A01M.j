// rawcode: A01M
// nameZh: 疾風怒雷
// cooldown: {"1": 40.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 300, "2": 300, "3": 350, "4": 400}
// range: {"1": 450.0, "2": 700.0, "3": 700.0, "4": 700.0}
// area: {"1": 600.0}
// duration: {"1": 3.0, "2": 6.0, "3": 6.0, "4": 6.0}
// hero_duration: {"1": 3.0, "2": 6.0, "3": 6.0, "4": 6.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LigtingHamm

// === family LigtingHamm (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LigtingHamm_Conditions (family, line 24576) ---
function Trig_LigtingHamm_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01M' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LigtingHamm_Func003A (family, line 24583) ---
function Trig_LigtingHamm_Func003A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_LigtingHamm_Func006A (family, line 24587) ---
function Trig_LigtingHamm_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LigtingHamm_Actions (family, line 24592) ---
function Trig_LigtingHamm_Actions takes nothing returns nothing
    set udg_item_LH_Point = GetSpellTargetLoc()
    set udg_item_LH_Counter = 1
    loop
        exitwhen udg_item_LH_Counter > 7
        set udg_item_LH_RandomP = GetRandomLocInRect(RectFromCenterSizeBJ(udg_item_LH_Point, 800.00, 800.00))
        call CreateNUnitsAtLoc( 1, 'o02M', GetOwningPlayer(GetTriggerUnit()), udg_item_LH_RandomP, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
        call RemoveLocation(udg_item_LH_RandomP)
        set udg_item_LH_Counter = udg_item_LH_Counter + 1
    endloop
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_item_LH_Point, 900.00, 900.00)), function Trig_LigtingHamm_Func003A )
    call RemoveLocation(udg_item_LH_Point)
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o02M'), function Trig_LigtingHamm_Func006A )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_LigtingHamm (family, line 24618) ---
function InitTrig_LigtingHamm takes nothing returns nothing
    set gg_trg_LigtingHamm = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LigtingHamm, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LigtingHamm, Condition( function Trig_LigtingHamm_Conditions ) )
    call TriggerAddAction( gg_trg_LigtingHamm, function Trig_LigtingHamm_Actions )
endfunction
