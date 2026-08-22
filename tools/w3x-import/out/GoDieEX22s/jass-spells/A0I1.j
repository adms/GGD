// rawcode: A0I1
// nameZh: 32-03 閃光龍牙
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 150, "2": 210, "3": 270, "4": 330}
// range: {"1": 800.0, "2": 800.0, "3": 800.0, "4": 800.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: KniSkill, KniSkillEffect

// === family KniSkill (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KniSkill_Conditions (family, line 42656) ---
function Trig_KniSkill_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0I1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KniSkill_Actions (family, line 42663) ---
function Trig_KniSkill_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_SnowCUnit = GetTriggerUnit()
    set udg_KniSkillCastedUnit = GetSpellTargetUnit()
    set udg_KniSkillCastPoint = GetUnitLoc(udg_KniSkillCastedUnit)
    set udg_KniSkillPoint = GetUnitLoc(GetTriggerUnit())
    set udg_KniSkillLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_KniSkillCounter = 1
    set udg_KniSkillDist = ( DistanceBetweenPoints(udg_KniSkillCastPoint, udg_KniSkillPoint) / 50.00 )
    set udg_KniSkillGet = false
    call AddSpecialEffectLocBJ( udg_KniSkillPoint, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0I5', udg_SnowCUnit )
    call SetUnitAnimation( udg_SnowCUnit, "attack slam" )
    call PlaySoundOnUnitBJ( gg_snd_NazgrelYes2, 100, GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPathing( udg_SnowCUnit, false )
    call EnableTrigger( gg_trg_KniSkillEffect )
endfunction

// --- InitTrig_KniSkill (family, line 42684) ---
function InitTrig_KniSkill takes nothing returns nothing
    set gg_trg_KniSkill = CreateTrigger(  )
    call DisableTrigger( gg_trg_KniSkill )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KniSkill, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KniSkill, Condition( function Trig_KniSkill_Conditions ) )
    call TriggerAddAction( gg_trg_KniSkill, function Trig_KniSkill_Actions )
endfunction

// === family KniSkillEffect (passive) events=none ===

// --- Trig_KniSkillEffect_Func003Func004Func001C (family, line 42695) ---
function Trig_KniSkillEffect_Func003Func004Func001C takes nothing returns boolean
    if ( not ( GetEnumUnit() == udg_KniSkillCastedUnit ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KniSkillEffect_Func003Func004A (family, line 42702) ---
function Trig_KniSkillEffect_Func003Func004A takes nothing returns nothing
    if ( Trig_KniSkillEffect_Func003Func004Func001C() ) then
        call UnitDamageTargetBJ( udg_SnowCUnit, GetEnumUnit(), ( I2R(( udg_KniSkillLevel * 300 )) + ( I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, udg_SnowCUnit, true) * 3 )) + 0.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(udg_SnowCUnit), udg_KniSkillCastPoint, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call SetUnitScalePercent( GetLastCreatedUnit(), 300.00, 300.00, 300.00 )
        set udg_KniSkillGet = true
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_KniSkillEffect_Func003Func005Func011Func001A (family, line 42714) ---
function Trig_KniSkillEffect_Func003Func005Func011Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_KniSkillEffect_Func003Func005Func014A (family, line 42718) ---
function Trig_KniSkillEffect_Func003Func005Func014A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KniSkillEffect_Func003Func005C (family, line 42723) ---
function Trig_KniSkillEffect_Func003Func005C takes nothing returns boolean
    if ( not ( udg_KniSkillGet == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KniSkillEffect_Func003C (family, line 42730) ---
function Trig_KniSkillEffect_Func003C takes nothing returns boolean
    if ( not ( udg_KniSkillCounter < ( R2I(udg_KniSkillDist) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KniSkillEffect_Actions (family, line 42737) ---
function Trig_KniSkillEffect_Actions takes nothing returns nothing
    set udg_KniSkillCounter = ( udg_KniSkillCounter + 1 )
    if ( Trig_KniSkillEffect_Func003C() ) then
        call SetUnitPositionLoc( udg_SnowCUnit, PolarProjectionBJ(udg_KniSkillPoint, ( 50.00 * I2R(udg_KniSkillCounter) ), AngleBetweenPoints(udg_KniSkillPoint, udg_KniSkillCastPoint)) )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitPositionLoc( udg_SnowCUnit, udg_KniSkillCastPoint )
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_KniSkillCastPoint, 250.00, 250.00)), function Trig_KniSkillEffect_Func003Func004A )
        if ( Trig_KniSkillEffect_Func003Func005C() ) then
            call CreateTextTagUnitBJ( "TRIGSTR_2810", udg_SnowCUnit, 0, 14.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            set bj_forLoopBIndex = 1
            set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped('A0I1', udg_SnowCUnit)
            loop
                exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
                call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_KniSkillCastPoint, 1600.00, 1600.00)), function Trig_KniSkillEffect_Func003Func005Func011Func001A )
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
            call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SnowCUnit), 'o00E'), function Trig_KniSkillEffect_Func003Func005Func014A )
        else
            call CreateTextTagUnitBJ( "TRIGSTR_2831", udg_SnowCUnit, 0, 10.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        endif
        call TriggerSleepAction( 0.10 )
        call UnitRemoveAbilityBJ( 'A0I5', udg_SnowCUnit )
        call SetUnitPathing( udg_SnowCUnit, true )
        call EnableTrigger( gg_trg_KniSkill )
    endif
endfunction

// --- InitTrig_KniSkillEffect (family, line 42782) ---
function InitTrig_KniSkillEffect takes nothing returns nothing
    set gg_trg_KniSkillEffect = CreateTrigger(  )
    call DisableTrigger( gg_trg_KniSkillEffect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_KniSkillEffect, 0.03 )
    call TriggerAddAction( gg_trg_KniSkillEffect, function Trig_KniSkillEffect_Actions )
endfunction
