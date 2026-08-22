// rawcode: A06C
// nameZh: 48-03 鮮血神殿
// w3a base: AChw  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 120, "2": 195, "3": 270, "4": 345}
// range: {"1": 100.0, "2": 100.0, "3": 100.0, "4": 100.0}
// duration: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// hero_duration: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Blood

// === family Blood (passive) events=none ===

// --- Trig_Blood_Func001Func004Func001C (family, line 38471) ---
function Trig_Blood_Func001Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Blood_Unit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'earc' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'nska' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Func001Func004A (family, line 38490) ---
function Trig_Blood_Func001Func004A takes nothing returns nothing
    if ( Trig_Blood_Func001Func004Func001C() ) then
        call UnitDamageTargetBJ( udg_Blood_Unit, GetEnumUnit(), ( 75.00 * I2R(GetUnitAbilityLevelSwapped('A06C', udg_Rider)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))], ( GetUnitLifePercent(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))]) + 1.00 ) )
        set udg_BloodSpecialPoint = GetUnitLoc(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))])
        call AddSpecialEffectLocBJ( udg_BloodSpecialPoint, "Abilities\\Spells\\Undead\\ReplenishMana\\SpiritTouchTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_Blood_Func001C (family, line 38501) ---
function Trig_Blood_Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_Blood_Unit) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Actions (family, line 38508) ---
function Trig_Blood_Actions takes nothing returns nothing
    if ( Trig_Blood_Func001C() ) then
        set udg_Blood_Point = GetUnitLoc(udg_Blood_Unit)
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(580.00, udg_Blood_Point), function Trig_Blood_Func001Func004A )
        call RemoveLocation( udg_Blood_Point )
    else
        call DisableTrigger( GetTriggeringTrigger() )
    endif
endfunction

// --- InitTrig_Blood (family, line 38520) ---
function InitTrig_Blood takes nothing returns nothing
    set gg_trg_Blood = CreateTrigger(  )
    call DisableTrigger( gg_trg_Blood )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Blood, 1.00 )
    call TriggerAddAction( gg_trg_Blood, function Trig_Blood_Actions )
endfunction
