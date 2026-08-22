// unit rawcode: H00L
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Link, CircleCut, DeathSlashEX, DefEnd, DefStart, Initiate_Fan_Toss_2

// === family Open_Skill_of_Link (armed) events=none ===

// --- Trig_Open_Skill_of_Link_Conditions (family, line 45907) ---
function Trig_Open_Skill_of_Link_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Link_Actions (family, line 45914) ---
function Trig_Open_Skill_of_Link_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_Initiate_Fan_Toss_2 )
    call EnableTrigger( gg_trg_CircleCut )
    call EnableTrigger( gg_trg_DefStart )
    call EnableTrigger( gg_trg_DefEnd )
    call EnableTrigger( gg_trg_DeathSlashEX )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "林克: 吹笛子的人...你認識嗎?" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Link (family, line 45926) ---
function InitTrig_Open_Skill_of_Link takes nothing returns nothing
    set gg_trg_Open_Skill_of_Link = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Link, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Link, Condition( function Trig_Open_Skill_of_Link_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Link, function Trig_Open_Skill_of_Link_Actions )
endfunction

// === family CircleCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CircleCut_Conditions (family, line 46102) ---
function Trig_CircleCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CircleCut_Func007A (family, line 46109) ---
function Trig_CircleCut_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_CircleCut_Func008A (family, line 46114) ---
function Trig_CircleCut_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_CircleCut_Func009A (family, line 46119) ---
function Trig_CircleCut_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_CircleCut_Actions (family, line 46124) ---
function Trig_CircleCut_Actions takes nothing returns nothing
    set udg_LinkUnit = GetTriggerUnit()
    set udg_P_Link = GetUnitLoc(GetTriggerUnit())
    set udg_LinkDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) * 0.50 )
    set udg_LinkCounter = 0
    call PlaySoundOnUnitBJ( gg_snd_AxeMissileLaunch1, 100.00, GetEnumUnit() )
    call EnableTrigger( gg_trg_CircleCut_Moving )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_CircleCut_Func007A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_CircleCut_Func008A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_CircleCut_Func009A )
endfunction

// --- InitTrig_CircleCut (family, line 46137) ---
function InitTrig_CircleCut takes nothing returns nothing
    set gg_trg_CircleCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_CircleCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CircleCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CircleCut, Condition( function Trig_CircleCut_Conditions ) )
    call TriggerAddAction( gg_trg_CircleCut, function Trig_CircleCut_Actions )
endfunction

// === family DeathSlashEX (armed) events=none ===

// --- Trig_DeathSlashEX_Func013C (family, line 46266) ---
function Trig_DeathSlashEX_Func013C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetAttacker()))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetAttacker()) == 'H00L' ) ) then
        return false
    endif
    if ( not ( GetUnitLifePercent(GetAttacker()) <= 45.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathSlashEX_Conditions (family, line 46279) ---
function Trig_DeathSlashEX_Conditions takes nothing returns boolean
    if ( not Trig_DeathSlashEX_Func013C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathSlashEX_Func002A (family, line 46286) ---
function Trig_DeathSlashEX_Func002A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DeathSlashEX_Actions (family, line 46291) ---
function Trig_DeathSlashEX_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetAttacker()), 'hfoo'), function Trig_DeathSlashEX_Func002A )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetAttacker()), GetUnitLoc(GetAttacker()), GetUnitFacing(GetAttacker()) )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A10Q', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A10Q', GetLastCreatedUnit(), 1 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetAttackedUnitBJ()) )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call TriggerSleepAction( 0.01 )
    call EnableTrigger( gg_trg_DeathSlashEX )
endfunction

// --- InitTrig_DeathSlashEX (family, line 46306) ---
function InitTrig_DeathSlashEX takes nothing returns nothing
    set gg_trg_DeathSlashEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathSlashEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathSlashEX, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_DeathSlashEX, Condition( function Trig_DeathSlashEX_Conditions ) )
    call TriggerAddAction( gg_trg_DeathSlashEX, function Trig_DeathSlashEX_Actions )
endfunction

// === family DefEnd (armed) events=none ===

// --- Trig_DefEnd_Conditions (family, line 46238) ---
function Trig_DefEnd_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H00L' ) ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("undefend") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefEnd_Actions (family, line 46248) ---
function Trig_DefEnd_Actions takes nothing returns nothing
    call UnitRemoveAbilityBJ( 'A0P5', GetTriggerUnit() )
