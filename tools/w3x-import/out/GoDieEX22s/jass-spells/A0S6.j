// rawcode: A0S6
// nameZh: 02-002 神通眼
// w3a base: AHtb  levels: 1
// cooldown: {"1": 30.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 200, "2": 225, "3": 300, "4": 315}
// range: {"1": 12000.0, "2": 450.0, "3": 450.0, "4": 285.0}
// duration: {"1": 3.0, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FinalShotting

// === family FinalShotting (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FinalShotting_Conditions (family, line 34026) ---
function Trig_FinalShotting_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0S6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FinalShotting_Actions (family, line 34033) ---
function Trig_FinalShotting_Actions takes nothing returns nothing
    set udg_FinalShotCastUnit = GetTriggerUnit()
    set udg_FinalShottingPoint = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 160.00, GetUnitFacing(GetTriggerUnit()))
    call CreateNUnitsAtLoc( 1, 'h032', GetOwningPlayer(GetTriggerUnit()), udg_FinalShottingPoint, GetUnitFacing(GetTriggerUnit()) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 800.00, 800.00, 800.00 )
    set udg_FinalShotUnit = GetLastCreatedUnit()
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A02H', GetLastCreatedUnit() )
    call GroupClear( udg_FinalShotGroup )
    set udg_FinalShotCount = 0
    call EnableTrigger( gg_trg_FinalShottingMove )
endfunction

// --- InitTrig_FinalShotting (family, line 34047) ---
function InitTrig_FinalShotting takes nothing returns nothing
    set gg_trg_FinalShotting = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FinalShotting, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FinalShotting, Condition( function Trig_FinalShotting_Conditions ) )
    call TriggerAddAction( gg_trg_FinalShotting, function Trig_FinalShotting_Actions )
endfunction
