// unit rawcode: n00A
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Turn_off_Select, Select_Hero, Select_Random_Hero, SetIndex, random_mode

// === family Turn_off_Select (armed) events=none ===

// --- Trig_Turn_off_Select_Func001Func001Func002Func003C (family, line 9413) ---
function Trig_Turn_off_Select_Func001Func001Func002Func003C takes nothing returns boolean
    if ( not ( GetForLoopIndexA() == 10 ) ) then
        return false
    endif
    if ( not ( udg_testmoriya == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turn_off_Select_Func001Func001Func002C (family, line 9423) ---
function Trig_Turn_off_Select_Func001Func001Func002C takes nothing returns boolean
    if ( not Trig_Turn_off_Select_Func001Func001Func002Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turn_off_Select_Func001Func001C (family, line 9430) ---
function Trig_Turn_off_Select_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] == null ) ) then
        return false
    endif
    if ( not ( GetPlayerController(ConvertedPlayer(GetForLoopIndexA())) == MAP_CONTROL_USER ) ) then
        return false
    endif
    if ( not ( GetPlayerSlotState(ConvertedPlayer(GetForLoopIndexA())) == PLAYER_SLOT_STATE_PLAYING ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turn_off_Select_Func011Func001C (family, line 9443) ---
function Trig_Turn_off_Select_Func011Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'n00A' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'ncop' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Turn_off_Select_Func011A (family, line 9453) ---
function Trig_Turn_off_Select_Func011A takes nothing returns nothing
    if ( Trig_Turn_off_Select_Func011Func001C() ) then
        call KillUnit( GetEnumUnit() )
        call RemoveUnit( GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_Turn_off_Select_Actions (family, line 9461) ---
function Trig_Turn_off_Select_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_Turn_off_Select_Func001Func001C() ) then
            set udg_TempPlayer = ConvertedPlayer(GetForLoopIndexA())
            if ( Trig_Turn_off_Select_Func001Func001Func002C() ) then
                call CreateNUnitsAtLoc( 1, 'Udea', ConvertedPlayer(GetForLoopIndexA()), GetRectCenter(gg_rct_DieHeroPoint), bj_UNIT_FACING )
                set udg_PlayerHeroUnit[GetForLoopIndexA()] = GetLastCreatedUnit()
            else
                call TriggerExecute( gg_trg_Select_Random_Hero )
            endif
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call RemoveUnit( gg_unit_n00C_0002 )
    call RemoveUnit( gg_unit_n00D_0003 )
    call RemoveUnit( gg_unit_n01K_0082 )
    call RemoveUnit( gg_unit_n00E_0034 )
    call RemoveUnit( gg_unit_n00F_0025 )
    call RemoveUnit( gg_unit_n01J_0055 )
    call RemoveUnit( gg_unit_n00G_0060 )
    call RemoveUnit( gg_unit_n01H_0056 )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsInRectAll(GetPlayableMapRect()), function Trig_Turn_off_Select_Func011A )
    call DisableTrigger( gg_trg_Select_Hero )
    call DisableTrigger( gg_trg_Select_Random_Hero )
    call DisableTrigger( gg_trg_SetIndex )
    call DisableTrigger( gg_trg_random_mode )
    call DisableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_Turn_off_Select (family, line 9496) ---
function InitTrig_Turn_off_Select takes nothing returns nothing
    set gg_trg_Turn_off_Select = CreateTrigger(  )
    call TriggerRegisterTimerEventSingle( gg_trg_Turn_off_Select, 75.00 )
    call TriggerAddAction( gg_trg_Turn_off_Select, function Trig_Turn_off_Select_Actions )
endfunction

// === family Select_Hero (armed) events=none ===

// --- Trig_Select_Hero_Actions (family, line 9224) ---
function Trig_Select_Hero_Actions takes nothing returns nothing
    local integer i
    local integer j
    local location TempPoint
    local integer sidx
    local integer eidx

    set udg_TempUnit = GetSoldUnit()
    set udg_TempPlayer = GetOwningPlayer(udg_TempUnit)
    call QuestMessageBJ( GetPlayersEnemies(GetOwningPlayer(udg_TempUnit)), bj_QUESTMESSAGE_ALWAYSHINT, ( "一個玩家化身為 " + GetUnitName(udg_TempUnit) ) )

    call DisableTrigger( gg_trg_SetIndex )

//處理自訂亂數種子
        loop
            if ( udg_RandSqu <= udg_HeroTypeCount ) then
                exitwhen true
            else
                set udg_RandSqu = ( udg_RandSqu - udg_HeroTypeCount )
            endif
        endloop

//判斷產生英雄創立之位置
        if ( IsPlayerAlly(udg_TempPlayer, Player(0)) == true ) then
            set TempPoint = GetRectCenter(gg_rct_LoveHeroPoint)
        else
            set TempPoint = GetRectCenter(gg_rct_DieHeroPoint)
        endif

//將各玩家的英雄存入陣列
        set udg_PlayerHeroUnit[GetConvertedPlayerId(udg_TempPlayer)] = udg_TempUnit

//加入傷害觸發
        call InitSetup( udg_TempUnit )

//設定玩者名稱
        set udg_PlayerHeroName[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] = ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] + "[" + GetHeroProperName(udg_TempUnit) + "]")
        call ReSetPlayerName(udg_TempUnit)
        set udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] = GetPlayerName(GetOwningPlayer(udg_TempUnit))
        
