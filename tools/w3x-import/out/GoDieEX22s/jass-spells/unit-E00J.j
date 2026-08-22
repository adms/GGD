// unit rawcode: E00J
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_HE, Fifty_Sky, FriendComeBack, Hundred_Sky, RedDragon, Thankyou

// === family Open_Skill_of_HE (armed) events=none ===

// --- Trig_Open_Skill_of_HE_Conditions (family, line 54245) ---
function Trig_Open_Skill_of_HE_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00J' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_HE_Actions (family, line 54252) ---
function Trig_Open_Skill_of_HE_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_HEUnit = GetEnteringUnit()
    call EnableTrigger( gg_trg_RedDragon )
    call EnableTrigger( gg_trg_Thankyou )
    call EnableTrigger( gg_trg_Fifty_Sky )
    call EnableTrigger( gg_trg_Hundred_Sky )
    call EnableTrigger( gg_trg_FriendComeBack )
    set udg_TaiwanOfKing = GetTriggerUnit()
    call SetPlayerAbilityAvailableBJ( false, 'A0YC', GetOwningPlayer(GetTriggerUnit()) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "騜：我相信正直跟善良會回來" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_HE (family, line 54267) ---
function InitTrig_Open_Skill_of_HE takes nothing returns nothing
    set gg_trg_Open_Skill_of_HE = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_HE, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_HE, Condition( function Trig_Open_Skill_of_HE_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_HE, function Trig_Open_Skill_of_HE_Actions )
endfunction

// === family Fifty_Sky (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Fifty_Sky_Conditions (family, line 54435) ---
function Trig_Fifty_Sky_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Fifty_Sky_Actions (family, line 54442) ---
function Trig_Fifty_Sky_Actions takes nothing returns nothing
    set udg_HE_50_Target = GetSpellTargetUnit()
    set udg_HE_50_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HE_50_P2 = GetUnitLoc(udg_HE_50_Target)
    set udg_HE_50_slv = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_HE_50_Counter = 0
    set udg_HE_50_Damage = 0.00
    set udg_HE_50_Dist = R2I(( DistanceBetweenPoints(udg_HE_50_P1, udg_HE_50_P2) / 50.00 ))
    set udg_HE_50_Get = false
    call AddSpecialEffectLocBJ( udg_KniSkillPoint, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0YI', udg_HEUnit )
    call SetUnitAnimation( udg_HEUnit, "walk" )
    call TriggerSleepAction( 0.00 )
    call SetUnitPathing( udg_HEUnit, false )
    call EnableTrigger( gg_trg_Fifty_Sky_Effect )
endfunction

// --- InitTrig_Fifty_Sky (family, line 54461) ---
function InitTrig_Fifty_Sky takes nothing returns nothing
    set gg_trg_Fifty_Sky = CreateTrigger(  )
    call DisableTrigger( gg_trg_Fifty_Sky )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Fifty_Sky, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Fifty_Sky, Condition( function Trig_Fifty_Sky_Conditions ) )
    call TriggerAddAction( gg_trg_Fifty_Sky, function Trig_Fifty_Sky_Actions )
endfunction

// === family FriendComeBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FriendComeBack_Conditions (family, line 54657) ---
function Trig_FriendComeBack_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FriendComeBack_Func001Func001C (family, line 54664) ---
function Trig_FriendComeBack_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(udg_PlayerHeroUnit[GetForLoopIndexA()], GetOwningPlayer(udg_TaiwanOfKing)) == true ) ) then
        return false
    endif
    if ( not ( TimerGetRemaining(udg_ReviveTimers[GetForLoopIndexA()]) > 1.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FriendComeBack_Func005Func001C (family, line 54677) ---
function Trig_FriendComeBack_Func005Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(udg_PlayerHeroUnit[GetForLoopIndexA()], GetOwningPlayer(udg_TaiwanOfKing)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FriendComeBack_Actions (family, line 54687) ---
function Trig_FriendComeBack_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_FriendComeBack_Func001Func001C() ) then
            call StartTimerBJ( udg_ReviveTimers[GetForLoopIndexA()], false, 1.00 )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call TriggerSleepAction( 1.50 )
    call TextUse("公平與正義回來了!!!", udg_TaiwanOfKing , 30 , 4 , 100,0,0)
    set udg_TaiwanOfKingP = GetUnitLoc(udg_TaiwanOfKing)
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_FriendComeBack_Func005Func001C() ) then
            call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], 100 )
            call SetUnitManaPercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], 100 )
            call SetUnitPositionLoc( udg_PlayerHeroUnit[GetForLoopIndexA()], udg_TaiwanOfKingP )
            call AddSpecialEffectTargetUnitBJ( "origin", udg_PlayerHeroUnit[GetForLoopIndexA()], "Abilities\\Spells\\Human\\Resurrect\\ResurrectCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call RemoveLocation(udg_TaiwanOfKingP)
endfunction

// --- InitTrig_FriendComeBack (family, line 54719) ---
function InitTrig_FriendComeBack takes nothing returns nothing
    set gg_trg_FriendComeBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_FriendComeBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FriendComeBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FriendComeBack, Condition( function Trig_FriendComeBack_Conditions ) )
    call TriggerAddAction( gg_trg_FriendComeBack, function Trig_FriendComeBack_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

// === family Hundred_Sky (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Hundred_Sky_Conditions (family, line 54596) ---
function Trig_Hundred_Sky_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y9' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hundred_Sky_Func003C (family, line 54603) ---
function Trig_Hundred_Sky_Func003C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_HEUnit, 'B04Y') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hundred_Sky_Func005C (family, line 54610) ---
function Trig_Hundred_Sky_Func005C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_HE_100_Target, 'B050') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hundred_Sky_Actions (family, line 54617) ---
function Trig_Hundred_Sky_Actions takes nothing returns nothing
    set udg_HE_100_Target = GetSpellTargetUnit()
    set udg_HE_100_Damage = ( 300.00 + ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    if ( Trig_Hundred_Sky_Func003C() ) then
        set udg_HE_P = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_HEUnit), udg_HE_P, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0UT', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0UT', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0Y9', GetTriggerUnit()) )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
        call KillUnit( GetLastCreatedUnit() )
        call RemoveUnit( GetLastCreatedUnit() )
        call AddSpecialEffectLocBJ( udg_HE_P, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_HE_P )
    else
    endif
    call TriggerSleepAction( 0.00 )
    if ( Trig_Hundred_Sky_Func005C() ) then
        call UnitDamageTargetBJ( udg_HEUnit, udg_HE_100_Target, udg_HE_100_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_HE_100_Target, "Units\\NightElf\\Wisp\\WispExplode.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "overhead", udg_HE_100_Target, "Abilities\\Spells\\Human\\Avatar\\AvatarCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- InitTrig_Hundred_Sky (family, line 54646) ---
function InitTrig_Hundred_Sky takes nothing returns nothing
    set gg_trg_Hundred_Sky = CreateTrigger(  )
    call DisableTrigger( gg_trg_Hundred_Sky )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Hundred_Sky, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Hundred_Sky, Condition( function Trig_Hundred_Sky_Conditions ) )
    call TriggerAddAction( gg_trg_Hundred_Sky, function Trig_Hundred_Sky_Actions )
