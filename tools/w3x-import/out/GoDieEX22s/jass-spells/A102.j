// rawcode: A102
// nameZh: 45-002 天照
// w3a base: AOws  levels: 1
// cooldown: {"1": 60.0}
// mana: {"1": 444}
// area: {"1": 1.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ImbaEye

// === family ImbaEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ImbaEye_Conditions (family, line 42186) ---
function Trig_ImbaEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A102' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ImbaEye_Func004Func001C (family, line 42193) ---
function Trig_ImbaEye_Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ImbaEye_Func004A (family, line 42200) ---
function Trig_ImbaEye_Func004A takes nothing returns nothing
    if ( Trig_ImbaEye_Func004Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_ChoChuUnit), udg_ZZ_ImbaEyePoint, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call RemoveUnitSP( GetLastCreatedUnit() , 10 , 1)
        call UnitAddAbilityBJ( 'A100', GetLastCreatedUnit() )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "soulburn", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_ImbaEye_Actions (family, line 42211) ---
function Trig_ImbaEye_Actions takes nothing returns nothing
    set udg_ZZ_ImbaEyePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h030', GetOwningPlayer(GetTriggerUnit()), udg_ZZ_ImbaEyePoint, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 2 , 1)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_ZZ_ImbaEyePoint), function Trig_ImbaEye_Func004A )
    call RemoveLocation(udg_ZZ_ImbaEyePoint)
endfunction

// --- InitTrig_ImbaEye (family, line 42220) ---
function InitTrig_ImbaEye takes nothing returns nothing
    set gg_trg_ImbaEye = CreateTrigger(  )
    call DisableTrigger( gg_trg_ImbaEye )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ImbaEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ImbaEye, Condition( function Trig_ImbaEye_Conditions ) )
    call TriggerAddAction( gg_trg_ImbaEye, function Trig_ImbaEye_Actions )
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