//設定殺人宣言
//        set sidx = 1
//        set eidx = udg_HeroTypeCount
//        loop
//            exitwhen sidx > eidx
//            if ( GetUnitTypeId(udg_TempUnit) == udg_HeroType[sidx] ) then
//                set udg_PlayerKillStr[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] = ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] + ( ( GetHeroProperName(udg_TempUnit) + ( "：" + udg_HeroKillStr[sidx] ) ) + "|r" ) )
//            endif
//            set sidx = sidx + 1
//        endloop
        
        call SetUnitPositionLoc( udg_TempUnit, TempPoint )
        call RemoveLocation(TempPoint)

//從亂數英雄部隊類型陣列內取消已自選的部隊
        set i = 1
        set j = udg_HeroTypeCount
        loop
            exitwhen i > j
            if ( GetUnitTypeId(udg_TempUnit) == udg_RandomHeroType[i] ) then
                set udg_RandomHeroType[i] = 0
            endif
            set i = i + 1
        endloop

        call TriggerExecute( gg_trg_Select_Hero_Sub )
endfunction

// --- InitTrig_Select_Hero (family, line 9293) ---
function InitTrig_Select_Hero takes nothing returns nothing
    set gg_trg_Select_Hero = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Select_Hero, EVENT_PLAYER_UNIT_SELL )
    call TriggerAddAction( gg_trg_Select_Hero, function Trig_Select_Hero_Actions )
endfunction

// === family Select_Random_Hero (armed) events=none ===

// --- Trig_Select_Random_Hero_Actions (family, line 9306) ---
function Trig_Select_Random_Hero_Actions takes nothing returns nothing
    local integer Index
    local location TempPoint
    local integer sidx
    local integer eidx

//判別切割點的Index是否超出範圍
    set Index = ( GetConvertedPlayerId(udg_TempPlayer) + udg_RandSqu )
    if ( Index > udg_HeroTypeCount ) then
        set Index = ( Index - udg_HeroTypeCount )
    endif

//判別該英雄是否已被選取並進行處理
    loop
        if ( udg_RandomHeroType[Index] != 0 ) then
            exitwhen true
        else
            if ( Index > udg_HeroTypeCount ) then
                set Index = ( Index - udg_HeroTypeCount )
            else
                set Index = ( Index + 1 )
            endif
        endif
    endloop

