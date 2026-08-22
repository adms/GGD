// rawcode: A0JX
// nameZh: 45-02 千鳥流
// cooldown: {"1": 23.0, "2": 23.0, "3": 23.0, "4": 35.0}
// mana: {"1": 70, "2": 110, "3": 150, "4": 130}
// area: {"1": 425.0, "2": 425.0, "3": 425.0}
// duration: {"1": 1.5, "2": 1.5, "3": 1.5, "4": 1.0}
// hero_duration: {"1": 1.5, "2": 1.5, "3": 1.5, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ThuBird

// === family ThuBird (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThuBird_Conditions (family, line 41734) ---
function Trig_ThuBird_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThuBird_Func004A (family, line 41741) ---
function Trig_ThuBird_Func004A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0HY', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_ThuBird_Func007A (family, line 41750) ---
function Trig_ThuBird_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ThuBird_Actions (family, line 41755) ---
function Trig_ThuBird_Actions takes nothing returns nothing
    set udg_ChoChuUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_P1), function Trig_ThuBird_Func004A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'o00E'), function Trig_ThuBird_Func007A )
endfunction

// --- InitTrig_ThuBird (family, line 41766) ---
function InitTrig_ThuBird takes nothing returns nothing
    set gg_trg_ThuBird = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThuBird )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThuBird, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThuBird, Condition( function Trig_ThuBird_Conditions ) )
    call TriggerAddAction( gg_trg_ThuBird, function Trig_ThuBird_Actions )
endfunction
