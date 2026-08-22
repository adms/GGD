// unit rawcode: O00X
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Turtle_Power, Destroy_Effect

// === family Turtle_Power (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Turtle_Power_Conditions (family, line 31804) ---
function Trig_Turtle_Power_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A03S' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func005002003 (family, line 31811) ---
function Trig_Turtle_Power_Func005002003 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_HERO) == true )
endfunction

// --- Trig_Turtle_Power_Func006A (family, line 31815) ---
function Trig_Turtle_Power_Func006A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 2 )) )
    call CameraSetTargetNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 3 )), 200.00 )
endfunction

// --- Trig_Turtle_Power_Func019Func001C (family, line 31820) ---
function Trig_Turtle_Power_Func019Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_SSJ))] == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func019C (family, line 31827) ---
function Trig_Turtle_Power_Func019C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O00X' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func020Func003002003001 (family, line 31834) ---
function Trig_Turtle_Power_Func020Func003002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction

// --- Trig_Turtle_Power_Func020Func003002003002 (family, line 31838) ---
function Trig_Turtle_Power_Func020Func003002003002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == false )
endfunction

// --- Trig_Turtle_Power_Func020Func003002003 (family, line 31842) ---
function Trig_Turtle_Power_Func020Func003002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Turtle_Power_Func020Func003002003001(), Trig_Turtle_Power_Func020Func003002003002() )
endfunction

// --- Trig_Turtle_Power_Func020Func004Func001C (family, line 31846) ---
function Trig_Turtle_Power_Func020Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func020Func004A (family, line 31853) ---
function Trig_Turtle_Power_Func020Func004A takes nothing returns nothing
    if ( Trig_Turtle_Power_Func020Func004Func001C() ) then
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), udg_LocReal, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), ( udg_LocReal * 0.20 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call UnitAddTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Turtle_Power_Func020Func006Func001C (family, line 31862) ---
function Trig_Turtle_Power_Func020Func006Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turtle_Power_Func020Func006A (family, line 31869) ---
function Trig_Turtle_Power_Func020Func006A takes nothing returns nothing
    if ( Trig_Turtle_Power_Func020Func006Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_Turtle_Power_Func021Func002002003001 (family, line 31876) ---
function Trig_Turtle_Power_Func021Func002002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction

// --- Trig_Turtle_Power_Func021Func002002003002 (family, line 31880) ---
function Trig_Turtle_Power_Func021Func002002003002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == true )
endfunction

// --- Trig_Turtle_Power_Func021Func002002003 (family, line 31884) ---
function Trig_Turtle_Power_Func021Func002002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Turtle_Power_Func021Func002002003001(), Trig_Turtle_Power_Func021Func002002003002() )
endfunction

// --- Trig_Turtle_Power_Func021Func003A (family, line 31888) ---
function Trig_Turtle_Power_Func021Func003A takes nothing returns nothing
    call UnitRemoveTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Turtle_Power_Func026A (family, line 31892) ---
function Trig_Turtle_Power_Func026A takes nothing returns nothing
    call CameraClearNoiseForPlayer( GetEnumPlayer() )
endfunction

// --- Trig_Turtle_Power_Actions (family, line 31896) ---
function Trig_Turtle_Power_Actions takes nothing returns nothing
    set udg_LocPoint1 = GetUnitLoc(GetSpellAbilityUnit())
    set udg_LocPoint2 = GetSpellTargetLoc()
    set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, 150.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
    set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(512, udg_LocPoint1, Condition(function Trig_Turtle_Power_Func005002003))
    call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func006A )
    call DestroyGroup( udg_TempUnitGroup ) 
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )
    call TriggerExecute( gg_trg_Destroy_Effect )
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
    call TriggerExecute( gg_trg_Destroy_Effect )
    call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call CreateNUnitsAtLoc( 1, 'h008', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_LocPoint3 ) 
    if ( Trig_Turtle_Power_Func019C() ) then
        if ( Trig_Turtle_Power_Func019Func001C() ) then
            set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 5.00 ) ) + 150.00 )
        else
            set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 10.00 ) ) + 150.00 )
        endif
    else
        set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 2.00 ) ) + 150.00 )
    endif
    set udg_TurtlePowerCounter = 1
    loop
        exitwhen udg_TurtlePowerCounter > 6
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_TurtlePowerCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        call CreateNUnitsAtLoc( 1, 'h006', GetOwningPlayer(GetTriggerUnit()), udg_LocPoint3, bj_UNIT_FACING )
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Turtle_Power_Func020Func003002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func020Func004A )
        call DestroyGroup( udg_TempUnitGroup ) 
        call EnumDestructablesInCircleBJ( 400.00, udg_LocPoint3, function Trig_Turtle_Power_Func020Func006A )
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_TurtlePowerCounter = udg_TurtlePowerCounter + 1
    endloop
    set udg_TurtlePowerCounter = 1
    loop
        exitwhen udg_TurtlePowerCounter > 6
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_TurtlePowerCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Turtle_Power_Func021Func002002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func021Func003A )
        call DestroyGroup( udg_TempUnitGroup ) 
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_TurtlePowerCounter = udg_TurtlePowerCounter + 1
    endloop
    call RemoveLocation( udg_LocPoint1 ) 
    call RemoveLocation( udg_LocPoint2 ) 
    call RemoveLocation( udg_LocPoint3 ) 
    call TriggerSleepAction( 2 )
    call ForForce( GetPlayersAll(), function Trig_Turtle_Power_Func026A )
endfunction

// --- InitTrig_Turtle_Power (family, line 31953) ---
function InitTrig_Turtle_Power takes nothing returns nothing
    set gg_trg_Turtle_Power = CreateTrigger(  )
    call DisableTrigger( gg_trg_Turtle_Power )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Turtle_Power, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Turtle_Power, Condition( function Trig_Turtle_Power_Conditions ) )
    call TriggerAddAction( gg_trg_Turtle_Power, function Trig_Turtle_Power_Actions )
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
