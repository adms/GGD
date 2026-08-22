// rawcode: A04W
// nameZh: 06-00x 布緩速
// w3a base: AHtc  levels: 1
// cooldown: {"1": 0.0}
// mana: {"1": 0}
// hero_duration: {"1": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Spell_Mark

// === family Spell_Mark (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Spell_Mark_Conditions (family, line 41711) ---
function Trig_Spell_Mark_Conditions takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A04W' )
endfunction

// --- Trig_Spell_Mark_Actions (family, line 41715) ---
function Trig_Spell_Mark_Actions takes nothing returns nothing
    local real Dmg = 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) - 100.00
    call TriggerSleepAction( 10.00 )
    call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), Dmg , ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\Orc\\Purge\\PurgeBuffTarget.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 1.50 )
endfunction

// --- InitTrig_Spell_Mark (family, line 41724) ---
function InitTrig_Spell_Mark takes nothing returns nothing
    set gg_trg_Spell_Mark = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Spell_Mark, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Spell_Mark, Condition( function Trig_Spell_Mark_Conditions ) )
    call TriggerAddAction( gg_trg_Spell_Mark, function Trig_Spell_Mark_Actions )
endfunction

// --- RemoveEffectSP (helper, line 4814) ---
function RemoveEffectSP takes effect R_Effect , real Life_Time returns nothing
    local real Bj_Timer = bj_enumDestructableRadius
    set bj_lastCreatedEffect = R_Effect
    set bj_enumDestructableRadius = Life_Time
    call ExecuteFunc("RemoveEffectSP_Action")
    set bj_enumDestructableRadius = Bj_Timer
endfunction
