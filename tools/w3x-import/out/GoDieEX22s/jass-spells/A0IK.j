// rawcode: A0IK
// nameZh: 44-01 死神之眼
// w3a base: Acrs  levels: 4
// cooldown: {"1": 20.0, "2": 20.0, "3": 20.0, "4": 20.0}
// mana: {"1": 150, "2": 200, "3": 250, "4": 300}
// range: {"1": 500.0, "2": 700.0, "3": 900.0, "4": 1100.0}
// duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// hero_duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DeathEye

// === family DeathEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathEye_Conditions (family, line 42231) ---
function Trig_DeathEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathEye_Func008C (family, line 42238) ---
function Trig_DeathEye_Func008C takes nothing returns boolean
    if ( not ( GetPlayerController(GetOwningPlayer(GetTriggerUnit())) == MAP_CONTROL_COMPUTER ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathEye_Actions (family, line 42245) ---
function Trig_DeathEye_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_FountainOfLifeWhat1, 100.00, GetTriggerUnit() )
    set udg_DeathUnit = GetSpellTargetUnit()
    call CreateTextTagUnitBJ( ( GetUnitName(udg_DeathUnit) + " 已經被死神之眼鎖定了..." ), GetSpellTargetUnit(), 0, 10.00, 90.00, 20.00, 30.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.70 )
    if ( Trig_DeathEye_Func008C() ) then
        call IssueImmediateOrderBJ( GetTriggerUnit(), "manashieldon" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "roar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "battleroar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "thunderclap" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stomp" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "roar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "battleroar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "thunderclap" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stomp" )
    else
    endif
    call SetUnitLifePercentBJ( GetTriggerUnit(), ( GetUnitLifePercent(GetTriggerUnit()) / 2.00 ) )
    call SetUnitLifePercentBJ( GetTriggerUnit(), ( GetUnitLifePercent(GetTriggerUnit()) / 2.00 ) )
    call PlaySoundOnUnitBJ( gg_snd_GruntYesAttack1, 100, GetTriggerUnit() )
endfunction

// --- InitTrig_DeathEye (family, line 42271) ---
function InitTrig_DeathEye takes nothing returns nothing
    set gg_trg_DeathEye = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathEye )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathEye, Condition( function Trig_DeathEye_Conditions ) )
    call TriggerAddAction( gg_trg_DeathEye, function Trig_DeathEye_Actions )
endfunction
