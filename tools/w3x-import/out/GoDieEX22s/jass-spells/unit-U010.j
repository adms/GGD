// unit rawcode: U010
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DarkDragonEX, Closeaeff, DarkDragonEXMove, HehiSword, HehiSwordEffect

// === family DarkDragonEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DarkDragonEX_Conditions (family, line 44031) ---
function Trig_DarkDragonEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEX_Func008Func001C (family, line 44038) ---
function Trig_DarkDragonEX_Func008Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEX_Func008C (family, line 44048) ---
function Trig_DarkDragonEX_Func008C takes nothing returns boolean
    if ( not Trig_DarkDragonEX_Func008Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEX_Func018A (family, line 44055) ---
function Trig_DarkDragonEX_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEX_Actions (family, line 44060) ---
function Trig_DarkDragonEX_Actions takes nothing returns nothing
    set udg_DarkDragonCastUnit = GetTriggerUnit()
    set udg_DarkDragonPoint = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 160.00, GetUnitFacing(GetTriggerUnit()))
    call CreateNUnitsAtLoc( 1, 'h02F', GetOwningPlayer(GetTriggerUnit()), udg_DarkDragonPoint, GetUnitFacing(GetTriggerUnit()) )
    set udg_DarkDragonUnit = GetLastCreatedUnit()
    set udg_DarkDragonMoveSpeed = 130.00
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 10.00 )
    if ( Trig_DarkDragonEX_Func008C() ) then
        set udg_DarkDragonPoint2 = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 200.00, ( 45.00 + GetUnitFacing(GetTriggerUnit()) ))
        set udg_DarkDragonPoint3 = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 200.00, ( -45.00 + GetUnitFacing(GetTriggerUnit()) ))
        call CreateNUnitsAtLoc( 1, 'h02F', GetOwningPlayer(GetTriggerUnit()), udg_DarkDragonPoint2, GetUnitFacing(GetTriggerUnit()) )
        set udg_DarkDragonUnit2 = GetLastCreatedUnit()
        call SetUnitTimeScalePercent( GetLastCreatedUnit(), 30.00 )
        call CreateNUnitsAtLoc( 1, 'h02F', GetOwningPlayer(GetTriggerUnit()), udg_DarkDragonPoint3, GetUnitFacing(GetTriggerUnit()) )
        set udg_DarkDragonUnit3 = GetLastCreatedUnit()
        call SetUnitTimeScalePercent( GetLastCreatedUnit(), 30.00 )
    else
    endif
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call GroupClear( udg_DarkDragonGroup )
    set udg_DarkDragonCount = 0
    call EnableTrigger( gg_trg_DarkDragonEXMove )
    set udg_BlackDGP = GetUnitLoc(GetTriggerUnit())
    set udg_Hehi = GetTriggerUnit()
    set udg_BlackDargon = 1
    loop
        exitwhen udg_BlackDargon > 12
        call CreateNUnitsAtLoc( 1, 'o00Z', Player(bj_PLAYER_NEUTRAL_VICTIM), PolarProjectionBJ(udg_BlackDGP, 350.00, ( I2R(udg_BlackDargon) * 30.00 )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A09M', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A09M', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "clusterrockets", GetUnitLoc(GetLastCreatedUnit()) )
        call EnableTrigger( gg_trg_Closeaeff )
        call PlaySoundOnUnitBJ( gg_snd_ShimmeringPortalDeath, 100, GetTriggerUnit() )
        set udg_BlackDargon = udg_BlackDargon + 1
    endloop
    call PlaySoundOnUnitBJ( gg_snd_DragonYes2, 100.00, udg_AFuUnit )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(bj_PLAYER_NEUTRAL_VICTIM), 'o00Z'), function Trig_DarkDragonEX_Func018A )
endfunction

// --- InitTrig_DarkDragonEX (family, line 44102) ---
function InitTrig_DarkDragonEX takes nothing returns nothing
    set gg_trg_DarkDragonEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_DarkDragonEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DarkDragonEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DarkDragonEX, Condition( function Trig_DarkDragonEX_Conditions ) )
    call TriggerAddAction( gg_trg_DarkDragonEX, function Trig_DarkDragonEX_Actions )
endfunction

// === family Closeaeff (armed) events=none ===

// --- Trig_Closeaeff_Actions (family, line 25051) ---
function Trig_Closeaeff_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- InitTrig_Closeaeff (family, line 25057) ---
function InitTrig_Closeaeff takes nothing returns nothing
    set gg_trg_Closeaeff = CreateTrigger(  )
    call DisableTrigger( gg_trg_Closeaeff )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Closeaeff, 2.00 )
    call TriggerAddAction( gg_trg_Closeaeff, function Trig_Closeaeff_Actions )
