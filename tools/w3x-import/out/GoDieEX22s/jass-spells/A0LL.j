// rawcode: A0LL
// nameZh: 79-03 月牙天衝
// w3a base: ANcl  levels: 4
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 150, "2": 200, "3": 250, "4": 300}
// range: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Bleach_Moon

// === family Bleach_Moon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Moon_Conditions (family, line 37492) ---
function Trig_Bleach_Moon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0LL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Func007C (family, line 37499) ---
function Trig_Bleach_Moon_Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01O' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Actions (family, line 37506) ---
function Trig_Bleach_Moon_Actions takes nothing returns nothing
    set udg_BleachUnit = GetTriggerUnit()
    set udg_BleachCastPoint = GetSpellTargetLoc()
    set udg_BleachTrigPoint = GetUnitLoc(udg_BleachUnit)
    set udg_BleachFaceAngle = AngleBetweenPoints(udg_BleachTrigPoint, udg_BleachCastPoint)
    set udg_BleachMoonDistan = 1000
    if ( Trig_Bleach_Moon_Func007C() ) then
        set udg_BleachMoonDam = ( ( 550.00 + I2R(( GetUnitAbilityLevelSwapped('A0LL', udg_BleachUnit) * 150 )) ) + 0.00 )
        call CreateNUnitsAtLoc( 1, 'o01R', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachUnit), GetUnitFacing(udg_BleachUnit) )
        set udg_BleachCreateUnit = GetLastCreatedUnit()
        call SetUnitPathing( udg_BleachCreateUnit, false )
    else
        set udg_BleachMoonDam = ( ( 300.00 + I2R(( GetUnitAbilityLevelSwapped('A0LL', udg_BleachUnit) * 150 )) ) + 0.00 )
        call CreateNUnitsAtLoc( 1, 'o01Q', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachUnit), GetUnitFacing(udg_BleachUnit) )
        set udg_BleachCreateUnit = GetLastCreatedUnit()
        call SetUnitPathing( udg_BleachCreateUnit, false )
    endif
    call EnableTrigger( gg_trg_Bleach_Moon_Effect )
endfunction

// --- InitTrig_Bleach_Moon (family, line 37527) ---
function InitTrig_Bleach_Moon takes nothing returns nothing
    set gg_trg_Bleach_Moon = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Moon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Moon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Moon, Condition( function Trig_Bleach_Moon_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Moon, function Trig_Bleach_Moon_Actions )
endfunction
