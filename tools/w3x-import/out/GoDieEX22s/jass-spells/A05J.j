// rawcode: A05J
// nameZh: 08-03 龍鬥氣砲咒文
// w3a base: AOsh  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 150, "2": 200, "3": 250, "4": 300}
// range: {"1": 750.0, "2": 750.0, "3": 750.0, "4": 750.0}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DraBom

// === family DraBom (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DraBom_Conditions (family, line 28810) ---
function Trig_DraBom_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05J' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DraBom_Func010Func001A (family, line 28817) ---
function Trig_DraBom_Func010Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_DraBom_Func014A (family, line 28821) ---
function Trig_DraBom_Func014A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DraBom_Actions (family, line 28826) ---
function Trig_DraBom_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_ThunderClapCaster, 100, GetTriggerUnit() )
    set udg_DraBom = GetUnitLoc(GetTriggerUnit())
    // xxxxxxxxx
    call SetUnitExplodedBJ( GetSpellTargetUnit(), true )
    // xxxxxxxxx
    call TerrainDeformationRippleBJ( 3.00, false, udg_DraBom, 200.00, 200.00, 64, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    // xxxxxxxxx
    set udg_Dragon = 1
    loop
        exitwhen udg_Dragon > 10
        call CreateNUnitsAtLoc( 1, 'e003', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(udg_DraBom, ( 150.00 * I2R(udg_Dragon) ), GetUnitFacing(GetTriggerUnit())), GetUnitFacing(GetTriggerUnit()) )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        set udg_Dragon = udg_Dragon + 1
    endloop
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_DraBom_Func010Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'e003'), function Trig_DraBom_Func014A )
    call RemoveLocation(udg_DraBom)
endfunction

// --- InitTrig_DraBom (family, line 28863) ---
function InitTrig_DraBom takes nothing returns nothing
    set gg_trg_DraBom = CreateTrigger(  )
    call DisableTrigger( gg_trg_DraBom )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DraBom, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DraBom, Condition( function Trig_DraBom_Conditions ) )
    call TriggerAddAction( gg_trg_DraBom, function Trig_DraBom_Actions )
endfunction