endfunction

// === family DarkDragonEXMove (passive) events=none ===

// --- Trig_DarkDragonEXMove_Func002Func002Func003Func007C (family, line 44113) ---
function Trig_DarkDragonEXMove_Func002Func002Func003Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_DarkDragonCastUnit))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(udg_DarkDragonCastUnit) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func002Func003C (family, line 44123) ---
function Trig_DarkDragonEXMove_Func002Func002Func003C takes nothing returns boolean
    if ( not Trig_DarkDragonEXMove_Func002Func002Func003Func007C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func002Func009Func007C (family, line 44130) ---
function Trig_DarkDragonEXMove_Func002Func002Func009Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_DarkDragonCastUnit))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(udg_DarkDragonCastUnit) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func002Func009C (family, line 44140) ---
function Trig_DarkDragonEXMove_Func002Func002Func009C takes nothing returns boolean
    if ( not Trig_DarkDragonEXMove_Func002Func002Func009Func007C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func002C (family, line 44147) ---
function Trig_DarkDragonEXMove_Func002Func002C takes nothing returns boolean
    if ( not ( ModuloInteger(udg_DarkDragonCount, 2) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func004Func001C (family, line 44154) ---
function Trig_DarkDragonEXMove_Func002Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_DarkDragonGroup) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func004A (family, line 44161) ---
function Trig_DarkDragonEXMove_Func002Func004A takes nothing returns nothing
    if ( Trig_DarkDragonEXMove_Func002Func004Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_DarkDragonGroup )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Boomnl.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func001C (family, line 44171) ---
function Trig_DarkDragonEXMove_Func002Func005Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_DarkDragonCastUnit))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(udg_DarkDragonCastUnit) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func004Func001C (family, line 44181) ---
function Trig_DarkDragonEXMove_Func002Func005Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_DarkDragonGroup) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func004A (family, line 44188) ---
function Trig_DarkDragonEXMove_Func002Func005Func004A takes nothing returns nothing
    if ( Trig_DarkDragonEXMove_Func002Func005Func004Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_DarkDragonGroup )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Boomnl.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func005Func001C (family, line 44198) ---
function Trig_DarkDragonEXMove_Func002Func005Func005Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_DarkDragonGroup) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func005A (family, line 44205) ---
function Trig_DarkDragonEXMove_Func002Func005Func005A takes nothing returns nothing
    if ( Trig_DarkDragonEXMove_Func002Func005Func005Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_DarkDragonGroup )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Boomnl.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func010Func001C (family, line 44215) ---
