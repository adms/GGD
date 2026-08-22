// rawcode: A0ZI
// nameZh: 98-04 自在飛翔
// w3a base: AOr2  levels: 3
// area: {"1": 100.0, "2": 100.0, "3": 100.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FlyAway

// === family FlyAway (passive) events=none ===

// --- Trig_FlyAway_Actions (family, line 55179) ---
function Trig_FlyAway_Actions takes nothing returns nothing
    local unit RiderHideUnit

    if ( JudgeFunc() ) then
        set udg_Mentor_UnitPoint = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Mentor_UnitPoint, bj_UNIT_FACING )
        set RiderHideUnit = GetLastCreatedUnit()
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', RiderHideUnit )
        call UnitAddItemByIdSwapped( 'will', RiderHideUnit )
        call ShowUnitHide( RiderHideUnit )
        call UnitUseItemTarget( RiderHideUnit, GetLastCreatedItem(), GetTriggerUnit() )
        call RemoveLocation(udg_Mentor_UnitPoint)
        call TriggerSleepAction( 1.00 )
        call KillUnit( RiderHideUnit )
        call RemoveUnit( RiderHideUnit )
    else
    endif

endfunction

// --- InitTrig_FlyAway (family, line 55200) ---
function InitTrig_FlyAway takes nothing returns nothing
    set gg_trg_FlyAway = CreateTrigger(  )
    call TriggerAddAction( gg_trg_FlyAway, function Trig_FlyAway_Actions )
endfunction

// --- JudgeFunc (helper, line 55168) ---
function JudgeFunc takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0ZI', GetTriggerUnit()) > 0 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) == 4 ) ) then
        return false
    endif
    return true
endfunction
