// rawcode: A0BP
// nameZh: 60-02 鎖鏈槍
// w3a base: Amls  levels: 4
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 50, "2": 75, "3": 100, "4": 125}
// range: {"1": 300.0, "2": 500.0, "3": 700.0, "4": 900.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: comeon

// === family comeon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_comeon_Func002Func002C (family, line 25271) ---
function Trig_comeon_Func002Func002C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A09L' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A0BP' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A0W3' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_comeon_Func002C (family, line 25284) ---
function Trig_comeon_Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not Trig_comeon_Func002Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_comeon_Conditions (family, line 25294) ---
function Trig_comeon_Conditions takes nothing returns boolean
    if ( not Trig_comeon_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_comeon_Func001Func007C (family, line 25301) ---
function Trig_comeon_Func001Func007C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetSpellTargetUnit(), 'Bmlt') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_comeon_Func001C (family, line 25308) ---
function Trig_comeon_Func001C takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() != GetTriggerUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_comeon_Func003C (family, line 25315) ---
function Trig_comeon_Func003C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_comeon_Actions (family, line 25322) ---
function Trig_comeon_Actions takes nothing returns nothing
    if ( Trig_comeon_Func001C() ) then
        call TriggerSleepAction( 0.01 )
        if ( Trig_comeon_Func001Func007C() ) then
            call SetUnitPositionLoc( GetSpellTargetUnit(), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 100.00, GetUnitFacing(GetTriggerUnit())) )
        else
            call CreateTextTagUnitBJ( ( "Miss" + "!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        endif
    else
        call CreateTextTagUnitBJ( "TRIGSTR_7532", GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    endif
    if ( Trig_comeon_Func003C() ) then
        call PlaySoundOnUnitBJ( gg_snd_HeadHunterYes4, 100, GetTriggerUnit() )
    else
    endif
endfunction

// --- InitTrig_comeon (family, line 25348) ---
function InitTrig_comeon takes nothing returns nothing
    set gg_trg_comeon = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_comeon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_comeon, Condition( function Trig_comeon_Conditions ) )
    call TriggerAddAction( gg_trg_comeon, function Trig_comeon_Actions )
endfunction
