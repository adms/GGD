// rawcode: A02K
// nameZh: 12-02 仙氣．採藥
// w3a base: AIre  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 50, "2": 100, "3": 150, "4": 200}
// range: {"2": 100.0, "3": 100.0, "4": 100.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GodTakeMd

// === family GodTakeMd (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GodTakeMd_Conditions (family, line 29355) ---
function Trig_GodTakeMd_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodTakeMd_Func008A (family, line 29362) ---
function Trig_GodTakeMd_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GodTakeMd_Actions (family, line 29367) ---
function Trig_GodTakeMd_Actions takes nothing returns nothing
    set udg_ActivePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_ActivePoint, GetUnitFacing(GetTriggerUnit()) )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A02H', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "purge", GetTriggerUnit() )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'ogru'), function Trig_GodTakeMd_Func008A )
    call RemoveLocation(udg_ActivePoint)
endfunction

// --- InitTrig_GodTakeMd (family, line 29380) ---
function InitTrig_GodTakeMd takes nothing returns nothing
    set gg_trg_GodTakeMd = CreateTrigger(  )
    call DisableTrigger( gg_trg_GodTakeMd )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GodTakeMd, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GodTakeMd, Condition( function Trig_GodTakeMd_Conditions ) )
    call TriggerAddAction( gg_trg_GodTakeMd, function Trig_GodTakeMd_Actions )
endfunction
