// rawcode: A020
// nameZh: 06-03 山形修煉-強
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: XHunter, XHunterStone

// === family XHunter (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_XHunter_Conditions (family, line 27154) ---
function Trig_XHunter_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U034' ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 5) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func016C (family, line 27170) ---
function Trig_XHunter_Func005Func016C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetAttackedUnitBJ(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018Func005Func001C (family, line 27177) ---
function Trig_XHunter_Func005Func018Func005Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_JayUnit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018Func005A (family, line 27190) ---
function Trig_XHunter_Func005Func018Func005A takes nothing returns nothing
    if ( Trig_XHunter_Func005Func018Func005Func001C() ) then
        call UnitDamageTargetBJ( udg_JayUnit, GetEnumUnit(), udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_XHunter_Func005Func018Func011C (family, line 27197) ---
function Trig_XHunter_Func005Func018Func011C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_JayUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018Func022C (family, line 27204) ---
function Trig_XHunter_Func005Func018Func022C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_JayUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018C (family, line 27211) ---
function Trig_XHunter_Func005Func018C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 2) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005C (family, line 27218) ---
function Trig_XHunter_Func005C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= ( 5 + R2I(( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetAttacker(), true)) / 10.00 )) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func009A (family, line 27225) ---
function Trig_XHunter_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_XHunter_Actions (family, line 27230) ---
function Trig_XHunter_Actions takes nothing returns nothing
    set udg_JayUnit = GetAttacker()
    set udg_JayCastedUnit = GetAttackedUnitBJ()
    set udg_Gon_P1 = GetUnitLoc(udg_JayUnit)
    set udg_Gon_P2 = GetUnitLoc(udg_JayCastedUnit)
    if ( Trig_XHunter_Func005C() ) then
        // 石頭
        set udg_Gon_Stone_Damage = ( 350.00 + ( 150.00 * I2R(GetUnitAbilityLevelSwapped('A020', udg_JayUnit)) ) )
        set udg_KnockBack_Index = 0
        set udg_KnockBack_Target = udg_JayCastedUnit
        set udg_P1 = GetUnitLoc(udg_JayUnit)
        set udg_P2 = GetUnitLoc(udg_JayCastedUnit)
        set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
        call RemoveLocation( udg_P1 )
        call RemoveLocation( udg_P2 )
        call UnitDamageTargetBJ( udg_JayUnit, udg_JayCastedUnit, udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call CreateTextTagUnitBJ( ( ( "石頭 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), udg_JayUnit, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        if ( Trig_XHunter_Func005Func016C() ) then
            call EnableTrigger( gg_trg_XHunterStone_Effect )
        else
        endif
        call PlaySoundOnUnitBJ( gg_snd_MortarTeamPissed9, 100.00, udg_JayUnit )
    else
        if ( Trig_XHunter_Func005Func018C() ) then
            // 剪刀
            set udg_Gon_Stone_Damage = ( 250.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A08W', udg_JayUnit)) ) )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_JayCastedUnit, "HeroCloudCyd.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call UnitDamageTargetBJ( udg_JayUnit, udg_JayCastedUnit, udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call CreateTextTagUnitBJ( ( ( "剪刀 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), udg_JayUnit, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            if ( Trig_XHunter_Func005Func018Func022C() ) then
                call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_Gon_P1, udg_Gon_P2 )
                call ShowUnitHide( GetLastCreatedUnit() )
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A0NP', GetLastCreatedUnit() )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "acidbomb", udg_JayCastedUnit )
            else
            endif
        else
            // 布
            set udg_Gon_Stone_Damage = ( 225.00 + ( 75.00 * I2R(GetUnitAbilityLevelSwapped('A08X', udg_JayUnit)) ) )
            call AddSpecialEffectLocBJ( udg_Gon_P2, "Units\\NightElf\\Wisp\\WispExplode.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call ForGroupBJ( GetUnitsInRangeOfLocAll(270.00, udg_Gon_P2), function Trig_XHunter_Func005Func018Func005A )
            call CreateTextTagUnitBJ( ( ( "布 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            if ( Trig_XHunter_Func005Func018Func011C() ) then
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
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_JayUnit), 'hfoo'), function Trig_XHunter_Func009A )
endfunction

// --- InitTrig_XHunter (family, line 27304) ---
function InitTrig_XHunter takes nothing returns nothing
    set gg_trg_XHunter = CreateTrigger(  )
    call DisableTrigger( gg_trg_XHunter )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_XHunter, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_XHunter, Condition( function Trig_XHunter_Conditions ) )
    call TriggerAddAction( gg_trg_XHunter, function Trig_XHunter_Actions )
endfunction

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
