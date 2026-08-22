// rawcode: A0BC
// nameZh: 11-01 燒鬼斬
// w3a base: AIfb  levels: 4
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Learn_Burn_Beat

// === family Learn_Burn_Beat (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_Learn_Burn_Beat_Conditions (family, line 29152) ---
function Trig_Learn_Burn_Beat_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Udre' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Learn_Burn_Beat_Func001C (family, line 29159) ---
function Trig_Learn_Burn_Beat_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0BC', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Learn_Burn_Beat_Func003C (family, line 29166) ---
function Trig_Learn_Burn_Beat_Func003C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0CC', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Learn_Burn_Beat_Actions (family, line 29173) ---
function Trig_Learn_Burn_Beat_Actions takes nothing returns nothing
    if ( Trig_Learn_Burn_Beat_Func001C() ) then
        call UnitAddAbilityBJ( 'A0BC', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
    call SetUnitAbilityLevelSwapped( 'A0BC', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0CC', GetTriggerUnit()) )
    if ( Trig_Learn_Burn_Beat_Func003C() ) then
        call UnitRemoveAbilityBJ( 'A0BC', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_Learn_Burn_Beat (family, line 29188) ---
function InitTrig_Learn_Burn_Beat takes nothing returns nothing
    set gg_trg_Learn_Burn_Beat = CreateTrigger(  )
    call DisableTrigger( gg_trg_Learn_Burn_Beat )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Learn_Burn_Beat, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Learn_Burn_Beat, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_Learn_Burn_Beat, Condition( function Trig_Learn_Burn_Beat_Conditions ) )
    call TriggerAddAction( gg_trg_Learn_Burn_Beat, function Trig_Learn_Burn_Beat_Actions )
endfunction
