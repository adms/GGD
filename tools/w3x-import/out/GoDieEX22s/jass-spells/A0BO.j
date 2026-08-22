// rawcode: A0BO
// nameZh: 60-01 科奇利族的迴旋鏢
// cooldown: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0, "5": 7.0}
// mana: {"1": 50, "2": 85, "3": 120, "4": 155, "5": 75}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Initiate_Fan_Toss_2

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
