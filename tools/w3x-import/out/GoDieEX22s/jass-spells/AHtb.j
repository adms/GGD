// rawcode: AHtb
// nameZh: CP-摔技
// w3a base: AHtb  levels: 1
// cooldown: {"1": 15.0}
// range: {"1": 150.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Stumble

// === family Stumble (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Stumble_Conditions (family, line 25189) ---
function Trig_Stumble_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AHtb' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Stumble_Actions (family, line 25196) ---
function Trig_Stumble_Actions takes nothing returns nothing
    set udg_StumbleUnit = GetTriggerUnit()
    set udg_StumbledUnit = GetSpellTargetUnit()
    call SetUnitInvulnerable( udg_StumbleUnit, true )
    call SetUnitInvulnerable( udg_StumbledUnit, true )
    call PauseUnitBJ( true, udg_StumbledUnit )
    call PauseUnitBJ( true, udg_StumbleUnit )
    call SetUnitPositionLoc( udg_StumbledUnit, GetUnitLoc(udg_StumbleUnit) )
    call UnitAddAbilityBJ( 'A0FZ', udg_StumbledUnit )
    call SetUnitAnimation( udg_StumbleUnit, "Spell" )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 5000.00, 5000.00 )
    call TriggerSleepAction( 0.20 )
    call SetUnitAnimation( udg_StumbledUnit, "death" )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 180.00, 5000.00 )
    call TriggerSleepAction( 0.20 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_StumbleUnit, "Spell" )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 5000.00, 5000.00 )
    call TriggerSleepAction( 0.20 )
    call SetUnitAnimation( udg_StumbledUnit, "death" )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 180.00, 5000.00 )
    call TriggerSleepAction( 0.20 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_StumbleUnit, "Spell" )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 5000.00, 5000.00 )
    call TriggerSleepAction( 0.20 )
    call SetUnitAnimation( udg_StumbledUnit, "death" )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 180.00, 5000.00 )
    call TriggerSleepAction( 0.20 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLoc( udg_StumbledUnit, PolarProjectionBJ(GetUnitLoc(udg_StumbleUnit), 120.00, ( GetUnitFacing(udg_StumbleUnit) + -120.00 )) )
    call SetUnitFlyHeightBJ( udg_StumbledUnit, 0.00, 5000.00 )
    call UnitRemoveAbilityBJ( 'A0FZ', udg_StumbledUnit )
    call SetUnitTimeScalePercent( udg_StumbleUnit, 500.00 )
    call SetUnitAnimation( udg_StumbleUnit, "death" )
    call TriggerSleepAction( 0.10 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_StumbleUnit, "death" )
    call TriggerSleepAction( 0.10 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_StumbleUnit, "death" )
    call TriggerSleepAction( 0.10 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_StumbleUnit, "death" )
    call TriggerSleepAction( 0.10 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_StumbledUnit), "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitTimeScalePercent( udg_StumbleUnit, 100.00 )
    call SetUnitInvulnerable( udg_StumbleUnit, false )
    call SetUnitInvulnerable( udg_StumbledUnit, false )
    call UnitDamageTargetBJ( udg_StumbleUnit, udg_StumbledUnit, 2000.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call TriggerSleepAction( 1.00 )
    call PauseUnitBJ( false, udg_StumbledUnit )
    call PauseUnitBJ( false, udg_StumbleUnit )
endfunction

// --- InitTrig_Stumble (family, line 25261) ---
function InitTrig_Stumble takes nothing returns nothing
    set gg_trg_Stumble = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Stumble, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Stumble, Condition( function Trig_Stumble_Conditions ) )
    call TriggerAddAction( gg_trg_Stumble, function Trig_Stumble_Actions )
endfunction
