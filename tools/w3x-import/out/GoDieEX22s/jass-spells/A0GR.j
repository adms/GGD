// rawcode: A0GR
// nameZh: 70-03 木束縛之術
// w3a base: AOvd  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 100, "2": 150, "4": 250}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: whiterOldTree

// === family whiterOldTree (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_whiterOldTree_Conditions (family, line 47837) ---
function Trig_whiterOldTree_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_whiterOldTree_Func008A (family, line 47844) ---
function Trig_whiterOldTree_Func008A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "entanglingroots", GetEnumUnit() )
endfunction

// --- Trig_whiterOldTree_Func011A (family, line 47849) ---
function Trig_whiterOldTree_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_whiterOldTree_Actions (family, line 47854) ---
function Trig_whiterOldTree_Actions takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00Y', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set udg_whiteUnit = GetLastCreatedUnit()
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0GS', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0GS', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(950.00, udg_P1), function Trig_whiterOldTree_Func008A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o00Y'), function Trig_whiterOldTree_Func011A )
endfunction

// --- InitTrig_whiterOldTree (family, line 47869) ---
function InitTrig_whiterOldTree takes nothing returns nothing
    set gg_trg_whiterOldTree = CreateTrigger(  )
    call DisableTrigger( gg_trg_whiterOldTree )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_whiterOldTree, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_whiterOldTree, Condition( function Trig_whiterOldTree_Conditions ) )
    call TriggerAddAction( gg_trg_whiterOldTree, function Trig_whiterOldTree_Actions )
endfunction
