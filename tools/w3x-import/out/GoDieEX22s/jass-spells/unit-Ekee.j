// unit rawcode: Ekee
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_professor, TestsoEasy, attendance, flunkOut, quiz, attendance_effect

// === family Open_Skill_of_professor (armed) events=none ===

// --- Trig_Open_Skill_of_professor_Conditions (family, line 53432) ---
function Trig_Open_Skill_of_professor_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ekee' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_professor_Actions (family, line 53439) ---
function Trig_Open_Skill_of_professor_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    set udg_Professor = GetTriggerUnit()
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_attendance )
    call EnableTrigger( gg_trg_TestsoEasy )
    call EnableTrigger( gg_trg_flunkOut )
    call EnableTrigger( gg_trg_quiz )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "叫獸: 開始上課了，把後門鎖起來" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_professor (family, line 53451) ---
function InitTrig_Open_Skill_of_professor takes nothing returns nothing
    set gg_trg_Open_Skill_of_professor = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_professor, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_professor, Condition( function Trig_Open_Skill_of_professor_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_professor, function Trig_Open_Skill_of_professor_Actions )
endfunction

// === family TestsoEasy (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_TestsoEasy_Conditions (family, line 53663) ---
function Trig_TestsoEasy_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TestsoEasy_Func001C (family, line 53670) ---
function Trig_TestsoEasy_Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetSpellTargetUnit(), udg_Des_Group) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetSpellTargetUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitIllusionBJ(GetSpellTargetUnit()) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TestsoEasy_Actions (family, line 53683) ---
function Trig_TestsoEasy_Actions takes nothing returns nothing
    if ( Trig_TestsoEasy_Func001C() ) then
        call GroupAddUnitSimple( GetSpellTargetUnit(), udg_Des_Group )
        call InitSetup( GetSpellTargetUnit() )
    else
    endif
endfunction

// --- InitTrig_TestsoEasy (family, line 53692) ---
function InitTrig_TestsoEasy takes nothing returns nothing
    set gg_trg_TestsoEasy = CreateTrigger(  )
    call DisableTrigger( gg_trg_TestsoEasy )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TestsoEasy, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_TestsoEasy, Condition( function Trig_TestsoEasy_Conditions ) )
    call TriggerAddAction( gg_trg_TestsoEasy, function Trig_TestsoEasy_Actions )
endfunction

// --- InitSetup (helper, line 4958) ---
function InitSetup takes unit DesUnit returns nothing
    local trigger Tri
    local triggeraction TriAct 
    
    set Tri = CreateTrigger()
    set TriAct = TriggerAddAction( Tri , function DamageLink )

    call TriggerRegisterUnitEvent( Tri , DesUnit , EVENT_UNIT_DAMAGED )

    call SetHandleTrigger(  DesUnit , "DTri" , Tri    )
    // 傷害的觸發
    call SetHandleTriggerAction(  DesUnit , "DAct" , TriAct )
    // 傷害的動作

    set Tri = null
    set TriAct = null
    set DesUnit = null
endfunction

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

// === family flunkOut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_flunkOut_Conditions (family, line 53733) ---
function Trig_flunkOut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0WN' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_flunkOut_Actions (family, line 53740) ---
function Trig_flunkOut_Actions takes nothing returns nothing
    set udg_Pro_FO_target = GetSpellTargetUnit()
    call EnableTrigger( gg_trg_flunkOutEff )
    call StartTimerBJ( udg_Pro_FO_timer, true, 0.10 )
endfunction

// --- InitTrig_flunkOut (family, line 53747) ---
function InitTrig_flunkOut takes nothing returns nothing
    set gg_trg_flunkOut = CreateTrigger(  )
    call DisableTrigger( gg_trg_flunkOut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_flunkOut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_flunkOut, Condition( function Trig_flunkOut_Conditions ) )
    call TriggerAddAction( gg_trg_flunkOut, function Trig_flunkOut_Actions )
endfunction

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
