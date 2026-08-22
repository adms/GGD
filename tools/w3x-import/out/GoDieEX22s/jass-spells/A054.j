// rawcode: A054
// nameZh: 15-02 沉睡之霧
// w3a base: AUsl  levels: 4
// cooldown: {"1": 20.0, "2": 20.0, "3": 20.0, "4": 20.0}
// mana: {"2": 130, "3": 160, "4": 190}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 3.0, "2": 4.0, "3": 5.0, "4": 6.0}
// hero_duration: {"1": 3.0, "2": 4.0, "3": 5.0, "4": 6.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Sleep_Air

// === family Sleep_Air (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Sleep_Air_Conditions (family, line 34515) ---
function Trig_Sleep_Air_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A054' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Sleep_Air_Func010Func001C (family, line 34522) ---
function Trig_Sleep_Air_Func010Func001C takes nothing returns boolean
    if ( not ( GetEnumUnit() != GetSpellTargetUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Sleep_Air_Func010A (family, line 34529) ---
function Trig_Sleep_Air_Func010A takes nothing returns nothing
    if ( Trig_Sleep_Air_Func010Func001C() ) then
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "sleep", GetEnumUnit() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Sleep_Air_Func013A (family, line 34538) ---
function Trig_Sleep_Air_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Sleep_Air_Actions (family, line 34543) ---
function Trig_Sleep_Air_Actions takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A055', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A055', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call RemoveLocation( udg_P1 )
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_P1), function Trig_Sleep_Air_Func010A )
    call RemoveLocation( udg_P1 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'ogru'), function Trig_Sleep_Air_Func013A )
    call PlaySoundOnUnitBJ( gg_snd_AkamaPissed8, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_Sleep_Air (family, line 34561) ---
function InitTrig_Sleep_Air takes nothing returns nothing
    set gg_trg_Sleep_Air = CreateTrigger(  )
    call DisableTrigger( gg_trg_Sleep_Air )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Sleep_Air, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Sleep_Air, Condition( function Trig_Sleep_Air_Conditions ) )
    call TriggerAddAction( gg_trg_Sleep_Air, function Trig_Sleep_Air_Actions )
endfunction
