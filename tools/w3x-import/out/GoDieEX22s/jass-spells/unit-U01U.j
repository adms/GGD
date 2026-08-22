// unit rawcode: U01U
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Roaction, Romove, ThworldStart, ThworldMove

// === family Roaction (passive) events=none ===

// --- Trig_Roaction_Func004C (family, line 28976) ---
function Trig_Roaction_Func004C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_RoMaster, 'B02Y') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Roaction_Func005C (family, line 28983) ---
function Trig_Roaction_Func005C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_RoMaster) == 'U01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Roaction_Actions (family, line 28990) ---
function Trig_Roaction_Actions takes nothing returns nothing
    set udg_RoCaster = GetTriggerUnit()
    set udg_RoMaster = GetEventDamageSource()
    set udg_RoAngle = AngleBetweenPoints(GetUnitLoc(udg_RoMaster), GetUnitLoc(udg_RoCaster))
    if ( Trig_Roaction_Func004C() ) then
        set udg_RoDamage = I2R(( ( ( ( GetUnitAbilityLevelSwapped('A06P', udg_RoMaster) * 150 ) + ( GetHeroStatBJ(bj_HEROSTAT_STR, udg_RoMaster, true) * 2 ) ) + 150 ) * 1 ))
    else
        set udg_RoDamage = I2R(( ( ( ( GetUnitAbilityLevelSwapped('A06P', udg_RoMaster) * 150 ) + 0 ) + 150 ) * 1 ))
    endif
    if ( Trig_Roaction_Func005C() ) then
        set udg_RoDamage = ( udg_RoDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, udg_RoMaster, true) * 3 )) )
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_RoMaster), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
    set udg_DistanCount = 0
    set udg_ActivePoint = GetUnitLoc(udg_RoCaster)
    call PauseUnitBJ( true, udg_RoCaster )
    call PauseUnitBJ( true, udg_RoMaster )
    call SetUnitAnimation( udg_RoMaster, "spell slam" )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -100.00, udg_RoAngle), bj_UNIT_FACING )
    set udg_RoCreateUnit[1] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[1], 100, 0.00, 0.00, 50.00 )
    call SetUnitAnimation( udg_RoCreateUnit[1], "attack walk stand spin" )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -100.00, ( udg_RoAngle - 120.00 )), bj_UNIT_FACING )
    set udg_RoCreateUnit[2] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[2], 100, 0.00, 0.00, 50.00 )
    call SetUnitAnimation( udg_RoCreateUnit[2], "attack walk stand spin" )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -100.00, ( udg_RoAngle + 120.00 )), bj_UNIT_FACING )
    set udg_RoCreateUnit[3] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[3], 100, 0.00, 0.00, 50.00 )
    call SetUnitAnimation( udg_RoCreateUnit[3], "attack walk stand spin" )
    // 旋轉分身分界
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -200.00, udg_RoAngle), udg_RoAngle )
    call SetUnitAnimation( GetLastCreatedUnit(), "stand ready" )
    call SetUnitVertexColorBJ( udg_RoCreateUnit[4], 100, 0.00, 0.00, 50.00 )
    set udg_RoCreateUnit[4] = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -200.00, ( udg_RoAngle - 120.00 )), ( udg_RoAngle - 120.00 ) )
    call SetUnitAnimation( GetLastCreatedUnit(), "stand ready" )
    set udg_RoCreateUnit[5] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[5], 100, 0.00, 0.00, 50.00 )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -200.00, ( udg_RoAngle + 120.00 )), ( udg_RoAngle + 120.00 ) )
    call SetUnitAnimation( GetLastCreatedUnit(), "stand ready" )
    set udg_RoCreateUnit[6] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[6], 100, 0.00, 0.00, 50.00 )
    call UnitAddAbilityBJ( 'A0J6', udg_RoMaster )
    call UnitAddAbilityBJ( 'A0J7', udg_RoMaster )
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(udg_RoMaster), 25.00 )
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(udg_RoCaster), 25.00 )
    call EnableTrigger( gg_trg_Romove )
    call TriggerSleepAction( 0.30 )
    call CameraClearNoiseForPlayer( GetOwningPlayer(udg_RoCaster) )
    call CameraClearNoiseForPlayer( GetOwningPlayer(udg_RoMaster) )
    call SetUnitAnimation( udg_RoCaster, "death" )
    set udg_drop_bloods = 1
    loop
        exitwhen udg_drop_bloods > 10
        call AddSpecialEffectTargetUnitBJ( "weapon", udg_RoCaster, "Objects\\Spawnmodels\\Human\\HumanBlood\\HumanBloodPriest.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.01 )
        set udg_drop_bloods = udg_drop_bloods + 1
    endloop
    call TriggerSleepAction( 0.50 )
    call UnitRemoveAbilityBJ( 'A0J6', udg_RoMaster )
    call UnitRemoveAbilityBJ( 'A0J7', udg_RoMaster )
endfunction

// --- InitTrig_Roaction (family, line 29058) ---
function InitTrig_Roaction takes nothing returns nothing
    set gg_trg_Roaction = CreateTrigger(  )
    call DisableTrigger( gg_trg_Roaction )
    call TriggerAddAction( gg_trg_Roaction, function Trig_Roaction_Actions )
endfunction

// === family Romove (armed) events=none ===

// --- Trig_Romove_Func009Func037A (family, line 29067) ---
function Trig_Romove_Func009Func037A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Romove_Func009Func038A (family, line 29072) ---
function Trig_Romove_Func009Func038A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Romove_Func009C (family, line 29077) ---
function Trig_Romove_Func009C takes nothing returns boolean
    if ( not ( udg_DistanCount >= 11 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Romove_Actions (family, line 29084) ---
function Trig_Romove_Actions takes nothing returns nothing
    set udg_DistanCount = ( udg_DistanCount + 1 )
    call SetUnitAnimation( udg_RoCaster, "death" )
    call AddSpecialEffectTargetUnitBJ( "weapon", udg_RoCaster, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLoc( udg_RoCreateUnit[1], PolarProjectionBJ(GetUnitLoc(udg_RoCaster), ( -100.00 + ( I2R(udg_DistanCount) * 20.00 ) ), ( udg_RoAngle + ( I2R(udg_RoCount) * 30.00 ) )) )
    call SetUnitPositionLoc( udg_RoCreateUnit[2], PolarProjectionBJ(GetUnitLoc(udg_RoCaster), ( -100.00 + ( I2R(udg_DistanCount) * 20.00 ) ), ( ( udg_RoAngle - 120.00 ) + ( I2R(udg_RoCount) * 30.00 ) )) )
    call SetUnitPositionLoc( udg_RoCreateUnit[3], PolarProjectionBJ(GetUnitLoc(udg_RoCaster), ( -100.00 + ( I2R(udg_DistanCount) * 20.00 ) ), ( ( udg_RoAngle + 120.00 ) + ( I2R(udg_RoCount) * 30.00 ) )) )
    set udg_RoAngle = ( udg_RoAngle + 30.00 )
    if ( Trig_Romove_Func009C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call RemoveLocation(udg_ActivePoint)
        call ResetUnitLookAt( udg_RoCaster )
        set udg_RoAngle = AngleBetweenPoints(GetUnitLoc(udg_RoMaster), GetUnitLoc(udg_RoCaster))
        call SetUnitPositionLocFacingBJ( udg_RoCreateUnit[4], GetUnitLoc(udg_RoCaster), udg_RoAngle )
        call SetUnitPositionLocFacingBJ( udg_RoCreateUnit[5], GetUnitLoc(udg_RoCaster), ( udg_RoAngle - 120.00 ) )
        call SetUnitPositionLocFacingBJ( udg_RoCreateUnit[6], GetUnitLoc(udg_RoCaster), ( udg_RoAngle + 120.00 ) )
        call CreateNUnitsAtLoc( 1, 'o017', GetOwningPlayer(udg_RoMaster), GetUnitLoc(udg_RoCaster), ( GetUnitFacing(udg_RoMaster) + 90.00 ) )
        set udg_RoCreateUnit[7] = GetLastCreatedUnit()
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_RoCaster), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitPositionLocFacingBJ( udg_RoCreateUnit[4], PolarProjectionBJ(GetUnitLoc(udg_RoCaster), 300.00, udg_RoAngle), udg_RoAngle )
        call SetUnitPositionLocFacingBJ( udg_RoCreateUnit[5], PolarProjectionBJ(GetUnitLoc(udg_RoCaster), 300.00, ( udg_RoAngle - 120.00 )), ( udg_RoAngle - 120.00 ) )
        call SetUnitPositionLocFacingBJ( udg_RoCreateUnit[6], PolarProjectionBJ(GetUnitLoc(udg_RoCaster), 300.00, ( udg_RoAngle + 120.00 )), ( udg_RoAngle + 120.00 ) )
        call AddSpecialEffectTargetUnitBJ( "hand", udg_RoCaster, "Objects\\Spawnmodels\\Human\\HumanBlood\\HeroBloodElfBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_RoCaster, "Objects\\Spawnmodels\\Human\\HumanBlood\\HeroBloodElfBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "head", udg_RoCaster, "Objects\\Spawnmodels\\Human\\HumanBlood\\HeroBloodElfBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "foot", udg_RoCaster, "Objects\\Spawnmodels\\Human\\HumanBlood\\HeroBloodElfBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.50 )
        call SetUnitPositionLoc( udg_RoMaster, PolarProjectionBJ(GetUnitLoc(udg_RoCaster), 300.00, udg_RoAngle) )
        set udg_RoCount = 1
        loop
            exitwhen udg_RoCount > 6
            call SetUnitPositionLoc( udg_RoCreateUnit[udg_RoCount], GetUnitLoc(udg_RoMaster) )
            set udg_RoCount = udg_RoCount + 1
        endloop
        call TriggerSleepAction( 0.50 )
        call PauseUnitBJ( false, udg_RoCaster )
        call PauseUnitBJ( false, udg_RoMaster )
        call UnitDamageTargetBJ( udg_RoMaster, udg_RoCaster, udg_RoDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call CreateTextTagUnitBJ( ( I2S(R2I(( udg_RoDamage + 0.00 ))) + "!" ), udg_RoCaster, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call SelectUnitForPlayerSingle( udg_RoMaster, GetOwningPlayer(udg_RoMaster) )
        call SelectUnitForPlayerSingle( udg_RoCaster, GetOwningPlayer(udg_RoCaster) )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_RoMaster), 'o017'), function Trig_Romove_Func009Func037A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_RoMaster), 'o018'), function Trig_Romove_Func009Func038A )
    else
    endif
endfunction

// --- InitTrig_Romove (family, line 29142) ---
function InitTrig_Romove takes nothing returns nothing
    set gg_trg_Romove = CreateTrigger(  )
    call DisableTrigger( gg_trg_Romove )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Romove, 0.02 )
    call TriggerAddAction( gg_trg_Romove, function Trig_Romove_Actions )
