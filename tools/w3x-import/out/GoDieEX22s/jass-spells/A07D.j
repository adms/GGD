// rawcode: A07D
// nameZh: 33-03 地道突襲
// w3a base: AOsh  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 165, "2": 215, "3": 265, "4": 315}
// range: {"1": 900.0, "2": 900.0, "3": 900.0, "4": 900.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GaiaAngre

// === family GaiaAngre (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GaiaAngre_Conditions (family, line 43421) ---
function Trig_GaiaAngre_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GaiaAngre_Func014A (family, line 43428) ---
function Trig_GaiaAngre_Func014A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_GaiaAngre_Func026A (family, line 43432) ---
function Trig_GaiaAngre_Func026A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GaiaAngre_Actions (family, line 43437) ---
function Trig_GaiaAngre_Actions takes nothing returns nothing
    set udg_GaiaCastUnit = GetTriggerUnit()
    set udg_GaiaFacing = GetUnitFacing(GetTriggerUnit())
    set udg_GaiaTarget = GetSpellTargetLoc()
    set udg_GaiaUnitPoint = GetUnitLoc(GetTriggerUnit())
    set udg_GaiaLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_GaiaDistance = ( DistanceBetweenPoints(udg_GaiaUnitPoint, udg_GaiaTarget) / 75.00 )
    call ShowUnitHide( udg_GaiaCastUnit )
    call TriggerSleepAction( 0.01 )
    set udg_GaiaCounter = 1
    loop
        exitwhen udg_GaiaCounter > R2I(udg_GaiaDistance)
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_GaiaUnitPoint, ( 75.00 * I2R(udg_GaiaCounter) ), udg_GaiaFacing), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TerrainDeformationRippleBJ( 1.00, true, PolarProjectionBJ(udg_GaiaUnitPoint, ( I2R(udg_GaiaCounter) * 50.00 ), udg_GaiaFacing), 100.00, 340.00, 48.00, 1, 200.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit2, 100, udg_GaiaTarget, 0 )
        call TriggerSleepAction( 0.01 )
        set udg_GaiaCounter = udg_GaiaCounter + 1
    endloop
    call SetUnitPositionLoc( udg_GaiaCastUnit, udg_GaiaTarget )
    call ShowUnitShow( udg_GaiaCastUnit )
    call SelectUnitForPlayerSingle( udg_GaiaCastUnit, GetOwningPlayer(udg_GaiaCastUnit) )
    set udg_GaiaCounter = 1
    loop
        exitwhen udg_GaiaCounter > 10
        call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_GaiaCastUnit), PolarProjectionBJ(udg_GaiaTarget, 160.00, I2R(( 30 * udg_GaiaCounter ))), GetRandomDirectionDeg() )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_GaiaGroup )
        call AddSpecialEffectLocBJ( udg_GaiaTarget, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_GaiaCounter = udg_GaiaCounter + 1
    endloop
    call EnumDestructablesInCircleBJ( 400.00, GetUnitLoc(udg_GaiaCastUnit), function Trig_GaiaAngre_Func014A )
    call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_GaiaCastUnit), udg_GaiaTarget, GetRandomDirectionDeg() )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A07Q', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A07Q', GetLastCreatedUnit(), udg_GaiaLevel )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call TerrainDeformationRippleBJ( 5.00, true, udg_GaiaTarget, 100.00, 340.00, 88.00, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit1, 100, udg_GaiaTarget, 0 )
    call RemoveLocation(udg_GaiaUnitPoint)
    call RemoveLocation(udg_GaiaTarget)
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( udg_GaiaGroup, function Trig_GaiaAngre_Func026A )
endfunction

// --- InitTrig_GaiaAngre (family, line 43485) ---
function InitTrig_GaiaAngre takes nothing returns nothing
    set gg_trg_GaiaAngre = CreateTrigger(  )
    call DisableTrigger( gg_trg_GaiaAngre )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GaiaAngre, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GaiaAngre, Condition( function Trig_GaiaAngre_Conditions ) )
    call TriggerAddAction( gg_trg_GaiaAngre, function Trig_GaiaAngre_Actions )
endfunction
