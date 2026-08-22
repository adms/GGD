// rawcode: A0ZE
// nameZh: 98-02 平易近人的笑容
// w3a base: AEar  levels: 4
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Smile

// === family Smile (passive) events=none ===

// --- Trig_Smile_Conditions (family, line 55123) ---
function Trig_Smile_Conditions takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0ZE', udg_Mentor) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Smile_Func002Func001C (family, line 55130) ---
function Trig_Smile_Func002Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_Mentor)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Smile_Func002A (family, line 55140) ---
function Trig_Smile_Func002A takes nothing returns nothing
    if ( Trig_Smile_Func002Func001C() ) then
        set udg_Mentor_HealthPoint = GetUnitLoc(GetEnumUnit())
        call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0ZE', udg_Mentor)) ) ) )
        call AddSpecialEffectLocBJ( udg_Mentor_HealthPoint, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation(udg_Mentor_HealthPoint)
    else
    endif
endfunction

// --- Trig_Smile_Actions (family, line 55151) ---
function Trig_Smile_Actions takes nothing returns nothing
    set udg_Mentor_UnitPoint = GetUnitLoc(udg_Mentor)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(300.00, udg_Mentor_UnitPoint), function Trig_Smile_Func002A )
endfunction

// --- InitTrig_Smile (family, line 55157) ---
function InitTrig_Smile takes nothing returns nothing
    set gg_trg_Smile = CreateTrigger(  )
    call DisableTrigger( gg_trg_Smile )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Smile, 30.00 )
    call TriggerAddCondition( gg_trg_Smile, Condition( function Trig_Smile_Conditions ) )
    call TriggerAddAction( gg_trg_Smile, function Trig_Smile_Actions )
endfunction
