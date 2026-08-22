// unit rawcode: N01L
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Mentor, Advantage, BeginFutureDream, FlyAway, FutureDream, GoldWood, Smile

// === family Open_Skill_of_Mentor (armed) events=none ===

// --- Trig_Open_Skill_of_Mentor_Conditions (family, line 55031) ---
function Trig_Open_Skill_of_Mentor_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'N01L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Mentor_Actions (family, line 55038) ---
function Trig_Open_Skill_of_Mentor_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_GoldWood )
    call EnableTrigger( gg_trg_Smile )
    call EnableTrigger( gg_trg_FutureDream )
    call EnableTrigger( gg_trg_BeginFutureDream )
    call TriggerRegisterUnitEvent( gg_trg_Advantage, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    call TriggerRegisterUnitEvent( gg_trg_FlyAway, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    set udg_Mentor = GetTriggerUnit()
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "小派：嘛！" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Mentor (family, line 55052) ---
function InitTrig_Open_Skill_of_Mentor takes nothing returns nothing
    set gg_trg_Open_Skill_of_Mentor = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Mentor, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Mentor, Condition( function Trig_Open_Skill_of_Mentor_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Mentor, function Trig_Open_Skill_of_Mentor_Actions )
endfunction

// === family Advantage (armed) events=none ===

// --- Trig_Advantage_Actions (family, line 55062) ---
function Trig_Advantage_Actions takes nothing returns nothing
    local location RiderHidePoint
    local unit RiderHideUnit

    if ( GetRandomInt(1, 10) == 5 ) then

      set RiderHidePoint = GetUnitLoc(GetEventDamageSource())
      call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), RiderHidePoint, bj_UNIT_FACING )
      set RiderHideUnit = GetLastCreatedUnit()
      call ShowUnitHide( RiderHideUnit )
      call UnitApplyTimedLifeBJ( 2.00, 'BTLF', RiderHideUnit )
      call UnitAddAbilityBJ( 'A0ZB', GetLastCreatedUnit() )
      call IssuePointOrderLocBJ( RiderHideUnit, "silence", RiderHidePoint )
      call RemoveLocation( RiderHidePoint )
      call TriggerSleepAction( 1.00 )
      call KillUnit( RiderHideUnit )
      call RemoveUnit( RiderHideUnit )
    else
    endif



endfunction

// --- InitTrig_Advantage (family, line 55087) ---
function InitTrig_Advantage takes nothing returns nothing
    set gg_trg_Advantage = CreateTrigger(  )
    call TriggerAddAction( gg_trg_Advantage, function Trig_Advantage_Actions )
endfunction

// === family BeginFutureDream (active) events=EVENT_PLAYER_UNIT_SPELL_CHANNEL ===

// --- Trig_BeginFutureDream_Conditions (family, line 55242) ---
function Trig_BeginFutureDream_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BeginFutureDream_Actions (family, line 55249) ---
function Trig_BeginFutureDream_Actions takes nothing returns nothing
    call DisplayTextToForce( GetPlayersAll(), ( GetPlayerName(GetOwningPlayer(GetTriggerUnit())) + ( "：再過12分鐘納美克星即將爆炸！(誤)" + "" ) ) )
endfunction

// --- InitTrig_BeginFutureDream (family, line 55254) ---
function InitTrig_BeginFutureDream takes nothing returns nothing
    set gg_trg_BeginFutureDream = CreateTrigger(  )
    call DisableTrigger( gg_trg_BeginFutureDream )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BeginFutureDream, EVENT_PLAYER_UNIT_SPELL_CHANNEL )
    call TriggerAddCondition( gg_trg_BeginFutureDream, Condition( function Trig_BeginFutureDream_Conditions ) )
    call TriggerAddAction( gg_trg_BeginFutureDream, function Trig_BeginFutureDream_Actions )
endfunction

// === family FlyAway (passive) events=none ===

// --- Trig_FlyAway_Actions (family, line 55179) ---
function Trig_FlyAway_Actions takes nothing returns nothing
    local unit RiderHideUnit

    if ( JudgeFunc() ) then
        set udg_Mentor_UnitPoint = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Mentor_UnitPoint, bj_UNIT_FACING )
        set RiderHideUnit = GetLastCreatedUnit()
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', RiderHideUnit )
        call UnitAddItemByIdSwapped( 'will', RiderHideUnit )
        call ShowUnitHide( RiderHideUnit )
        call UnitUseItemTarget( RiderHideUnit, GetLastCreatedItem(), GetTriggerUnit() )
        call RemoveLocation(udg_Mentor_UnitPoint)
        call TriggerSleepAction( 1.00 )
        call KillUnit( RiderHideUnit )
        call RemoveUnit( RiderHideUnit )
    else
    endif

endfunction

