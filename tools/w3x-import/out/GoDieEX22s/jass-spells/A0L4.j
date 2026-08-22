// rawcode: A0L4
// nameZh: 78-02 地走龍牙破
// w3a base: AOsh  levels: 4
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 75, "2": 105, "3": 135, "4": 165}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GroundAttack

// === family GroundAttack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GroundAttack_Conditions (family, line 49977) ---
function Trig_GroundAttack_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0L4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GroundAttack_Func014A (family, line 49984) ---
function Trig_GroundAttack_Func014A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_GroundAttack_Actions (family, line 49988) ---
function Trig_GroundAttack_Actions takes nothing returns nothing
    set udg_RabCastUnit = GetTriggerUnit()
    set udg_RabFacing = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetSpellTargetLoc())
    set udg_RabTarget = GetSpellTargetLoc()
    set udg_RabUnitPoint = GetUnitLoc(GetTriggerUnit())
    set udg_RabLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_RabDistance = ( DistanceBetweenPoints(udg_RabUnitPoint, udg_RabTarget) / 75.00 )
    call ShowUnitHide( udg_RabCastUnit )
    call TriggerSleepAction( 0.01 )
    set udg_RabCounter = 1
    loop
        exitwhen udg_RabCounter > R2I(udg_RabDistance)
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_RabUnitPoint, ( 75.00 * I2R(udg_RabCounter) ), udg_RabFacing), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TerrainDeformationRippleBJ( 1.00, true, PolarProjectionBJ(udg_RabUnitPoint, ( I2R(udg_RabCounter) * 50.00 ), udg_RabFacing), 100.00, 340.00, 48.00, 1, 200.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit2, 100, udg_RabTarget, 0 )
        call TriggerSleepAction( 0.01 )
        set udg_RabCounter = udg_RabCounter + 1
    endloop
    call SetUnitPositionLoc( udg_RabCastUnit, udg_RabTarget )
    call ShowUnitShow( udg_RabCastUnit )
    call SelectUnitForPlayerSingle( udg_RabCastUnit, GetOwningPlayer(udg_RabCastUnit) )
    set udg_RabCounter = 1
    loop
        exitwhen udg_RabCounter > 10
        call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_RabCastUnit), PolarProjectionBJ(udg_RabTarget, 160.00, I2R(udg_RabCounter)), GetRandomDirectionDeg() )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_RabGroup )
        call AddSpecialEffectLocBJ( udg_RabTarget, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_RabCounter = udg_RabCounter + 1
    endloop
    call EnumDestructablesInCircleBJ( 400.00, GetUnitLoc(udg_RabCastUnit), function Trig_GroundAttack_Func014A )
    call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_RabCastUnit), udg_RabTarget, GetRandomDirectionDeg() )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0L7', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0L7', GetLastCreatedUnit(), udg_RabLevel )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call TerrainDeformationRippleBJ( 5.00, true, udg_RabTarget, 100.00, 340.00, 88.00, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit1, 100, udg_RabTarget, 0 )
endfunction

// --- InitTrig_GroundAttack (family, line 50032) ---
function InitTrig_GroundAttack takes nothing returns nothing
    set gg_trg_GroundAttack = CreateTrigger(  )
    call DisableTrigger( gg_trg_GroundAttack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GroundAttack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GroundAttack, Condition( function Trig_GroundAttack_Conditions ) )
    call TriggerAddAction( gg_trg_GroundAttack, function Trig_GroundAttack_Actions )
endfunction