function Trig_DarkDragonEXMove_Func002Func005Func010Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func010A (family, line 44222) ---
function Trig_DarkDragonEXMove_Func002Func005Func010A takes nothing returns nothing
    if ( Trig_DarkDragonEXMove_Func002Func005Func010Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func011Func001C (family, line 44229) ---
function Trig_DarkDragonEXMove_Func002Func005Func011Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005Func011A (family, line 44236) ---
function Trig_DarkDragonEXMove_Func002Func005Func011A takes nothing returns nothing
    if ( Trig_DarkDragonEXMove_Func002Func005Func011Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func005C (family, line 44243) ---
function Trig_DarkDragonEXMove_Func002Func005C takes nothing returns boolean
    if ( not Trig_DarkDragonEXMove_Func002Func005Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func008Func001C (family, line 44250) ---
function Trig_DarkDragonEXMove_Func002Func008Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func008A (family, line 44257) ---
function Trig_DarkDragonEXMove_Func002Func008A takes nothing returns nothing
    if ( Trig_DarkDragonEXMove_Func002Func008Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func011Func002Func001Func001C (family, line 44264) ---
function Trig_DarkDragonEXMove_Func002Func011Func002Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_DarkDragonCastUnit) == 'U010' ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_DarkDragonCastUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func011Func002Func001C (family, line 44274) ---
function Trig_DarkDragonEXMove_Func002Func011Func002Func001C takes nothing returns boolean
    if ( not Trig_DarkDragonEXMove_Func002Func011Func002Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func011Func002Func003C (family, line 44281) ---
function Trig_DarkDragonEXMove_Func002Func011Func002Func003C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_DarkDragonCastUnit)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func011Func002C (family, line 44294) ---
function Trig_DarkDragonEXMove_Func002Func011Func002C takes nothing returns boolean
    if ( not Trig_DarkDragonEXMove_Func002Func011Func002Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Func002Func011A (family, line 44301) ---
function Trig_DarkDragonEXMove_Func002Func011A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    if ( Trig_DarkDragonEXMove_Func002Func011Func002C() ) then
        if ( Trig_DarkDragonEXMove_Func002Func011Func002Func001C() ) then
            call UnitDamageTargetBJ( udg_DarkDragonCastUnit, GetEnumUnit(), 2500.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( udg_DarkDragonCastUnit, GetEnumUnit(), ( 400.00 + ( 250.00 * I2R(GetUnitAbilityLevelSwapped('A09I', udg_DarkDragonCastUnit)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DarkDragonEXMove_Func002Func013A (family, line 44314) ---
function Trig_DarkDragonEXMove_Func002Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEXMove_Func002Func014A (family, line 44319) ---
function Trig_DarkDragonEXMove_Func002Func014A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEXMove_Func002Func015A (family, line 44324) ---
function Trig_DarkDragonEXMove_Func002Func015A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEXMove_Func002Func016A (family, line 44329) ---
function Trig_DarkDragonEXMove_Func002Func016A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEXMove_Func002Func017A (family, line 44334) ---
function Trig_DarkDragonEXMove_Func002Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEXMove_Func002C (family, line 44339) ---
function Trig_DarkDragonEXMove_Func002C takes nothing returns boolean
    if ( not ( udg_DarkDragonCount < 14 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEXMove_Actions (family, line 44346) ---
function Trig_DarkDragonEXMove_Actions takes nothing returns nothing
    set udg_DarkDragonCount = ( udg_DarkDragonCount + 1 )
    if ( Trig_DarkDragonEXMove_Func002C() ) then
        call CreateNUnitsAtLoc( 1, 'h02E', Player(bj_PLAYER_NEUTRAL_VICTIM), udg_DarkDragonPoint, GetUnitFacing(udg_DarkDragonCastUnit) )
        if ( Trig_DarkDragonEXMove_Func002Func002C() ) then
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(udg_DarkDragonPoint, udg_DarkDragonMoveSpeed, ( 35.00 + GetUnitFacing(udg_DarkDragonCastUnit) )) )
            set udg_DarkDragonPoint = PolarProjectionBJ(udg_DarkDragonPoint, udg_DarkDragonMoveSpeed, ( 35.00 + GetUnitFacing(udg_DarkDragonCastUnit) ))
            call AddSpecialEffectLocBJ( GetRandomLocInRect(RectFromCenterSizeBJ(udg_DarkDragonPoint, 750.00, 750.00)), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            if ( Trig_DarkDragonEXMove_Func002Func002Func009C() ) then
                call CreateNUnitsAtLoc( 1, 'h02E', Player(bj_PLAYER_NEUTRAL_VICTIM), udg_DarkDragonPoint2, GetUnitFacing(udg_DarkDragonCastUnit) )
                call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(udg_DarkDragonPoint2, udg_DarkDragonMoveSpeed, ( 25.00 + GetUnitFacing(udg_DarkDragonUnit2) )) )
                set udg_DarkDragonPoint2 = PolarProjectionBJ(udg_DarkDragonPoint2, udg_DarkDragonMoveSpeed, ( ( 10.00 + GetRandomReal(5.00, 60.00) ) + GetUnitFacing(udg_DarkDragonUnit2) ))
                call CreateNUnitsAtLoc( 1, 'h02E', Player(bj_PLAYER_NEUTRAL_VICTIM), udg_DarkDragonPoint3, GetUnitFacing(udg_DarkDragonCastUnit) )
                call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(udg_DarkDragonPoint3, udg_DarkDragonMoveSpeed, ( -25.00 + GetUnitFacing(udg_DarkDragonUnit3) )) )
                set udg_DarkDragonPoint3 = PolarProjectionBJ(udg_DarkDragonPoint3, udg_DarkDragonMoveSpeed, ( ( -10.00 - GetRandomReal(5.00, 60.00) ) + GetUnitFacing(udg_DarkDragonUnit3) ))
            else
            endif
        else
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(udg_DarkDragonPoint, udg_DarkDragonMoveSpeed, ( -35.00 + GetUnitFacing(udg_DarkDragonCastUnit) )) )
            set udg_DarkDragonPoint = PolarProjectionBJ(udg_DarkDragonPoint, udg_DarkDragonMoveSpeed, ( -35.00 + GetUnitFacing(udg_DarkDragonCastUnit) ))
            if ( Trig_DarkDragonEXMove_Func002Func002Func003C() ) then
                call CreateNUnitsAtLoc( 1, 'h02E', Player(bj_PLAYER_NEUTRAL_VICTIM), udg_DarkDragonPoint2, GetUnitFacing(udg_DarkDragonCastUnit) )
                call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(udg_DarkDragonPoint2, udg_DarkDragonMoveSpeed, ( -25.00 + GetUnitFacing(udg_DarkDragonUnit2) )) )
                set udg_DarkDragonPoint2 = PolarProjectionBJ(udg_DarkDragonPoint2, udg_DarkDragonMoveSpeed, ( ( 10.00 + GetRandomReal(5.00, 60.00) ) + GetUnitFacing(udg_DarkDragonUnit2) ))
                call CreateNUnitsAtLoc( 1, 'h02E', Player(bj_PLAYER_NEUTRAL_VICTIM), udg_DarkDragonPoint3, GetUnitFacing(udg_DarkDragonCastUnit) )
                call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(udg_DarkDragonPoint3, udg_DarkDragonMoveSpeed, ( 25.00 + GetUnitFacing(udg_DarkDragonUnit3) )) )
                set udg_DarkDragonPoint3 = PolarProjectionBJ(udg_DarkDragonPoint3, udg_DarkDragonMoveSpeed, ( ( -10.00 - GetRandomReal(5.00, 60.00) ) + GetUnitFacing(udg_DarkDragonUnit3) ))
            else
            endif
        endif
        call SetUnitPositionLoc( udg_DarkDragonUnit, udg_DarkDragonPoint )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(250.00, udg_DarkDragonPoint), function Trig_DarkDragonEXMove_Func002Func004A )
        if ( Trig_DarkDragonEXMove_Func002Func005C() ) then
            call SetUnitPositionLoc( udg_DarkDragonUnit2, udg_DarkDragonPoint2 )
            call SetUnitPositionLoc( udg_DarkDragonUnit3, udg_DarkDragonPoint3 )
            call ForGroupBJ( GetUnitsInRangeOfLocAll(200.00, udg_DarkDragonPoint2), function Trig_DarkDragonEXMove_Func002Func005Func004A )
            call ForGroupBJ( GetUnitsInRangeOfLocAll(250.00, udg_DarkDragonPoint3), function Trig_DarkDragonEXMove_Func002Func005Func005A )
            call AddSpecialEffectLocBJ( udg_DarkDragonPoint2, "Boomnl.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectLocBJ( udg_DarkDragonPoint3, "Boomnl.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call EnumDestructablesInCircleBJ( 450.00, udg_DarkDragonPoint2, function Trig_DarkDragonEXMove_Func002Func005Func010A )
            call EnumDestructablesInCircleBJ( 450.00, udg_DarkDragonPoint3, function Trig_DarkDragonEXMove_Func002Func005Func011A )
        else
        endif
        call AddSpecialEffectLocBJ( udg_DarkDragonPoint, "Boomnl.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call EnumDestructablesInCircleBJ( 450.00, udg_DarkDragonPoint, function Trig_DarkDragonEXMove_Func002Func008A )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        call ForGroupBJ( udg_DarkDragonGroup, function Trig_DarkDragonEXMove_Func002Func011A )
        call TriggerSleepAction( 1.50 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(bj_PLAYER_NEUTRAL_VICTIM), 'o00Z'), function Trig_DarkDragonEXMove_Func002Func013A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(bj_PLAYER_NEUTRAL_VICTIM), 'h02E'), function Trig_DarkDragonEXMove_Func002Func014A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(bj_PLAYER_NEUTRAL_VICTIM), 'h02E'), function Trig_DarkDragonEXMove_Func002Func015A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(bj_PLAYER_NEUTRAL_VICTIM), 'h02E'), function Trig_DarkDragonEXMove_Func002Func016A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DarkDragonCastUnit), 'h02F'), function Trig_DarkDragonEXMove_Func002Func017A )
    endif
endfunction

// --- InitTrig_DarkDragonEXMove (family, line 44408) ---
function InitTrig_DarkDragonEXMove takes nothing returns nothing
    set gg_trg_DarkDragonEXMove = CreateTrigger(  )
    call DisableTrigger( gg_trg_DarkDragonEXMove )
    call TriggerRegisterTimerEventPeriodic( gg_trg_DarkDragonEXMove, 0.08 )
    call TriggerAddAction( gg_trg_DarkDragonEXMove, function Trig_DarkDragonEXMove_Actions )
endfunction

// === family HehiSword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HehiSword_Conditions (family, line 43741) ---
function Trig_HehiSword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSword_Func007C (family, line 43748) ---
function Trig_HehiSword_Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSword_Actions (family, line 43755) ---
function Trig_HehiSword_Actions takes nothing returns nothing
    // 變數設定
    set udg_HehiRush_IndexMoon = 0
    set udg_HehiRush_Target = GetTriggerUnit()
    set udg_HehiRush_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HehiRush_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_HehiRush_Angle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_HehiSword_Func007C() ) then
        set udg_HehiRush_Damage = I2R(( ( 100 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + ( 150 + R2I(I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true) * 3 ))) ) ))
    else
        set udg_HehiRush_Damage = I2R(( ( 100 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + ( 150 + R2I(I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true))) ) ))
    endif
    call UnitAddAbilityBJ( 'A0J6', GetTriggerUnit() )
    call GroupClear( udg_HehiRush_Group )
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_DarkSummoningLaunch1, 100, GetTriggerUnit() )
    call EnableTrigger( gg_trg_HehiSwordEffect )
