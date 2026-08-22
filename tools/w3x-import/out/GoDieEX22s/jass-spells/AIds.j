// rawcode: AIds
// cooldown: {"1": 60.0}
// mana: {"1": 300}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MoriyaBYEBYE

// === family MoriyaBYEBYE (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoriyaBYEBYE_Func004Func002C (family, line 46950) ---
function Trig_MoriyaBYEBYE_Func004Func002C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AIds' ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 5) == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func004C (family, line 46960) ---
function Trig_MoriyaBYEBYE_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A04C' ) ) then
        return true
    endif
    if ( Trig_MoriyaBYEBYE_Func004Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_MoriyaBYEBYE_Conditions (family, line 46970) ---
function Trig_MoriyaBYEBYE_Conditions takes nothing returns boolean
    if ( not Trig_MoriyaBYEBYE_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func005Func010C (family, line 46977) ---
function Trig_MoriyaBYEBYE_Func005Func010C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'U00K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func005A (family, line 46984) ---
function Trig_MoriyaBYEBYE_Func005A takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04I', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
    if ( Trig_MoriyaBYEBYE_Func005Func010C() ) then
        call SetUnitAbilityLevelSwapped( 'A04I', GetLastCreatedUnit(), 9 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "manaburn", GetEnumUnit() )
    else
        call SetUnitAbilityLevelSwapped( 'A04I', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "manaburn", GetEnumUnit() )
    endif
endfunction

// --- Trig_MoriyaBYEBYE_Func007A (family, line 47003) ---
function Trig_MoriyaBYEBYE_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MoriyaBYEBYE_Actions (family, line 47008) ---
function Trig_MoriyaBYEBYE_Actions takes nothing returns nothing
    call TerrainDeformationWaveBJ( 2.00, GetUnitLoc(GetSpellTargetUnit()), GetRectCenter(gg_rct_moriyasp), 500.00, 120.00, 0.50 )
    set udg_MoriyaUnit = GetTriggerUnit()
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, GetUnitLoc(GetTriggerUnit())), function Trig_MoriyaBYEBYE_Func005A )
    call TriggerSleepAction( 10.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoriyaUnit), 'ogru'), function Trig_MoriyaBYEBYE_Func007A )
endfunction

// --- InitTrig_MoriyaBYEBYE (family, line 47018) ---
function InitTrig_MoriyaBYEBYE takes nothing returns nothing
    set gg_trg_MoriyaBYEBYE = CreateTrigger(  )
    call DisableTrigger( gg_trg_MoriyaBYEBYE )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoriyaBYEBYE, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoriyaBYEBYE, Condition( function Trig_MoriyaBYEBYE_Conditions ) )
    call TriggerAddAction( gg_trg_MoriyaBYEBYE, function Trig_MoriyaBYEBYE_Actions )
endfunction
