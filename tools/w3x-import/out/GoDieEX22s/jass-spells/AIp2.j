// rawcode: AIp2
// duration: {"1": 8.0}
// hero_duration: {"1": 8.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: RareMeat

// === family RareMeat (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_RareMeat_Conditions (family, line 55324) ---
function Trig_RareMeat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AIp2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RareMeat_Func002Func001C (family, line 55331) ---
function Trig_RareMeat_Func002Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RareMeat_Func002A (family, line 55338) ---
function Trig_RareMeat_Func002A takes nothing returns nothing
    if ( Trig_RareMeat_Func002Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
        call AddSpecialEffectLocBJ( GetDestructableLoc(GetEnumDestructable()), "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_RareMeat_Actions (family, line 55347) ---
function Trig_RareMeat_Actions takes nothing returns nothing
    call EnumDestructablesInCircleBJ( 250.00, GetUnitLoc(GetTriggerUnit()), function Trig_RareMeat_Func002A )
endfunction

// --- InitTrig_RareMeat (family, line 55352) ---
function InitTrig_RareMeat takes nothing returns nothing
    set gg_trg_RareMeat = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RareMeat, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_RareMeat, Condition( function Trig_RareMeat_Conditions ) )
    call TriggerAddAction( gg_trg_RareMeat, function Trig_RareMeat_Actions )
endfunction
