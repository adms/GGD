// rawcode: A0HW
// nameZh: 25-04 ChangeDNA
// w3a base: AEIl  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 75.0}
// mana: {"1": 80, "2": 160, "3": 240}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 8.0, "2": 16.0, "3": 24.0, "4": 28.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ChangeDNA

// === family ChangeDNA (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ChangeDNA_Func001C (family, line 38645) ---
function Trig_ChangeDNA_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HW' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Umal' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChangeDNA_Conditions (family, line 38655) ---
function Trig_ChangeDNA_Conditions takes nothing returns boolean
    if ( not Trig_ChangeDNA_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChangeDNA_Func008A (family, line 38662) ---
function Trig_ChangeDNA_Func008A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0HY', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_ChangeDNA_Func013A (family, line 38671) ---
function Trig_ChangeDNA_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChangeDNA_Actions (family, line 38676) ---
function Trig_ChangeDNA_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_DNAUnit = GetTriggerUnit()
    set udg_DNATime = ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 8.00 )
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call PlaySoundBJ( gg_snd_nocute )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(GetTriggerUnit())), function Trig_ChangeDNA_Func008A )
    call RemoveLocation( udg_P1 )
    call EnableTrigger( gg_trg_LightAttack )
    call TriggerSleepAction( udg_DNATime )
    call DisableTrigger( gg_trg_LightAttack )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DNAUnit), 'o00E'), function Trig_ChangeDNA_Func013A )
    call EnableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_ChangeDNA (family, line 38693) ---
function InitTrig_ChangeDNA takes nothing returns nothing
    set gg_trg_ChangeDNA = CreateTrigger(  )
    call DisableTrigger( gg_trg_ChangeDNA )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ChangeDNA, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ChangeDNA, Condition( function Trig_ChangeDNA_Conditions ) )
    call TriggerAddAction( gg_trg_ChangeDNA, function Trig_ChangeDNA_Actions )
endfunction
