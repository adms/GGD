// rawcode: A0J2
// nameZh: 00-00 龍虎亂舞
// cooldown: {"1": 30.0}
// mana: {"1": 175}
// duration: {"1": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DragonTigerReady

// === family DragonTigerReady (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DragonTigerReady_Conditions (family, line 25687) ---
function Trig_DragonTigerReady_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0J2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonTigerReady_Func025A (family, line 25694) ---
function Trig_DragonTigerReady_Func025A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DragonTigerReady_Func039A (family, line 25699) ---
function Trig_DragonTigerReady_Func039A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DragonTigerReady_Actions (family, line 25704) ---
function Trig_DragonTigerReady_Actions takes nothing returns nothing
    set udg_KOFMaster = GetTriggerUnit()
    set udg_KOFCaster = GetSpellTargetUnit()
    set udg_KOFMasterAngle = AngleBetweenPoints(GetUnitLoc(udg_KOFMaster), GetUnitLoc(udg_KOFCaster))
    set udg_KOFIndex = 17
    call PauseUnitBJ( true, udg_KOFMaster )
    call PauseUnitBJ( true, udg_KOFCaster )
    call SetUnitInvulnerable( udg_KOFCaster, true )
    call SetUnitInvulnerable( udg_KOFMaster, true )
    call UnitAddAbilityBJ( 'A0FZ', udg_KOFCaster )
    call UnitAddAbilityBJ( 'A0FZ', udg_KOFMaster )
    call SetUnitTimeScalePercent( udg_KOFMaster, 150.00 )
    call SetUnitAnimation( udg_KOFMaster, "spell" )
    call AddSpecialEffectTargetUnitBJ( "hand", udg_KOFMaster, "Abilities\\Weapons\\ZigguratMissile\\ZigguratMissile.mdl" )
    set udg_KOFSpecialEffect[1] = GetLastCreatedEffectBJ()
    call CreateNUnitsAtLocFacingLocBJ( 1, 'o01A', GetOwningPlayer(udg_KOFMaster), PolarProjectionBJ(GetUnitLoc(udg_KOFMaster), 25.00, udg_KOFMasterAngle), GetUnitLoc(udg_KOFCaster) )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KOFCreateUnit )
    call CreateNUnitsAtLocFacingLocBJ( 1, 'o01A', GetOwningPlayer(udg_KOFMaster), PolarProjectionBJ(GetUnitLoc(udg_KOFMaster), 25.00, udg_KOFMasterAngle), GetUnitLoc(udg_KOFCaster) )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KOFCreateUnit )
    call CreateNUnitsAtLocFacingLocBJ( 1, 'o01A', GetOwningPlayer(udg_KOFMaster), PolarProjectionBJ(GetUnitLoc(udg_KOFMaster), 25.00, udg_KOFMasterAngle), GetUnitLoc(udg_KOFCaster) )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KOFCreateUnit )
    call CreateNUnitsAtLocFacingLocBJ( 1, 'o01A', GetOwningPlayer(udg_KOFMaster), PolarProjectionBJ(GetUnitLoc(udg_KOFMaster), 25.00, udg_KOFMasterAngle), GetUnitLoc(udg_KOFCaster) )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KOFCreateUnit )
    call TriggerSleepAction( 0.30 )
    call SetUnitAnimation( udg_KOFCaster, "death" )
    call ForGroupBJ( udg_KOFCreateUnit, function Trig_DragonTigerReady_Func025A )
    call SetUnitPositionLocFacingBJ( udg_KOFMaster, PolarProjectionBJ(GetUnitLoc(udg_KOFCaster), -100.00, udg_KOFMasterAngle), udg_KOFMasterAngle )
    set udg_KOFCount = 1
    loop
        exitwhen udg_KOFCount > 5
        call SetUnitTimeScalePercent( udg_KOFMaster, 300.00 )
        call SetUnitAnimationWithRarity( udg_KOFMaster, "attack", RARITY_RARE )
        call SetUnitPositionLocFacingLocBJ( udg_KOFCaster, PolarProjectionBJ(GetUnitLoc(udg_KOFCaster), 100.00, udg_KOFMasterAngle), GetUnitLoc(udg_KOFMaster) )
        call SetUnitPositionLocFacingLocBJ( udg_KOFMaster, PolarProjectionBJ(GetUnitLoc(udg_KOFMaster), 100.00, udg_KOFMasterAngle), GetUnitLoc(udg_KOFCaster) )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "hand", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "head", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "foot", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.05 )
        set udg_KOFCount = udg_KOFCount + 1
    endloop
    call SetUnitTimeScalePercent( udg_KOFMaster, 15.00 )
    call SetUnitAnimation( udg_KOFMaster, "attack slam" )
    call ResetUnitAnimation( udg_KOFCaster )
    call AddSpecialEffectTargetUnitBJ( "hand", udg_KOFMaster, "Abilities\\Weapons\\AncestralGuardianMissile\\AncestralGuardianMissile.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.50 )
    call SetUnitAnimation( udg_KOFCaster, "death" )
    call CreateNUnitsAtLoc( 1, 'o01B', GetOwningPlayer(udg_KOFMaster), GetUnitLoc(udg_KOFMaster), bj_UNIT_FACING )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KOFCreateUnit )
    set udg_KOFCount = 1
    loop
        exitwhen udg_KOFCount > 2
        call SetUnitFlyHeightBJ( udg_KOFCaster, ( 72.00 * I2R(udg_KOFCount) ), 0.00 )
        call SetUnitFlyHeightBJ( udg_KOFMaster, ( 45.00 * I2R(udg_KOFCount) ), 0.00 )
        call TriggerSleepAction( 0.05 )
        set udg_KOFCount = udg_KOFCount + 1
    endloop
    set udg_KOFCount = 0
    loop
        exitwhen udg_KOFCount > 2
        call SetUnitFlyHeightBJ( udg_KOFCaster, ( 216.00 + ( 72.00 * I2R(udg_KOFCount) ) ), 0.00 )
        call SetUnitFlyHeightBJ( udg_KOFMaster, ( 135.00 + ( 45.00 * I2R(udg_KOFCount) ) ), 0.00 )
        call SetUnitTimeScalePercent( udg_KOFMaster, 5.00 )
        call CreateNUnitsAtLoc( 1, 'o019', GetOwningPlayer(udg_KOFMaster), GetUnitLoc(udg_KOFCaster), ( ( udg_KOFMasterAngle + 60.00 ) + ( 30.00 * I2R(udg_KOFCount) ) ) )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KOFCreateUnit )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "hand", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "head", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "foot", udg_KOFCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.10 )
        call SetUnitTimeScalePercent( udg_KOFMaster, 100 )
        call TriggerSleepAction( 0.05 )
        set udg_KOFCount = udg_KOFCount + 1
    endloop
    call ForGroupBJ( udg_KOFCreateUnit, function Trig_DragonTigerReady_Func039A )
    call SetUnitFlyHeightBJ( udg_KOFMaster, 0.00, 500.00 )
    call SetUnitAnimation( udg_KOFCaster, "death" )
    call SetUnitPathing( udg_KOFCaster, false )
    call EnableTrigger( gg_trg_DragonTigerMove )
    call SetUnitTimeScalePercent( udg_KOFMaster, 100.00 )
    call DestroyEffectBJ( udg_KOFSpecialEffect[1] )
    call TriggerSleepAction( 0.50 )
    call SetUnitInvulnerable( udg_KOFMaster, false )
    call UnitDamageTargetBJ( udg_KOFMaster, udg_KOFCaster, I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, udg_KOFMaster, true) * 20 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call UnitRemoveAbilityBJ( 'A0FZ', udg_KOFMaster )
    call PauseUnitBJ( false, udg_KOFMaster )
endfunction

// --- InitTrig_DragonTigerReady (family, line 25802) ---
function InitTrig_DragonTigerReady takes nothing returns nothing
    set gg_trg_DragonTigerReady = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DragonTigerReady, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DragonTigerReady, Condition( function Trig_DragonTigerReady_Conditions ) )
    call TriggerAddAction( gg_trg_DragonTigerReady, function Trig_DragonTigerReady_Actions )
endfunction
