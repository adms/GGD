// rawcode: A0LK
// nameZh: 79-02 斬擊
// w3a base: Absk  levels: 4
// cooldown: {"1": 22.0, "2": 22.0, "3": 22.0, "4": 22.0}
// mana: {"1": 60, "2": 80, "3": 100, "4": 120}
// duration: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// hero_duration: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Bleach_Strike

// === family Bleach_Strike (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Bleach_Strike_Conditions (family, line 37455) ---
function Trig_Bleach_Strike_Conditions takes nothing returns boolean
    if ( not ( GetAttacker() == udg_BleachUnit ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(GetAttacker(), 'B02E') == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Strike_Actions (family, line 37471) ---
function Trig_Bleach_Strike_Actions takes nothing returns nothing
    set udg_BleachTarget = GetAttackedUnitBJ()
    call UnitRemoveBuffBJ( 'B02E', udg_BleachUnit )
    call TriggerSleepAction( 0.10 )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachTarget, "BloodBreathStream.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachTarget, ( ( 50.00 + ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A0LK', udg_BleachUnit)) ) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BleachUnit, true)) * 2.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- InitTrig_Bleach_Strike (family, line 37481) ---
function InitTrig_Bleach_Strike takes nothing returns nothing
    set gg_trg_Bleach_Strike = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Strike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Strike, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Bleach_Strike, Condition( function Trig_Bleach_Strike_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Strike, function Trig_Bleach_Strike_Actions )
endfunction
