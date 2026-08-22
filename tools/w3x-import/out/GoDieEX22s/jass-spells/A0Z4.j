// rawcode: A0Z4
// nameZh: 39-02 無名神風流-朱雀
// w3a base: AUfn  levels: 4
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 50, "2": 80, "3": 110, "4": 140}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FireBird

// === family FireBird (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FireBird_Conditions (family, line 39585) ---
function Trig_FireBird_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Z4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireBird_Func007C (family, line 39592) ---
function Trig_FireBird_Func007C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) == false ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= ( GetUnitAbilityLevelSwapped('A0Z4', GetTriggerUnit()) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireBird_Actions (family, line 39602) ---
function Trig_FireBird_Actions takes nothing returns nothing
    local location P1
    local location P2  
    local unit Caster
    local unit Master

    set Caster = GetSpellTargetUnit()
    set Master = GetTriggerUnit()

    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetSpellTargetLoc(), 100.00, AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetUnitLoc(GetSpellTargetUnit()))), AngleBetweenPoints(GetSpellTargetLoc(), GetUnitLoc(GetTriggerUnit())) )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DM', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DM', GetLastCreatedUnit(), 5 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    if ( Trig_FireBird_Func007C() ) then
      set P1 = GetUnitLoc(Caster)
      set P2 = GetUnitLoc(Master)
      call Set_Move_Value(Caster , 10 , AngleBetweenPoints( P1 , P2 ) )
      call RemoveLocation (P1)
      call RemoveLocation (P2)
    else
    endif
endfunction

// --- InitTrig_FireBird (family, line 39628) ---
function InitTrig_FireBird takes nothing returns nothing
    set gg_trg_FireBird = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireBird, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FireBird, Condition( function Trig_FireBird_Conditions ) )
    call TriggerAddAction( gg_trg_FireBird, function Trig_FireBird_Actions )
endfunction

// --- Set_Move_Value (helper, line 4785) ---
function Set_Move_Value takes unit MoveUnit , integer Distance , real Angle returns nothing
    local timer t

    set t = CreateTimer()

    call SetHandleUnit(t ,"MoveUnit", MoveUnit)
    call SetHandleInt( MoveUnit, "Distance", Distance)
    call SetHandleReal( MoveUnit, "Angle", Angle)
    call TimerStart(t, 0.04, true, function Move_Func)

    set t = null
endfunction
