// rawcode: A0DO
// nameZh: 39-03 無名神風流-蛟龍
// w3a base: AUim  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 215, "2": 245, "3": 275, "4": 305}
// range: {"1": 900.0, "2": 900.0, "3": 900.0, "4": 900.0}
// area: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ShanWindDragon

// === family ShanWindDragon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ShanWindDragon_Conditions (family, line 39638) ---
function Trig_ShanWindDragon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0DO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ShanWindDragon_Func004C (family, line 39645) ---
function Trig_ShanWindDragon_Func004C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_WindDragonUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ShanWindDragon_Actions (family, line 39652) ---
function Trig_ShanWindDragon_Actions takes nothing returns nothing
    set udg_WindDragonCount = 0
    set udg_WindDragonUnit = GetTriggerUnit()
    set udg_WindDragonAngle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_ShanWindDragon_Func004C() ) then
        set udg_WindDragonDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * 6.00 ) + ( ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0DO', GetTriggerUnit())) ) + 250.00 ) )
    else
        set udg_WindDragonDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * 3.00 ) + ( ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0DO', GetTriggerUnit())) ) + 250.00 ) )
    endif
    set udg_WindDragonPostion = GetUnitLoc(GetTriggerUnit())
    set udg_WindDragonTargetPoint = GetSpellTargetLoc()
    call GroupClear( udg_WindDragonGroup )
    call CreateNUnitsAtLoc( 3, 'u00W', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
    call TriggerSleepAction( 0.10 )
    call UnitAddAbilityBJ( 'A0KW', udg_WindDragonUnit )
    call EnableTrigger( gg_trg_ShanWindDragonMove )
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget2, 100.00, udg_WindDragonUnit )
endfunction

// --- InitTrig_ShanWindDragon (family, line 39672) ---
function InitTrig_ShanWindDragon takes nothing returns nothing
    set gg_trg_ShanWindDragon = CreateTrigger(  )
    call DisableTrigger( gg_trg_ShanWindDragon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ShanWindDragon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ShanWindDragon, Condition( function Trig_ShanWindDragon_Conditions ) )
    call TriggerAddAction( gg_trg_ShanWindDragon, function Trig_ShanWindDragon_Actions )
endfunction
