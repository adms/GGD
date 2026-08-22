// unit rawcode: nahy
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: OceanBossReward, Soldier_2800secGreen, Soldier_2800secRed

// === family OceanBossReward (armed) events=none ===

// --- Trig_OceanBossReward_Func002C (family, line 19398) ---
function Trig_OceanBossReward_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'nahy' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OceanBossReward_Conditions (family, line 19405) ---
function Trig_OceanBossReward_Conditions takes nothing returns boolean
    if ( not Trig_OceanBossReward_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_OceanBossReward_Actions (family, line 19412) ---
function Trig_OceanBossReward_Actions takes nothing returns nothing
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( "|c00af5cff玩家" + ( GetPlayerName(GetOwningPlayer(GetKillingUnitBJ())) + "完成九頭海蛇任務|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00大海已經回復平靜，黃金沒力號再也不會沉船了，" + ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "謝謝你！|r" ) ) )
    set udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = ( udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + GetUnitLevel(GetDyingUnit()) )
    call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], I2S(udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "獲得新稱號!" ) )
    set udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = "|c20FF0000(多頭的)|r"
    call SetPlayerName( GetOwningPlayer(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]), ( ( udg_PlayerStarHeroTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) + ( udg_PlayerItemTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) ) )
    call PlaySoundBJ( gg_snd_GoodJob )
    call EnableTrigger( gg_trg_Soldier_2800secGreen )
    call EnableTrigger( gg_trg_Soldier_2800secRed )
endfunction

// --- InitTrig_OceanBossReward (family, line 19426) ---
function InitTrig_OceanBossReward takes nothing returns nothing
    set gg_trg_OceanBossReward = CreateTrigger(  )
    call TriggerRegisterPlayerUnitEventSimple( gg_trg_OceanBossReward, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_OceanBossReward, Condition( function Trig_OceanBossReward_Conditions ) )
    call TriggerAddAction( gg_trg_OceanBossReward, function Trig_OceanBossReward_Actions )
endfunction

// === family Soldier_2800secGreen (armed) events=none ===

// --- Trig_Soldier_2800secGreen_Func004C (family, line 12602) ---
function Trig_Soldier_2800secGreen_Func004C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(gg_unit_uzg2_0137) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Soldier_2800secGreen_Actions (family, line 12609) ---
function Trig_Soldier_2800secGreen_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
    if ( Trig_Soldier_2800secGreen_Func004C() ) then
    else
        call TriggerSleepAction( udg_UpgradeTime )
    endif
    call SetPlayerTechResearchedSwap( 'R00N', 1, Player(6) )
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_6341" )
endfunction

// --- InitTrig_Soldier_2800secGreen (family, line 12621) ---
function InitTrig_Soldier_2800secGreen takes nothing returns nothing
    set gg_trg_Soldier_2800secGreen = CreateTrigger(  )
    call TriggerRegisterTimerEventSingle( gg_trg_Soldier_2800secGreen, 2800.00 )
    call TriggerAddAction( gg_trg_Soldier_2800secGreen, function Trig_Soldier_2800secGreen_Actions )
endfunction

// === family Soldier_2800secRed (armed) events=none ===

// --- Trig_Soldier_2800secRed_Func004C (family, line 12574) ---
function Trig_Soldier_2800secRed_Func004C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(gg_unit_ncap_0028) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Soldier_2800secRed_Actions (family, line 12581) ---
function Trig_Soldier_2800secRed_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
    if ( Trig_Soldier_2800secRed_Func004C() ) then
    else
        call TriggerSleepAction( udg_UpgradeTime )
    endif
    call SetPlayerTechResearchedSwap( 'R00N', 1, Player(0) )
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_5629" )
endfunction

// --- InitTrig_Soldier_2800secRed (family, line 12593) ---
function InitTrig_Soldier_2800secRed takes nothing returns nothing
    set gg_trg_Soldier_2800secRed = CreateTrigger(  )
    call TriggerRegisterTimerEventSingle( gg_trg_Soldier_2800secRed, 2800.00 )
    call TriggerAddAction( gg_trg_Soldier_2800secRed, function Trig_Soldier_2800secRed_Actions )
endfunction
