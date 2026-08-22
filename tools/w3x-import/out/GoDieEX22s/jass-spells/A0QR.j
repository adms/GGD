// rawcode: A0QR
// nameZh: CP-00 死神之眼
// cooldown: {"1": 2.0}
// mana: {"1": 200}
// range: {"1": 800.0}
// duration: {"1": 10.0}
// hero_duration: {"1": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LokDeathEye

// === family LokDeathEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LokDeathEye_Conditions (family, line 25163) ---
function Trig_LokDeathEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0QR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LokDeathEye_Actions (family, line 25170) ---
function Trig_LokDeathEye_Actions takes nothing returns nothing
    set udg_DeathUnit = GetSpellTargetUnit()
    set udg_DeathGodUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_FountainOfLifeWhat1, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 1.00 )
    call UnitDamageTargetBJ( udg_DeathGodUnit, udg_DeathUnit, 999999.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_DEATH )
endfunction

// --- InitTrig_LokDeathEye (family, line 25179) ---
function InitTrig_LokDeathEye takes nothing returns nothing
    set gg_trg_LokDeathEye = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LokDeathEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LokDeathEye, Condition( function Trig_LokDeathEye_Conditions ) )
    call TriggerAddAction( gg_trg_LokDeathEye, function Trig_LokDeathEye_Actions )
endfunction
