// rawcode: A0JB
// nameZh: 77-02 百烈櫻華斬
// w3a base: AHtc  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 120, "2": 150, "3": 180, "4": 210}
// area: {"1": 300.0, "3": 300.0, "4": 300.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Flow

// === family Flow (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Flow_Conditions (family, line 49612) ---
function Trig_Flow_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Flow_Func012A (family, line 49619) ---
function Trig_Flow_Func012A takes nothing returns nothing
    call UnitDamageTargetBJ( udg_Inshou, GetEnumUnit(), ( ( 250.00 + I2R(( udg_InshouFlowLevel * 100 )) ) - ( DistanceBetweenPoints(GetUnitLoc(GetEnumUnit()), GetUnitLoc(udg_Inshou)) / 2.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- Trig_Flow_Actions (family, line 49623) ---
function Trig_Flow_Actions takes nothing returns nothing
    set udg_Inshou = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_DarkSummoningLaunch1, 100.00, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o01D', GetOwningPlayer(udg_Inshou), GetUnitLoc(udg_Inshou), bj_UNIT_FACING )
    set udg_InshouCreateUnit[25] = GetLastCreatedUnit()
    set udg_InshouSize = 0
    set udg_InshouFlowLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    call GroupClear( udg_InshouGroup )
    call EnableTrigger( gg_trg_SizeChange )
    call TriggerSleepAction( 1.00 )
    call DisableTrigger( gg_trg_SizeChange )
    call ForGroupBJ( udg_InshouGroup, function Trig_Flow_Func012A )
    call KillUnit( udg_InshouCreateUnit[25] )
    call RemoveUnit( udg_InshouCreateUnit[25] )
endfunction

// --- InitTrig_Flow (family, line 49640) ---
function InitTrig_Flow takes nothing returns nothing
    set gg_trg_Flow = CreateTrigger(  )
    call DisableTrigger( gg_trg_Flow )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Flow, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Flow, Condition( function Trig_Flow_Conditions ) )
    call TriggerAddAction( gg_trg_Flow, function Trig_Flow_Actions )
endfunction
