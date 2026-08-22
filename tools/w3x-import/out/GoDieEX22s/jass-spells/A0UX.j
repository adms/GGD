// rawcode: A0UX
// nameZh: 01-02 隕石擊
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0}
// mana: {"1": 75, "2": 145, "3": 215}
// range: {"1": 450.0, "2": 450.0, "3": 450.0}
// area: {"1": 300.0, "2": 300.0, "3": 300.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: StoJump_Start

// === family StoJump_Start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_StoJump_Start_Conditions (family, line 33608) ---
function Trig_StoJump_Start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0UX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StoJump_Start_Func018A (family, line 33615) ---
function Trig_StoJump_Start_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_StoJump_Start_Func019A (family, line 33620) ---
function Trig_StoJump_Start_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_StoJump_Start_Actions (family, line 33625) ---
function Trig_StoJump_Start_Actions takes nothing returns nothing
    set udg_StoJump_Index = 0.00
    set udg_StoJump_Caster = GetTriggerUnit()
    set udg_P1_Sto = GetUnitLoc(GetTriggerUnit())
    set udg_P2_Sto = GetSpellTargetLoc()
    set udg_StoJump_Angle = AngleBetweenPoints(udg_P1_Sto, udg_P2_Sto)
    set udg_StoJump_dDist = ( DistanceBetweenPoints(udg_P1_Sto, udg_P2_Sto) / 41.00 )
    set udg_StoMoonDamage = I2R(( ( 0 + ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_StoJump_Caster) * 100 ) ) + 0 ))
    set udg_Immediately_P1 = GetUnitLoc(udg_StoJump_Caster)
    set udg_StoMeterPoint = GetSpellTargetLoc()
    set udg_StoCount = 1
    loop
        exitwhen udg_StoCount > ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) + 0 )
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_StoJump_Caster), GetSpellTargetLoc(), GetUnitFacing(GetTriggerUnit()) )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0UY', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0UY', GetLastCreatedUnit(), 1 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", GetRandomLocInRect(RectFromCenterSizeBJ(GetSpellTargetLoc(), 200.00, 200.00)) )
        set udg_StoCount = udg_StoCount + 1
    endloop
    call PauseUnitBJ( true, GetTriggerUnit() )
    call SetUnitPathing( GetTriggerUnit(), false )
    call UnitAddAbilityBJ( 'A0FZ', GetTriggerUnit() )
    call SetUnitTimeScalePercent( GetTriggerUnit(), 60.00 )
    call SetUnitAnimation( GetTriggerUnit(), "attack slam" )
    call EnableTrigger( gg_trg_StoJump_Effect )
    call TriggerSleepAction( 1.80 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_StoJump_Caster), 'hfoo'), function Trig_StoJump_Start_Func018A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_StoJump_Caster), 'n01F'), function Trig_StoJump_Start_Func019A )
endfunction

// --- InitTrig_StoJump_Start (family, line 33657) ---
function InitTrig_StoJump_Start takes nothing returns nothing
    set gg_trg_StoJump_Start = CreateTrigger(  )
    call DisableTrigger( gg_trg_StoJump_Start )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_StoJump_Start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_StoJump_Start, Condition( function Trig_StoJump_Start_Conditions ) )
    call TriggerAddAction( gg_trg_StoJump_Start, function Trig_StoJump_Start_Actions )
endfunction
