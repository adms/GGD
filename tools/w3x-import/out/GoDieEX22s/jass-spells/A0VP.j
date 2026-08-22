// rawcode: A0VP
// nameZh: 00-敏轉智
// cooldown: {"1": 0.009999999776482582}
// mana: {"1": 0}
// area: {"1": 0.009999999776482582}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: NoviceChange

// === family NoviceChange (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NoviceChange_Func001Func001Func001Func001C (family, line 24665) ---
function Trig_NoviceChange_Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NoviceChange_Func001Func001Func001C (family, line 24672) ---
function Trig_NoviceChange_Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NoviceChange_Func001Func001C (family, line 24679) ---
function Trig_NoviceChange_Func001Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NoviceChange_Func001C (family, line 24686) ---
function Trig_NoviceChange_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NoviceChange_Actions (family, line 24693) ---
function Trig_NoviceChange_Actions takes nothing returns nothing
    if ( Trig_NoviceChange_Func001C() ) then
        call RemoveItem( GetItemOfTypeFromUnitBJ(GetTriggerUnit(), 'I033') )
        call UnitAddItemByIdSwapped( 'I05L', GetTriggerUnit() )
    else
        if ( Trig_NoviceChange_Func001Func001C() ) then
            call RemoveItem( GetItemOfTypeFromUnitBJ(GetTriggerUnit(), 'I05L') )
            call UnitAddItemByIdSwapped( 'I05M', GetTriggerUnit() )
        else
            if ( Trig_NoviceChange_Func001Func001Func001C() ) then
                call RemoveItem( GetItemOfTypeFromUnitBJ(GetTriggerUnit(), 'I05M') )
                call UnitAddItemByIdSwapped( 'I05N', GetTriggerUnit() )
            else
                if ( Trig_NoviceChange_Func001Func001Func001Func001C() ) then
                    call RemoveItem( GetItemOfTypeFromUnitBJ(GetTriggerUnit(), 'I05N') )
                    call UnitAddItemByIdSwapped( 'I033', GetTriggerUnit() )
                else
                endif
            endif
        endif
    endif
endfunction

// --- InitTrig_NoviceChange (family, line 24717) ---
function InitTrig_NoviceChange takes nothing returns nothing
    set gg_trg_NoviceChange = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NoviceChange, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddAction( gg_trg_NoviceChange, function Trig_NoviceChange_Actions )
endfunction
