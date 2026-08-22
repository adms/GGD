// rawcode: A0ZZ
// nameZh: 00-00 投降表決
// cooldown: {"1": 5.0}
// mana: {"1": 0}
// range: {"1": 0.0}
// area: {"1": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Die_Surrender, Love_Surrender

// === family Die_Surrender (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Die_Surrender_Conditions (family, line 13653) ---
function Trig_Die_Surrender_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZZ' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'oeye' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Die_Surrender_Func006Func001C (family, line 13663) ---
function Trig_Die_Surrender_Func006Func001C takes nothing returns boolean
    if ( not ( GetPlayerSlotState(ConvertedPlayer(GetForLoopIndexB())) == PLAYER_SLOT_STATE_PLAYING ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Die_Surrender_Func013C (family, line 13670) ---
function Trig_Die_Surrender_Func013C takes nothing returns boolean
    if ( not ( I2R(udg_Vote_Die_agree) > ( udg_Vote_Die_total / 2.00 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Die_Surrender_Func015Func001C (family, line 13677) ---
function Trig_Die_Surrender_Func015Func001C takes nothing returns boolean
    if ( not ( GetPlayerSlotState(ConvertedPlayer(GetForLoopIndexB())) == PLAYER_SLOT_STATE_PLAYING ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Die_Surrender_Actions (family, line 13684) ---
function Trig_Die_Surrender_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_Safe_Vote )
    set udg_Vote_Die_agree = 0
    set udg_Vote_Die_refuse = 0
    set udg_Vote_Die_total = 0.00
    call DisplayTextToForce( GetPlayersAll(), ( ( "" + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] ) + "發起1分鐘的投降投票表決，請死團玩家至保險箱進行投票。" ) )
    set bj_forLoopBIndex = 8
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        if ( Trig_Die_Surrender_Func006Func001C() ) then
            call UnitRemoveAbilityBJ( 'A0ZZ', udg_safe_array[GetForLoopIndexB()] )
            call UnitAddAbilityBJ( 'A0ZX', udg_safe_array[GetForLoopIndexB()] )
            call UnitAddAbilityBJ( 'A0ZY', udg_safe_array[GetForLoopIndexB()] )
        else
        endif
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 45.00 )
    call DisplayTimedTextToForce( GetPlayersAllies(Player(6)), 15.00, "TRIGSTR_11014" )
    call TriggerSleepAction( 15.00 )
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, "TRIGSTR_11016" )
    call TriggerSleepAction( 1.00 )
    set udg_Vote_Die_str = ( "|c0020c000死團表決結果" + ( I2S(udg_Vote_Die_agree) + ( " ： " + ( I2S(udg_Vote_Die_refuse) + "。|r" ) ) ) )
    if ( Trig_Die_Surrender_Func013C() ) then
        call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( udg_Vote_Die_str + "愛、正義與和平獲得勝利。" ) )
        call TriggerSleepAction( 3.00 )
        call KillUnit( gg_unit_etoe_0016 )
    else
        call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( udg_Vote_Die_str + "去死去死團還想繼續反擊。" ) )
    endif
    call TriggerSleepAction( 3.00 )
    set bj_forLoopBIndex = 8
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        if ( Trig_Die_Surrender_Func015Func001C() ) then
            call UnitRemoveAbilityBJ( 'A0ZX', udg_safe_array[GetForLoopIndexB()] )
            call UnitRemoveAbilityBJ( 'A0ZY', udg_safe_array[GetForLoopIndexB()] )
            call UnitAddAbilityBJ( 'A0ZZ', udg_safe_array[GetForLoopIndexB()] )
        else
        endif
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_Die_Surrender (family, line 13731) ---
function InitTrig_Die_Surrender takes nothing returns nothing
    set gg_trg_Die_Surrender = CreateTrigger(  )
    call DisableTrigger( gg_trg_Die_Surrender )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Die_Surrender, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Die_Surrender, Condition( function Trig_Die_Surrender_Conditions ) )
    call TriggerAddAction( gg_trg_Die_Surrender, function Trig_Die_Surrender_Actions )