endfunction

// === family ThworldStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThworldStart_Conditions (family, line 29200) ---
function Trig_ThworldStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldStart_Func004C (family, line 29207) ---
function Trig_ThworldStart_Func004C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetTriggerUnit(), 'B02Y') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldStart_Func005C (family, line 29214) ---
function Trig_ThworldStart_Func005C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldStart_Actions (family, line 29221) ---
function Trig_ThworldStart_Actions takes nothing returns nothing
    set udg_RoMaster = GetTriggerUnit()
    set udg_ThworldAngle = GetUnitFacing(GetTriggerUnit())
    set udg_ThworldDis = 750.00
    if ( Trig_ThworldStart_Func004C() ) then
        set udg_ThWorldDamage = ( ( 333.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 3 )) )
    else
        set udg_ThWorldDamage = ( ( 333.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + 0.00 )
    endif
    if ( Trig_ThworldStart_Func005C() ) then
        set udg_ThWorldDamage = ( udg_ThWorldDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 5 )) )
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_RoMaster), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
    set udg_PP1 = GetUnitLoc(udg_RoMaster)
    call CreateNUnitsAtLoc( 1, 'h01S', GetOwningPlayer(GetTriggerUnit()), udg_PP1, udg_ThworldAngle )
    set udg_ThworldSP[0] = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h01T', GetOwningPlayer(GetTriggerUnit()), udg_PP1, udg_ThworldAngle )
    set udg_ThworldSP[1] = GetLastCreatedUnit()
    call SetUnitAnimation( udg_ThworldSP[1], "Attack Walk Stand Spin" )
    call AddSpecialEffectLocBJ( udg_PP1, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ShowUnitHide( udg_RoMaster )
    call RemoveLocation( udg_PP1 )
    call EnableTrigger( gg_trg_ThworldMove )
endfunction

// --- InitTrig_ThworldStart (family, line 29250) ---
function InitTrig_ThworldStart takes nothing returns nothing
    set gg_trg_ThworldStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThworldStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThworldStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThworldStart, Condition( function Trig_ThworldStart_Conditions ) )
    call TriggerAddAction( gg_trg_ThworldStart, function Trig_ThworldStart_Actions )
