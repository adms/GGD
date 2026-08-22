// rawcode: A00O
// nameZh: 18-04-02 老樹盤根
// w3a base: AEer  levels: 1
// cooldown: {"1": 10.0, "2": 23.0, "3": 20.0}
// mana: {"1": 150, "2": 195, "3": 195}
// duration: {"1": 4.0, "2": 3.0, "3": 4.0}
// hero_duration: {"1": 4.0, "2": 3.0, "3": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SuperOldTree

// === family SuperOldTree (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SuperOldTree_Conditions (family, line 28111) ---
function Trig_SuperOldTree_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A00O' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SuperOldTree_Func010A (family, line 28118) ---
function Trig_SuperOldTree_Func010A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "entanglingroots", GetEnumUnit() )
endfunction

// --- Trig_SuperOldTree_Func013A (family, line 28123) ---
function Trig_SuperOldTree_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SuperOldTree_Actions (family, line 28128) ---
function Trig_SuperOldTree_Actions takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00A', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A00M', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A00M', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call RemoveLocation( udg_P1 )
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_P1), function Trig_SuperOldTree_Func010A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 15.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o00A'), function Trig_SuperOldTree_Func013A )
endfunction

// --- InitTrig_SuperOldTree (family, line 28145) ---
function InitTrig_SuperOldTree takes nothing returns nothing
    set gg_trg_SuperOldTree = CreateTrigger(  )
    call DisableTrigger( gg_trg_SuperOldTree )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SuperOldTree, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SuperOldTree, Condition( function Trig_SuperOldTree_Conditions ) )
    call TriggerAddAction( gg_trg_SuperOldTree, function Trig_SuperOldTree_Actions )
endfunction
