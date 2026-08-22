// rawcode: A0BD
// nameZh: 21-02 拔焰刀
// w3a base: ANsb  levels: 3
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 52.0}
// mana: {"2": 125, "3": 175, "4": 300}
// range: {"1": 250.0, "2": 250.0, "3": 250.0, "4": 250.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 2.0}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FireSwordSkill

// === family FireSwordSkill (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FireSwordSkill_Conditions (family, line 32997) ---
function Trig_FireSwordSkill_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordSkill_Actions (family, line 33004) ---
function Trig_FireSwordSkill_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.01 )
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget3, 100.00, GetKillingUnitBJ() )
    call UnitAddAbilityBJ( 'A0DF', GetTriggerUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DF', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0BD', GetTriggerUnit()) )
    call PolledWait( ( 4.00 * I2R(GetUnitAbilityLevelSwapped('A0BD', GetTriggerUnit())) ) )
    call UnitRemoveAbilityBJ( 'A0DF', GetTriggerUnit() )
endfunction

// --- InitTrig_FireSwordSkill (family, line 33014) ---
function InitTrig_FireSwordSkill takes nothing returns nothing
    set gg_trg_FireSwordSkill = CreateTrigger(  )
    call DisableTrigger( gg_trg_FireSwordSkill )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSwordSkill, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FireSwordSkill, Condition( function Trig_FireSwordSkill_Conditions ) )
    call TriggerAddAction( gg_trg_FireSwordSkill, function Trig_FireSwordSkill_Actions )
endfunction
