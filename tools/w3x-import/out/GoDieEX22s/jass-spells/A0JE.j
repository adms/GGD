// rawcode: A0JE
// nameZh: 77-04 真-雷光劍
// w3a base: ACmo  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 10.0}
// mana: {"1": 210, "2": 285, "3": 360, "4": 10}
// range: {"1": 700.0, "2": 700.0, "3": 700.0, "4": 500.0}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// duration: {"1": 4.0, "2": 4.0, "3": 4.0, "4": 6.199999809265137}
// hero_duration: {"1": 4.0, "2": 4.0, "3": 4.0, "4": 6.199999809265137}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Light_Fight, Light_Final, Light_Final_Dam, Light_Judg

// === family Light_Fight (active) events=EVENT_PLAYER_UNIT_SPELL_ENDCAST ===

// --- Trig_Light_Fight_Conditions (family, line 49494) ---
function Trig_Light_Fight_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Func003Func010C (family, line 49501) ---
function Trig_Light_Fight_Func003Func010C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_Inshou) == 'E00X' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Func003Func011Func001Func002C (family, line 49508) ---
function Trig_Light_Fight_Func003Func011Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_Inshou)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_MAGIC_IMMUNE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Func003Func011Func001C (family, line 49521) ---
function Trig_Light_Fight_Func003Func011Func001C takes nothing returns boolean
    if ( not Trig_Light_Fight_Func003Func011Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Func003Func011A (family, line 49528) ---
function Trig_Light_Fight_Func003Func011A takes nothing returns nothing
    if ( Trig_Light_Fight_Func003Func011Func001C() ) then
        call UnitDamageTargetBJ( udg_Inshou, GetEnumUnit(), udg_InshouLightFinalDam, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_Light_Fight_Func003Func012Func001Func002C (family, line 49535) ---
function Trig_Light_Fight_Func003Func012Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_Inshou)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_MAGIC_IMMUNE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Func003Func012Func001C (family, line 49548) ---
function Trig_Light_Fight_Func003Func012Func001C takes nothing returns boolean
    if ( not Trig_Light_Fight_Func003Func012Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Func003Func012A (family, line 49555) ---
function Trig_Light_Fight_Func003Func012A takes nothing returns nothing
    if ( Trig_Light_Fight_Func003Func012Func001C() ) then
        call UnitDamageTargetBJ( udg_Inshou, GetEnumUnit(), ( 5.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Inshou, true)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_Light_Fight_Func003C (family, line 49562) ---
function Trig_Light_Fight_Func003C takes nothing returns boolean
    if ( not ( udg_Inshoudef == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Fight_Actions (family, line 49569) ---
function Trig_Light_Fight_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.10 )
    if ( Trig_Light_Fight_Func003C() ) then
        set udg_InshouLightBool = false
        call PlaySoundOnUnitBJ( gg_snd_GoldMineDeath1, 100.00, GetTriggerUnit() )
        call CreateNUnitsAtLoc( 1, 'o01F', GetOwningPlayer(udg_Inshou), udg_InshouLightCast, bj_UNIT_FACING )
        set udg_InshouCreateUnit[1] = GetLastCreatedUnit()
        call CreateNUnitsAtLoc( 1, 'o01E', GetOwningPlayer(udg_Inshou), udg_InshouLightCast, bj_UNIT_FACING )
        set udg_InshouCreateUnit[2] = GetLastCreatedUnit()
        call SetUnitVertexColorBJ( udg_InshouCreateUnit[2], 50.00, 50.00, 100, 50.00 )
        call TerrainDeformationRippleBJ( 2.00, false, udg_InshouLightCast, 500.00, 500.00, 200.00, 0.25, 200.00 )
        if ( Trig_Light_Fight_Func003Func010C() ) then
            set udg_InshouLightFinalDam = ( udg_InshouLightFinalDam + ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Inshou, true)) * 3.00 ) )
        else
            call DoNothing(  )
        endif
        call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_InshouLightCast), function Trig_Light_Fight_Func003Func011A )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(100.00, udg_InshouLightCast), function Trig_Light_Fight_Func003Func012A )
        call SetUnitPositionLoc( udg_Inshou, udg_InshouLightCast )
        set udg_Inshoudef = false
        call TriggerSleepAction( 2.00 )
        call KillUnit( udg_InshouCreateUnit[1] )
        call RemoveUnit( udg_InshouCreateUnit[1] )
        call KillUnit( udg_InshouCreateUnit[2] )
        call RemoveUnit( udg_InshouCreateUnit[2] )
        set udg_InshouLightBool = true
        set udg_InshouCreateNum = 0
    else
    endif
endfunction

// --- InitTrig_Light_Fight (family, line 49601) ---
function InitTrig_Light_Fight takes nothing returns nothing
    set gg_trg_Light_Fight = CreateTrigger(  )
    call DisableTrigger( gg_trg_Light_Fight )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light_Fight, EVENT_PLAYER_UNIT_SPELL_ENDCAST )
    call TriggerAddCondition( gg_trg_Light_Fight, Condition( function Trig_Light_Fight_Conditions ) )
    call TriggerAddAction( gg_trg_Light_Fight, function Trig_Light_Fight_Actions )
