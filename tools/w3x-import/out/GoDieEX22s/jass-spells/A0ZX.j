// rawcode: A0ZX
// nameZh: 00-00 投降同意
// w3a base: AOws  levels: 1
// cooldown: {"1": 5.0}
// mana: {"1": 0}
// area: {"1": 10.0}
// duration: {"1": 0.10000000149011612}
// hero_duration: {"1": 0.10000000149011612}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Safe_Vote

// === family Safe_Vote (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Safe_Vote_Func004C (family, line 13742) ---
function Trig_Safe_Vote_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A0ZX' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A0ZY' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Safe_Vote_Conditions (family, line 13752) ---
function Trig_Safe_Vote_Conditions takes nothing returns boolean
    if ( not Trig_Safe_Vote_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Safe_Vote_Func001Func003C (family, line 13759) ---
function Trig_Safe_Vote_Func001Func003C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Safe_Vote_Func001Func004C (family, line 13766) ---
function Trig_Safe_Vote_Func001Func004C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Safe_Vote_Func001C (family, line 13773) ---
function Trig_Safe_Vote_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetTriggerUnit(), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Safe_Vote_Actions (family, line 13780) ---
function Trig_Safe_Vote_Actions takes nothing returns nothing
    if ( Trig_Safe_Vote_Func001C() ) then
        set udg_Vote_Love_total = ( udg_Vote_Love_total + 1 )
        if ( Trig_Safe_Vote_Func001Func004C() ) then
            set udg_Vote_Love_agree = ( udg_Vote_Love_agree + 1 )
        else
            set udg_Vote_Love_refuse = ( udg_Vote_Love_refuse + 1 )
        endif
    else
        set udg_Vote_Die_total = ( udg_Vote_Die_total + 1 )
        if ( Trig_Safe_Vote_Func001Func003C() ) then
            set udg_Vote_Die_agree = ( udg_Vote_Die_agree + 1 )
        else
            set udg_Vote_Die_refuse = ( udg_Vote_Die_refuse + 1 )
        endif
    endif
    call UnitRemoveAbilityBJ( 'A0ZX', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0ZY', GetTriggerUnit() )
endfunction

// --- InitTrig_Safe_Vote (family, line 13801) ---
function InitTrig_Safe_Vote takes nothing returns nothing
    set gg_trg_Safe_Vote = CreateTrigger(  )
    call DisableTrigger( gg_trg_Safe_Vote )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Safe_Vote, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Safe_Vote, Condition( function Trig_Safe_Vote_Conditions ) )
    call TriggerAddAction( gg_trg_Safe_Vote, function Trig_Safe_Vote_Actions )
endfunction
