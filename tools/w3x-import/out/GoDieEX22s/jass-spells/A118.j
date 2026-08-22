// rawcode: A118
// nameZh: 99-02 最初的聲音
// w3a base: AOhw  levels: 4
// cooldown: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0, "5": 13.0, "6": 13.0}
// mana: {"1": 100, "2": 140, "3": 180, "4": 220, "5": 250, "6": 275}
// range: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MikuNo1Effect

// === family MikuNo1Effect (passive) events=none ===

// --- Trig_MikuNo1Effect_Conditions (family, line 54937) ---
function Trig_MikuNo1Effect_Conditions takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_Miku) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuNo1Effect_Func006Func001Func001C (family, line 54944) ---
function Trig_MikuNo1Effect_Func006Func001Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Miku))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuNo1Effect_Func006Func001C (family, line 54951) ---
function Trig_MikuNo1Effect_Func006Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_Miku)) == true ) ) then
        return false
    endif
    if ( not ( GetEnumUnit() != udg_Miku ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MikuNo1Effect_Func006A (family, line 54961) ---
function Trig_MikuNo1Effect_Func006A takes nothing returns nothing
    if ( Trig_MikuNo1Effect_Func006Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_Miku), udg_MikuPoint, bj_UNIT_FACING )
        call RemoveUnitSP( GetLastCreatedUnit() , 2 , 1)
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A11E', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A11E', GetLastCreatedUnit(), udg_MikuCount )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "healingwave", GetEnumUnit() )
    else
        if ( Trig_MikuNo1Effect_Func006Func001Func001C() ) then
            call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_Miku), udg_MikuPoint, bj_UNIT_FACING )
            call RemoveUnitSP( GetLastCreatedUnit() , 2 , 1)
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A11D', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A11D', GetLastCreatedUnit(), udg_MikuCount )
            call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
        else
        endif
    endif
endfunction

// --- Trig_MikuNo1Effect_Actions (family, line 54984) ---
function Trig_MikuNo1Effect_Actions takes nothing returns nothing
    set udg_MikuPoint = GetUnitLoc(udg_Miku)
    set udg_MikuCount = GetUnitAbilityLevelSwapped('A116', udg_Miku)
    set udg_MikuCount1 = GetUnitAbilityLevelSwapped('A118', udg_Miku)
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(375.00, udg_MikuPoint), function Trig_MikuNo1Effect_Func006A )
    call RemoveLocation( udg_MikuPoint )
endfunction

// --- InitTrig_MikuNo1Effect (family, line 54994) ---
function InitTrig_MikuNo1Effect takes nothing returns nothing
    set gg_trg_MikuNo1Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_MikuNo1Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_MikuNo1Effect, 2.00 )
    call TriggerAddCondition( gg_trg_MikuNo1Effect, Condition( function Trig_MikuNo1Effect_Conditions ) )
    call TriggerAddAction( gg_trg_MikuNo1Effect, function Trig_MikuNo1Effect_Actions )
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
