// rawcode: A09K
// nameZh: 38-04 黑龍波吸收
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 100, "2": 200, "3": 300}
// area: {"1": 5.0, "2": 5.0, "3": 5.0}
// duration: {"1": 10.0, "3": 20.0}
// hero_duration: {"1": 10.0, "3": 20.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EatDragon

// === family EatDragon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EatDragon_Conditions (family, line 43940) ---
function Trig_EatDragon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EatDragon_Func011C (family, line 43947) ---
function Trig_EatDragon_Func011C takes nothing returns boolean
    if ( not ( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), false) <= 160 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EatDragon_Func015A (family, line 43954) ---
function Trig_EatDragon_Func015A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_EatDragon_Func018A (family, line 43958) ---
function Trig_EatDragon_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EatDragon_Func020A (family, line 43963) ---
function Trig_EatDragon_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EatDragon_Actions (family, line 43968) ---
function Trig_EatDragon_Actions takes nothing returns nothing
    set udg_Hehi = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o01V', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call SetUnitVertexColorBJ( GetLastCreatedUnit(), 0.00, 0.00, 0.00, 20.00 )
    set udg_BlackDragonEatUnit = GetLastCreatedUnit()
    call SetUnitFlyHeightBJ( udg_BlackDragonEatUnit, -2000.00, 1800.00 )
    call SetUnitTimeScalePercent( udg_BlackDragonEatUnit, 1000.00 )
    call AddSpecialEffectTargetUnitBJ( "chest", GetLastCreatedUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    if ( Trig_EatDragon_Func011C() ) then
        call ModifyHeroStat( bj_HEROSTAT_AGI, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, ( GetUnitAbilityLevelSwapped('A09K', GetTriggerUnit()) + 0 ) )
    else
        call CreateTextTagUnitBJ( "TRIGSTR_1827", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    endif
    call PlaySoundOnUnitBJ( gg_snd_FlashBack1Second, 100, GetTriggerUnit() )
    set udg_BDragonCount = 1
    loop
        exitwhen udg_BDragonCount > 12
        call CreateNUnitsAtLoc( 1, 'o00Z', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 350.00, ( I2R(udg_BDragonCount) * 30.00 )), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 5.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A09M', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A09M', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetAttacker(), 0 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "clusterrockets", GetUnitLoc(GetLastCreatedUnit()) )
        call EnableTrigger( gg_trg_Closeaeff )
        call AddSpecialEffectLocBJ( GetRandomLocInRect(RectFromCenterSizeBJ(GetUnitLoc(GetTriggerUnit()), 350.00, 350.00)), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_BDragonCount = udg_BDragonCount + 1
    endloop
    call PlaySoundOnUnitBJ( gg_snd_DragonRoostWhat1, 100.00, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_Hehi), 1600.00, 1600.00)), function Trig_EatDragon_Func015A )
    call TriggerSleepAction( 1.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o01V'), function Trig_EatDragon_Func018A )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o00Z'), function Trig_EatDragon_Func020A )
endfunction

// --- InitTrig_EatDragon (family, line 44020) ---
function InitTrig_EatDragon takes nothing returns nothing
    set gg_trg_EatDragon = CreateTrigger(  )
    call DisableTrigger( gg_trg_EatDragon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EatDragon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EatDragon, Condition( function Trig_EatDragon_Conditions ) )
    call TriggerAddAction( gg_trg_EatDragon, function Trig_EatDragon_Actions )
endfunction
