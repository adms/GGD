// rawcode: A0JA
// nameZh: 奇門之術
// cooldown: {"1": 60.0}
// mana: {"1": 350}
// area: {"1": 900.0}
// duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.25}
// hero_duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.25}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MagicArmEffect

// === family MagicArmEffect (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MagicArmEffect_Conditions (family, line 24940) ---
function Trig_MagicArmEffect_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicArmEffect_Func001Func001Func001C (family, line 24947) ---
function Trig_MagicArmEffect_Func001Func001Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetTriggerUnit()), GetOwningPlayer(GetEnumUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicArmEffect_Func001Func001Func002C (family, line 24954) ---
function Trig_MagicArmEffect_Func001Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicArmEffect_Func001Func001C (family, line 24964) ---
function Trig_MagicArmEffect_Func001Func001C takes nothing returns boolean
    if ( not Trig_MagicArmEffect_Func001Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicArmEffect_Func001A (family, line 24971) ---
function Trig_MagicArmEffect_Func001A takes nothing returns nothing
    if ( Trig_MagicArmEffect_Func001Func001C() ) then
        if ( Trig_MagicArmEffect_Func001Func001Func001C() ) then
            call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) + ( 222.00 + ( 6.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) ) ) ) )
            call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( 222.00 + ( 6.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        endif
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_MagicArmEffect_Actions (family, line 24987) ---
function Trig_MagicArmEffect_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(GetTriggerUnit())), function Trig_MagicArmEffect_Func001A )
endfunction

// --- InitTrig_MagicArmEffect (family, line 24992) ---
function InitTrig_MagicArmEffect takes nothing returns nothing
    set gg_trg_MagicArmEffect = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MagicArmEffect, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MagicArmEffect, Condition( function Trig_MagicArmEffect_Conditions ) )
    call TriggerAddAction( gg_trg_MagicArmEffect, function Trig_MagicArmEffect_Actions )
endfunction