endfunction

// --- InitTrig_HehiSword (family, line 43775) ---
function InitTrig_HehiSword takes nothing returns nothing
    set gg_trg_HehiSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_HehiSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HehiSword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HehiSword, Condition( function Trig_HehiSword_Conditions ) )
    call TriggerAddAction( gg_trg_HehiSword, function Trig_HehiSword_Actions )
endfunction

// === family HehiSwordEffect (armed) events=none ===

// --- Trig_HehiSwordEffect_Func005A (family, line 43788) ---
function Trig_HehiSwordEffect_Func005A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_HehiSwordEffect_Func007Func001C (family, line 43792) ---
function Trig_HehiSwordEffect_Func007Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_HehiRush_Group) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSwordEffect_Func007A (family, line 43799) ---
function Trig_HehiSwordEffect_Func007A takes nothing returns nothing
    if ( Trig_HehiSwordEffect_Func007Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_HehiRush_Group )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_HehiSwordEffect_Func008Func002Func001C (family, line 43807) ---
function Trig_HehiSwordEffect_Func008Func002Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_HehiRush_Target)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSwordEffect_Func008Func002A (family, line 43820) ---
function Trig_HehiSwordEffect_Func008Func002A takes nothing returns nothing
    if ( Trig_HehiSwordEffect_Func008Func002Func001C() ) then
        call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Other\\Doom\\DoomDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_HehiRush_Target, GetEnumUnit(), udg_HehiRush_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_HehiSwordEffect_Func008Func007C (family, line 43830) ---
