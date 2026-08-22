// rawcode: A04N
// nameZh: 03-04 全彈發射
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 120, "2": 200, "3": 280}
// area: {"1": 500.0, "2": 500.0, "3": 500.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Allbullet

// === family Allbullet (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Allbullet_Conditions (family, line 32817) ---
function Trig_Allbullet_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A04N' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Allbullet_Func004002003 (family, line 32824) ---
function Trig_Allbullet_Func004002003 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_HERO) == true )
endfunction

// --- Trig_Allbullet_Func005A (family, line 32828) ---
function Trig_Allbullet_Func005A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 2 )) )
    call CameraSetTargetNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 3 )), 200.00 )
endfunction

// --- Trig_Allbullet_Func022Func003002003001 (family, line 32833) ---
function Trig_Allbullet_Func022Func003002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction

// --- Trig_Allbullet_Func022Func003002003002 (family, line 32837) ---
function Trig_Allbullet_Func022Func003002003002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == false )
endfunction

// --- Trig_Allbullet_Func022Func003002003 (family, line 32841) ---
function Trig_Allbullet_Func022Func003002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Allbullet_Func022Func003002003001(), Trig_Allbullet_Func022Func003002003002() )
endfunction

// --- Trig_Allbullet_Func022Func004Func001C (family, line 32845) ---
function Trig_Allbullet_Func022Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Allbullet_Func022Func004A (family, line 32852) ---
function Trig_Allbullet_Func022Func004A takes nothing returns nothing
    if ( Trig_Allbullet_Func022Func004Func001C() ) then
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), ( udg_LocReal * 0.50 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), udg_LocReal, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call UnitAddTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Allbullet_Func022Func006Func001C (family, line 32861) ---
function Trig_Allbullet_Func022Func006Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Allbullet_Func022Func006A (family, line 32868) ---
function Trig_Allbullet_Func022Func006A takes nothing returns nothing
    if ( Trig_Allbullet_Func022Func006Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_Allbullet_Func023Func002002003001 (family, line 32875) ---
function Trig_Allbullet_Func023Func002002003001 takes nothing returns boolean
    return ( IsPlayerAlly(GetOwningPlayer(GetFilterUnit()), GetOwningPlayer(GetTriggerUnit())) == false )
endfunction

// --- Trig_Allbullet_Func023Func002002003002 (family, line 32879) ---
function Trig_Allbullet_Func023Func002002003002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_ANCIENT) == true )
endfunction

// --- Trig_Allbullet_Func023Func002002003 (family, line 32883) ---
function Trig_Allbullet_Func023Func002002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Allbullet_Func023Func002002003001(), Trig_Allbullet_Func023Func002002003002() )
endfunction

// --- Trig_Allbullet_Func023Func003A (family, line 32887) ---
function Trig_Allbullet_Func023Func003A takes nothing returns nothing
    call UnitRemoveTypeBJ( UNIT_TYPE_ANCIENT, GetEnumUnit() )
endfunction

// --- Trig_Allbullet_Func028A (family, line 32891) ---
function Trig_Allbullet_Func028A takes nothing returns nothing
    call CameraClearNoiseForPlayer( GetEnumPlayer() )
endfunction

// --- Trig_Allbullet_Func029A (family, line 32895) ---
function Trig_Allbullet_Func029A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Allbullet_Func030A (family, line 32900) ---
function Trig_Allbullet_Func030A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Allbullet_Actions (family, line 32905) ---
function Trig_Allbullet_Actions takes nothing returns nothing
    set udg_LocPoint1 = GetUnitLoc(GetSpellAbilityUnit())
    set udg_LocPoint2 = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 100.00, GetUnitFacing(GetTriggerUnit()))
    set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, 150.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
    set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(512, udg_LocPoint1, Condition(function Trig_Allbullet_Func004002003))
    call ForGroupBJ( udg_TempUnitGroup, function Trig_Allbullet_Func005A )
    call DestroyGroup( udg_TempUnitGroup ) 
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )
    call TriggerExecute( gg_trg_Destroy_Effect )
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
    call TriggerExecute( gg_trg_Destroy_Effect )
    call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call CreateNUnitsAtLoc( 1, 'h00O', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )
    call CreateNUnitsAtLoc( 1, 'h00N', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 25.00 )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_LocPoint3 ) 
    set udg_LocReal = ( ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) * 2.00 ) + 200.00 )
    set udg_AllBullCounter = 1
    loop
        exitwhen udg_AllBullCounter > 6
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_AllBullCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        call CreateNUnitsAtLoc( 1, 'h006', GetOwningPlayer(GetTriggerUnit()), udg_LocPoint3, bj_UNIT_FACING )
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Allbullet_Func022Func003002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Allbullet_Func022Func004A )
        call DestroyGroup( udg_TempUnitGroup ) 
        call EnumDestructablesInCircleBJ( 400.00, udg_LocPoint3, function Trig_Allbullet_Func022Func006A )
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_AllBullCounter = udg_AllBullCounter + 1
    endloop
    set udg_AllBullCounter = 1
    loop
        exitwhen udg_AllBullCounter > 6
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_AllBullCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Allbullet_Func023Func002002003))
        call ForGroupBJ( udg_TempUnitGroup, function Trig_Allbullet_Func023Func003A )
        call DestroyGroup( udg_TempUnitGroup ) 
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_AllBullCounter = udg_AllBullCounter + 1
    endloop
    call RemoveLocation( udg_LocPoint1 ) 
    call RemoveLocation( udg_LocPoint2 ) 
    call RemoveLocation( udg_LocPoint3 ) 
    call TriggerSleepAction( 2 )
    call ForForce( GetPlayersAll(), function Trig_Allbullet_Func028A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h00N'), function Trig_Allbullet_Func029A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h00O'), function Trig_Allbullet_Func030A )
endfunction

// --- InitTrig_Allbullet (family, line 32959) ---
function InitTrig_Allbullet takes nothing returns nothing
    set gg_trg_Allbullet = CreateTrigger(  )
    call DisableTrigger( gg_trg_Allbullet )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Allbullet, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Allbullet, Condition( function Trig_Allbullet_Conditions ) )
    call TriggerAddAction( gg_trg_Allbullet, function Trig_Allbullet_Actions )
endfunction
