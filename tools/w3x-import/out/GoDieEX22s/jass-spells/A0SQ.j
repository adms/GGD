// rawcode: A0SQ
// nameZh: 12-002 仙氣發勁
// cooldown: {"1": 30.0, "2": 18.0, "3": 18.0, "4": 18.0}
// mana: {"1": 360, "2": 45, "3": 55, "4": 65}
// range: {"1": 450.0, "2": 650.0, "3": 650.0, "4": 650.0}
// duration: {"2": 1.5, "3": 1.5, "4": 1.5}
// hero_duration: {"2": 1.5, "3": 1.5, "4": 1.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: PowerBack

// === family PowerBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PowerBack_Func002C (family, line 29607) ---
function Trig_PowerBack_Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0SQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PowerBack_Conditions (family, line 29617) ---
function Trig_PowerBack_Conditions takes nothing returns boolean
    if ( not Trig_PowerBack_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_PowerBack_Func029Func001A (family, line 29624) ---
function Trig_PowerBack_Func029Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_PowerBack_Actions (family, line 29628) ---
function Trig_PowerBack_Actions takes nothing returns nothing
    set udg_ChiRam = GetTriggerUnit()
    set udg_PowerBack_Index = 0
    set udg_PowerBack_Target = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_PowerBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call CreateTextTagUnitBJ( "TRIGSTR_8980", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call UnitAddAbilityBJ( 'A0J7', GetTriggerUnit() )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_PowerBack_Target, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.50 )
    call SetUnitPositionLocFacingLocBJ( udg_ChiRam, PolarProjectionBJ(GetUnitLoc(udg_PowerBack_Target), 100.00, GetUnitFacing(udg_PowerBack_Target)), GetUnitLoc(udg_PowerBack_Target) )
    call AddSpecialEffectTargetUnitBJ( "handleft", udg_ChiRam, "SuperShinyThingy.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "hand,left", udg_ChiRam, "SuperShinyThingy.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "lefthand", udg_ChiRam, "SuperShinyThingy.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "hand", udg_ChiRam, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 3
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_PowerBack_Func029Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call EnableTrigger( gg_trg_PowerBack_Effect )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_PowerBack_Target, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call UnitRemoveAbilityBJ( 'A0J7', udg_ChiRam )
endfunction

// --- InitTrig_PowerBack (family, line 29678) ---
function InitTrig_PowerBack takes nothing returns nothing
    set gg_trg_PowerBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_PowerBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PowerBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PowerBack, Condition( function Trig_PowerBack_Conditions ) )
    call TriggerAddAction( gg_trg_PowerBack, function Trig_PowerBack_Actions )
endfunction
