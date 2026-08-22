// unit rawcode: U00J
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Seph, EndBurn, FinalBolide, Hell_Gate, OneCut, Supernova

// === family Open_Skill_of_Seph (armed) events=none ===

// --- Trig_Open_Skill_of_Seph_Conditions (family, line 48349) ---
function Trig_Open_Skill_of_Seph_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00J' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Seph_Actions (family, line 48356) ---
function Trig_Open_Skill_of_Seph_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_OneCut )
    call EnableTrigger( gg_trg_EndBurn )
    call EnableTrigger( gg_trg_FinalBolide )
    call EnableTrigger( gg_trg_Supernova )
    call EnableTrigger( gg_trg_Hell_Gate )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "賽菲洛斯: 你也吃肯德基嗎?" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Seph (family, line 48368) ---
function InitTrig_Open_Skill_of_Seph takes nothing returns nothing
    set gg_trg_Open_Skill_of_Seph = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Seph, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Seph, Condition( function Trig_Open_Skill_of_Seph_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Seph, function Trig_Open_Skill_of_Seph_Actions )
endfunction

// === family EndBurn (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EndBurn_Conditions (family, line 48489) ---
function Trig_EndBurn_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0F4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EndBurn_Func006A (family, line 48496) ---
function Trig_EndBurn_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EndBurn_Actions (family, line 48501) ---
function Trig_EndBurn_Actions takes nothing returns nothing
    set udg_SephUnit = GetTriggerUnit()
    set udg_SephAngelPoint = GetSpellTargetLoc()
    set udg_SephAngelLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_SephAngelCounter = 1
    loop
        exitwhen udg_SephAngelCounter > 8
        set udg_SephAngelRandomPoint = GetRandomLocInRect(RectFromCenterSizeBJ(udg_SephAngelPoint, 600.00, 600.00))
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_SephUnit), udg_SephAngelPoint, udg_SephAngelRandomPoint )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A011', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A011', GetLastCreatedUnit(), udg_SephAngelLevel )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", udg_SephAngelRandomPoint )
        call TriggerSleepAction( 0.30 )
        set udg_SephAngelCounter = udg_SephAngelCounter + 1
    endloop
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SephUnit), 'hfoo'), function Trig_EndBurn_Func006A )
endfunction

// --- InitTrig_EndBurn (family, line 48522) ---
function InitTrig_EndBurn takes nothing returns nothing
    set gg_trg_EndBurn = CreateTrigger(  )
    call DisableTrigger( gg_trg_EndBurn )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EndBurn, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EndBurn, Condition( function Trig_EndBurn_Conditions ) )
    call TriggerAddAction( gg_trg_EndBurn, function Trig_EndBurn_Actions )
endfunction

// === family FinalBolide (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FinalBolide_Conditions (family, line 48533) ---
function Trig_FinalBolide_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0G5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FinalBolide_Func002Func001A (family, line 48540) ---
function Trig_FinalBolide_Func002Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_FinalBolide_Actions (family, line 48544) ---
function Trig_FinalBolide_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.30 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_FinalBolide_Func002Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 4.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_FinalBolide (family, line 48564) ---
function InitTrig_FinalBolide takes nothing returns nothing
    set gg_trg_FinalBolide = CreateTrigger(  )
    call DisableTrigger( gg_trg_FinalBolide )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FinalBolide, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FinalBolide, Condition( function Trig_FinalBolide_Conditions ) )
    call TriggerAddAction( gg_trg_FinalBolide, function Trig_FinalBolide_Actions )
endfunction

// === family Hell_Gate (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Hell_Gate_Conditions (family, line 48646) ---
function Trig_Hell_Gate_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0S4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func010Func001Func001C (family, line 48653) ---
function Trig_Hell_Gate_Func010Func001Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_SephUnit)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func010Func001C (family, line 48663) ---
function Trig_Hell_Gate_Func010Func001C takes nothing returns boolean
    if ( not Trig_Hell_Gate_Func010Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func010A (family, line 48670) ---
function Trig_Hell_Gate_Func010A takes nothing returns nothing
    if ( Trig_Hell_Gate_Func010Func001C() ) then
        call UnitDamageTargetBJ( udg_SephUnit, GetEnumUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_SephUnit) * 100 )) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Human\\HumanBlood\\HeroBloodElfBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "BloodBreathStream.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_Hell_Gate_Func017Func001C (family, line 48683) ---