function Trig_HehiSwordEffect_Func008Func007C takes nothing returns boolean
    if ( ( udg_HehiRush_IndexMoon >= 12 ) ) then
        return true
    endif
    if ( ( DistanceBetweenPoints(udg_HehiRush_P2, udg_HehiRush_P3) > 20.00 ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_HehiSwordEffect_Func008C (family, line 43840) ---
function Trig_HehiSwordEffect_Func008C takes nothing returns boolean
    if ( not Trig_HehiSwordEffect_Func008Func007C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSwordEffect_Actions (family, line 43847) ---
function Trig_HehiSwordEffect_Actions takes nothing returns nothing
    set udg_HehiRush_IndexMoon = ( udg_HehiRush_IndexMoon + 1 )
    set udg_HehiRush_P1 = GetUnitLoc(udg_HehiRush_Target)
    set udg_HehiRush_P2 = PolarProjectionBJ(udg_HehiRush_P1, 50.00, udg_HehiRush_Angle)
    call SetUnitPositionLoc( udg_HehiRush_Target, udg_HehiRush_P2 )
    call EnumDestructablesInCircleBJ( 300.00, GetUnitLoc(udg_HehiRush_Target), function Trig_HehiSwordEffect_Func005A )
    set udg_HehiRush_P3 = GetUnitLoc(udg_HehiRush_Target)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(250.00, udg_HehiRush_P1), function Trig_HehiSwordEffect_Func007A )
    if ( Trig_HehiSwordEffect_Func008C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call ForGroupBJ( udg_HehiRush_Group, function Trig_HehiSwordEffect_Func008Func002A )
        call SetUnitAnimationWithRarity( udg_HehiRush_Target, "Attack Slam", RARITY_FREQUENT )
        call GroupClear( udg_HehiRush_Group )
        call UnitRemoveAbilityBJ( 'A0J6', udg_HehiRush_Target )
        call UnitRemoveAbilityBJ( 'Avul', udg_HehiRush_Target )
    else
    endif
endfunction

// --- InitTrig_HehiSwordEffect (family, line 43867) ---
function InitTrig_HehiSwordEffect takes nothing returns nothing
    set gg_trg_HehiSwordEffect = CreateTrigger(  )
    call DisableTrigger( gg_trg_HehiSwordEffect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_HehiSwordEffect, 0.02 )
    call TriggerAddAction( gg_trg_HehiSwordEffect, function Trig_HehiSwordEffect_Actions )
endfunction
