// rawcode: A0AC
// nameZh: Near to Death
// w3a base: AHbn  levels: 1
// cooldown: {"1": 18.0}
// mana: {"1": 100}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Near_To_Death

// === family Near_To_Death (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Near_To_Death_Conditions (family, line 25905) ---
function Trig_Near_To_Death_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AC' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Near_To_Death_Actions (family, line 25912) ---
function Trig_Near_To_Death_Actions takes nothing returns nothing
    set udg_NtDCaster = GetSpellAbilityUnit()
    set udg_NtDTarget = GetSpellTargetUnit()
    call TriggerSleepAction( 1.00 )
    call AddSpecialEffectTargetUnitBJ( ( "chest" + "head" ), udg_NtDTarget, "Objects\\Spawnmodels\\Human\\HumanBlood\\BloodElfSpellThiefBlood.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_NtDSpecialEffect = GetLastCreatedEffectBJ()
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, 100.00, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
    call UnitDamageTargetBJ( udg_NtDCaster, udg_NtDTarget, ( DistanceBetweenPoints(GetUnitLoc(udg_NtDTarget), GetSpellTargetLoc()) / 100.00 ), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
    call TriggerSleepAction( 0.25 )
endfunction

// --- InitTrig_Near_To_Death (family, line 25954) ---
function InitTrig_Near_To_Death takes nothing returns nothing
    set gg_trg_Near_To_Death = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Near_To_Death, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Near_To_Death, Condition( function Trig_Near_To_Death_Conditions ) )
    call TriggerAddAction( gg_trg_Near_To_Death, function Trig_Near_To_Death_Actions )
endfunction
