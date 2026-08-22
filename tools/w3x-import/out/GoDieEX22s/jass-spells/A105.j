// rawcode: A105
// nameZh: 43-002 食神歸位
// w3a base: AOws  levels: 1
// cooldown: {"1": 60.0, "2": 0.0, "3": 0.0}
// mana: {"1": 355, "2": 0, "3": 0}
// area: {"1": 1.0, "2": 375.0, "3": 375.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: godback

// === family godback (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_godback_Conditions (family, line 37974) ---
function Trig_godback_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A105' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_godback_Func007Func001C (family, line 37981) ---
function Trig_godback_Func007Func001C takes nothing returns boolean
    if ( not ( GetOwningPlayer(GetEnumUnit()) != GetOwningPlayer(udg_whiteUnit) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_godback_Func007A (family, line 37988) ---
function Trig_godback_Func007A takes nothing returns nothing
    if ( Trig_godback_Func007Func001C() ) then
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "polymorph", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_godback_Func010A (family, line 37996) ---
function Trig_godback_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_godback_Actions (family, line 38001) ---
function Trig_godback_Actions takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set udg_whiteUnit = GetLastCreatedUnit()
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A104', GetLastCreatedUnit() )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, udg_P1), function Trig_godback_Func007A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'hfoo'), function Trig_godback_Func010A )
endfunction

// --- InitTrig_godback (family, line 38015) ---
function InitTrig_godback takes nothing returns nothing
    set gg_trg_godback = CreateTrigger(  )
    call DisableTrigger( gg_trg_godback )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_godback, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_godback, Condition( function Trig_godback_Conditions ) )
    call TriggerAddAction( gg_trg_godback, function Trig_godback_Actions )
endfunction
