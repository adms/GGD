// unit rawcode: U00V
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Rabbit, GroundAttack, HoLuKen, PowerKnockBack, TwoPowerEX

// === family Open_Skill_of_Rabbit (armed) events=none ===

// --- Trig_Open_Skill_of_Rabbit_Conditions (family, line 49948) ---
function Trig_Open_Skill_of_Rabbit_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00V' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Rabbit_Actions (family, line 49955) ---
function Trig_Open_Skill_of_Rabbit_Actions takes nothing returns nothing
    set udg_RabCastUnit = GetTriggerUnit()
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_GroundAttack )
    call EnableTrigger( gg_trg_HoLuKen )
    call EnableTrigger( gg_trg_PowerKnockBack )
    call EnableTrigger( gg_trg_TwoPowerEX )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "基廉列克: ......(盯著帆布鞋)" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Rabbit (family, line 49967) ---
function InitTrig_Open_Skill_of_Rabbit takes nothing returns nothing
    set gg_trg_Open_Skill_of_Rabbit = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Rabbit, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Rabbit, Condition( function Trig_Open_Skill_of_Rabbit_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Rabbit, function Trig_Open_Skill_of_Rabbit_Actions )
endfunction

// === family GroundAttack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GroundAttack_Conditions (family, line 49977) ---
function Trig_GroundAttack_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0L4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GroundAttack_Func014A (family, line 49984) ---
function Trig_GroundAttack_Func014A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_GroundAttack_Actions (family, line 49988) ---
function Trig_GroundAttack_Actions takes nothing returns nothing
    set udg_RabCastUnit = GetTriggerUnit()
    set udg_RabFacing = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetSpellTargetLoc())
    set udg_RabTarget = GetSpellTargetLoc()
    set udg_RabUnitPoint = GetUnitLoc(GetTriggerUnit())
    set udg_RabLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_RabDistance = ( DistanceBetweenPoints(udg_RabUnitPoint, udg_RabTarget) / 75.00 )
    call ShowUnitHide( udg_RabCastUnit )
    call TriggerSleepAction( 0.01 )
    set udg_RabCounter = 1
    loop
        exitwhen udg_RabCounter > R2I(udg_RabDistance)
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_RabUnitPoint, ( 75.00 * I2R(udg_RabCounter) ), udg_RabFacing), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TerrainDeformationRippleBJ( 1.00, true, PolarProjectionBJ(udg_RabUnitPoint, ( I2R(udg_RabCounter) * 50.00 ), udg_RabFacing), 100.00, 340.00, 48.00, 1, 200.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit2, 100, udg_RabTarget, 0 )
        call TriggerSleepAction( 0.01 )
        set udg_RabCounter = udg_RabCounter + 1
    endloop
    call SetUnitPositionLoc( udg_RabCastUnit, udg_RabTarget )
    call ShowUnitShow( udg_RabCastUnit )
    call SelectUnitForPlayerSingle( udg_RabCastUnit, GetOwningPlayer(udg_RabCastUnit) )
    set udg_RabCounter = 1
    loop
        exitwhen udg_RabCounter > 10
        call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_RabCastUnit), PolarProjectionBJ(udg_RabTarget, 160.00, I2R(udg_RabCounter)), GetRandomDirectionDeg() )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_RabGroup )
        call AddSpecialEffectLocBJ( udg_RabTarget, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_RabCounter = udg_RabCounter + 1
    endloop
    call EnumDestructablesInCircleBJ( 400.00, GetUnitLoc(udg_RabCastUnit), function Trig_GroundAttack_Func014A )
    call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_RabCastUnit), udg_RabTarget, GetRandomDirectionDeg() )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0L7', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0L7', GetLastCreatedUnit(), udg_RabLevel )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call TerrainDeformationRippleBJ( 5.00, true, udg_RabTarget, 100.00, 340.00, 88.00, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit1, 100, udg_RabTarget, 0 )
endfunction

// --- InitTrig_GroundAttack (family, line 50032) ---
function InitTrig_GroundAttack takes nothing returns nothing
    set gg_trg_GroundAttack = CreateTrigger(  )
    call DisableTrigger( gg_trg_GroundAttack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GroundAttack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GroundAttack, Condition( function Trig_GroundAttack_Conditions ) )
    call TriggerAddAction( gg_trg_GroundAttack, function Trig_GroundAttack_Actions )
endfunction