//判別產生英雄創立之位置
    if ( IsPlayerAlly(udg_TempPlayer, Player(0)) == true ) then
        set TempPoint = GetRectCenter(gg_rct_LoveHeroPoint)
    else
        set TempPoint = GetRectCenter(gg_rct_DieHeroPoint)
    endif

    call CreateNUnitsAtLoc( 1, udg_RandomHeroType[Index], udg_TempPlayer, TempPoint, bj_UNIT_FACING )
    call RemoveLocation(TempPoint)
    set udg_RandomHeroType[Index] = 0
    set udg_TempUnit = GetLastCreatedUnit()
    call QuestMessageBJ( GetPlayersEnemies(GetOwningPlayer(udg_TempUnit)), bj_QUESTMESSAGE_ALWAYSHINT, ( "一個玩家隨機化身為 " + GetUnitName(udg_TempUnit) ) )

//將各玩家的英雄存入陣列
    set udg_PlayerHeroUnit[GetConvertedPlayerId(udg_TempPlayer)] = udg_TempUnit

//加入傷害觸發
    call InitSetup( udg_TempUnit )

//設定玩者名稱
    set udg_PlayerHeroName[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] = ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] + "[" + ( GetHeroProperName(udg_TempUnit) ) + "]" )
    call ReSetPlayerName(udg_TempUnit)
    set udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] = GetPlayerName(GetOwningPlayer(udg_TempUnit))

//設定殺人宣言
//        set sidx = 1
//        set eidx = udg_HeroTypeCount
//        loop
//            exitwhen sidx > eidx
//            if ( GetUnitTypeId(udg_TempUnit) == udg_HeroType[sidx] ) then
//                set udg_PlayerKillStr[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] = ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(udg_TempUnit))] + ( ( GetHeroProperName(udg_TempUnit) + ( "：" + udg_HeroKillStr[sidx] ) ) + "|r" ) )
//            endif
//            set sidx = sidx + 1
//        endloop
    
    call TriggerExecute( gg_trg_Select_Hero_Sub )
endfunction

// --- InitTrig_Select_Random_Hero (family, line 9370) ---
function InitTrig_Select_Random_Hero takes nothing returns nothing
    set gg_trg_Select_Random_Hero = CreateTrigger(  )
    call TriggerAddAction( gg_trg_Select_Random_Hero, function Trig_Select_Random_Hero_Actions )
endfunction

// === family SetIndex (armed) events=none ===

// --- Trig_SetIndex_Actions (family, line 9208) ---
function Trig_SetIndex_Actions takes nothing returns nothing
    set udg_RandSqu = ( udg_RandSqu + 1 )
endfunction

// --- InitTrig_SetIndex (family, line 9213) ---
function InitTrig_SetIndex takes nothing returns nothing
    set gg_trg_SetIndex = CreateTrigger(  )
    call TriggerRegisterTimerEventPeriodic( gg_trg_SetIndex, 0.10 )
    call TriggerAddAction( gg_trg_SetIndex, function Trig_SetIndex_Actions )
endfunction

// === family random_mode (armed) events=none ===

// --- Trig_random_mode_Func011C (family, line 9505) ---
function Trig_random_mode_Func011C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetConvertedPlayerId(GetTriggerPlayer())] == null ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_random_mode_Actions (family, line 9512) ---
function Trig_random_mode_Actions takes nothing returns nothing
    if ( Trig_random_mode_Func011C() ) then
        set udg_TempPlayer = GetTriggerPlayer()
        call TriggerExecute( gg_trg_Select_Random_Hero )
    else
    endif
endfunction

// --- InitTrig_random_mode (family, line 9521) ---
function InitTrig_random_mode takes nothing returns nothing
    set gg_trg_random_mode = CreateTrigger(  )
    call DisableTrigger( gg_trg_random_mode )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(1), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(2), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(3), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(4), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(5), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(7), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(8), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(9), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(10), "-random", true )
    call TriggerRegisterPlayerChatEvent( gg_trg_random_mode, Player(11), "-random", true )
    call TriggerAddAction( gg_trg_random_mode, function Trig_random_mode_Actions )
endfunction
