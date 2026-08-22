// rawcode: A0TI
// nameZh: 32-04 狂龍霸體
// w3a base: Adef  levels: 3
// mana: {"4": 100}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DefStartC

// === family DefStartC (passive) events=EVENT_PLAYER_UNIT_ISSUED_ORDER ===

// --- Trig_DefStartC_Func001C (family, line 42792) ---
function Trig_DefStartC_Func001C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'Opgh' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'O02P' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_DefStartC_Conditions (family, line 42802) ---
function Trig_DefStartC_Conditions takes nothing returns boolean
    if ( not Trig_DefStartC_Func001C() ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("defend") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Func004Func001Func002C (family, line 42812) ---
function Trig_DefStartC_Func004Func001Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TI', GetTriggerUnit()) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Func004Func001C (family, line 42819) ---
function Trig_DefStartC_Func004Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TI', GetTriggerUnit()) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Func004C (family, line 42826) ---
function Trig_DefStartC_Func004C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TI', GetTriggerUnit()) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Actions (family, line 42833) ---
function Trig_DefStartC_Actions takes nothing returns nothing
    call UnitAddAbilityBJ( 'A0TP', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A0TQ', GetTriggerUnit() )
    if ( Trig_DefStartC_Func004C() ) then
        call UnitAddAbilityBJ( 'A0TT', GetTriggerUnit() )
    else
        if ( Trig_DefStartC_Func004Func001C() ) then
            call UnitAddAbilityBJ( 'A0TR', GetTriggerUnit() )
        else
            if ( Trig_DefStartC_Func004Func001Func002C() ) then
                call UnitAddAbilityBJ( 'A0TS', GetTriggerUnit() )
            else
            endif
        endif
    endif
endfunction

// --- InitTrig_DefStartC (family, line 42851) ---
function InitTrig_DefStartC takes nothing returns nothing
    set gg_trg_DefStartC = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefStartC )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefStartC, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_DefStartC, Condition( function Trig_DefStartC_Conditions ) )
    call TriggerAddAction( gg_trg_DefStartC, function Trig_DefStartC_Actions )
endfunction
