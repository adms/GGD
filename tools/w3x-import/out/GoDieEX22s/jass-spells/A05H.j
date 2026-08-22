// rawcode: A05H
// nameZh: 44-03 火車輾過
// w3a base: AOws  levels: 4
// cooldown: {"1": 60.0, "2": 50.0, "3": 40.0, "4": 30.0}
// mana: {"1": 150, "2": 200, "3": 250, "4": 300}
// area: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DeathTrain

// === family DeathTrain (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathTrain_Conditions (family, line 42282) ---
function Trig_DeathTrain_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathTrain_Func009Func002Func001C (family, line 42289) ---
function Trig_DeathTrain_Func009Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathTrain_Func009Func002A (family, line 42296) ---
function Trig_DeathTrain_Func009Func002A takes nothing returns nothing
    if ( Trig_DeathTrain_Func009Func002Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'o002', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetEnumUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0EB', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0EB', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "impale", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_DeathTrain_Func009C (family, line 42309) ---
function Trig_DeathTrain_Func009C takes nothing returns boolean
    if ( not ( UnitHasItemOfTypeBJ(GetTriggerUnit(), 'I01O') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathTrain_Func012A (family, line 42316) ---
function Trig_DeathTrain_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DeathTrain_Actions (family, line 42321) ---
function Trig_DeathTrain_Actions takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o002', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(udg_DeathUnit), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0EB', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0EB', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), udg_DeathUnit, 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "impale", udg_DeathUnit )
    call PlaySoundOnUnitBJ( gg_snd_RokhanWhat2, 100, GetTriggerUnit() )
    if ( Trig_DeathTrain_Func009C() ) then
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(udg_DeathUnit)), function Trig_DeathTrain_Func009Func002A )
    else
    endif
    call TriggerSleepAction( 2 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o002'), function Trig_DeathTrain_Func012A )
endfunction

// --- InitTrig_DeathTrain (family, line 42341) ---
function InitTrig_DeathTrain takes nothing returns nothing
    set gg_trg_DeathTrain = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathTrain )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathTrain, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathTrain, Condition( function Trig_DeathTrain_Conditions ) )
    call TriggerAddAction( gg_trg_DeathTrain, function Trig_DeathTrain_Actions )
endfunction
