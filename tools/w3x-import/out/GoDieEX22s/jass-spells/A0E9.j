// rawcode: A0E9
// nameZh: 48-01 怪力
// w3a base: Absk  levels: 4
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 100, "2": 130, "3": 160, "4": 190}
// duration: {"2": 15.0, "3": 18.0, "4": 21.0}
// hero_duration: {"2": 15.0, "3": 18.0, "4": 21.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Maga_Arm

// === family Maga_Arm (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Maga_Arm_Conditions (family, line 38420) ---
function Trig_Maga_Arm_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0E9' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Maga_Arm_Actions (family, line 38427) ---
function Trig_Maga_Arm_Actions takes nothing returns nothing
    call PolledWait( 0.00 )
    call UnitAddAbilityBJ( 'A0EH', GetTriggerUnit() )
    call SetUnitAbilityLevelSwapped( 'A0E8', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0E9', GetTriggerUnit()) )
    call PolledWait( ( 9.00 + ( 3.00 * I2R(GetUnitAbilityLevelSwapped('A0E9', GetTriggerUnit())) ) ) )
    call UnitRemoveAbilityBJ( 'A0EH', GetTriggerUnit() )
endfunction

// --- InitTrig_Maga_Arm (family, line 38436) ---
function InitTrig_Maga_Arm takes nothing returns nothing
    set gg_trg_Maga_Arm = CreateTrigger(  )
    call DisableTrigger( gg_trg_Maga_Arm )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Maga_Arm, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Maga_Arm, Condition( function Trig_Maga_Arm_Conditions ) )
    call TriggerAddAction( gg_trg_Maga_Arm, function Trig_Maga_Arm_Actions )
endfunction
