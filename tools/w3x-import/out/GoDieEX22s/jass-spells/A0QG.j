// rawcode: A0QG
// nameZh: 94-02 橘山斬空破
// w3a base: AHtc  levels: 4
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0}
// mana: {"1": 50, "2": 100, "3": 150, "4": 200}
// area: {"1": 350.0, "2": 350.0}
// duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0}
// hero_duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: OranMon

// === family OranMon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_OranMon_Conditions (family, line 53896) ---
function Trig_OranMon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0QG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OranMon_Func001C (family, line 53903) ---
function Trig_OranMon_Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_NM_Master, 'B04K') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OranMon_Actions (family, line 53910) ---
function Trig_OranMon_Actions takes nothing returns nothing
    if ( Trig_OranMon_Func001C() ) then
        set udg_NM_P3 = GetUnitLoc(GetTriggerUnit())
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 45.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 135.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 225.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 315.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        call RemoveLocation( udg_NM_P3)
    else
    endif
endfunction

// --- InitTrig_OranMon (family, line 53947) ---
function InitTrig_OranMon takes nothing returns nothing
    set gg_trg_OranMon = CreateTrigger(  )
    call DisableTrigger( gg_trg_OranMon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_OranMon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_OranMon, Condition( function Trig_OranMon_Conditions ) )
    call TriggerAddAction( gg_trg_OranMon, function Trig_OranMon_Actions )
endfunction
