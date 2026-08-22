// unit rawcode: H020
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DragonSlaveSet, DragonSlaveMove, LinaS, LinaS_Effect

// === family DragonSlaveSet (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DragonSlaveSet_Conditions (family, line 29937) ---
function Trig_DragonSlaveSet_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A04R' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveSet_Func008C (family, line 29944) ---
function Trig_DragonSlaveSet_Func008C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H020' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveSet_Actions (family, line 29951) ---
function Trig_DragonSlaveSet_Actions takes nothing returns nothing
    set udg_DragonSlaverCaster = GetTriggerUnit()
    set udg_DrganSlaveCastPoint = GetSpellTargetLoc()
    set udg_DrganSlaveMovePoint = GetUnitLoc(GetTriggerUnit())
    set udg_DrgaonSlaveFacing = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), udg_DrganSlaveCastPoint)
    set udg_DrgaonSlaveCounter = 0
    set udg_DragonSlaverDamage = ( ( I2R(GetUnitAbilityLevelSwapped('A04R', udg_DragonSlaverCaster)) * 500.00 ) + 200.00 )
    if ( Trig_DragonSlaveSet_Func008C() ) then
        set udg_DragonSlaverDamage = ( udg_DragonSlaverDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 7 )) )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h013', GetOwningPlayer(GetTriggerUnit()), udg_DrganSlaveMovePoint, udg_DrgaonSlaveFacing )
    set udg_DragonSlaveUnit2 = GetLastCreatedUnit()
    call SetUnitScalePercent( udg_DragonSlaveUnit2, 230.00, 230.00, 230.00 )
    call GroupClear( udg_DragonSlaveGroup )
    call AddSpecialEffectTargetUnitBJ( "chest ", GetTriggerUnit(), "Abilities\\Spells\\Other\\Doom\\DoomTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call EnableTrigger( gg_trg_DragonSlaveMove )
endfunction

// --- InitTrig_DragonSlaveSet (family, line 29972) ---
function InitTrig_DragonSlaveSet takes nothing returns nothing
    set gg_trg_DragonSlaveSet = CreateTrigger(  )
    call DisableTrigger( gg_trg_DragonSlaveSet )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DragonSlaveSet, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DragonSlaveSet, Condition( function Trig_DragonSlaveSet_Conditions ) )
    call TriggerAddAction( gg_trg_DragonSlaveSet, function Trig_DragonSlaveSet_Actions )
endfunction

// === family DragonSlaveMove (armed) events=none ===

