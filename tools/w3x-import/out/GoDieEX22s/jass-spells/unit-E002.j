// unit rawcode: E002
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Saber, Air_Attack, Air_value_deal, Excalibur, ExcaliburMAX, avalonReady, saber

// === family Open_Skill_of_Saber (armed) events=none ===

// --- Trig_Open_Skill_of_Saber_Conditions (family, line 31964) ---
function Trig_Open_Skill_of_Saber_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E002' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Saber_Func019A (family, line 31971) ---
function Trig_Open_Skill_of_Saber_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Saber_Func020A (family, line 31976) ---
function Trig_Open_Skill_of_Saber_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Saber_Actions (family, line 31981) ---
function Trig_Open_Skill_of_Saber_Actions takes nothing returns nothing
    call TriggerRegisterUnitEvent( gg_trg_ExcaliburMAX, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_saber )
    call EnableTrigger( gg_trg_Air_Attack )
    call EnableTrigger( gg_trg_Air_value_deal )
    call EnableTrigger( gg_trg_Excalibur )
    call EnableTrigger( gg_trg_avalonReady )
    set udg_SaberUnit = GetTriggerUnit()
    set udg_saber = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'h00S', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call CreateNUnitsAtLoc( 1, 'o00G', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "Saber: 你是我的主人嗎?" + "|r" ) ) )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SaberUnit), 'h00S'), function Trig_Open_Skill_of_Saber_Func019A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SaberUnit), 'o00G'), function Trig_Open_Skill_of_Saber_Func020A )
endfunction

// --- InitTrig_Open_Skill_of_Saber (family, line 32003) ---
function InitTrig_Open_Skill_of_Saber takes nothing returns nothing
    set gg_trg_Open_Skill_of_Saber = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Saber, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Saber, Condition( function Trig_Open_Skill_of_Saber_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Saber, function Trig_Open_Skill_of_Saber_Actions )
endfunction

// === family Air_Attack (armed) events=none ===

// --- Trig_Air_Attack_Conditions (family, line 32146) ---
function Trig_Air_Attack_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'E00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Air_Attack_Func004C (family, line 32153) ---
function Trig_Air_Attack_Func004C takes nothing returns boolean
    if ( not ( IsUnitIllusionBJ(GetAttackedUnitBJ()) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitInGroup(GetAttackedUnitBJ(), udg_Des_Group) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Air_Attack_Actions (family, line 32166) ---
function Trig_Air_Attack_Actions takes nothing returns nothing
    set udg_AUD_DamagedUnit = GetAttackedUnitBJ()
    if ( Trig_Air_Attack_Func004C() ) then
        call GroupAddUnitSimple( GetTriggerUnit(), udg_Des_Group )
        call InitSetup( GetTriggerUnit() )
    else
    endif
endfunction

// --- InitTrig_Air_Attack (family, line 32176) ---
function InitTrig_Air_Attack takes nothing returns nothing
    set gg_trg_Air_Attack = CreateTrigger(  )
    call DisableTrigger( gg_trg_Air_Attack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Air_Attack, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Air_Attack, Condition( function Trig_Air_Attack_Conditions ) )
    call TriggerAddAction( gg_trg_Air_Attack, function Trig_Air_Attack_Actions )
endfunction

// === family Air_value_deal (armed) events=none ===

// --- Trig_Air_value_deal_Conditions (family, line 32122) ---
function Trig_Air_value_deal_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Air_value_deal_Actions (family, line 32129) ---
function Trig_Air_value_deal_Actions takes nothing returns nothing
    set udg_AUD_DamagedUnit = null
endfunction

// --- InitTrig_Air_value_deal (family, line 32134) ---
function InitTrig_Air_value_deal takes nothing returns nothing
    set gg_trg_Air_value_deal = CreateTrigger(  )
    call DisableTrigger( gg_trg_Air_value_deal )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Air_value_deal, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Air_value_deal, EVENT_PLAYER_UNIT_USE_ITEM )
    call TriggerAddCondition( gg_trg_Air_value_deal, Condition( function Trig_Air_value_deal_Conditions ) )
    call TriggerAddAction( gg_trg_Air_value_deal, function Trig_Air_value_deal_Actions )
endfunction

// === family Excalibur (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Excalibur_Conditions (family, line 32204) ---
function Trig_Excalibur_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0D5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Excalibur_Func007C (family, line 32211) ---
function Trig_Excalibur_Func007C takes nothing returns boolean
    if ( not ( udg_winSword == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Excalibur_Func012002003 (family, line 32218) ---
function Trig_Excalibur_Func012002003 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_HERO) == true )
endfunction

// --- Trig_Excalibur_Func013A (family, line 32222) ---
function Trig_Excalibur_Func013A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 3 )) )
    call CameraSetTargetNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 4 )), 200.00 )
