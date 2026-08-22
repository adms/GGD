// rawcode: A088
// nameZh: 33-001 喝了再上
// cooldown: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: goagain

// === family goagain (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_goagain_Conditions (family, line 43552) ---
function Trig_goagain_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A088' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_goagain_Func001C (family, line 43559) ---
function Trig_goagain_Func001C takes nothing returns boolean
    if ( not ( GetPlayerState(GetOwningPlayer(GetTriggerUnit()), PLAYER_STATE_RESOURCE_GOLD) >= 100 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_goagain_Actions (family, line 43566) ---
function Trig_goagain_Actions takes nothing returns nothing
    if ( Trig_goagain_Func001C() ) then
        call AdjustPlayerStateBJ( -100, GetOwningPlayer(GetTriggerUnit()), PLAYER_STATE_RESOURCE_GOLD )
        call SetUnitLifeBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) + 1500.00 ) )
    else
    endif
endfunction

// --- InitTrig_goagain (family, line 43575) ---
function InitTrig_goagain takes nothing returns nothing
    set gg_trg_goagain = CreateTrigger(  )
    call DisableTrigger( gg_trg_goagain )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_goagain, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_goagain, Condition( function Trig_goagain_Conditions ) )
    call TriggerAddAction( gg_trg_goagain, function Trig_goagain_Actions )
endfunction
