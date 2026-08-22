// rawcode: A092
// nameZh: 05-04 巴歐．薩喀爾嘎
// w3a base: ANsb  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 140, "2": 230, "3": 320}
// range: {"1": 450.0, "2": 450.0, "3": 450.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GoldDrgan

// === family GoldDrgan (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GoldDrgan_Func001C (family, line 28247) ---
function Trig_GoldDrgan_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A092' ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetTriggerUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldDrgan_Conditions (family, line 28260) ---
function Trig_GoldDrgan_Conditions takes nothing returns boolean
    if ( not Trig_GoldDrgan_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldDrgan_Func017Func001A (family, line 28267) ---
function Trig_GoldDrgan_Func017Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_GoldDrgan_Actions (family, line 28271) ---
function Trig_GoldDrgan_Actions takes nothing returns nothing
    set udg_GaShoUnit = GetTriggerUnit()
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetSpellTargetUnit()
    set udg_GoldDragonEatedUnit = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call CreateTextTagUnitBJ( "TRIGSTR_4716", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call EnableTrigger( gg_trg_GoldDrgan_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_GoldDrgan_Func017Func001A )
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

// --- InitTrig_GoldDrgan (family, line 28305) ---
function InitTrig_GoldDrgan takes nothing returns nothing
    set gg_trg_GoldDrgan = CreateTrigger(  )
    call DisableTrigger( gg_trg_GoldDrgan )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GoldDrgan, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GoldDrgan, Condition( function Trig_GoldDrgan_Conditions ) )
    call TriggerAddAction( gg_trg_GoldDrgan, function Trig_GoldDrgan_Actions )
endfunction
