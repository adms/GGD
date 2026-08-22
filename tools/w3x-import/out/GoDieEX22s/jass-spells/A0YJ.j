// rawcode: A0YJ
// nameZh: 黑色魔書-重力
// cooldown: {"1": 40.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 300, "2": 300, "3": 350, "4": 400}
// range: {"1": 600.0, "2": 700.0, "3": 700.0, "4": 700.0}
// area: {"1": 400.0}
// duration: {"1": 3.0, "2": 6.0, "3": 6.0, "4": 6.0}
// hero_duration: {"1": 3.0, "2": 6.0, "3": 6.0, "4": 6.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GravityBall

// === family GravityBall (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GravityBall_Conditions (family, line 24630) ---
function Trig_GravityBall_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GravityBall_Func007A (family, line 24637) ---
function Trig_GravityBall_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GravityBall_Actions (family, line 24642) ---
function Trig_GravityBall_Actions takes nothing returns nothing
    set udg_item_GB_P = GetSpellTargetLoc()
    call CreateNUnitsAtLoc( 1, 'o01N', GetOwningPlayer(GetTriggerUnit()), udg_item_GB_P, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "earthquake", udg_item_GB_P )
    call RemoveLocation(udg_item_GB_P)
    call TriggerSleepAction( 7.50 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o01N'), function Trig_GravityBall_Func007A )
endfunction

// --- InitTrig_GravityBall (family, line 24653) ---
function InitTrig_GravityBall takes nothing returns nothing
    set gg_trg_GravityBall = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GravityBall, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GravityBall, Condition( function Trig_GravityBall_Conditions ) )
    call TriggerAddAction( gg_trg_GravityBall, function Trig_GravityBall_Actions )
endfunction
