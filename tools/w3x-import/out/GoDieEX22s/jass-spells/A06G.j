// rawcode: A06G
// nameZh: 35-01 土爪
// w3a base: ANcs  levels: 4
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 30, "2": 60, "3": 90, "4": 120}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EightCloud

// === family EightCloud (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EightCloud_Func004C (family, line 42956) ---
function Trig_EightCloud_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A0U6' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A06G' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_EightCloud_Conditions (family, line 42966) ---
function Trig_EightCloud_Conditions takes nothing returns boolean
    if ( not Trig_EightCloud_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_EightCloud_Actions (family, line 42973) ---
function Trig_EightCloud_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), RMinBJ(925.00, ( 0.44 * GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    set udg_EyesMaster = GetTriggerUnit()
endfunction

// --- InitTrig_EightCloud (family, line 42979) ---
function InitTrig_EightCloud takes nothing returns nothing
    set gg_trg_EightCloud = CreateTrigger(  )
    call DisableTrigger( gg_trg_EightCloud )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EightCloud, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EightCloud, Condition( function Trig_EightCloud_Conditions ) )
    call TriggerAddAction( gg_trg_EightCloud, function Trig_EightCloud_Actions )
endfunction
