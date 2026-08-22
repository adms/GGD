// rawcode: A0RQ
// nameZh: 48-04 騎英之疆繩
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 6.0}
// mana: {"1": 230, "2": 330, "3": 430, "4": 5}
// range: {"1": 800.0, "2": 800.0, "3": 800.0, "4": 1000.0}
// area: {"1": 500.0, "2": 500.0, "3": 500.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Initate_Crazy, RiderSprint, RidermovelineDam

// === family Initate_Crazy (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Initate_Crazy_Func002Func001C (family, line 25358) ---
function Trig_Initate_Crazy_Func002Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RQ' ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initate_Crazy_Func002C (family, line 25368) ---
function Trig_Initate_Crazy_Func002C takes nothing returns boolean
    if ( Trig_Initate_Crazy_Func002Func001C() ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A0AP' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Initate_Crazy_Conditions (family, line 25378) ---
function Trig_Initate_Crazy_Conditions takes nothing returns boolean
    if ( not Trig_Initate_Crazy_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initate_Crazy_Func001Func010C (family, line 25385) ---
function Trig_Initate_Crazy_Func001Func010C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Hvsh' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initate_Crazy_Func001C (family, line 25392) ---
function Trig_Initate_Crazy_Func001C takes nothing returns boolean
    if ( not ( udg_CrazyBoolean == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initate_Crazy_Actions (family, line 25399) ---
function Trig_Initate_Crazy_Actions takes nothing returns nothing
    if ( Trig_Initate_Crazy_Func001C() ) then
        set udg_CrazyBoolean = true
        set udg_CarzyStrike = GetTriggerUnit()
        set udg_DashAdjust = 0.00
        call SetUnitPathing( GetTriggerUnit(), false )
        set udg_DashPoint = GetSpellTargetLoc()
        set udg_DashCastPoint = GetUnitLoc(GetTriggerUnit())
        set udg_DashAngle = AngleBetweenPoints(udg_DashCastPoint, udg_DashPoint)
        if ( Trig_Initate_Crazy_Func001Func010C() ) then
            set udg_DashPoint = PolarProjectionBJ(udg_DashPoint, 350.00, GetUnitFacing(GetTriggerUnit()))
            call CreateNUnitsAtLoc( 1, 'h02D', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 100.00, GetUnitFacing(GetTriggerUnit())), GetUnitFacing(GetTriggerUnit()) )
            set udg_RiderHorse2 = GetLastCreatedUnit()
            call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
            call CreateNUnitsAtLoc( 1, 'h015', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
            set udg_RiderHorse = GetLastCreatedUnit()
            call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
            call CreateNUnitsAtLoc( 1, 'h02H', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
            set udg_RiderHorse3 = GetLastCreatedUnit()
            call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
            call CreateNUnitsAtLoc( 1, 'h02I', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), ( GetUnitFacing(GetTriggerUnit()) - 90.00 ) )
            set udg_RiderHorse4 = GetLastCreatedUnit()
            call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        else
            call DoNothing(  )
        endif
        call EnableTrigger( gg_trg_AdjustCrazy )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_Initate_Crazy (family, line 25432) ---
function InitTrig_Initate_Crazy takes nothing returns nothing
    set gg_trg_Initate_Crazy = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Initate_Crazy, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Initate_Crazy, Condition( function Trig_Initate_Crazy_Conditions ) )
    call TriggerAddAction( gg_trg_Initate_Crazy, function Trig_Initate_Crazy_Actions )
endfunction

// === family RiderSprint (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_RiderSprint_Conditions (family, line 38251) ---
function Trig_RiderSprint_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RQ' )) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == false )) then
        return false
    endif
    return true
endfunction

// --- Trig_RiderSprint_Actions (family, line 38261) ---
function Trig_RiderSprint_Actions takes nothing returns nothing
    local location RiderPoints

    call ShowUnitHide( udg_Rider )
    set RiderPoints = GetUnitLoc(GetTriggerUnit())
    set udg_RiderCastPoint = GetSpellTargetLoc()
    set udg_RiderCenCirPoint = PolarProjectionBJ(RiderPoints, 800.00, ( GetUnitFacing(GetTriggerUnit()) + 180.00 ))
    set udg_RiderFlyAngle = AngleBetweenPoints(RiderPoints, udg_RiderCenCirPoint)
    set udg_RiderChaAngle = ( udg_RiderFlyAngle + 37.00 )
    call CreateNUnitsAtLoc( 1, 'h024', GetOwningPlayer(GetTriggerUnit()), RiderPoints, udg_RiderChaAngle )
    set udg_RiderUnit = GetLastCreatedUnit()
    set udg_RiderDistance = 750.00
    set udg_RiderHight = 100.00
    call RemoveLocation( RiderPoints )
    call EnableTrigger( gg_trg_Ridermoveline )
endfunction

// --- InitTrig_RiderSprint (family, line 38279) ---
function InitTrig_RiderSprint takes nothing returns nothing
    set gg_trg_RiderSprint = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RiderSprint, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_RiderSprint, Condition( function Trig_RiderSprint_Conditions ) )
    call TriggerAddAction( gg_trg_RiderSprint, function Trig_RiderSprint_Actions )
endfunction

// === family RidermovelineDam (passive) events=none ===

// --- Trig_RidermovelineDam_Func001Func007001003 (family, line 38355) ---
function Trig_RidermovelineDam_Func001Func007001003 takes nothing returns boolean
    return GetBooleanAnd( ( IsUnitType(GetFilterUnit(), UNIT_TYPE_STRUCTURE) != true ), ( IsUnitAlly(GetFilterUnit(), GetOwningPlayer(udg_Rider)) != true ) )
endfunction

// --- Trig_RidermovelineDam_Func001Func007A (family, line 38359) ---
function Trig_RidermovelineDam_Func001Func007A takes nothing returns nothing
    call UnitDamageTargetBJ( udg_Rider, GetEnumUnit(), ( 0.00 + ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped('A0RQ', udg_Rider)) ) + ( 3.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Rider, true)) ) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- Trig_RidermovelineDam_Actions (family, line 38363) ---
