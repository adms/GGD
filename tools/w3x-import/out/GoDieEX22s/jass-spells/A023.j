// rawcode: A023
// nameZh: 04-05 重破斬
// cooldown: {"1": 120.0}
// mana: {"1": 1800}
// area: {"1": 1000.0}
// duration: {"1": 5.0}
// hero_duration: {"1": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GigaSlave

// === family GigaSlave (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GigaSlave_Conditions (family, line 30156) ---
function Trig_GigaSlave_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A023' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GigaSlave_Func005A (family, line 30163) ---
function Trig_GigaSlave_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GigaSlave_Actions (family, line 30168) ---
function Trig_GigaSlave_Actions takes nothing returns nothing
    set udg_DragonSlaverCaster = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'u030', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DragonSlaverCaster), 'u030'), function Trig_GigaSlave_Func005A )
endfunction

// --- InitTrig_GigaSlave (family, line 30177) ---
function InitTrig_GigaSlave takes nothing returns nothing
    set gg_trg_GigaSlave = CreateTrigger(  )
    call DisableTrigger( gg_trg_GigaSlave )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GigaSlave, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GigaSlave, Condition( function Trig_GigaSlave_Conditions ) )
    call TriggerAddAction( gg_trg_GigaSlave, function Trig_GigaSlave_Actions )
endfunction
