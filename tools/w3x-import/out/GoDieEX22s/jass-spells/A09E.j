// rawcode: A09E
// nameZh: 09-03 超級賽亞人
// w3a base: AEIl  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 160, "2": 240, "3": 320, "4": 400}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 8.0, "2": 12.0, "3": 16.0, "4": 20.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SSJ

// === family SSJ (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SSJ_Func001C (family, line 31685) ---
function Trig_SSJ_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09E' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ogrh' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SSJ_Conditions (family, line 31695) ---
function Trig_SSJ_Conditions takes nothing returns boolean
    if ( not Trig_SSJ_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_SSJ_Actions (family, line 31702) ---
function Trig_SSJ_Actions takes nothing returns nothing
    set udg_SSJ = GetTriggerUnit()
    set udg_SSJR = 0.00
    // xxxxxxxxx
    call TerrainDeformationRippleBJ( 5.00, true, udg_Hell, 100.00, 340.00, 64, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    // xxxxxxxxx
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 4
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        set udg_SSJDR = ( I2R(GetForLoopIndexB()) * 50.00 )
        set udg_SSJR = 0.00
        call AddSpecialEffectTargetUnitBJ( "origin", udg_SSJ, "Abilities\\Spells\\Orc\\EarthQuake\\EarthQuakeTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "origin", udg_SSJ, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SSJR = ( udg_SSJR + 36.00 )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_SSJ), udg_SSJDR, udg_SSJR), "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.01 )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_SSJ (family, line 31754) ---
function InitTrig_SSJ takes nothing returns nothing
    set gg_trg_SSJ = CreateTrigger(  )
    call DisableTrigger( gg_trg_SSJ )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SSJ, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SSJ, Condition( function Trig_SSJ_Conditions ) )
    call TriggerAddAction( gg_trg_SSJ, function Trig_SSJ_Actions )
endfunction
