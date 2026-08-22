// rawcode: A0W1
// nameZh: 91-03 碎心打擊
// w3a base: AUfn  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 130, "2": 170, "3": 210, "4": 250}
// range: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// hero_duration: {"1": 2.5, "2": 2.5, "3": 2.5, "4": 2.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HeartStrike

// === family HeartStrike (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HeartStrike_Conditions (family, line 53329) ---
function Trig_HeartStrike_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0W1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeartStrike_Func001C (family, line 53336) ---
function Trig_HeartStrike_Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetSpellTargetUnit(), 'Bapl') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeartStrike_Func002C (family, line 53343) ---
function Trig_HeartStrike_Func002C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B047') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeartStrike_Actions (family, line 53350) ---
function Trig_HeartStrike_Actions takes nothing returns nothing
    if ( Trig_HeartStrike_Func001C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellAbilityUnit(), ( 50.00 + ( 25.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    if ( Trig_HeartStrike_Func002C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellAbilityUnit(), ( 50.00 + ( 25.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- InitTrig_HeartStrike (family, line 53366) ---
function InitTrig_HeartStrike takes nothing returns nothing
    set gg_trg_HeartStrike = CreateTrigger(  )
    call DisableTrigger( gg_trg_HeartStrike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HeartStrike, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HeartStrike, Condition( function Trig_HeartStrike_Conditions ) )
    call TriggerAddAction( gg_trg_HeartStrike, function Trig_HeartStrike_Actions )
endfunction
