// rawcode: A0YA
// nameZh: 95-002 固有結界-和諧世界
// cooldown: {"1": 100.0, "2": 60.0, "3": 60.0}
// mana: {"1": 700, "2": 500, "3": 700}
// area: {"1": 600.0}
// duration: {"1": 12.0, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 12.0, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FriendComeBack

// === family FriendComeBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FriendComeBack_Conditions (family, line 54657) ---
function Trig_FriendComeBack_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FriendComeBack_Func001Func001C (family, line 54664) ---
function Trig_FriendComeBack_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(udg_PlayerHeroUnit[GetForLoopIndexA()], GetOwningPlayer(udg_TaiwanOfKing)) == true ) ) then
        return false
    endif
    if ( not ( TimerGetRemaining(udg_ReviveTimers[GetForLoopIndexA()]) > 1.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FriendComeBack_Func005Func001C (family, line 54677) ---
function Trig_FriendComeBack_Func005Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(udg_PlayerHeroUnit[GetForLoopIndexA()], GetOwningPlayer(udg_TaiwanOfKing)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FriendComeBack_Actions (family, line 54687) ---
function Trig_FriendComeBack_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_FriendComeBack_Func001Func001C() ) then
            call StartTimerBJ( udg_ReviveTimers[GetForLoopIndexA()], false, 1.00 )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call TriggerSleepAction( 1.50 )
    call TextUse("公平與正義回來了!!!", udg_TaiwanOfKing , 30 , 4 , 100,0,0)
    set udg_TaiwanOfKingP = GetUnitLoc(udg_TaiwanOfKing)
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_FriendComeBack_Func005Func001C() ) then
            call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], 100 )
            call SetUnitManaPercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], 100 )
            call SetUnitPositionLoc( udg_PlayerHeroUnit[GetForLoopIndexA()], udg_TaiwanOfKingP )
            call AddSpecialEffectTargetUnitBJ( "origin", udg_PlayerHeroUnit[GetForLoopIndexA()], "Abilities\\Spells\\Human\\Resurrect\\ResurrectCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call RemoveLocation(udg_TaiwanOfKingP)
endfunction

// --- InitTrig_FriendComeBack (family, line 54719) ---
function InitTrig_FriendComeBack takes nothing returns nothing
    set gg_trg_FriendComeBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_FriendComeBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FriendComeBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FriendComeBack, Condition( function Trig_FriendComeBack_Conditions ) )
    call TriggerAddAction( gg_trg_FriendComeBack, function Trig_FriendComeBack_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction
