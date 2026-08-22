// rawcode: A08P
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FireSwordAdded

// === family FireSwordAdded (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_FireSwordAdded_Conditions (family, line 43693) ---
function Trig_FireSwordAdded_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Uvng' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordAdded_Func001C (family, line 43700) ---
function Trig_FireSwordAdded_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A06O', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordAdded_Func003C (family, line 43707) ---
function Trig_FireSwordAdded_Func003C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A08P', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordAdded_Actions (family, line 43714) ---
function Trig_FireSwordAdded_Actions takes nothing returns nothing
    if ( Trig_FireSwordAdded_Func001C() ) then
        call UnitAddAbilityBJ( 'A06O', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
    call SetUnitAbilityLevelSwapped( 'A06O', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A08P', GetTriggerUnit()) )
    if ( Trig_FireSwordAdded_Func003C() ) then
        call UnitRemoveAbilityBJ( 'A06O', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_FireSwordAdded (family, line 43729) ---
function InitTrig_FireSwordAdded takes nothing returns nothing
    set gg_trg_FireSwordAdded = CreateTrigger(  )
    call DisableTrigger( gg_trg_FireSwordAdded )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSwordAdded, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSwordAdded, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_FireSwordAdded, Condition( function Trig_FireSwordAdded_Conditions ) )
    call TriggerAddAction( gg_trg_FireSwordAdded, function Trig_FireSwordAdded_Actions )
endfunction
