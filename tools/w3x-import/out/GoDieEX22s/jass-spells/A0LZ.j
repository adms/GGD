// rawcode: A0LZ
// nameZh: 40-04 地獄搖滾
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 250, "2": 375, "3": 500}
// range: {"1": 650.0, "2": 650.0, "3": 650.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Hell_Rock

// === family Hell_Rock (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Hell_Rock_Conditions (family, line 39160) ---
function Trig_Hell_Rock_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0LZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Rock_Actions (family, line 39167) ---
function Trig_Hell_Rock_Actions takes nothing returns nothing
    set udg_HeavyTiger = GetTriggerUnit()
    set udg_HellRockPoint = GetSpellTargetLoc()
    set udg_HellRockAngle = AngleBetweenPoints(GetUnitLoc(udg_HeavyTiger), udg_HellRockPoint)
    set udg_HellRockDistan = DistanceBetweenPoints(GetUnitLoc(udg_HeavyTiger), udg_HellRockPoint)
    set udg_HellRockIndex = 0.00
    set udg_HellRockDistan = ( udg_HellRockDistan / 41.00 )
    set udg_HellRockCasterAngle = GetUnitFacing(GetTriggerUnit())
    set udg_HellRockLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_HellRockDamage = I2R(( ( ( GetUnitAbilityLevelSwapped('A0LZ', GetTriggerUnit()) * 200 ) + 350 ) + ( 3 * GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) ) ))
    call PauseUnitBJ( true, udg_HeavyTiger )
    call PlaySoundOnUnitBJ( gg_snd_ShamanReady1, 100.00, udg_HeavyTiger )
    call TriggerSleepAction( 0.30 )
    call UnitAddAbilityBJ( 'A0FZ', udg_HeavyTiger )
    call UnitAddAbilityBJ( 'Avul', udg_HeavyTiger )
    call SetUnitPathing( udg_HeavyTiger, false )
    call SetUnitAnimation( udg_HeavyTiger, "attack slam" )
    call SetUnitTimeScalePercent( udg_HeavyTiger, 40.00 )
    call EnableTrigger( gg_trg_Hell_Rock_Move )
endfunction

// --- InitTrig_Hell_Rock (family, line 39189) ---
function InitTrig_Hell_Rock takes nothing returns nothing
    set gg_trg_Hell_Rock = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Hell_Rock, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Hell_Rock, Condition( function Trig_Hell_Rock_Conditions ) )
    call TriggerAddAction( gg_trg_Hell_Rock, function Trig_Hell_Rock_Actions )
endfunction