endfunction

// === family Love_Surrender (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Love_Surrender_Conditions (family, line 13564) ---
function Trig_Love_Surrender_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZZ' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'o028' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Love_Surrender_Func006Func001C (family, line 13574) ---
function Trig_Love_Surrender_Func006Func001C takes nothing returns boolean
    if ( not ( GetPlayerSlotState(ConvertedPlayer(GetForLoopIndexA())) == PLAYER_SLOT_STATE_PLAYING ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Love_Surrender_Func013C (family, line 13581) ---
function Trig_Love_Surrender_Func013C takes nothing returns boolean
    if ( not ( I2R(udg_Vote_Love_agree) > ( udg_Vote_Love_total / 2.00 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Love_Surrender_Func015Func001C (family, line 13588) ---
function Trig_Love_Surrender_Func015Func001C takes nothing returns boolean
    if ( not ( GetPlayerSlotState(ConvertedPlayer(GetForLoopIndexA())) == PLAYER_SLOT_STATE_PLAYING ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Love_Surrender_Actions (family, line 13595) ---
function Trig_Love_Surrender_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_Safe_Vote )
    set udg_Vote_Love_agree = 0
    set udg_Vote_Love_refuse = 0
    set udg_Vote_Love_total = 0.00
    call DisplayTextToForce( GetPlayersAll(), ( ( "" + udg_Borad_PlayerNames[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] ) + "發起1分鐘的投降投票表決，請愛團玩家至保險箱進行投票。" ) )
    set bj_forLoopAIndex = 2
    set bj_forLoopAIndexEnd = 6
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_Love_Surrender_Func006Func001C() ) then
            call UnitRemoveAbilityBJ( 'A0ZZ', udg_safe_array[GetForLoopIndexA()] )
            call UnitAddAbilityBJ( 'A0ZX', udg_safe_array[GetForLoopIndexA()] )
            call UnitAddAbilityBJ( 'A0ZY', udg_safe_array[GetForLoopIndexA()] )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call TriggerSleepAction( 45.00 )
    call DisplayTimedTextToForce( GetPlayersAllies(Player(0)), 15.00, "TRIGSTR_11015" )
    call TriggerSleepAction( 15.00 )
    call DisplayTimedTextToForce( GetPlayersAll(), 15.00, "TRIGSTR_11017" )
    call TriggerSleepAction( 1.00 )
    set udg_Vote_Love_str = ( "|c0020c000愛團表決結果" + ( I2S(udg_Vote_Love_agree) + ( " ： " + ( I2S(udg_Vote_Love_refuse) + "。|r" ) ) ) )
    if ( Trig_Love_Surrender_Func013C() ) then
        call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( udg_Vote_Love_str + "去死去死團獲得勝利。" ) )
        call TriggerSleepAction( 3.00 )
        call KillUnit( gg_unit_etoe_0016 )
    else
        call DisplayTimedTextToForce( GetPlayersAll(), 15.00, ( udg_Vote_Love_str + "愛、正義與和平還想繼續反擊。" ) )
    endif
    call TriggerSleepAction( 3.00 )
    set bj_forLoopAIndex = 2
    set bj_forLoopAIndexEnd = 6
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_Love_Surrender_Func015Func001C() ) then
            call UnitRemoveAbilityBJ( 'A0ZX', udg_safe_array[GetForLoopIndexA()] )
            call UnitRemoveAbilityBJ( 'A0ZY', udg_safe_array[GetForLoopIndexA()] )
            call UnitAddAbilityBJ( 'A0ZZ', udg_safe_array[GetForLoopIndexA()] )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_Love_Surrender (family, line 13642) ---
function InitTrig_Love_Surrender takes nothing returns nothing
    set gg_trg_Love_Surrender = CreateTrigger(  )
    call DisableTrigger( gg_trg_Love_Surrender )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Love_Surrender, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Love_Surrender, Condition( function Trig_Love_Surrender_Conditions ) )
    call TriggerAddAction( gg_trg_Love_Surrender, function Trig_Love_Surrender_Actions )
endfunction
