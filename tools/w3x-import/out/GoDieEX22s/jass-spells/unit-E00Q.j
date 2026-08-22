// unit rawcode: E00Q
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Excalibur, Destroy_Effect, Open_Skill_of_DarkSaber, InSpace, ManaIcrease

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

// === family Destroy_Effect (armed) events=none ===

// --- Trig_Destroy_Effect_Actions (family, line 25996) ---
function Trig_Destroy_Effect_Actions takes nothing returns nothing
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- InitTrig_Destroy_Effect (family, line 26001) ---
function InitTrig_Destroy_Effect takes nothing returns nothing
    set gg_trg_Destroy_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_Destroy_Effect )
    call TriggerAddAction( gg_trg_Destroy_Effect, function Trig_Destroy_Effect_Actions )
endfunction

// === family Open_Skill_of_DarkSaber (armed) events=none ===

// --- Trig_Open_Skill_of_DarkSaber_Conditions (family, line 32673) ---
function Trig_Open_Skill_of_DarkSaber_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00Q' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_DarkSaber_Func010A (family, line 32680) ---
function Trig_Open_Skill_of_DarkSaber_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_DarkSaber_Actions (family, line 32685) ---
function Trig_Open_Skill_of_DarkSaber_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_InSpace )
    call EnableTrigger( gg_trg_Excalibur )
    call EnableTrigger( gg_trg_ManaIcrease )
    call CreateNUnitsAtLoc( 1, 'h00X', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "Saber: 你是我的主人嗎?" + "|r" ) ) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SaberUnit), 'h00S'), function Trig_Open_Skill_of_DarkSaber_Func010A )
endfunction

// --- InitTrig_Open_Skill_of_DarkSaber (family, line 32698) ---
function InitTrig_Open_Skill_of_DarkSaber takes nothing returns nothing
    set gg_trg_Open_Skill_of_DarkSaber = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_DarkSaber, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_DarkSaber, Condition( function Trig_Open_Skill_of_DarkSaber_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_DarkSaber, function Trig_Open_Skill_of_DarkSaber_Actions )
endfunction

// === family InSpace (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_InSpace_Conditions (family, line 32744) ---
function Trig_InSpace_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0FK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_InSpace_Func010A (family, line 32751) ---
function Trig_InSpace_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_InSpace_Func011A (family, line 32756) ---
function Trig_InSpace_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_InSpace_Actions (family, line 32761) ---
function Trig_InSpace_Actions takes nothing returns nothing
    set udg_BlackHole = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o00S', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0FM', GetLastCreatedUnit() )
    call PlaySoundOnUnitBJ( gg_snd_Parasite, 100, GetLastCreatedUnit() )
    call TerrainDeformationRippleBJ( 6.00, false, GetUnitLoc(GetTriggerUnit()), 600.00, 600.00, 64.00, 1.00, 600.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    set udg_BlackHoleCount = 1
    loop
        exitwhen udg_BlackHoleCount > 9
        call CreateNUnitsAtLoc( 1, 'u02S', GetOwningPlayer(GetTriggerUnit()), GetRandomLocInRect(RectFromCenterSizeBJ(GetUnitLoc(GetTriggerUnit()), 600.00, 600.00)), GetRandomDirectionDeg() )
        set udg_BlackHoleCount = udg_BlackHoleCount + 1
    endloop
    call TriggerSleepAction( 8.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BlackHole), 'o00S'), function Trig_InSpace_Func010A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BlackHole), 'u02S'), function Trig_InSpace_Func011A )
endfunction

// --- InitTrig_InSpace (family, line 32781) ---
function InitTrig_InSpace takes nothing returns nothing
    set gg_trg_InSpace = CreateTrigger(  )
    call DisableTrigger( gg_trg_InSpace )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InSpace, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_InSpace, Condition( function Trig_InSpace_Conditions ) )
    call TriggerAddAction( gg_trg_InSpace, function Trig_InSpace_Actions )
endfunction

// === family ManaIcrease (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_ManaIcrease_Conditions (family, line 32708) ---
function Trig_ManaIcrease_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00Q' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManaIcrease_Func002C (family, line 32715) ---
function Trig_ManaIcrease_Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0FS', GetTriggerUnit()) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManaIcrease_Actions (family, line 32722) ---
function Trig_ManaIcrease_Actions takes nothing returns nothing
    call SetPlayerTechResearchedSwap( 'Rhpt', GetUnitAbilityLevelSwapped('A0FS', GetTriggerUnit()), GetOwningPlayer(GetTriggerUnit()) )
    if ( Trig_ManaIcrease_Func002C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_ManaIcrease (family, line 32732) ---
function InitTrig_ManaIcrease takes nothing returns nothing
    set gg_trg_ManaIcrease = CreateTrigger(  )
    call DisableTrigger( gg_trg_ManaIcrease )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ManaIcrease, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ManaIcrease, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_ManaIcrease, Condition( function Trig_ManaIcrease_Conditions ) )
    call TriggerAddAction( gg_trg_ManaIcrease, function Trig_ManaIcrease_Actions )
endfunction
