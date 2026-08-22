// unit rawcode: nsel
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: OceanReward, OceanBoss_1800

// === family OceanReward (armed) events=none ===

// --- Trig_OceanReward_Func002C (family, line 19594) ---
function Trig_OceanReward_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'nsel' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OceanReward_Conditions (family, line 19601) ---
function Trig_OceanReward_Conditions takes nothing returns boolean
    if ( not Trig_OceanReward_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_OceanReward_Actions (family, line 19608) ---
function Trig_OceanReward_Actions takes nothing returns nothing
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( "|c00af5cff玩家" + ( GetPlayerName(GetOwningPlayer(GetKillingUnitBJ())) + "完成海妖任務|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00大海已經回復平靜，黃金沒力號再也不會沒力了，" + ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "謝謝你！|r" ) ) )
    call EnableTrigger( gg_trg_OceanBoss_1800 )
    set udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = ( udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + GetUnitLevel(GetDyingUnit()) )
    call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], I2S(udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]) )
    call PlaySoundBJ( gg_snd_GoodJob )
endfunction

// --- InitTrig_OceanReward (family, line 19618) ---
function InitTrig_OceanReward takes nothing returns nothing
    set gg_trg_OceanReward = CreateTrigger(  )
    call TriggerRegisterPlayerUnitEventSimple( gg_trg_OceanReward, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_OceanReward, Condition( function Trig_OceanReward_Conditions ) )
    call TriggerAddAction( gg_trg_OceanReward, function Trig_OceanReward_Actions )
endfunction

// === family OceanBoss_1800 (armed) events=none ===

// --- Trig_OceanBoss_1800_Actions (family, line 19380) ---
function Trig_OceanBoss_1800_Actions takes nothing returns nothing
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_7120" )
    call PingMinimapLocForForce( GetPlayersAll(), GetRectCenter(gg_rct________048), 3.00 )
    call CreateNUnitsAtLoc( 1, 'nahy', Player(PLAYER_NEUTRAL_AGGRESSIVE), GetRectCenter(gg_rct________048), bj_UNIT_FACING )
    call PlaySoundBJ( gg_snd_Hint )
endfunction

// --- InitTrig_OceanBoss_1800 (family, line 19388) ---
function InitTrig_OceanBoss_1800 takes nothing returns nothing
    set gg_trg_OceanBoss_1800 = CreateTrigger(  )
    call DisableTrigger( gg_trg_OceanBoss_1800 )
    call TriggerRegisterTimerEventSingle( gg_trg_OceanBoss_1800, 1800.00 )
    call TriggerAddAction( gg_trg_OceanBoss_1800, function Trig_OceanBoss_1800_Actions )
endfunction
