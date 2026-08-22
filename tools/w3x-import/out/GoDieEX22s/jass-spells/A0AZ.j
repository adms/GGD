// rawcode: A0AZ
// nameZh: 01-01r 囧斬
// cooldown: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// mana: {"1": 60, "2": 80, "3": 100, "4": 120}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: XFight

// === family XFight (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_XFight_Func001C (family, line 33385) ---
function Trig_XFight_Func001C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A072' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A0AZ' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_XFight_Conditions (family, line 33395) ---
function Trig_XFight_Conditions takes nothing returns boolean
    if ( not Trig_XFight_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_XFight_Func004C (family, line 33402) ---
function Trig_XFight_Func004C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XFight_Actions (family, line 33409) ---
function Trig_XFight_Actions takes nothing returns nothing
    set udg_FF7_CloudUnit = GetTriggerUnit()
    set udg_FF7_XFight_Target = GetSpellTargetUnit()
    if ( Trig_XFight_Func004C() ) then
        set udg_FF7_XFight_Damage = ( 80.00 + ( 70.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
        call TriggerSleepAction( 0.10 )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitVertexColorBJ( GetTriggerUnit(), 70.00, 70.00, 100, 50.00 )
        call SetUnitPositionLoc( GetTriggerUnit(), GetUnitLoc(GetSpellTargetUnit()) )
        call UnitDamageTargetBJ( udg_FF7_CloudUnit, udg_FF7_XFight_Target, udg_FF7_XFight_Damage, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call SetUnitVertexColorBJ( GetTriggerUnit(), 100, 100, 100, 0 )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Units\\Undead\\Abomination\\AbominationExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call TriggerSleepAction( 0.30 )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitVertexColorBJ( GetTriggerUnit(), 70.00, 70.00, 100, 50.00 )
        call SetUnitPositionLoc( GetTriggerUnit(), GetUnitLoc(GetSpellTargetUnit()) )
        call SetUnitVertexColorBJ( GetTriggerUnit(), 100, 100, 100, 0 )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "HeroCloudCyd.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Objects\\Spawnmodels\\Orc\\Orcblood\\BattrollBlood.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    endif
endfunction

// --- InitTrig_XFight (family, line 33442) ---
function InitTrig_XFight takes nothing returns nothing
    set gg_trg_XFight = CreateTrigger(  )
    call DisableTrigger( gg_trg_XFight )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_XFight, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_XFight, Condition( function Trig_XFight_Conditions ) )
    call TriggerAddAction( gg_trg_XFight, function Trig_XFight_Actions )
endfunction
