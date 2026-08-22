// rawcode: A07Z
// nameZh: 75-03 暴雷無限刃
// w3a base: ANc1  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 200, "2": 300, "3": 400, "4": 500}
// range: {"1": 250.0, "2": 250.0, "3": 250.0, "4": 250.0}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: InfniLight

// === family InfniLight (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_InfniLight_Func001C (family, line 47260) ---
function Trig_InfniLight_Func001C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A07Z' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_InfniLight_Conditions (family, line 47267) ---
function Trig_InfniLight_Conditions takes nothing returns boolean
    if ( not Trig_InfniLight_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_InfniLight_Func011A (family, line 47274) ---
function Trig_InfniLight_Func011A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "purge", GetEnumUnit() )
endfunction

// --- Trig_InfniLight_Func013A (family, line 47279) ---
function Trig_InfniLight_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_InfniLight_Actions (family, line 47284) ---
function Trig_InfniLight_Actions takes nothing returns nothing
    set udg_LightCastPoint = GetSpellTargetLoc()
    call TriggerSleepAction( 0.01 )
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), GetSpellTargetLoc(), bj_UNIT_FACING )
    call SetUnitScalePercent( GetLastCreatedUnit(), 400.00, 400.00, 400.00 )
    call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'ACsh', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'ACsh', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call UnitAddAbilityBJ( 'A02H', GetLastCreatedUnit() )
    set udg_LightCounter = 1
    loop
        exitwhen udg_LightCounter > 15
        set udg_LightCastCirPoint = PolarProjectionBJ(udg_LightCastPoint, 650.00, ( 24.00 * I2R(udg_LightCounter) ))
        call SetUnitPositionLoc( GetLastCreatedUnit(), udg_LightCastCirPoint )
        call SetUnitFacingToFaceLocTimed( GetLastCreatedUnit(), udg_LightCastPoint, 0 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_LightCastPoint )
        set udg_LightCounter = udg_LightCounter + 1
    endloop
    call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, udg_LightCastPoint), function Trig_InfniLight_Func011A )
    call TriggerSleepAction( 1.50 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'ogru'), function Trig_InfniLight_Func013A )
endfunction

// --- InitTrig_InfniLight (family, line 47308) ---
function InitTrig_InfniLight takes nothing returns nothing
    set gg_trg_InfniLight = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InfniLight, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_InfniLight, Condition( function Trig_InfniLight_Conditions ) )
    call TriggerAddAction( gg_trg_InfniLight, function Trig_InfniLight_Actions )
endfunction
