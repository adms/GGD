// rawcode: A0S3
// nameZh: 74-002 超新星
// w3a base: AHtb  levels: 1
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 520, "2": 225, "3": 300, "4": 315}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 285.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Supernova

// === family Supernova (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Supernova_Conditions (family, line 48575) ---
function Trig_Supernova_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0S3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Supernova_Func011Func001A (family, line 48582) ---
function Trig_Supernova_Func011Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_Supernova_Func017A (family, line 48586) ---
function Trig_Supernova_Func017A takes nothing returns nothing
    call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- Trig_Supernova_Func021A (family, line 48593) ---
function Trig_Supernova_Func021A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Supernova_Actions (family, line 48598) ---
function Trig_Supernova_Actions takes nothing returns nothing
    set udg_SupernovaUnit = GetTriggerUnit()
    set udg_SupernovaTarget = GetSpellTargetUnit()
    set udg_SephUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A0S0', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPositionLocFacingBJ( udg_SupernovaUnit, PolarProjectionBJ(GetUnitLoc(udg_SupernovaTarget), 150.00, AngleBetweenPoints(GetUnitLoc(udg_SupernovaUnit), GetUnitLoc(udg_SupernovaTarget))), GetUnitFacing(udg_SupernovaUnit) )
    call TriggerSleepAction( 0.10 )
    call UnitRemoveAbilityBJ( 'A09P', udg_SupernovaUnit )
    call UnitRemoveAbilityBJ( 'A0S0', udg_SupernovaUnit )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_Supernova_Func011Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_SephUnit), GetUnitLoc(udg_SupernovaTarget), GetUnitLoc(udg_SupernovaTarget) )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0SW', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0SW', GetLastCreatedUnit(), 1 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", GetUnitLoc(udg_SupernovaTarget) )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(udg_SupernovaTarget)), function Trig_Supernova_Func017A )
    call TriggerSleepAction( 2.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SephUnit), 'hfoo'), function Trig_Supernova_Func021A )
endfunction

// --- InitTrig_Supernova (family, line 48635) ---
function InitTrig_Supernova takes nothing returns nothing
    set gg_trg_Supernova = CreateTrigger(  )
    call DisableTrigger( gg_trg_Supernova )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Supernova, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Supernova, Condition( function Trig_Supernova_Conditions ) )
    call TriggerAddAction( gg_trg_Supernova, function Trig_Supernova_Actions )
endfunction
