// rawcode: A0FP
// nameZh: 34-04 奧義˙蒼龍破
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 200, "2": 300, "3": 400}
// range: {"1": 600.0, "2": 600.0, "3": 600.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BlueDragonWave

// === family BlueDragonWave (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BlueDragonWave_Conditions (family, line 38856) ---
function Trig_BlueDragonWave_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0FP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlueDragonWave_Func003A (family, line 38863) ---
function Trig_BlueDragonWave_Func003A takes nothing returns nothing
    call IssuePointOrderLocBJ( GetEnumUnit(), "smart", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 800.00, GetUnitFacing(GetTriggerUnit())) )
endfunction

// --- Trig_BlueDragonWave_Func005A (family, line 38867) ---
function Trig_BlueDragonWave_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_BlueDragonWave_Actions (family, line 38872) ---
function Trig_BlueDragonWave_Actions takes nothing returns nothing
    set udg_BlueDargon = 1
    loop
        exitwhen udg_BlueDargon > 12
        call CreateNUnitsAtLoc( 1, 'n00N', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), ( I2R(udg_BlueDargon) * 12.00 ), ( I2R(udg_BlueDargon) * 30.00 )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call TriggerSleepAction( 0.03 )
        set udg_BlueDargon = udg_BlueDargon + 1
    endloop
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'n00N'), function Trig_BlueDragonWave_Func003A )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'n00N'), function Trig_BlueDragonWave_Func005A )
endfunction

// --- InitTrig_BlueDragonWave (family, line 38887) ---
function InitTrig_BlueDragonWave takes nothing returns nothing
    set gg_trg_BlueDragonWave = CreateTrigger(  )
    call DisableTrigger( gg_trg_BlueDragonWave )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BlueDragonWave, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BlueDragonWave, Condition( function Trig_BlueDragonWave_Conditions ) )
    call TriggerAddAction( gg_trg_BlueDragonWave, function Trig_BlueDragonWave_Actions )
endfunction
