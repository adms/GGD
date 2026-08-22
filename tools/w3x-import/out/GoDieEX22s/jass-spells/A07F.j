// rawcode: A07F
// nameZh: 04-04 神滅斬
// w3a base: ANsb  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 150, "2": 250, "3": 350}
// range: {"1": 275.0, "2": 275.0, "3": 275.0}
// duration: {"1": 2.0, "2": 2.0, "3": 2.0}
// hero_duration: {"1": 2.0, "2": 2.0, "3": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LinaS

// === family LinaS (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LinaS_Func001C (family, line 29749) ---
function Trig_LinaS_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A07F' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Conditions (family, line 29759) ---
function Trig_LinaS_Conditions takes nothing returns boolean
    if ( not Trig_LinaS_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Func016C (family, line 29766) ---
function Trig_LinaS_Func016C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H020' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LinaS_Func019Func001A (family, line 29773) ---
function Trig_LinaS_Func019Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_LinaS_Actions (family, line 29777) ---
function Trig_LinaS_Actions takes nothing returns nothing
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call CreateTextTagUnitBJ( "TRIGSTR_3733", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "HeroCloudCyd.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    if ( Trig_LinaS_Func016C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 12 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 5 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call PolledWait( 0.50 )
    call EnableTrigger( gg_trg_LinaS_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_LinaS_Func019Func001A )
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

// --- InitTrig_LinaS (family, line 29817) ---
function InitTrig_LinaS takes nothing returns nothing
    set gg_trg_LinaS = CreateTrigger(  )
    call DisableTrigger( gg_trg_LinaS )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LinaS, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LinaS, Condition( function Trig_LinaS_Conditions ) )
    call TriggerAddAction( gg_trg_LinaS, function Trig_LinaS_Actions )
endfunction