function Trig_Hell_Gate_Func017Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_SephUnit))] == true ) ) then
        return false
    endif
    if ( not ( udg_SupernovaStart == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Func017Func003A (family, line 48693) ---
function Trig_Hell_Gate_Func017Func003A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 30.00 )
endfunction

// --- Trig_Hell_Gate_Func017Func009A (family, line 48697) ---
function Trig_Hell_Gate_Func017Func009A takes nothing returns nothing
    call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- Trig_Hell_Gate_Func017Func013A (family, line 48704) ---
function Trig_Hell_Gate_Func017Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Hell_Gate_Func017C (family, line 48709) ---
function Trig_Hell_Gate_Func017C takes nothing returns boolean
    if ( not Trig_Hell_Gate_Func017Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Gate_Actions (family, line 48716) ---
function Trig_Hell_Gate_Actions takes nothing returns nothing
    set udg_SephUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A0FZ', udg_SephUnit )
    call SetUnitFlyHeightBJ( udg_SephUnit, 1000.00, 2000.00 )
    call SetUnitInvulnerable( udg_SephUnit, true )
    call PauseUnitBJ( true, udg_SephUnit )
    call TriggerSleepAction( 0.30 )
    call SetUnitInvulnerable( udg_SephUnit, false )
    call SetUnitFlyHeightBJ( udg_SephUnit, 0.00, 2500.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(370.00, GetUnitLoc(udg_SephUnit)), function Trig_Hell_Gate_Func010A )
    call UnitRemoveAbilityBJ( 'A0FZ', udg_SephUnit )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PauseUnitBJ( false, udg_SephUnit )
    if ( Trig_Hell_Gate_Func017C() ) then
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_SephUnit), 1600.00, 1600.00)), function Trig_Hell_Gate_Func017Func003A )
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_SephUnit), GetUnitLoc(udg_SephUnit), GetUnitLoc(udg_SephUnit) )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0SW', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0SW', GetLastCreatedUnit(), 1 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", GetUnitLoc(udg_SephUnit) )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(udg_SephUnit)), function Trig_Hell_Gate_Func017Func009A )
        call TriggerSleepAction( 2.00 )
        set bj_forLoopBIndex = 1
        set bj_forLoopBIndexEnd = 12
        loop
            exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
            call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
            set bj_forLoopBIndex = bj_forLoopBIndex + 1
        endloop
        call TriggerSleepAction( 5.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SephUnit), 'hfoo'), function Trig_Hell_Gate_Func017Func013A )
    else
        call DoNothing(  )
    endif
    set udg_SupernovaStart = false
endfunction

// --- InitTrig_Hell_Gate (family, line 48758) ---
function InitTrig_Hell_Gate takes nothing returns nothing
    set gg_trg_Hell_Gate = CreateTrigger(  )
    call DisableTrigger( gg_trg_Hell_Gate )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Hell_Gate, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Hell_Gate, Condition( function Trig_Hell_Gate_Conditions ) )
    call TriggerAddAction( gg_trg_Hell_Gate, function Trig_Hell_Gate_Actions )
endfunction

// === family OneCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_OneCut_Conditions (family, line 48378) ---
function Trig_OneCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ET' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OneCut_Actions (family, line 48385) ---
function Trig_OneCut_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_SephUnit = GetTriggerUnit()
    set udg_OneCutCastPoint = GetSpellTargetLoc()
    set udg_OneCutPoint = GetUnitLoc(GetTriggerUnit())
    set udg_OneCutLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_OneCutCounter = 1
    set udg_OneCutDist = ( DistanceBetweenPoints(udg_OneCutCastPoint, udg_OneCutPoint) / 50.00 )
    call AddSpecialEffectLocBJ( udg_OneCutPoint, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A05U', udg_SephUnit )
    call PlaySoundOnUnitBJ( gg_snd_SnapDragonMissileLaunch1, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPathing( udg_SephUnit, false )
    call EnableTrigger( gg_trg_OneCutMove )
    set udg_SupernovaStart = true
endfunction

// --- InitTrig_OneCut (family, line 48404) ---
function InitTrig_OneCut takes nothing returns nothing
    set gg_trg_OneCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_OneCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_OneCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_OneCut, Condition( function Trig_OneCut_Conditions ) )
    call TriggerAddAction( gg_trg_OneCut, function Trig_OneCut_Actions )
endfunction

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
