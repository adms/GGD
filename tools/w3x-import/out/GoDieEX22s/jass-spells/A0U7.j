// rawcode: A0U7
// nameZh: 45-04 哥哥
// w3a base: Aamk  levels: 3
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightCut, LightCutRun

// === family LightCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightCut_Conditions (family, line 41777) ---
function Trig_LightCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCut_Func024A (family, line 41784) ---
function Trig_LightCut_Func024A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCut_Func025A (family, line 41789) ---
function Trig_LightCut_Func025A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCut_Actions (family, line 41794) ---
function Trig_LightCut_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_ZZ_LC_Caster = GetTriggerUnit()
    set udg_ZZ_LC_Target = GetSpellTargetUnit()
    set udg_ZZ_LC_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_ZZ_LC_P2 = GetUnitLoc(udg_ZZ_LC_Target)
    set udg_ZZ_LC_Damage = I2R(( ( ( GetHeroLevel(GetTriggerUnit()) * 20 ) + ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 200 ) ) + 200 ))
    set udg_ZZ_LC_Dist = ( 45.00 + ( I2R(GetUnitAbilityLevelSwapped('A0U7', GetTriggerUnit())) * 5.00 ) )
    set udg_ZZ_LC_Tolerance = ( 160.00 + ( I2R(GetUnitAbilityLevelSwapped('A0U7', GetTriggerUnit())) * 40.00 ) )
    set udg_ZZ_LC_Get = true
    set udg_ZZ_LC_Count = 0
    call AddSpecialEffectLocBJ( udg_ZZ_LC_P1, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0I5', udg_ZZ_LC_Caster )
    call SetUnitAnimation( udg_ZZ_LC_Caster, "attack slam" )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\Orc\\Purge\\PurgeBuffTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_ZZ_LC_Int = 1
    loop
        exitwhen udg_ZZ_LC_Int > 12
        set udg_ZZ_LC_P3 = PolarProjectionBJ(udg_ZZ_LC_P1, ( I2R(udg_ZZ_LC_Int) * 12.00 ), ( I2R(udg_ZZ_LC_Int) * 30.00 ))
        call CreateNUnitsAtLoc( 1, 'n00N', GetOwningPlayer(GetTriggerUnit()), udg_ZZ_LC_P3, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call RemoveLocation( udg_ZZ_LC_P3 )
        set udg_ZZ_LC_Int = udg_ZZ_LC_Int + 1
    endloop
    call RemoveLocation( udg_ZZ_LC_P1 )
    call TriggerSleepAction( 0.20 )
    call SetUnitPathing( udg_ZZ_LC_Caster, false )
    call EnableTrigger( gg_trg_LightCutRun )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'n00N'), function Trig_LightCut_Func024A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'o022'), function Trig_LightCut_Func025A )
endfunction

// --- InitTrig_LightCut (family, line 41830) ---
function InitTrig_LightCut takes nothing returns nothing
    set gg_trg_LightCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightCut, Condition( function Trig_LightCut_Conditions ) )
    call TriggerAddAction( gg_trg_LightCut, function Trig_LightCut_Actions )
endfunction

// === family LightCutRun (passive) events=none ===

