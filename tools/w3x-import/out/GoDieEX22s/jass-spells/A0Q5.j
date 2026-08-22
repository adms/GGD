// rawcode: A0Q5
// nameZh: 82-03 雷之投擲
// w3a base: AOsh  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 150, "2": 210, "3": 270, "4": 330}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ThunderLance, ThunderMove, fist

// === family ThunderLance (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThunderLance_Conditions (family, line 35355) ---
function Trig_ThunderLance_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Q5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderLance_Func002Func012C (family, line 35362) ---
function Trig_ThunderLance_Func002Func012C takes nothing returns boolean
    if ( not ( udg_ThunderLanceAccount < 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderLance_Func002C (family, line 35369) ---
function Trig_ThunderLance_Func002C takes nothing returns boolean
    if ( not ( GetTriggerUnit() == GetSpellTargetUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderLance_Actions (family, line 35376) ---
function Trig_ThunderLance_Actions takes nothing returns nothing
    set udg_NegiUnit = GetTriggerUnit()
    if ( Trig_ThunderLance_Func002C() ) then
        if ( Trig_ThunderLance_Func002Func012C() ) then
            set udg_ThunderLanceAccount = ( udg_ThunderLanceAccount + 1 )
        else
        endif
    else
        set udg_ThunderLanceAccount = ( udg_ThunderLanceAccount + 1 )
        set udg_NegiMasterPoint = GetUnitLoc(GetTriggerUnit())
        set udg_NegiPoint = GetSpellTargetLoc()
        set udg_NegiDistan = DistanceBetweenPoints(udg_NegiMasterPoint, udg_NegiPoint)
        set udg_NegiAngle = AngleBetweenPoints(udg_NegiMasterPoint, udg_NegiPoint)
        set udg_NegiAnimatIndex = 21
        set udg_NegiDistan = ( udg_NegiDistan / I2R(udg_NegiAnimatIndex) )
        set udg_NegiHight = 410.00
        call RemoveLocation( udg_NegiPoint )
        set udg_NegiInt = 1
        loop
            exitwhen udg_NegiInt > 9
            set udg_NegiPoint = PolarProjectionBJ(udg_NegiMasterPoint, 75.00, ( 40.00 * I2R(udg_NegiInt) ))
            call AddSpecialEffectLocBJ( udg_NegiPoint, "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call RemoveLocation( udg_NegiPoint )
            set udg_NegiInt = udg_NegiInt + 1
        endloop
        call EnableTrigger( gg_trg_ThunderCreate )
    endif
endfunction

// --- InitTrig_ThunderLance (family, line 35407) ---
function InitTrig_ThunderLance takes nothing returns nothing
    set gg_trg_ThunderLance = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThunderLance )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThunderLance, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThunderLance, Condition( function Trig_ThunderLance_Conditions ) )
    call TriggerAddAction( gg_trg_ThunderLance, function Trig_ThunderLance_Actions )
endfunction

// === family ThunderMove (passive) events=none ===

// --- Trig_ThunderMove_Func002A (family, line 35452) ---
function Trig_ThunderMove_Func002A takes nothing returns nothing
    set udg_NegiLunderUnitPoint = GetUnitLoc(GetEnumUnit())
    set udg_NegiPoint = PolarProjectionBJ(udg_NegiLunderUnitPoint, udg_NegiDistan, udg_NegiAngle)
    call SetUnitPositionLocFacingBJ( GetEnumUnit(), udg_NegiPoint, udg_NegiAngle )
    call SetUnitFlyHeightBJ( GetEnumUnit(), udg_NegiHight, 0.00 )
    call RemoveLocation( udg_NegiLunderUnitPoint )
    call RemoveLocation( udg_NegiPoint )
endfunction

// --- Trig_ThunderMove_Func003Func003Func005Func001C (family, line 35461) ---
function Trig_ThunderMove_Func003Func003Func005Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_NegiUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderMove_Func003Func003Func005A (family, line 35468) ---
function Trig_ThunderMove_Func003Func003Func005A takes nothing returns nothing
    if ( Trig_ThunderMove_Func003Func003Func005Func001C() ) then
        call UnitDamageTargetBJ( udg_NegiUnit, GetEnumUnit(), ( 350.00 + ( I2R(( ( GetUnitAbilityLevelSwapped('A0Q5', udg_NegiUnit) * 2 ) + 1 )) * I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_NegiUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_ThunderMove_Func003Func003A (family, line 35475) ---
function Trig_ThunderMove_Func003Func003A takes nothing returns nothing
    set udg_NegiLunderUnitPoint = GetUnitLoc(GetEnumUnit())
    call AddSpecialEffectLocBJ( udg_NegiLunderUnitPoint, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_NegiInt = 1
    loop
        exitwhen udg_NegiInt > 6
        set udg_NegiPoint = PolarProjectionBJ(udg_NegiLunderUnitPoint, 50.00, ( 60.00 * I2R(udg_NegiInt) ))
        call AddSpecialEffectLocBJ( udg_NegiPoint, "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_NegiPoint )
        set udg_NegiInt = udg_NegiInt + 1
    endloop
    call ForGroupBJ( GetUnitsInRangeOfLocAll(200.00, udg_NegiLunderUnitPoint), function Trig_ThunderMove_Func003Func003Func005A )
    call RemoveLocation( udg_NegiLunderUnitPoint )
endfunction

// --- Trig_ThunderMove_Func003Func005A (family, line 35492) ---
function Trig_ThunderMove_Func003Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ThunderMove_Func003C (family, line 35497) ---
function Trig_ThunderMove_Func003C takes nothing returns boolean
    if ( not ( udg_NegiAnimatIndex > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderMove_Actions (family, line 35504) ---
function Trig_ThunderMove_Actions takes nothing returns nothing
    set udg_NegiHight = ( udg_NegiHight - 20.00 )
    call ForGroupBJ( udg_NegiLanceGroup, function Trig_ThunderMove_Func002A )
    if ( Trig_ThunderMove_Func003C() ) then
        set udg_NegiAnimatIndex = ( udg_NegiAnimatIndex - 1 )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        call RemoveLocation( udg_NegiMasterPoint )
        call ForGroupBJ( udg_NegiLanceGroup, function Trig_ThunderMove_Func003Func003A )
        call TriggerSleepAction( 1.00 )
        call ForGroupBJ( udg_NegiLanceGroup, function Trig_ThunderMove_Func003Func005A )
        call GroupClear( udg_NegiLanceGroup )
    endif
endfunction

// --- InitTrig_ThunderMove (family, line 35520) ---
function InitTrig_ThunderMove takes nothing returns nothing
    set gg_trg_ThunderMove = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThunderMove )
    call TriggerRegisterTimerEventPeriodic( gg_trg_ThunderMove, 0.01 )
    call TriggerAddAction( gg_trg_ThunderMove, function Trig_ThunderMove_Actions )
endfunction

// === family fist (passive) events=none ===

// --- Trig_fist_Func001Func001Func014Func001C (family, line 35029) ---
function Trig_fist_Func001Func001Func014Func001C takes nothing returns boolean
    if ( not ( udg_ThunderLanceAccount > 0 ) ) then
        return false
    endif
    if ( not ( udg_NegiJudgeThunder == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fist_Func001Func001Func014Func004C (family, line 35039) ---
function Trig_fist_Func001Func001Func014Func004C takes nothing returns boolean
    if ( not ( udg_LightArrowAccount >= 5 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fist_Func001Func001Func014C (family, line 35046) ---
function Trig_fist_Func001Func001Func014C takes nothing returns boolean
    if ( not ( udg_LightArrowAccount > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fist_Func001Func001C (family, line 35053) ---
function Trig_fist_Func001Func001C takes nothing returns boolean
    if ( not ( udg_NegiAbsorpFinDam == 0.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fist_Func001C (family, line 35060) ---
function Trig_fist_Func001C takes nothing returns boolean
    if ( not ( udg_NegiAttackUnit != null ) ) then
        return false
    endif
    if ( not ( udg_NegiAttackUnit == GetTriggerUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fist_Actions (family, line 35070) ---
function Trig_fist_Actions takes nothing returns nothing
    if ( Trig_fist_Func001C() ) then
        if ( Trig_fist_Func001Func001C() ) then
            if ( Trig_fist_Func001Func001Func014C() ) then
                set udg_NegiAttackUnit = null
                if ( Trig_fist_Func001Func001Func014Func004C() ) then
                    set udg_NegiMasterPoint = GetUnitLoc(GetEventDamageSource())
                    call CreateNUnitsAtLoc( 1, 'o02I', GetOwningPlayer(udg_NegiUnit), udg_NegiMasterPoint, bj_UNIT_FACING )
                    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_NegiGroup )
                    call ShowUnitHide( GetLastCreatedUnit() )
                    call UnitRemoveAbilityBJ( 'A0PJ', GetLastCreatedUnit() )
                    call UnitAddAbilityBJ( 'A0PK', GetLastCreatedUnit() )
                    call SetUnitScalePercent( GetLastCreatedUnit(), 1000.00, 1000.00, 1000.00 )
                    call IssueTargetOrderBJ( GetLastCreatedUnit(), "thunderbolt", GetTriggerUnit() )
                    call RemoveLocation( udg_NegiMasterPoint )
                    set udg_NegiMasterPoint = GetUnitLoc(GetTriggerUnit())
                    call CreateNUnitsAtLoc( 1, 'o02I', GetOwningPlayer(udg_NegiUnit), udg_NegiMasterPoint, bj_UNIT_FACING )
                    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_NegiGroup )
                    call ShowUnitHide( GetLastCreatedUnit() )
                    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
                    call RemoveLocation( udg_NegiMasterPoint )
                    call AddSpecialEffectTargetUnitBJ( "weapon", udg_NegiUnit, "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl" )
                    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                else
                endif
                set udg_LightArrowAccountTemp = udg_LightArrowAccount
                set udg_LightArrowAccount = 0
                set udg_NegiMasterPoint = GetUnitLoc(udg_NegiUnit)
                set udg_NegiCastUnit = GetTriggerUnit()
                call EnableTrigger( gg_trg_LightFire )
            else
                if ( Trig_fist_Func001Func001Func014Func001C() ) then
                    set udg_ThunderLanceDam = ( ( 250.00 * I2R(udg_ThunderLanceAccount) ) + ( I2R(udg_ThunderLanceAccount) * ( ( 1.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_NegiUnit, true)) ) * I2R(GetUnitAbilityLevelSwapped('A0Q5', udg_NegiUnit)) ) ) )
                    set udg_ThunderLanceAccount = 0
                    set udg_NegiAttackUnit = null
                    set udg_ThunderLancePoint = GetUnitLoc(GetEventDamageSource())
                    set udg_ThunderLancePoint_2 = GetUnitLoc(GetTriggerUnit())
                    set udg_NegiAngle = AngleBetweenPoints(udg_ThunderLancePoint, udg_ThunderLancePoint_2)
                    set udg_NegiDistan = 600.00
                    call EnableTrigger( gg_trg_ThunderFist )
                else
                endif
            endif
        else
            set udg_NegiAttackUnit = null
            set udg_NegiGodKillHeight = 1000.00
            set udg_NegiAbsorpFinDam = ( 1000.00 + udg_NegiAbsorpFinDam )
            set udg_NegiMasterPoint = GetUnitLoc(GetEventDamageSource())
            set udg_ThunderLancePoint_2 = GetUnitLoc(GetTriggerUnit())
            call CreateNUnitsAtLoc( 1, 'o02K', GetOwningPlayer(udg_NegiUnit), udg_ThunderLancePoint_2, bj_UNIT_FACING )
            set udg_NegiKillGod = GetLastCreatedUnit()
            call SetUnitVertexColorBJ( GetLastCreatedUnit(), 20.00, 20.00, 100, 50.00 )
            call RemoveLocation( udg_NegiMasterPoint )
            call RemoveLocation( udg_ThunderLancePoint_2 )
            set udg_NegiAbsorpDam = udg_NegiAbsorpFinDam
            set udg_NegiAbsorpFinDam = 0.00
            call EnableTrigger( gg_trg_KillGodMove )
        endif
    else
    endif
endfunction

// --- InitTrig_fist (family, line 35133) ---
function InitTrig_fist takes nothing returns nothing
    set gg_trg_fist = CreateTrigger(  )
    call TriggerAddAction( gg_trg_fist, function Trig_fist_Actions )
endfunction
