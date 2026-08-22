// rawcode: A0L6
// nameZh: 78-04 死亡噴射肘擊
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 45.0}
// mana: {"1": 110, "2": 160, "3": 210, "4": 315}
// range: {"1": 550.0, "2": 550.0, "3": 550.0, "4": 285.0}
// duration: {"1": 1.0, "2": 1.75, "3": 2.5, "4": 4.0}
// hero_duration: {"1": 1.0, "2": 1.75, "3": 2.5, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: PowerKnockBack

// === family PowerKnockBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PowerKnockBack_Func002C (family, line 50082) ---
function Trig_PowerKnockBack_Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0L6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PowerKnockBack_Conditions (family, line 50092) ---
function Trig_PowerKnockBack_Conditions takes nothing returns boolean
    if ( not Trig_PowerKnockBack_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_PowerKnockBack_Func020Func001A (family, line 50099) ---
function Trig_PowerKnockBack_Func020Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_PowerKnockBack_Actions (family, line 50103) ---
function Trig_PowerKnockBack_Actions takes nothing returns nothing
    set udg_RabUnit = GetTriggerUnit()
    set udg_PKnockBack_Index = 0
    set udg_PKnockBack_Target = GetSpellTargetUnit()
    set udg_PP1 = GetUnitLoc(GetTriggerUnit())
    set udg_PP2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_PKnockBack_Angle = AngleBetweenPoints(udg_PP1, udg_PP2)
    call TriggerSleepAction( 0.50 )
    call AddSpecialEffectLocBJ( udg_PP1, "Boomnl.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLoc( udg_RabUnit, GetUnitLoc(udg_PKnockBack_Target) )
    call CreateTextTagUnitBJ( "TRIGSTR_209", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call EnableTrigger( gg_trg_PowerKnockBack_Effect )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_PKnockBack_Target, "BloodBreathStream.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_PowerKnockBack_Func020Func001A )
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

// --- InitTrig_PowerKnockBack (family, line 50140) ---
function InitTrig_PowerKnockBack takes nothing returns nothing
    set gg_trg_PowerKnockBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_PowerKnockBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PowerKnockBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PowerKnockBack, Condition( function Trig_PowerKnockBack_Conditions ) )
    call TriggerAddAction( gg_trg_PowerKnockBack, function Trig_PowerKnockBack_Actions )
endfunction