endfunction

// === family Light_Final (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Light_Final_Conditions (family, line 49404) ---
function Trig_Light_Final_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Final_Func003C (family, line 49411) ---
function Trig_Light_Final_Func003C takes nothing returns boolean
    if ( not ( udg_InshouLightBool == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Final_Actions (family, line 49418) ---
function Trig_Light_Final_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.01 )
    if ( Trig_Light_Final_Func003C() ) then
        set udg_Inshoudef = true
        set udg_InshouCastPoint = PolarProjectionBJ(GetUnitLoc(udg_Inshou), GetRandomReal(350.00, 550.00), GetRandomDirectionDeg())
        call CreateNUnitsAtLoc( 1, 'h01E', GetOwningPlayer(udg_Inshou), udg_InshouCastPoint, bj_UNIT_FACING )
        set udg_InshouCreateUnit[udg_InshouCreateNum] = GetLastCreatedUnit()
        call SetUnitFlyHeightBJ( udg_InshouCreateUnit[udg_InshouCreateNum], GetRandomReal(0.00, 500.00), 5000.00 )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', udg_InshouCreateUnit[udg_InshouCreateNum] )
        call CreateNUnitsAtLoc( 1, 'h01D', GetOwningPlayer(udg_Inshou), GetUnitLoc(udg_Inshou), bj_UNIT_FACING )
        set udg_InshouCreateUnit[0] = GetLastCreatedUnit()
        call IssueTargetOrderBJ( udg_InshouCreateUnit[udg_InshouCreateNum], "chainlightning", udg_InshouCreateUnit[0] )
        set udg_InshouforB = 1
        loop
            exitwhen udg_InshouforB > 2
            call AddSpecialEffectLocBJ( PolarProjectionBJ(GetUnitLoc(udg_Inshou), GetRandomReal(100.00, 400.00), GetRandomDirectionDeg()), "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            set udg_InshouforB = udg_InshouforB + 1
        endloop
    else
        return
    endif
    call PolledWait( 0.05 )
    set udg_InshouCreateNum = ( udg_InshouCreateNum + 1 )
    call TriggerExecute( GetTriggeringTrigger() )
endfunction

// --- InitTrig_Light_Final (family, line 49446) ---
function InitTrig_Light_Final takes nothing returns nothing
    set gg_trg_Light_Final = CreateTrigger(  )
    call DisableTrigger( gg_trg_Light_Final )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light_Final, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Light_Final, Condition( function Trig_Light_Final_Conditions ) )
    call TriggerAddAction( gg_trg_Light_Final, function Trig_Light_Final_Actions )
endfunction

// === family Light_Final_Dam (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Light_Final_Dam_Conditions (family, line 49457) ---
function Trig_Light_Final_Dam_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Final_Dam_Func003C (family, line 49464) ---
function Trig_Light_Final_Dam_Func003C takes nothing returns boolean
    if ( not ( udg_InshouLightBool == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Final_Dam_Actions (family, line 49471) ---
function Trig_Light_Final_Dam_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.01 )
    if ( Trig_Light_Final_Dam_Func003C() ) then
        call TriggerSleepAction( 1.00 )
        set udg_InshouLightFinalDam = ( udg_InshouLightFinalDam + ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Inshou, true)) * 4.00 ) )
    else
        return
    endif
    call TriggerExecute( GetTriggeringTrigger() )
endfunction

// --- InitTrig_Light_Final_Dam (family, line 49483) ---
function InitTrig_Light_Final_Dam takes nothing returns nothing
    set gg_trg_Light_Final_Dam = CreateTrigger(  )
    call DisableTrigger( gg_trg_Light_Final_Dam )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light_Final_Dam, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Light_Final_Dam, Condition( function Trig_Light_Final_Dam_Conditions ) )
    call TriggerAddAction( gg_trg_Light_Final_Dam, function Trig_Light_Final_Dam_Actions )
endfunction

// === family Light_Judg (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Light_Judg_Conditions (family, line 49379) ---
function Trig_Light_Judg_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Judg_Actions (family, line 49386) ---
function Trig_Light_Judg_Actions takes nothing returns nothing
    set udg_Inshou = GetTriggerUnit()
    set udg_InshouLightCast = GetSpellTargetLoc()
    set udg_InshouLightFinalDam = I2R(( ( 250 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + 250 ))
endfunction

// --- InitTrig_Light_Judg (family, line 49393) ---
function InitTrig_Light_Judg takes nothing returns nothing
    set gg_trg_Light_Judg = CreateTrigger(  )
    call DisableTrigger( gg_trg_Light_Judg )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light_Judg, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Light_Judg, Condition( function Trig_Light_Judg_Conditions ) )
    call TriggerAddAction( gg_trg_Light_Judg, function Trig_Light_Judg_Actions )
endfunction