// === family HoLuKen (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HoLuKen_Conditions (family, line 50043) ---
function Trig_HoLuKen_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0L2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HoLuKen_Func007A (family, line 50050) ---
function Trig_HoLuKen_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HoLuKen_Func008A (family, line 50055) ---
function Trig_HoLuKen_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HoLuKen_Actions (family, line 50060) ---
function Trig_HoLuKen_Actions takes nothing returns nothing
    set udg_Hell = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o01P', GetOwningPlayer(GetTriggerUnit()), udg_Hell, bj_UNIT_FACING )
    call SetUnitScalePercent( GetLastCreatedUnit(), 240.00, 240.00, 240.00 )
    call PlaySoundOnUnitBJ( gg_snd_DragonYes2, 100, GetTriggerUnit() )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_RabCastUnit), 'o01P'), function Trig_HoLuKen_Func007A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_RabCastUnit), 'oshm'), function Trig_HoLuKen_Func008A )
endfunction

// --- InitTrig_HoLuKen (family, line 50071) ---
function InitTrig_HoLuKen takes nothing returns nothing
    set gg_trg_HoLuKen = CreateTrigger(  )
    call DisableTrigger( gg_trg_HoLuKen )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HoLuKen, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HoLuKen, Condition( function Trig_HoLuKen_Conditions ) )
    call TriggerAddAction( gg_trg_HoLuKen, function Trig_HoLuKen_Actions )
endfunction

// === family PowerKnockBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PowerKnockBack_Func002C (family, line 50082) ---
function Trig_PowerKnockBack_Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0L6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PowerKnockBack_Conditions (family, line 50092) ---
function Trig_PowerKnockBack_Conditions takes nothing returns boolean
    if ( not Trig_PowerKnockBack_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_PowerKnockBack_Func020Func001A (family, line 50099) ---
function Trig_PowerKnockBack_Func020Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_PowerKnockBack_Actions (family, line 50103) ---
function Trig_PowerKnockBack_Actions takes nothing returns nothing
    set udg_RabUnit = GetTriggerUnit()
    set udg_PKnockBack_Index = 0
    set udg_PKnockBack_Target = GetSpellTargetUnit()
    set udg_PP1 = GetUnitLoc(GetTriggerUnit())
    set udg_PP2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_PKnockBack_Angle = AngleBetweenPoints(udg_PP1, udg_PP2)
    call TriggerSleepAction( 0.50 )
    call AddSpecialEffectLocBJ( udg_PP1, "Boomnl.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLoc( udg_RabUnit, GetUnitLoc(udg_PKnockBack_Target) )
    call CreateTextTagUnitBJ( "TRIGSTR_209", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call EnableTrigger( gg_trg_PowerKnockBack_Effect )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_PKnockBack_Target, "BloodBreathStream.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_PowerKnockBack_Func020Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_PowerKnockBack (family, line 50140) ---
function InitTrig_PowerKnockBack takes nothing returns nothing
    set gg_trg_PowerKnockBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_PowerKnockBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PowerKnockBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PowerKnockBack, Condition( function Trig_PowerKnockBack_Conditions ) )
    call TriggerAddAction( gg_trg_PowerKnockBack, function Trig_PowerKnockBack_Actions )
endfunction

// === family TwoPowerEX (armed) events=none ===

// --- Trig_TwoPowerEX_Func011C (family, line 50234) ---
function Trig_TwoPowerEX_Func011C takes nothing returns boolean
    if ( not ( GetAttacker() == udg_RabCastUnit ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_RabCastUnit))] == true ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 7) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TwoPowerEX_Conditions (family, line 50247) ---
function Trig_TwoPowerEX_Conditions takes nothing returns boolean
    if ( not Trig_TwoPowerEX_Func011C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_TwoPowerEX_Actions (family, line 50254) ---
function Trig_TwoPowerEX_Actions takes nothing returns nothing
    set udg_Immediately_P1 = GetUnitLoc(udg_RabCastUnit)
    call CreateNUnitsAtLoc( 1, 'oshm', GetOwningPlayer(udg_RabCastUnit), udg_Immediately_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "bloodlust", udg_RabCastUnit )
    call UnitAddAbilityBJ( 'A0SR', GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call RemoveLocation( udg_Immediately_P1 )
    call PlaySoundOnUnitBJ( gg_snd_SuccubusYesAttack2, 100, udg_RabCastUnit )
endfunction

// --- InitTrig_TwoPowerEX (family, line 50267) ---
function InitTrig_TwoPowerEX takes nothing returns nothing
    set gg_trg_TwoPowerEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_TwoPowerEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TwoPowerEX, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_TwoPowerEX, Condition( function Trig_TwoPowerEX_Conditions ) )
    call TriggerAddAction( gg_trg_TwoPowerEX, function Trig_TwoPowerEX_Actions )
endfunction