endfunction

// --- Trig_Excalibur_Func019C (family, line 32227) ---
function Trig_Excalibur_Func019C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00Q' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Excalibur_Func027Func002002003001 (family, line 32234) ---
function Trig_Excalibur_Func027Func002002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction

// --- Trig_Excalibur_Func027Func002002003002001 (family, line 32238) ---
function Trig_Excalibur_Func027Func002002003002001 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == false )
endfunction

// --- Trig_Excalibur_Func027Func002002003002002 (family, line 32242) ---
function Trig_Excalibur_Func027Func002002003002002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_STRUCTURE) == false )
endfunction

// --- Trig_Excalibur_Func027Func002002003002 (family, line 32246) ---
function Trig_Excalibur_Func027Func002002003002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Excalibur_Func027Func002002003002001(), Trig_Excalibur_Func027Func002002003002002() )
endfunction

// --- Trig_Excalibur_Func027Func002002003 (family, line 32250) ---
function Trig_Excalibur_Func027Func002002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Excalibur_Func027Func002002003001(), Trig_Excalibur_Func027Func002002003002() )
endfunction

// --- Trig_Excalibur_Func027Func003A (family, line 32254) ---
function Trig_Excalibur_Func027Func003A takes nothing returns nothing
    call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), udg_LocReal, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call UnitAddTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Excalibur_Func027Func005Func001C (family, line 32259) ---
function Trig_Excalibur_Func027Func005Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Excalibur_Func027Func005A (family, line 32266) ---
function Trig_Excalibur_Func027Func005A takes nothing returns nothing
    if ( Trig_Excalibur_Func027Func005Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_Excalibur_Func028Func002002003001 (family, line 32273) ---
function Trig_Excalibur_Func028Func002002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction

// --- Trig_Excalibur_Func028Func002002003002 (family, line 32277) ---
function Trig_Excalibur_Func028Func002002003002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == true )
endfunction

// --- Trig_Excalibur_Func028Func002002003 (family, line 32281) ---
function Trig_Excalibur_Func028Func002002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Excalibur_Func028Func002002003001(), Trig_Excalibur_Func028Func002002003002() )
endfunction

// --- Trig_Excalibur_Func028Func003A (family, line 32285) ---
function Trig_Excalibur_Func028Func003A takes nothing returns nothing
    call UnitRemoveTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Excalibur_Func033A (family, line 32289) ---
function Trig_Excalibur_Func033A takes nothing returns nothing
    call CameraClearNoiseForPlayer( GetEnumPlayer() )
endfunction

// --- Trig_Excalibur_Func034A (family, line 32293) ---
function Trig_Excalibur_Func034A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Excalibur_Actions (family, line 32298) ---
function Trig_Excalibur_Actions takes nothing returns nothing
    set udg_SaberUnit = GetTriggerUnit()
    call CreateTextTagUnitBJ( "TRIGSTR_126", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    if ( Trig_Excalibur_Func007C() ) then
        call AddSpecialEffectTargetUnitBJ( "handright", GetTriggerUnit(), "Magical_Sword.mdx" )
        set udg_winSwordSp = GetLastCreatedEffectBJ()
        set udg_winSword = true
    else
    endif
    set udg_LocPoint1 = GetUnitLoc(GetSpellAbilityUnit())
    set udg_LocPoint2 = GetSpellTargetLoc()
    set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, 150.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
    set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(512, udg_LocPoint1, Condition(function Trig_Excalibur_Func012002003))
    call ForGroupBJ( udg_TempUnitGroup, function Trig_Excalibur_Func013A )
    call DestroyGroup( udg_TempUnitGroup ) 
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )
    call TriggerExecute( gg_trg_Destroy_Effect )
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
    call TriggerExecute( gg_trg_Destroy_Effect )
    if ( Trig_Excalibur_Func019C() ) then
        call CreateNUnitsAtLoc( 1, 'h00X', GetOwningPlayer(GetSpellAbilityUnit()), PolarProjectionBJ(udg_LocPoint3, 256.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2)), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    else
        call CreateNUnitsAtLoc( 1, 'h00S', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    endif
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call CreateNUnitsAtLoc( 1, 'h008', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_LocPoint3 ) 
    set udg_LocReal = ( ( 0.40 * GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) ) + ( ( I2R(GetUnitAbilityLevelSwapped('A0D5', GetTriggerUnit())) * 150.00 ) + 100.00 ) )
    set udg_WinSwordCounter = 1
    loop
        exitwhen udg_WinSwordCounter > 6
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_WinSwordCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Excalibur_Func027Func002002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Excalibur_Func027Func003A )
        call DestroyGroup( udg_TempUnitGroup ) 
        call EnumDestructablesInCircleBJ( 400.00, udg_LocPoint3, function Trig_Excalibur_Func027Func005A )
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_WinSwordCounter = udg_WinSwordCounter + 1
    endloop
    set udg_WinSwordCounter = 1
    loop
        exitwhen udg_WinSwordCounter > 6
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_WinSwordCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Excalibur_Func028Func002002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Excalibur_Func028Func003A )
        call DestroyGroup( udg_TempUnitGroup ) 
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_WinSwordCounter = udg_WinSwordCounter + 1
    endloop
    call RemoveLocation( udg_LocPoint1 ) 
    call RemoveLocation( udg_LocPoint2 ) 
    call RemoveLocation( udg_LocPoint3 ) 
    call TriggerSleepAction( 2 )
    call ForForce( GetPlayersAll(), function Trig_Excalibur_Func033A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SaberUnit), 'h00S'), function Trig_Excalibur_Func034A )
