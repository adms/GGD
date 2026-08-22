// rawcode: A00U
// cooldown: {"1": 60.0}
// mana: {"1": 250}
// duration: {"1": 25.0}
// hero_duration: {"1": 25.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: InvBook

// === family InvBook (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_InvBook_Conditions (family, line 24756) ---
function Trig_InvBook_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A00U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_InvBook_Func006A (family, line 24763) ---
function Trig_InvBook_Func006A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "invisibility", GetEnumUnit() )
endfunction

// --- Trig_InvBook_Func008A (family, line 24768) ---
function Trig_InvBook_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_InvBook_Actions (family, line 24773) ---
function Trig_InvBook_Actions takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0H7', GetLastCreatedUnit() )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(GetTriggerUnit())), function Trig_InvBook_Func006A )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'ogru'), function Trig_InvBook_Func008A )
endfunction

// --- InitTrig_InvBook (family, line 24785) ---
function InitTrig_InvBook takes nothing returns nothing
    set gg_trg_InvBook = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InvBook, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_InvBook, Condition( function Trig_InvBook_Conditions ) )
    call TriggerAddAction( gg_trg_InvBook, function Trig_InvBook_Actions )
endfunction
