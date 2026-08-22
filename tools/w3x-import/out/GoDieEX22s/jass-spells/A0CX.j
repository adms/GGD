// rawcode: A0CX
// nameZh: 84-04 給我蜂蜜
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 200, "2": 300, "3": 400, "4": 315}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 285.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 4.0}
// hero_duration: {"4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GiveMeHoney, GiveMeHoney_Effect

// === family GiveMeHoney (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GiveMeHoney_Conditions (family, line 51047) ---
function Trig_GiveMeHoney_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GiveMeHoney_Actions (family, line 51054) ---
function Trig_GiveMeHoney_Actions takes nothing returns nothing
    set udg_Bear_caster = GetTriggerUnit()
    set udg_Bear_target = GetSpellTargetUnit()
    set udg_Bear_P1 = GetUnitLoc(udg_Bear_caster)
    set udg_Bear_P2 = GetUnitLoc(udg_Bear_target)
    set udg_Bear_Angle = AngleBetweenPoints(udg_Bear_P2, udg_Bear_P1)
    set udg_Bear_Index3 = 0
    call PauseUnitBJ( true, udg_Bear_caster )
    call UnitAddAbilityBJ( 'Avul', udg_Bear_caster )
    call UnitAddAbilityBJ( 'A0DA', udg_Bear_caster )
    call CreateNUnitsAtLocFacingLocBJ( 1, 'h023', GetOwningPlayer(udg_Bear_caster), udg_Bear_P1, udg_Bear_P2 )
    set udg_Bear_U1 = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Bear_P1, bj_UNIT_FACING )
    set udg_Bear_U2 = GetLastCreatedUnit()
    call ShowUnitHide( udg_Bear_U2 )
    call UnitAddAbilityBJ( 'A0RY', udg_Bear_U2 )
    call SetUnitAbilityLevelSwapped( 'A0RY', udg_Bear_U2, GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitVertexColorBJ( udg_Bear_U1, 100.00, 100.00, 100.00, 50.00 )
    call SetUnitTimeScalePercent( udg_Bear_caster, 150.00 )
    call SetUnitAnimation( udg_Bear_caster, "attack slam" )
    call SetUnitAnimation( udg_Bear_U1, "attack slam" )
    call CreateTextTagUnitBJ( "TRIGSTR_5521", udg_Bear_caster, 50.00, 20.00, 100.00, 100.00, 100.00, 0.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call TriggerSleepAction( 0.40 )
    call EnableTrigger( gg_trg_GiveMeHoney_Effect )
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
endfunction

// --- InitTrig_GiveMeHoney (family, line 51086) ---
function InitTrig_GiveMeHoney takes nothing returns nothing
    set gg_trg_GiveMeHoney = CreateTrigger(  )
    call DisableTrigger( gg_trg_GiveMeHoney )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GiveMeHoney, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GiveMeHoney, Condition( function Trig_GiveMeHoney_Conditions ) )
    call TriggerAddAction( gg_trg_GiveMeHoney, function Trig_GiveMeHoney_Actions )
endfunction

// === family GiveMeHoney_Effect (passive) events=none ===

// --- Trig_GiveMeHoney_Effect_Func002C (family, line 51097) ---
function Trig_GiveMeHoney_Effect_Func002C takes nothing returns boolean
    if ( not ( udg_Bear_Index3 <= 5 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GiveMeHoney_Effect_Func003C (family, line 51104) ---
function Trig_GiveMeHoney_Effect_Func003C takes nothing returns boolean
    if ( not ( udg_Bear_Index3 == 5 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GiveMeHoney_Effect_Func004Func012C (family, line 51111) ---
function Trig_GiveMeHoney_Effect_Func004Func012C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Bear_caster))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GiveMeHoney_Effect_Func004C (family, line 51118) ---
function Trig_GiveMeHoney_Effect_Func004C takes nothing returns boolean
    if ( not ( udg_Bear_Index3 == 6 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GiveMeHoney_Effect_Actions (family, line 51125) ---
function Trig_GiveMeHoney_Effect_Actions takes nothing returns nothing
    set udg_Bear_Index3 = ( udg_Bear_Index3 + 1 )
    if ( Trig_GiveMeHoney_Effect_Func002C() ) then
        set udg_Bear_P1 = GetUnitLoc(udg_Bear_caster)
        set udg_Bear_P2 = GetUnitLoc(udg_Bear_target)
        set udg_Bear_Angle = AngleBetweenPoints(udg_Bear_P2, udg_Bear_P1)
        call SetUnitPositionLocFacingLocBJ( udg_Bear_caster, PolarProjectionBJ(udg_Bear_P2, 100.00, udg_Bear_Angle), udg_Bear_P2 )
        call SetUnitPositionLocFacingLocBJ( udg_Bear_U1, PolarProjectionBJ(udg_Bear_P2, 100.00, udg_Bear_Angle), udg_Bear_P2 )
        call SetUnitPositionLocFacingLocBJ( udg_Bear_U2, udg_Bear_P2, udg_Bear_P2 )
        call IssueImmediateOrderBJ( udg_Bear_U2, "stomp" )
        call AddSpecialEffectLocBJ( udg_Bear_P2, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitAnimation( udg_Bear_target, "death" )
        call SetUnitAnimation( udg_Bear_caster, "attack slam" )
        call SetUnitAnimation( udg_Bear_U1, "attack slam" )
        call CreateTextTagUnitBJ( "TRIGSTR_5543", udg_Bear_caster, 50.00, 12.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    else
    endif
    if ( Trig_GiveMeHoney_Effect_Func003C() ) then
        set udg_Bear_P1 = GetUnitLoc(udg_Bear_caster)
        set udg_Bear_P2 = GetUnitLoc(udg_Bear_target)
        set udg_Bear_Angle = AngleBetweenPoints(udg_Bear_P2, udg_Bear_P1)
        call SetUnitPositionLocFacingLocBJ( udg_Bear_caster, PolarProjectionBJ(udg_Bear_P2, 100.00, udg_Bear_Angle), udg_Bear_P2 )
        call SetUnitPositionLocFacingLocBJ( udg_Bear_U1, PolarProjectionBJ(udg_Bear_P2, 100.00, udg_Bear_Angle), udg_Bear_P2 )
        call SetUnitPositionLocFacingLocBJ( udg_Bear_U2, udg_Bear_P2, udg_Bear_P2 )
        call IssueImmediateOrderBJ( udg_Bear_U2, "stomp" )
        call SetUnitAnimation( udg_Bear_target, "death" )
        call AddSpecialEffectLocBJ( udg_Bear_P2, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_Bear_P1 )
        call RemoveLocation( udg_Bear_P2 )
        call CreateTextTagUnitBJ( "TRIGSTR_5541", udg_Bear_caster, 50.00, 16.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 60.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call SetUnitAnimation( udg_Bear_caster, "attack slam" )
        call SetUnitAnimation( udg_Bear_U1, "attack slam" )
    else
    endif
    if ( Trig_GiveMeHoney_Effect_Func004C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call CreateTextTagUnitBJ( "TRIGSTR_5544", udg_Bear_caster, 50.00, 14.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 60.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        set udg_Bear_Angle = GetRandomDirectionDeg()
        set udg_Bear_Index2 = 0
        call SetUnitTimeScalePercent( udg_Bear_target, 100.00 )
        call SetUnitAnimation( udg_Bear_target, "death" )
        call EnableTrigger( gg_trg_GiveMeHoney_KB )
        if ( Trig_GiveMeHoney_Effect_Func004Func012C() ) then
            call UnitDamageTargetBJ( udg_Bear_caster, udg_Bear_target, ( ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_Bear_caster, true)) * 9.00 ) + 75.00 ) + ( 175.00 * I2R(GetUnitAbilityLevelSwapped('A0CX', udg_Bear_caster)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( udg_Bear_caster, udg_Bear_target, ( ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_Bear_caster, true)) * I2R(GetUnitAbilityLevelSwapped('A0CX', udg_Bear_caster)) ) + 75.00 ) + ( 175.00 * I2R(GetUnitAbilityLevelSwapped('A0CX', udg_Bear_caster)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
        call KillUnit( udg_Bear_U1 )
        call RemoveUnit( udg_Bear_U1 )
        call KillUnit( udg_Bear_U2 )
        call RemoveUnit( udg_Bear_U2 )
        call SetUnitTimeScalePercent( udg_Bear_caster, 100.00 )
        call UnitRemoveAbilityBJ( 'A0DA', udg_Bear_caster )
        call UnitRemoveAbilityBJ( 'Avul', udg_Bear_caster )
        call PauseUnitBJ( false, udg_Bear_caster )
    else
    endif
endfunction

// --- InitTrig_GiveMeHoney_Effect (family, line 51199) ---
function InitTrig_GiveMeHoney_Effect takes nothing returns nothing
    set gg_trg_GiveMeHoney_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_GiveMeHoney_Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_GiveMeHoney_Effect, 0.40 )
    call TriggerAddAction( gg_trg_GiveMeHoney_Effect, function Trig_GiveMeHoney_Effect_Actions )
endfunction