endfunction

// --- InitTrig_DefEnd (family, line 46253) ---
function InitTrig_DefEnd takes nothing returns nothing
    set gg_trg_DefEnd = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefEnd )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefEnd, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_DefEnd, Condition( function Trig_DefEnd_Conditions ) )
    call TriggerAddAction( gg_trg_DefEnd, function Trig_DefEnd_Actions )
endfunction

// === family DefStart (armed) events=none ===

// --- Trig_DefStart_Conditions (family, line 46211) ---
function Trig_DefStart_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H00L' ) ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("defend") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStart_Actions (family, line 46221) ---
function Trig_DefStart_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_SorceressMissileLaunch1, 100.00, GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A0P5', GetTriggerUnit() )
endfunction

// --- InitTrig_DefStart (family, line 46227) ---
function InitTrig_DefStart takes nothing returns nothing
    set gg_trg_DefStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefStart, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_DefStart, Condition( function Trig_DefStart_Conditions ) )
    call TriggerAddAction( gg_trg_DefStart, function Trig_DefStart_Actions )
endfunction

// === family Initiate_Fan_Toss_2 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Initiate_Fan_Toss_2_Conditions (family, line 45936) ---
function Trig_Initiate_Fan_Toss_2_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initiate_Fan_Toss_2_Func018A (family, line 45943) ---
function Trig_Initiate_Fan_Toss_2_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Initiate_Fan_Toss_2_Func019A (family, line 45948) ---
function Trig_Initiate_Fan_Toss_2_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Initiate_Fan_Toss_2_Func020A (family, line 45953) ---
function Trig_Initiate_Fan_Toss_2_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Initiate_Fan_Toss_2_Actions (family, line 45958) ---
function Trig_Initiate_Fan_Toss_2_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_WitchDoctorCastAttack1, 100.00, GetTriggerUnit() )
    set udg_Link = GetTriggerUnit()
    set udg_FanTossDamageLink = ( 50.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0BO', GetTriggerUnit())) ) )
    set udg_FanTossCenterPointLink = GetSpellTargetLoc()
    set udg_TrackWE_PointLink = GetUnitLoc(GetTriggerUnit())
    set udg_Fan_Right_Point_1Link = PolarProjectionBJ(udg_TrackWE_PointLink, SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )), ( AngleBetweenPoints(udg_TrackWE_PointLink, udg_FanTossCenterPointLink) + ( 0.00 - AcosBJ(( 500.00 / SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )) )) ) ))
    call CreateNUnitsAtLoc( 1, 'h00P', GetOwningPlayer(GetTriggerUnit()), udg_TrackWE_PointLink, bj_UNIT_FACING )
    set udg_FanRightLink = GetLastCreatedUnit()
    set udg_FanRightAngleLink = ( AngleBetweenPoints(udg_TrackWE_PointLink, udg_FanTossCenterPointLink) + 0.00 )
    call RemoveLocation(udg_FanTossCenterPointLink)
    call RemoveLocation(udg_TrackWE_PointLink)
    set udg_FanTravel_DISTLink = 150.00
    set udg_FanRotationCounterLink = 0.00
    call PlaySoundOnUnitBJ( gg_snd_DruidOfTheTalonMissileLaunch2, 100.00, GetTriggerUnit() )
    call EnableTrigger( gg_trg_Fan_Movement_2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_Initiate_Fan_Toss_2_Func018A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_Initiate_Fan_Toss_2_Func019A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_Initiate_Fan_Toss_2_Func020A )
endfunction

// --- InitTrig_Initiate_Fan_Toss_2 (family, line 45980) ---
function InitTrig_Initiate_Fan_Toss_2 takes nothing returns nothing
    set gg_trg_Initiate_Fan_Toss_2 = CreateTrigger(  )
    call DisableTrigger( gg_trg_Initiate_Fan_Toss_2 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Initiate_Fan_Toss_2, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Initiate_Fan_Toss_2, Condition( function Trig_Initiate_Fan_Toss_2_Conditions ) )
    call TriggerAddAction( gg_trg_Initiate_Fan_Toss_2, function Trig_Initiate_Fan_Toss_2_Actions )
endfunction
