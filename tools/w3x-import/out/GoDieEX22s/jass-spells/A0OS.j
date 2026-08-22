// rawcode: A0OS
// nameZh: 61-03 打屁股風林火豬
// w3a base: ACac  levels: 4
// area: {"1": 0.0, "3": 150.0, "4": 150.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DMC_Ass, DMC_Forst, DMC_Pig

// === family DMC_Ass (passive) events=EVENT_PLAYER_HERO_SKILL ===

// --- Trig_DMC_Ass_Conditions (family, line 50767) ---
function Trig_DMC_Ass_Conditions takes nothing returns boolean
    if ( not ( GetLearnedSkillBJ() == 'A0OS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Ass_Func001C (family, line 50774) ---
function Trig_DMC_Ass_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0OS', GetTriggerUnit()) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Ass_Actions (family, line 50781) ---
function Trig_DMC_Ass_Actions takes nothing returns nothing
    if ( Trig_DMC_Ass_Func001C() ) then
        call UnitAddAbilityBJ( 'A0OL', GetTriggerUnit() )
    else
    endif
endfunction

// --- InitTrig_DMC_Ass (family, line 50789) ---
function InitTrig_DMC_Ass takes nothing returns nothing
    set gg_trg_DMC_Ass = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Ass )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Ass, EVENT_PLAYER_HERO_SKILL )
    call TriggerAddCondition( gg_trg_DMC_Ass, Condition( function Trig_DMC_Ass_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Ass, function Trig_DMC_Ass_Actions )
endfunction

// === family DMC_Forst (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_DMC_Forst_Func016C (family, line 50800) ---
function Trig_DMC_Forst_Func016C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U012' ) ) then
        return false
    endif
    if ( not ( GetUnitAbilityLevelSwapped('A0OS', GetAttacker()) >= 2 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 100) <= 15 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Forst_Conditions (family, line 50813) ---
function Trig_DMC_Forst_Conditions takes nothing returns boolean
    if ( not Trig_DMC_Forst_Func016C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Forst_Actions (family, line 50820) ---
function Trig_DMC_Forst_Actions takes nothing returns nothing
    set udg_DMC_P1 = GetUnitLoc(GetAttacker())
    set udg_DMC_P2 = GetUnitLoc(GetAttackedUnitBJ())
    call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(GetAttacker()), udg_DMC_P2, udg_DMC_P1 )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0OO', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "bloodlust", GetAttacker() )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call CreateTextTagUnitBJ( "TRIGSTR_194", GetAttackedUnitBJ(), 50.00, 12.00, 100, 30.00, 30.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call RemoveLocation(udg_DMC_P1)
    call RemoveLocation(udg_DMC_P2)
endfunction

// --- InitTrig_DMC_Forst (family, line 50839) ---
function InitTrig_DMC_Forst takes nothing returns nothing
    set gg_trg_DMC_Forst = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Forst )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Forst, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_DMC_Forst, Condition( function Trig_DMC_Forst_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Forst, function Trig_DMC_Forst_Actions )
endfunction

// === family DMC_Pig (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_DMC_Pig_Func017C (family, line 50850) ---
function Trig_DMC_Pig_Func017C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U012' ) ) then
        return false
    endif
    if ( not ( GetUnitAbilityLevelSwapped('A0OS', GetAttacker()) >= 4 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 100) <= 7 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Pig_Conditions (family, line 50863) ---
function Trig_DMC_Pig_Conditions takes nothing returns boolean
    if ( not Trig_DMC_Pig_Func017C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Pig_Actions (family, line 50870) ---
function Trig_DMC_Pig_Actions takes nothing returns nothing
    set udg_DMC_P1 = GetUnitLoc(GetAttacker())
    set udg_DMC_P2 = GetUnitLoc(GetAttackedUnitBJ())
    call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(GetAttacker()), udg_DMC_P1, udg_DMC_P2 )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0KN', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "hex", GetAttackedUnitBJ() )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call CreateTextTagUnitBJ( "TRIGSTR_436", GetAttackedUnitBJ(), 30.00, 12.00, 100, 50.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call PlaySoundOnUnitBJ( gg_snd_GruntPissed3, 100, GetTriggerUnit() )
    call RemoveLocation(udg_DMC_P1)
    call RemoveLocation(udg_DMC_P2)
endfunction

// --- InitTrig_DMC_Pig (family, line 50890) ---
function InitTrig_DMC_Pig takes nothing returns nothing
    set gg_trg_DMC_Pig = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Pig )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Pig, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_DMC_Pig, Condition( function Trig_DMC_Pig_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Pig, function Trig_DMC_Pig_Actions )
endfunction
