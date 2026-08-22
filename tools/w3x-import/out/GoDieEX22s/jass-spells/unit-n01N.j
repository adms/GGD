// unit rawcode: n01N
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BahaReward, Soldier_3600secGreen, Soldier_3600secRed

// === family BahaReward (armed) events=none ===

// --- Trig_BahaReward_Func002C (family, line 19813) ---
function Trig_BahaReward_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'n01N' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BahaReward_Conditions (family, line 19820) ---
function Trig_BahaReward_Conditions takes nothing returns boolean
    if ( not Trig_BahaReward_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_BahaReward_Actions (family, line 19827) ---
function Trig_BahaReward_Actions takes nothing returns nothing
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( "|c00af5cff玩家" + ( GetPlayerName(GetOwningPlayer(GetKillingUnitBJ())) + "完成巴哈姆特任務|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00最終幻想的世界再也招喚不出巴哈姆特了，" + ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "謝謝你！|r" ) ) )
    set udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = ( udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + GetUnitLevel(GetDyingUnit()) )
    call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], I2S(udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]) )
    call PlaySoundBJ( gg_snd_GoodJob )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "獲得新稱號!" ) )
    set udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = "|c20FF0000(混沌的)|r"
    call SetPlayerName( GetOwningPlayer(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]), ( ( udg_PlayerStarHeroTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) + ( udg_PlayerItemTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) ) )
    call EnableTrigger( gg_trg_Soldier_3600secGreen )
    call EnableTrigger( gg_trg_Soldier_3600secRed )
endfunction

// --- InitTrig_BahaReward (family, line 19841) ---
function InitTrig_BahaReward takes nothing returns nothing
    set gg_trg_BahaReward = CreateTrigger(  )
    call TriggerRegisterPlayerUnitEventSimple( gg_trg_BahaReward, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_BahaReward, Condition( function Trig_BahaReward_Conditions ) )
    call TriggerAddAction( gg_trg_BahaReward, function Trig_BahaReward_Actions )
endfunction

// === family Soldier_3600secGreen (armed) events=none ===

// --- Trig_Soldier_3600secGreen_Func004C (family, line 12658) ---
function Trig_Soldier_3600secGreen_Func004C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(gg_unit_uzg2_0137) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Soldier_3600secGreen_Actions (family, line 12665) ---
function Trig_Soldier_3600secGreen_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
    if ( Trig_Soldier_3600secGreen_Func004C() ) then
    else
        call TriggerSleepAction( udg_UpgradeTime )
    endif
    call SetPlayerTechResearchedSwap( 'R00O', 1, Player(6) )
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_6364" )
endfunction

// --- InitTrig_Soldier_3600secGreen (family, line 12677) ---
function InitTrig_Soldier_3600secGreen takes nothing returns nothing
    set gg_trg_Soldier_3600secGreen = CreateTrigger(  )
    call TriggerRegisterTimerEventSingle( gg_trg_Soldier_3600secGreen, 3600.00 )
    call TriggerAddAction( gg_trg_Soldier_3600secGreen, function Trig_Soldier_3600secGreen_Actions )
endfunction

// === family Soldier_3600secRed (armed) events=none ===

// --- Trig_Soldier_3600secRed_Func004C (family, line 12630) ---
function Trig_Soldier_3600secRed_Func004C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(gg_unit_ncap_0028) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Soldier_3600secRed_Actions (family, line 12637) ---
function Trig_Soldier_3600secRed_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
    if ( Trig_Soldier_3600secRed_Func004C() ) then
    else
        call TriggerSleepAction( udg_UpgradeTime )
    endif
    call SetPlayerTechResearchedSwap( 'R00O', 1, Player(0) )
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_5637" )
endfunction

// --- InitTrig_Soldier_3600secRed (family, line 12649) ---
function InitTrig_Soldier_3600secRed takes nothing returns nothing
    set gg_trg_Soldier_3600secRed = CreateTrigger(  )
    call TriggerRegisterTimerEventSingle( gg_trg_Soldier_3600secRed, 3600.00 )
    call TriggerAddAction( gg_trg_Soldier_3600secRed, function Trig_Soldier_3600secRed_Actions )
endfunction