endfunction

// === family ThworldMove (armed) events=none ===

// --- Trig_ThworldMove_Func001Func015Func001Func008C (family, line 29261) ---
function Trig_ThworldMove_Func001Func015Func001Func008C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_RoMaster) == 'U01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldMove_Func001Func015Func001C (family, line 29268) ---
function Trig_ThworldMove_Func001Func015Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_RoMaster)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_ThworldGroup) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldMove_Func001Func015A (family, line 29281) ---
function Trig_ThworldMove_Func001Func015A takes nothing returns nothing
    if ( Trig_ThworldMove_Func001Func015Func001C() ) then
        set udg_PP3 = GetUnitLoc(GetEnumUnit())
        call GroupAddUnitSimple( GetEnumUnit(), udg_ThworldGroup )
        call AddSpecialEffectLocBJ( udg_PP3, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_RoMaster, GetEnumUnit(), udg_ThWorldDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call RemoveLocation( udg_PP3 )
        if ( Trig_ThworldMove_Func001Func015Func001Func008C() ) then
            call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
    else
    endif
endfunction

// --- Trig_ThworldMove_Func001Func016Func001C (family, line 29298) ---
function Trig_ThworldMove_Func001Func016Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetLastCreatedDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldMove_Func001Func016A (family, line 29305) ---
function Trig_ThworldMove_Func001Func016A takes nothing returns nothing
    if ( Trig_ThworldMove_Func001Func016Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_ThworldMove_Func001C (family, line 29312) ---
function Trig_ThworldMove_Func001C takes nothing returns boolean
    if ( not ( udg_ThworldDis > 0.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldMove_Actions (family, line 29319) ---
function Trig_ThworldMove_Actions takes nothing returns nothing
    if ( Trig_ThworldMove_Func001C() ) then
        set udg_PP1 = PolarProjectionBJ(GetUnitLoc(udg_ThworldSP[1]), 50.00, udg_ThworldAngle)
        call SetUnitPositionLocFacingBJ( udg_ThworldSP[1], udg_PP1, udg_ThworldAngle )
        set udg_PP2 = GetUnitLoc(udg_ThworldSP[1])
        call ForGroupBJ( GetUnitsInRangeOfLocAll(250.00, udg_PP2), function Trig_ThworldMove_Func001Func015A )
        call EnumDestructablesInCircleBJ( 250.00, udg_PP2, function Trig_ThworldMove_Func001Func016A )
        call RemoveLocation( udg_PP1 )
        call RemoveLocation( udg_PP2 )
        set udg_ThworldDis = ( udg_ThworldDis - 50.00 )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitPositionLocFacingBJ( udg_RoMaster, GetUnitLoc(udg_ThworldSP[1]), udg_ThworldAngle )
        call KillUnit( udg_ThworldSP[0] )
        call KillUnit( udg_ThworldSP[1] )
        call RemoveUnit( udg_ThworldSP[0] )
        call RemoveUnit( udg_ThworldSP[1] )
        call GroupClear( udg_ThworldGroup )
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_RoMaster), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call ShowUnitShow( udg_RoMaster )
        call SelectUnitForPlayerSingle( udg_RoMaster, GetOwningPlayer(udg_RoMaster) )
    endif
endfunction

// --- InitTrig_ThworldMove (family, line 29345) ---
function InitTrig_ThworldMove takes nothing returns nothing
    set gg_trg_ThworldMove = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThworldMove )
    call TriggerRegisterTimerEventPeriodic( gg_trg_ThworldMove, 0.04 )
    call TriggerAddAction( gg_trg_ThworldMove, function Trig_ThworldMove_Actions )
endfunction
