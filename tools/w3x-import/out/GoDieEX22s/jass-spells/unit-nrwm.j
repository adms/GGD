// unit rawcode: nrwm
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FireDragonReward, Baha_1500

// === family FireDragonReward (armed) events=none ===

// --- Trig_FireDragonReward_Func003C (family, line 19244) ---
function Trig_FireDragonReward_Func003C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'nrwm' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireDragonReward_Conditions (family, line 19251) ---
function Trig_FireDragonReward_Conditions takes nothing returns boolean
    if ( not Trig_FireDragonReward_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireDragonReward_Actions (family, line 19258) ---
function Trig_FireDragonReward_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_Baha_1500 )
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( "|c00af5cff玩家" + ( GetPlayerName(GetOwningPlayer(GetKillingUnitBJ())) + "完成噴火龍任務|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( "|c00FFFF00小智的噴火龍被" + ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "尻死了！小智決定要把你告到脫褲懶！|r" ) ) )
    set udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = ( udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + GetUnitLevel(GetDyingUnit()) )
    call MultiboardSetItemValueBJ( GetLastCreatedMultiboard(), 6, udg_Multiboard_Spots[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], I2S(udg_MissionScore[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + "獲得新稱號!" ) )
    set udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] = "|c20FF0000(屠龍的)|r"
    call SetPlayerName( GetOwningPlayer(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))]), ( ( udg_PlayerStarHeroTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_PlayerMissionTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) + ( udg_PlayerItemTitle[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))] ) ) )
    call PlaySoundBJ( gg_snd_GoodJob )
endfunction

// --- InitTrig_FireDragonReward (family, line 19271) ---
function InitTrig_FireDragonReward takes nothing returns nothing
    set gg_trg_FireDragonReward = CreateTrigger(  )
    call TriggerRegisterPlayerUnitEventSimple( gg_trg_FireDragonReward, Player(PLAYER_NEUTRAL_AGGRESSIVE), EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_FireDragonReward, Condition( function Trig_FireDragonReward_Conditions ) )
    call TriggerAddAction( gg_trg_FireDragonReward, function Trig_FireDragonReward_Actions )
endfunction

// === family Baha_1500 (armed) events=none ===

// --- Trig_Baha_1500_Func005C (family, line 19783) ---
function Trig_Baha_1500_Func005C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 2) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Baha_1500_Actions (family, line 19790) ---
function Trig_Baha_1500_Actions takes nothing returns nothing
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_11163" )
    call PingMinimapLocForForce( GetPlayersAll(), GetRectCenter(gg_rct_Baha), 3.00 )
    call CreateNUnitsAtLoc( 1, 'n01N', Player(PLAYER_NEUTRAL_AGGRESSIVE), GetRectCenter(gg_rct_Baha), bj_UNIT_FACING )
    call PlaySoundBJ( gg_snd_Hint )
    if ( Trig_Baha_1500_Func005C() ) then
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", GetRectCenter(gg_rct_godie_rightf) )
    else
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", GetRectCenter(gg_rct_love_right_turn) )
    endif
endfunction

// --- InitTrig_Baha_1500 (family, line 19803) ---
function InitTrig_Baha_1500 takes nothing returns nothing
    set gg_trg_Baha_1500 = CreateTrigger(  )
    call DisableTrigger( gg_trg_Baha_1500 )
    call TriggerRegisterTimerEventSingle( gg_trg_Baha_1500, 1500.00 )
    call TriggerAddAction( gg_trg_Baha_1500, function Trig_Baha_1500_Actions )
endfunction
