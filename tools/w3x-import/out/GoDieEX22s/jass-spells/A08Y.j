// rawcode: A08Y
// nameZh: 06-00 猜猜拳
// w3a base: ANsb  levels: 1
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 40.0}
// mana: {"1": 140, "2": 200, "3": 260, "4": 320}
// range: {"2": 250.0, "3": 250.0, "4": 250.0}
// duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: XHunterStone, XHunterStone_pre

// === family XHunterStone (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_XHunterStone_Conditions (family, line 26895) ---
function Trig_XHunterStone_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A08Y' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func005Func016C (family, line 26902) ---
function Trig_XHunterStone_Func005Func016C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func005Func018Func001A (family, line 26909) ---
function Trig_XHunterStone_Func005Func018Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_XHunterStone_Func005Func021Func005Func001C (family, line 26913) ---
function Trig_XHunterStone_Func005Func021Func005Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_JayUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func005Func021Func005A (family, line 26920) ---
function Trig_XHunterStone_Func005Func021Func005A takes nothing returns nothing
    if ( Trig_XHunterStone_Func005Func021Func005Func001C() ) then
        call UnitDamageTargetBJ( udg_JayUnit, GetEnumUnit(), udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_XHunterStone_Func005Func021Func011C (family, line 26927) ---
function Trig_XHunterStone_Func005Func021Func011C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func005Func021Func022C (family, line 26934) ---
function Trig_XHunterStone_Func005Func021Func022C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func005Func021C (family, line 26941) ---
function Trig_XHunterStone_Func005Func021C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_Gon_P1, udg_Gon_P2) <= 500.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func005C (family, line 26948) ---
function Trig_XHunterStone_Func005C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_Gon_P1, udg_Gon_P2) <= 250.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Func009A (family, line 26955) ---
function Trig_XHunterStone_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_XHunterStone_Actions (family, line 26960) ---
function Trig_XHunterStone_Actions takes nothing returns nothing
    set udg_JayUnit = GetTriggerUnit()
    set udg_JayCastedUnit = GetSpellTargetUnit()
    set udg_Gon_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Gon_P2 = GetUnitLoc(GetSpellTargetUnit())
    if ( Trig_XHunterStone_Func005C() ) then
        // 石頭
        set udg_Gon_Stone_Damage = ( 350.00 + ( 150.00 * I2R(GetUnitAbilityLevelSwapped('A020', GetTriggerUnit())) ) )
        set udg_KnockBack_Index = 0
        set udg_KnockBack_Target = GetSpellTargetUnit()
        set udg_P1 = GetUnitLoc(GetTriggerUnit())
        set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
        set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
        call RemoveLocation( udg_P1 )
        call RemoveLocation( udg_P2 )
        call UnitDamageTargetBJ( GetTriggerUnit(), udg_JayCastedUnit, udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call CreateTextTagUnitBJ( ( ( "石頭 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        if ( Trig_XHunterStone_Func005Func016C() ) then
            call EnableTrigger( gg_trg_XHunterStone_Effect )
        else
        endif
        call PlaySoundOnUnitBJ( gg_snd_MortarTeamPissed9, 100.00, GetTriggerUnit() )
        set bj_forLoopBIndex = 1
        set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
        loop
            exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
            call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_XHunterStone_Func005Func018Func001A )
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
    else
        if ( Trig_XHunterStone_Func005Func021C() ) then
            // 剪刀
            set udg_Gon_Stone_Damage = ( 250.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A08W', GetTriggerUnit())) ) )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_JayCastedUnit, "HeroCloudCyd.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call UnitDamageTargetBJ( GetTriggerUnit(), udg_JayCastedUnit, udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call CreateTextTagUnitBJ( ( ( "剪刀 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            if ( Trig_XHunterStone_Func005Func021Func022C() ) then
                call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_Gon_P1, udg_Gon_P2 )
                call ShowUnitHide( GetLastCreatedUnit() )
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A0NP', GetLastCreatedUnit() )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "acidbomb", udg_JayCastedUnit )
            else
            endif
        else
            // 布
            set udg_Gon_Stone_Damage = ( 225.00 + ( 75.00 * I2R(GetUnitAbilityLevelSwapped('A08X', GetTriggerUnit())) ) )
            call AddSpecialEffectLocBJ( udg_Gon_P2, "Units\\NightElf\\Wisp\\WispExplode.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call ForGroupBJ( GetUnitsInRangeOfLocAll(270.00, udg_Gon_P2), function Trig_XHunterStone_Func005Func021Func005A )
            call CreateTextTagUnitBJ( ( ( "布 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            if ( Trig_XHunterStone_Func005Func021Func011C() ) then
                call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_Gon_P2, udg_Gon_P1 )
                call ShowUnitHide( GetLastCreatedUnit() )
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A04W', GetLastCreatedUnit() )
                call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
            else
            endif
        endif
    endif
    call RemoveLocation(udg_Gon_P1)
    call RemoveLocation(udg_Gon_P2)
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_JayUnit), 'hfoo'), function Trig_XHunterStone_Func009A )
endfunction

// --- InitTrig_XHunterStone (family, line 27049) ---
function InitTrig_XHunterStone takes nothing returns nothing
    set gg_trg_XHunterStone = CreateTrigger(  )
    call DisableTrigger( gg_trg_XHunterStone )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_XHunterStone, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_XHunterStone, Condition( function Trig_XHunterStone_Conditions ) )
    call TriggerAddAction( gg_trg_XHunterStone, function Trig_XHunterStone_Actions )
endfunction

// === family XHunterStone_pre (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_XHunterStone_pre_Conditions (family, line 26857) ---
function Trig_XHunterStone_pre_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A08Y' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_pre_Func011A (family, line 26864) ---
function Trig_XHunterStone_pre_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_XHunterStone_pre_Actions (family, line 26869) ---
function Trig_XHunterStone_pre_Actions takes nothing returns nothing
    set udg_JayUnit = GetTriggerUnit()
    set udg_ActivePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 5, 'o016', GetOwningPlayer(GetTriggerUnit()), udg_ActivePoint, bj_UNIT_FACING )
    call CreateTextTagUnitBJ( "TRIGSTR_854", GetTriggerUnit(), -30.00, 15.00, 0.00, 0.00, 0.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    call RemoveLocation(udg_ActivePoint)
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_JayUnit), 'o016'), function Trig_XHunterStone_pre_Func011A )
endfunction

// --- InitTrig_XHunterStone_pre (family, line 26884) ---
function InitTrig_XHunterStone_pre takes nothing returns nothing
    set gg_trg_XHunterStone_pre = CreateTrigger(  )
    call DisableTrigger( gg_trg_XHunterStone_pre )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_XHunterStone_pre, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_XHunterStone_pre, Condition( function Trig_XHunterStone_pre_Conditions ) )
    call TriggerAddAction( gg_trg_XHunterStone_pre, function Trig_XHunterStone_pre_Actions )
endfunction
