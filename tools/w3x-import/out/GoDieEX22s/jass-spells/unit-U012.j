// unit rawcode: U012
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_DMC, DMC_Ass, DMC_Dead, DMC_Deadagain, DMC_Evilball, DMC_Forst, DMC_Kill, DMC_Pig, DMC_Revive

// === family Open_Skill_of_DMC (armed) events=none ===

// --- Trig_Open_Skill_of_DMC_Conditions (family, line 50635) ---
function Trig_Open_Skill_of_DMC_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U012' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_DMC_Actions (family, line 50642) ---
function Trig_Open_Skill_of_DMC_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_DMC_Dead )
    call EnableTrigger( gg_trg_DMC_Deadagain )
    call EnableTrigger( gg_trg_DMC_Revive )
    call EnableTrigger( gg_trg_DMC_Ass )
    call EnableTrigger( gg_trg_DMC_Forst )
    call EnableTrigger( gg_trg_DMC_Pig )
    call EnableTrigger( gg_trg_DMC_Evilball )
    call EnableTrigger( gg_trg_DMC_Kill )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "克勞薩II世: 甜蜜的寶貝就是你 你是我那甜蜜的戀人~!" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_DMC (family, line 50657) ---
function InitTrig_Open_Skill_of_DMC takes nothing returns nothing
    set gg_trg_Open_Skill_of_DMC = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_DMC, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_DMC, Condition( function Trig_Open_Skill_of_DMC_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_DMC, function Trig_Open_Skill_of_DMC_Actions )
endfunction

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

// === family DMC_Dead (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DMC_Dead_Conditions (family, line 50667) ---
function Trig_DMC_Dead_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'Aphx' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U012' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Dead_Actions (family, line 50677) ---
function Trig_DMC_Dead_Actions takes nothing returns nothing
    call PauseUnitBJ( true, GetTriggerUnit() )
    set udg_DMC_P1 = GetUnitLoc(GetTriggerUnit())
    call AddSpecialEffectLocBJ( udg_DMC_P1, "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'u01P', GetOwningPlayer(GetTriggerUnit()), udg_DMC_P1, GetRandomDirectionDeg() )
    call SetUnitPositionLoc( GetLastCreatedUnit(), udg_DMC_P1 )
    call SetUnitAnimation( GetLastCreatedUnit(), "attack" )
    call RemoveLocation(udg_DMC_P1)
endfunction

// --- InitTrig_DMC_Dead (family, line 50689) ---
function InitTrig_DMC_Dead takes nothing returns nothing
    set gg_trg_DMC_Dead = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Dead )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Dead, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DMC_Dead, Condition( function Trig_DMC_Dead_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Dead, function Trig_DMC_Dead_Actions )
endfunction

// === family DMC_Deadagain (armed) events=none ===

// --- Trig_DMC_Deadagain_Conditions (family, line 50700) ---
function Trig_DMC_Deadagain_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'U011' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Deadagain_Func003A (family, line 50707) ---
function Trig_DMC_Deadagain_Func003A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DMC_Deadagain_Actions (family, line 50712) ---
function Trig_DMC_Deadagain_Actions takes nothing returns nothing
    call PauseUnitBJ( false, GetTriggerUnit() )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'u01P'), function Trig_DMC_Deadagain_Func003A )
endfunction

// --- InitTrig_DMC_Deadagain (family, line 50719) ---
function InitTrig_DMC_Deadagain takes nothing returns nothing
    set gg_trg_DMC_Deadagain = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Deadagain )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Deadagain, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_DMC_Deadagain, Condition( function Trig_DMC_Deadagain_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Deadagain, function Trig_DMC_Deadagain_Actions )
endfunction

// === family DMC_Evilball (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_DMC_Evilball_Conditions (family, line 50901) ---
function Trig_DMC_Evilball_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Evilball_Actions (family, line 50908) ---
function Trig_DMC_Evilball_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_1044", GetAttackedUnitBJ(), 50.00, 16.00, 100, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
endfunction

// --- InitTrig_DMC_Evilball (family, line 50917) ---
function InitTrig_DMC_Evilball takes nothing returns nothing
    set gg_trg_DMC_Evilball = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Evilball )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Evilball, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_DMC_Evilball, Condition( function Trig_DMC_Evilball_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Evilball, function Trig_DMC_Evilball_Actions )
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

// === family DMC_Kill (armed) events=none ===

// --- Trig_DMC_Kill_Conditions (family, line 50928) ---
function Trig_DMC_Kill_Conditions takes nothing returns boolean
    if ( not ( IsUnitType(GetDyingUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetKillingUnitBJ()) == 'U012' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Kill_Actions (family, line 50938) ---
function Trig_DMC_Kill_Actions takes nothing returns nothing
    set udg_Rape = 1
    loop
        exitwhen udg_Rape > 10
        call TriggerSleepAction( 0.09 )
        call CreateTextTagUnitBJ( "TRIGSTR_1646", GetKillingUnitBJ(), 0.00, 14.00, 100, 0.00, 0.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 100.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.10 )
        set udg_Rape = udg_Rape + 1
    endloop
endfunction

// --- InitTrig_DMC_Kill (family, line 50953) ---
function InitTrig_DMC_Kill takes nothing returns nothing
    set gg_trg_DMC_Kill = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Kill )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Kill, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_DMC_Kill, Condition( function Trig_DMC_Kill_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Kill, function Trig_DMC_Kill_Actions )
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

// === family DMC_Revive (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DMC_Revive_Conditions (family, line 50730) ---
function Trig_DMC_Revive_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'Aphx' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U011' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Revive_Func007A (family, line 50740) ---
function Trig_DMC_Revive_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DMC_Revive_Actions (family, line 50745) ---
function Trig_DMC_Revive_Actions takes nothing returns nothing
    call PauseUnitBJ( false, GetTriggerUnit() )
    set udg_DMC_P1 = GetUnitLoc(GetTriggerUnit())
    call AddSpecialEffectLocBJ( udg_DMC_P1, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation(udg_DMC_P1)
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'u01P'), function Trig_DMC_Revive_Func007A )
endfunction

// --- InitTrig_DMC_Revive (family, line 50756) ---
function InitTrig_DMC_Revive takes nothing returns nothing
    set gg_trg_DMC_Revive = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Revive )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Revive, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DMC_Revive, Condition( function Trig_DMC_Revive_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Revive, function Trig_DMC_Revive_Actions )
endfunction
