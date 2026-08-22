// rawcode: A0R4
// nameZh: 90-04 陽光烈焰
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 200, "2": 300, "3": 400}
// range: {"1": 900.0, "2": 900.0, "3": 900.0}
// area: {"1": 400.0, "2": 400.0, "3": 400.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SunFire, SunFire_pre

// === family SunFire (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SunFire_Conditions (family, line 26732) ---
function Trig_SunFire_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0R4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SunFire_Func013Func004Func001C (family, line 26739) ---
function Trig_SunFire_Func013Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Frog_Hero)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_Frog_Sun_Group) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SunFire_Func013Func004A (family, line 26755) ---
function Trig_SunFire_Func013Func004A takes nothing returns nothing
    if ( Trig_SunFire_Func013Func004Func001C() ) then
        call UnitDamageTargetBJ( udg_Frog_Hero, GetEnumUnit(), udg_Frog_Sun_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call GroupAddUnitSimple( GetEnumUnit(), udg_Frog_Sun_Group )
    else
    endif
endfunction

// --- Trig_SunFire_Func013Func005Func001C (family, line 26763) ---
function Trig_SunFire_Func013Func005Func001C takes nothing returns boolean
    if ( not ( IsDestructableAliveBJ(GetEnumDestructable()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SunFire_Func013Func005A (family, line 26770) ---
function Trig_SunFire_Func013Func005A takes nothing returns nothing
    if ( Trig_SunFire_Func013Func005Func001C() ) then
        call KillDestructable( GetEnumDestructable() )
    else
    endif
endfunction

// --- Trig_SunFire_Func017A (family, line 26777) ---
function Trig_SunFire_Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SunFire_Actions (family, line 26782) ---
function Trig_SunFire_Actions takes nothing returns nothing
    set udg_Frog_Hero = GetTriggerUnit()
    set udg_LocPoint1 = GetUnitLoc(GetSpellAbilityUnit())
    set udg_LocPoint2 = GetSpellTargetLoc()
    set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, 150.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
    call GroupClear( udg_Frog_Sun_Group )
    call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 200.00, 200.00, 400.00 )
    call RemoveLocation( udg_LocPoint3 ) 
    set udg_Frog_Sun_Damage = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(( ( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) + GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true) ) + GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) )) * 2.00 ) ) + 300.00 )
    set udg_Frog_Sun_Index = 1
    loop
        exitwhen udg_Frog_Sun_Index > 10
        set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_Frog_Sun_Index) * 100.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
        call AddSpecialEffectLocBJ( udg_LocPoint3, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(280.00, udg_LocPoint3), function Trig_SunFire_Func013Func004A )
        call EnumDestructablesInCircleBJ( 350.00, udg_LocPoint3, function Trig_SunFire_Func013Func005A )
        call RemoveLocation( udg_LocPoint3 ) 
        set udg_Frog_Sun_Index = udg_Frog_Sun_Index + 1
    endloop
    call RemoveLocation( udg_LocPoint1 ) 
    call RemoveLocation( udg_LocPoint2 ) 
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Frog_Hero), 'h007'), function Trig_SunFire_Func017A )
endfunction

// --- InitTrig_SunFire (family, line 26812) ---
function InitTrig_SunFire takes nothing returns nothing
    set gg_trg_SunFire = CreateTrigger(  )
    call DisableTrigger( gg_trg_SunFire )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SunFire, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SunFire, Condition( function Trig_SunFire_Conditions ) )
    call TriggerAddAction( gg_trg_SunFire, function Trig_SunFire_Actions )
endfunction

// === family SunFire_pre (active) events=EVENT_PLAYER_UNIT_SPELL_CHANNEL ===

// --- Trig_SunFire_pre_Conditions (family, line 26699) ---
function Trig_SunFire_pre_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0R4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SunFire_pre_Func006A (family, line 26706) ---
function Trig_SunFire_pre_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SunFire_pre_Actions (family, line 26711) ---
function Trig_SunFire_pre_Actions takes nothing returns nothing
    set udg_Frog_Hero = GetTriggerUnit()
    set udg_ActivePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h02X', GetOwningPlayer(udg_Frog_Hero), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call RemoveLocation(udg_ActivePoint)
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Frog_Hero), 'h02X'), function Trig_SunFire_pre_Func006A )
endfunction

// --- InitTrig_SunFire_pre (family, line 26721) ---
function InitTrig_SunFire_pre takes nothing returns nothing
    set gg_trg_SunFire_pre = CreateTrigger(  )
    call DisableTrigger( gg_trg_SunFire_pre )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SunFire_pre, EVENT_PLAYER_UNIT_SPELL_CHANNEL )
    call TriggerAddCondition( gg_trg_SunFire_pre, Condition( function Trig_SunFire_pre_Conditions ) )
    call TriggerAddAction( gg_trg_SunFire_pre, function Trig_SunFire_pre_Actions )
endfunction
