// rawcode: A0Y5
// nameZh: 96-04 獨孤九劍
// cooldown: {"1": 70.0, "2": 70.0, "3": 70.0}
// mana: {"1": 150, "2": 240, "3": 330}
// range: {"1": 400.0, "2": 400.0, "3": 400.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: NineSwords, NineSwords_LVup

// === family NineSwords (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NineSwords_Conditions (family, line 44888) ---
function Trig_NineSwords_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_Func006Func006C (family, line 44895) ---
function Trig_NineSwords_Func006Func006C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_LHC_NS_Target) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_Func010A (family, line 44902) ---
function Trig_NineSwords_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_NineSwords_Actions (family, line 44907) ---
function Trig_NineSwords_Actions takes nothing returns nothing
    set udg_LHC_Hero = GetTriggerUnit()
    set udg_LHC_NS_Target = GetSpellTargetUnit()
    set udg_LHC_NS_P1 = GetUnitLoc(GetSpellTargetUnit())
    set udg_LHC_NS_Count = 0
    set udg_LHC_NS_Count = 1
    loop
        exitwhen udg_LHC_NS_Count > 9
        call TriggerSleepAction( 0.04 )
        set udg_LHC_NS_P2 = PolarProjectionBJ(udg_LHC_NS_P1, 140.00, GetRandomDirectionDeg())
        call CreateNUnitsAtLoc( 1, 'o02X', GetOwningPlayer(udg_LHC_Hero), udg_LHC_NS_P1, GetUnitFacing(udg_LHC_Hero) )
        call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 0.00, 0.00, 100, 60.00 )
        if ( Trig_NineSwords_Func006Func006C() ) then
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "attack", udg_LHC_NS_Target )
        else
        endif
        call RemoveLocation( udg_LHC_NS_P2)
        set udg_LHC_NS_Count = udg_LHC_NS_Count + 1
    endloop
    call RemoveLocation( udg_LHC_NS_P1)
    call TriggerSleepAction( 9.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LHC_Hero), 'o02X'), function Trig_NineSwords_Func010A )
endfunction

// --- InitTrig_NineSwords (family, line 44933) ---
function InitTrig_NineSwords takes nothing returns nothing
    set gg_trg_NineSwords = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSwords )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSwords, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NineSwords, Condition( function Trig_NineSwords_Conditions ) )
    call TriggerAddAction( gg_trg_NineSwords, function Trig_NineSwords_Actions )
endfunction

// === family NineSwords_LVup (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_NineSwords_LVup_Conditions (family, line 44944) ---
function Trig_NineSwords_LVup_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02W' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_LVup_Func002C (family, line 44951) ---
function Trig_NineSwords_LVup_Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0Y5', GetTriggerUnit()) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_LVup_Actions (family, line 44958) ---
function Trig_NineSwords_LVup_Actions takes nothing returns nothing
    call SetPlayerTechResearchedSwap( 'Rome', GetUnitAbilityLevelSwapped('A0Y5', GetTriggerUnit()), GetOwningPlayer(GetTriggerUnit()) )
    if ( Trig_NineSwords_LVup_Func002C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_NineSwords_LVup (family, line 44968) ---
function InitTrig_NineSwords_LVup takes nothing returns nothing
    set gg_trg_NineSwords_LVup = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSwords_LVup )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSwords_LVup, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSwords_LVup, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_NineSwords_LVup, Condition( function Trig_NineSwords_LVup_Conditions ) )
    call TriggerAddAction( gg_trg_NineSwords_LVup, function Trig_NineSwords_LVup_Actions )
endfunction
