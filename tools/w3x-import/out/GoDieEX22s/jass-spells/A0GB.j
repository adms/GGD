// rawcode: A0GB
// nameZh: 28-01 吃掉你
// w3a base: ANtm  levels: 5
// cooldown: {"1": 35.0, "2": 28.0, "3": 21.0, "4": 14.0, "5": 7.0}
// mana: {"1": 30, "2": 50, "3": 70, "4": 90, "5": 110}
// range: {"1": 200.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Eat, NO_Eat

// === family Eat (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Eat_Conditions (family, line 40592) ---
function Trig_Eat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Eat_Func002C (family, line 40599) ---
function Trig_Eat_Func002C takes nothing returns boolean
    if ( not ( udg_Eat_Index == 6 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Eat_Actions (family, line 40606) ---
function Trig_Eat_Actions takes nothing returns nothing
    set udg_Eat_Index = ( udg_Eat_Index + 1 )
    if ( Trig_Eat_Func002C() ) then
        set udg_Eat_Index = 0
        call ModifyHeroStat( bj_HEROSTAT_STR, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, 1 )
    else
    endif
endfunction

// --- InitTrig_Eat (family, line 40616) ---
function InitTrig_Eat takes nothing returns nothing
    set gg_trg_Eat = CreateTrigger(  )
    call DisableTrigger( gg_trg_Eat )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Eat, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Eat, Condition( function Trig_Eat_Conditions ) )
    call TriggerAddAction( gg_trg_Eat, function Trig_Eat_Actions )
endfunction

// === family NO_Eat (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_NO_Eat_Conditions (family, line 40627) ---
function Trig_NO_Eat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NO_Eat_Func001Func007C (family, line 40634) ---
function Trig_NO_Eat_Func001Func007C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'ebal' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'orai' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'n002' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'h01W' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'nshe' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'u001' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'u00D' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'u00E' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_NO_Eat_Func001C (family, line 40662) ---
function Trig_NO_Eat_Func001C takes nothing returns boolean
    if ( not Trig_NO_Eat_Func001Func007C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_NO_Eat_Actions (family, line 40669) ---
function Trig_NO_Eat_Actions takes nothing returns nothing
    if ( Trig_NO_Eat_Func001C() ) then
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stop" )
        call CreateTextTagUnitBJ( "TRIGSTR_1679", GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
    endif
endfunction

// --- InitTrig_NO_Eat (family, line 40682) ---
function InitTrig_NO_Eat takes nothing returns nothing
    set gg_trg_NO_Eat = CreateTrigger(  )
    call DisableTrigger( gg_trg_NO_Eat )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NO_Eat, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_NO_Eat, Condition( function Trig_NO_Eat_Conditions ) )
    call TriggerAddAction( gg_trg_NO_Eat, function Trig_NO_Eat_Actions )
endfunction