endfunction

// --- InitTrig_Excalibur (family, line 32363) ---
function InitTrig_Excalibur takes nothing returns nothing
    set gg_trg_Excalibur = CreateTrigger(  )
    call DisableTrigger( gg_trg_Excalibur )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Excalibur, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Excalibur, Condition( function Trig_Excalibur_Conditions ) )
    call TriggerAddAction( gg_trg_Excalibur, function Trig_Excalibur_Actions )
endfunction

// === family ExcaliburMAX (armed) events=none ===

// --- Trig_ExcaliburMAX_Func001C (family, line 32477) ---
function Trig_ExcaliburMAX_Func001C takes nothing returns boolean
    if ( not ( GetTriggerUnit() == udg_saber ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_saber))] == true ) ) then
        return false
    endif
    if ( not ( udg_IsAvalonReady == true ) ) then
        return false
    endif
    if ( not ( GetOwningPlayer(GetEventDamageSource()) != Player(PLAYER_NEUTRAL_AGGRESSIVE) ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEventDamageSource(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEventDamageSource(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetUnitManaPercent(GetTriggerUnit()) >= 70.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ExcaliburMAX_Conditions (family, line 32502) ---
function Trig_ExcaliburMAX_Conditions takes nothing returns boolean
    if ( not Trig_ExcaliburMAX_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ExcaliburMAX_Func020A (family, line 32509) ---
function Trig_ExcaliburMAX_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ExcaliburMAX_Func044Func001C (family, line 32514) ---
function Trig_ExcaliburMAX_Func044Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_saber)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ExcaliburMAX_Func044A (family, line 32524) ---
function Trig_ExcaliburMAX_Func044A takes nothing returns nothing
    if ( Trig_ExcaliburMAX_Func044Func001C() ) then
        call UnitDamageTargetBJ( udg_saber, GetEnumUnit(), 1800.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_ExcaliburMAX_Func052A (family, line 32535) ---
function Trig_ExcaliburMAX_Func052A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 20.00 )
endfunction

// --- Trig_ExcaliburMAX_Func056A (family, line 32539) ---
function Trig_ExcaliburMAX_Func056A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ExcaliburMAX_Func057A (family, line 32544) ---
function Trig_ExcaliburMAX_Func057A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ExcaliburMAX_Func058A (family, line 32549) ---
function Trig_ExcaliburMAX_Func058A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ExcaliburMAX_Func059A (family, line 32554) ---
function Trig_ExcaliburMAX_Func059A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ExcaliburMAX_Actions (family, line 32559) ---
function Trig_ExcaliburMAX_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_ExcalburMAXTarget = GetEventDamageSource()
    set udg_ExcalburCount = 0
    set udg_EXCaTakenDamage = ( GetEventDamage() * 0.60 )
    call PauseUnitBJ( true, udg_saber )
    call PauseUnitBJ( true, udg_ExcalburMAXTarget )
    call SetUnitInvulnerable( udg_saber, true )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, true )
    call UnitAddAbilityBJ( 'A0J7', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0J7', GetTriggerUnit() )
    set udg_ExcalburCount = 1
    loop
        exitwhen udg_ExcalburCount > 7
        call SetUnitPositionLocFacingLocBJ( udg_ExcalburMAXTarget, PolarProjectionBJ(GetUnitLoc(udg_ExcalburMAXTarget), 10.00, GetUnitFacing(udg_saber)), GetUnitLoc(udg_saber) )
        call SetUnitAnimation( udg_ExcalburMAXTarget, "death" )
        call SetUnitPositionLocFacingLocBJ( udg_saber, GetUnitLoc(udg_ExcalburMAXTarget), GetUnitLoc(udg_ExcalburMAXTarget) )
        call SetUnitTimeScalePercent( udg_saber, 600.00 )
        call SetUnitAnimation( udg_saber, "attack" )
        call CreateNUnitsAtLoc( 1, 'h02G', GetOwningPlayer(udg_saber), GetUnitLoc(udg_saber), GetUnitFacing(udg_ExcalburMAXTarget) )
        call SetUnitTimeScalePercent( GetLastCreatedUnit(), 600.00 )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 80.00, 10.00, 10.00, 50.00 )
        call SetUnitAnimation( GetLastCreatedUnit(), "attack" )
        call AddSpecialEffectTargetUnitBJ( "weapon", GetLastCreatedUnit(), "Abilities\\Spells\\Demon\\DarkPortal\\DarkPortalTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(udg_ExcalburCount) + ( "Hit" + "" ) ), udg_saber, -30.00, ( ( I2R(udg_ExcalburCount) * 4.00 ) + 8.00 ), 100, 100.00, 100.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, GetRandomDirectionDeg() )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_ExcalburMAXTarget, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "Abilities\\Spells\\Demon\\DarkPortal\\DarkPortalTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100, udg_saber )
        call CreateNUnitsAtLoc( 1, 'u018', GetOwningPlayer(udg_saber), GetUnitLoc(udg_saber), GetRandomDirectionDeg() )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 100.00, 100.00, 100.00, 50.00 )
        call SetUnitInvulnerable( udg_ExcalburMAXTarget, false )
        call UnitDamageTargetBJ( udg_saber, udg_ExcalburMAXTarget, udg_EXCaTakenDamage, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call SetUnitInvulnerable( udg_ExcalburMAXTarget, true )
        call CreateTextTagUnitBJ( ( I2S(R2I(udg_EXCaTakenDamage)) + "!" ), udg_saber, -30.00, 10.00, 30.00, 90.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call TriggerSleepAction( GetRandomReal(0.05, 0.30) )
        set udg_ExcalburCount = udg_ExcalburCount + 1
    endloop
    call SetUnitTimeScalePercent( udg_saber, 100.00 )
    call SetUnitAnimationWithRarity( udg_saber, "attack", RARITY_RARE )
    call PlaySoundOnUnitBJ( gg_snd_FlameStrikeTargetWaveNonLoop1, 100, udg_saber )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "Abilities\\Spells\\Items\\AIvi\\AIviTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h02G'), function Trig_ExcaliburMAX_Func020A )
    call TriggerSleepAction( 0.10 )
    call PlaySoundOnUnitBJ( gg_snd_SuccubusYesAttack2, 100, udg_saber )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_saber, "HolyAwakening.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "handright", udg_saber, "Magical_Sword.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitTimeScalePercent( udg_saber, 30.00 )
    call TriggerSleepAction( 0.30 )
    call CreateTextTagUnitBJ( "TRIGSTR_9046", udg_saber, -30.00, 40.00, 100, 100.00, 100.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, udg_superAngle )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call CreateNUnitsAtLoc( 1, 'h00S', GetOwningPlayer(udg_saber), PolarProjectionBJ(GetUnitLoc(udg_saber), 70.00, GetUnitFacing(udg_saber)), GetUnitFacing(udg_saber) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 350.00, 350.00, 350.00 )
    call CreateNUnitsAtLoc( 1, 'h008', GetOwningPlayer(udg_saber), GetUnitLoc(udg_ExcalburMAXTarget), GetUnitFacing(udg_saber) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 400.00, 400.00, 400.00 )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_ExcalburMAXTarget), "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_ExcalburMAXTarget), "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, false )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, PolarProjectionBJ(GetUnitLoc(udg_saber), 350.00, GetUnitFacing(udg_saber))), function Trig_ExcaliburMAX_Func044A )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, true )
    call TriggerSleepAction( 0.20 )
    call SetUnitInvulnerable( udg_saber, false )
    call SetUnitInvulnerable( udg_ExcalburMAXTarget, false )
    call PauseUnitBJ( false, udg_saber )
    call PauseUnitBJ( false, udg_ExcalburMAXTarget )
    call SetUnitTimeScalePercent( udg_saber, 100.00 )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_saber), 1600.00, 1600.00)), function Trig_ExcaliburMAX_Func052A )
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 4.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h02G'), function Trig_ExcaliburMAX_Func056A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h00S'), function Trig_ExcaliburMAX_Func057A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'h008'), function Trig_ExcaliburMAX_Func058A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_saber), 'u018'), function Trig_ExcaliburMAX_Func059A )
    call EnableTrigger( gg_trg_ExcaliburMAX )
