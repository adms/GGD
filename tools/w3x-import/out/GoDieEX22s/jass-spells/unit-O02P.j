// unit rawcode: O02P
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Miku, MikuDisappear, MikuEX, MikuNo1

// === family Open_Skill_of_Miku (armed) events=none ===

// --- Trig_Open_Skill_of_Miku_Conditions (family, line 54773) ---
function Trig_Open_Skill_of_Miku_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02P' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Miku_Actions (family, line 54780) ---
function Trig_Open_Skill_of_Miku_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_Miku = GetEnteringUnit()
    call EnableTrigger( gg_trg_MikuDisappear )
    call EnableTrigger( gg_trg_MikuNo1 )
    call EnableTrigger( gg_trg_MikuEX )
    set bj_forLoopAIndex = 2
    set bj_forLoopAIndexEnd = 6
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        set udg_MikuPlayersUnitReal[GetForLoopIndexA()] = 0.00
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    set bj_forLoopAIndex = 8
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        set udg_MikuPlayersUnitReal[GetForLoopIndexA()] = 0.00
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "初音：你掉的是這支七星蔥還是這支韓國大蔥?" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Miku (family, line 54805) ---
function InitTrig_Open_Skill_of_Miku takes nothing returns nothing
    set gg_trg_Open_Skill_of_Miku = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Miku, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Miku, Condition( function Trig_Open_Skill_of_Miku_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Miku, function Trig_Open_Skill_of_Miku_Actions )
endfunction

// === family MikuDisappear (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MikuDisappear_Conditions (family, line 54815) ---
function Trig_MikuDisappear_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A11B' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuDisappear_Func003C (family, line 54822) ---
function Trig_MikuDisappear_Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuDisappear_Func007A (family, line 54829) ---
function Trig_MikuDisappear_Func007A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_MikuPoint, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 2 , 1)
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A11A', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A11A', GetLastCreatedUnit(), udg_MikuCount )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "innerfire", GetEnumUnit() )
endfunction

// --- Trig_MikuDisappear_Actions (family, line 54839) ---
function Trig_MikuDisappear_Actions takes nothing returns nothing
    if ( Trig_MikuDisappear_Func003C() ) then
        set bj_forLoopAIndex = 2
        set bj_forLoopAIndexEnd = 6
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            set udg_MikuPlayersUnitReal[GetForLoopIndexA()] = ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 6.00 )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
        set bj_forLoopAIndex = 8
        set bj_forLoopAIndexEnd = 12
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            set udg_MikuPlayersUnitReal[GetForLoopIndexA()] = ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 6.00 )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
    else
    endif
    set udg_MikuPoint = GetUnitLoc(GetTriggerUnit())
    set udg_MikuCount = GetUnitAbilityLevelSwapped('A11B', GetTriggerUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(750.00, udg_MikuPoint), function Trig_MikuDisappear_Func007A )
    call RemoveLocation( udg_MikuPoint )
endfunction

// --- InitTrig_MikuDisappear (family, line 54865) ---
function InitTrig_MikuDisappear takes nothing returns nothing
    set gg_trg_MikuDisappear = CreateTrigger(  )
    call DisableTrigger( gg_trg_MikuDisappear )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MikuDisappear, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MikuDisappear, Condition( function Trig_MikuDisappear_Conditions ) )
    call TriggerAddAction( gg_trg_MikuDisappear, function Trig_MikuDisappear_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction

// === family MikuEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MikuEX_Conditions (family, line 55005) ---
function Trig_MikuEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A11F' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuEX_Actions (family, line 55012) ---
function Trig_MikuEX_Actions takes nothing returns nothing
    call SetUnitLifePercentBJ( GetSpellTargetUnit(), 100 )
    call SetUnitManaPercentBJ( GetSpellTargetUnit(), 100 )
endfunction

// --- InitTrig_MikuEX (family, line 55018) ---
function InitTrig_MikuEX takes nothing returns nothing
    set gg_trg_MikuEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_MikuEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MikuEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MikuEX, Condition( function Trig_MikuEX_Conditions ) )
    call TriggerAddAction( gg_trg_MikuEX, function Trig_MikuEX_Actions )
endfunction

// === family MikuNo1 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MikuNo1_Conditions (family, line 54912) ---
function Trig_MikuNo1_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A11C' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuNo1_Actions (family, line 54919) ---
function Trig_MikuNo1_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_MikuNo1Effect )
    call TriggerSleepAction( ( 2.00 + ( 2.00 * I2R(GetUnitAbilityLevelSwapped('A11C', udg_Miku)) ) ) )
    call DisableTrigger( gg_trg_MikuNo1Effect )
endfunction

// --- InitTrig_MikuNo1 (family, line 54926) ---
function InitTrig_MikuNo1 takes nothing returns nothing
    set gg_trg_MikuNo1 = CreateTrigger(  )
    call DisableTrigger( gg_trg_MikuNo1 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MikuNo1, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MikuNo1, Condition( function Trig_MikuNo1_Conditions ) )
    call TriggerAddAction( gg_trg_MikuNo1, function Trig_MikuNo1_Actions )
endfunction
