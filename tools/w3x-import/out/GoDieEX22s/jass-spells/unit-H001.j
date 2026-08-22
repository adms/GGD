// unit rawcode: H001
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Lineage, AbsoluteDefence

// === family Open_Skill_of_Lineage (armed) events=none ===

// --- Trig_Open_Skill_of_Lineage_Conditions (family, line 44696) ---
function Trig_Open_Skill_of_Lineage_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H001' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Lineage_Actions (family, line 44703) ---
function Trig_Open_Skill_of_Lineage_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_AbsoluteDefence )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "班剎: 剛剛噴了本召喚術，快分！！" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Lineage (family, line 44711) ---
function InitTrig_Open_Skill_of_Lineage takes nothing returns nothing
    set gg_trg_Open_Skill_of_Lineage = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Lineage, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Lineage, Condition( function Trig_Open_Skill_of_Lineage_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Lineage, function Trig_Open_Skill_of_Lineage_Actions )
endfunction

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
