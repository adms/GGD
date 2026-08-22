// unit rawcode: Nbst
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AdjustCrazy, Crazy_Movement

// === family AdjustCrazy (passive) events=none ===

// --- Trig_AdjustCrazy_Func001Func002Func006001 (family, line 25442) ---
function Trig_AdjustCrazy_Func001Func002Func006001 takes nothing returns boolean
    return ( RectContainsLoc(GetPlayableMapRect(), udg_DashPoint) == true )
endfunction

// --- Trig_AdjustCrazy_Func001Func002Func006002 (family, line 25446) ---
function Trig_AdjustCrazy_Func001Func002Func006002 takes nothing returns boolean
    return ( DistanceBetweenPoints(udg_DashCastPoint, udg_DashPoint) <= 1200.00 )
endfunction

// --- Trig_AdjustCrazy_Func001Func002C (family, line 25450) ---
function Trig_AdjustCrazy_Func001Func002C takes nothing returns boolean
    if ( not GetBooleanAnd( Trig_AdjustCrazy_Func001Func002Func006001(), Trig_AdjustCrazy_Func001Func002Func006002() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AdjustCrazy_Func001Func003Func006001 (family, line 25457) ---
function Trig_AdjustCrazy_Func001Func003Func006001 takes nothing returns boolean
    return ( RectContainsLoc(GetPlayableMapRect(), udg_DashPoint) == true )
endfunction

// --- Trig_AdjustCrazy_Func001Func003Func006002 (family, line 25461) ---
function Trig_AdjustCrazy_Func001Func003Func006002 takes nothing returns boolean
    return ( DistanceBetweenPoints(udg_DashCastPoint, udg_DashPoint) <= ( 600.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0AP', udg_CarzyStrike)) ) ) )
endfunction

// --- Trig_AdjustCrazy_Func001Func003C (family, line 25465) ---
function Trig_AdjustCrazy_Func001Func003C takes nothing returns boolean
    if ( not GetBooleanAnd( Trig_AdjustCrazy_Func001Func003Func006001(), Trig_AdjustCrazy_Func001Func003Func006002() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AdjustCrazy_Func001C (family, line 25472) ---
function Trig_AdjustCrazy_Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_CarzyStrike) == 'Nbst' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AdjustCrazy_Actions (family, line 25479) ---
function Trig_AdjustCrazy_Actions takes nothing returns nothing
    if ( Trig_AdjustCrazy_Func001C() ) then
        if ( Trig_AdjustCrazy_Func001Func003C() ) then
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_Samurai, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
            set udg_FireWepFX = GetLastCreatedEffectBJ()
            call AddSpecialEffectTargetUnitBJ( "hand, right", udg_Samurai, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
            set udg_FireHandFX = GetLastCreatedEffectBJ()
            call SetUnitAnimationByIndex( udg_CasterUnit,2)
            set udg_DashDistance = DistanceBetweenPoints(udg_DashCastPoint, udg_DashPoint)
            call GroupClear( udg_DashHitUnits )
            call EnableTrigger( gg_trg_Crazy_Movement )
            call DisableTrigger( GetTriggeringTrigger() )
        else
            call RemoveLocation(udg_DashPoint)
            set udg_DashPoint = PolarProjectionBJ(GetUnitLoc(udg_CarzyStrike), ( ( 400.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0AP', udg_CarzyStrike)) ) ) - udg_DashAdjust ), udg_DashAngle)
            set udg_DashAdjust = ( udg_DashAdjust + 35.00 )
        endif
    else
        if ( Trig_AdjustCrazy_Func001Func002C() ) then
            call AddSpecialEffectTargetUnitBJ( "weapon", udg_Samurai, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
            set udg_FireWepFX = GetLastCreatedEffectBJ()
            call AddSpecialEffectTargetUnitBJ( "hand, right", udg_Samurai, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
            set udg_FireHandFX = GetLastCreatedEffectBJ()
            call SetUnitAnimationByIndex( udg_CasterUnit,2)
            set udg_DashDistance = DistanceBetweenPoints(udg_DashCastPoint, udg_DashPoint)
            call GroupClear( udg_DashHitUnits )
            call EnableTrigger( gg_trg_Crazy_Movement )
            call DisableTrigger( GetTriggeringTrigger() )
        else
            call RemoveLocation(udg_DashPoint)
            set udg_DashPoint = PolarProjectionBJ(GetUnitLoc(udg_CarzyStrike), ( 600.00 - udg_DashAdjust ), udg_DashAngle)
            set udg_DashAdjust = ( udg_DashAdjust + 35.00 )
        endif
    endif
endfunction

// --- InitTrig_AdjustCrazy (family, line 25516) ---
function InitTrig_AdjustCrazy takes nothing returns nothing
    set gg_trg_AdjustCrazy = CreateTrigger(  )
    call DisableTrigger( gg_trg_AdjustCrazy )
    call TriggerRegisterTimerEventPeriodic( gg_trg_AdjustCrazy, 0.00 )
    call TriggerAddAction( gg_trg_AdjustCrazy, function Trig_AdjustCrazy_Actions )
endfunction

// === family Crazy_Movement (passive) events=none ===

// --- Trig_Crazy_Movement_Func003002003001 (family, line 25526) ---
function Trig_Crazy_Movement_Func003002003001 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_STRUCTURE) == false )
endfunction

// --- Trig_Crazy_Movement_Func003002003002001 (family, line 25530) ---
function Trig_Crazy_Movement_Func003002003002001 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_GROUND) == true )
endfunction

// --- Trig_Crazy_Movement_Func003002003002002001 (family, line 25534) ---
function Trig_Crazy_Movement_Func003002003002002001 takes nothing returns boolean
    return ( IsUnitAliveBJ(GetFilterUnit()) == true )
endfunction

// --- Trig_Crazy_Movement_Func003002003002002002001 (family, line 25538) ---
function Trig_Crazy_Movement_Func003002003002002002001 takes nothing returns boolean
    return ( IsUnitInGroup(GetFilterUnit(), udg_DashHitUnits) == false )
endfunction

// --- Trig_Crazy_Movement_Func003002003002002002002 (family, line 25542) ---
function Trig_Crazy_Movement_Func003002003002002002002 takes nothing returns boolean
    return ( IsUnitEnemy(GetFilterUnit(), GetOwningPlayer(udg_CarzyStrike)) == true )
endfunction

// --- Trig_Crazy_Movement_Func003002003002002002 (family, line 25546) ---
function Trig_Crazy_Movement_Func003002003002002002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Crazy_Movement_Func003002003002002002001(), Trig_Crazy_Movement_Func003002003002002002002() )
endfunction

// --- Trig_Crazy_Movement_Func003002003002002 (family, line 25550) ---
function Trig_Crazy_Movement_Func003002003002002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Crazy_Movement_Func003002003002002001(), Trig_Crazy_Movement_Func003002003002002002() )
endfunction

// --- Trig_Crazy_Movement_Func003002003002 (family, line 25554) ---
function Trig_Crazy_Movement_Func003002003002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Crazy_Movement_Func003002003002001(), Trig_Crazy_Movement_Func003002003002002() )
endfunction

// --- Trig_Crazy_Movement_Func003002003 (family, line 25558) ---
function Trig_Crazy_Movement_Func003002003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Crazy_Movement_Func003002003001(), Trig_Crazy_Movement_Func003002003002() )
endfunction

// --- Trig_Crazy_Movement_Func004Func007A (family, line 25562) ---
function Trig_Crazy_Movement_Func004Func007A takes nothing returns nothing
    call UnitDamageTargetBJ( udg_CarzyStrike, GetEnumUnit(), ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_CarzyStrike, true)) * 6.00 ) + 1500.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call AddSpecialEffectTargetUnitBJ( "origin", GetEnumUnit(), "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "head", GetEnumUnit(), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call GroupAddUnitSimple( GetEnumUnit(), udg_DashHitUnits )
endfunction

// --- Trig_Crazy_Movement_Func004Func008A (family, line 25571) ---
function Trig_Crazy_Movement_Func004Func008A takes nothing returns nothing
    call UnitDamageTargetBJ( udg_CarzyStrike, GetEnumUnit(), ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_CarzyStrike, true)) * 3.00 ) + ( I2R(( GetUnitAbilityLevelSwapped('A0AP', udg_CarzyStrike) * 100 )) + 250.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call AddSpecialEffectTargetUnitBJ( "origin", GetEnumUnit(), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "head", GetEnumUnit(), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call GroupAddUnitSimple( GetEnumUnit(), udg_DashHitUnits )
endfunction

// --- Trig_Crazy_Movement_Func004C (family, line 25580) ---
function Trig_Crazy_Movement_Func004C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_CarzyStrike) == 'Nbst' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Crazy_Movement_Func007Func001C (family, line 25587) ---
function Trig_Crazy_Movement_Func007Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_CarzyStrike) == 'Hvsh' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Crazy_Movement_Func007Func004C (family, line 25594) ---
function Trig_Crazy_Movement_Func007Func004C takes nothing returns boolean
    if ( ( udg_DashDistance <= 0.00 ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Crazy_Movement_Func007Func014A (family, line 25601) ---
function Trig_Crazy_Movement_Func007Func014A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Crazy_Movement_Func007Func015A (family, line 25606) ---
function Trig_Crazy_Movement_Func007Func015A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Crazy_Movement_Func007Func016A (family, line 25611) ---
function Trig_Crazy_Movement_Func007Func016A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Crazy_Movement_Func007Func017A (family, line 25616) ---
function Trig_Crazy_Movement_Func007Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Crazy_Movement_Func007Func018A (family, line 25621) ---
function Trig_Crazy_Movement_Func007Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Crazy_Movement_Func007C (family, line 25626) ---
function Trig_Crazy_Movement_Func007C takes nothing returns boolean
    if ( not Trig_Crazy_Movement_Func007Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Crazy_Movement_Actions (family, line 25633) ---
function Trig_Crazy_Movement_Actions takes nothing returns nothing
    set udg_DashMovePoint = PolarProjectionBJ(GetUnitLoc(udg_CarzyStrike), 60.00, udg_DashAngle)
    call SetUnitPositionLocFacingBJ( udg_CarzyStrike, udg_DashMovePoint, GetUnitFacing(udg_CarzyStrike) )
    set udg_DashedUnits = GetUnitsInRangeOfLocMatching(250.00, udg_DashMovePoint, Condition(function Trig_Crazy_Movement_Func003002003))
    if ( Trig_Crazy_Movement_Func004C() ) then
        call ForGroupBJ( udg_DashedUnits, function Trig_Crazy_Movement_Func004Func008A )
    else
        call SetUnitPositionLocFacingBJ( udg_RiderHorse, udg_DashMovePoint, GetUnitFacing(udg_CarzyStrike) )
        call SetUnitPositionLocFacingBJ( udg_RiderHorse2, udg_DashMovePoint, GetUnitFacing(udg_CarzyStrike) )
        call SetUnitPositionLocFacingBJ( udg_RiderHorse3, udg_DashMovePoint, GetUnitFacing(udg_CarzyStrike) )
        call SetUnitPositionLocFacingBJ( udg_RiderHorse4, udg_DashMovePoint, ( GetUnitFacing(udg_CarzyStrike) - 90.00 ) )
        call AddSpecialEffectLocBJ( udg_DashMovePoint, "Doodads\\Barrens\\Rocks\\BarrensFissure\\BarrensFissure1.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call ForGroupBJ( udg_DashedUnits, function Trig_Crazy_Movement_Func004Func007A )
    endif
    call RemoveLocation(udg_DashMovePoint)
    set udg_DashDistance = ( udg_DashDistance - 60.00 )
    if ( Trig_Crazy_Movement_Func007C() ) then
        if ( Trig_Crazy_Movement_Func007Func001C() ) then
            call CreateNUnitsAtLoc( 1, 'u00U', GetOwningPlayer(udg_CarzyStrike), GetUnitLoc(udg_CarzyStrike), GetUnitFacing(udg_CarzyStrike) )
        else
            call DoNothing(  )
        endif
        call DestroyEffectBJ( udg_FireHandFX )
        call DestroyEffectBJ( udg_FireWepFX )
        call GroupClear( udg_DashHitUnits )
        call RemoveLocation(udg_DashMovePoint)
        call RemoveLocation(udg_DashPoint)
        call RemoveLocation(udg_DashCastPoint)
        call SetUnitPathing( udg_CarzyStrike, true )
        call DisableTrigger( GetTriggeringTrigger() )
        set udg_CrazyBoolean = false
        call TriggerSleepAction( 1.50 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_CarzyStrike), 'h015'), function Trig_Crazy_Movement_Func007Func014A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_CarzyStrike), 'h02H'), function Trig_Crazy_Movement_Func007Func015A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_CarzyStrike), 'h02I'), function Trig_Crazy_Movement_Func007Func016A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_CarzyStrike), 'h02D'), function Trig_Crazy_Movement_Func007Func017A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_CarzyStrike), 'u00U'), function Trig_Crazy_Movement_Func007Func018A )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_Crazy_Movement (family, line 25677) ---
function InitTrig_Crazy_Movement takes nothing returns nothing
    set gg_trg_Crazy_Movement = CreateTrigger(  )
    call DisableTrigger( gg_trg_Crazy_Movement )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Crazy_Movement, 0.02 )
    call TriggerAddAction( gg_trg_Crazy_Movement, function Trig_Crazy_Movement_Actions )
endfunction
