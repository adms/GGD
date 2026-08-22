// rawcode: A0W9
// nameZh: 92-01 臥草泥馬
// w3a base: AEme  levels: 4
// cooldown: {"1": 40.0, "2": 40.0, "3": 20.0, "4": 20.0}
// mana: {"1": 160, "2": 160, "3": 160, "4": 160}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 10.0, "2": 10.0, "3": 5.0, "4": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SecHorse

// === family SecHorse (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SecHorse_Conditions (family, line 45199) ---
function Trig_SecHorse_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0W9' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SecHorse_Actions (family, line 45206) ---
function Trig_SecHorse_Actions takes nothing returns nothing
    local location P1 = GetUnitLoc(GetTriggerUnit())

    if ( GetUnitTypeId(GetTriggerUnit()) == 'H02V' ) then
        call SetTerrainTypeBJ( P1, 'Vgrt', -1, 2, 1 )
        call SetUnitAnimation( GetTriggerUnit(), "Victory" )
        call TriggerSleepAction( 0.01 )
        call SetUnitAbilityLevelSwapped( 'A0W8', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0W9', GetTriggerUnit()) )
    endif

    call RemoveLocation(P1)
endfunction

// --- InitTrig_SecHorse (family, line 45220) ---
function InitTrig_SecHorse takes nothing returns nothing
    set gg_trg_SecHorse = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SecHorse, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SecHorse, Condition( function Trig_SecHorse_Conditions ) )
    call TriggerAddAction( gg_trg_SecHorse, function Trig_SecHorse_Actions )
endfunction
