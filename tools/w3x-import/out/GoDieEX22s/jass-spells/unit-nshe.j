// unit rawcode: nshe
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MissingSheepDeath, MissingSheepAttacked, MissingSheepGo, MissingSheepGoal

// === family MissingSheepDeath (armed) events=none ===

// --- Trig_MissingSheepDeath_Conditions (family, line 19720) ---
function Trig_MissingSheepDeath_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'nshe' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MissingSheepDeath_Actions (family, line 19727) ---
function Trig_MissingSheepDeath_Actions takes nothing returns nothing
    call DisableTrigger( gg_trg_MissingSheepDeath )
    call DisableTrigger( gg_trg_MissingSheepGo )
    call DisableTrigger( gg_trg_MissingSheepGoal )
    call DisableTrigger( gg_trg_MissingSheepAttacked )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00查理被冬令進補了，" + ( "去死去死團方積分增加 30 點!" + "|r" ) ) )
    set bj_forLoopBIndex = 8
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        set udg_MissionScore[GetForLoopIndexB()] = ( udg_MissionScore[GetForLoopIndexB()] + 30 )
        call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetForLoopIndexB()], I2S(udg_MissionScore[GetForLoopIndexB()]) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call PlaySoundBJ( gg_snd_SheepDeath )
    call PlaySoundBJ( gg_snd_QuestFailed )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "獲得新稱號!" ) )
    set udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = "|c20FF0000(香蕉王)|r"
    call SetPlayerName( GetOwningPlayer(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]), ( ( udg_PlayerStarHeroTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) + ( udg_PlayerItemTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) ) )
endfunction

// --- InitTrig_MissingSheepDeath (family, line 19749) ---
function InitTrig_MissingSheepDeath takes nothing returns nothing
    set gg_trg_MissingSheepDeath = CreateTrigger(  )
    call DisableTrigger( gg_trg_MissingSheepDeath )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MissingSheepDeath, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_MissingSheepDeath, Condition( function Trig_MissingSheepDeath_Conditions ) )
    call TriggerAddAction( gg_trg_MissingSheepDeath, function Trig_MissingSheepDeath_Actions )
endfunction

// === family MissingSheepAttacked (armed) events=none ===

// --- Trig_MissingSheepAttacked_Conditions (family, line 19760) ---
function Trig_MissingSheepAttacked_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttackedUnitBJ()) == 'nshe' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MissingSheepAttacked_Actions (family, line 19767) ---
function Trig_MissingSheepAttacked_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_Sheep1, 100, GetAttackedUnitBJ() )
endfunction

// --- InitTrig_MissingSheepAttacked (family, line 19772) ---
function InitTrig_MissingSheepAttacked takes nothing returns nothing
    set gg_trg_MissingSheepAttacked = CreateTrigger(  )
    call DisableTrigger( gg_trg_MissingSheepAttacked )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MissingSheepAttacked, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_MissingSheepAttacked, Condition( function Trig_MissingSheepAttacked_Conditions ) )
    call TriggerAddAction( gg_trg_MissingSheepAttacked, function Trig_MissingSheepAttacked_Actions )
endfunction

// === family MissingSheepGo (armed) events=none ===

// --- Trig_MissingSheepGo_Func001Func002A (family, line 19655) ---
function Trig_MissingSheepGo_Func001Func002A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_MissingSheepGo_Func001A (family, line 19659) ---
function Trig_MissingSheepGo_Func001A takes nothing returns nothing
    call IssuePointOrderLocBJ( GetEnumUnit(), "move", GetRectCenter(gg_rct________047) )
    call EnumDestructablesInCircleBJ( 300.00, GetUnitLoc(GetEnumUnit()), function Trig_MissingSheepGo_Func001Func002A )
endfunction

// --- Trig_MissingSheepGo_Actions (family, line 19664) ---
function Trig_MissingSheepGo_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(0), 'nshe'), function Trig_MissingSheepGo_Func001A )
endfunction

// --- InitTrig_MissingSheepGo (family, line 19669) ---
function InitTrig_MissingSheepGo takes nothing returns nothing
    set gg_trg_MissingSheepGo = CreateTrigger(  )
    call DisableTrigger( gg_trg_MissingSheepGo )
    call TriggerRegisterTimerEventPeriodic( gg_trg_MissingSheepGo, 3.00 )
    call TriggerAddAction( gg_trg_MissingSheepGo, function Trig_MissingSheepGo_Actions )
endfunction

// === family MissingSheepGoal (armed) events=none ===

// --- Trig_MissingSheepGoal_Conditions (family, line 19679) ---
function Trig_MissingSheepGoal_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnteringUnit()) == 'nshe' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MissingSheepGoal_Actions (family, line 19686) ---
function Trig_MissingSheepGoal_Actions takes nothing returns nothing
    call DisableTrigger( gg_trg_MissingSheepDeath )
    call DisableTrigger( gg_trg_MissingSheepGo )
    call DisableTrigger( gg_trg_MissingSheepGoal )
    call DisableTrigger( gg_trg_MissingSheepAttacked )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00差離：Hey~look at that.  " + ( "I find the snow~man." + "|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00差離：guys....?" + ( "" + "|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00斯~~~~" + ( "碰!!" + "|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00保護(?)獨角獸任務完成，" + ( "愛與和平方積分增加 30 點!" + "|r" ) ) )
    set bj_forLoopBIndex = 2
    set bj_forLoopBIndexEnd = 6
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        set udg_MissionScore[GetForLoopIndexB()] = ( udg_MissionScore[GetForLoopIndexB()] + 30 )
        call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetForLoopIndexB()], I2S(udg_MissionScore[GetForLoopIndexB()]) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call ExplodeUnitBJ( GetEnteringUnit() )
    call PlaySoundBJ( gg_snd_Sheep3 )
    call PlaySoundBJ( gg_snd_GoodJob )
endfunction

// --- InitTrig_MissingSheepGoal (family, line 19709) ---
function InitTrig_MissingSheepGoal takes nothing returns nothing
    set gg_trg_MissingSheepGoal = CreateTrigger(  )
    call DisableTrigger( gg_trg_MissingSheepGoal )
    call TriggerRegisterEnterRectSimple( gg_trg_MissingSheepGoal, gg_rct________047 )
    call TriggerAddCondition( gg_trg_MissingSheepGoal, Condition( function Trig_MissingSheepGoal_Conditions ) )
    call TriggerAddAction( gg_trg_MissingSheepGoal, function Trig_MissingSheepGoal_Actions )
endfunction
