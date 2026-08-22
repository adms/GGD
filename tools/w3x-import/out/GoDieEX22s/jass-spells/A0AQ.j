// rawcode: A0AQ
// nameZh: 31-02 重爪擊
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 100, "2": 130, "3": 160, "4": 275}
// range: {"1": 175.0, "2": 175.0, "3": 175.0, "4": 150.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 4.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Legendary_Strike

// === family Legendary_Strike (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Legendary_Strike_Conditions (family, line 40873) ---
function Trig_Legendary_Strike_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Legendary_Strike_Actions (family, line 40880) ---
function Trig_Legendary_Strike_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.00 )
    call SetUnitLifeBJ( GetTriggerUnit(), RMinBJ(( GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) + ( 250.00 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 150.00 ) ) ), GetUnitStateSwap(UNIT_STATE_MAX_LIFE, GetTriggerUnit())) )
endfunction

// --- InitTrig_Legendary_Strike (family, line 40886) ---
function InitTrig_Legendary_Strike takes nothing returns nothing
    set gg_trg_Legendary_Strike = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Legendary_Strike, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Legendary_Strike, Condition( function Trig_Legendary_Strike_Conditions ) )
    call TriggerAddAction( gg_trg_Legendary_Strike, function Trig_Legendary_Strike_Actions )
endfunction
