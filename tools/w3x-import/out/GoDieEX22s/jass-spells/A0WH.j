// rawcode: A0WH
// nameZh: 93-02 抽點名
// w3a base: Asth  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: attendance, attendance_effect

// === family attendance (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_attendance_Conditions (family, line 53553) ---
function Trig_attendance_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ekee' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_attendance_Func002C (family, line 53560) ---
function Trig_attendance_Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0WH', udg_Professor) >= 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_attendance_Func003C (family, line 53567) ---
function Trig_attendance_Func003C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0WH', udg_Professor) >= 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_attendance_Actions (family, line 53574) ---
function Trig_attendance_Actions takes nothing returns nothing
    call StartTimerBJ( udg_Pro_att_timer, true, ( 17.00 - ( 2.00 * I2R(GetUnitAbilityLevelSwapped('A0WH', GetTriggerUnit())) ) ) )
    if ( Trig_attendance_Func002C() ) then
        call EnableTrigger( gg_trg_attendance_effect )
    else
    endif
    if ( Trig_attendance_Func003C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
    endif
endfunction

// --- InitTrig_attendance (family, line 53587) ---
function InitTrig_attendance takes nothing returns nothing
    set gg_trg_attendance = CreateTrigger(  )
    call DisableTrigger( gg_trg_attendance )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_attendance, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_attendance, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_attendance, Condition( function Trig_attendance_Conditions ) )
    call TriggerAddAction( gg_trg_attendance, function Trig_attendance_Actions )
endfunction

// === family attendance_effect (passive) events=none ===

// --- Trig_attendance_effect_Conditions (family, line 53599) ---
function Trig_attendance_effect_Conditions takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_Professor) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_attendance_effect_Func004Func001C (family, line 53606) ---
function Trig_attendance_effect_Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Professor)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( udg_ProJudge == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_attendance_effect_Func004A (family, line 53622) ---
function Trig_attendance_effect_Func004A takes nothing returns nothing
    if ( Trig_attendance_effect_Func004Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_Professor), udg_Pro_P2, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0WI', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0WI', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0WH', udg_Professor) )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "thunderbolt", GetEnumUnit() )
        set udg_ProJudge = true
        return
    else
    endif
endfunction

// --- Trig_attendance_effect_Func007A (family, line 53637) ---
function Trig_attendance_effect_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_attendance_effect_Actions (family, line 53642) ---
function Trig_attendance_effect_Actions takes nothing returns nothing
    set udg_Pro_P2 = GetUnitLoc(udg_Professor)
    set udg_ProJudge = false
    call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, udg_Pro_P2), function Trig_attendance_effect_Func004A )
    call RemoveLocation( udg_Pro_P2)
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Professor), 'hfoo'), function Trig_attendance_effect_Func007A )
endfunction

// --- InitTrig_attendance_effect (family, line 53652) ---
function InitTrig_attendance_effect takes nothing returns nothing
    set gg_trg_attendance_effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_attendance_effect )
    call TriggerRegisterTimerExpireEventBJ( gg_trg_attendance_effect, udg_Pro_att_timer )
    call TriggerAddCondition( gg_trg_attendance_effect, Condition( function Trig_attendance_effect_Conditions ) )
    call TriggerAddAction( gg_trg_attendance_effect, function Trig_attendance_effect_Actions )
endfunction
