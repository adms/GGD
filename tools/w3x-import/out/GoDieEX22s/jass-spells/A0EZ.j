// rawcode: A0EZ
// nameZh: 08-04 阿邦快速劍X
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 250, "2": 315, "3": 380}
// range: {"1": 600.0, "2": 600.0, "3": 600.0}
// area: {"1": 200.0, "2": 200.0, "3": 200.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ABanX

// === family ABanX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ABanX_Conditions (family, line 28874) ---
function Trig_ABanX_Conditions takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A0EZ' )
endfunction

// --- Trig_ABanX_Second_Raid (family, line 28878) ---
function Trig_ABanX_Second_Raid takes nothing returns nothing
    if ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetTriggerPlayer()) == true ) then
       if ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) then

         call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( I2R(GetUnitAbilityLevelSwapped('A0EZ', GetTriggerUnit())) * ( 7.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_UNIVERSAL )

         call AddSpecialEffectLocBJ( GetRectCenter(RectFromCenterSizeBJ(GetUnitLoc(GetEnumUnit()), 100.00, 100.00)), "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
         call RemoveEffectSP( GetLastCreatedEffectBJ() , 1.00 )
       endif
    endif
endfunction

// --- Trig_ABanX_Actions (family, line 28890) ---
function Trig_ABanX_Actions takes nothing returns nothing
    // 設定數據
    local location land_point
    local location casting_unit_loc
    local unit special_effect_unit

    set udg_P0 = GetSpellTargetLoc()
    set casting_unit_loc = GetUnitLoc(GetTriggerUnit())
    set land_point = PolarProjectionBJ(casting_unit_loc , 550.00 , AngleBetweenPoints(casting_unit_loc, udg_P0) )
    call RemoveLocation( udg_P0 )
    // 設定結束

    call UnitAddAbilityBJ( 'A09O', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )

    call ShowUnitHide( GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'e003', GetOwningPlayer(GetTriggerUnit()), casting_unit_loc, GetUnitFacing(GetTriggerUnit()) )
    set special_effect_unit = GetLastCreatedUnit()

    call TriggerSleepAction( 1.00 )

    call KillUnit( special_effect_unit )
    call RemoveUnit( special_effect_unit )

    call AddSpecialEffectLocBJ( casting_unit_loc, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
    call SetUnitPositionLoc( GetTriggerUnit(), land_point )
    call ShowUnitShow( GetTriggerUnit() )

    call ForGroupBJ( GetUnitsInRangeOfLocAll( 250.00, land_point ), function Trig_ABanX_Second_Raid )

    //漂浮文字
    //call CreateTextTagUnitBJ( "TRIGSTR_042", GetTriggerUnit(), -30.00, 100.00, 100, 100.00, 100.00, 0 )
    //call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 12.00, GetUnitFacing(GetTriggerUnit()) )
    //call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    //call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    //call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

    call SelectUnitForPlayerSingle( GetTriggerUnit(), GetOwningPlayer(GetTriggerUnit()) )

    call RemoveLocation( casting_unit_loc )
    call RemoveLocation( land_point )
    call UnitRemoveAbilityBJ( 'A09O', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A09P', GetTriggerUnit() )
    set land_point = null
    set casting_unit_loc = null
    set special_effect_unit = null
endfunction

// --- InitTrig_ABanX (family, line 28940) ---
function InitTrig_ABanX takes nothing returns nothing
    set gg_trg_ABanX = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ABanX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ABanX, Condition( function Trig_ABanX_Conditions ) )
    call TriggerAddAction( gg_trg_ABanX, function Trig_ABanX_Actions )
endfunction

// --- RemoveEffectSP (helper, line 4814) ---
function RemoveEffectSP takes effect R_Effect , real Life_Time returns nothing
    local real Bj_Timer = bj_enumDestructableRadius
    set bj_lastCreatedEffect = R_Effect
    set bj_enumDestructableRadius = Life_Time
    call ExecuteFunc("RemoveEffectSP_Action")
    set bj_enumDestructableRadius = Bj_Timer
endfunction