endfunction

// === family RedDragon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_RedDragon_Conditions (family, line 54277) ---
function Trig_RedDragon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RedDragon_Actions (family, line 54284) ---
function Trig_RedDragon_Actions takes nothing returns nothing
    call SetUnitLifePercentBJ( GetTriggerUnit(), ( GetUnitLifePercent(GetTriggerUnit()) + 10.00 ) )
    call SetUnitManaPercentBJ( GetTriggerUnit(), ( GetUnitManaPercent(GetTriggerUnit()) + 10.00 ) )
    call SetUnitAbilityLevelSwapped( 'A0YC', GetTriggerUnit(), 2 )
    call TriggerSleepAction( 10.00 )
    call SetUnitAbilityLevelSwapped( 'A0YC', GetTriggerUnit(), 1 )
endfunction

// --- InitTrig_RedDragon (family, line 54293) ---
function InitTrig_RedDragon takes nothing returns nothing
    set gg_trg_RedDragon = CreateTrigger(  )
    call DisableTrigger( gg_trg_RedDragon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RedDragon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_RedDragon, Condition( function Trig_RedDragon_Conditions ) )
    call TriggerAddAction( gg_trg_RedDragon, function Trig_RedDragon_Actions )
endfunction

// === family Thankyou (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Thankyou_Conditions (family, line 54306) ---
function Trig_Thankyou_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y7' ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Thankyou_Func012Func001A (family, line 54316) ---
function Trig_Thankyou_Func012Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_Thankyou_Actions (family, line 54320) ---
function Trig_Thankyou_Actions takes nothing returns nothing
    set udg_HE_3Q_slv = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_HE_3Q_Counter = ( 4 + ( 4 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) )
    set udg_HE_3Q_Target = GetSpellTargetUnit()
    set udg_HE_3Q_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HE_3Q_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_HE_3Q_Angle = AngleBetweenPoints(udg_HE_3Q_P1, udg_HE_3Q_P2)
    call RemoveLocation( udg_HE_3Q_P1 )
    call RemoveLocation( udg_HE_3Q_P2 )
    call EnableTrigger( gg_trg_Thankyou_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_Thankyou_Func012Func001A )
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

// --- InitTrig_Thankyou (family, line 54348) ---
function InitTrig_Thankyou takes nothing returns nothing
    set gg_trg_Thankyou = CreateTrigger(  )
    call DisableTrigger( gg_trg_Thankyou )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Thankyou, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Thankyou, Condition( function Trig_Thankyou_Conditions ) )
    call TriggerAddAction( gg_trg_Thankyou, function Trig_Thankyou_Actions )
endfunction
