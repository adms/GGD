// rawcode: A0CR
// nameZh: 84-01 冷笑話
// w3a base: AHtc  levels: 4
// cooldown: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// mana: {"1": 75, "2": 115, "3": 155, "4": 195}
// area: {"1": 600.0, "2": 700.0, "3": 800.0, "4": 900.0}
// duration: {"1": 0.5, "2": 1.0, "3": 1.5, "4": 2.0}
// hero_duration: {"1": 0.5, "2": 1.0, "3": 1.5, "4": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ColdJoke

// === family ColdJoke (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ColdJoke_Conditions (family, line 51304) ---
function Trig_ColdJoke_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func003C (family, line 51311) ---
function Trig_ColdJoke_Func003C takes nothing returns boolean
    if ( not ( udg_Bear_N == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func004C (family, line 51318) ---
function Trig_ColdJoke_Func004C takes nothing returns boolean
    if ( not ( udg_Bear_N == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func005C (family, line 51325) ---
function Trig_ColdJoke_Func005C takes nothing returns boolean
    if ( not ( udg_Bear_N == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func006C (family, line 51332) ---
function Trig_ColdJoke_Func006C takes nothing returns boolean
    if ( not ( udg_Bear_N == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func007C (family, line 51339) ---
function Trig_ColdJoke_Func007C takes nothing returns boolean
    if ( not ( udg_Bear_N == 5 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func008C (family, line 51346) ---
function Trig_ColdJoke_Func008C takes nothing returns boolean
    if ( not ( udg_Bear_N == 6 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func009C (family, line 51353) ---
function Trig_ColdJoke_Func009C takes nothing returns boolean
    if ( not ( udg_Bear_N == 7 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func010C (family, line 51360) ---
function Trig_ColdJoke_Func010C takes nothing returns boolean
    if ( not ( udg_Bear_N == 8 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Actions (family, line 51367) ---
function Trig_ColdJoke_Actions takes nothing returns nothing
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    set udg_Bear_N = GetRandomInt(1, 8)
    if ( Trig_ColdJoke_Func003C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6538", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func004C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6604", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func005C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6619", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func006C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6620", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func007C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6623", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func008C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6694", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func009C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6785", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func010C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6786", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
endfunction

// --- InitTrig_ColdJoke (family, line 51437) ---
function InitTrig_ColdJoke takes nothing returns nothing
    set gg_trg_ColdJoke = CreateTrigger(  )
    call DisableTrigger( gg_trg_ColdJoke )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ColdJoke, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ColdJoke, Condition( function Trig_ColdJoke_Conditions ) )
    call TriggerAddAction( gg_trg_ColdJoke, function Trig_ColdJoke_Actions )
endfunction