// --- Trig_LightCutRun_Func006Func002C (family, line 41845) ---
function Trig_LightCutRun_Func006Func002C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_ZZ_LC_P2, udg_ZZ_LC_P3) > udg_ZZ_LC_Tolerance ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Func006C (family, line 41852) ---
function Trig_LightCutRun_Func006C takes nothing returns boolean
    if ( not ( udg_ZZ_LC_Get == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Func008Func003Func002Func014A (family, line 41859) ---
function Trig_LightCutRun_Func008Func003Func002Func014A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_LightCutRun_Func008Func003Func002C (family, line 41863) ---
function Trig_LightCutRun_Func008Func003Func002C takes nothing returns boolean
    if ( not ( udg_ZZ_LC_Get == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Func008Func003Func003C (family, line 41870) ---
function Trig_LightCutRun_Func008Func003Func003C takes nothing returns boolean
    if ( not ( udg_ZZ_LC_Get == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Func008Func003Func004Func001C (family, line 41877) ---
function Trig_LightCutRun_Func008Func003Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_ZZ_LC_Caster)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Func008Func003Func004A (family, line 41890) ---
function Trig_LightCutRun_Func008Func003Func004A takes nothing returns nothing
    if ( Trig_LightCutRun_Func008Func003Func004Func001C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_ZZ_LC_Caster, GetEnumUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_ZZ_LC_Caster, true) * ( GetUnitAbilityLevelSwapped('A0U7', udg_ZZ_LC_Caster) * 2 ) )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_LightCutRun_Func008Func003Func016A (family, line 41899) ---
function Trig_LightCutRun_Func008Func003Func016A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_LightCutRun_Func008Func003C (family, line 41903) ---
function Trig_LightCutRun_Func008Func003C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0U7', udg_ZZ_LC_Caster) > 0 ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(udg_ZZ_LC_Target, 'B03W') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Func008Func023A (family, line 41913) ---
function Trig_LightCutRun_Func008Func023A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCutRun_Func008Func025A (family, line 41918) ---
function Trig_LightCutRun_Func008Func025A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCutRun_Func008Func026A (family, line 41923) ---
function Trig_LightCutRun_Func008Func026A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCutRun_Func008Func028A (family, line 41928) ---
function Trig_LightCutRun_Func008Func028A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCutRun_Func008C (family, line 41933) ---
function Trig_LightCutRun_Func008C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_ZZ_LC_P1, udg_ZZ_LC_P4) > 100.00 ) ) then
        return false
    endif
    if ( not ( udg_ZZ_LC_Count < 100 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCutRun_Actions (family, line 41943) ---
function Trig_LightCutRun_Actions takes nothing returns nothing
    set udg_ZZ_LC_Count = ( udg_ZZ_LC_Count + 1 )
    set udg_ZZ_LC_P1 = GetUnitLoc(udg_ZZ_LC_Caster)
    call AddSpecialEffectLocBJ( udg_ZZ_LC_P1, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_ZZ_LC_P3 = GetUnitLoc(udg_ZZ_LC_Target)
    if ( Trig_LightCutRun_Func006C() ) then
        if ( Trig_LightCutRun_Func006Func002C() ) then
            set udg_ZZ_LC_Get = false
            call RemoveLocation( udg_ZZ_LC_P4 )
            set udg_ZZ_LC_P4 = PolarProjectionBJ(udg_ZZ_LC_P2, udg_ZZ_LC_Tolerance, AngleBetweenPoints(udg_ZZ_LC_P2, udg_ZZ_LC_P3))
        else
            call RemoveLocation( udg_ZZ_LC_P4 )
            set udg_ZZ_LC_P4 = GetUnitLoc(udg_ZZ_LC_Target)
        endif
    else
    endif
    call RemoveLocation( udg_ZZ_LC_P3 )
    if ( Trig_LightCutRun_Func008C() ) then
        set udg_ZZ_LC_P3 = PolarProjectionBJ(udg_ZZ_LC_P1, udg_ZZ_LC_Dist, AngleBetweenPoints(udg_ZZ_LC_P1, udg_ZZ_LC_P4))
        call SetUnitPositionLoc( udg_ZZ_LC_Caster, udg_ZZ_LC_P3 )
        call PlaySoundOnUnitBJ( gg_snd_ThunderBoltMissileDeath, 100.00, udg_ZZ_LC_Caster )
        call RemoveLocation( udg_ZZ_LC_P1 )
        call RemoveLocation( udg_ZZ_LC_P3 )
    else
        call DisableTrigger( GetTriggeringTrigger() )
        if ( Trig_LightCutRun_Func008Func003C() ) then
            if ( Trig_LightCutRun_Func008Func003Func003C() ) then
                call UnitDamageTargetBJ( udg_ZZ_LC_Caster, udg_ZZ_LC_Target, udg_ZZ_LC_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            else
            endif
            call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, udg_ZZ_LC_P1), function Trig_LightCutRun_Func008Func003Func004A )
            set bj_forLoopAIndex = 1
            set bj_forLoopAIndexEnd = 5
            loop
                exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
                call CreateNUnitsAtLoc( 1, 'h02O', GetOwningPlayer(udg_ZZ_LC_Caster), udg_ZZ_LC_P4, GetRandomDirectionDeg() )
                set udg_ZZ_KL_Unit1[GetForLoopIndexA()] = GetLastCreatedUnit()
                call CreateNUnitsAtLoc( 1, 'h02P', GetOwningPlayer(udg_ZZ_LC_Caster), GetRandomLocInRect(RectFromCenterSizeBJ(udg_ZZ_LC_P4, 300.00, 300.00)), bj_UNIT_FACING )
                set udg_ZZ_KL_Unit2[GetForLoopIndexA()] = GetLastCreatedUnit()
                set bj_forLoopAIndex = bj_forLoopAIndex + 1
            endloop
            call EnableTrigger( gg_trg_Kylin )
            call EnableTrigger( gg_trg_Kylin2 )
            call TerrainDeformationRippleBJ( 4, true, udg_ZZ_LC_P1, 512.00, 1024, 256.00, 1, 512 )
            call AddSpecialEffectLocBJ( udg_ZZ_LC_P1, "Abilities\\Spells\\Other\\Monsoon\\MonsoonRain.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call CreateTextTagUnitBJ( "TRIGSTR_2622", udg_ZZ_LC_Caster, 0, 20.00, 100.00, 100.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_ZZ_LC_P4, 1600.00, 1600.00)), function Trig_LightCutRun_Func008Func003Func016A )
        else
            if ( Trig_LightCutRun_Func008Func003Func002C() ) then
                call UnitDamageTargetBJ( udg_ZZ_LC_Caster, udg_ZZ_LC_Target, udg_ZZ_LC_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
                call CreateNUnitsAtLoc( 1, 'o006', GetOwningPlayer(udg_ZZ_LC_Caster), udg_ZZ_LC_P1, bj_UNIT_FACING )
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call CreateTextTagUnitBJ( "TRIGSTR_2624", udg_ZZ_LC_Caster, 0, 14.00, 100, 0.00, 0.00, 0 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
                call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_ZZ_LC_P4, 1600.00, 1600.00)), function Trig_LightCutRun_Func008Func003Func002Func014A )
            else
                call CreateTextTagUnitBJ( "TRIGSTR_2623", udg_ZZ_LC_Caster, 0, 10.00, 100, 0.00, 0.00, 0 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            endif
        endif
        call RemoveLocation( udg_ZZ_LC_P1 )
        call RemoveLocation( udg_ZZ_LC_P2 )
        call RemoveLocation( udg_ZZ_LC_P3 )
        call RemoveLocation( udg_ZZ_LC_P4 )
        set udg_ZZ_LC_Get = false
        call TriggerSleepAction( 0.10 )
        call UnitRemoveAbilityBJ( 'A0I5', udg_ZZ_LC_Caster )
        call SetUnitPathing( udg_ZZ_LC_Caster, true )
        call EnableTrigger( gg_trg_LightCut )
        call TriggerSleepAction( 2.00 )
        call DisableTrigger( gg_trg_Kylin )
        call DisableTrigger( gg_trg_Kylin2 )
        set bj_forLoopBIndex = 1
        set bj_forLoopBIndexEnd = 12
        loop
            exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
            call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
            set bj_forLoopBIndex = bj_forLoopBIndex + 1
        endloop
        call TriggerSleepAction( 2.00 )
        call DisableTrigger( gg_trg_Kylin )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'hfoo'), function Trig_LightCutRun_Func008Func023A )
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'h02O'), function Trig_LightCutRun_Func008Func025A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'h02Q'), function Trig_LightCutRun_Func008Func026A )
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'o006'), function Trig_LightCutRun_Func008Func028A )
    endif
endfunction

// --- InitTrig_LightCutRun (family, line 42046) ---
function InitTrig_LightCutRun takes nothing returns nothing
    set gg_trg_LightCutRun = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightCutRun )
    call TriggerRegisterTimerEventPeriodic( gg_trg_LightCutRun, 0.03 )
    call TriggerAddAction( gg_trg_LightCutRun, function Trig_LightCutRun_Actions )
endfunction
