// rawcode: A049
// nameZh: 32-01 一騎槍閃
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 50, "2": 80, "3": 110, "4": 140}
// range: {"1": 175.0, "2": 175.0, "3": 175.0, "4": 175.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: KnockBack

// === family KnockBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KnockBack_Func002C (family, line 42538) ---
function Trig_KnockBack_Func002C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A049' ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KnockBack_Conditions (family, line 42548) ---
function Trig_KnockBack_Conditions takes nothing returns boolean
    if ( not Trig_KnockBack_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_KnockBack_Func011Func001A (family, line 42555) ---
function Trig_KnockBack_Func011Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_KnockBack_Actions (family, line 42559) ---
function Trig_KnockBack_Actions takes nothing returns nothing
    set udg_SnowUnit = GetTriggerUnit()
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call EnableTrigger( gg_trg_KnockBack_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_KnockBack_Func011Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_KnockBack (family, line 42587) ---
function InitTrig_KnockBack takes nothing returns nothing
    set gg_trg_KnockBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_KnockBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KnockBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KnockBack, Condition( function Trig_KnockBack_Conditions ) )
    call TriggerAddAction( gg_trg_KnockBack, function Trig_KnockBack_Actions )
endfunction
