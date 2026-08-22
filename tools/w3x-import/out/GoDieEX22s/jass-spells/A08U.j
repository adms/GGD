// rawcode: A08U
// nameZh: 28-04 破滅能量彈
// w3a base: AOeq  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 280, "2": 430, "3": 580, "4": 730}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// area: {"1": 410.0, "2": 410.0, "3": 410.0, "4": 350.0}
// duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EarthBoom

// === family EarthBoom (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EarthBoom_Conditions (family, line 40693) ---
function Trig_EarthBoom_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A08U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EarthBoom_Func010A (family, line 40700) ---
function Trig_EarthBoom_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EarthBoom_Func011A (family, line 40705) ---
function Trig_EarthBoom_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EarthBoom_Func012A (family, line 40710) ---
function Trig_EarthBoom_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EarthBoom_Actions (family, line 40715) ---
function Trig_EarthBoom_Actions takes nothing returns nothing
    set udg_EarthDamage = ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 100.00 ) + 200.00 )
    set udg_EarthPoint = GetSpellTargetLoc()
    set udg_EarthCounter = -1
    set udg_PuUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o029', GetOwningPlayer(GetTriggerUnit()), udg_EarthPoint, bj_UNIT_FACING )
    set udg_EarthBallUnit = GetLastCreatedUnit()
    call SetUnitScalePercent( GetLastCreatedUnit(), 1500.00, 1500.00, 1500.00 )
    call TriggerExecute( gg_trg_EarthBoomCheck )
    call EnableTrigger( gg_trg_EarthBoomCheck )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PuUnit), 'h02J'), function Trig_EarthBoom_Func010A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PuUnit), 'h02J'), function Trig_EarthBoom_Func011A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PuUnit), 'h02J'), function Trig_EarthBoom_Func012A )
endfunction

// --- InitTrig_EarthBoom (family, line 40731) ---
function InitTrig_EarthBoom takes nothing returns nothing
    set gg_trg_EarthBoom = CreateTrigger(  )
    call DisableTrigger( gg_trg_EarthBoom )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EarthBoom, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EarthBoom, Condition( function Trig_EarthBoom_Conditions ) )
    call TriggerAddAction( gg_trg_EarthBoom, function Trig_EarthBoom_Actions )
endfunction
