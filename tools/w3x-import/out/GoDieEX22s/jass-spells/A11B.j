// rawcode: A11B
// nameZh: 99-03 初音未來的消失
// w3a base: ACtc  levels: 4
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 175, "2": 255, "3": 335, "4": 415}
// area: {"1": 0.0}
// duration: {"1": 0.0}
// hero_duration: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MikuDisappear

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