function Trig_RidermovelineDam_Actions takes nothing returns nothing
    local location RiderNowPoint
    local location RiderEveryPoint
    local location RiderPoint

    if ( udg_RiderDistance > 0.00 ) then
        set RiderNowPoint = GetUnitLoc(udg_RiderUnit)
        set RiderEveryPoint = PolarProjectionBJ(RiderNowPoint, 50.00, udg_RiderChaAngle)
        call SetUnitFacingTimed( udg_RiderUnit, udg_RiderChaAngle, 0 )
        call SetUnitPositionLocFacingBJ( udg_RiderUnit, RiderEveryPoint, udg_RiderChaAngle )
        set udg_RiderDistance = ( udg_RiderDistance - 50.00 )
        set udg_RiderHight = ( udg_RiderHight - 20.00 )
        call SetUnitFlyHeightBJ( udg_RiderUnit, udg_RiderHight, 0.00 )
        call RemoveLocation( RiderNowPoint )
        call RemoveLocation( RiderEveryPoint )
    else
        set RiderPoint = GetUnitLoc(udg_RiderUnit)
        call SetUnitPositionLoc( udg_Rider, RiderPoint )
        call CreateNUnitsAtLoc( 1, 'h025', GetOwningPlayer(udg_Rider), RiderPoint, bj_UNIT_FACING )
//        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
        set udg_RiderSpaUnit = GetLastCreatedUnit()
        set bj_forLoopAIndex = 1
        set bj_forLoopAIndexEnd = 12
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            set RiderNowPoint = PolarProjectionBJ(RiderPoint, GetRandomReal(0.00, 300.00), GetRandomDirectionDeg())
            call AddSpecialEffectLocBJ( RiderNowPoint, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call RemoveLocation( RiderNowPoint )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
        call ForGroupBJ( GetUnitsInRangeOfLocMatching(500.00, RiderPoint, Condition(function Trig_RidermovelineDam_Func001Func007001003)), function Trig_RidermovelineDam_Func001Func007A )
        call RemoveLocation( RiderPoint )
        call RemoveLocation( udg_RiderCastPoint )
        call RemoveLocation( udg_RiderCenCirPoint )
        call KillUnit( udg_RiderUnit )
        call ShowUnitShow( udg_Rider )
        call SelectUnitForPlayerSingle( udg_Rider, GetOwningPlayer(udg_Rider) )
        call DisableTrigger( GetTriggeringTrigger() )
        call TriggerSleepAction( 1.50 )
        call KillUnit( udg_RiderUnit )
        call RemoveUnit( udg_RiderSpaUnit )
        call RemoveUnit( udg_RiderUnit )
    endif
endfunction

// --- InitTrig_RidermovelineDam (family, line 38410) ---
function InitTrig_RidermovelineDam takes nothing returns nothing
    set gg_trg_RidermovelineDam = CreateTrigger(  )
    call DisableTrigger( gg_trg_RidermovelineDam )
    call TriggerRegisterTimerEventPeriodic( gg_trg_RidermovelineDam, 0.01 )
    call TriggerAddAction( gg_trg_RidermovelineDam, function Trig_RidermovelineDam_Actions )
endfunction