// --- InitTrig_FlyAway (family, line 55200) ---
function InitTrig_FlyAway takes nothing returns nothing
    set gg_trg_FlyAway = CreateTrigger(  )
    call TriggerAddAction( gg_trg_FlyAway, function Trig_FlyAway_Actions )
endfunction

// --- JudgeFunc (helper, line 55168) ---
function JudgeFunc takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0ZI', GetTriggerUnit()) > 0 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) == 4 ) ) then
        return false
    endif
    return true
endfunction

// === family FutureDream (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FutureDream_Conditions (family, line 55208) ---
function Trig_FutureDream_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FutureDream_Func001C (family, line 55215) ---
function Trig_FutureDream_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetTriggerUnit(), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FutureDream_Actions (family, line 55222) ---
function Trig_FutureDream_Actions takes nothing returns nothing
    if ( Trig_FutureDream_Func001C() ) then
        call KillUnit( gg_unit_unpl_0000 )
    else
        call KillUnit( gg_unit_etoe_0016 )
    endif
endfunction

// --- InitTrig_FutureDream (family, line 55231) ---
function InitTrig_FutureDream takes nothing returns nothing
    set gg_trg_FutureDream = CreateTrigger(  )
    call DisableTrigger( gg_trg_FutureDream )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FutureDream, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FutureDream, Condition( function Trig_FutureDream_Conditions ) )
    call TriggerAddAction( gg_trg_FutureDream, function Trig_FutureDream_Actions )
endfunction

// === family GoldWood (passive) events=none ===

// --- Trig_GoldWood_Conditions (family, line 55095) ---
function Trig_GoldWood_Conditions takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0ZD', udg_Mentor) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldWood_Actions (family, line 55102) ---
function Trig_GoldWood_Actions takes nothing returns nothing
    set udg_Mentor_GoldAdd = R2I(( ( 0.01 * I2R(GetUnitAbilityLevelSwapped('A0ZD', udg_Mentor)) ) * I2R(GetPlayerState(GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_GOLD)) ))
    set udg_Mentor_WoodAdd = R2I(( ( 0.01 * I2R(GetUnitAbilityLevelSwapped('A0ZD', udg_Mentor)) ) * I2R(GetPlayerState(GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_LUMBER)) ))
    call AdjustPlayerStateBJ( udg_Mentor_GoldAdd, GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_GOLD )
    call AdjustPlayerStateBJ( udg_Mentor_WoodAdd, GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_LUMBER )
    call TextUse(  ("+" + I2S(udg_Mentor_GoldAdd) )  , udg_Mentor , 10 , 4 , 90,90,0)
    call TextUse(  ( "+" + I2S(udg_Mentor_WoodAdd) )  , udg_Mentor , 10 , 4 , 0,90,0)
endfunction

// --- InitTrig_GoldWood (family, line 55112) ---
function InitTrig_GoldWood takes nothing returns nothing
    set gg_trg_GoldWood = CreateTrigger(  )
    call DisableTrigger( gg_trg_GoldWood )
    call TriggerRegisterTimerEventPeriodic( gg_trg_GoldWood, 60.00 )
    call TriggerAddCondition( gg_trg_GoldWood, Condition( function Trig_GoldWood_Conditions ) )
    call TriggerAddAction( gg_trg_GoldWood, function Trig_GoldWood_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

// === family Smile (passive) events=none ===

// --- Trig_Smile_Conditions (family, line 55123) ---
function Trig_Smile_Conditions takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0ZE', udg_Mentor) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Smile_Func002Func001C (family, line 55130) ---
function Trig_Smile_Func002Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_Mentor)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Smile_Func002A (family, line 55140) ---
function Trig_Smile_Func002A takes nothing returns nothing
    if ( Trig_Smile_Func002Func001C() ) then
        set udg_Mentor_HealthPoint = GetUnitLoc(GetEnumUnit())
        call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0ZE', udg_Mentor)) ) ) )
        call AddSpecialEffectLocBJ( udg_Mentor_HealthPoint, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation(udg_Mentor_HealthPoint)
    else
    endif
endfunction

// --- Trig_Smile_Actions (family, line 55151) ---
function Trig_Smile_Actions takes nothing returns nothing
    set udg_Mentor_UnitPoint = GetUnitLoc(udg_Mentor)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(300.00, udg_Mentor_UnitPoint), function Trig_Smile_Func002A )
endfunction

// --- InitTrig_Smile (family, line 55157) ---
function InitTrig_Smile takes nothing returns nothing
    set gg_trg_Smile = CreateTrigger(  )
    call DisableTrigger( gg_trg_Smile )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Smile, 30.00 )
    call TriggerAddCondition( gg_trg_Smile, Condition( function Trig_Smile_Conditions ) )
    call TriggerAddAction( gg_trg_Smile, function Trig_Smile_Actions )
endfunction