endfunction

// --- InitTrig_ExcaliburMAX (family, line 32664) ---
function InitTrig_ExcaliburMAX takes nothing returns nothing
    set gg_trg_ExcaliburMAX = CreateTrigger(  )
    call TriggerAddCondition( gg_trg_ExcaliburMAX, Condition( function Trig_ExcaliburMAX_Conditions ) )
    call TriggerAddAction( gg_trg_ExcaliburMAX, function Trig_ExcaliburMAX_Actions )
endfunction

// === family avalonReady (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_avalonReady_Conditions (family, line 32374) ---
function Trig_avalonReady_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CT' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_avalonReady_Actions (family, line 32381) ---
function Trig_avalonReady_Actions takes nothing returns nothing
    set udg_SaberUnit = GetTriggerUnit()
    set udg_IsAvalonReady = true
    call EnableTrigger( gg_trg_avalonStart )
    call TriggerSleepAction( I2R(( GetUnitAbilityLevelSwapped('A0CT', GetTriggerUnit()) + 1 )) )
    call DisableTrigger( gg_trg_avalonStart )
    set udg_IsAvalonReady = false
endfunction

// --- InitTrig_avalonReady (family, line 32391) ---
function InitTrig_avalonReady takes nothing returns nothing
    set gg_trg_avalonReady = CreateTrigger(  )
    call DisableTrigger( gg_trg_avalonReady )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_avalonReady, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_avalonReady, Condition( function Trig_avalonReady_Conditions ) )
    call TriggerAddAction( gg_trg_avalonReady, function Trig_avalonReady_Actions )
