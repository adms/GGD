// unit rawcode: H01U
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_LuBu, FlyHeroAch, Get_Rabbit_EX, RabbitYell, skill1, skill3, skill4, skill4end, skill4eff

// === family Open_Skill_of_LuBu (armed) events=none ===

// --- Trig_Open_Skill_of_LuBu_Conditions (family, line 50278) ---
function Trig_Open_Skill_of_LuBu_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_LuBu_Func009A (family, line 50285) ---
function Trig_Open_Skill_of_LuBu_Func009A takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( false, 'A0N3', GetEnumPlayer() )
    call SetPlayerAbilityAvailableBJ( false, 'A0RW', GetEnumPlayer() )
endfunction

// --- Trig_Open_Skill_of_LuBu_Actions (family, line 50290) ---
function Trig_Open_Skill_of_LuBu_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_skill1 )
    call EnableTrigger( gg_trg_skill3 )
    call EnableTrigger( gg_trg_skill4 )
    call EnableTrigger( gg_trg_skill4end )
    call EnableTrigger( gg_trg_FlyHeroAch )
    call EnableTrigger( gg_trg_RabbitYell )
    call EnableTrigger( gg_trg_Get_Rabbit_EX )
    call ForForce( GetPlayersAll(), function Trig_Open_Skill_of_LuBu_Func009A )
    set udg_LuBuMaster = GetTriggerUnit()
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "呂布: 董卓....為什麼你有了我還要愛上貂蟬..." + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_LuBu (family, line 50305) ---
function InitTrig_Open_Skill_of_LuBu takes nothing returns nothing
    set gg_trg_Open_Skill_of_LuBu = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_LuBu, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_LuBu, Condition( function Trig_Open_Skill_of_LuBu_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_LuBu, function Trig_Open_Skill_of_LuBu_Actions )
endfunction

// === family FlyHeroAch (passive) events=EVENT_PLAYER_UNIT_DEATH ===

