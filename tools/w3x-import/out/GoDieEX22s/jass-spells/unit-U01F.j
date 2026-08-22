// unit rawcode: U01F
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ChungFeReward, EXP_1800sec

// === family ChungFeReward (armed) events=none ===

// --- Trig_ChungFeReward_Func001C (family, line 19119) ---
function Trig_ChungFeReward_Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'U01F' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChungFeReward_Conditions (family, line 19126) ---
function Trig_ChungFeReward_Conditions takes nothing returns boolean
    if ( not Trig_ChungFeReward_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChungFeReward_Actions (family, line 19133) ---
function Trig_ChungFeReward_Actions takes nothing returns nothing
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( "|c00af5cff玩家" + ( GetPlayerName(GetOwningPlayer(GetKillingUnitBJ())) + "完成黑化張飛任務|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00張飛終於可以安息了..." + ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "真是好人阿！|r" ) ) )
    set udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = ( udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + ( GetHeroLevel(GetDyingUnit()) * 2 ) )
    call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], I2S(udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "獲得新稱號!" ) )
    set udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = "|c20FF0000(萬夫莫敵的)|r"
    call SetPlayerName( GetOwningPlayer(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]), ( ( udg_PlayerStarHeroTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) + ( udg_PlayerItemTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) ) )
    call PlaySoundBJ( gg_snd_GoodJob )
    call EnableTrigger( gg_trg_EXP_1800sec )
endfunction

// --- InitTrig_ChungFeReward (family, line 19146) ---
function InitTrig_ChungFeReward takes nothing returns nothing
    set gg_trg_ChungFeReward = CreateTrigger(  )
    call TriggerRegisterPlayerUnitEventSimple( gg_trg_ChungFeReward, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_ChungFeReward, Condition( function Trig_ChungFeReward_Conditions ) )
    call TriggerAddAction( gg_trg_ChungFeReward, function Trig_ChungFeReward_Actions )
endfunction

// === family EXP_1800sec (armed) events=none ===

// --- Trig_EXP_1800sec_Actions (family, line 12872) ---
function Trig_EXP_1800sec_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
    set bj_forLoopAIndex = 2
    set bj_forLoopAIndexEnd = 6
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call StartTimerBJ( udg_Timer[GetForLoopIndexA()], false, 15.00 )
        call SetPlayerHandicapXPBJ( ConvertedPlayer(GetForLoopIndexA()), 180.00 )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    set bj_forLoopBIndex = 8
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call StartTimerBJ( udg_Timer[GetForLoopIndexB()], false, 15.00 )
        call SetPlayerHandicapXPBJ( ConvertedPlayer(GetForLoopIndexB()), 180.00 )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_EXP_1800sec (family, line 12894) ---
function InitTrig_EXP_1800sec takes nothing returns nothing
    set gg_trg_EXP_1800sec = CreateTrigger(  )
    call TriggerRegisterTimerEventSingle( gg_trg_EXP_1800sec, 1800.00 )
    call TriggerAddAction( gg_trg_EXP_1800sec, function Trig_EXP_1800sec_Actions )
endfunction
