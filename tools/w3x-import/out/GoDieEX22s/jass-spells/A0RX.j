// rawcode: A0RX
// nameZh: 79-01 瞬步
// w3a base: Alsh  levels: 4
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 65, "2": 95, "3": 125, "4": 155}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// area: {"1": 0.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Bleach_Rush

// === family Bleach_Rush (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Rush_Conditions (family, line 37371) ---
function Trig_Bleach_Rush_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Rush_Func004Func001C (family, line 37378) ---
function Trig_Bleach_Rush_Func004Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_BleachUnit, 'B02E') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Rush_Func004C (family, line 37385) ---
function Trig_Bleach_Rush_Func004C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_BleachCaster, 'B03P') == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_BleachCaster) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_BleachCaster, UNIT_TYPE_GROUND) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_BleachCaster, UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Rush_Actions (family, line 37401) ---
function Trig_Bleach_Rush_Actions takes nothing returns nothing
    set udg_BleachCaster = GetSpellTargetUnit()
    set udg_BleachUnit = GetTriggerUnit()
    call TriggerSleepAction( 0.10 )
    if ( Trig_Bleach_Rush_Func004C() ) then
        if ( Trig_Bleach_Rush_Func004Func001C() ) then
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Abilities\\Spells\\Other\\Volcano\\VolcanoDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + ( 50.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BleachUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call TriggerSleepAction( 0.30 )
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + ( 50.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BleachUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + 50.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call TriggerSleepAction( 0.30 )
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + 50.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        endif
    else
    endif
endfunction

// --- InitTrig_Bleach_Rush (family, line 37444) ---
function InitTrig_Bleach_Rush takes nothing returns nothing
    set gg_trg_Bleach_Rush = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Rush )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Rush, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Rush, Condition( function Trig_Bleach_Rush_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Rush, function Trig_Bleach_Rush_Actions )
endfunction
