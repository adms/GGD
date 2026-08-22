// rawcode: A0NA
// nameZh: 23-01 電離光槍 - 繁星飛躍
// w3a base: Arsp  levels: 4
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 60, "2": 110, "3": 160, "4": 210}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// area: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightLancer, LightLancerEffect

// === family LightLancer (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightLancer_Conditions (family, line 31063) ---
function Trig_LightLancer_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightLancer_Func005A (family, line 31070) ---
function Trig_LightLancer_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightLancer_Func006A (family, line 31075) ---
function Trig_LightLancer_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightLancer_Actions (family, line 31080) ---
function Trig_LightLancer_Actions takes nothing returns nothing
    set udg_FateUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o026', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), ( 90.00 + GetUnitFacing(GetTriggerUnit()) ) )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'o026'), function Trig_LightLancer_Func005A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'e00F'), function Trig_LightLancer_Func006A )
endfunction

// --- InitTrig_LightLancer (family, line 31090) ---
function InitTrig_LightLancer takes nothing returns nothing
    set gg_trg_LightLancer = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightLancer )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightLancer, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightLancer, Condition( function Trig_LightLancer_Conditions ) )
    call TriggerAddAction( gg_trg_LightLancer, function Trig_LightLancer_Actions )
endfunction

// === family LightLancerEffect (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightLancerEffect_Conditions (family, line 31101) ---
function Trig_LightLancerEffect_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightLancerEffect_Actions (family, line 31108) ---
function Trig_LightLancerEffect_Actions takes nothing returns nothing
    local location LL_P
    local integer LL_Lv
    set LL_P = GetUnitLoc(GetTriggerUnit())
    set LL_Lv = GetUnitAbilityLevelSwapped('A0NA', GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), LL_P, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 5 , 1)
    call RemoveLocation( LL_P )
    set LL_P = GetSpellTargetLoc()
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A112', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A112', GetLastCreatedUnit(), LL_Lv )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "stampede", LL_P )
    call RemoveLocation( LL_P )
endfunction

// --- InitTrig_LightLancerEffect (family, line 31125) ---
function InitTrig_LightLancerEffect takes nothing returns nothing
    set gg_trg_LightLancerEffect = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightLancerEffect )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightLancerEffect, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightLancerEffect, Condition( function Trig_LightLancerEffect_Conditions ) )
    call TriggerAddAction( gg_trg_LightLancerEffect, function Trig_LightLancerEffect_Actions )
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
