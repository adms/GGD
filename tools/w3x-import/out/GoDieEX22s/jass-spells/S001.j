// rawcode: S001
// nameZh: 37-00 鬼眼
// cooldown: {"1": 45.0}
// mana: {"1": 150}
// duration: {"1": 5.0}
// hero_duration: {"1": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EvilEye

// === family EvilEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EvilEye_Conditions (family, line 44418) ---
function Trig_EvilEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'S001' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EvilEye_Func013A (family, line 44425) ---
function Trig_EvilEye_Func013A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetEnumUnit() )
endfunction

// --- Trig_EvilEye_Actions (family, line 44430) ---
function Trig_EvilEye_Actions takes nothing returns nothing
    set udg_BaMDesWallUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_GostUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'S002', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'S002', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call RemoveLocation( udg_P1 )
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, udg_P1), function Trig_EvilEye_Func013A )
    call RemoveLocation( udg_P1 )
endfunction

// --- InitTrig_EvilEye (family, line 44447) ---
function InitTrig_EvilEye takes nothing returns nothing
    set gg_trg_EvilEye = CreateTrigger(  )
    call DisableTrigger( gg_trg_EvilEye )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EvilEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EvilEye, Condition( function Trig_EvilEye_Conditions ) )
    call TriggerAddAction( gg_trg_EvilEye, function Trig_EvilEye_Actions )
endfunction
