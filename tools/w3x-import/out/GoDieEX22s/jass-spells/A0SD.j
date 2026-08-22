// rawcode: A0SD
// nameZh: 41-002 絕對屏障
// w3a base: ANsi  levels: 1
// cooldown: {"1": 25.0}
// mana: {"1": 500}
// range: {"1": 450.0}
// area: {"1": 320.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AbsoluteDefence

// === family AbsoluteDefence (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AbsoluteDefence_Conditions (family, line 44721) ---
function Trig_AbsoluteDefence_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AbsoluteDefence_Func007A (family, line 44728) ---
function Trig_AbsoluteDefence_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AbsoluteDefence_Actions (family, line 44733) ---
function Trig_AbsoluteDefence_Actions takes nothing returns nothing
    set udg_LineageMagician = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'h02C', GetOwningPlayer(GetTriggerUnit()), GetSpellTargetLoc(), bj_UNIT_FACING )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "voodoo" )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 8.00 )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LineageMagician), 'h02C'), function Trig_AbsoluteDefence_Func007A )
endfunction

// --- InitTrig_AbsoluteDefence (family, line 44743) ---
function InitTrig_AbsoluteDefence takes nothing returns nothing
    set gg_trg_AbsoluteDefence = CreateTrigger(  )
    call DisableTrigger( gg_trg_AbsoluteDefence )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AbsoluteDefence, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AbsoluteDefence, Condition( function Trig_AbsoluteDefence_Conditions ) )
    call TriggerAddAction( gg_trg_AbsoluteDefence, function Trig_AbsoluteDefence_Actions )
endfunction
