// rawcode: A0MX
// nameZh: 80-01 天下無雙
// w3a base: AOcr  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FlyHeroAch, skill1

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
