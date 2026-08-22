// rawcode: AEtq
// nameZh: 13-03 快步
// w3a base: AEtq  levels: 4
// cooldown: {"1": 45.0, "2": 40.0, "3": 35.0, "4": 30.0}
// mana: {"1": 80, "2": 120, "3": 160, "4": 200}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: fastStep

// === family fastStep (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_fastStep_Conditions (family, line 45007) ---
function Trig_fastStep_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AEtq' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fastStep_Func007A (family, line 45014) ---
function Trig_fastStep_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_fastStep_Actions (family, line 45019) ---
function Trig_fastStep_Actions takes nothing returns nothing
    set udg_AFuUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A050', udg_AFuUnit )
    call EnableTrigger( gg_trg_fastStepGo )
    call TriggerSleepAction( ( 1 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_AFuUnit)) * 2.00 ) ) )
    call DisableTrigger( gg_trg_fastStepGo )
    call UnitRemoveAbilityBJ( 'A050', udg_AFuUnit )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_AFuUnit), 'o011'), function Trig_fastStep_Func007A )
endfunction

// --- InitTrig_fastStep (family, line 45030) ---
function InitTrig_fastStep takes nothing returns nothing
    set gg_trg_fastStep = CreateTrigger(  )
    call DisableTrigger( gg_trg_fastStep )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_fastStep, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_fastStep, Condition( function Trig_fastStep_Conditions ) )
    call TriggerAddAction( gg_trg_fastStep, function Trig_fastStep_Actions )
endfunction