// --- Trig_FlyHeroAch_Conditions (family, line 50315) ---
function Trig_FlyHeroAch_Conditions takes nothing returns boolean
    if ( not ( GetKillingUnitBJ() == udg_LuBuMaster ) ) then
        return false
    endif
    if ( not ( udg_LuBuFlyLevel < ( 4 + ( 2 * GetUnitAbilityLevelSwapped('A0MX', udg_LuBuMaster) ) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FlyHeroAch_Func007001 (family, line 50325) ---
function Trig_FlyHeroAch_Func007001 takes nothing returns boolean
    return ( udg_LuBuFlyLevel < 1 )
endfunction

// --- Trig_FlyHeroAch_Actions (family, line 50329) ---
function Trig_FlyHeroAch_Actions takes nothing returns nothing
    set udg_LuBuFlyLevel = ( udg_LuBuFlyLevel + 1 )
    call SetUnitAbilityLevelSwapped( 'A0AU', udg_LuBuMaster, IMinBJ(udg_LuBuFlyLevel, ( 4 + ( 2 * GetUnitAbilityLevelSwapped('A0MX', udg_LuBuMaster) ) )) )
    call TriggerSleepAction( 15.00 )
    set udg_LuBuFlyLevel = ( udg_LuBuFlyLevel - 1 )
    if ( Trig_FlyHeroAch_Func007001() ) then
        set udg_LuBuFlyLevel = 1
    else
        call DoNothing(  )
    endif
    call SetUnitAbilityLevelSwapped( 'A0AU', udg_LuBuMaster, udg_LuBuFlyLevel )
endfunction

// --- InitTrig_FlyHeroAch (family, line 50343) ---
function InitTrig_FlyHeroAch takes nothing returns nothing
    set gg_trg_FlyHeroAch = CreateTrigger(  )
    call DisableTrigger( gg_trg_FlyHeroAch )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FlyHeroAch, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_FlyHeroAch, Condition( function Trig_FlyHeroAch_Conditions ) )
    call TriggerAddAction( gg_trg_FlyHeroAch, function Trig_FlyHeroAch_Actions )
endfunction

// === family Get_Rabbit_EX (armed) events=none ===

// --- Trig_Get_Rabbit_EX_Conditions (family, line 50606) ---
function Trig_Get_Rabbit_EX_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01U' ) ) then
        return false
    endif
    if ( not ( GetHeroLevel(GetTriggerUnit()) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Get_Rabbit_EX_Actions (family, line 50616) ---
function Trig_Get_Rabbit_EX_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A101', GetTriggerUnit(), 2 )
    call SetUnitAbilityLevelSwapped( 'A108', GetTriggerUnit(), 2 )
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
endfunction

// --- InitTrig_Get_Rabbit_EX (family, line 50624) ---
function InitTrig_Get_Rabbit_EX takes nothing returns nothing
    set gg_trg_Get_Rabbit_EX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Get_Rabbit_EX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Get_Rabbit_EX, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_Get_Rabbit_EX, Condition( function Trig_Get_Rabbit_EX_Conditions ) )
    call TriggerAddAction( gg_trg_Get_Rabbit_EX, function Trig_Get_Rabbit_EX_Actions )
endfunction

// === family RabbitYell (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_RabbitYell_Func003C (family, line 50534) ---
function Trig_RabbitYell_Func003C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetAttacker(), 'B02L') == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Conditions (family, line 50544) ---
function Trig_RabbitYell_Conditions takes nothing returns boolean
    if ( not Trig_RabbitYell_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Func002Func001C (family, line 50551) ---
function Trig_RabbitYell_Func002Func001C takes nothing returns boolean
    if ( not ( GetAttackedUnitBJ() == udg_LuBuMaster ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= ( GetUnitAbilityLevelSwapped('A0MZ', udg_LuBuMaster) * 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Func002C (family, line 50561) ---
function Trig_RabbitYell_Func002C takes nothing returns boolean
    if ( not ( GetAttacker() == udg_LuBuMaster ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= ( GetUnitAbilityLevelSwapped('A0MZ', udg_LuBuMaster) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Actions (family, line 50571) ---
function Trig_RabbitYell_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    if ( Trig_RabbitYell_Func002C() ) then
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_LuBuMaster), GetUnitLoc(udg_LuBuMaster), GetUnitLoc(GetAttackedUnitBJ()) )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0MW', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0MW', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0MY', udg_LuBuMaster) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetAttackedUnitBJ()) )
        call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100.00, GetLastCreatedUnit() )
    else
        if ( Trig_RabbitYell_Func002Func001C() ) then
            call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_LuBuMaster), GetUnitLoc(udg_LuBuMaster), GetUnitLoc(GetAttacker()) )
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A0MW', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A0MW', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0MY', udg_LuBuMaster) )
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetAttacker()) )
            call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100.00, GetLastCreatedUnit() )
        else
        endif
    endif
    call EnableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_RabbitYell (family, line 50595) ---
function InitTrig_RabbitYell takes nothing returns nothing
    set gg_trg_RabbitYell = CreateTrigger(  )
    call DisableTrigger( gg_trg_RabbitYell )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RabbitYell, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_RabbitYell, Condition( function Trig_RabbitYell_Conditions ) )
    call TriggerAddAction( gg_trg_RabbitYell, function Trig_RabbitYell_Actions )
endfunction

// === family skill1 (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_skill1_Conditions (family, line 50354) ---
function Trig_skill1_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill1_Func003C (family, line 50361) ---
function Trig_skill1_Func003C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0MX', GetTriggerUnit()) == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill1_Actions (family, line 50368) ---
function Trig_skill1_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0N4', GetTriggerUnit(), ( GetUnitAbilityLevelSwapped('A0MX', GetTriggerUnit()) + 1 ) )
    call SetUnitAbilityLevelSwapped( 'A0N5', GetTriggerUnit(), ( GetUnitAbilityLevelSwapped('A0MX', GetTriggerUnit()) + 1 ) )
    if ( Trig_skill1_Func003C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
    endif
endfunction

// --- InitTrig_skill1 (family, line 50378) ---
function InitTrig_skill1 takes nothing returns nothing
    set gg_trg_skill1 = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill1 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill1, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill1, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_skill1, Condition( function Trig_skill1_Conditions ) )
    call TriggerAddAction( gg_trg_skill1, function Trig_skill1_Actions )
endfunction

