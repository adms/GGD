// rawcode: A0WK
// nameZh: 93-00 小考
// cooldown: {"2": 60.0, "3": 60.0}
// mana: {"1": 300, "2": 500, "3": 700}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: quiz

// === family quiz (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_quiz_Conditions (family, line 53461) ---
function Trig_quiz_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0WK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_quiz_Func008Func001C (family, line 53468) ---
function Trig_quiz_Func008Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Professor)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_quiz_Func008A (family, line 53481) ---
function Trig_quiz_Func008A takes nothing returns nothing
    if ( Trig_quiz_Func008Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_Pro_quiz_group )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call UnitAddAbilityBJ( 'A0WL', GetLastCreatedUnit() )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "faeriefire", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_quiz_Func010Func004Func002C (family, line 53491) ---
function Trig_quiz_Func010Func004Func002C takes nothing returns boolean
    if ( not ( udg_ProTestDis < 600.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_quiz_Func010Func004C (family, line 53498) ---
function Trig_quiz_Func010Func004C takes nothing returns boolean
    if ( not ( udg_ProTestDis > 0.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_quiz_Func010A (family, line 53505) ---
function Trig_quiz_Func010A takes nothing returns nothing
    set udg_Pro_P2 = GetUnitLoc(GetEnumUnit())
    set udg_ProTestDis = DistanceBetweenPoints(udg_Pro_P1, udg_Pro_P2)
    set udg_ProTestDis = ( udg_ProTestDis - 500.00 )
    if ( Trig_quiz_Func010Func004C() ) then
        call AddSpecialEffectLocBJ( udg_Pro_P2, "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
        if ( Trig_quiz_Func010Func004Func002C() ) then
            call UnitDamageTargetBJ( udg_Professor, GetEnumUnit(), udg_ProTestDis, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( udg_Professor, GetEnumUnit(), 600.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
    else
    endif
    call RemoveLocation( udg_Pro_P2)
endfunction

// --- Trig_quiz_Func012A (family, line 53521) ---
function Trig_quiz_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_quiz_Actions (family, line 53526) ---
function Trig_quiz_Actions takes nothing returns nothing
    set udg_Pro_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'osp1', GetOwningPlayer(GetTriggerUnit()), udg_Pro_P1, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 5.00, 'BTLF', GetLastCreatedUnit() )
    call GroupClear( udg_Pro_quiz_group )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Pro_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(512, udg_Pro_P1), function Trig_quiz_Func008A )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( udg_Pro_quiz_group, function Trig_quiz_Func010A )
    call RemoveLocation( udg_Pro_P1)
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Professor), 'osp1'), function Trig_quiz_Func012A )
endfunction

// --- InitTrig_quiz (family, line 53542) ---
function InitTrig_quiz takes nothing returns nothing
    set gg_trg_quiz = CreateTrigger(  )
    call DisableTrigger( gg_trg_quiz )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_quiz, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_quiz, Condition( function Trig_quiz_Conditions ) )
    call TriggerAddAction( gg_trg_quiz, function Trig_quiz_Actions )
endfunction
