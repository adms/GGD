// unit rawcode: njgb
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: PigReward, GodTear_1100

// === family PigReward (armed) events=none ===

// --- Trig_PigReward_Func002C (family, line 19507) ---
function Trig_PigReward_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'njgb' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PigReward_Conditions (family, line 19514) ---
function Trig_PigReward_Conditions takes nothing returns boolean
    if ( not Trig_PigReward_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_PigReward_Actions (family, line 19521) ---
function Trig_PigReward_Actions takes nothing returns nothing
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( "|c00af5cff玩家" + ( GetPlayerName(GetOwningPlayer(GetKillingUnitBJ())) + "完成魔崇神任務|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00森林裡的詛咒稍微平息下來了，" + ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "謝謝你！|r" ) ) )
    set udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = ( udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + GetUnitLevel(GetDyingUnit()) )
    call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], I2S(udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "獲得新稱號!" ) )
    set udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = "|c20FF0000(殺豬的)|r"
    call SetPlayerName( GetOwningPlayer(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]), ( ( udg_PlayerStarHeroTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) + ( udg_PlayerItemTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) ) )
    call EnableTrigger( gg_trg_GodTear_1100 )
    call PlaySoundBJ( gg_snd_GoodJob )
endfunction

// --- InitTrig_PigReward (family, line 19534) ---
function InitTrig_PigReward takes nothing returns nothing
    set gg_trg_PigReward = CreateTrigger(  )
    call TriggerRegisterPlayerUnitEventSimple( gg_trg_PigReward, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_PigReward, Condition( function Trig_PigReward_Conditions ) )
    call TriggerAddAction( gg_trg_PigReward, function Trig_PigReward_Actions )
endfunction

// === family GodTear_1100 (armed) events=none ===

// --- Trig_GodTear_1100_Func004C (family, line 19314) ---
function Trig_GodTear_1100_Func004C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 2) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodTear_1100_Actions (family, line 19321) ---
function Trig_GodTear_1100_Actions takes nothing returns nothing
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_7035" )
    call CreateNUnitsAtLoc( 1, 'nsln', Player(PLAYER_NEUTRAL_AGGRESSIVE), GetRectCenter(gg_rct_LoveLV4), bj_UNIT_FACING )
    call PingMinimapLocForForce( GetPlayersAll(), GetRectCenter(gg_rct_LoveLV4), 3.00 )
    if ( Trig_GodTear_1100_Func004C() ) then
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", GetRectCenter(gg_rct_godie_rightf) )
    else
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", GetRectCenter(gg_rct_love_right_turn) )
    endif
    call PlaySoundBJ( gg_snd_Hint )
endfunction

// --- InitTrig_GodTear_1100 (family, line 19334) ---
function InitTrig_GodTear_1100 takes nothing returns nothing
    set gg_trg_GodTear_1100 = CreateTrigger(  )
    call DisableTrigger( gg_trg_GodTear_1100 )
    call TriggerRegisterTimerEventSingle( gg_trg_GodTear_1100, 1100.00 )
    call TriggerAddAction( gg_trg_GodTear_1100, function Trig_GodTear_1100_Actions )
endfunction