// === family skill3 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_skill3_Conditions (family, line 50390) ---
function Trig_skill3_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0N0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill3_Func006Func001C (family, line 50397) ---
function Trig_skill3_Func006Func001C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill3_Func006A (family, line 50404) ---
function Trig_skill3_Func006A takes nothing returns nothing
    if ( Trig_skill3_Func006Func001C() ) then
        call UnitDamageTargetBJ( udg_LuBuMaster, GetEnumUnit(), ( ( 150.00 + ( 200.00 * I2R(GetUnitAbilityLevelSwapped('A0N0', udg_LuBuMaster)) ) ) + ( 3.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_LuBuMaster, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "origin", GetEnumUnit(), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_skill3_Actions (family, line 50413) ---
function Trig_skill3_Actions takes nothing returns nothing
    set udg_LuBuMaster = GetTriggerUnit()
    set udg_LuBuP1[4] = GetUnitLoc(GetTriggerUnit())
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 3
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call CreateNUnitsAtLoc( 1, 'o01X', GetOwningPlayer(GetTriggerUnit()), udg_LuBuP1[4], bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0N2', GetLastCreatedUnit() )
        set udg_LuBuP1[5] = PolarProjectionBJ(udg_LuBuP1[4], 256, GetRandomDirectionDeg())
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "stampede", udg_LuBuP1[5] )
        call RemoveLocation( udg_LuBuP1[5])
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call CreateNUnitsAtLoc( 1, 'o01X', GetOwningPlayer(GetTriggerUnit()), udg_LuBuP1[4], bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(530.00, udg_LuBuP1[4]), function Trig_skill3_Func006A )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_LuBuP1[4])
endfunction

// --- InitTrig_skill3 (family, line 50437) ---
function InitTrig_skill3 takes nothing returns nothing
    set gg_trg_skill3 = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill3 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill3, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_skill3, Condition( function Trig_skill3_Conditions ) )
    call TriggerAddAction( gg_trg_skill3, function Trig_skill3_Actions )
endfunction

// === family skill4 (passive) events=EVENT_PLAYER_UNIT_ISSUED_ORDER ===

// --- Trig_skill4_Conditions (family, line 50475) ---
function Trig_skill4_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01U' ) ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("immolation") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill4_Actions (family, line 50485) ---
function Trig_skill4_Actions takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( true, 'A0RW', GetOwningPlayer(udg_LuBuMaster) )
    call SetUnitAbilityLevelSwapped( 'A0RW', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0MZ', GetTriggerUnit()) )
    call EnableTrigger( gg_trg_skill4eff )
endfunction

// --- InitTrig_skill4 (family, line 50492) ---
function InitTrig_skill4 takes nothing returns nothing
    set gg_trg_skill4 = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill4 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill4, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_skill4, Condition( function Trig_skill4_Conditions ) )
    call TriggerAddAction( gg_trg_skill4, function Trig_skill4_Actions )
endfunction

// === family skill4end (armed) events=none ===

// --- Trig_skill4end_Conditions (family, line 50448) ---
function Trig_skill4end_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01U' ) ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("unimmolation") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill4end_Actions (family, line 50458) ---
function Trig_skill4end_Actions takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( false, 'A0RW', GetOwningPlayer(udg_LuBuMaster) )
    call DisableTrigger( gg_trg_skill4eff )
endfunction

// --- InitTrig_skill4end (family, line 50464) ---
function InitTrig_skill4end takes nothing returns nothing
    set gg_trg_skill4end = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill4end )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill4end, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_skill4end, Condition( function Trig_skill4end_Conditions ) )
    call TriggerAddAction( gg_trg_skill4end, function Trig_skill4end_Actions )
endfunction

// === family skill4eff (armed) events=none ===

// --- Trig_skill4eff_Conditions (family, line 50503) ---
function Trig_skill4eff_Conditions takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_LuBuMaster, 'B02L') == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill4eff_Func004A (family, line 50510) ---
function Trig_skill4eff_Func004A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_skill4eff_Actions (family, line 50515) ---
function Trig_skill4eff_Actions takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( false, 'A0RW', GetOwningPlayer(udg_LuBuMaster) )
    call DisableTrigger( GetTriggeringTrigger() )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LuBuMaster), 'hfoo'), function Trig_skill4eff_Func004A )
endfunction

// --- InitTrig_skill4eff (family, line 50523) ---
function InitTrig_skill4eff takes nothing returns nothing
    set gg_trg_skill4eff = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill4eff )
    call TriggerRegisterTimerEventPeriodic( gg_trg_skill4eff, 1.00 )
    call TriggerAddCondition( gg_trg_skill4eff, Condition( function Trig_skill4eff_Conditions ) )
    call TriggerAddAction( gg_trg_skill4eff, function Trig_skill4eff_Actions )
endfunction
