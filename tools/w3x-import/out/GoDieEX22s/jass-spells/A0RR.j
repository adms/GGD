// rawcode: A0RR
// nameZh: 48-00 石化之眼
// cooldown: {"1": 45.0}
// mana: {"1": 150}
// area: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Riderspell

// === family Riderspell (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Riderspell_Conditions (family, line 38109) ---
function Trig_Riderspell_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Riderspell_Actions (family, line 38116) ---
function Trig_Riderspell_Actions takes nothing returns nothing
    local location RiderHidePoint
    local unit RiderHideUnit

    set RiderHidePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h025', GetOwningPlayer(GetTriggerUnit()), RiderHidePoint, bj_UNIT_FACING )
    set RiderHideUnit = GetLastCreatedUnit()
    call ShowUnitHide( RiderHideUnit )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', RiderHideUnit )
    call IssuePointOrderLocBJ( RiderHideUnit, "silence", RiderHidePoint )
    call RemoveLocation( RiderHidePoint )
    call TriggerSleepAction( 1.00 )
    call KillUnit( RiderHideUnit )
    call RemoveUnit( RiderHideUnit )
endfunction

// --- InitTrig_Riderspell (family, line 38133) ---
function InitTrig_Riderspell takes nothing returns nothing
    set gg_trg_Riderspell = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Riderspell, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Riderspell, Condition( function Trig_Riderspell_Conditions ) )
    call TriggerAddAction( gg_trg_Riderspell, function Trig_Riderspell_Actions )
endfunction
