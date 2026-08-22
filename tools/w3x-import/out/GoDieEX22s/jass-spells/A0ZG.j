// rawcode: A0ZG
// nameZh: 98-002 夢想前程的彼方
// cooldown: {"1": 0.0}
// mana: {"1": 0}
// duration: {"1": 0.0}
// hero_duration: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BeginFutureDream, FutureDream

// === family BeginFutureDream (active) events=EVENT_PLAYER_UNIT_SPELL_CHANNEL ===

// --- Trig_BeginFutureDream_Conditions (family, line 55242) ---
function Trig_BeginFutureDream_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BeginFutureDream_Actions (family, line 55249) ---
function Trig_BeginFutureDream_Actions takes nothing returns nothing
    call DisplayTextToForce( GetPlayersAll(), ( GetPlayerName(GetOwningPlayer(GetTriggerUnit())) + ( "：再過12分鐘納美克星即將爆炸！(誤)" + "" ) ) )
endfunction

// --- InitTrig_BeginFutureDream (family, line 55254) ---
function InitTrig_BeginFutureDream takes nothing returns nothing
    set gg_trg_BeginFutureDream = CreateTrigger(  )
    call DisableTrigger( gg_trg_BeginFutureDream )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BeginFutureDream, EVENT_PLAYER_UNIT_SPELL_CHANNEL )
    call TriggerAddCondition( gg_trg_BeginFutureDream, Condition( function Trig_BeginFutureDream_Conditions ) )
    call TriggerAddAction( gg_trg_BeginFutureDream, function Trig_BeginFutureDream_Actions )
endfunction

// === family FutureDream (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FutureDream_Conditions (family, line 55208) ---
function Trig_FutureDream_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FutureDream_Func001C (family, line 55215) ---
function Trig_FutureDream_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetTriggerUnit(), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FutureDream_Actions (family, line 55222) ---
function Trig_FutureDream_Actions takes nothing returns nothing
    if ( Trig_FutureDream_Func001C() ) then
        call KillUnit( gg_unit_unpl_0000 )
    else
        call KillUnit( gg_unit_etoe_0016 )
    endif
endfunction

// --- InitTrig_FutureDream (family, line 55231) ---
function InitTrig_FutureDream takes nothing returns nothing
    set gg_trg_FutureDream = CreateTrigger(  )
    call DisableTrigger( gg_trg_FutureDream )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FutureDream, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FutureDream, Condition( function Trig_FutureDream_Conditions ) )
    call TriggerAddAction( gg_trg_FutureDream, function Trig_FutureDream_Actions )
endfunction