endfunction

// === family saber (armed) events=none ===

// --- Trig_saber_Conditions (family, line 32013) ---
function Trig_saber_Conditions takes nothing returns boolean
    if ( not ( IsUnitType(GetTriggerUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_saber_Func002Func001Func002Func001C (family, line 32020) ---
function Trig_saber_Func002Func001Func002Func001C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetEnumUnit()) == 'E002' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetEnumUnit()) == 'E00L' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_saber_Func002Func001Func002C (family, line 32030) ---
function Trig_saber_Func002Func001Func002C takes nothing returns boolean
    if ( not Trig_saber_Func002Func001Func002Func001C() ) then
        return false
    endif
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    if ( not ( GetUnitManaPercent(GetEnumUnit()) >= 30.00 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 2) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_saber_Func002Func001C (family, line 32046) ---
function Trig_saber_Func002Func001C takes nothing returns boolean
    if ( not Trig_saber_Func002Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_saber_Func002A (family, line 32053) ---
function Trig_saber_Func002A takes nothing returns nothing
    if ( Trig_saber_Func002Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'o00G', GetOwningPlayer(GetEnumUnit()), GetUnitLoc(GetEnumUnit()), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0CZ', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0CZ', GetLastCreatedUnit(), GetUnitLevel(GetEnumUnit()) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "antimagicshell", GetEnumUnit() )
        call CreateTextTagUnitBJ( "TRIGSTR_884", GetEnumUnit(), -30.00, 12.00, 100, 0.00, 0.00, 40.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_saber_Actions (family, line 32072) ---
function Trig_saber_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsInRangeOfLocAll(1200.00, GetUnitLoc(GetTriggerUnit())), function Trig_saber_Func002A )
endfunction

// --- InitTrig_saber (family, line 32077) ---
function InitTrig_saber takes nothing returns nothing
    set gg_trg_saber = CreateTrigger(  )
    call DisableTrigger( gg_trg_saber )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_saber, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_saber, Condition( function Trig_saber_Conditions ) )
    call TriggerAddAction( gg_trg_saber, function Trig_saber_Actions )
endfunction