// --- Trig_DragonSlaveMove_Func002Func001003 (family, line 29983) ---
function Trig_DragonSlaveMove_Func002Func001003 takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_DragonSlaveMove_Func002Func002C (family, line 29987) ---
function Trig_DragonSlaveMove_Func002Func002C takes nothing returns boolean
    if ( not ( udg_DrgaonSlaveCounter == 32 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func003C (family, line 29994) ---
function Trig_DragonSlaveMove_Func002Func003C takes nothing returns boolean
    if ( not ( udg_DrgaonSlaveCounter < 70 ) ) then
        return false
    endif
    if ( not ( DistanceBetweenPoints(udg_DrganSlaveCastPoint, udg_DrganSlaveMovePoint) > 55.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func004Func001C (family, line 30004) ---
function Trig_DragonSlaveMove_Func002Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_DragonSlaveGroup) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func004A (family, line 30011) ---
function Trig_DragonSlaveMove_Func002Func004A takes nothing returns nothing
    if ( Trig_DragonSlaveMove_Func002Func004Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_DragonSlaveGroup )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DragonSlaveMove_Func002Func006Func001Func001C (family, line 30019) ---
function Trig_DragonSlaveMove_Func002Func006Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func006Func001Func003C (family, line 30026) ---
function Trig_DragonSlaveMove_Func002Func006Func001Func003C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_DragonSlaverCaster)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func006Func001C (family, line 30036) ---
function Trig_DragonSlaveMove_Func002Func006Func001C takes nothing returns boolean
    if ( not Trig_DragonSlaveMove_Func002Func006Func001Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func006A (family, line 30043) ---
function Trig_DragonSlaveMove_Func002Func006A takes nothing returns nothing
    if ( Trig_DragonSlaveMove_Func002Func006Func001C() ) then
        if ( Trig_DragonSlaveMove_Func002Func006Func001Func001C() ) then
            call UnitDamageTargetBJ( udg_DragonSlaverCaster, GetEnumUnit(), ( udg_DragonSlaverDamage * 0.50 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( udg_DragonSlaverCaster, GetEnumUnit(), udg_DragonSlaverDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DragonSlaveMove_Func002Func007Func008003 (family, line 30055) ---
function Trig_DragonSlaveMove_Func002Func007Func008003 takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_DragonSlaveMove_Func002Func007Func009Func001C (family, line 30059) ---
function Trig_DragonSlaveMove_Func002Func007Func009Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_DragonSlaveGroup) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func007Func009A (family, line 30066) ---
function Trig_DragonSlaveMove_Func002Func007Func009A takes nothing returns nothing
    if ( Trig_DragonSlaveMove_Func002Func007Func009Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_DragonSlaveGroup )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DragonSlaveMove_Func002Func007C (family, line 30074) ---
function Trig_DragonSlaveMove_Func002Func007C takes nothing returns boolean
    if ( not ( udg_DrgaonSlaveCounter > 32 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Func002Func018A (family, line 30081) ---
function Trig_DragonSlaveMove_Func002Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DragonSlaveMove_Func002Func019A (family, line 30086) ---
function Trig_DragonSlaveMove_Func002Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DragonSlaveMove_Func002C (family, line 30091) ---
function Trig_DragonSlaveMove_Func002C takes nothing returns boolean
    if ( not Trig_DragonSlaveMove_Func002Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveMove_Actions (family, line 30098) ---
function Trig_DragonSlaveMove_Actions takes nothing returns nothing
    set udg_DrgaonSlaveCounter = ( udg_DrgaonSlaveCounter + 1 )
    if ( Trig_DragonSlaveMove_Func002C() ) then
        if ( Trig_DragonSlaveMove_Func002Func002C() ) then
            call CreateNUnitsAtLoc( 1, 'h014', GetOwningPlayer(udg_DragonSlaverCaster), udg_DrganSlaveMovePoint, udg_DrgaonSlaveFacing )
            set udg_DragonSlaveUnit = GetLastCreatedUnit()
        else
        endif
        if ( Trig_DragonSlaveMove_Func002Func007C() ) then
            set udg_DrganSlaveMovePoint = PolarProjectionBJ(udg_DrganSlaveMovePoint, 45.00, udg_DrgaonSlaveFacing)
            call SetUnitPositionLoc( udg_DragonSlaveUnit, udg_DrganSlaveMovePoint )
            call AddSpecialEffectLocBJ( udg_DrganSlaveMovePoint, "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectLocBJ( udg_DrganSlaveMovePoint, "Abilities\\Spells\\Other\\Volcano\\VolcanoDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call EnumDestructablesInCircleBJ( 256, udg_DrganSlaveMovePoint, function Trig_DragonSlaveMove_Func002Func007Func008003 )
            call ForGroupBJ( GetUnitsInRangeOfLocAll(200.00, udg_DrganSlaveMovePoint), function Trig_DragonSlaveMove_Func002Func007Func009A )
        else
            call DoNothing(  )
        endif
    else
        call EnumDestructablesInCircleBJ( 600.00, udg_DrganSlaveMovePoint, function Trig_DragonSlaveMove_Func002Func001003 )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_DrganSlaveMovePoint), function Trig_DragonSlaveMove_Func002Func004A )
        set bj_forLoopBIndex = 1
        set bj_forLoopBIndexEnd = 18
        loop
            exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
            call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_DrganSlaveMovePoint, 325.00, ( I2R(GetForLoopIndexB()) * 20.00 )), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            set bj_forLoopBIndex = bj_forLoopBIndex + 1
        endloop
        call ForGroupBJ( udg_DragonSlaveGroup, function Trig_DragonSlaveMove_Func002Func006A )
        call DisableTrigger( GetTriggeringTrigger() )
        call TerrainDeformationRippleBJ( 2.00, false, udg_DrganSlaveMovePoint, 300.00, 900.00, 280.00, 1.00, 300.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call AddSpecialEffectLocBJ( udg_DrganSlaveMovePoint, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.50 )
        call KillUnit( udg_DragonSlaveUnit )
        call RemoveUnit( udg_DragonSlaveUnit )
        call KillUnit( udg_DragonSlaveUnit2 )
        call RemoveUnit( udg_DragonSlaveUnit2 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DragonSlaverCaster), 'h014'), function Trig_DragonSlaveMove_Func002Func018A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DragonSlaverCaster), 'h013'), function Trig_DragonSlaveMove_Func002Func019A )
    endif
endfunction

// --- InitTrig_DragonSlaveMove (family, line 30146) ---
function InitTrig_DragonSlaveMove takes nothing returns nothing
    set gg_trg_DragonSlaveMove = CreateTrigger(  )
    call DisableTrigger( gg_trg_DragonSlaveMove )
    call TriggerRegisterTimerEventPeriodic( gg_trg_DragonSlaveMove, 0.03 )
    call TriggerAddAction( gg_trg_DragonSlaveMove, function Trig_DragonSlaveMove_Actions )
endfunction

// === family LinaS (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LinaS_Func001C (family, line 29749) ---
function Trig_LinaS_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A07F' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Conditions (family, line 29759) ---
function Trig_LinaS_Conditions takes nothing returns boolean
    if ( not Trig_LinaS_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Func016C (family, line 29766) ---
function Trig_LinaS_Func016C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H020' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Func019Func001A (family, line 29773) ---
function Trig_LinaS_Func019Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_LinaS_Actions (family, line 29777) ---
function Trig_LinaS_Actions takes nothing returns nothing
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call CreateTextTagUnitBJ( "TRIGSTR_3733", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "HeroCloudCyd.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    if ( Trig_LinaS_Func016C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 12 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 5 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call PolledWait( 0.50 )
    call EnableTrigger( gg_trg_LinaS_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_LinaS_Func019Func001A )
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

// --- InitTrig_LinaS (family, line 29817) ---
function InitTrig_LinaS takes nothing returns nothing
    set gg_trg_LinaS = CreateTrigger(  )
    call DisableTrigger( gg_trg_LinaS )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LinaS, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LinaS, Condition( function Trig_LinaS_Conditions ) )
    call TriggerAddAction( gg_trg_LinaS, function Trig_LinaS_Actions )
endfunction

// === family LinaS_Effect (armed) events=none ===

// --- Trig_LinaS_Effect_Func005A (family, line 29830) ---
function Trig_LinaS_Effect_Func005A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_LinaS_Effect_Func009C (family, line 29834) ---
function Trig_LinaS_Effect_Func009C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_P2, udg_P3) < 15.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Effect_Func013C (family, line 29841) ---
function Trig_LinaS_Effect_Func013C takes nothing returns boolean
    if ( not ( udg_KnockBack_Index >= 10 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Effect_Actions (family, line 29848) ---
function Trig_LinaS_Effect_Actions takes nothing returns nothing
    set udg_KnockBack_Index = ( udg_KnockBack_Index + 1 )
    set udg_P1 = GetUnitLoc(udg_KnockBack_Target)
    set udg_P2 = PolarProjectionBJ(udg_P1, 40.00, udg_KnockBack_Angle)
    call SetUnitPositionLoc( udg_KnockBack_Target, udg_P2 )
    call EnumDestructablesInCircleBJ( 300.00, GetUnitLoc(udg_KnockBack_Target), function Trig_LinaS_Effect_Func005A )
    set udg_P3 = GetUnitLoc(udg_KnockBack_Target)
    call AddSpecialEffectLocBJ( udg_P1, "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    if ( Trig_LinaS_Effect_Func009C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitPositionLoc( udg_KnockBack_Target, udg_P1 )
        call AddSpecialEffectLocBJ( udg_P1, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectLocBJ( udg_P2, "Units\\NightElf\\Wisp\\WispExplode.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call RemoveLocation( udg_P3 )
    if ( Trig_LinaS_Effect_Func013C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
    endif
endfunction

// --- InitTrig_LinaS_Effect (family, line 29876) ---
function InitTrig_LinaS_Effect takes nothing returns nothing
    set gg_trg_LinaS_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_LinaS_Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_LinaS_Effect, 0.08 )
    call TriggerAddAction( gg_trg_LinaS_Effect, function Trig_LinaS_Effect_Actions )
endfunction
