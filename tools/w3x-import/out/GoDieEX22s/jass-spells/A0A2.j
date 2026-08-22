// rawcode: A0A2
// nameZh: 64-01 威士忌攻擊
// w3a base: Aslo  levels: 3
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 75, "2": 105, "3": 135, "4": 165, "5": 25}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"1": 6.0, "2": 6.0, "3": 6.0, "4": 3.0}
// hero_duration: {"1": 6.0, "2": 6.0, "3": 6.0, "4": 3.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Whisky

// === family Whisky (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Whisky_Conditions (family, line 46485) ---
function Trig_Whisky_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Whisky_Actions (family, line 46492) ---
function Trig_Whisky_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetSpellAbilityUnit(), GetSpellTargetUnit(), ( 0.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0A2', GetSpellAbilityUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MIND )
endfunction

// --- InitTrig_Whisky (family, line 46497) ---
function InitTrig_Whisky takes nothing returns nothing
    set gg_trg_Whisky = CreateTrigger(  )
    call DisableTrigger( gg_trg_Whisky )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Whisky, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Whisky, Condition( function Trig_Whisky_Conditions ) )
    call TriggerAddAction( gg_trg_Whisky, function Trig_Whisky_Actions )
endfunction
